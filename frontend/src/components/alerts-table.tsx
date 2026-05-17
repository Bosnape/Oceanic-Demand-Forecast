"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, TrendingDown, BarChart2, History, ShoppingCart, HelpCircle, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { getInventoryAlerts, type StockoutAlert, type AlertMode } from "@/lib/api"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

// ---------------------------------------------------------------------------
// Alerts guide popover — explains how to read stockout alerts
// ---------------------------------------------------------------------------

function GuideRow({ dot, label, desc }: { dot: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground"> — {desc}</span>
      </div>
    </div>
  )
}

function ColRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{desc}</span>
    </div>
  )
}

function AlertsGuide() {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cómo interpretar las alertas"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-96 p-4 text-xs space-y-4">
        <p className="text-sm font-semibold text-foreground">Cómo leer las alertas</p>

        {/* Estados */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estados</p>
          <GuideRow dot="bg-destructive" label="Crítico"   desc="El stock se acaba antes de que llegue el próximo pedido. Actúa hoy." />
          <GuideRow dot="bg-warning"     label="Atención"  desc="El stock es muy ajustado para el lead time. Programa el pedido pronto." />
        </div>

        {/* Columnas */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Columnas</p>
          <ColRow label="Días hasta sin stock" desc="Días que quedan antes de que el producto se agote al ritmo de demanda proyectada." />
          <ColRow label="Sin stock ~fecha"     desc="Fecha estimada en que el producto se quedará sin stock si no se pide." />
          <ColRow label="Stock / Demanda"      desc="Unidades disponibles vs las que se necesitan durante el lead time." />
          <ColRow label="Sugerido a pedir"     desc="Cuánto pedir para no quedarte sin producto antes del próximo pedido. Ej: 600 proyectadas × 1.25 − 137 en bodega = ~613 uds." />
        </div>

        {/* Cálculo sugerido */}
        <div className="rounded-md bg-muted/60 px-3 py-2 space-y-2">
          <p className="font-semibold text-foreground">¿Cuánto pedir para no quedarte sin producto?</p>
          <p className="text-muted-foreground leading-relaxed">
            Mientras esperas el pedido, tu stock disponible se va vendiendo. Lo que necesitas pedir es lo
            suficiente para no quedarte sin producto antes de que llegue el camión, más un colchón
            extra por si las ventas suben.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Fórmula:{" "}
            <span className="font-medium text-foreground">(demanda en lead time × 1.25) − stock disponible</span>,
            donde el 1.25 es el margen de seguridad del 25%.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Ejemplo: 600 proyectadas × 1.25 = 750 − 137 en bodega ={" "}
            <span className="font-medium text-foreground">~613 uds a pedir</span>.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

// ---------------------------------------------------------------------------
// Alert mode banner
// ---------------------------------------------------------------------------

function AlertModeBanner({ mode, message }: { mode: AlertMode; message: string }) {
  if (mode === "no_data") return null
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs mb-3",
        mode === "forecast"
          ? "bg-primary/8 text-primary border border-primary/20"
          : "bg-warning/8 text-warning border border-warning/20"
      )}
    >
      {mode === "forecast"
        ? <BarChart2 className="h-3.5 w-3.5 shrink-0" />
        : <History className="h-3.5 w-3.5 shrink-0" />
      }
      <span>{message}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single alert row
// ---------------------------------------------------------------------------

function AlertRow({ alert }: { alert: StockoutAlert }) {
  const isCritical = alert.stock_status === "critical"

  return (
    <TableRow
      className={cn(
        "transition-colors",
        isCritical
          ? "border-l-2 border-l-destructive bg-destructive/5 hover:bg-destructive/10"
          : "border-l-2 border-l-warning bg-warning/5 hover:bg-warning/10"
      )}
    >
      <TableCell>
        <Badge
          variant={isCritical ? "destructive" : "secondary"}
          className={cn("gap-1", !isCritical && "bg-warning/15 text-warning")}
        >
          <AlertTriangle className="h-3 w-3" />
          {isCritical ? "Crítico" : "Atención"}
        </Badge>
      </TableCell>

      <TableCell className="font-medium text-card-foreground">
        <div className="flex flex-col gap-0.5">
          <span>{alert.item_id}</span>
          {alert.store_id && (
            <span className="text-[10px] text-muted-foreground">{alert.store_id}</span>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <div className="flex flex-col gap-0.5">
          <span className={cn("font-semibold", isCritical ? "text-destructive" : "text-warning")}>
            {alert.days_of_stock} días
          </span>
          {alert.stockout_date && (
            <span className="text-[10px] text-muted-foreground">
              Sin stock ~{new Date(alert.stockout_date).toLocaleDateString("es-CO", {
                day: "numeric", month: "short"
              })}
            </span>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
        {alert.current_stock.toLocaleString()} uds disponibles
        <span className="block text-[10px] text-muted-foreground/70">
          Demanda en {alert.lead_time_days}d: ~{Math.ceil(alert.demand_during_lead_time)} uds
        </span>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <ShoppingCart className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-semibold text-primary">
            ~{alert.units_to_order.toLocaleString()} uds
          </span>
        </div>
        <span className="block text-[10px] text-right text-muted-foreground">
          sugerido a pedir
        </span>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AlertsTable() {
  const [alerts, setAlerts]       = useState<StockoutAlert[]>([])
  const [alertMode, setAlertMode] = useState<AlertMode>("no_data")
  const [modeMessage, setModeMessage] = useState("")
  const [loading, setLoading]     = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expanded, setExpanded]   = useState(false)

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener("pipeline:dataready", handler)
    window.addEventListener("pipeline:refetch", handler)
    return () => {
      window.removeEventListener("pipeline:dataready", handler)
      window.removeEventListener("pipeline:refetch", handler)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setExpanded(false)
    getInventoryAlerts()
      .then((res) => {
        setAlerts(res.alerts)
        setAlertMode(res.alert_mode)
        setModeMessage(res.message)
      })
      .catch(() => {
        setAlerts([])
        setAlertMode("no_data")
      })
      .finally(() => setLoading(false))
  }, [refreshKey])

  const VISIBLE_LIMIT = 3
  const visibleAlerts = expanded ? alerts : alerts.slice(0, VISIBLE_LIMIT)
  const hiddenCount   = alerts.length - VISIBLE_LIMIT
  const criticalCount = alerts.filter((a) => a.stock_status === "critical").length

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-card-foreground">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Alertas de Quiebre de Stock
          <AlertsGuide />
          {alerts.length > 0 && (
            <Badge variant="secondary" className="ml-auto bg-warning/10 text-warning">
              {alerts.length} activas
            </Badge>
          )}
        </CardTitle>
        {criticalCount > 0 && (
          <CardDescription className="text-destructive font-medium">
            {criticalCount} SKU{criticalCount > 1 ? "s" : ""} en estado crítico — requieren acción inmediata
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-8 text-center">
            <TrendingDown className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Sin alertas activas — todos los SKUs tienen stock suficiente.
            </p>
          </div>
        ) : (
          <>
            <AlertModeBanner mode={alertMode} message={modeMessage} />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs uppercase tracking-wide">
                    <TableHead>Estado</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="hidden md:table-cell">Días hasta sin stock</TableHead>
                    <TableHead className="hidden lg:table-cell">Stock / Demanda</TableHead>
                    <TableHead className="text-right">Pedir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleAlerts.map((alert) => (
                    <AlertRow key={`${alert.item_id}-${alert.store_id}`} alert={alert} />
                  ))}
                </TableBody>
              </Table>
            </div>
            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                {expanded ? (
                  <>Ver menos <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Ver {hiddenCount} más <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
