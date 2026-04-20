"use client"

import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getSales, getPredictions, getInventory } from "@/lib/api"

const COLORS = [
  "oklch(0.45 0.18 250)",
  "oklch(0.65 0.19 165)",
  "oklch(0.70 0.15 50)",
  "oklch(0.55 0.10 290)",
  "oklch(0.60 0.20 30)",
]

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
      <p className="mb-1 text-sm font-medium text-card-foreground">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full mr-1.5"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <Card className="bg-card">
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64 mt-1" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

// ─── Top SKUs by Forecasted Demand ───────────────────────────────────────────

interface TopSkuPoint {
  sku: string
  units: number
}

export function SalesForecastChart() {
  const [data, setData] = useState<TopSkuPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    getPredictions()
      .then((preds) => {
        if (preds.length === 0) { setData([]); return }

        // Sum yhat per SKU across all 90 days
        const totalBySku: Record<string, number> = {}
        for (const r of preds) {
          totalBySku[r.item_id] = (totalBySku[r.item_id] ?? 0) + r.yhat
        }

        // Top 5 SKUs sorted descending
        const top5 = Object.entries(totalBySku)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([sku, units]) => ({ sku, units: Math.round(units) }))

        setData(top5)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [refreshKey])

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener("pipeline:dataready", handler)
    return () => window.removeEventListener("pipeline:dataready", handler)
  }, [])

  if (loading) return <ChartSkeleton />

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-card-foreground">Top 5 SKUs — Demanda Pronosticada</CardTitle>
        <CardDescription>Unidades totales pronosticadas en los próximos 90 días</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Sin predicciones — sube un archivo de ventas primero.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 247)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)}
              />
              <YAxis
                type="category"
                dataKey="sku"
                tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toLocaleString()} uds`, "Forecast 90d"]}
                contentStyle={{
                  backgroundColor: "oklch(1 0 0)",
                  border: "1px solid oklch(0.91 0.005 247)",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="units" name="Forecast 90d" fill={COLORS[1]} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Inventory Chart (Top SKUs by stock) ─────────────────────────────────────

interface InventoryPoint {
  sku: string
  stock: number
  reorder: number
}

export function InventoryChart() {
  const [data, setData] = useState<InventoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    getInventory()
      .then((res) => {
        const sorted = [...res.items]
          .sort((a, b) => b.current_stock - a.current_stock)
          .slice(0, 8)
          .map((item) => ({
            sku: item.item_id,
            stock: item.current_stock,
            reorder: item.reorder_point ?? 0,
          }))
        setData(sorted)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [refreshKey])

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener("pipeline:dataready", handler)
    return () => window.removeEventListener("pipeline:dataready", handler)
  }, [])

  if (loading) return <ChartSkeleton />

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-card-foreground">Top SKUs por Stock</CardTitle>
        <CardDescription>Stock actual vs punto de reorden — top 8 SKUs</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Sin datos — sube un archivo de inventario primero.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 247)" />
              <XAxis
                dataKey="sku"
                tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="stock" name="Stock Actual" fill={COLORS[0]} radius={[6, 6, 0, 0]} />
              <Bar dataKey="reorder" name="Punto Reorden" fill={COLORS[2]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Category Distribution Chart ─────────────────────────────────────────────

interface CategoryPoint {
  name: string
  value: number
}

export function CategoryDistributionChart() {
  const [data, setData] = useState<CategoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    getSales()
      .then((sales) => {
        const byCategory: Record<string, number> = {}
        for (const r of sales) {
          const cat = r.cat_id ?? r.dept_id ?? "Sin categoría"
          byCategory[cat] = (byCategory[cat] ?? 0) + r.units_sold
        }
        const total = Object.values(byCategory).reduce((s, v) => s + v, 0)
        const points = Object.entries(byCategory)
          .map(([name, value]) => ({ name, value: Math.round((value / total) * 100) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
        setData(points)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [refreshKey])

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener("pipeline:dataready", handler)
    return () => window.removeEventListener("pipeline:dataready", handler)
  }, [])

  if (loading) return <ChartSkeleton />

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-card-foreground">Distribución por Categoría</CardTitle>
        <CardDescription>Porcentaje de unidades vendidas por categoría</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Sin datos — sube un archivo de ventas primero.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [`${value}%`, ""]}
                contentStyle={{
                  backgroundColor: "oklch(1 0 0)",
                  border: "1px solid oklch(0.91 0.005 247)",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                }}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span style={{ color: "oklch(0.50 0.02 264)", fontSize: "12px" }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
