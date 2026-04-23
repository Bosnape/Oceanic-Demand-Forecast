"use client"

import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown, DollarSign, Package, BarChart2, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { getSales, getSalesRange, getInventory, getPredictionsStatus, getInventoryAlerts } from "@/lib/api"
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns"

interface KpiCardProps {
  title: string
  value: string
  change: string
  changeType: "positive" | "negative" | "neutral"
  icon: "revenue" | "inventory" | "forecasted" | "alerts"
  loading?: boolean
}

const iconMap = {
  revenue: DollarSign,
  inventory: Package,
  forecasted: BarChart2,
  alerts: AlertTriangle,
}

const iconBgMap = {
  revenue: "bg-chart-1/10 text-chart-1",
  inventory: "bg-chart-2/10 text-chart-2",
  forecasted: "bg-chart-3/10 text-chart-3",
  alerts: "bg-destructive/10 text-destructive",
}

export function KpiCard({ title, value, change, changeType, icon, loading }: KpiCardProps) {
  const Icon = iconMap[icon]

  if (loading) {
    return (
      <Card className="bg-card">
        <CardContent className="flex items-start justify-between pt-0">
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card">
      <CardContent className="flex items-start justify-between pt-0">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <span className="text-2xl font-bold tracking-tight text-card-foreground">{value}</span>
          <div className="flex items-center gap-1">
            {changeType === "positive" ? (
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            ) : changeType === "negative" ? (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            ) : null}
            <span
              className={cn(
                "text-xs font-medium",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground",
              )}
            >
              {change}
            </span>
          </div>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBgMap[icon])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function formatRevenue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatPct(current: number, prev: number): { label: string; type: "positive" | "negative" | "neutral" } {
  if (prev === 0) return { label: "Sin datos previos", type: "neutral" }
  const pct = ((current - prev) / prev) * 100
  const sign = pct >= 0 ? "+" : ""
  return {
    label: `${sign}${pct.toFixed(1)}% vs mes anterior`,
    type: pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral",
  }
}

export function KpiCardsGrid() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<KpiCardProps[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener("pipeline:dataready", handler)
    // sales_transaction is persisted immediately on upload — no need to wait for Prophet
    window.addEventListener("pipeline:refetch", handler)
    return () => {
      window.removeEventListener("pipeline:dataready", handler)
      window.removeEventListener("pipeline:refetch", handler)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    async function load() {
      try {
        // Use the latest available date in the dataset as "now"
        const rangeRes = await getSalesRange().catch(() => null)
        const anchor = rangeRes ? parseISO(rangeRes.max_date) : new Date()

        const thisMonthStart = format(startOfMonth(anchor), "yyyy-MM-dd")
        const thisMonthEnd = format(endOfMonth(anchor), "yyyy-MM-dd")
        const prevMonthStart = format(startOfMonth(subMonths(anchor, 1)), "yyyy-MM-dd")
        const prevMonthEnd = format(endOfMonth(subMonths(anchor, 1)), "yyyy-MM-dd")

        const [salesThis, salesPrev, inventoryRes, statusRes, alertsRes] = await Promise.all([
        getSales({ date_from: thisMonthStart, date_to: thisMonthEnd }),
        getSales({ date_from: prevMonthStart, date_to: prevMonthEnd }),
        getInventory(),
        getPredictionsStatus(),
        getInventoryAlerts().catch(() => ({ alerts: [] })),
      ])

        // Ventas del mes (revenue = units_sold * sell_price)
        const revenueThis = salesThis.reduce((s, r) => s + r.units_sold * (r.sell_price ?? 0), 0)
        const revenuePrev = salesPrev.reduce((s, r) => s + r.units_sold * (r.sell_price ?? 0), 0)
        const revChange = formatPct(revenueThis, revenuePrev)

        // Unidades en stock
        const items = inventoryRes.items
        const totalStock = items.reduce((s, i) => s + i.current_stock, 0)

        // Alertas: only count known actionable statuses (not "TBD" which is Sprint 2 placeholder)
        const alertCount = alertsRes.alerts.length
        const criticalCount = alertsRes.alerts.filter((a) => a.stock_status === "critical").length
        const allTbd = false

        // SKUs with predictions available
        const forecastedSkus = statusRes.status === "ready" ? items.length : 0

        setKpis([
          {
            title: "Ventas del Mes",
            value: revenueThis > 0 ? formatRevenue(revenueThis) : "Sin datos",
            change: revenueThis > 0 ? revChange.label : "Sube un archivo de ventas",
            changeType: revenueThis > 0 ? revChange.type : "neutral",
            icon: "revenue",
          },
          {
            title: "Unidades en Stock",
            value: items.length > 0 ? totalStock.toLocaleString() : "Sin datos",
            change: items.length > 0 ? `${items.length} SKUs en inventario` : "Sube un archivo de inventario",
            changeType: "neutral",
            icon: "inventory",
          },
          {
            title: "SKUs Pronosticados",
            value: statusRes.status === "ready" ? forecastedSkus.toString() : "—",
            change:
              statusRes.status === "ready"
                ? "Predicciones disponibles"
                : statusRes.status === "processing" || statusRes.status === "uploaded"
                  ? "Generando predicciones..."
                  : "Sin predicciones aún",
            changeType: statusRes.status === "ready" ? "positive" : "neutral",
            icon: "forecasted",
          },
          {
            title: "Alertas Activas",
            value: allTbd ? "—" : alertCount.toString(),
            change: allTbd
              ? "Disponible en Sprint 2"
              : criticalCount > 0
                ? `${criticalCount} críticas pendientes`
                : alertCount > 0
                  ? "Sin alertas críticas"
                  : "Inventario en buen estado",
            changeType: allTbd ? "neutral" : criticalCount > 0 ? "negative" : "positive",
            icon: "alerts",
          },
        ])
      } catch {
        // On error, show neutral placeholders
        setKpis([
          { title: "Ventas del Mes", value: "—", change: "Error al cargar datos", changeType: "neutral", icon: "revenue" },
          { title: "Unidades en Stock", value: "—", change: "Error al cargar datos", changeType: "neutral", icon: "inventory" },
          { title: "SKUs Pronosticados", value: "—", change: "Error al cargar datos", changeType: "neutral", icon: "forecasted" },
          { title: "Alertas Activas", value: "—", change: "Error al cargar datos", changeType: "neutral", icon: "alerts" },
        ])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [refreshKey])

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading
        ? Array.from({ length: 4 }).map((_, i) => (
            <KpiCard
              key={i}
              title=""
              value=""
              change=""
              changeType="neutral"
              icon={["revenue", "inventory", "forecasted", "alerts"][i] as KpiCardProps["icon"]}
              loading
            />
          ))
        : kpis.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
    </div>
  )
}
