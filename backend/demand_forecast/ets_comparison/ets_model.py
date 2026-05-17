from statsmodels.tsa.holtwinters import ExponentialSmoothing




def train_predict_ets(train_series, forecast_periods):
    """
    Train an ETS model and return the prediction.
    """
    model = ExponentialSmoothing(
        train_series,
        trend="add",
        seasonal="add",
        seasonal_periods=7,
        initialization_method="estimated",
    ).fit()
    return model.forecast(forecast_periods).clip(lower=0).values