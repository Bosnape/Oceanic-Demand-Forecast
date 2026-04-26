"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import {
  Area,
  ComposedChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ReferenceLine,
} from "recharts"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { Brain, TrendingUp, TrendingDown, Minus, Calendar, Package, BarChart3, ChevronRight, Layers, ScanBarcode, HelpCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import {
  getSales,
  getPredictions,
  getPredictionsStatus,
  getModelMetrics,
  type SaleRecord,
  type PredictionRecord,
  type ModelMetricsResponse,
} from "@/lib/api"

// ─── types ────────────────────────────────────────────────────────────────────

type ViewMode = "aggregated" | "by-sku"
type Granularity = "daily" | "weekly"
type PageState = "loading" | "no_data" | "processing" | "ready" | "error"

interface SkuSummaryRow {
  skuId: string
  total90d: number
  total30d: number
  total60d: number
  trend: "up" | "down" | "flat"
  trendPct: string
  peakValue: number
  peakDate: string
}

interface ChartPoint {
  date: string
  actual: number | null
  yhat: number | null
  yhat_lower: number | null
  band: number | null
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getMondayKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01"
}

function formatDateLabel(dateStr: string, granularity: Granularity): string {
  try {
    const date = parseISO(dateStr)
    if (granularity === "daily") return format(date, "d MMM", { locale: es })
    if (granularity === "weekly") return format(date, "d MMM", { locale: es })
    return format(date, "MMM", { locale: es })
  } catch {
    return dateStr
  }
}

function getDayKey(dateStr: string): string {
  return dateStr.slice(0, 10)
}

function buildChartData(
  sales: SaleRecord[],
  predictions: PredictionRecord[],
  granularity: Granularity
): ChartPoint[] {
  const groupKey = granularity === "daily" ? getDayKey : granularity === "weekly" ? getMondayKey : getMonthKey
  const keepPeriods = granularity === "daily" ? 60 : granularity === "weekly" ? 26 : 6

  // Aggregate historical sales by period
  const salesMap = new Map<string, number>()
  for (const s of sales) {
    const key = groupKey(s.date)
    salesMap.set(key, (salesMap.get(key) ?? 0) + s.units_sold)
  }

  // Sort all periods and keep only the last N
  const allPeriods = Array.from(salesMap.entries()).sort(([a], [b]) => a.localeCompare(b))
  const recentPeriods = allPeriods.slice(-keepPeriods)

  // Aggregate forecast by period
  const forecastMap = new Map<string, { sumYhat: number; sumLower: number; sumUpper: number }>()
  for (const p of predictions) {
    const key = groupKey(p.date)
    const existing = forecastMap.get(key) ?? { sumYhat: 0, sumLower: 0, sumUpper: 0 }
    forecastMap.set(key, {
      sumYhat: existing.sumYhat + p.yhat,
      sumLower: existing.sumLower + p.yhat_lower,
      sumUpper: existing.sumUpper + p.yhat_upper,
    })
  }

  const forecastPeriods = Array.from(forecastMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  // Build unified array with pre-formatted labels as the key (so Recharts renders them directly)
  const historical: ChartPoint[] = recentPeriods.map(([date, actual]) => ({
    date: formatDateLabel(date, granularity),
    actual,
    yhat: null,
    yhat_lower: null,
    band: null,
  }))

  const forecast: ChartPoint[] = forecastPeriods.map(([date, v]) => ({
    date: formatDateLabel(date, granularity),
    actual: null,
    yhat: Math.max(0, v.sumYhat),
    yhat_lower: Math.max(0, v.sumLower),
    band: Math.max(0, v.sumUpper - v.sumLower),
  }))

  return [...historical, ...forecast]
}

function computeSkuSummary(
  allSales: SaleRecord[],
  allPredictions: PredictionRecord[],
  skus: string[]
): SkuSummaryRow[] {
  return skus.map((skuId) => {
    const skuSales = allSales.filter((s) => s.item_id === skuId)
    const skuPreds = allPredictions.filter((p) => p.item_id === skuId).sort((a, b) => a.date.localeCompare(b.date))

    const firstDate = skuPreds[0]?.date

    const sliceByDays = (days: number) => firstDate
      ? skuPreds.filter((p) => {
          const diff = (new Date(p.date).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
          return diff < days
        })
      : skuPreds

    const total90d = Math.round(skuPreds.reduce((acc, p) => acc + p.yhat, 0))
    const total30d = Math.round(sliceByDays(30).reduce((acc, p) => acc + p.yhat, 0))
    const total60d = Math.round(sliceByDays(60).reduce((acc, p) => acc + p.yhat, 0))

    // Trend: compare avg daily forecast (next 30d) vs avg daily of last 30 days of historical
    const last30Sales = skuSales
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)
    const avgLast30Historical = last30Sales.length > 0
      ? last30Sales.reduce((acc, s) => acc + s.units_sold, 0) / last30Sales.length
      : 0
    const avgNext30Forecast = sliceByDays(30).length > 0
      ? sliceByDays(30).reduce((acc, p) => acc + p.yhat, 0) / sliceByDays(30).length
      : 0
    const trendRatio = avgLast30Historical > 0 ? (avgNext30Forecast - avgLast30Historical) / avgLast30Historical : 0
    const trend: "up" | "down" | "flat" = trendRatio > 0.02 ? "up" : trendRatio < -0.02 ? "down" : "flat"
    const trendPct = `${trendRatio >= 0 ? "+" : ""}${(trendRatio * 100).toFixed(1)}%`

    const peakPred = skuPreds.reduce((max, p) => (p.yhat > (max?.yhat ?? 0) ? p : max), skuPreds[0])

    return {
      skuId,
      total90d,
      total30d,
      total60d,
      trend,
      trendPct,
      peakValue: peakPred ? Math.round(peakPred.yhat) : 0,
      peakDate: peakPred?.date ?? "",
    }
  })
}

// ─── sub-components ───────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-success" />
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-destructive" />
  return <Minus className="h-4 w-4 text-muted-foreground" />
}


// ─── metrics modal helpers ────────────────────────────────────────────────────

/** Returns color tier for a MAPE value — industry-agnostic thresholds. */
function getMapeQuality(mape: number | null): {
  label: string; textColor: string; bgColor: string; borderColor: string
} {
  if (mape === null) return { label: "Sin datos", textColor: "text-muted-foreground", bgColor: "bg-muted/50", borderColor: "border-border" }
  if (mape < 15)    return { label: "Excelente",           textColor: "text-success",     bgColor: "bg-success/8",     borderColor: "border-success/30" }
  if (mape < 30)    return { label: "Bueno",               textColor: "text-primary",     bgColor: "bg-primary/8",     borderColor: "border-primary/30" }
  if (mape < 50)    return { label: "Moderado",            textColor: "text-warning",     bgColor: "bg-warning/8",     borderColor: "border-warning/30" }
  return                   { label: "Alta incertidumbre",  textColor: "text-destructive", bgColor: "bg-destructive/8", borderColor: "border-destructive/30" }
}

function MetricCard({
  label, value, tooltip, mape,
}: {
  label: string; value: string; tooltip: string; mape?: number | null
}) {
  const q = mape !== undefined ? getMapeQuality(mape) : null
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className={cn(
          "rounded-lg border p-3 text-center cursor-help transition-colors",
          q ? `${q.bgColor} ${q.borderColor}` : "border-border"
        )}>
          <p className="text-[11px] text-muted-foreground mb-1 flex items-center justify-center gap-1">
            {label}
            <HelpCircle className="h-3 w-3 shrink-0" />
          </p>
          <p className={cn("text-lg font-bold", q ? q.textColor : "text-foreground")}>{value}</p>
          {q && mape !== null && (
            <p className={cn("text-[10px] font-medium mt-0.5", q.textColor)}>{q.label}</p>
          )}
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="center" className="w-72 text-xs leading-relaxed p-3">
        {tooltip}
      </HoverCardContent>
    </HoverCard>
  )
}

function ReliabilityBanner({ perSku }: { perSku: ModelMetricsResponse["per_sku"] }) {
  if (perSku.length === 0) return null
  const reliable = perSku.filter((s) => s.mape !== null && s.mape < 30).length
  const total    = perSku.length
  const pct      = Math.round((reliable / total) * 100)
  const isHigh   = pct >= 80
  const isMid    = pct >= 60

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg border px-4 py-3",
      isHigh ? "bg-success/8 border-success/30" : isMid ? "bg-primary/8 border-primary/30" : "bg-warning/8 border-warning/30"
    )}>
      {isHigh
        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />
        : isMid
        ? <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        : <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
      }
      <div className="text-xs">
        <p className={cn("font-semibold", isHigh ? "text-success" : isMid ? "text-primary" : "text-warning")}>
          {isHigh ? "Alta fiabilidad" : isMid ? "Fiabilidad moderada" : "Fiabilidad baja"}
          {" "}— {reliable} de {total} SKUs con MAPE &lt; 30%
        </p>
        <p className="text-muted-foreground mt-0.5">
          {isHigh
            ? "El modelo es confiable para la mayoría de productos. Adecuado para decisiones de inventario y compras."
            : isMid
            ? "Algunos SKUs tienen alta variabilidad. Revisa los productos con MAPE > 30% antes de usarlos en planificación crítica."
            : "Varios SKUs tienen alta incertidumbre. Considera acumular más datos históricos o revisar la estacionalidad del negocio."
          }
        </p>
      </div>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const [pageState, setPageState] = useState<PageState>("loading")
  const [allSales, setAllSales] = useState<SaleRecord[]>([])
  const [allPredictions, setAllPredictions] = useState<PredictionRecord[]>([])
  const [skus, setSkus] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>("aggregated")
  const [selectedSku, setSelectedSku] = useState<string>("")
  const [granularity, setGranularity] = useState<Granularity>("daily")
  const [errorMsg, setErrorMsg] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)

  // Metrics dialog
  const [metricsOpen, setMetricsOpen]       = useState(false)
  const [metricsData, setMetricsData]       = useState<ModelMetricsResponse | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // Re-load when the pipeline completes a new run
  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener("pipeline:dataready", handler)
    return () => window.removeEventListener("pipeline:dataready", handler)
  }, [])

  // Load pipeline status + predictions on mount and after each pipeline completion
  useEffect(() => {
    setPageState("loading")
    getPredictionsStatus()
      .then((status) => {
        if (status.status === "no_data") { setPageState("no_data"); return }
        if (status.status === "processing" || status.status === "uploaded") { setPageState("processing"); return }
        if (status.status === "failed") { setErrorMsg(status.message); setPageState("error"); return }

        return getPredictions().then((preds) => {
          if (preds.length === 0) { setPageState("no_data"); return }
          const uniqueSkus = [...new Set(preds.map((p) => p.item_id))].sort()
          setSkus(uniqueSkus)
          setSelectedSku(uniqueSkus[0])
          setAllPredictions(preds)
          setPageState("ready")
        })
      })
      .catch((err) => {
        setErrorMsg(axios.isAxiosError(err) ? (err.response?.data?.detail ?? err.message) : "Error desconocido")
        setPageState("error")
      })
  }, [refreshKey])

  // Load all sales (no date filter — data is historical, not recent)
  useEffect(() => {
    if (pageState !== "ready" || skus.length === 0) return
    getSales()
      .then(setAllSales)
      .catch(() => setAllSales([]))
  }, [pageState, skus])

  // Fetch metrics lazily when dialog opens (reset on new pipeline run)
  useEffect(() => {
    if (!metricsOpen || metricsData !== null) return
    setMetricsLoading(true)
    getModelMetrics()
      .then(setMetricsData)
      .catch(() => {})
      .finally(() => setMetricsLoading(false))
  }, [metricsOpen, metricsData])

  // Reset cached metrics when a new pipeline run completes
  useEffect(() => {
    const handler = () => setMetricsData(null)
    window.addEventListener("pipeline:dataready", handler)
    return () => window.removeEventListener("pipeline:dataready", handler)
  }, [])

  // Chart data — always show full 90-day forecast
  const chartData = useMemo((): ChartPoint[] => {
    const sales = viewMode === "by-sku"
      ? allSales.filter((s) => s.item_id === selectedSku)
      : allSales
    const preds = viewMode === "by-sku"
      ? allPredictions.filter((p) => p.item_id === selectedSku)
      : allPredictions
    return buildChartData(sales, preds, granularity)
  }, [allSales, allPredictions, viewMode, selectedSku, granularity])

  // SKU summary table
  const skuSummary = useMemo(
    () => computeSkuSummary(allSales, allPredictions, skus),
    [allSales, allPredictions, skus]
  )

  // Stats for the selected view — full 90-day forecast
  const stats = useMemo(() => {
    const preds = viewMode === "by-sku"
      ? allPredictions.filter((p) => p.item_id === selectedSku)
      : allPredictions
    const totalForecast = Math.round(preds.reduce((acc, p) => acc + p.yhat, 0))
    const peak = preds.reduce((max, p) => (p.yhat > (max?.yhat ?? 0) ? p : max), preds[0])
    return {
      totalForecast,
      peakDemandValue: peak ? Math.round(peak.yhat).toLocaleString() : "—",
      peakDemandDate: peak?.date ?? "",
      skusModeled: skus.length,
    }
  }, [allPredictions, viewMode, selectedSku, skus])

  // First forecast point label (used as reference line)
  const forecastStartLabel = chartData.find((d) => d.yhat !== null)?.date ?? null

  const chartTitle = viewMode === "aggregated"
    ? "Todos los SKUs (Agregado)"
    : selectedSku || "Selecciona un SKU"

  const handleRowClick = (skuId: string) => {
    setViewMode("by-sku")
    setSelectedSku(skuId)
  }

  return (
    <DashboardLayout title="Predicciones de Demanda" subtitle="Pronósticos ML con intervalos de confianza por SKU" showLastRunAt>

      {/* Loading */}
      {pageState === "loading" && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3"><Skeleton className="h-10 w-44" /><Skeleton className="h-10 w-36" /></div>
          <div className="grid grid-cols-3 gap-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {/* No data */}
      {pageState === "no_data" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <p className="text-muted-foreground">No hay predicciones disponibles.</p>
          <p className="text-sm text-muted-foreground">
            Ve a{" "}
            <a href="/data-ingestion" className="text-primary underline underline-offset-2">Ingesta de Datos</a>
            {" "}y sube un archivo de ventas para generar el forecast.
          </p>
        </div>
      )}

      {/* Processing */}
      {pageState === "processing" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <p className="font-medium text-foreground">El modelo está generando las predicciones...</p>
          <p className="text-sm text-muted-foreground">Este proceso puede tomar varios minutos. Recarga la página para verificar el estado.</p>
        </div>
      )}

      {/* Error */}
      {pageState === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
          <p className="text-sm font-medium text-destructive">{errorMsg}</p>
        </div>
      )}

      {/* Ready */}
      {pageState === "ready" && (
        <div className="flex flex-col gap-6">

          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <SelectTrigger className="w-44 bg-card text-card-foreground border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aggregated">
                    <div className="flex items-center gap-2"><Layers className="h-4 w-4" /><span>Agregado</span></div>
                  </SelectItem>
                  <SelectItem value="by-sku">
                    <div className="flex items-center gap-2"><ScanBarcode className="h-4 w-4" /><span>Por SKU</span></div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {viewMode === "by-sku" && (
                <Select value={selectedSku} onValueChange={setSelectedSku}>
                  <SelectTrigger className="w-64 bg-card text-card-foreground border-border">
                    <SelectValue placeholder="Seleccionar SKU" />
                  </SelectTrigger>
                  <SelectContent>
                    {skus.map((sku) => (
                      <SelectItem key={sku} value={sku}>{sku}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
                <SelectTrigger className="w-36 bg-card text-card-foreground border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                </SelectContent>
              </Select>

            </div>

            {/* Model metrics dialog */}
            <Dialog open={metricsOpen} onOpenChange={setMetricsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Brain className="h-4 w-4" />
                  Ver métricas del modelo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    Métricas del Modelo Prophet
                  </DialogTitle>
                  <DialogDescription>
                    Rendimiento sobre el período de validación (últimos ~20% de datos históricos)
                  </DialogDescription>
                </DialogHeader>

                {/* Loading skeleton */}
                {metricsLoading && (
                  <div className="flex flex-col gap-4 pt-4">
                    <Skeleton className="h-14 rounded-lg" />
                    <div className="grid grid-cols-5 gap-3">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                    </div>
                    <Skeleton className="h-24 rounded-lg" />
                    <Skeleton className="h-48 rounded-lg" />
                  </div>
                )}

                {/* No metrics yet */}
                {!metricsLoading && !metricsData && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Las métricas se generan automáticamente al completar el entrenamiento del modelo.
                    <br />Sube un archivo de ventas para activarlas.
                  </div>
                )}

                {/* Metrics loaded */}
                {!metricsLoading && metricsData && (
                  <div className="flex flex-col gap-5 pt-4">

                    {/* Reliability banner */}
                    <ReliabilityBanner perSku={metricsData.per_sku} />

                    {/* Aggregate metric cards */}
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Métricas Agregadas</h4>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <MetricCard
                          label="MAE"
                          value={metricsData.aggregate?.mae != null ? metricsData.aggregate.mae.toFixed(2) : "—"}
                          tooltip="Error Absoluto Medio en unidades/día. Si MAE = 5, el modelo se equivoca en promedio 5 unidades por día. No penaliza errores grandes más que pequeños. Útil para comunicar el error al negocio en términos concretos."
                        />
                        <MetricCard
                          label="RMSE"
                          value={metricsData.aggregate?.rmse != null ? metricsData.aggregate.rmse.toFixed(2) : "—"}
                          tooltip="Raíz del Error Cuadrático Medio. Penaliza más los errores grandes. Si RMSE es notablemente mayor que MAE, hay días con errores muy altos — señal de que el modelo falla en picos de demanda."
                        />
                        <MetricCard
                          label="MAPE"
                          value={metricsData.aggregate?.mape != null ? `${metricsData.aggregate.mape.toFixed(1)}%` : "—"}
                          mape={metricsData.aggregate?.mape ?? null}
                          tooltip="Error Porcentual Absoluto Medio. El número más intuitivo: un MAPE del 20% significa que el modelo se equivoca ~20% arriba o abajo. Los umbrales varían por industria: <15% excelente, 15-30% bueno, 30-50% aceptable para productos volátiles o con pocos datos históricos."
                        />
                        <MetricCard
                          label="Cobertura IC"
                          value={metricsData.aggregate?.coverage_ic != null ? `${metricsData.aggregate.coverage_ic.toFixed(1)}%` : "—"}
                          tooltip="Porcentaje de días reales que caen dentro del intervalo de confianza del modelo. Prophet usa un IC del 80% por defecto, por lo que ~80% es el valor esperado. Un valor muy inferior indica que el modelo subestima la incertidumbre."
                        />
                        <MetricCard
                          label="Sesgo"
                          value={metricsData.aggregate?.bias != null
                            ? `${metricsData.aggregate.bias >= 0 ? "+" : ""}${metricsData.aggregate.bias.toFixed(2)}`
                            : "—"}
                          tooltip="Tendencia sistemática del modelo. Valor positivo significa que el modelo sobreestima la demanda en promedio; negativo que la subestima. Un sesgo cercano a 0 es ideal. Un sesgo positivo alto genera exceso de inventario; uno negativo, quiebres de stock."
                        />
                      </div>
                    </div>

                    {/* Training info */}
                    {metricsData.aggregate && (
                      <div>
                        <h4 className="text-sm font-semibold text-foreground mb-3">Información de Entrenamiento</h4>
                        <div className="rounded-lg border border-border bg-muted/20 p-4">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-muted-foreground">Último entrenamiento</p>
                              <p className="font-medium text-foreground">
                                {metricsData.aggregate.last_updated
                                  ? new Date(metricsData.aggregate.last_updated).toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
                                  : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">SKUs modelados</p>
                              <p className="font-medium text-foreground">{metricsData.per_sku.length}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Modo estacionalidad</p>
                              <p className="font-medium text-foreground capitalize">{metricsData.aggregate.seasonality_mode ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Muestras entrenamiento</p>
                              <p className="font-medium text-foreground">{metricsData.aggregate.training_samples?.toLocaleString() ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Muestras validación</p>
                              <p className="font-medium text-foreground">{metricsData.aggregate.validation_samples?.toLocaleString() ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Horizonte forecast</p>
                              <p className="font-medium text-foreground">90 días</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Per-SKU table */}
                    {metricsData.per_sku.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-foreground mb-1">Métricas por SKU</h4>
                        <p className="text-xs text-muted-foreground mb-3">Ordenado de mejor a peor MAPE. Haz hover sobre los encabezados para ver las definiciones.</p>
                        <div className="rounded-md border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-border hover:bg-transparent">
                                <TableHead className="text-muted-foreground">SKU</TableHead>
                                <TableHead className="text-muted-foreground text-right">MAE</TableHead>
                                <TableHead className="text-muted-foreground text-right">RMSE</TableHead>
                                <TableHead className="text-muted-foreground text-right">MAPE</TableHead>
                                <TableHead className="text-muted-foreground text-right hidden sm:table-cell">Cobertura IC</TableHead>
                                <TableHead className="text-muted-foreground text-center">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {metricsData.per_sku.map((sku) => {
                                const q = getMapeQuality(sku.mape)
                                return (
                                  <TableRow key={sku.item_id} className="border-border">
                                    <TableCell className="font-medium text-foreground text-sm">{sku.item_id}</TableCell>
                                    <TableCell className="text-right font-mono text-sm text-foreground">
                                      {sku.mae != null ? sku.mae.toFixed(2) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm text-foreground">
                                      {sku.rmse != null ? sku.rmse.toFixed(2) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <span className={cn("font-mono font-semibold text-sm", q.textColor)}>
                                        {sku.mape != null ? `${sku.mape.toFixed(1)}%` : "—"}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm text-muted-foreground hidden sm:table-cell">
                                      {sku.coverage_ic != null ? `${sku.coverage_ic.toFixed(1)}%` : "—"}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", q.bgColor, q.borderColor, q.textColor, "border")}>
                                        {q.label}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {/* Footnote */}
                    <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
                      ⚠ Estas métricas corresponden al <strong>ajuste sobre el período de validación</strong> (últimos ~20% de datos históricos). Al ser in-sample, pueden ser ligeramente optimistas. Para un análisis más riguroso, ejecuta validación cruzada temporal sobre el dataset completo.
                    </p>

                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-border bg-card">
              <CardContent className="flex items-start justify-between pt-0">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Forecast 90 días</span>
                  <span className="text-2xl font-bold tracking-tight text-card-foreground">
                    {stats.totalForecast.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">unidades proyectadas</span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="flex items-start justify-between pt-0">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Pico de Demanda</span>
                  <span className="text-2xl font-bold tracking-tight text-card-foreground">{stats.peakDemandValue}</span>
                  <span className="text-xs text-muted-foreground">
                    {stats.peakDemandDate ? formatDateLabel(stats.peakDemandDate, granularity) : "—"}
                  </span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                  <Calendar className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="flex items-start justify-between pt-0">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">SKUs Modelados</span>
                  <span className="text-2xl font-bold tracking-tight text-card-foreground">{stats.skusModeled}</span>
                  <span className="text-xs text-muted-foreground">productos con forecast</span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                  <Package className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-card-foreground">
                    {chartTitle} — Ventas Históricas y Pronóstico
                  </CardTitle>
                  <CardDescription className="text-muted-foreground not-italic">
                    {granularity === "daily" ? "Histórico (60 días)" : "Histórico (26 semanas)"}
                    {" + Predicción (90 días) con intervalo de confianza"}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  <Brain className="mr-1.5 h-3 w-3" />
                  Prophet
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(215, 80%, 52%)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(215, 80%, 52%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="confidenceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(0, 0%, 90%)" }}
                      tickLine={false}
                      interval={granularity === "daily" ? 9 : granularity === "weekly" ? 4 : 1}
                    />
                    <YAxis
                      tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(0, 0%, 90%)" }}
                      tickLine={false}
                      width={50}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(0, 0%, 100%)",
                        border: "1px solid hsl(0, 0%, 90%)",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      }}
                      labelStyle={{ color: "hsl(0, 0%, 9%)", fontWeight: 600 }}
                      labelFormatter={(v) => String(v)}
                      formatter={(value, name: string) => {
                        if (value == null || name === "yhat_lower" || name === "band") return [null, null]
                        const labels: Record<string, string> = {
                          actual: "Ventas Reales",
                          yhat: "Predicción",
                        }
                        return [Math.round(Number(value)).toLocaleString(), labels[name] ?? name]
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) => {
                        const labels: Record<string, string> = {
                          actual: "Ventas Reales",
                          yhat: "Predicción",
                        }
                        return labels[value] ?? null
                      }}
                    />
                    {forecastStartLabel && (
                      <ReferenceLine
                        x={forecastStartLabel}
                        stroke="hsl(0, 0%, 60%)"
                        strokeDasharray="5 5"
                        label={{ value: "Inicio forecast", fill: "hsl(0, 0%, 45%)", fontSize: 10, position: "insideTopRight" }}
                      />
                    )}
                    <Area type="monotone" dataKey="actual" name="actual" stroke="hsl(215, 80%, 52%)" fill="url(#actualGrad)" strokeWidth={2} dot={false} connectNulls={false} />
                    <Area type="monotone" dataKey="yhat_lower" stroke="none" fill="none" stackId="confidence" legendType="none" connectNulls={false} />
                    <Area type="monotone" dataKey="band" stroke="none" fill="url(#confidenceGrad)" stackId="confidence" legendType="none" connectNulls={false} />
                    <Area type="monotone" dataKey="yhat" name="yhat" stroke="hsl(142, 71%, 45%)" fill="transparent" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* SKU summary table */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-card-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Resumen de Pronóstico por SKU
                  </CardTitle>
                  <CardDescription className="text-muted-foreground not-italic">
                    Vista consolidada de todos los SKUs con métricas agregadas
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">{skuSummary.length} SKUs</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground font-medium min-w-[160px]">SKU</TableHead>
                      <TableHead className="text-muted-foreground font-medium text-right">Total 90d</TableHead>
                      <TableHead className="text-muted-foreground font-medium text-right">Próx. 30d</TableHead>
                      <TableHead className="text-muted-foreground font-medium text-right">Próx. 60d</TableHead>
                      <TableHead className="text-muted-foreground font-medium text-right">Pico</TableHead>
                      <TableHead className="text-muted-foreground font-medium text-center">Tendencia</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skuSummary.map((row) => (
                      <TableRow
                        key={row.skuId}
                        className={`border-border cursor-pointer hover:bg-muted/50 transition-colors ${
                          viewMode === "by-sku" && selectedSku === row.skuId ? "bg-primary/5" : ""
                        }`}
                        onClick={() => handleRowClick(row.skuId)}
                      >
                        <TableCell className="font-medium text-card-foreground">{row.skuId}</TableCell>
                        <TableCell className="text-right text-primary font-medium">{row.total90d.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-card-foreground">{row.total30d.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-card-foreground">{row.total60d.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium text-card-foreground">{row.peakValue.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">{row.peakDate ? formatDateLabel(row.peakDate, granularity) : "—"}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <TrendIcon trend={row.trend} />
                            <span className={`text-xs ${row.trend === "up" ? "text-success" : row.trend === "down" ? "text-destructive" : "text-muted-foreground"}`}>
                              {row.trendPct}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Haz clic en una fila para ver el detalle del SKU en el gráfico
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  )
}
