import json
import logging
import pandas as pd
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from sqlalchemy.orm import Session

from api.validation import validate_sales_dataframe, validate_inventory_dataframe
from demand_forecast.prophet_demand_forecast import run_pipeline

from database.database import get_db, SessionLocal, init_db
from database.models import (
    Company, DataSource, SalesTransaction, Prediction,
    InventorySnapshot, InventoryAnalysis, ModelMetrics,
    UploadLog, ModelExecutionLog,                          # US-20
)
from inventory.inventory_analysis import run_inventory_analysis


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before the API begins serving requests."""
    init_db()
    yield


app = FastAPI(title="Oceanic Demand Forecast API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://52.205.157.189:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# Health Check
# =============================================================================

@app.get("/")
async def health_check():
    return {"message": "Oceanic Demand Forecast API is running"}

# =============================================================================
# Background task
# =============================================================================

def run_prophet_background(company_id: int, data_source_id: int):
    """
    Runs Prophet pipeline in background and updates DataSource status.
    Always trains on the full historical data stored in sales_transaction,
    so successive uploads accumulate — not overwrite — the training set.
    """
    db = SessionLocal()
    try:
        data_source = db.query(DataSource).filter(DataSource.id == data_source_id).first()
        data_source.status = "processing"
        db.commit()

        # Load full historical data from DB (includes all previous uploads via upsert)
        rows = (
            db.query(SalesTransaction)
            .filter(SalesTransaction.company_id == company_id)
            .all()
        )
        if not rows:
            data_source.status = "failed"
            db.commit()
            logger.error("Prophet pipeline: no sales data found for company_id=%d", company_id)
            return

        full_df = pd.DataFrame([{
            "item_id": r.item_id,
            "store_id": r.store_id,
            "cat_id": r.cat_id,
            "dept_id": r.dept_id,
            "date": pd.Timestamp(r.date),
            "units_sold": r.units_sold,
            "sell_price": float(r.sell_price) if r.sell_price is not None else None,
            "holiday_promotion": r.holiday_promotion,
            "event_name_1": r.event_name_1,
        } for r in rows])

        run_pipeline(full_df, company_id=company_id)

        data_source.status = "ready"
        db.commit()

        # Re-run inventory analysis so reorder point and slow-moving reflect the freshly generated predictions
        run_inventory_analysis(company_id, db)

    except Exception as e:
        data_source = db.query(DataSource).filter(DataSource.id == data_source_id).first()
        data_source.status = "failed"
        db.commit()
        logger.exception("Prophet pipeline failed for company_id=%d", company_id)
    finally:
        db.close()

# =============================================================================
# POST /upload-sales
# =============================================================================

@app.post(
    "/upload-sales",
    tags=["Ingestion"],
    summary="Upload sales CSV or Excel file",
    description="Accepts a .csv or .xlsx file, validates it, stores it in sales_transaction table, and triggers the demand forecast pipeline in the background.",
)
async def upload_sales(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Sales file: .csv, .xlsx or .xls"),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    try:
        # Ensure company exists
        company = db.query(Company).order_by(Company.id.asc()).first()
        if not company:
            company = Company(name="Oceanic Demo Company")
            db.add(company)
            db.commit()
            db.refresh(company)

        company_id = company.id

        # Step 1: Parse file into DataFrame
        dataframe = parse_uploaded_file(file)

        # Step 2: Validate and clean
        result = validate_sales_dataframe(dataframe)
        dataframe = result.cleaned

        # Step 3: Save DataSource record with status "uploaded"
        data_source = DataSource(
            company_id=company_id,
            filename=file.filename,
            status="uploaded",
        )
        db.add(data_source)
        db.commit()
        db.refresh(data_source)

        # Step 4: Upsert rows into sales_transaction table
        records = [
            {
                "company_id": company_id,
                "item_id": str(row["item_id"]).strip(),
                "store_id": str(row["store_id"]).strip() if pd.notna(row.get("store_id")) else None,
                "cat_id": str(row["cat_id"]).strip() if pd.notna(row.get("cat_id")) else None,
                "dept_id": str(row["dept_id"]).strip() if pd.notna(row.get("dept_id")) else None,
                "date": row["date"].date(),
                "units_sold": int(row["units_sold"]),
                "sell_price": float(row["sell_price"]) if pd.notna(row.get("sell_price")) else None,
                "holiday_promotion": int(row["holiday_promotion"]) if pd.notna(row.get("holiday_promotion")) else None,
                "event_name_1": str(row["event_name_1"]).strip() if pd.notna(row.get("event_name_1")) else None,
            }
            for _, row in dataframe.iterrows()
        ]

        upsert_sql = text("""
            INSERT INTO sales_transaction
                (company_id, item_id, store_id, cat_id, dept_id, date,
                 units_sold, sell_price, holiday_promotion, event_name_1)
            VALUES
                (:company_id, :item_id, :store_id, :cat_id, :dept_id, :date,
                 :units_sold, :sell_price, :holiday_promotion, :event_name_1)
            ON CONFLICT (company_id, item_id, COALESCE(store_id, ''), date)
            DO UPDATE SET
                units_sold = EXCLUDED.units_sold,
                sell_price = EXCLUDED.sell_price,
                cat_id = EXCLUDED.cat_id,
                dept_id = EXCLUDED.dept_id,
                holiday_promotion = EXCLUDED.holiday_promotion,
                event_name_1 = EXCLUDED.event_name_1
        """)
        db.execute(upsert_sql, records)
        db.commit()
        transactions = records

        # US-20 — Registrar carga exitosa
        upload_log = UploadLog(
            filename=file.filename,
            file_type="sales",
            status="success",
            records_processed=len(transactions),
        )
        db.add(upload_log)
        db.commit()

        # Step 5: Trigger Prophet pipeline in background
        background_tasks.add_task(
            run_prophet_background,
            company_id=company_id,
            data_source_id=data_source.id,
        )

    except ValueError as error:
        # US-20 — Registrar carga fallida
        _log_failed_upload(db, file.filename, "sales", str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        # US-20 — Registrar carga fallida
        _log_failed_upload(db, file.filename, "sales", str(error))
        raise HTTPException(status_code=500, detail=f"Error processing dataset: {error}") from error

    return {
        "filename": file.filename,
        "rows_saved": len(transactions),
        "company_id": company_id,
        "data_source_id": data_source.id,
        "status": "processing",
        "message": "File uploaded successfully. Demand forecast is being generated in the background.",
        "columns": [str(col) for col in dataframe.columns],
        "preview": json.loads(dataframe.head(5).to_json(orient="records", date_format="iso")),
        "validation": {
            "warnings": result.warnings,
            "issues_preview": result.issues[:20],
            "issues_count": len(result.issues),
        },
    }

# =============================================================================
# POST /upload-inventory
# =============================================================================

@app.post(
    "/upload-inventory",
    tags=["Ingestion"],
    summary="Upload inventory snapshot CSV or Excel file",
    description="Accepts a .csv or .xlsx file with current inventory levels per SKU and stores it in the database.",
)
async def upload_inventory(
    file: UploadFile = File(..., description="Inventory file: .csv, .xlsx or .xls"),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    try:
        # Ensure company exists
        company = db.query(Company).order_by(Company.id.asc()).first()
        if not company:
            company = Company(name="Oceanic Demo Company")
            db.add(company)
            db.commit()
            db.refresh(company)

        company_id = company.id

        # Step 1: Parse file
        dataframe = parse_uploaded_file(file)

        # Step 2: Validate and clean
        result = validate_inventory_dataframe(dataframe)
        dataframe = result.cleaned

        # Step 3: Upsert rows into inventory_snapshot table
        inv_records = [
            {
                "company_id": company_id,
                "date": row["date"].date(),
                "item_id": str(row["item_id"]).strip(),
                "store_id": str(row["store_id"]).strip() if pd.notna(row.get("store_id")) else None,
                "inventory_on_hand": int(row["inventory_on_hand"]),
                "inventory_available": int(row["inventory_available"]) if pd.notna(row["inventory_available"]) else None,
                "lead_time_days": int(row["lead_time_days"]),
                "unit_cost": float(row["unit_cost"]),
                "reorder_quantity": int(row["reorder_quantity"]) if pd.notna(row.get("reorder_quantity")) else None,
            }
            for _, row in dataframe.iterrows()
        ]

        inv_upsert_sql = text("""
            INSERT INTO inventory_snapshot
                (company_id, item_id, store_id, date,
                 inventory_on_hand, inventory_available, lead_time_days,
                 unit_cost, reorder_quantity)
            VALUES
                (:company_id, :item_id, :store_id, :date,
                 :inventory_on_hand, :inventory_available, :lead_time_days,
                 :unit_cost, :reorder_quantity)
            ON CONFLICT (company_id, item_id, COALESCE(store_id, ''), date)
            DO UPDATE SET
                inventory_on_hand = EXCLUDED.inventory_on_hand,
                inventory_available = EXCLUDED.inventory_available,
                lead_time_days = EXCLUDED.lead_time_days,
                unit_cost = EXCLUDED.unit_cost,
                reorder_quantity = EXCLUDED.reorder_quantity
        """)
        db.execute(inv_upsert_sql, inv_records)
        db.commit()
        snapshots = inv_records

        # US-20 — Registrar carga exitosa
        upload_log = UploadLog(
            filename=file.filename,
            file_type="inventory",
            status="success",
            records_processed=len(snapshots),
        )
        db.add(upload_log)
        db.commit()

        # Run inventory analysis immediately with whatever sales/predictions are already in the DB
        run_inventory_analysis(company_id, db)

    except ValueError as error:
        # US-20 — Registrar carga fallida
        _log_failed_upload(db, file.filename, "inventory", str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        # US-20 — Registrar carga fallida
        _log_failed_upload(db, file.filename, "inventory", str(error))
        raise HTTPException(status_code=500, detail=f"Error processing inventory file: {error}") from error

    return {
        "filename": file.filename,
        "rows_saved": len(snapshots),
        "company_id": company_id,
        "skus": dataframe["item_id"].tolist(),
        "preview": json.loads(dataframe.head(5).to_json(orient="records", date_format="iso")),
        "validation": {
            "warnings": result.warnings,
            "issues_preview": result.issues[:20],
            "issues_count": len(result.issues),
        },
    }

# =============================================================================
# GET /api/logs/uploads  (US-20)
# =============================================================================

@app.get(
    "/api/logs/uploads",
    tags=["Audit Logs"],
    summary="Get data upload history",
    description="Returns all recorded data upload events (sales and inventory), ordered by most recent first.",
)
async def get_upload_logs(db: Session = Depends(get_db)):
    try:
        logs = (
            db.query(UploadLog)
            .order_by(UploadLog.upload_date.desc())
            .limit(200)
            .all()
        )
        return [
            {
                "id": log.id,
                "filename": log.filename,
                "file_type": log.file_type,
                "upload_date": log.upload_date.isoformat(),
                "status": log.status,
                "records_processed": log.records_processed,
                "error_message": log.error_message,
            }
            for log in logs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching upload logs: {e}")


# =============================================================================
# GET /api/logs/model-executions  (US-20)
# =============================================================================

@app.get(
    "/api/logs/model-executions",
    tags=["Audit Logs"],
    summary="Get ML model execution history",
    description="Returns all recorded Prophet pipeline executions with accuracy metrics, ordered by most recent first.",
)
async def get_model_execution_logs(db: Session = Depends(get_db)):
    try:
        logs = (
            db.query(ModelExecutionLog)
            .order_by(ModelExecutionLog.execution_date.desc())
            .limit(200)
            .all()
        )
        return [
            {
                "id": log.id,
                "execution_date": log.execution_date.isoformat(),
                "status": log.status,
                "skus_trained": log.skus_trained,
                "avg_mae": float(log.avg_mae) if log.avg_mae is not None else None,
                "avg_rmse": float(log.avg_rmse) if log.avg_rmse is not None else None,
                "avg_mape": float(log.avg_mape) if log.avg_mape is not None else None,
                "avg_coverage_ic": float(log.avg_coverage_ic) if log.avg_coverage_ic is not None else None,
                "duration_seconds": float(log.duration_seconds) if log.duration_seconds is not None else None,
                "error_message": log.error_message,
            }
            for log in logs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching model execution logs: {e}")


# =============================================================================
# GET /api/predictions/status
# =============================================================================

@app.get(
    "/api/predictions/status",
    tags=["Predictions"],
    summary="Get current forecast generation status",
    description="Returns the status of the latest demand forecast pipeline run. Frontend polls this endpoint to know when predictions are ready.",
)
async def get_predictions_status(db: Session = Depends(get_db)):
    """Return pipeline status and the timestamp of the last completed forecast run."""
    try:
        data_source = (
            db.query(DataSource)
            .order_by(DataSource.upload_date.desc())
            .first()
        )

        if not data_source:
            return {"status": "no_data", "message": "No files uploaded yet.", "last_run_at": None}

        messages = {
            "uploaded":   "File received. Forecast pipeline starting...",
            "processing": "Forecast is being generated. This may take a few minutes.",
            "ready":      "Predictions are ready.",
            "failed":     "Forecast generation failed. Please try uploading again.",
        }

        last_prediction = (
            db.query(Prediction.created_at)
            .filter(Prediction.company_id == data_source.company_id)
            .order_by(Prediction.created_at.desc())
            .first()
        )
        last_run_at = last_prediction.created_at.isoformat() if last_prediction else None

        return {
            "status": data_source.status,
            "message": messages.get(data_source.status, "Unknown status."),
            "filename": data_source.filename,
            "upload_date": data_source.upload_date.isoformat(),
            "last_run_at": last_run_at,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching status: {e}")

# =============================================================================
# GET /api/predictions
# =============================================================================

@app.get(
    "/api/predictions",
    tags=["Predictions"],
    summary="Get demand forecasts by SKU and date range",
    description="Returns Prophet forecast results. Optionally filter by item_id and/or date range.",
)
async def get_predictions(
    item_id: str = None,
    date_from: str = None,
    date_to: str = None,
    db: Session = Depends(get_db),
):
    try:
        # Check forecast status before returning predictions
        data_source = (
            db.query(DataSource)
            .order_by(DataSource.upload_date.desc())
            .first()
        )

        if not data_source:
            raise HTTPException(status_code=404, detail="No data uploaded yet.")

        if data_source.status == "processing":
            raise HTTPException(status_code=202, detail="Predictions are still being generated. Please try again shortly.")

        if data_source.status == "failed":
            raise HTTPException(status_code=503, detail="Forecast generation failed. Please upload the file again.")

        if data_source.status != "ready":
            raise HTTPException(status_code=400, detail=f"Unexpected status: {data_source.status}")
        
        # Fetch predictions
        query = db.query(Prediction)

        if item_id:
            query = query.filter(Prediction.item_id == item_id)
        if date_from:
            query = query.filter(Prediction.forecast_date >= date_from)
        if date_to:
            query = query.filter(Prediction.forecast_date <= date_to)

        predictions = query.order_by(Prediction.item_id, Prediction.forecast_date).all()

        if not predictions:
            return []

        return [
            {
                "item_id": p.item_id,
                "date": p.forecast_date.isoformat(),
                "yhat": float(p.predicted_demand),
                "yhat_lower": float(p.yhat_lower),
                "yhat_upper": float(p.yhat_upper),
            }
            for p in predictions
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching predictions: {e}")

# =============================================================================
# GET /api/predictions/metrics
# =============================================================================

@app.get(
    "/api/predictions/metrics",
    tags=["Predictions"],
    summary="Get Prophet model accuracy metrics",
    description="Returns aggregate and per-SKU accuracy metrics (MAE, RMSE, MAPE, CI coverage, bias) from the last Prophet training run.",
)
async def get_model_metrics(db: Session = Depends(get_db)):
    try:
        data_source = (
            db.query(DataSource)
            .order_by(DataSource.upload_date.desc())
            .first()
        )
        if not data_source:
            raise HTTPException(status_code=404, detail="No data uploaded yet.")
        if data_source.status != "ready":
            raise HTTPException(status_code=404, detail="Metrics not available yet — pipeline has not completed.")

        company_id = data_source.company_id

        aggregate = (
            db.query(ModelMetrics)
            .filter(ModelMetrics.company_id == company_id, ModelMetrics.item_id.is_(None))
            .order_by(ModelMetrics.created_at.desc())
            .first()
        )
        per_sku = (
            db.query(ModelMetrics)
            .filter(ModelMetrics.company_id == company_id, ModelMetrics.item_id.isnot(None))
            .order_by(ModelMetrics.mape.asc())
            .all()
        )

        if not aggregate and not per_sku:
            raise HTTPException(status_code=404, detail="No metrics computed yet. Re-upload the sales file to trigger training.")

        def _fmt(m):
            return {
                "item_id": m.item_id,
                "mae":          float(m.mae)          if m.mae          is not None else None,
                "rmse":         float(m.rmse)         if m.rmse         is not None else None,
                "mape":         float(m.mape)         if m.mape         is not None else None,
                "coverage_ic":  float(m.coverage_ic)  if m.coverage_ic  is not None else None,
                "bias":         float(m.bias)         if m.bias         is not None else None,
                "training_samples":   m.training_samples,
                "validation_samples": m.validation_samples,
                "seasonality_mode":   m.seasonality_mode,
                "last_updated": m.created_at.isoformat() if m.created_at else None,
            }

        return {
            "aggregate": _fmt(aggregate) if aggregate else None,
            "per_sku":   [_fmt(m) for m in per_sku],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching metrics: {e}")


# =============================================================================
# GET /api/sales/range
# =============================================================================

@app.get(
    "/api/sales/range",
    tags=["Sales"],
    summary="Get the min and max date available in sales data",
)
async def get_sales_range(db: Session = Depends(get_db)):
    from sqlalchemy import func
    result = db.query(
        func.min(SalesTransaction.date).label("min_date"),
        func.max(SalesTransaction.date).label("max_date"),
    ).first()
    if not result or result.min_date is None:
        raise HTTPException(status_code=404, detail="No sales data available")
    return {
        "min_date": result.min_date.isoformat(),
        "max_date": result.max_date.isoformat(),
    }

# =============================================================================
# GET /api/sales
# =============================================================================

@app.get(
    "/api/sales",
    tags=["Sales"],
    summary="Get historical sales data by SKU, category, department and date range",
    description="Returns sales transactions from the database. Optionally filter by item_id, store_id, cat_id, dept_id and/or date range.",
)
async def get_sales(
    item_id: str = None,
    store_id: str = None,
    cat_id: str = None,
    dept_id: str = None,
    date_from: str = None,
    date_to: str = None,
    db: Session = Depends(get_db),
):
    try:
        query = db.query(SalesTransaction)

        if item_id:
            query = query.filter(SalesTransaction.item_id == item_id)
        if store_id:
            query = query.filter(SalesTransaction.store_id == store_id)
        if cat_id:
            query = query.filter(SalesTransaction.cat_id == cat_id)
        if dept_id:
            query = query.filter(SalesTransaction.dept_id == dept_id)
        if date_from:
            query = query.filter(SalesTransaction.date >= date_from)
        if date_to:
            query = query.filter(SalesTransaction.date <= date_to)

        sales = query.order_by(SalesTransaction.item_id, SalesTransaction.date).all()

        if not sales:
            return []

        return [
            {
                "item_id": s.item_id,
                "store_id": s.store_id,
                "cat_id": s.cat_id,
                "dept_id": s.dept_id,
                "date": s.date.isoformat(),
                "units_sold": s.units_sold,
                "sell_price": float(s.sell_price) if s.sell_price is not None else None,
            }
            for s in sales
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sales: {e}")

# =============================================================================
# GET /api/inventory
# =============================================================================

@app.get(
    "/api/inventory",
    tags=["Inventory"],
    summary="Get current inventory by SKU",
    description="Returns current stock levels per SKU joined with pre-computed analysis (reorder point, slow-moving, immobilized capital).",
)
async def get_inventory(db: Session = Depends(get_db)):
    try:
        from sqlalchemy.orm import aliased

        snapshots = (
            db.query(InventorySnapshot)
            .order_by(InventorySnapshot.item_id)
            .all()
        )

        if not snapshots:
            raise HTTPException(status_code=404, detail="No inventory data found. Please upload an inventory file first.")

        # Build analysis lookup: inventory_snapshot_id → InventoryAnalysis row
        snapshot_ids = [s.id for s in snapshots]
        analyses = (
            db.query(InventoryAnalysis)
            .filter(InventoryAnalysis.inventory_snapshot_id.in_(snapshot_ids))
            .all()
        )
        analysis_by_snapshot: dict[int, InventoryAnalysis] = {
            a.inventory_snapshot_id: a for a in analyses
        }

        return {
            "items": [
                {
                    "item_id": s.item_id,
                    "store_id": s.store_id,
                    "current_stock": s.inventory_on_hand,
                    "available_stock": (
                        s.inventory_available if s.inventory_available is not None
                        else s.inventory_on_hand
                    ),
                    "lead_time_days": s.lead_time_days,
                    "unit_cost": float(s.unit_cost),
                    "next_month_forecast": (
                        float(analysis_by_snapshot[s.id].units_needed_next_month)
                        if s.id in analysis_by_snapshot
                        and analysis_by_snapshot[s.id].units_needed_next_month is not None
                        else 0.0
                    ),
                    "stock_status": (
                        analysis_by_snapshot[s.id].stock_status
                        if s.id in analysis_by_snapshot else "pending"
                    ),
                    "last_updated": s.date.isoformat(),
                    "reorder_point": (
                        float(analysis_by_snapshot[s.id].reorder_point)
                        if s.id in analysis_by_snapshot
                        and analysis_by_snapshot[s.id].reorder_point is not None
                        else None
                    ),
                    "slow_moving_flag": (
                        analysis_by_snapshot[s.id].slow_moving_flag
                        if s.id in analysis_by_snapshot else None
                    ),
                    "immobilized_capital": (
                        float(analysis_by_snapshot[s.id].immobilized_capital)
                        if s.id in analysis_by_snapshot
                        and analysis_by_snapshot[s.id].immobilized_capital is not None
                        else None
                    ),
                    "days_of_stock": (
                        float(analysis_by_snapshot[s.id].days_of_stock)
                        if s.id in analysis_by_snapshot
                        and analysis_by_snapshot[s.id].days_of_stock is not None
                        else None
                    ),
                }
                for s in snapshots
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching inventory: {e}")


# =============================================================================
# GET /api/inventory/alerts
# =============================================================================

@app.get(
    "/api/inventory/alerts",
    tags=["Inventory"],
    summary="Get stockout risk alerts per SKU",
    description=(
        "Identifies SKUs at risk of stockout. "
        "Uses demand forecast (Prophet) when available; falls back to historical sales rate otherwise. "
        "Response includes alert_mode so the frontend can communicate the data source to the user."
    ),
)
async def get_inventory_alerts(db: Session = Depends(get_db)):
    try:
        from sqlalchemy import func as sqlfunc
        from datetime import timedelta
        import math

        company = db.query(Company).order_by(Company.id.asc()).first()
        if not company:
            return {"alerts": [], "alert_mode": "no_data", "message": "No hay datos disponibles."}

        # ------------------------------------------------------------------
        # Latest inventory snapshot per SKU
        # ------------------------------------------------------------------
        latest_dates = (
            db.query(
                InventorySnapshot.item_id,
                sqlfunc.max(InventorySnapshot.date).label("max_date"),
            )
            .filter(InventorySnapshot.company_id == company.id)
            .group_by(InventorySnapshot.item_id)
            .subquery()
        )

        snapshots = (
            db.query(InventorySnapshot)
            .join(
                latest_dates,
                (InventorySnapshot.item_id == latest_dates.c.item_id)
                & (InventorySnapshot.date == latest_dates.c.max_date),
            )
            .all()
        )

        if not snapshots:
            return {"alerts": [], "alert_mode": "no_data", "message": "No hay datos de inventario."}

        # ------------------------------------------------------------------
        # Determine alert mode: forecast or historical fallback
        # ------------------------------------------------------------------
        min_forecast_date = (
            db.query(sqlfunc.min(Prediction.forecast_date))
            .filter(Prediction.company_id == company.id)
            .scalar()
        )

        alert_mode = "forecast" if min_forecast_date else "historical"

        # ------------------------------------------------------------------
        # Build avg_daily_demand per SKU depending on mode
        # ------------------------------------------------------------------
        avg_demand_by_sku: dict[str, float] = {}
        reference_date = None  # used to project stockout_date

        if alert_mode == "forecast":
            forecast_start = min_forecast_date
            forecast_end   = min_forecast_date + timedelta(days=90)
            reference_date = forecast_start

            predictions = (
                db.query(Prediction)
                .filter(
                    Prediction.company_id == company.id,
                    Prediction.forecast_date >= forecast_start,
                    Prediction.forecast_date <= forecast_end,
                )
                .all()
            )

            demand_lists: dict[str, list[float]] = {}
            for p in predictions:
                demand_lists.setdefault(p.item_id, []).append(float(p.predicted_demand))

            avg_demand_by_sku = {
                item_id: sum(vals) / len(vals)
                for item_id, vals in demand_lists.items()
                if vals
            }

        else:
            # Historical fallback: reuse days_of_stock already stored in inventory_analysis.
            snapshot_ids = [s.id for s in snapshots]
            analyses = (
                db.query(InventoryAnalysis)
                .filter(InventoryAnalysis.inventory_snapshot_id.in_(snapshot_ids))
                .all()
            )
            analysis_by_snapshot = {a.inventory_snapshot_id: a for a in analyses}

            max_sale_date = (
                db.query(sqlfunc.max(SalesTransaction.date))
                .filter(SalesTransaction.company_id == company.id)
                .scalar()
            )
            reference_date = max_sale_date

            for snap in snapshots:
                analysis = analysis_by_snapshot.get(snap.id)
                if analysis and analysis.days_of_stock and analysis.days_of_stock > 0:
                    available = snap.inventory_available if snap.inventory_available is not None else snap.inventory_on_hand
                    avg_demand_by_sku[snap.item_id] = available / float(analysis.days_of_stock)

        # ------------------------------------------------------------------
        # Build alerts
        # ------------------------------------------------------------------
        alerts = []
        for snap in snapshots:
            avg_daily_demand = avg_demand_by_sku.get(snap.item_id)
            if not avg_daily_demand or avg_daily_demand <= 0:
                continue

            available = snap.inventory_available if snap.inventory_available is not None else snap.inventory_on_hand
            lead_time = snap.lead_time_days

            days_of_stock          = available / avg_daily_demand
            demand_during_lead_time = avg_daily_demand * lead_time

            if available <= demand_during_lead_time:
                stock_status = "critical"
            elif available <= demand_during_lead_time * 1.5:
                stock_status = "low"
            else:
                continue  # ok — skip

            # Units to order: cover lead-time demand + 25% safety buffer, minus current stock
            units_to_order = max(
                math.ceil(demand_during_lead_time * 1.25 - available),
                snap.reorder_quantity or 0,
            )

            stockout_date = (
                (reference_date + timedelta(days=int(days_of_stock))).isoformat()
                if reference_date else None
            )

            alerts.append({
                "item_id": snap.item_id,
                "store_id": snap.store_id,
                "current_stock": available,
                "lead_time_days": lead_time,
                "avg_daily_demand": round(avg_daily_demand, 2),
                "demand_during_lead_time": round(demand_during_lead_time, 2),
                "days_of_stock": round(days_of_stock, 1),
                "stockout_date": stockout_date,
                "stock_status": stock_status,
                "units_to_order": units_to_order,
            })

        alerts.sort(key=lambda x: (0 if x["stock_status"] == "critical" else 1, x["days_of_stock"]))

        mode_message = (
            "Alertas basadas en demanda proyectada por el modelo de pronóstico (Prophet)."
            if alert_mode == "forecast"
            else "No hay pronóstico disponible. Alertas estimadas a partir de ventas históricas."
        )

        return {
            "alerts": alerts,
            "alert_mode": alert_mode,
            "message": mode_message,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating stockout alerts: {e}")


# =============================================================================
# GET /api/demand-alerts
# =============================================================================

DEMAND_WARNING_THRESHOLD  = 0.25  # 25 % — desviación moderada (atención)
DEMAND_CRITICAL_THRESHOLD = 0.40  # 40 % — desviación significativa (crítico)


@app.get(
    "/api/demand-alerts",
    tags=["Predictions"],
    summary="Get demand deviation alerts per SKU",
    description=(
        "Compares the average predicted demand for the next 30 days against the average "
        "historical sales for the last 30 days per SKU. "
        f"Returns SKUs with deviation ≥{int(DEMAND_WARNING_THRESHOLD * 100)}% (warning) "
        f"or ≥{int(DEMAND_CRITICAL_THRESHOLD * 100)}% (critical). "
        "Direction is 'surge' when forecast > historical, 'drop' otherwise."
    ),
)
async def get_demand_alerts(db: Session = Depends(get_db)):
    """Return SKUs with significant demand deviation (forecast vs recent historical)."""
    try:
        from sqlalchemy import func as sqlfunc
        from datetime import timedelta

        company = db.query(Company).order_by(Company.id.asc()).first()
        if not company:
            return {"alerts": [], "message": "No hay datos disponibles."}

        today = db.query(sqlfunc.max(SalesTransaction.date)).filter(
            SalesTransaction.company_id == company.id
        ).scalar()

        if not today:
            return {"alerts": [], "message": "No hay ventas históricas registradas."}

        historical_start = today - timedelta(days=30)

        # ------------------------------------------------------------------
        # Average daily historical sales per SKU (last 30 days)
        # ------------------------------------------------------------------
        historical_rows = (
            db.query(
                SalesTransaction.item_id,
                sqlfunc.avg(SalesTransaction.units_sold).label("avg_daily"),
            )
            .filter(
                SalesTransaction.company_id == company.id,
                SalesTransaction.date >= historical_start,
                SalesTransaction.date <= today,
            )
            .group_by(SalesTransaction.item_id)
            .all()
        )

        if not historical_rows:
            return {"alerts": [], "message": "No hay ventas en los últimos 30 días."}

        historical_avg: dict[str, float] = {
            row.item_id: float(row.avg_daily) for row in historical_rows
        }

        # ------------------------------------------------------------------
        # Average daily forecast per SKU (next 30 days from earliest forecast date)
        # ------------------------------------------------------------------
        forecast_start = db.query(sqlfunc.min(Prediction.forecast_date)).filter(
            Prediction.company_id == company.id
        ).scalar()

        if not forecast_start:
            return {"alerts": [], "message": "No hay pronóstico disponible. Sube datos de ventas primero."}

        forecast_end = forecast_start + timedelta(days=30)

        forecast_rows = (
            db.query(
                Prediction.item_id,
                sqlfunc.avg(Prediction.predicted_demand).label("avg_daily"),
            )
            .filter(
                Prediction.company_id == company.id,
                Prediction.forecast_date >= forecast_start,
                Prediction.forecast_date <= forecast_end,
            )
            .group_by(Prediction.item_id)
            .all()
        )

        forecast_avg: dict[str, float] = {
            row.item_id: float(row.avg_daily) for row in forecast_rows
        }

        # ------------------------------------------------------------------
        # Build alerts — only SKUs that exceed the warning threshold
        # ------------------------------------------------------------------
        alerts = []
        for item_id, hist_avg in historical_avg.items():
            if hist_avg <= 0 or item_id not in forecast_avg:
                continue

            fore_avg = forecast_avg[item_id]
            deviation = (fore_avg - hist_avg) / hist_avg
            abs_deviation = abs(deviation)

            if abs_deviation < DEMAND_WARNING_THRESHOLD:
                continue

            severity = "critical" if abs_deviation >= DEMAND_CRITICAL_THRESHOLD else "warning"

            alerts.append({
                "item_id": item_id,
                "historical_avg": round(hist_avg, 2),
                "forecast_avg": round(fore_avg, 2),
                "deviation_pct": round(deviation * 100, 1),
                "direction": "surge" if deviation > 0 else "drop",
                "severity": severity,
            })

        alerts.sort(key=lambda x: abs(x["deviation_pct"]), reverse=True)

        return {
            "alerts": alerts,
            "message": (
                "Comparando pronóstico (próximos 30 días) vs ventas históricas (últimos 30 días). "
                f"Atención ≥{int(DEMAND_WARNING_THRESHOLD * 100)}% · "
                f"Crítico ≥{int(DEMAND_CRITICAL_THRESHOLD * 100)}%."
            ),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating demand alerts: {e}")


# =============================================================================
# Helpers
# =============================================================================

def parse_uploaded_file(file: UploadFile) -> pd.DataFrame:
    filename = file.filename.lower()
    try:
        if filename.endswith(".csv"):
            return pd.read_csv(file.file)
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            return pd.read_excel(file.file)
        else:
            raise ValueError("Unsupported format. Use CSV or Excel (.xlsx, .xls)")
    except Exception as error:
        raise ValueError(f"Could not process file: {error}") from error


def _log_failed_upload(db: Session, filename: str, file_type: str, error_message: str):
    """US-20 — Helper para registrar una carga fallida sin hacer raise."""
    try:
        upload_log = UploadLog(
            filename=filename,
            file_type=file_type,
            status="failed",
            error_message=error_message,
        )
        db.add(upload_log)
        db.commit()
    except Exception:
        # No interrumpir el flujo principal si el log mismo falla
        db.rollback()
