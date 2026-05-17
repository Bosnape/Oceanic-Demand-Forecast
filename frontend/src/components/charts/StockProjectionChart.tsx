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
import type { InventoryItem, PredictionRecord } from "@/lib/api"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProjectionData(item: InventoryItem, predictions: PredictionRecord[]) {
  const first30 = predictions.slice(0, 30)
  let stock = item.available_stock
  const points = [{ dia: 0, stock }]
  first30.forEach((p, i) => {
    stock = Math.max(0, stock - p.yhat)
    points.push({ dia: i + 1, stock })
  })
  return points
}

function crossoverDay(item: InventoryItem, data: { dia: number; stock: number }[]): number | null {
  if (!item.reorder_point || item.reorder_point <= 0) return null
  const found = data.find((p) => p.stock <= item.reorder_point!)
  if (!found) return null
  return found.dia === 0 ? 0 : found.dia
}

function stockoutDay(data: { dia: number; stock: number }[]): number | null {
  const found = data.find((p) => p.stock <= 0)
  return found ? found.dia : null
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
  compact?: boolean
  predictions?: PredictionRecord[]
}

export function StockProjectionChart({ item, compact = false, predictions }: Props) {
  const hasData = predictions != null && predictions.length > 0

  const data         = hasData ? buildProjectionData(item, predictions!) : []
  const reorderDay   = hasData ? crossoverDay(item, data) : null
  const zeroDay      = hasData ? stockoutDay(data) : null

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
  const summary = !hasData
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

      {!hasData ? (
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
            <Tooltip content={<CustomTooltip />} />
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
                label={{ value: "Punto reorden", position: "insideTopRight", fontSize: compact ? 9 : 11, fill: "oklch(0.65 0.20 45)" }}
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
              activeDot={{ r: compact ? 3 : 4 }}
            />

            {/* Punto de cruce con reorder — en ambos modos, label solo en expandido */}
            {reorderDay !== null && reorderDay > 0 && crossoverStock !== null && (
              <ReferenceDot
                x={reorderDay}
                y={crossoverStock}
                r={compact ? 4 : 5}
                fill="oklch(0.65 0.20 45)"
                stroke="white"
                strokeWidth={2}
                label={{ value: `Día ${reorderDay}`, position: "top", fontSize: compact ? 9 : 11, fill: "oklch(0.65 0.20 45)" }}
              />
            )}

            {/* Punto de stockout */}
            {zeroDay !== null && (
              <ReferenceLine
                x={zeroDay}
                stroke="oklch(0.55 0.22 25)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `Sin stock D${zeroDay}`, position: "insideTopLeft", fontSize: compact ? 9 : 11, fill: "oklch(0.55 0.22 25)" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}

      {compact && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-center gap-4">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: lineColor }} />
              Stock proyectado
            </span>
            {item.reorder_point != null && item.reorder_point > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: "oklch(0.65 0.20 45)" }} />
                Punto reorden
              </span>
            )}
          </div>
          <p className="text-center text-[10px] leading-tight text-muted-foreground">{summary}</p>
        </div>
      )}
    </div>
  )
}
