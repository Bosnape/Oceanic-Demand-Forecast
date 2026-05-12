"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { InventoryItem } from "@/lib/api"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProjectionData(item: InventoryItem) {
  const avgDaily = (item.next_month_forecast ?? 0) / 30
  return Array.from({ length: 31 }, (_, day) => ({
    dia: day,
    stock: Math.max(0, item.available_stock - avgDaily * day),
  }))
}

function crossoverDay(item: InventoryItem): number | null {
  if (!item.reorder_point || item.reorder_point <= 0) return null
  const avgDaily = (item.next_month_forecast ?? 0) / 30
  if (avgDaily === 0) return null
  const day = (item.available_stock - item.reorder_point) / avgDaily
  if (day < 0) return 0          // ya está por debajo hoy
  return day <= 30 ? Math.round(day) : null
}

function stockoutDay(item: InventoryItem): number | null {
  const avgDaily = (item.next_month_forecast ?? 0) / 30
  if (avgDaily === 0) return null
  const day = item.available_stock / avgDaily
  return day >= 0 && day <= 30 ? Math.round(day) : null
}

// ---------------------------------------------------------------------------
// Tooltip personalizado
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Día {label}</p>
      <p className="text-sm font-semibold text-card-foreground">
        {Math.round(payload[0].value).toLocaleString()} unidades
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface Props {
  item: InventoryItem
  compact?: boolean   // true → mini grid, false → expandido
}

export function StockProjectionChart({ item, compact = false }: Props) {
  const data        = buildProjectionData(item)
  const reorderDay  = crossoverDay(item)
  const zeroDay     = stockoutDay(item)
  const hasNoData   = !item.next_month_forecast || item.next_month_forecast === 0

  // Punto donde cruza el reorder point (para ReferenceDot)
  const crossoverStock =
    reorderDay !== null ? data[Math.min(reorderDay, 30)]?.stock ?? null : null

  // Colores según urgencia
  const lineColor =
    reorderDay === 0
      ? "oklch(0.55 0.22 25)"   // rojo — ya por debajo
      : reorderDay !== null && reorderDay <= 7
      ? "oklch(0.65 0.20 45)"   // naranja — cruza pronto
      : "oklch(0.45 0.18 250)"  // azul — ok

  // Resumen textual
  const summary = hasNoData
    ? "Sin forecast disponible — sube ventas y espera que Prophet entrene."
    : reorderDay === 0
    ? "⚠️ Ya está por debajo del punto de reorden."
    : reorderDay !== null
    ? `Cruza el punto de reorden el día ${reorderDay}.${zeroDay !== null ? ` Sin stock el día ${zeroDay}.` : ""}`
    : zeroDay !== null
    ? `Sin stock estimado el día ${zeroDay}.`
    : "✅ Stock suficiente para los próximos 30 días."

  const chartHeight = compact ? 120 : 260

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <p className="text-xs text-muted-foreground">{summary}</p>
      )}

      {hasNoData ? (
        <div
          className="flex items-center justify-center rounded-lg bg-muted/40 text-xs text-muted-foreground"
          style={{ height: chartHeight }}
        >
          Sin datos de forecast
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: compact ? -20 : 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 247)" />
            <XAxis
              dataKey="dia"
              tick={{ fill: "oklch(0.50 0.02 264)", fontSize: compact ? 9 : 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `D${v}`}
              interval={compact ? 9 : 4}
            />
            <YAxis
              tick={{ fill: "oklch(0.50 0.02 264)", fontSize: compact ? 9 : 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
              width={compact ? 28 : 40}
            />
            {!compact && <Tooltip content={<CustomTooltip />} />}
            {!compact && (
              <Legend
                formatter={(value) => (
                  <span style={{ color: "oklch(0.50 0.02 264)", fontSize: "12px" }}>{value}</span>
                )}
              />
            )}

            {/* Línea de reorden */}
            {item.reorder_point != null && item.reorder_point > 0 && (
              <ReferenceLine
                y={item.reorder_point}
                stroke="oklch(0.65 0.20 45)"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={
                  compact
                    ? undefined
                    : { value: "Punto reorden", position: "insideTopRight", fontSize: 11, fill: "oklch(0.65 0.20 45)" }
                }
              />
            )}

            {/* Línea de burn-down */}
            <Line
              type="monotone"
              dataKey="stock"
              name="Stock proyectado"
              stroke={lineColor}
              strokeWidth={compact ? 1.5 : 2}
              dot={false}
              activeDot={compact ? false : { r: 4 }}
            />

            {/* Punto de cruce con reorder */}
            {reorderDay !== null && crossoverStock !== null && !compact && (
              <ReferenceDot
                x={reorderDay}
                y={crossoverStock}
                r={5}
                fill="oklch(0.65 0.20 45)"
                stroke="white"
                strokeWidth={2}
                label={{ value: `Día ${reorderDay}`, position: "top", fontSize: 11, fill: "oklch(0.65 0.20 45)" }}
              />
            )}

            {/* Punto de stockout */}
            {zeroDay !== null && !compact && (
              <ReferenceLine
                x={zeroDay}
                stroke="oklch(0.55 0.22 25)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `Sin stock D${zeroDay}`, position: "insideTopLeft", fontSize: 11, fill: "oklch(0.55 0.22 25)" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}

      {compact && (
        <p className="text-center text-[10px] leading-tight text-muted-foreground">{summary}</p>
      )}
    </div>
  )
}
