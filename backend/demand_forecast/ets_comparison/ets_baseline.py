import pandas as pd
import numpy as np
import warnings
import os
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from sklearn.metrics import mean_absolute_error, mean_squared_error
from statsmodels.tsa.holtwinters import ExponentialSmoothing


warnings.filterwarnings("ignore")


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PLOTS_DIR = os.path.join(BASE_DIR, "plots")
os.makedirs(PLOTS_DIR, exist_ok=True)




def load_data(filepath):
    data = pd.read_csv(filepath, parse_dates=["date"])
    data = data.sort_values(["item_id", "date"]).reset_index(drop=True)
    return data




def evaluate(real, pred):
    mae = mean_absolute_error(real, pred)
    rmse = np.sqrt(mean_squared_error(real, pred))
    mae_rel = (mae / real.mean() * 100) if real.mean() != 0 else 0
    return mae, rmse, mae_rel




def plot_aggregated_forecast(agg_fcst, real_agg, cutoff):
    real_train = real_agg[real_agg["ds"] <= cutoff]
    real_test = real_agg[real_agg["ds"] > cutoff]


    # Context: last 180 days of training
    train_ctx = real_train[
        real_train["ds"] >= real_train["ds"].max() - pd.Timedelta(days=180)
    ]


    fig, ax = plt.subplots(figsize=(16, 5))
    ax.plot(
        train_ctx["ds"],
        train_ctx["y"],
        color="steelblue",
        linewidth=0.9,
        label="Historical",
        alpha=0.7,
    )
    ax.plot(
        real_test["ds"],
        real_test["y"],
        color="coral",
        linewidth=0.9,
        label="Actual (Test)",
        alpha=0.9,
    )
    ax.plot(
        agg_fcst["ds"],
        agg_fcst["yhat"],
        color="green",
        linewidth=1.5,
        linestyle="--",
        label="ETS Forecast",
    )


    ax.set_title("ETS: Aggregated Forecast — Total Daily Sales (35 SKUs)")
    ax.set_xlabel("Date")
    ax.set_ylabel("Units Sold")
    ax.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "ets_04_aggregated_forecast.png"), dpi=150)
    plt.close()
    print("Plot saved: ets_04_aggregated_forecast.png")




def plot_metrics_summary(df_metrics):
    df_valid = df_metrics[df_metrics["avg_sales_test"] >= 5].copy()
    if df_valid.empty:
        return


    fig, ax = plt.subplots(figsize=(16, 5))
    colors = [
        "steelblue" if v <= 30 else "goldenrod" if v <= 60 else "coral"
        for v in df_valid["mae_relative_%"]
    ]
    ax.bar(
        df_valid["item_id"], df_valid["mae_relative_%"], color=colors, edgecolor="white"
    )


    mean_val = df_valid["mae_relative_%"].mean()
    ax.axhline(
        y=mean_val,
        color="black",
        linestyle="--",
        linewidth=1.2,
        label=f"Average: {mean_val:.1f}%",
    )
    ax.set_title("ETS: Relative MAE by SKU (Avg sales ≥ 5 units/day)")
    ax.set_xlabel("SKU")
    ax.set_ylabel("Relative MAE (%)")
    ax.tick_params(axis="x", rotation=90, labelsize=7)


    legend_elements = [
        Patch(facecolor="steelblue", label="Good (≤30%)"),
        Patch(facecolor="goldenrod", label="Moderate (30-60%)"),
        Patch(facecolor="coral", label="Difficult (>60%)"),
    ]
    ax.legend(
        handles=legend_elements + ax.get_legend_handles_labels()[0],
        loc="upper left",
        fontsize=8,
    )


    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "ets_05_mae_relative_by_sku.png"), dpi=150)
    plt.close()
    print("Plot saved: ets_05_mae_relative_by_sku.png")




def run_ets_baseline(data_path=None, forecast_days=90):
    print("=== Starting Baseline Training (ETS) ===")


    # 1. Load data
    if data_path is None:
        data_path = os.path.join(BASE_DIR, "..", "reference_sales.csv")
    data = load_data(data_path)


    # 2. Define the split
    max_date = data["date"].max()
    cutoff = max_date - pd.Timedelta(days=forecast_days)


    skus = data["item_id"].unique()
    resultados = []
    forecast_dfs = []


    print(f"Cutoff date: {cutoff.date()}")
    print(f"Training {len(skus)} ETS models independently...\n")


    # 3. Independent training loop per SKU
    for sku in skus:
        df_sku = data[data["item_id"] == sku].copy()


        # ETS requires a daily time index without gaps.
        # Group by day (in case of duplicates) and fill days without sales with 0.
        df_sku = df_sku.groupby("date")["units_sold"].sum().reset_index()
        df_sku = df_sku.set_index("date").asfreq("D", fill_value=0).reset_index()


        # Separate Train and Test
        train = df_sku[df_sku["date"] <= cutoff]
        test = df_sku[df_sku["date"] > cutoff]


        if len(train) < 14:  # ETS needs at least 2 seasonal periods (14 days)
            print(f"  ✗ {sku:<20} - Insufficient data to train")
            continue


        try:
            # 4. Train ETS
            # Use weekly seasonality (7) and additive mode (similar to Prophet default)
            model = ExponentialSmoothing(
                train["units_sold"],
                trend="add",
                seasonal="add",
                seasonal_periods=7,
                initialization_method="estimated",
            ).fit()


            # 5. Predict (and avoid negative predictions with clip to 0)
            forecast = model.forecast(forecast_days).clip(lower=0)


            # Store predictions for global aggregated chart
            forecast_dates = pd.date_range(
                start=cutoff + pd.Timedelta(days=1), periods=forecast_days, freq="D"
            )
            df_fcst = pd.DataFrame(
                {"ds": forecast_dates, "yhat": forecast.values, "item_id": sku}
            )
            forecast_dfs.append(df_fcst)


            if len(test) > 0:
                # 6. Evaluate
                pred_aligned = forecast.values[: len(test)]
                real_aligned = test["units_sold"].values


                mae, rmse, mae_rel = evaluate(real_aligned, pred_aligned)
                avg_sales = real_aligned.mean()


                resultados.append(
                    {
                        "item_id": sku,
                        "mae": round(mae, 2),
                        "rmse": round(rmse, 2),
                        "avg_sales_test": round(avg_sales, 2),
                        "mae_relative_%": round(mae_rel, 1),
                    }
                )
                print(f"  ✓ {sku:<20} MAE: {mae:6.2f} | MAE rel: {mae_rel:6.1f}%")
        except Exception as e:
            print(f"  ✗ {sku:<20} - Error: {e}")


    # 7. Final Summary (Applying limiting rule >= 5 units/day)
    df_metrics = pd.DataFrame(resultados)
    if not df_metrics.empty:
        df_valid = df_metrics[df_metrics["avg_sales_test"] >= 5]


        print("\n── Baseline Performance Summary (ETS) ──────────────────────")
        print(f"  SKUs trained:              {len(df_metrics)}")
        print(f"  SKUs with demand >=5/day:  {len(df_valid)}")
        if len(df_valid) > 0:
            print(
                f"  Avg MAE relative:          {df_valid['mae_relative_%'].mean():.1f}%"
            )
            print(
                f"  Good SKUs     (<=30%):     {len(df_valid[df_valid['mae_relative_%'] <= 30])}"
            )
            print(
                f"  Moderate SKUs (30-60%):    {len(df_valid[(df_valid['mae_relative_%'] > 30) & (df_valid['mae_relative_%'] <= 60)])}"
            )
            print(
                f"  Difficult SKUs (>60%):     {len(df_valid[df_valid['mae_relative_%'] > 60])}"
            )
        print("─────────────────────────────────────────────────────────────\n")


        # 8. Generate comparative charts
        print("Generating evidence plots for ETS...")
        if forecast_dfs:
            agg_fcst = (
                pd.concat(forecast_dfs, ignore_index=True)
                .groupby("ds")["yhat"]
                .sum()
                .reset_index()
            )
            real_agg = (
                data.groupby("date")["units_sold"]
                .sum()
                .reset_index()
                .rename(columns={"date": "ds", "units_sold": "y"})
            )
            plot_aggregated_forecast(agg_fcst, real_agg, cutoff)


        plot_metrics_summary(df_metrics)
        print(f"\n✅ Process completed! Check the ml_plots folder for visual results.")




if __name__ == "__main__":
    run_ets_baseline()
