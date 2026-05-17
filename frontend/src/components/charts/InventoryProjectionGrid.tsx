"use client"

import { useState, useMemo } from "react"
import { StockProjectionChart } from "@/components/charts/StockProjectionChart"
import type { InventoryItem, StockoutAlert, PredictionRecord } from "@/lib/api"

// ---------------------------------------------------------------------------
// Badge helper
// ---------------------------------------------------------------------------

function StatusBadge({ item, isAlert }: { item: InventoryItem; isAlert: boolean }) {
  if (isAlert)
    return <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">Alerta</span>
  if (item.stock_status === "dead_stock")
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Stock Muerto</span>
  if (item.stock_status === "slow_moving")
    return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">Mov. Lento</span>
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">OK</span>
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  items: InventoryItem[]
  alerts: StockoutAlert[]
  allPredictions: PredictionRecord[]
  predsLoading: boolean
  onSelectItem?: (item: InventoryItem) => void
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function InventoryProjectionGrid({ items, alerts, allPredictions, predsLoading, onSelectItem }: Props) {
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(6)

  // Agrupar predicciones por item_id
  const predsByItemId = useMemo(() => {
    const map: Record<string, PredictionRecord[]> = {}
    allPredictions.forEach((p) => {
      if (!map[p.item_id]) map[p.item_id] = []
      map[p.item_id].push(p)
    })
    return map
  }, [allPredictions])

  const alertItemIds = useMemo(
    () => new Set(alerts.map((a) => a.item_id)),
    [alerts]
  )

  // Ordenar: alertas primero, luego el resto
  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aA = alertItemIds.has(a.item_id) ? 0 : 1
        const bA = alertItemIds.has(b.item_id) ? 0 : 1
        return aA - bA
      }),
    [items, alertItemIds]
  )

  const selectedItem = selectedSku
    ? sortedItems.find((i) => i.item_id === selectedSku) ?? null
    : null

  const visibleItems = sortedItems.slice(0, visibleCount)
  const hasMore = sortedItems.length > visibleCount

  return (
    <div className="flex flex-col gap-6">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedSku
            ? `SKU seleccionado: ${selectedSku}`
            : `Mostrando ${Math.min(visibleCount, sortedItems.length)} de ${sortedItems.length} SKUs`}
        </p>

        <div className="flex items-center gap-2">
          {selectedSku && (
            <button
              onClick={() => setSelectedSku(null)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Ver todos
            </button>
          )}
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={selectedSku ?? ""}
            onChange={(e) => setSelectedSku(e.target.value || null)}
          >
            <option value="">Filtrar por SKU...</option>
            {sortedItems.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {i.item_id}{i.store_id ? ` — ${i.store_id}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {predsLoading && (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Cargando forecast...
        </div>
      )}

      {/* Vista individual — SKU seleccionado */}
      {!predsLoading && selectedItem && (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <p className="text-sm font-semibold text-card-foreground">{selectedItem.item_id}</p>
            <p className="text-xs text-muted-foreground">{selectedItem.store_id ?? "—"}</p>
            <StatusBadge item={selectedItem} isAlert={alertItemIds.has(selectedItem.item_id)} />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-4 rounded-lg bg-muted/40 px-4 py-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Stock disponible</p>
              <p className="font-semibold">{selectedItem.available_stock.toLocaleString()} uds</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Punto de reorden</p>
              <p className="font-semibold">
                {selectedItem.reorder_point != null
                  ? `${Number(selectedItem.reorder_point).toFixed(0)} uds`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lead time</p>
              <p className="font-semibold">{selectedItem.lead_time_days} días</p>
            </div>
          </div>

          <StockProjectionChart
            item={selectedItem}
            predictions={predsByItemId[selectedItem.item_id]?.slice(0, 30)}
          />
        </div>
      )}

      {/* Grid de mini cards */}
      {!predsLoading && !selectedSku && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleItems.map((item) => {
              const isAlert = alertItemIds.has(item.item_id)
              const preds = predsByItemId[item.item_id]?.slice(0, 30)
              return (
                <div
                  key={item.item_id}
                  className="cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                  onClick={() => onSelectItem?.(item)}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-card-foreground">
                        {item.item_id}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.store_id ?? "—"}</p>
                    </div>
                    <StatusBadge item={item} isAlert={isAlert} />
                  </div>
                  <StockProjectionChart item={item} compact predictions={preds} />
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => setVisibleCount((prev) => prev + 6)}
                className="rounded-lg border px-6 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Ver más ({sortedItems.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
