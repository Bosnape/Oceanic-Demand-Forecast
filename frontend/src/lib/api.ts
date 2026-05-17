import axios from "axios"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
})

export interface UploadResponse {
  filename: string
  rows_saved: number
  company_id: number
  data_source_id?: number
  status?: string
  message?: string
  columns: string[]
  preview: Record<string, unknown>[]
  validation: {
    warnings: string[]
    issues_preview: string[]
    issues_count: number
  }
  skus?: string[]
}

export function uploadSalesFile(
  file: File,
  onProgress: (percent: number) => void
): Promise<UploadResponse> {
  const form = new FormData()
  form.append("file", file)
  return api
    .post<UploadResponse>("/upload-sales", form, {
      onUploadProgress: (e) => {
        if (e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then((r) => r.data)
}

export function uploadInventoryFile(
  file: File,
  onProgress: (percent: number) => void
): Promise<UploadResponse> {
  const form = new FormData()
  form.append("file", file)
  return api
    .post<UploadResponse>("/upload-inventory", form, {
      onUploadProgress: (e) => {
        if (e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
    .then((r) => r.data)
}

export interface InventoryItem {
  item_id: string
  store_id: string | null
  current_stock: number
  available_stock: number
  lead_time_days: number
  unit_cost: number
  next_month_forecast: number
  stock_status: string
  last_updated: string
  reorder_point: number | null
  slow_moving_flag: boolean | null
  immobilized_capital: number | null
  days_of_stock: number | null
}

export interface InventoryResponse {
  items: InventoryItem[]
}

export function getInventory(): Promise<InventoryResponse> {
  return api.get<InventoryResponse>("/api/inventory").then((r) => r.data)
}

export interface SaleRecord {
  item_id: string
  store_id: string | null
  cat_id: string | null
  dept_id: string | null
  date: string
  units_sold: number
  sell_price: number | null
}

export interface PredictionRecord {
  item_id: string
  date: string
  yhat: number
  yhat_lower: number
  yhat_upper: number
}

export interface PredictionsStatus {
  status: "no_data" | "uploaded" | "processing" | "ready" | "failed"
  message: string
  filename?: string
  upload_date?: string
  last_run_at?: string
}

export interface SalesRange {
  min_date: string
  max_date: string
}

export function getSalesRange(): Promise<SalesRange> {
  return api.get<SalesRange>("/api/sales/range").then((r) => r.data)
}

export function getSales(params?: {
  item_id?: string
  date_from?: string
  date_to?: string
}): Promise<SaleRecord[]> {
  return api.get<SaleRecord[]>("/api/sales", { params }).then((r) => r.data)
}

export function getPredictions(params?: {
  item_id?: string
  date_from?: string
  date_to?: string
}): Promise<PredictionRecord[]> {
  return api.get<PredictionRecord[]>("/api/predictions", { params }).then((r) => r.data)
}

export function getPredictionsStatus(): Promise<PredictionsStatus> {
  return api.get<PredictionsStatus>("/api/predictions/status").then((r) => r.data)
}

export interface StockoutAlert {
  item_id: string
  store_id: string | null
  current_stock: number
  lead_time_days: number
  avg_daily_demand: number
  demand_during_lead_time: number
  days_of_stock: number
  stockout_date: string | null
  stock_status: "critical" | "low"
  units_to_order: number
}

export type AlertMode = "forecast" | "historical" | "no_data"

export interface AlertsResponse {
  alerts: StockoutAlert[]
  alert_mode: AlertMode
  message: string
}

export function getInventoryAlerts(): Promise<AlertsResponse> {
  return api.get<AlertsResponse>("/api/inventory/alerts").then((r) => r.data)
}

// ---------------------------------------------------------------------------
// Model accuracy metrics
// ---------------------------------------------------------------------------

export interface SkuMetrics {
  item_id: string
  mae: number | null
  rmse: number | null
  mape: number | null
  coverage_ic: number | null
  bias: number | null
  training_samples: number | null
  validation_samples: number | null
  seasonality_mode: string | null
  last_updated: string | null
}

export interface AggregateMetrics {
  item_id: null
  mae: number | null
  rmse: number | null
  mape: number | null
  coverage_ic: number | null
  bias: number | null
  training_samples: number | null
  validation_samples: number | null
  seasonality_mode: string | null
  last_updated: string | null
}

export interface ModelMetricsResponse {
  aggregate: AggregateMetrics | null
  per_sku: SkuMetrics[]
}

export function getModelMetrics(): Promise<ModelMetricsResponse> {
  return api.get<ModelMetricsResponse>("/api/predictions/metrics").then((r) => r.data)
}

// ---------------------------------------------------------------------------
// Demand deviation alerts
// ---------------------------------------------------------------------------

export interface DemandAlert {
  item_id: string
  historical_avg: number
  forecast_avg: number
  deviation_pct: number
  direction: "surge" | "drop"
  severity: "warning" | "critical"
}

export interface DemandAlertsResponse {
  alerts: DemandAlert[]
  message: string
}

export function getDemandAlerts(): Promise<DemandAlertsResponse> {
  return api.get<DemandAlertsResponse>("/api/demand-alerts").then((r) => r.data)
}

export default api
