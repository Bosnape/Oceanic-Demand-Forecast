"use client"

import { useState, Fragment } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, AlertTriangle, TrendingDown, CheckCircle2, Skull, BarChart2, History, HelpCircle, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { InventoryItem, StockoutAlert, AlertMode } from "@/lib/api"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBelowReorder(item: InventoryItem): boolean {
  return item.reorder_point != null && item.current_stock <= item.reorder_point
}

// isAlert = item appears in backend stockout-alert list
function StockStatusBadge({ item, isAlert }: { item: InventoryItem; isAlert: boolean }) {
  // Priority: Reordenar > Stock Muerto > Atención (stockout risk) > Mov. Lento > OK > Pendiente
  if (isBelowReorder(item)) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Reordenar
      </Badge>
    )
  }
  if (item.stock_status === "dead_stock") {
    return (
      <Badge variant="secondary" className="gap-1 bg-destructive/10 text-destructive">
        <Skull className="h-3 w-3" />
        Stock Muerto
      </Badge>
    )
  }
  // Orange — stockout risk (forecast demand will exceed stock during lead time)
  if (isAlert) {
    return (
      <Badge variant="secondary" className="gap-1 bg-orange-500/10 text-orange-500">
        <AlertTriangle className="h-3 w-3" />
        Atención
      </Badge>
    )
  }
  // Amber — slow-moving (high days-of-stock but no imminent stockout)
  if (item.slow_moving_flag === true) {
    return (
      <Badge variant="secondary" className="gap-1 bg-warning/10 text-warning">
        <TrendingDown className="h-3 w-3" />
        Mov. Lento
      </Badge>
    )
  }
  if (item.stock_status === "ok") {
    return (
      <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
        <CheckCircle2 className="h-3 w-3" />
        OK
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-muted-foreground">Pendiente</Badge>
}

function DaysOfStockCell({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground">-</span>
  if (days <= 7)  return <span className="font-bold text-destructive">{days}d</span>
  if (days <= 14) return <span className="font-semibold text-warning">{days}d</span>
  return <span className="text-success">{days}d</span>
}

function ReorderCell({ item }: { item: InventoryItem }) {
  if (item.reorder_point == null) return <span className="text-muted-foreground">-</span>
  const below = isBelowReorder(item)
  return (
    <span className={cn("font-medium", below ? "text-destructive" : "text-muted-foreground")}>
      {below && <AlertTriangle className="mr-1 inline h-3 w-3" />}
      {item.reorder_point.toLocaleString("en-US", { maximumFractionDigits: 0 })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Inventory guide popover — explains badges and columns
// ---------------------------------------------------------------------------

function Dot({ color }: { color: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${color}`} />
}

function GuideRow({ dot, label, desc }: { dot: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <Dot color={dot} />
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
      <span className="w-28 shrink-0 font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{desc}</span>
    </div>
  )
}

function InventoryGuide() {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cómo interpretar el inventario"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-96 p-4 text-xs space-y-4">
        {/* Header */}
        <p className="text-sm font-semibold text-foreground">Cómo leer el inventario</p>

        {/* Estados */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estados</p>
          <GuideRow dot="bg-destructive"    label="Reordenar"    desc="Stock ≤ punto de reorden. Actúa hoy." />
          <GuideRow dot="bg-orange-500"     label="Atención"     desc="La demanda proyectada durante el lead time supera el stock. Riesgo de quedarse sin stock antes del próximo pedido." />
          <GuideRow dot="bg-warning"        label="Mov. Lento"   desc="Más de 90 días de stock acumulado. El producto rota poco." />
          <GuideRow dot="bg-destructive/60" label="Stock Muerto" desc="Más de 180 días de stock. Sin rotación significativa." />
          <GuideRow dot="bg-success"        label="OK"           desc="Stock suficiente y rotación normal." />
        </div>

        {/* Columnas */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Columnas clave</p>
          <ColRow label="Días Stock"     desc="Cuántos días dura el stock al ritmo histórico de ventas." />
          <ColRow label="Pto. Reorden"   desc="Umbral mínimo antes de pedir = demanda diaria × lead time." />
          <ColRow label="Lead Time"      desc="Días que tarda en llegar un nuevo pedido al almacén." />
          <ColRow label="Pronóstico/mes" desc="Demanda proyectada por el modelo para el próximo mes." />
        </div>

        {/* Tip clave */}
        <div className="rounded-md bg-muted/60 px-3 py-2 space-y-1">
          <p className="font-semibold text-foreground">Atención ≠ Días Stock bajos</p>
          <p className="text-muted-foreground leading-relaxed">
            Un SKU con pocos días de stock puede ser{" "}
            <span className="text-success font-medium">OK</span> si sus unidades cubren
            la demanda durante el lead time.{" "}
            <span className="text-orange-500 font-medium">Atención</span> se activa cuando
            el stock <em>no alcanza</em> para esperar el próximo pedido — aunque los días
            de stock parezcan suficientes.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

// ---------------------------------------------------------------------------
// Analysis panel — expandable per-SKU breakdown
// ---------------------------------------------------------------------------

function AnalysisStep({
  number, label, value, note, status, statusText,
}: {
  number: string
  label: string
  value: string
  note?: string
  status?: "good" | "bad" | "warning" | "neutral"
  statusText?: string
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{number} {label}</p>
      <p className={cn(
        "font-semibold text-sm",
        status === "good"    ? "text-success"     :
        status === "bad"     ? "text-destructive" :
        status === "warning" ? "text-warning"     :
        "text-foreground"
      )}>
        {value}
      </p>
      {note       && <p className="text-[10px] text-muted-foreground leading-tight">{note}</p>}
      {statusText && (
        <p className={cn(
          "text-[10px] font-medium",
          status === "good" ? "text-success" : status === "bad" ? "text-destructive" : "text-warning"
        )}>
          {statusText}
        </p>
      )}
    </div>
  )
}

function AnalysisPanel({ item, isAlert }: { item: InventoryItem; isAlert: boolean }) {
  const dailyForecast        = item.next_month_forecast > 0 ? item.next_month_forecast / 30 : 0
  const demandDuringLeadTime = dailyForecast * item.lead_time_days
  const historicalDailyRate  = (item.days_of_stock != null && item.days_of_stock > 0)
    ? item.current_stock / item.days_of_stock
    : null
  const daysUntilReorder = (item.reorder_point != null && dailyForecast > 0)
    ? (item.current_stock - item.reorder_point) / dailyForecast
    : null

  const isPending    = item.next_month_forecast === 0 || item.stock_status === "pending"
  const isReorder    = isBelowReorder(item)
  const isDeadOrSlow = item.stock_status === "dead_stock" || (item.slow_moving_flag === true && !isAlert && !isReorder)

  // Conclusion text per scenario
  const conclusion: { text: string; color: string } = isPending
    ? { text: "Sin datos suficientes. Sube ventas e inventario para activar el análisis completo.", color: "text-muted-foreground" }
    : isReorder
    ? { text: `Situación crítica — el stock se agotará en ${item.days_of_stock?.toFixed(1) ?? "?"}d y el lead time es ${item.lead_time_days}d. Pide hoy.`, color: "text-destructive" }
    : isAlert
    ? { text: `Margen ajustado: solo ${Math.round(item.current_stock - demandDuringLeadTime)} uds sobre la demanda del lead time. Planea el pedido lo antes posible.`, color: "text-orange-500" }
    : isDeadOrSlow
    ? { text: `Exceso de inventario. El stock tardará ~${item.days_of_stock?.toFixed(0) ?? "?"}d en agotarse. Considera reducir futuras órdenes o hacer promociones.`, color: "text-warning" }
    : daysUntilReorder != null && daysUntilReorder > 0
    ? { text: `Estás bien. Según el forecast, en ~${Math.round(daysUntilReorder)} días el stock llegará al punto de reorden — planea el pedido para entonces.`, color: "text-success" }
    : { text: "Stock suficiente. Sin acciones inmediatas necesarias.", color: "text-success" }

  return (
    <div className="px-4 pb-4 pt-3 bg-muted/20 border-t border-dashed text-xs space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Análisis — {item.item_id}{item.store_id ? ` · ${item.store_id}` : ""}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <AnalysisStep
          number="①" label="Stock disponible"
          value={`${item.current_stock.toLocaleString()} uds`}
          status="neutral"
        />
        <AnalysisStep
          number="②" label="Punto de reorden"
          value={item.reorder_point != null ? `${Math.round(item.reorder_point).toLocaleString()} uds` : "Sin datos"}
          status={item.reorder_point == null ? "neutral" : isReorder ? "bad" : "good"}
          statusText={item.reorder_point == null ? undefined : isReorder ? "Por debajo — pide ahora" : "Por encima ✓"}
        />
        <AnalysisStep
          number="③" label="Días stock (histórico)"
          value={item.days_of_stock != null ? `${item.days_of_stock.toFixed(1)}d` : "-"}
          note={historicalDailyRate != null ? `~${historicalDailyRate.toFixed(1)} uds/día (promedio histórico)` : undefined}
          status={
            item.days_of_stock == null ? "neutral" :
            item.days_of_stock <= item.lead_time_days ? "bad" :
            item.days_of_stock <= item.lead_time_days * 2 ? "warning" : "neutral"
          }
        />
        <AnalysisStep
          number="④" label="Forecast próximo mes"
          value={dailyForecast > 0 ? `${item.next_month_forecast.toLocaleString("en-US", { maximumFractionDigits: 0 })} uds` : "Sin forecast"}
          note={dailyForecast > 0 ? `${dailyForecast.toFixed(1)}/día → ${Math.ceil(demandDuringLeadTime)} uds en ${item.lead_time_days}d de lead time` : undefined}
          status="neutral"
        />
        <AnalysisStep
          number="⑤" label={`Stock vs lead time (${item.lead_time_days}d)`}
          value={dailyForecast > 0 ? `${item.current_stock.toLocaleString()} vs ${Math.ceil(demandDuringLeadTime)} uds` : "Sin forecast"}
          status={dailyForecast === 0 ? "neutral" : item.current_stock >= demandDuringLeadTime * 1.25 ? "good" : item.current_stock >= demandDuringLeadTime ? "warning" : "bad"}
          statusText={
            dailyForecast === 0 ? undefined :
            item.current_stock >= demandDuringLeadTime * 1.25 ? "Cubre el lead time con margen ✓" :
            item.current_stock >= demandDuringLeadTime ? "Cubre justo — sin colchón" :
            "No alcanza para el lead time ✗"
          }
        />
        <AnalysisStep
          number="⑥" label="¿Cuándo reordenar?"
          value={
            isReorder                                              ? "¡Ahora mismo!" :
            daysUntilReorder != null && daysUntilReorder <= 0     ? "Ya pasaste el punto" :
            daysUntilReorder != null                               ? `En ~${Math.round(daysUntilReorder)} días` :
            "Sin datos"
          }
          status={
            isReorder                                              ? "bad"     :
            daysUntilReorder != null && daysUntilReorder <= 0     ? "bad"     :
            daysUntilReorder != null && daysUntilReorder <= 7     ? "bad"     :
            daysUntilReorder != null && daysUntilReorder <= 14    ? "warning" :
            "good"
          }
        />
      </div>

      <div className={cn("rounded-md px-3 py-2 bg-muted/50 font-medium leading-relaxed", conclusion.color)}>
        💡 {conclusion.text}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

type FilterType = "all" | "reorder" | "slow" | "dead" | "alerts"

interface FilterTabProps {
  active: FilterType
  counts: { all: number; reorder: number; slow: number; dead: number; alerts: number }
  onChange: (f: FilterType) => void
}

function FilterTabs({ active, counts, onChange }: FilterTabProps) {
  const tabs: { key: FilterType; label: string; count: number }[] = [
    { key: "all",    label: "Todos",           count: counts.all    },
    { key: "reorder",label: "Por Reordenar",   count: counts.reorder},
    { key: "slow",   label: "Movimiento Lento",count: counts.slow   },
    { key: "dead",   label: "Stock Muerto",    count: counts.dead   },
    { key: "alerts", label: "Riesgo Sin Stock", count: counts.alerts },
  ]

  return (
    <div className="flex gap-1.5">
      {tabs.map((tab) => (
        <Button
          key={tab.key}
          size="sm"
          variant={active === tab.key ? "default" : "outline"}
          className="h-7 gap-1.5 px-3 text-xs"
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              active === tab.key
                ? "bg-white/20 text-white"
                : tab.key === "reorder" && tab.count > 0
                ? "bg-destructive/10 text-destructive"
                : tab.key === "slow" && tab.count > 0
                ? "bg-warning/10 text-warning"
                : tab.key === "dead" && tab.count > 0
                ? "bg-destructive/10 text-destructive"
                : tab.key === "alerts" && tab.count > 0
                ? "bg-warning/10 text-warning"
                : "bg-muted text-muted-foreground"
            )}
          >
            {tab.count}
          </span>
        </Button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface InventoryTableProps {
  items: InventoryItem[]
  alerts?: StockoutAlert[]
  alertMode?: AlertMode
}

export function InventoryTable({ items, alerts = [], alertMode }: InventoryTableProps) {
  const [search, setSearch]     = useState("")
  const [filter, setFilter]     = useState<FilterType>("all")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  function toggleRow(key: string) {
    setExpandedRow((prev) => (prev === key ? null : key))
  }

  const alertItemIds = new Set(alerts.map((a) => a.item_id))

  const reorderItems  = items.filter(isBelowReorder)
  const slowItems     = items.filter((i) => i.slow_moving_flag === true && i.stock_status !== "dead_stock")
  const deadItems     = items.filter((i) => i.stock_status === "dead_stock")
  const alertItems    = items.filter((i) => alertItemIds.has(i.item_id))

  const counts = {
    all:     items.length,
    reorder: reorderItems.length,
    slow:    slowItems.length,
    dead:    deadItems.length,
    alerts:  alertItems.length,
  }

  const filtered = items
    .filter((i) => i.item_id.toLowerCase().includes(search.toLowerCase()))
    .filter((i) => {
      if (filter === "reorder") return isBelowReorder(i)
      if (filter === "slow")    return i.slow_moving_flag === true && i.stock_status !== "dead_stock"
      if (filter === "dead")    return i.stock_status === "dead_stock"
      if (filter === "alerts")  return alertItemIds.has(i.item_id)
      return true
    })

  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-1.5 text-card-foreground">
                Inventario por SKU
                <InventoryGuide />
              </CardTitle>
              <CardDescription>
                {reorderItems.length > 0 && (
                  <span className="text-destructive font-medium">
                    {reorderItems.length} por reordenar ·{" "}
                  </span>
                )}
                {slowItems.length > 0 && (
                  <span className="text-warning font-medium">
                    {slowItems.length} mov. lento ·{" "}
                  </span>
                )}
                {deadItems.length > 0 && (
                  <span className="text-destructive font-medium">
                    {deadItems.length} stock muerto ·{" "}
                  </span>
                )}
                {items.length} SKUs totales
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>

          <FilterTabs active={filter} counts={counts} onChange={setFilter} />

          {filter === "alerts" && alertMode && alertMode !== "no_data" && (
            <div className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
              alertMode === "forecast"
                ? "bg-primary/8 text-primary border border-primary/20"
                : "bg-warning/8 text-warning border border-warning/20"
            )}>
              {alertMode === "forecast"
                ? <BarChart2 className="h-3.5 w-3.5 shrink-0" />
                : <History className="h-3.5 w-3.5 shrink-0" />
              }
              {alertMode === "forecast"
                ? "Riesgo calculado con demanda proyectada por el modelo de pronóstico (Prophet)."
                : "Sin pronóstico disponible — riesgo estimado con ventas históricas."
              }
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs uppercase tracking-wide">
                <TableHead>SKU</TableHead>
                <TableHead className="hidden sm:table-cell">Tienda</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right hidden md:table-cell">Disponible</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Pto. Reorden</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Días Stock</TableHead>
                <TableHead className="text-right hidden xl:table-cell">Pronóstico/mes</TableHead>
                <TableHead className="text-right hidden xl:table-cell">Lead Time</TableHead>
                <TableHead className="text-right hidden xl:table-cell">Costo Unit.</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    No se encontraron SKUs
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => {
                  const rowKey     = `${item.item_id}-${item.store_id}`
                  const isExpanded = expandedRow === rowKey
                  const isAlert    = alertItemIds.has(item.item_id)
                  return (
                    <Fragment key={rowKey}>
                      <TableRow
                        onClick={() => toggleRow(rowKey)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isBelowReorder(item)
                            ? "border-l-2 border-l-destructive bg-destructive/5 hover:bg-destructive/10"
                            : item.stock_status === "dead_stock"
                            ? "border-l-2 border-l-destructive/50 bg-destructive/5 hover:bg-destructive/10"
                            : isAlert
                            ? "border-l-2 border-l-orange-500 bg-orange-500/5 hover:bg-orange-500/10"
                            : item.slow_moving_flag === true
                            ? "border-l-2 border-l-warning bg-warning/5 hover:bg-warning/10"
                            : "hover:bg-muted/40"
                        )}
                      >
                        {/* SKU */}
                        <TableCell className="font-medium text-card-foreground">
                          <div className="flex items-center gap-1.5">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            }
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm">{item.item_id}</span>
                              {item.immobilized_capital != null && (
                                <span className="text-[10px] font-semibold text-warning">
                                  ${item.immobilized_capital.toLocaleString("en-US", { maximumFractionDigits: 0 })} inmovilizado
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Tienda */}
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {item.store_id ?? "-"}
                        </TableCell>

                        {/* Stock */}
                        <TableCell className="text-right font-bold text-card-foreground">
                          {item.current_stock.toLocaleString()}
                        </TableCell>

                        {/* Disponible */}
                        <TableCell className="text-right text-muted-foreground hidden md:table-cell">
                          {item.available_stock.toLocaleString()}
                        </TableCell>

                        {/* Punto de reorden */}
                        <TableCell className="text-right hidden lg:table-cell">
                          <ReorderCell item={item} />
                        </TableCell>

                        {/* Días de stock */}
                        <TableCell className="text-right hidden lg:table-cell">
                          <DaysOfStockCell days={item.days_of_stock} />
                        </TableCell>

                        {/* Pronóstico próximo mes */}
                        <TableCell className="text-right text-muted-foreground hidden xl:table-cell">
                          {item.next_month_forecast > 0
                            ? item.next_month_forecast.toLocaleString("en-US", { maximumFractionDigits: 0 })
                            : "-"}
                        </TableCell>

                        {/* Lead time */}
                        <TableCell className="text-right text-muted-foreground hidden xl:table-cell">
                          {item.lead_time_days}d
                        </TableCell>

                        {/* Costo unitario */}
                        <TableCell className="text-right text-muted-foreground hidden xl:table-cell">
                          ${item.unit_cost.toFixed(2)}
                        </TableCell>

                        {/* Estado */}
                        <TableCell>
                          <StockStatusBadge item={item} isAlert={isAlert} />
                        </TableCell>
                      </TableRow>

                      {/* Expandable analysis panel */}
                      {isExpanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={10} className="p-0">
                            <AnalysisPanel item={item} isAlert={isAlert} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
