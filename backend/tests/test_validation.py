"""Unit tests for validate_sales_dataframe and validate_inventory_dataframe.

These are pure functions — no database required. Covers US-09 (Update Historical Data):
the system must accept valid files and reject files with missing or malformed data.
"""

import pytest
import pandas as pd

from api.validation import validate_inventory_dataframe, validate_sales_dataframe


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _valid_sales_df() -> pd.DataFrame:
    return pd.DataFrame({
        "item_id":    ["SKU-001", "SKU-002"],
        "date":       ["2024-01-01", "2024-01-02"],
        "units_sold": [10, 20],
        "sell_price": [5.0, 8.0],
    })


def _valid_inventory_df() -> pd.DataFrame:
    return pd.DataFrame({
        "item_id":            ["SKU-001"],
        "store_id":           ["STORE-1"],
        "date":               ["2024-01-01"],
        "inventory_on_hand":  [100],
        "lead_time_days":     [7],
        "unit_cost":          [10.0],
    })


# ---------------------------------------------------------------------------
# validate_sales_dataframe
# ---------------------------------------------------------------------------

def test_sales_valid_dataframe_passes():
    """Happy path: valid DataFrame is accepted and all rows are kept."""
    result = validate_sales_dataframe(_valid_sales_df())

    assert len(result.cleaned) == 2
    assert len(result.issues) == 0


def test_sales_missing_required_column_raises():
    """Alt path: DataFrame without a required column raises ValueError."""
    df = pd.DataFrame({"item_id": ["SKU-001"], "units_sold": [10]})

    with pytest.raises(ValueError, match="Missing required columns"):
        validate_sales_dataframe(df)


def test_sales_invalid_rows_are_dropped():
    """Alt path: rows with invalid date or empty item_id are reported and dropped."""
    bad_row = pd.DataFrame({
        "item_id":    [""],
        "date":       ["not-a-date"],
        "units_sold": [5],
        "sell_price": [3.0],
    })
    df = pd.concat([_valid_sales_df(), bad_row], ignore_index=True)

    result = validate_sales_dataframe(df)

    assert len(result.cleaned) == 2        # bad row dropped
    assert len(result.issues) == 1         # one issue reported
    assert len(result.warnings) > 0


# ---------------------------------------------------------------------------
# validate_inventory_dataframe
# ---------------------------------------------------------------------------

def test_inventory_valid_dataframe_passes():
    """Happy path: valid inventory DataFrame is accepted without issues."""
    result = validate_inventory_dataframe(_valid_inventory_df())

    assert len(result.cleaned) == 1
    assert len(result.issues) == 0


def test_inventory_missing_required_column_raises():
    """Alt path: inventory DataFrame without a required column raises ValueError."""
    df = pd.DataFrame({"item_id": ["SKU-001"], "date": ["2024-01-01"]})

    with pytest.raises(ValueError, match="Missing required columns"):
        validate_inventory_dataframe(df)
