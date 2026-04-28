import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import warnings
import os
import sys
from sklearn.metrics import mean_absolute_error
from prophet import Prophet
import logging

# Agregar la ruta actual para poder importar desde la carpeta ets
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from ets.ets_model import train_predict_ets

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


def run_comparison(data_path="reference_sales.csv", forecast_days=90):
    print("=== Iniciando Competencia: ETS Baseline vs Prophet ===")

    # Usar carpeta ml_plots existente
    base_dir = os.path.dirname(os.path.abspath(__file__))
    plot_dir = os.path.join(base_dir, "ml_plots")
    os.makedirs(plot_dir, exist_ok=True)

    data = load_data(os.path.join(base_dir, data_path))

    # Preparar festivos para Prophet basándose en tu regla (+- 1 día ventana)
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

    print(
        f"Evaluando ambos modelos sobre los últimos {forecast_days} días de prueba...\n"
    )

    for sku in skus:
        df_sku = data[data["item_id"] == sku].copy()

        # Preparar y rellenar huecos para que ambos modelos compitan justamente
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
            continue  # Regla limitante: ignorar demanda muy baja

        try:
            # --- ENTRENAR ETS ---
            # Ahora llamamos a la lógica guardada en la carpeta ETS
            pred_ets = train_predict_ets(train["units_sold"], len(test))
            mae_rel_ets = evaluate_mae_rel(real, pred_ets)

            # --- ENTRENAR PROPHET ---
            train_p = train.rename(columns={"date": "ds", "units_sold": "y"})
            test_p = test.rename(columns={"date": "ds", "units_sold": "y"})

            # Misma regla justa: ¿Cambió el precio en la historia?
            use_price = train_p["sell_price"].nunique() > 1

            model_prophet = Prophet(
                holidays=holidays, seasonality_mode="multiplicative"
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

    # --- GENERAR EVIDENCIA VISUAL ---
    df_res = pd.DataFrame(resultados)
    if df_res.empty:
        return

    # 1. Guardar CSV
    csv_path = os.path.join(plot_dir, "comparacion_metricas.csv")
    df_res.to_csv(csv_path, index=False)

    # 2. Generar Gráfica PNG
    plt.figure(figsize=(15, 7))
    x = np.arange(len(df_res))
    width = 0.35

    plt.bar(
        x - width / 2,
        df_res["MAE_Rel_ETS"],
        width,
        label="ETS Baseline (Sin Precio)",
        color="#E24A33",
    )
    plt.bar(
        x + width / 2,
        df_res["MAE_Rel_Prophet"],
        width,
        label="Prophet (Con Precio y Eventos)",
        color="#348ABD",
    )

    plt.ylabel("Error Relativo (MAE %)", fontsize=12)
    plt.title(
        "Comparación de Error: ETS vs Prophet (MENOR ES MEJOR)", fontsize=14, pad=20
    )
    plt.xticks(x, df_res["SKU"], rotation=45, ha="right", fontsize=9)
    plt.legend(fontsize=12)
    plt.grid(axis="y", linestyle="--", alpha=0.7)

    plt.tight_layout()
    plot_path = os.path.join(plot_dir, "comparacion_modelos.png")
    plt.savefig(plot_path, dpi=300)
    print(f"\n✅ ¡Evidencia guardada!\nGráfica: {plot_path}\nCSV: {csv_path}")


if __name__ == "__main__":
    run_comparison()
