"use client"

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { monthlySales, topSkusByVolume } from "@/data/inventoryData"

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
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export function ForecastChart() {
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-card-foreground">Proyección de Unidades Vendidas</CardTitle>
        <CardDescription>
          Ventas reales vs predicción por promedio móvil — CA_1 top 35 SKUs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={monthlySales} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradUnits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.45 0.18 250)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="oklch(0.45 0.18 250)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPredicted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.65 0.19 165)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="oklch(0.65 0.19 165)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 247)" />
            <XAxis
              dataKey="month"
              tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span style={{ color: "oklch(0.50 0.02 264)", fontSize: "12px" }}>{value}</span>
              )}
            />
            <Area
              type="monotone"
              dataKey="units"
              name="Real"
              stroke="oklch(0.45 0.18 250)"
              strokeWidth={2}
              fill="url(#gradUnits)"
              dot={{ fill: "oklch(0.45 0.18 250)", r: 3 }}
            />
            <Area
              type="monotone"
              dataKey="predicted"
              name="Predicción"
              stroke="oklch(0.65 0.19 165)"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="url(#gradPredicted)"
              dot={{ fill: "oklch(0.65 0.19 165)", r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function TopSkusChart() {
  const data = topSkusByVolume.map((s) => ({
    sku: s.sku.replace("FOODS_", ""),
    ventas: s.avgDaily,
    stock: s.stock,
  }))

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-card-foreground">Top 5 SKUs por Volumen</CardTitle>
        <CardDescription>Promedio de unidades vendidas por día vs stock actual</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 247)" />
            <XAxis
              dataKey="sku"
              tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "oklch(0.50 0.02 264)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span style={{ color: "oklch(0.50 0.02 264)", fontSize: "12px" }}>{value}</span>
              )}
            />
            <Bar
              dataKey="ventas"
              name="Venta/día"
              fill="oklch(0.45 0.18 250)"
              radius={[6, 6, 0, 0]}
            />
            <Bar
              dataKey="stock"
              name="Stock actual"
              fill="oklch(0.65 0.19 165)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
