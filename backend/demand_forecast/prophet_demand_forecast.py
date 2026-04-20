import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import itertools
import warnings
import os
import sys
from pathlib import Path

from matplotlib.patches import Patch
from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Add project root to path so database module is reachable
sys.path.append(str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session
from database.database import SessionLocal
from database.models import Prediction, Company

warnings.filterwarnings('ignore')

# Output folder for plots
PLOTS_DIR = 'ml_plots'

# =============================================================================
# Section 1: Data Loading
# =============================================================================

def load_data(filepath):
    data = pd.read_csv(filepath, parse_dates=['date'])
    data = data.sort_values(['item_id', 'date']).reset_index(drop=True)
    print(f"Dataset loaded — shape: {data.shape}")
    print(f"Date range:  {data['date'].min().date()} → {data['date'].max().date()}")
    print(f"SKUs:        {data['item_id'].nunique()}")
    print(f"Store:       {data['store_id'].unique()[0]}\n")
    return data

# =============================================================================
# Section 2: Holidays DataFrame
# =============================================================================

def build_holidays(data):
    holidays_df = (data[data['event_name_1'].notna()]
                   [['date', 'event_name_1']]
                   .drop_duplicates()
                   .rename(columns={'date': 'ds', 'event_name_1': 'holiday'}))
    holidays_df['ds'] = pd.to_datetime(holidays_df['ds'])
    holidays_df['lower_window'] = -1
    holidays_df['upper_window'] = 1
    print(f"Holidays built — {holidays_df['holiday'].nunique()} unique events\n")
    return holidays_df

# =============================================================================
# Section 3: Exploratory Plots
# =============================================================================

def plot_daily_sales(data):
    """Total daily sales across all SKUs."""
    ventas_diarias = data.groupby('date')['units_sold'].sum().reset_index()

    fig, ax = plt.subplots(figsize=(16, 4))
    ax.plot(ventas_diarias['date'], ventas_diarias['units_sold'],
            color='steelblue', linewidth=0.9)
    ax.set_title('Total Daily Sales — 35 SKUs (CA_1)')
    ax.set_xlabel('Date')
    ax.set_ylabel('Units Sold')
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
    plt.tight_layout()
    plt.savefig(f'{PLOTS_DIR}/01_total_daily_sales.png', dpi=150)
    plt.close()
    print("Plot saved: 01_total_daily_sales.png")

def plot_sku_sample(data):
    """Sales evolution for 6 SKUs — mix of stable and chaotic patterns."""
    # 3 best predicted (low MAE relative) + 3 high volatility
    sample_skus = [
        'FOODS_3_586', 'FOODS_3_252', 'FOODS_3_555',  # stable pattern
        'FOODS_3_120', 'FOODS_3_681', 'HOBBIES_1_348'  # chaotic pattern
    ]

    data['year_month'] = data['date'].dt.to_period('M')
    ventas_mes = (data.groupby(['year_month', 'item_id'])['units_sold']
                  .sum()
                  .reset_index())
    ventas_mes['year_month'] = ventas_mes['year_month'].dt.to_timestamp()

    fig, axes = plt.subplots(2, 3, figsize=(18, 7))
    axes = axes.flatten()

    labels = ['Stable', 'Stable', 'Stable', 'Volatile', 'Volatile', 'Volatile']

    for i, sku in enumerate(sample_skus):
        sku_data = ventas_mes[ventas_mes['item_id'] == sku]
        color = 'steelblue' if i < 3 else 'coral'
        axes[i].plot(sku_data['year_month'], sku_data['units_sold'],
                     color=color, linewidth=1)
        axes[i].set_title(f'{sku} [{labels[i]}]', fontsize=9)
        axes[i].tick_params(axis='x', labelsize=7, rotation=30)
        axes[i].tick_params(axis='y', labelsize=7)

    data.drop(columns=['year_month'], inplace=True)
    plt.suptitle('Monthly Sales by SKU — Stable vs Volatile Demand Patterns', fontsize=11)
    plt.tight_layout()
    plt.savefig(f'{PLOTS_DIR}/02_sku_sales_patterns.png', dpi=150)
    plt.close()
    print("Plot saved: 02_sku_sales_patterns.png")

def plot_weekly_seasonality(data):
    """Average sales by day of week — confirms weekend peak."""
    data['dow'] = data['date'].dt.day_name()
    orden = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    ventas_dow = data.groupby('dow')['units_sold'].mean().reindex(orden)

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(ventas_dow.index, ventas_dow.values,
                  color='steelblue', edgecolor='white')
    ax.bar_label(bars, fmt='%.1f', fontsize=8, padding=3)
    ax.set_title('Average Daily Sales by Day of Week')
    ax.set_ylabel('Avg Units Sold')
    ax.set_xlabel('Day')
    plt.tight_layout()
    plt.savefig(f'{PLOTS_DIR}/03_weekly_seasonality.png', dpi=150)
    plt.close()
    data.drop(columns=['dow'], inplace=True)
    print("Plot saved: 03_weekly_seasonality.png")

# =============================================================================
# Section 4: Prophet Model — Single SKU
# =============================================================================

def prepare_prophet_df(data, sku):
    df = (data[data['item_id'] == sku]
          [['date', 'units_sold', 'sell_price']]
          .rename(columns={'date': 'ds', 'units_sold': 'y'})
          .sort_values('ds')
          .reset_index(drop=True))
    df['ds'] = pd.to_datetime(df['ds'])
    return df

def train_prophet(df_train, holidays_df, params):
    m = Prophet(
        holidays=holidays_df,
        changepoint_prior_scale=params['changepoint_prior_scale'],
        seasonality_prior_scale=params['seasonality_prior_scale'],
        seasonality_mode=params['seasonality_mode']
    )
    m.add_regressor('sell_price')
    m.fit(df_train)
    return m

def forecast_prophet(model, df_full, periods=90):
    future = model.make_future_dataframe(periods=periods)
    future = future.merge(df_full[['ds', 'sell_price']], on='ds', how='left')
    future['sell_price'] = future['sell_price'].ffill()
    return model.predict(future)

def evaluate(forecast, df_test):
    pred = forecast.set_index('ds')['yhat'].reindex(df_test['ds'].values)
    real = df_test.set_index('ds')['y']
    mae  = mean_absolute_error(real, pred)
    rmse = np.sqrt(mean_squared_error(real, pred))
    mae_rel = mae / real.mean() * 100
    return mae, rmse, mae_rel

# =============================================================================
# Section 5: Hyperparameter Tuning (pilot SKU)
# =============================================================================

def hyperparameter_tuning(df_train, holidays_df):
    """
    Tune Prophet hyperparameters via cross-validation.
    CV windows scale with available data; falls back to sensible defaults
    when the dataset is too short for meaningful cross-validation.
    """
    print("Running hyperparameter tuning on pilot SKU...")

    DEFAULT_PARAMS = {
        'changepoint_prior_scale': 0.05,
        'seasonality_prior_scale': 1.0,
        'seasonality_mode': 'additive',
    }

    n_days = (df_train['ds'].max() - df_train['ds'].min()).days if len(df_train) > 1 else 0

    # Horizon is fixed at 90 days — matches our forecast period.
    # Initial scales with available data but is capped at the original 1460 days.
    # A valid CV fold requires: initial + period + horizon ≤ n_days.
    # With period=horizon=90 that means initial ≤ n_days - 180.
    # We also enforce initial ≥ 180 (2× horizon) for a meaningful training window.
    HORIZON_DAYS = 90
    initial_days = min(1460, n_days - 2 * HORIZON_DAYS)  # leaves room for one full fold

    if initial_days < 180:
        print(f"Skipping CV tuning ({n_days} days of pilot data) — using default parameters.\n")
        return DEFAULT_PARAMS

    initial = f'{initial_days} days'
    horizon = f'{HORIZON_DAYS} days'
    period  = '90 days'

    param_grid = {
        'changepoint_prior_scale': [0.01, 0.05, 0.1, 0.5],
        'seasonality_prior_scale': [0.1, 1.0, 10.0],
        'seasonality_mode': ['additive', 'multiplicative']
    }

    all_params = [dict(zip(param_grid.keys(), v))
                  for v in itertools.product(*param_grid.values())]

    results = []
    for params in all_params:
        m = Prophet(
            holidays=holidays_df,
            changepoint_prior_scale=params['changepoint_prior_scale'],
            seasonality_prior_scale=params['seasonality_prior_scale'],
            seasonality_mode=params['seasonality_mode']
        )
        m.add_regressor('sell_price')
        m.fit(df_train)

        df_cv = cross_validation(m, initial=initial,
                                 period=period, horizon=horizon,
                                 parallel='processes')
        df_m = performance_metrics(df_cv)
        results.append({**params, 'mae': df_m['mae'].mean()})

    df_results = pd.DataFrame(results).sort_values('mae')
    best = df_results.iloc[0].to_dict()

    print(f"Best params — CPS: {best['changepoint_prior_scale']} | "
          f"SPS: {best['seasonality_prior_scale']} | "
          f"Mode: {best['seasonality_mode']} | "
          f"MAE CV: {best['mae']:.3f}\n")
    return best

# =============================================================================
# Section 6: Multi-SKU Training Loop
# =============================================================================

def train_all_skus(data, holidays_df, best_params, cutoff, periods=90):
    skus = data['item_id'].unique()
    resultados = []
    forecasts  = {}

    print(f"Training {len(skus)} SKU models...\n")

    for sku in skus:
        try:
            df_sku   = prepare_prophet_df(data, sku)
            df_train = df_sku[df_sku['ds'] <= cutoff].copy()
            df_test  = df_sku[df_sku['ds'] >  cutoff].copy()

            model    = train_prophet(df_train, holidays_df, best_params)
            forecast = forecast_prophet(model, df_sku, periods)

            forecasts[sku] = {
                'forecast': forecast,
                'df_train': df_train,
                'df_test': df_test,
                'df_full': df_sku
            }

            # Only evaluate if there is test data (tuning mode); skip in production mode
            if len(df_test) > 0:
                mae, rmse, mae_rel = evaluate(forecast, df_test)
                resultados.append({
                    'item_id': sku,
                    'cat_id': data[data['item_id'] == sku]['cat_id'].iloc[0],
                    'dept_id': data[data['item_id'] == sku]['dept_id'].iloc[0],
                    'mae': round(mae, 2),
                    'rmse': round(rmse, 2),
                    'avg_sales_test': round(df_test['y'].mean(), 2),
                    'mae_relative_%': round(mae_rel, 1)
                })
                print(f"  ✓ {sku:<20} MAE: {mae:6.2f} | MAE rel: {mae_rel:6.1f}%")
            else:
                print(f"  ✓ {sku:<20} (production mode — no test data)")

        except Exception as e:
            print(f"  ✗ {sku} — {e}")

    df_metrics = pd.DataFrame(resultados) if resultados else pd.DataFrame()
    if not df_metrics.empty and 'mae_relative_%' in df_metrics.columns:
        df_metrics = df_metrics.sort_values('mae_relative_%')
    return df_metrics, forecasts

# =============================================================================
# Section 7: Aggregated Forecast
# =============================================================================

def aggregate_forecast(forecasts, data, cutoff):
    dfs = []
    for sku, content in forecasts.items():
        df_temp = content['forecast'][['ds', 'yhat', 'yhat_lower', 'yhat_upper']].copy()
        df_temp['item_id'] = sku
        dfs.append(df_temp)

    df_all = pd.concat(dfs, ignore_index=True)
    agg = (df_all.groupby('ds')[['yhat', 'yhat_lower', 'yhat_upper']]
           .sum()
           .reset_index())
    agg['yhat']       = agg['yhat'].clip(lower=0)
    agg['yhat_lower'] = agg['yhat_lower'].clip(lower=0)

    real_agg = (data.groupby('date')['units_sold']
                .sum()
                .reset_index()
                .rename(columns={'date': 'ds', 'units_sold': 'y'}))

    real_test = real_agg[real_agg['ds'] > cutoff]
    forecast_test = agg[agg['ds'].isin(real_test['ds'])]

    real_aligned = real_test.set_index('ds')['y']
    pred_aligned = forecast_test.set_index('ds')['yhat']

    mae  = mean_absolute_error(real_aligned, pred_aligned)
    rmse = np.sqrt(mean_squared_error(real_aligned, pred_aligned))
    smape = (2 * abs(real_aligned - pred_aligned) /
             (abs(real_aligned) + abs(pred_aligned))).mean() * 100
    mae_rel = mae / real_aligned.mean() * 100

    print("\n── Aggregated Forecast Metrics (35 SKUs) ───────────────────")
    print(f"  MAE:           {mae:.2f} units/day")
    print(f"  RMSE:          {rmse:.2f} units/day")
    print(f"  SMAPE:         {smape:.1f}%")
    print(f"  MAE relative:  {mae_rel:.1f}%")
    print(f"  Avg real:      {real_aligned.mean():.1f} units/day")
    print(f"  Avg forecast:  {pred_aligned.mean():.1f} units/day")
    print("────────────────────────────────────────────────────────────\n")

    return agg, real_agg, cutoff

def plot_aggregated_forecast(agg, real_agg, cutoff):
    real_train  = real_agg[real_agg['ds'] <= cutoff]
    real_test   = real_agg[real_agg['ds'] >  cutoff]
    forecast_period = agg[agg['ds'] > cutoff]

    # Context: last 180 days of train
    train_ctx = real_train[real_train['ds'] >= real_train['ds'].max() - pd.Timedelta(days=180)]

    fig, ax = plt.subplots(figsize=(16, 5))
    ax.plot(train_ctx['ds'], train_ctx['y'],
            color='steelblue', linewidth=0.9, label='Historical', alpha=0.7)
    ax.plot(real_test['ds'], real_test['y'],
            color='coral', linewidth=0.9, label='Actual (test)', alpha=0.9)
    ax.plot(forecast_period['ds'], forecast_period['yhat'],
            color='green', linewidth=1.5, linestyle='--', label='Forecast')
    ax.fill_between(forecast_period['ds'],
                    forecast_period['yhat_lower'],
                    forecast_period['yhat_upper'],
                    alpha=0.15, color='green', label='Confidence interval')
    ax.set_title('Aggregated Forecast — Total Daily Sales (35 SKUs, 90-day horizon)')
    ax.set_xlabel('Date')
    ax.set_ylabel('Units Sold')
    ax.legend()
    plt.tight_layout()
    plt.savefig(f'{PLOTS_DIR}/04_aggregated_forecast.png', dpi=150)
    plt.close()
    print("Plot saved: 04_aggregated_forecast.png")

def plot_metrics_summary(df_metrics):
    """MAE relative per SKU — bar chart for PO presentation."""
    df_valid = df_metrics[df_metrics['avg_sales_test'] >= 5].copy()

    fig, ax = plt.subplots(figsize=(16, 5))
    colors = ['steelblue' if v <= 30 else 'goldenrod' if v <= 60 else 'coral'
              for v in df_valid['mae_relative_%']]
    ax.bar(df_valid['item_id'], df_valid['mae_relative_%'],
           color=colors, edgecolor='white')
    ax.axhline(y=df_valid['mae_relative_%'].mean(),
               color='black', linestyle='--', linewidth=1.2,
               label=f"Average: {df_valid['mae_relative_%'].mean():.1f}%")
    ax.set_title('Relative MAE by SKU (SKUs with avg sales ≥ 5 units/day)')
    ax.set_xlabel('SKU')
    ax.set_ylabel('MAE Relative (%)')
    ax.tick_params(axis='x', rotation=90, labelsize=7)
    ax.legend()

    # Color legend
    legend_elements = [
        Patch(facecolor='steelblue', label='Good (≤30%)'),
        Patch(facecolor='goldenrod', label='Moderate (30-60%)'),
        Patch(facecolor='coral', label='Difficult (>60%)')
    ]
    ax.legend(handles=legend_elements + ax.get_legend_handles_labels()[0],
              loc='upper left', fontsize=8)

    plt.tight_layout()
    plt.savefig(f'{PLOTS_DIR}/05_mae_relative_by_sku.png', dpi=150)
    plt.close()
    print("Plot saved: 05_mae_relative_by_sku.png")

# =============================================================================
# Section 8: Save Predictions to Database
# =============================================================================

def save_predictions_to_db(forecasts, company_id=1):
    """
    Persist forecast results to the prediction table.
    Deletes existing predictions for the company and inserts the new batch in one
    bulk operation. All rows in a single batch share the same created_at timestamp,
    which is used by GET /api/predictions/status as the last_run_at signal.
    """
    db: Session = SessionLocal()

    try:
        # Create demo company if it doesn't exist
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            company = Company(name="OCEANIC Demo Company")
            db.add(company)
            db.commit()
            db.refresh(company)
            company_id = company.id

        # Delete existing predictions for this company
        db.query(Prediction).filter(Prediction.company_id == company_id).delete()
        db.commit()

        records = []
        for sku, content in forecasts.items():
            forecast_df = content['forecast'][['ds', 'yhat', 'yhat_lower', 'yhat_upper']].copy()
            forecast_df = forecast_df[forecast_df['ds'] > content['df_train']['ds'].max()]
            forecast_df['yhat']       = forecast_df['yhat'].clip(lower=0).round(2)
            forecast_df['yhat_lower'] = forecast_df['yhat_lower'].clip(lower=0).round(2)
            forecast_df['yhat_upper'] = forecast_df['yhat_upper'].clip(lower=0).round(2)

            for _, row in forecast_df.iterrows():
                records.append(Prediction(
                    company_id=company_id,
                    item_id=sku,
                    forecast_date=row['ds'].date(),
                    predicted_demand=row['yhat'],
                    yhat_lower=row['yhat_lower'],
                    yhat_upper=row['yhat_upper'],
                ))

        db.bulk_save_objects(records)
        db.commit()
        print(f"\nPredictions saved to DB — {len(records)} rows ({len(forecasts)} SKUs)")

    except Exception as e:
        db.rollback()
        print(f"Error saving predictions: {e}")
        raise
    finally:
        db.close()

# =============================================================================
# Pipeline Entry Point (callable from FastAPI)
# =============================================================================

def run_pipeline(df: pd.DataFrame, company_id: int = 1):
    """
    Runs the full Prophet demand forecasting pipeline.
    Called from POST /upload-sales as a background task.
    Trains on ALL historical data and forecasts the next 90 days.
    """
    FORECAST_DAYS = 90

    holidays_df = build_holidays(df)

    # Tuning cutoff: reserve 20% of the dataset for pilot CV, capped at 90 days.
    # This keeps df_pilot_train non-empty even for short test files.
    data_span_days = (df['date'].max() - df['date'].min()).days
    tuning_cutoff_days = max(7, min(90, int(data_span_days * 0.2)))
    tuning_cutoff = df['date'].max() - pd.Timedelta(days=tuning_cutoff_days)
    full_cutoff   = df['date'].max()  # train on everything

    # Pilot SKU tuning (uses tuning_cutoff to have test data for CV)
    pilot_sku      = df.groupby('item_id')['units_sold'].sum().idxmax()
    df_pilot       = prepare_prophet_df(df, pilot_sku)
    df_pilot_train = df_pilot[df_pilot['ds'] <= tuning_cutoff]

    best_params = hyperparameter_tuning(df_pilot_train, holidays_df)

    # Train all SKUs on full data → forecast next 90 days
    df_metrics, forecasts = train_all_skus(df, holidays_df,
                                           best_params, full_cutoff, FORECAST_DAYS)

    # Save predictions to database
    save_predictions_to_db(forecasts, company_id=company_id)

    print("\n── Pipeline completed ───────────────────────────────────────")
    print(f"  SKUs trained:              {len(forecasts)}")
    if not df_metrics.empty and 'mae_relative_%' in df_metrics.columns:
        df_valid = df_metrics[df_metrics['avg_sales_test'] >= 5]
        print(f"  SKUs with demand ≥5/day:   {len(df_valid)}")
        print(f"  Avg MAE relative:          {df_valid['mae_relative_%'].mean():.1f}%")
    else:
        print("  (production mode — metrics not computed)")
    print("────────────────────────────────────────────────────────────")


# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':

    # Ensure plots directory exists
    os.makedirs(PLOTS_DIR, exist_ok=True)
    
    # Paths
    DATA_PATH     = 'reference_sales.csv'
    CUTOFF_DAYS   = 90
    FORECAST_DAYS = 90

    # Load
    data        = load_data(DATA_PATH)
    holidays_df = build_holidays(data)

    cutoff = data['date'].max() - pd.Timedelta(days=CUTOFF_DAYS)

    # Exploratory plots
    print("Generating exploratory plots...")
    plot_daily_sales(data)
    plot_sku_sample(data)
    plot_weekly_seasonality(data)
    print()

    # Pilot SKU tuning
    pilot_sku = data.groupby('item_id')['units_sold'].sum().idxmax()
    print(f"Pilot SKU: {pilot_sku}")
    df_pilot       = prepare_prophet_df(data, pilot_sku)
    df_pilot_train = df_pilot[df_pilot['ds'] <= cutoff]

    best_params = hyperparameter_tuning(df_pilot_train, holidays_df)

    # Train all SKUs
    df_metrics, forecasts = train_all_skus(data, holidays_df,
                                           best_params, cutoff, FORECAST_DAYS)

    # Results summary
    df_valid = df_metrics[df_metrics['avg_sales_test'] >= 5]
    print("\n── Model Performance Summary ────────────────────────────────")
    print(f"  SKUs trained:              {len(df_metrics)}")
    print(f"  SKUs with demand ≥5/day:   {len(df_valid)}")
    print(f"  Avg MAE relative:          {df_valid['mae_relative_%'].mean():.1f}%")
    print(f"  Good SKUs     (≤30%):      {len(df_valid[df_valid['mae_relative_%'] <= 30])}")
    print(f"  Moderate SKUs (30-60%):    {len(df_valid[(df_valid['mae_relative_%'] > 30) & (df_valid['mae_relative_%'] <= 60)])}")
    print(f"  Difficult SKUs (>60%):     {len(df_valid[df_valid['mae_relative_%'] > 60])}")
    print("────────────────────────────────────────────────────────────")

    # Aggregated forecast
    agg, real_agg, cutoff = aggregate_forecast(forecasts, data, cutoff)

    # Forecast and metrics plots
    plot_aggregated_forecast(agg, real_agg, cutoff)
    plot_metrics_summary(df_metrics)

    # Save predictions to database
    save_predictions_to_db(forecasts)

    print(f"\nDone. All plots saved to '{PLOTS_DIR}/'")