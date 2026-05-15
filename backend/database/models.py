from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, Numeric, String, TIMESTAMP, Text, Float, DateTime, text
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime

from .base import Base

class Company(Base):
    __tablename__ = "company"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))

class DataSource(Base):
    __tablename__ = "data_source"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("company.id"))
    filename = Column(String(255))
    upload_date = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))
    status = Column(String(50))  # uploaded → processing → ready / failed

class SalesTransaction(Base):
    __tablename__ = "sales_transaction"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("company.id"))
    item_id = Column(String(100), nullable=False)
    store_id = Column(String(50))
    cat_id = Column(String(50))
    dept_id = Column(String(50))
    date = Column(Date, nullable=False)
    units_sold = Column(Integer)
    sell_price = Column(Numeric(12, 2))
    holiday_promotion = Column(Integer)
    event_name_1 = Column(String(100))
    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))

class Prediction(Base):
    __tablename__ = "prediction"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("company.id"))
    item_id = Column(String(100), nullable=False)
    forecast_date = Column(Date, nullable=False)
    predicted_demand = Column(Numeric(12, 2))
    yhat_lower = Column(Numeric(12, 2))
    yhat_upper = Column(Numeric(12, 2))
    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))

class InventorySnapshot(Base):
    __tablename__ = "inventory_snapshot"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("company.id"))
    date = Column(Date, nullable=False)
    item_id = Column(String(100), nullable=False)
    store_id = Column(String(50))
    inventory_on_hand = Column(Integer, nullable=False)
    inventory_available = Column(Integer)         # optional — defaults to inventory_on_hand
    lead_time_days = Column(Integer, nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    reorder_quantity = Column(Integer)            # optional
    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))

class InventoryAnalysis(Base):
    __tablename__ = "inventory_analysis"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("company.id"))
    inventory_snapshot_id = Column(Integer, ForeignKey("inventory_snapshot.id"))
    item_id = Column(String(100), nullable=False)
    analysis_date = Column(Date, nullable=False)

    # FR-09 — Reorder point
    avg_daily_forecast = Column(Numeric(12, 2))
    safety_stock = Column(Numeric(12, 2))
    reorder_point = Column(Numeric(12, 2))

    # FR-10 — Stockout risk
    days_of_stock = Column(Numeric(12, 2))
    stockout_flag = Column(Boolean, default=False)
    stockout_date = Column(Date)

    # FR-11 — Slow-moving
    slow_moving_flag = Column(Boolean, default=False)
    immobilized_capital = Column(Numeric(12, 2))

    # FR-12 — Future projection (simple version Sprint 2, full time series Sprint 3)
    units_needed_next_month = Column(Numeric(12, 2))

    # Frontend alerts
    stock_status = Column(String(20))  # ok / low / critical

    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))


class ModelMetrics(Base):
    """Per-SKU and aggregate accuracy metrics computed after each Prophet training run."""
    __tablename__ = "model_metrics"

    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("company.id"))
    item_id    = Column(String(100), nullable=True)    # NULL → aggregate row

    # Core accuracy metrics
    mae         = Column(Numeric(12, 4))               # Mean Absolute Error (units/day)
    rmse        = Column(Numeric(12, 4))               # Root Mean Squared Error (units/day)
    mape        = Column(Numeric(8, 2))                # Mean Absolute Percentage Error (%)
    coverage_ic = Column(Numeric(8, 2))                # % of actuals inside confidence interval
    bias        = Column(Numeric(12, 4))               # avg(predicted − actual); + = overforecast

    # Training context
    training_samples   = Column(Integer)               # rows used for training
    validation_samples = Column(Integer)               # rows used for validation window
    seasonality_mode   = Column(String(20))            # 'additive' | 'multiplicative'

    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))


# =============================================================================
# US-20 — Audit Log Models
# =============================================================================

class UploadLog(Base):
    """Registro de cada archivo subido via /upload-sales o /upload-inventory."""
    __tablename__ = "upload_logs"

    id                = Column(Integer, primary_key=True, index=True)
    filename          = Column(String(255), nullable=False)
    file_type         = Column(String(50), nullable=False)   # "sales" | "inventory"
    upload_date       = Column(DateTime, default=datetime.utcnow, nullable=False)
    status            = Column(String(50), nullable=False)   # "success" | "failed"
    records_processed = Column(Integer, nullable=True)
    error_message     = Column(Text, nullable=True)


class ModelExecutionLog(Base):
    """Registro de cada ejecución del pipeline Prophet (una fila por run completo)."""
    __tablename__ = "model_execution_logs"

    id               = Column(Integer, primary_key=True, index=True)
    execution_date   = Column(DateTime, default=datetime.utcnow, nullable=False)
    status           = Column(String(50), nullable=False)   # "success" | "failed"
    skus_trained     = Column(Integer, nullable=True)
    avg_mae          = Column(Float, nullable=True)
    avg_rmse         = Column(Float, nullable=True)
    avg_mape         = Column(Float, nullable=True)
    avg_coverage_ic  = Column(Float, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    error_message    = Column(Text, nullable=True)
