import json
import logging
import pandas as pd

logger = logging.getLogger(__name__)

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from sqlalchemy.orm import Session

from api.validation import validate_sales_dataframe, validate_inventory_dataframe
from demand_forecast.prophet_demand_forecast import run_pipeline

from database.database import get_db, SessionLocal
from database.models import Company, DataSource, SalesTransaction, Prediction, InventorySnapshot

app = FastAPI(title="Oceanic Demand Forecast API")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

        # Step 5: Trigger Prophet pipeline in background
        background_tasks.add_task(
            run_prophet_background,
            company_id=company_id,
            data_source_id=data_source.id,
        )

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
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

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
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
    description="Returns current stock levels per SKU from the latest inventory snapshot.",
)
async def get_inventory(db: Session = Depends(get_db)):
    try:

        snapshots = (
            db.query(InventorySnapshot)
            .order_by(InventorySnapshot.item_id)
            .all()
        )

        if not snapshots:
            raise HTTPException(status_code=404, detail="No inventory data found. Please upload an inventory file first.")

        return {
            "items": [
                {
                    "item_id": s.item_id,
                    "store_id": s.store_id,
                    "current_stock": s.inventory_on_hand,
                    "available_stock": s.inventory_available if s.inventory_available is not None else s.inventory_on_hand,
                    "lead_time_days": s.lead_time_days,
                    "unit_cost": float(s.unit_cost),
                    "next_month_forecast": 0,    # Sprint 2
                    "stock_status": "TBD",       # Sprint 2
                    "last_updated": s.date.isoformat(),
                }
                for s in snapshots
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching inventory: {e}")

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