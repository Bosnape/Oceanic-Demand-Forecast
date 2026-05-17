from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pandas as pd

@dataclass
class ValidationResult:
    cleaned: pd.DataFrame
    issues: List[Dict[str, Any]]
    warnings: List[str]

def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df

def validate_sales_dataframe(
    df: pd.DataFrame,
    date_col: str = "date",
    sku_col: str = "item_id",
    quantity_col: str = "units_sold",
    price_col: str = "sell_price",
    drop_invalid_rows: bool = True,
) -> ValidationResult:
    """
    Validates and cleans the uploaded sales dataframe.
    Required columns: date, item_id, units_sold, sell_price.
    All other columns are preserved but not validated.
    """
    required = [date_col, sku_col, quantity_col, price_col]

    df = _normalize_columns(df)

    # Check required columns exist
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        raise ValueError(
            f"Missing required columns: {missing_cols}. "
            f"Received columns: {list(df.columns)}"
        )

    cleaned = df.copy()
    issues: List[Dict[str, Any]] = []
    warnings: List[str] = []

    # Convert types
    cleaned[date_col]     = pd.to_datetime(cleaned[date_col], errors="coerce")
    cleaned[quantity_col] = pd.to_numeric(cleaned[quantity_col], errors="coerce")
    cleaned[price_col]    = pd.to_numeric(cleaned[price_col], errors="coerce")

    # Detect invalid rows
    bad_date  = cleaned[date_col].isna()
    bad_sku   = cleaned[sku_col].isna() | (cleaned[sku_col].astype(str).str.strip() == "")
    bad_qty   = cleaned[quantity_col].isna()
    bad_price = cleaned[price_col].isna()

    bad_any = bad_date | bad_sku | bad_qty | bad_price

    if bad_any.any():
        for idx, row in cleaned.loc[bad_any].iterrows():
            reasons = []
            if pd.isna(row[date_col]):                                    reasons.append("invalid date")
            if pd.isna(row[sku_col]) or str(row[sku_col]).strip() == "": reasons.append("empty item_id")
            if pd.isna(row[quantity_col]):                                reasons.append("invalid units_sold")
            if pd.isna(row[price_col]):                                   reasons.append("invalid sell_price")
            issues.append({"row_index": int(idx), "reasons": reasons})

        warnings.append(f"{int(bad_any.sum())} rows with invalid data detected.")

        if drop_invalid_rows:
            cleaned = cleaned.loc[~bad_any].copy()
            warnings.append("Invalid rows dropped (drop_invalid_rows=True).")

    # Fill remaining nulls in numeric columns with 0
    cleaned[quantity_col] = cleaned[quantity_col].fillna(0)
    cleaned[price_col]    = cleaned[price_col].fillna(0)

    # Clean item_id
    cleaned[sku_col] = cleaned[sku_col].astype(str).str.strip()

    # Sort by item and date
    cleaned = cleaned.sort_values([sku_col, date_col]).reset_index(drop=True)

    return ValidationResult(cleaned=cleaned, issues=issues, warnings=warnings)

def validate_inventory_dataframe(df: pd.DataFrame) -> ValidationResult:
    """
    Validates and cleans the uploaded inventory dataframe.
    Required columns: date, item_id, store_id, inventory_on_hand, lead_time_days, unit_cost.
    Optional columns: inventory_available, reorder_quantity.
    """
    required = ["date", "item_id", "store_id", "inventory_on_hand", "lead_time_days", "unit_cost"]

    df = _normalize_columns(df)

    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        raise ValueError(
            f"Missing required columns: {missing_cols}. "
            f"Received columns: {list(df.columns)}"
        )

    cleaned = df.copy()
    issues: List[Dict[str, Any]] = []
    warnings: List[str] = []

    # Convert types
    cleaned["date"]             = pd.to_datetime(cleaned["date"], errors="coerce")
    cleaned["inventory_on_hand"] = pd.to_numeric(cleaned["inventory_on_hand"], errors="coerce")
    cleaned["lead_time_days"]   = pd.to_numeric(cleaned["lead_time_days"], errors="coerce")
    cleaned["unit_cost"]        = pd.to_numeric(cleaned["unit_cost"], errors="coerce")

    # Handle optional columns
    if "inventory_available" not in cleaned.columns:
        cleaned["inventory_available"] = cleaned["inventory_on_hand"]
    else:
        cleaned["inventory_available"] = pd.to_numeric(
            cleaned["inventory_available"], errors="coerce"
        ).fillna(cleaned["inventory_on_hand"])

    if "reorder_quantity" not in cleaned.columns:
        cleaned["reorder_quantity"] = None
    else:
        cleaned["reorder_quantity"] = pd.to_numeric(
            cleaned["reorder_quantity"], errors="coerce"
        )

    # Detect invalid rows
    bad_date     = cleaned["date"].isna()
    bad_sku      = cleaned["item_id"].isna() | (cleaned["item_id"].astype(str).str.strip() == "")
    bad_stock    = cleaned["inventory_on_hand"].isna()
    bad_leadtime = cleaned["lead_time_days"].isna()
    bad_cost     = cleaned["unit_cost"].isna()

    bad_any = bad_date | bad_sku | bad_stock | bad_leadtime | bad_cost

    if bad_any.any():
        for idx, row in cleaned.loc[bad_any].iterrows():
            reasons = []
            if pd.isna(row["date"]):                                          reasons.append("invalid date")
            if pd.isna(row["item_id"]) or str(row["item_id"]).strip() == "": reasons.append("empty item_id")
            if pd.isna(row["inventory_on_hand"]):                             reasons.append("invalid inventory_on_hand")
            if pd.isna(row["lead_time_days"]):                                reasons.append("invalid lead_time_days")
            if pd.isna(row["unit_cost"]):                                     reasons.append("invalid unit_cost")
            issues.append({"row_index": int(idx), "reasons": reasons})

        warnings.append(f"{int(bad_any.sum())} rows with invalid data detected.")
        cleaned = cleaned.loc[~bad_any].copy()
        warnings.append("Invalid rows dropped.")

    # Clean item_id
    cleaned["item_id"] = cleaned["item_id"].astype(str).str.strip()

    # Sort
    cleaned = cleaned.sort_values(["item_id", "date"]).reset_index(drop=True)

    return ValidationResult(cleaned=cleaned, issues=issues, warnings=warnings)