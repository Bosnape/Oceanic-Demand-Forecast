import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import warnings
import os
import sys
from sklearn.metrics import mean_absolute_error
from prophet import Prophet
import logging


# Add parent directory to path to import prophet_demand_forecast
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)


from ets_model import train_predict_ets
from prophet_demand_forecast import hyperparameter_tuning


# Silenciar logs molestos
warnings.filterwarnings("ignore")
logging.getLogger("cmdstanpy").setLevel(logging.ERROR)




def load_data(filepath):
    data = pd.read_csv(filepath, parse_dates=["date"])
    data = data.sort_values(["item_id", "date"]).reset_index(drop=True)
    return data




def evaluate_mae_rel(real, pred):
    mae = mean_absolute_error(real, pred)
    return (mae / real.mean() * 100) if real.mean() != 0 else 0




def run_comparison(data_path="../reference_sales.csv", forecast_days=90):
    print("=== Starting Competition: ETS Baseline vs Prophet ===")


    # Use new folder structure: plots/
    base_dir = os.path.dirname(os.path.abspath(__file__))
    plot_dir = os.path.join(base_dir, "plots")
    os.makedirs(plot_dir, exist_ok=True)


    data = load_data(os.path.join(base_dir, data_path))


    # Prepare holidays for Prophet based on your rule (+- 1 day window)
    holidays_data = data.dropna(subset=["event_name_1"])
    holidays = pd.DataFrame(
        {
            "holiday": holidays_data["event_name_1"],
            "ds": holidays_data["date"],
            "lower_window": -1,
            "upper_window": 1,
        }
    ).drop_duplicates()


    max_date = data["date"].max()
    cutoff = max_date - pd.Timedelta(days=forecast_days)
    skus = data["item_id"].unique()
    resultados = []
    ets_forecasts = []


    print(f"Evaluating both models on the last {forecast_days} days of test data...\n")


    for sku in skus:
        df_sku = data[data["item_id"] == sku].copy()


        # Prepare and fill gaps so both models compete fairly
        df_sku = (
            df_sku.groupby("date")
            .agg({"units_sold": "sum", "sell_price": "mean"})
            .reset_index()
        )
        df_sku = df_sku.set_index("date").asfreq("D").reset_index()
        df_sku["units_sold"] = df_sku["units_sold"].fillna(0)
        df_sku["sell_price"] = df_sku["sell_price"].ffill().bfill()


        train = df_sku[df_sku["date"] <= cutoff]
        test = df_sku[df_sku["date"] > cutoff]


        if len(train) < 14 or len(test) == 0:
            continue


        real = test["units_sold"].values
        if real.mean() < 5:
            continue  # Limiting rule: ignore very low demand


        try:
            # --- TRAIN ETS ---
            # Now we call the logic saved in the ETS folder
            pred_ets = train_predict_ets(train["units_sold"], len(test))
            mae_rel_ets = evaluate_mae_rel(real, pred_ets)


            # Save ETS predictions for aggregated plot
            df_fcst = pd.DataFrame(
                {"ds": test["date"].values, "yhat": pred_ets, "item_id": sku}
            )
            ets_forecasts.append(df_fcst)


            # --- TRAIN PROPHET ---
            train_p = train.rename(columns={"date": "ds", "units_sold": "y"})
            test_p = test.rename(columns={"date": "ds", "units_sold": "y"})


            # Same fair rule: Did the price change in history?
            use_price = train_p["sell_price"].nunique() > 1


            # --- CORRECTION: Hyperparameter optimization ---
            best_params = hyperparameter_tuning(train_p, holidays)


            model_prophet = Prophet(
                holidays=holidays,
                seasonality_mode=best_params["seasonality_mode"],
                changepoint_prior_scale=best_params["changepoint_prior_scale"],
                seasonality_prior_scale=best_params["seasonality_prior_scale"],
            )
            if use_price:
                model_prophet.add_regressor("sell_price")
            model_prophet.fit(train_p)


            cols_to_predict = ["ds", "sell_price"] if use_price else ["ds"]
            forecast_p = model_prophet.predict(test_p[cols_to_predict])
            pred_prophet = forecast_p["yhat"].clip(lower=0).values


            mae_rel_prophet = evaluate_mae_rel(real, pred_prophet)


            resultados.append(
                {
                    "SKU": sku,
                    "MAE_Rel_ETS": mae_rel_ets,
                    "MAE_Rel_Prophet": mae_rel_prophet,
                }
            )
            print(
                f" ✓ {sku:<20} ETS: {mae_rel_ets:5.1f}% | Prophet: {mae_rel_prophet:5.1f}%"
            )


        except Exception as e:
            pass


    # --- GENERATE VISUAL EVIDENCE ---
    df_res = pd.DataFrame(resultados)
    if df_res.empty:
        return


    # 1. Save CSV
    csv_path = os.path.join(plot_dir, "compare_metrics.csv")
    df_res.to_csv(csv_path, index=False)


    # 2. Generate PNG Chart
    plt.figure(figsize=(15, 7))
    x = np.arange(len(df_res))
    width = 0.35


    plt.bar(
        x - width / 2,
        df_res["MAE_Rel_ETS"],
        width,
        label="ETS Baseline (No Price)",
        color="#E24A33",
    )
    plt.bar(
        x + width / 2,
        df_res["MAE_Rel_Prophet"],
        width,
        label="Prophet (With Price and Events)",
        color="#348ABD",
    )


    plt.ylabel("Relative Error (MAE %)", fontsize=12)
    plt.title("Error Comparison: ETS vs Prophet (LOWER IS BETTER)", fontsize=14, pad=20)
    plt.xticks(x, df_res["SKU"], rotation=45, ha="right", fontsize=9)
    plt.legend(fontsize=12)
    plt.grid(axis="y", linestyle="--", alpha=0.7)


    plt.tight_layout()
    plot_path = os.path.join(plot_dir, "compare_models.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()


    # --- 3. Generate Chart: ETS Aggregated Forecast ---
    if ets_forecasts:
        real_agg = (
            data.groupby("date")["units_sold"]
            .sum()
            .reset_index()
            .rename(columns={"date": "ds", "units_sold": "y"})
        )
        agg_fcst = (
            pd.concat(ets_forecasts, ignore_index=True)
            .groupby("ds")["yhat"]
            .sum()
            .reset_index()
        )


        real_train = real_agg[real_agg["ds"] <= cutoff]
        real_test = real_agg[real_agg["ds"] > cutoff]
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


        ax.set_title("ETS: Aggregated Forecast — Total Daily Sales")
        ax.set_xlabel("Date")
        ax.set_ylabel("Units Sold")
        ax.legend()
        plt.tight_layout()
        agg_plot_path = os.path.join(plot_dir, "ets_04_aggregated_forecast.png")
        plt.savefig(agg_plot_path, dpi=300)
        plt.close()


    # --- 4. Generate Chart: ETS Relative MAE by SKU ---
    fig, ax = plt.subplots(figsize=(16, 5))
    df_res_sorted = df_res.sort_values("MAE_Rel_ETS").reset_index(drop=True)
    colors = [
        "steelblue" if v <= 30 else "goldenrod" if v <= 60 else "coral"
        for v in df_res_sorted["MAE_Rel_ETS"]
    ]
    ax.bar(
        df_res_sorted["SKU"],
        df_res_sorted["MAE_Rel_ETS"],
        color=colors,
        edgecolor="white",
    )


    mean_val = df_res_sorted["MAE_Rel_ETS"].mean()
    ax.axhline(
        y=mean_val,
        color="black",
        linestyle="--",
        linewidth=1.2,
        label=f"Average: {mean_val:.1f}%",
    )


    ax.set_title("ETS: Relative MAE by SKU")
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
    mae_plot_path = os.path.join(plot_dir, "ets_05_mae_relative_by_sku.png")
    plt.savefig(mae_plot_path, dpi=300)
    plt.close()


    print(f"\n✅ Evidence saved in {plot_dir}!")
    print(
        f"- compare_metrics.csv\n- compare_models.png\n- ets_04_aggregated_forecast.png\n- ets_05_mae_relative_by_sku.png"
    )




if __name__ == "__main__":
    run_comparison()
