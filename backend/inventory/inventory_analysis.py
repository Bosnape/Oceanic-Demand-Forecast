from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from database.models import InventoryAnalysis, InventorySnapshot, Prediction


def run_inventory_analysis(company_id: int, db: Session) -> None:
    """Calcula y persiste el análisis de inventario para una empresa.

    Este método ejecuta el análisis central de inventario para la compañía
    dada, incluyendo el cálculo del punto de reorden (US-10).
    """

    today = date.today()
    forecast_end_date = today + timedelta(days=30)

    snapshots = (
        db.query(InventorySnapshot)
        .filter(InventorySnapshot.company_id == company_id)
        .order_by(InventorySnapshot.item_id)
        .all()
    )

    if not snapshots:
        return

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

    db.query(InventoryAnalysis).filter(
        InventoryAnalysis.company_id == company_id
    ).delete()

    records = []
    for snapshot in snapshots:
        avg_daily_forecast = avg_forecast_by_item.get(snapshot.item_id)

        if avg_daily_forecast is None:
            reorder_point = None
            safety_stock = None
            stock_status = "pending"
        else:
            reorder_point = avg_daily_forecast * snapshot.lead_time_days
            safety_stock = avg_daily_forecast * (snapshot.lead_time_days * 0.25)
            stock_status = "ok"

        analysis = InventoryAnalysis(
            company_id=company_id,
            inventory_snapshot_id=snapshot.id,
            item_id=snapshot.item_id,
            analysis_date=today,
            avg_daily_forecast=avg_daily_forecast,
            safety_stock=safety_stock,
            reorder_point=reorder_point,
            days_of_stock=None,
            stockout_flag=False,
            stockout_date=None,
            slow_moving_flag=False,
            immobilized_capital=None,
            units_needed_next_month=None,
            stock_status=stock_status,
        )
        records.append(analysis)

    db.bulk_save_objects(records)
    db.commit()
