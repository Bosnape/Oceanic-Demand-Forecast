"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, AlertTriangle, TrendingDown, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { InventoryItem } from "@/lib/api"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBelowReorder(item: InventoryItem): boolean {
  return item.reorder_point != null && item.current_stock <= item.reorder_point
}

function StockStatusBadge({ item }: { item: InventoryItem }) {
  if (isBelowReorder(item)) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Reordenar
      </Badge>
    )
  }
  if (item.slow_moving_flag === true) {
    return (
      <Badge variant="secondary" className="gap-1 bg-warning/10 text-warning">
        <TrendingDown className="h-3 w-3" />
        Slow Moving
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
// Filter tabs
// ---------------------------------------------------------------------------

type FilterType = "all" | "reorder" | "slow"

interface FilterTabProps {
  active: FilterType
  counts: { all: number; reorder: number; slow: number }
  onChange: (f: FilterType) => void
}

function FilterTabs({ active, counts, onChange }: FilterTabProps) {
  const tabs: { key: FilterType; label: string; count: number }[] = [
    { key: "all",    label: "Todos",          count: counts.all    },
    { key: "reorder",label: "Por Reordenar",  count: counts.reorder},
    { key: "slow",   label: "Slow Moving",    count: counts.slow   },
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
}

export function InventoryTable({ items }: InventoryTableProps) {
  const [search, setSearch]   = useState("")
  const [filter, setFilter]   = useState<FilterType>("all")

  const reorderItems  = items.filter(isBelowReorder)
  const slowItems     = items.filter((i) => i.slow_moving_flag === true)

  const counts = {
    all:     items.length,
    reorder: reorderItems.length,
    slow:    slowItems.length,
  }

  const filtered = items
    .filter((i) => i.item_id.toLowerCase().includes(search.toLowerCase()))
    .filter((i) => {
      if (filter === "reorder") return isBelowReorder(i)
      if (filter === "slow")    return i.slow_moving_flag === true
      return true
    })

  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-card-foreground">Inventario por SKU</CardTitle>
              <CardDescription>
                {reorderItems.length > 0 && (
                  <span className="text-destructive font-medium">
                    {reorderItems.length} por reordenar ·{" "}
                  </span>
                )}
                {slowItems.length > 0 && (
                  <span className="text-warning font-medium">
                    {slowItems.length} slow moving ·{" "}
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
                filtered.map((item) => (
                  <TableRow
                    key={`${item.item_id}-${item.store_id}`}
                    className={cn(
                      "transition-colors",
                      isBelowReorder(item)
                        ? "border-l-2 border-l-destructive bg-destructive/5 hover:bg-destructive/10"
                        : item.slow_moving_flag === true
                        ? "border-l-2 border-l-warning bg-warning/5 hover:bg-warning/10"
                        : "hover:bg-muted/40"
                    )}
                  >
                    {/* SKU */}
                    <TableCell className="font-medium text-card-foreground">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">{item.item_id}</span>
                        {item.immobilized_capital != null && (
                          <span className="text-[10px] font-semibold text-warning">
                            ${item.immobilized_capital.toLocaleString("en-US", { maximumFractionDigits: 0 })} inmovilizado
                          </span>
                        )}
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
                      <StockStatusBadge item={item} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
