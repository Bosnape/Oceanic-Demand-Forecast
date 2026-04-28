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
PLOTS_DIR = os.path.join(BASE_DIR, "..", "ml_plots")
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

    # Contexto: últimos 180 días de entrenamiento
    train_ctx = real_train[
        real_train["ds"] >= real_train["ds"].max() - pd.Timedelta(days=180)
    ]

    fig, ax = plt.subplots(figsize=(16, 5))
    ax.plot(
        train_ctx["ds"],
        train_ctx["y"],
        color="steelblue",
        linewidth=0.9,
        label="Histórico",
        alpha=0.7,
    )
    ax.plot(
        real_test["ds"],
        real_test["y"],
        color="coral",
        linewidth=0.9,
        label="Real (Test)",
        alpha=0.9,
    )
    ax.plot(
        agg_fcst["ds"],
        agg_fcst["yhat"],
        color="green",
        linewidth=1.5,
        linestyle="--",
        label="Predicción ETS",
    )

    ax.set_title("ETS: Predicción Agregada — Ventas Diarias Totales (35 SKUs)")
    ax.set_xlabel("Fecha")
    ax.set_ylabel("Unidades Vendidas")
    ax.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "ets_04_aggregated_forecast.png"), dpi=150)
    plt.close()
    print("Plot guardado: ets_04_aggregated_forecast.png")


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
        label=f"Promedio: {mean_val:.1f}%",
    )
    ax.set_title("ETS: MAE Relativo por SKU (Promedio ≥ 5 ventas/día)")
    ax.set_xlabel("SKU")
    ax.set_ylabel("MAE Relativo (%)")
    ax.tick_params(axis="x", rotation=90, labelsize=7)

    legend_elements = [
        Patch(facecolor="steelblue", label="Bueno (≤30%)"),
        Patch(facecolor="goldenrod", label="Moderado (30-60%)"),
        Patch(facecolor="coral", label="Difícil (>60%)"),
    ]
    ax.legend(
        handles=legend_elements + ax.get_legend_handles_labels()[0],
        loc="upper left",
        fontsize=8,
    )

    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "ets_05_mae_relative_by_sku.png"), dpi=150)
    plt.close()
    print("Plot guardado: ets_05_mae_relative_by_sku.png")


def run_ets_baseline(data_path=None, forecast_days=90):
    print("=== Iniciando Entrenamiento de Baseline (ETS) ===")

    # 1. Cargar datos
    if data_path is None:
        data_path = os.path.join(BASE_DIR, "..", "reference_sales.csv")
    data = load_data(data_path)

    # 2. Definir el corte (Split)
    max_date = data["date"].max()
    cutoff = max_date - pd.Timedelta(days=forecast_days)

    skus = data["item_id"].unique()
    resultados = []
    forecast_dfs = []

    print(f"Fecha de corte (Cutoff): {cutoff.date()}")
    print(f"Entrenando {len(skus)} modelos ETS independientemente...\n")

    # 3. Loop de entrenamiento independiente por SKU
    for sku in skus:
        df_sku = data[data["item_id"] == sku].copy()

        # ETS requiere un índice de tiempo diario sin huecos.
        # Agrupamos por día (por si hay duplicados) y rellenamos días sin venta con 0.
        df_sku = df_sku.groupby("date")["units_sold"].sum().reset_index()
        df_sku = df_sku.set_index("date").asfreq("D", fill_value=0).reset_index()

        # Separar Train y Test
        train = df_sku[df_sku["date"] <= cutoff]
        test = df_sku[df_sku["date"] > cutoff]

        if len(train) < 14:  # ETS necesita al menos 2 periodos estacionales (14 días)
            print(f"  ✗ {sku:<20} - Datos insuficientes para entrenar")
            continue

        try:
            # 4. Entrenar ETS
            # Usamos estacionalidad semanal (7) y modo aditivo (similar al default de Prophet)
            model = ExponentialSmoothing(
                train["units_sold"],
                trend="add",
                seasonal="add",
                seasonal_periods=7,
                initialization_method="estimated",
            ).fit()

            # 5. Predecir (y evitar predicciones negativas con un clip a 0)
            forecast = model.forecast(forecast_days).clip(lower=0)

            # Almacenar predicciones para la gráfica agregada global
            forecast_dates = pd.date_range(
                start=cutoff + pd.Timedelta(days=1), periods=forecast_days, freq="D"
            )
            df_fcst = pd.DataFrame(
                {"ds": forecast_dates, "yhat": forecast.values, "item_id": sku}
            )
            forecast_dfs.append(df_fcst)

            if len(test) > 0:
                # 6. Evaluar
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

    # 7. Resumen Final (Aplicando regla limitante >= 5 unidades/día)
    df_metrics = pd.DataFrame(resultados)
    if not df_metrics.empty:
        df_valid = df_metrics[df_metrics["avg_sales_test"] >= 5]

        print("\n── Resumen de Desempeño Baseline (ETS) ──────────────────────")
        print(f"  SKUs entrenados:           {len(df_metrics)}")
        print(f"  SKUs con demanda >=5/día:  {len(df_valid)}")
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

        # 8. Generar las gráficas comparativas
        print("Generando plots de evidencia para ETS...")
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
        print(
            f"\n✅ ¡Proceso completado! Revisa la carpeta ml_plots para ver los resultados visuales."
        )


if __name__ == "__main__":
    run_ets_baseline()
