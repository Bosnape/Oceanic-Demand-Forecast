"""
US-20 — Audit Logs
Crea este archivo en: backend/api/audit_logs.py
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.models import UploadLog, ModelExecutionLog


# ─── Pydantic schemas (response) ────────────────────────────────────────────

class UploadLogOut(BaseModel):
    id: int
    filename: str
    file_type: str
    upload_date: datetime
    status: str
    records_processed: Optional[int]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class ModelExecutionLogOut(BaseModel):
    id: int
    execution_date: datetime
    status: str
    item_id: Optional[str]
    mae: Optional[float]
    rmse: Optional[float]
    mape: Optional[float]
    coverage: Optional[float]
    duration_seconds: Optional[float]
    error_message: Optional[str]

    class Config:
        from_attributes = True


# ─── Service helpers ─────────────────────────────────────────────────────────

def log_upload(
    db: Session,
    filename: str,
    file_type: str,
    status: str,
    records_processed: int = None,
    error_message: str = None,
) -> UploadLog:
    """Registra una carga de datos. Llama desde /upload-sales y /upload-inventory."""
    entry = UploadLog(
        filename=filename,
        file_type=file_type,
        status=status,
        records_processed=records_processed,
        error_message=error_message,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def log_model_execution(
    db: Session,
    status: str,
    item_id: str = None,
    mae: float = None,
    rmse: float = None,
    mape: float = None,
    coverage: float = None,
    duration_seconds: float = None,
    error_message: str = None,
) -> ModelExecutionLog:
    """Registra una ejecución del pipeline de Prophet."""
    entry = ModelExecutionLog(
        status=status,
        item_id=item_id,
        mae=mae,
        rmse=rmse,
        mape=mape,
        coverage=coverage,
        duration_seconds=duration_seconds,
        error_message=error_message,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ─── Query helpers ───────────────────────────────────────────────────────────

def get_upload_logs(db: Session, limit: int = 100) -> list[UploadLog]:
    return (
        db.query(UploadLog)
        .order_by(UploadLog.upload_date.desc())
        .limit(limit)
        .all()
    )


def get_model_logs(db: Session, limit: int = 100) -> list[ModelExecutionLog]:
    return (
        db.query(ModelExecutionLog)
        .order_by(ModelExecutionLog.execution_date.desc())
        .limit(limit)
        .all()
    )
