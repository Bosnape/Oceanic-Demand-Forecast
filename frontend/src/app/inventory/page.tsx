"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { DashboardLayout } from "@/components/dashboard-layout"
import { InventoryTable } from "@/components/tables/InventoryTable"
import { Skeleton } from "@/components/ui/skeleton"
import { getInventory, getInventoryAlerts, type InventoryItem, type StockoutAlert, type AlertMode } from "@/lib/api"
import { PackageX, ShoppingCart, TrendingDown, DollarSign, BarChart2, Table2 } from "lucide-react"
import { InventoryProjectionGrid } from "@/components/charts/InventoryProjectionGrid"
import { StockProjectionChart } from "@/components/charts/StockProjectionChart"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getPredictions, type PredictionRecord, type InventoryItem } from "@/lib/api"

type LoadState = "loading" | "ready" | "empty" | "error"
type ViewMode  = "table" | "projection"

export default function InventoryPage() {
  const [items, setItems]         = useState<InventoryItem[]>([])
  const [alerts, setAlerts]       = useState<StockoutAlert[]>([])
  const [alertMode, setAlertMode] = useState<AlertMode>("no_data")
  const [state, setState]         = useState<LoadState>("loading")
  const [errorMsg, setErrorMsg]   = useState("")
  const [viewMode, setViewMode]             = useState<ViewMode>("table")
  const [allPredictions, setAllPredictions] = useState<PredictionRecord[]>([])
  const [predsLoading, setPredsLoading]     = useState(false)
  const [expandedItem, setExpandedItem]     = useState<InventoryItem | null>(null)

  // Predicciones del SKU expandido — sacadas de allPredictions sin nueva llamada
  const expandedPreds = expandedItem
    ? allPredictions.filter((p) => p.item_id === expandedItem.item_id).slice(0, 30)
    : []

  useEffect(() => {
    if (viewMode === "projection" && allPredictions.length === 0) {
      setPredsLoading(true)
      getPredictions()
        .then(setAllPredictions)
        .catch(() => setAllPredictions([]))
        .finally(() => setPredsLoading(false))
    }
  }, [viewMode])

  useEffect(() => {
    Promise.all([
      getInventory(),
      getInventoryAlerts().catch(() => ({ alerts: [], alert_mode: "no_data" as AlertMode, message: "" })),
    ])
      .then(([invData, alertData]) => {
        setItems(invData.items)
        setAlerts(alertData.alerts)
        setAlertMode(alertData.alert_mode)
        setState(invData.items.length === 0 ? "empty" : "ready")
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setState("empty")
        } else {
          setErrorMsg(
            axios.isAxiosError(err)
              ? (err.response?.data?.detail ?? err.message)
              : "Error desconocido"
          )
          setState("error")
        }
      })
  }, [])

  const totalStock = items.reduce((acc, i) => acc + i.current_stock, 0)

  const belowReorderCount = items.filter(
    (i) => i.reorder_point != null && i.current_stock <= i.reorder_point
  ).length

  const slowMovingCount = items.filter((i) => i.slow_moving_flag === true).length

  const totalImmobilized = items.reduce(
    (acc, i) => acc + (i.immobilized_capital ?? 0),
    0
  )

  return (
    <DashboardLayout
      title="Inventario"
      subtitle={
        state === "ready" ? `${items.length} SKUs cargados`
        : state === "loading" ? "Cargando datos..."
        : state === "empty" ? "Sin datos — sube un archivo de inventario primero"
        : "Error al cargar datos"
      }
    >
      {/* Stat cards */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {state === "loading" ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total en Stock"
              value={state === "ready" ? totalStock.toLocaleString() : "-"}
              sub="unidades en inventario"
              icon={<ShoppingCart className="h-5 w-5" />}
              iconColor="text-primary"
              iconBg="bg-primary/10"
            />
            <StatCard
              label="Por Reordenar"
              value={state === "ready" ? String(belowReorderCount) : "-"}
              sub="SKUs bajo punto de reorden"
              icon={<PackageX className="h-5 w-5" />}
              iconColor={belowReorderCount > 0 ? "text-destructive" : "text-muted-foreground"}
              iconBg={belowReorderCount > 0 ? "bg-destructive/10" : "bg-muted"}
              highlight={belowReorderCount > 0 ? "destructive" : undefined}
            />
            <StatCard
              label="Movimiento Lento"
              value={state === "ready" ? String(slowMovingCount) : "-"}
              sub="SKUs de movimiento lento"
              icon={<TrendingDown className="h-5 w-5" />}
              iconColor={slowMovingCount > 0 ? "text-warning" : "text-muted-foreground"}
              iconBg={slowMovingCount > 0 ? "bg-warning/10" : "bg-muted"}
              highlight={slowMovingCount > 0 ? "warning" : undefined}
            />
            <StatCard
              label="Capital Inmovilizado"
              value={
                state === "ready"
                  ? totalImmobilized > 0
                    ? `$${totalImmobilized.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    : "$0"
                  : "-"
              }
              sub="en inventario sin rotación"
              icon={<DollarSign className="h-5 w-5" />}
              iconColor={totalImmobilized > 0 ? "text-violet-500" : "text-muted-foreground"}
              iconBg={totalImmobilized > 0 ? "bg-violet-500/10" : "bg-muted"}
              highlight={totalImmobilized > 0 ? "violet" : undefined}
            />
          </>
        )}
      </section>

      {/* Toggle Vista */}
      {state === "ready" && (
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === "table"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Table2 className="h-4 w-4" />
            Vista Tabla
          </button>
          <button
            onClick={() => setViewMode("projection")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === "projection"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <BarChart2 className="h-4 w-4" />
            Vista Proyección
          </button>
        </div>
      )}

      {/* Table */}
      <section>
        {state === "loading" && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        )}
        {state === "ready" && viewMode === "table" && (
          <InventoryTable items={items} alerts={alerts} alertMode={alertMode} />
        )}
        {state === "ready" && viewMode === "projection" && (
          <InventoryProjectionGrid
            items={items}
            alerts={alerts}
            allPredictions={allPredictions}
            predsLoading={predsLoading}
            onSelectItem={setExpandedItem}
          />
        )}
        {state === "empty" && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground">No hay datos de inventario disponibles.</p>
            <p className="text-sm text-muted-foreground">
              Ve a{" "}
              <a href="/data-ingestion" className="text-primary underline underline-offset-2">
                Ingesta de Datos
              </a>{" "}
              y sube un archivo de inventario.
            </p>
          </div>
        )}
        {state === "error" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
            <p className="text-sm font-medium text-destructive">{errorMsg}</p>
          </div>
        )}
      </section>

      {/* Dialog — gráfica expandida con Prophet real */}
      <Dialog open={!!expandedItem} onOpenChange={(open) => { if (!open) setExpandedItem(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {expandedItem?.item_id} — {expandedItem?.store_id ?? ""}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Proyección de stock próximos 30 días · Demanda real día a día (Prophet)
            </p>
          </DialogHeader>

          <div className="mt-2 grid grid-cols-3 gap-4 rounded-lg bg-muted/40 px-4 py-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Stock disponible</p>
              <p className="font-semibold">{expandedItem?.available_stock.toLocaleString()} uds</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Punto de reorden</p>
              <p className="font-semibold">
                {expandedItem?.reorder_point != null
                  ? `${Number(expandedItem.reorder_point).toFixed(0)} uds`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lead time</p>
              <p className="font-semibold">{expandedItem?.lead_time_days} días</p>
            </div>
          </div>

          <div className="mt-2">
            {expandedItem && (
              <StockProjectionChart item={expandedItem} predictions={expandedPreds} />
            )}
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  iconColor,
  iconBg,
  highlight,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  highlight?: "destructive" | "warning" | "violet"
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </div>
      </div>
      <p
        className={
          highlight === "destructive"
            ? "mt-2 text-2xl font-bold text-destructive"
            : highlight === "warning"
            ? "mt-2 text-2xl font-bold text-warning"
            : highlight === "violet"
            ? "mt-2 text-2xl font-bold text-violet-500"
            : "mt-2 text-2xl font-bold tracking-tight text-card-foreground"
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
