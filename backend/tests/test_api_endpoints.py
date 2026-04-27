"""Integration tests for API endpoints.

Uses FastAPI TestClient with the database session overridden to the test
session, so all endpoint logic runs against the test database without
spinning up a real server. Covers:
  - US-09: POST /upload-sales, POST /upload-inventory
  - US-11: GET /api/inventory/alerts
  - US-12: GET /api/predictions/status
  - US-13: GET /api/predictions/metrics
"""

import pytest
from datetime import date, timedelta

from database.models import (
    Company,
    DataSource,
    InventorySnapshot,
    ModelMetrics,
    Prediction,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_company(db) -> Company:
    company = Company(name="Test Co")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


# ---------------------------------------------------------------------------
# US-09 — Update Historical Data
# ---------------------------------------------------------------------------

_VALID_SALES_CSV = (
    b"item_id,date,units_sold,sell_price\n"
    b"SKU-001,2024-01-01,10,5.0\n"
    b"SKU-001,2024-01-02,12,5.0\n"
)


def test_upload_sales_valid_csv_stores_rows(client, monkeypatch):
    """Happy path: valid CSV is uploaded → 200 OK and rows_saved matches the file."""
    monkeypatch.setattr("api.main.run_prophet_background", lambda *a, **kw: None)

    response = client.post(
        "/upload-sales",
        files={"file": ("sales.csv", _VALID_SALES_CSV, "text/csv")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["rows_saved"] == 2
    assert data["filename"] == "sales.csv"


def test_upload_sales_unsupported_format_returns_400(client):
    """Alt path: file with unsupported extension → 400 with descriptive error."""
    response = client.post(
        "/upload-sales",
        files={"file": ("sales.txt", b"item_id,date\nA,2024-01-01\n", "text/plain")},
    )

    assert response.status_code == 400
    assert "Unsupported format" in response.json()["detail"]


_VALID_INVENTORY_CSV = (
    b"item_id,date,store_id,inventory_on_hand,lead_time_days,unit_cost\n"
    b"SKU-001,2024-01-01,S1,100,10,5.0\n"
)


def test_upload_inventory_valid_csv_stores_rows(client):
    """Happy path: valid inventory CSV is uploaded → 200 OK and rows_saved matches the file."""
    response = client.post(
        "/upload-inventory",
        files={"file": ("inventory.csv", _VALID_INVENTORY_CSV, "text/csv")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["rows_saved"] == 1
    assert data["filename"] == "inventory.csv"


def test_upload_inventory_unsupported_format_returns_400(client):
    """Alt path: file with unsupported extension → 400 with descriptive error."""
    response = client.post(
        "/upload-inventory",
        files={"file": ("inventory.txt", b"item_id,date\nA,2024-01-01\n", "text/plain")},
    )

    assert response.status_code == 400
    assert "Unsupported format" in response.json()["detail"]


# ---------------------------------------------------------------------------
# US-11 — Stockout Alerts & Risk Identification
# ---------------------------------------------------------------------------

def test_get_alerts_no_inventory_returns_empty(client):
    """Alt path: no inventory data → empty alert list with alert_mode 'no_data'."""
    response = client.get("/api/inventory/alerts")

    assert response.status_code == 200
    data = response.json()
    assert data["alerts"] == []
    assert data["alert_mode"] == "no_data"


def test_get_alerts_critical_sku_appears_first(client, db):
    """Happy path: SKU where stock < demand during lead time is classified
    as 'critical' and returned as the first alert."""
    company = _seed_company(db)

    # stock=5, lead_time=10 days, forecast=10 units/day → need 100, have 5 → critical
    db.add(InventorySnapshot(
        company_id=company.id,
        item_id="CRIT-SKU",
        store_id="S1",
        date=date(2017, 1, 1),
        inventory_on_hand=5,
        inventory_available=5,
        lead_time_days=10,
        unit_cost=10.0,
    ))
    db.commit()

    forecast_start = date(2017, 1, 2)
    for i in range(90):
        db.add(Prediction(
            company_id=company.id,
            item_id="CRIT-SKU",
            forecast_date=forecast_start + timedelta(days=i),
            predicted_demand=10.0,
            yhat_lower=8.0,
            yhat_upper=12.0,
        ))
    db.commit()

    response = client.get("/api/inventory/alerts")

    assert response.status_code == 200
    data = response.json()
    assert len(data["alerts"]) >= 1
    first = data["alerts"][0]
    assert first["stock_status"] == "critical"
    assert first["item_id"] == "CRIT-SKU"


# ---------------------------------------------------------------------------
# US-12 — Automatic Prediction Refresh
# ---------------------------------------------------------------------------

def test_get_status_no_datasource_returns_no_data(client):
    """Alt path: no files uploaded yet → status is 'no_data'."""
    response = client.get("/api/predictions/status")

    assert response.status_code == 200
    assert response.json()["status"] == "no_data"


def test_get_status_ready_returns_timestamp(client, db):
    """Happy path: datasource in 'ready' state and at least one Prediction →
    response includes status='ready' and a non-null last_run_at."""
    company = _seed_company(db)

    db.add(DataSource(company_id=company.id, filename="sales.csv", status="ready"))
    db.add(Prediction(
        company_id=company.id,
        item_id="SKU-X",
        forecast_date=date(2017, 1, 1),
        predicted_demand=5.0,
        yhat_lower=4.0,
        yhat_upper=6.0,
    ))
    db.commit()

    response = client.get("/api/predictions/status")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["last_run_at"] is not None


# ---------------------------------------------------------------------------
# US-13 — Model Accuracy Metrics
# ---------------------------------------------------------------------------

def test_get_metrics_no_datasource_returns_404(client):
    """Alt path: no data uploaded → metrics endpoint returns 404."""
    response = client.get("/api/predictions/metrics")

    assert response.status_code == 404


def test_get_metrics_returns_aggregate_and_per_sku(client, db):
    """Happy path: metrics in DB → response has both aggregate and per_sku
    with correct numeric values."""
    company = _seed_company(db)

    db.add(DataSource(company_id=company.id, filename="sales.csv", status="ready"))
    db.add(ModelMetrics(
        company_id=company.id,
        item_id=None,          # aggregate row
        mae=2.5, rmse=3.1, mape=15.0, coverage_ic=0.85, bias=0.1,
        training_samples=300, validation_samples=30,
        seasonality_mode="multiplicative",
    ))
    db.add(ModelMetrics(
        company_id=company.id,
        item_id="SKU-X",
        mae=1.8, rmse=2.4, mape=12.0, coverage_ic=0.90, bias=-0.05,
        training_samples=100, validation_samples=10,
        seasonality_mode="multiplicative",
    ))
    db.commit()

    response = client.get("/api/predictions/metrics")

    assert response.status_code == 200
    data = response.json()
    assert data["aggregate"] is not None
    assert float(data["aggregate"]["mae"]) == pytest.approx(2.5, rel=0.01)
    assert len(data["per_sku"]) == 1
    assert data["per_sku"][0]["item_id"] == "SKU-X"
