"""Integration tests for run_inventory_analysis.

Exercises the slow-moving detection algorithm (US-08) and reorder point
calculation (US-10) by seeding a real database and asserting the
InventoryAnalysis records that the algorithm writes.
"""

import pytest
from datetime import date, timedelta

from database.models import (
    Company,
    InventoryAnalysis,
    InventorySnapshot,
    Prediction,
    SalesTransaction,
)
from inventory.inventory_analysis import SLOW_MOVING_DOH_THRESHOLD, run_inventory_analysis


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_company(db) -> Company:
    company = Company(name="Test Co")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


def _add_snapshot(db, company_id: int, item_id: str, on_hand: int, lead_time: int) -> InventorySnapshot:
    snap = InventorySnapshot(
        company_id=company_id,
        item_id=item_id,
        store_id="S1",
        date=date(2016, 12, 31),
        inventory_on_hand=on_hand,
        lead_time_days=lead_time,
        unit_cost=10.0,
    )
    db.add(snap)
    db.commit()
    return snap


# ---------------------------------------------------------------------------
# US-08 — Slow-Moving Inventory Detection
# ---------------------------------------------------------------------------

def test_slow_moving_flag_true_when_high_doh(db):
    """Happy path: SKU with very low sales rate gets slow_moving_flag=True
    and immobilized_capital calculated."""
    company = _seed_company(db)
    _add_snapshot(db, company.id, "SLOW-SKU", on_hand=1000, lead_time=7)

    # 5 sales over 5 days → avg ≈ 1 unit/day → days_of_stock ≈ 1000 >> 90
    for i in range(5):
        db.add(SalesTransaction(
            company_id=company.id,
            item_id="SLOW-SKU",
            date=date(2016, 1, 1) + timedelta(days=i),
            units_sold=1,
            sell_price=10.0,
        ))
    db.commit()

    run_inventory_analysis(company.id, db)

    analysis = db.query(InventoryAnalysis).filter_by(company_id=company.id).first()
    assert analysis is not None
    assert analysis.slow_moving_flag is True
    assert analysis.immobilized_capital is not None
    assert float(analysis.immobilized_capital) > 0


def test_slow_moving_flag_false_when_fast_rotation(db):
    """Alt path: SKU with high sales rate gets slow_moving_flag=False
    and no immobilized_capital."""
    company = _seed_company(db)
    _add_snapshot(db, company.id, "FAST-SKU", on_hand=30, lead_time=7)

    # 3 units/day for 365 days → days_of_stock ≈ 10 << 90
    for i in range(365):
        db.add(SalesTransaction(
            company_id=company.id,
            item_id="FAST-SKU",
            date=date(2016, 1, 1) + timedelta(days=i),
            units_sold=3,
            sell_price=10.0,
        ))
    db.commit()

    run_inventory_analysis(company.id, db)

    analysis = db.query(InventoryAnalysis).filter_by(company_id=company.id).first()
    assert analysis is not None
    assert analysis.slow_moving_flag is False
    assert analysis.immobilized_capital is None


# ---------------------------------------------------------------------------
# US-10 — Reorder Point Calculation
# ---------------------------------------------------------------------------

def test_reorder_point_calculated_from_forecast(db):
    """Happy path: when forecast rows exist, reorder_point equals
    avg_daily_forecast × lead_time_days."""
    company = _seed_company(db)
    lead_time = 10
    _add_snapshot(db, company.id, "SKU-A", on_hand=500, lead_time=lead_time)

    # 30 days of forecast at 5 units/day
    forecast_start = date(2017, 1, 1)
    for i in range(30):
        db.add(Prediction(
            company_id=company.id,
            item_id="SKU-A",
            forecast_date=forecast_start + timedelta(days=i),
            predicted_demand=5.0,
            yhat_lower=4.0,
            yhat_upper=6.0,
        ))
    db.commit()

    run_inventory_analysis(company.id, db)

    analysis = db.query(InventoryAnalysis).filter_by(company_id=company.id).first()
    assert analysis is not None
    assert analysis.reorder_point is not None
    # reorder_point = avg_daily_forecast * lead_time_days = 5.0 * 10 = 50
    assert float(analysis.reorder_point) == pytest.approx(50.0, rel=0.01)


def test_reorder_point_none_when_no_forecast(db):
    """Alt path: with no Prediction rows, reorder_point is None."""
    company = _seed_company(db)
    _add_snapshot(db, company.id, "SKU-B", on_hand=100, lead_time=7)
    # No Prediction rows added

    run_inventory_analysis(company.id, db)

    analysis = db.query(InventoryAnalysis).filter_by(company_id=company.id).first()
    assert analysis is not None
    assert analysis.reorder_point is None
