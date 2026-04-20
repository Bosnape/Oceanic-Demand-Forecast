import axios from "axios"

const api = axios.create({
  baseURL: "http://52.205.157.189:8000",
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
  reorder_point?: number
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

export default api
