"""Pydantic schemas and service helpers for upload and model execution audit logs."""

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
    skus_trained: Optional[int]
    avg_mae: Optional[float]
    avg_rmse: Optional[float]
    avg_mape: Optional[float]
    avg_coverage_ic: Optional[float]
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
    skus_trained: int = None,
    avg_mae: float = None,
    avg_rmse: float = None,
    avg_mape: float = None,
    avg_coverage_ic: float = None,
    duration_seconds: float = None,
    error_message: str = None,
) -> ModelExecutionLog:
    """Registra una ejecución completa del pipeline Prophet (una fila por run)."""
    entry = ModelExecutionLog(
        status=status,
        skus_trained=skus_trained,
        avg_mae=avg_mae,
        avg_rmse=avg_rmse,
        avg_mape=avg_mape,
        avg_coverage_ic=avg_coverage_ic,
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
