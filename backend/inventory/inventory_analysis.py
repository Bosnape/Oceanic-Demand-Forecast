from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from database.models import InventoryAnalysis, InventorySnapshot, Prediction, SalesTransaction

# ---------------------------------------------------------------------------
# Thresholds # Se pueden ajustar segun contexto o analiis
# ---------------------------------------------------------------------------
SLOW_MOVING_DAYS = 365       # historical window for turnover calculation
SLOW_MOVING_THRESHOLD = 1.0  # turnover ratio below this flags a SKU as slow-moving


def run_inventory_analysis(company_id: int, db: Session) -> None:
    """Calcula y persiste el análisis de inventario para una empresa.
    """

    today = date.today()
    forecast_end_date = today + timedelta(days=30)
    sales_start_date  = today - timedelta(days=SLOW_MOVING_DAYS)

    # ------------------------------------------------------------------
    # 1. Snapshots de inventario
    # ------------------------------------------------------------------
    snapshots = (
        db.query(InventorySnapshot)
        .filter(InventorySnapshot.company_id == company_id)
        .order_by(InventorySnapshot.item_id)
        .all()
    )

    if not snapshots:
        return

    # ------------------------------------------------------------------
    # 2. Promedio de demanda diaria por SKU (próximos 30 días)
    # ------------------------------------------------------------------
    avg_forecast_by_item = {
        row.item_id: float(row.avg_daily_forecast)
        for row in (
            db.query(
                Prediction.item_id,
                func.avg(Prediction.predicted_demand).label("avg_daily_forecast"),
            )
            .filter(Prediction.company_id == company_id)
            .filter(Prediction.forecast_date >= today)
            .filter(Prediction.forecast_date <= forecast_end_date)
            .group_by(Prediction.item_id)
            .all()
        )
        if row.avg_daily_forecast is not None
    }

    # ------------------------------------------------------------------
    # 3. Total de unidades vendidas por SKU (últimos 365 días)
    # ------------------------------------------------------------------
    units_sold_by_item = {
        row.item_id: float(row.total_sold)
        for row in (
            db.query(
                SalesTransaction.item_id,
                func.sum(SalesTransaction.units_sold).label("total_sold"),
            )
            .filter(SalesTransaction.company_id == company_id)
            .filter(SalesTransaction.date >= sales_start_date)
            .group_by(SalesTransaction.item_id)
            .all()
        )
        if row.total_sold is not None
    }

    # ------------------------------------------------------------------
    # 4. Limpiar análisis previo
    # ------------------------------------------------------------------
    db.query(InventoryAnalysis).filter(
        InventoryAnalysis.company_id == company_id
    ).delete()

    # ------------------------------------------------------------------
    # 5. Calcular y construir registros por SKU
    # ------------------------------------------------------------------
    records = []
    for snapshot in snapshots:

        # --- US-10: punto de reorden ---
        avg_daily_forecast = avg_forecast_by_item.get(snapshot.item_id)
        if avg_daily_forecast is None:
            reorder_point = None
            safety_stock  = None
        else:
            reorder_point = avg_daily_forecast * snapshot.lead_time_days
            safety_stock  = avg_daily_forecast * (snapshot.lead_time_days * 0.25)

        # --- US-08: slow-moving ---
        total_units_sold = units_sold_by_item.get(snapshot.item_id)

        if total_units_sold is None or snapshot.inventory_on_hand == 0:
            # Sin datos de ventas — no se puede determinar aún
            slow_moving_flag    = None
            immobilized_capital = None
            days_of_stock       = None
        else:
            turnover_ratio   = total_units_sold / snapshot.inventory_on_hand
            slow_moving_flag = turnover_ratio < SLOW_MOVING_THRESHOLD

            # Capital inmovilizado solo aplica a SKUs lentos
            immobilized_capital = (
                float(snapshot.inventory_on_hand) * float(snapshot.unit_cost)
                if slow_moving_flag else None
            )

            # Días de stock restantes al ritmo de ventas actual
            avg_daily_sales = total_units_sold / SLOW_MOVING_DAYS
            days_of_stock = (
                round(snapshot.inventory_on_hand / avg_daily_sales, 1)
                if avg_daily_sales > 0 else None
            )

        # --- stock_status consolidado ---
        if total_units_sold is None and avg_daily_forecast is None:
            stock_status = "pending"
        elif slow_moving_flag:
            stock_status = "low"
        else:
            stock_status = "ok"

        records.append(InventoryAnalysis(
            company_id=company_id,
            inventory_snapshot_id=snapshot.id,
            item_id=snapshot.item_id,
            analysis_date=today,
            avg_daily_forecast=avg_daily_forecast,
            safety_stock=safety_stock,
            reorder_point=reorder_point,
            days_of_stock=days_of_stock,
            stockout_flag=False,
            stockout_date=None,
            slow_moving_flag=slow_moving_flag,
            immobilized_capital=immobilized_capital,
            units_needed_next_month=(
                round(avg_daily_forecast * 30, 2) if avg_daily_forecast is not None else None
            ),
            stock_status=stock_status,
        ))

    db.bulk_save_objects(records)
    db.commit()
