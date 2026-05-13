from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from database.models import InventoryAnalysis, InventorySnapshot, Prediction, SalesTransaction

# ---------------------------------------------------------------------------
# Thresholds - Se pueden ajustar segun contexto o analisis
# ---------------------------------------------------------------------------
SLOW_MOVING_DAYS = 365          # historical window for sales rate calculation (avoids seasonal bias)
SLOW_MOVING_DOH_THRESHOLD = 90  # days of stock above this → slow moving (cross-industry standard)
DEAD_STOCK_DOH_THRESHOLD  = 180 # days of stock above this → dead stock / obsolete


def run_inventory_analysis(company_id: int, db: Session) -> None:
    """Calcula y persiste el analisis de inventario para una empresa.
    Cubre:
    - US-10 (Valentina): punto de reorden por SKU basado en forecast y lead time.
    - US-08 (Martin): deteccion de inventario de movimiento lento y capital inmovilizado.
    """

    today = date.today()

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
    # Anclar fechas a los propios datos.
    # Los CSVs de referencia son historicos (ej. 2016), por lo que usar
    # ------------------------------------------------------------------
    max_sale_date = db.query(func.max(SalesTransaction.date)).filter(
        SalesTransaction.company_id == company_id
    ).scalar()

    min_forecast_date = db.query(func.min(Prediction.forecast_date)).filter(
        Prediction.company_id == company_id
    ).scalar()

    # Ventas: ventana de SLOW_MOVING_DAYS hacia atras desde el ultimo registro
    if max_sale_date:
        sales_end_date   = max_sale_date
        sales_start_date = max_sale_date - timedelta(days=SLOW_MOVING_DAYS)
    else:
        sales_end_date = sales_start_date = None

    # Predicciones: 30 dias desde el primer forecast disponible
    if min_forecast_date:
        forecast_start_date = min_forecast_date
        forecast_end_date   = min_forecast_date + timedelta(days=30)
    else:
        forecast_start_date = forecast_end_date = None

    # Fecha de analisis: ultimo dia de ventas conocido (o hoy si no hay ventas)
    analysis_date = max_sale_date if max_sale_date else today

    # ------------------------------------------------------------------
    # 2. Promedio de demanda diaria por SKU (proximos 30 dias)
    # ------------------------------------------------------------------
    avg_forecast_by_item = {}
    if forecast_start_date:
        avg_forecast_by_item = {
            row.item_id: float(row.avg_daily_forecast)
            for row in (
                db.query(
                    Prediction.item_id,
                    func.avg(Prediction.predicted_demand).label("avg_daily_forecast"),
                )
                .filter(Prediction.company_id == company_id)
                .filter(Prediction.forecast_date >= forecast_start_date)
                .filter(Prediction.forecast_date <= forecast_end_date)
                .group_by(Prediction.item_id)
                .all()
            )
            if row.avg_daily_forecast is not None
        }

    # ------------------------------------------------------------------
    # 3. Total de unidades vendidas + primera fecha de venta por SKU
    #    Se usa la fecha real de inicio por SKU para calcular avg_daily_sales
    #    con precision (evita inflar days_of_stock en SKUs con menos historia)
    # ------------------------------------------------------------------
    units_sold_by_item: dict[str, float] = {}
    first_sale_by_item: dict[str, object] = {}
    if sales_start_date:
        for row in (
            db.query(
                SalesTransaction.item_id,
                func.sum(SalesTransaction.units_sold).label("total_sold"),
                func.min(SalesTransaction.date).label("first_date"),
            )
            .filter(SalesTransaction.company_id == company_id)
            .filter(SalesTransaction.date >= sales_start_date)
            .filter(SalesTransaction.date <= sales_end_date)
            .group_by(SalesTransaction.item_id)
            .all()
        ):
            if row.total_sold is not None:
                units_sold_by_item[row.item_id] = float(row.total_sold)
                first_sale_by_item[row.item_id] = row.first_date

    # ------------------------------------------------------------------
    # 4. Limpiar analisis previo
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
            # Sin datos de ventas - no se puede determinar aun
            slow_moving_flag    = None
            immobilized_capital = None
            days_of_stock       = None
        else:
            # Dias reales de historia del SKU dentro de la ventana de analisis.
            # Mas preciso que usar siempre 365: un SKU nuevo no se penaliza
            # injustamente por dividir sobre dias que no tiene datos.
            sku_first_date = first_sale_by_item.get(snapshot.item_id)
            sku_effective_days = (
                max((sales_end_date - sku_first_date).days, 1)
                if sku_first_date and sales_end_date
                else SLOW_MOVING_DAYS
            )

            avg_daily_sales = total_units_sold / sku_effective_days
            days_of_stock = (
                round(snapshot.inventory_on_hand / avg_daily_sales, 1)
                if avg_daily_sales > 0 else None
            )

            # Slow moving si supera el umbral DOH (cross-industry: 90 dias)
            slow_moving_flag = (
                days_of_stock > SLOW_MOVING_DOH_THRESHOLD
                if days_of_stock is not None else None
            )

            # Capital inmovilizado solo aplica a SKUs lentos o dead stock
            immobilized_capital = (
                float(snapshot.inventory_on_hand) * float(snapshot.unit_cost)
                if slow_moving_flag else None
            )

        # --- stock_status consolidado ---
        if total_units_sold is None and avg_daily_forecast is None:
            stock_status = "pending"
        elif days_of_stock is not None and days_of_stock > DEAD_STOCK_DOH_THRESHOLD:
            stock_status = "dead_stock"
        elif slow_moving_flag:
            stock_status = "slow_moving"
        else:
            stock_status = "ok"

        records.append(InventoryAnalysis(
            company_id=company_id,
            inventory_snapshot_id=snapshot.id,
            item_id=snapshot.item_id,
            analysis_date=analysis_date,
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






