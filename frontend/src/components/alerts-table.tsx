"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, ArrowDown, TrendingDown } from "lucide-react"
import { getInventory, type InventoryItem } from "@/lib/api"

interface AlertRow {
  id: string
  type: "critical" | "warning" | "info"
  product: string
  message: string
  daysToStockout: number | null
}

const KNOWN_STATUSES = new Set(["critical", "low", "excess"])

function buildAlerts(items: InventoryItem[]): AlertRow[] {
  // Only process items with a known, actionable stock_status
  const actionable = items.filter((i) => KNOWN_STATUSES.has(i.stock_status))
  const rows: AlertRow[] = []

  for (const item of actionable) {
    const dailyDemand = item.next_month_forecast > 0 ? item.next_month_forecast / 30 : null
    const days = dailyDemand ? Math.floor(item.current_stock / dailyDemand) : null

    if (item.stock_status === "critical") {
      rows.push({
        id: item.item_id,
        type: "critical",
        product: item.item_id,
        message: "Stock por debajo del punto de reorden",
        daysToStockout: days,
      })
    } else if (item.stock_status === "low") {
      rows.push({
        id: item.item_id,
        type: "warning",
        product: item.item_id,
        message: "Nivel de stock bajo",
        daysToStockout: days,
      })
    } else if (item.stock_status === "excess") {
      rows.push({
        id: item.item_id,
        type: "info",
        product: item.item_id,
        message: "Exceso de inventario detectado",
        daysToStockout: null,
      })
    }
  }

  const order = { critical: 0, warning: 1, info: 2 }
  rows.sort((a, b) => {
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type]
    if (a.daysToStockout === null) return 1
    if (b.daysToStockout === null) return -1
    return a.daysToStockout - b.daysToStockout
  })

  return rows.slice(0, 10)
}

export function AlertsTable() {
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasTbd, setHasTbd] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener("pipeline:dataready", handler)
    return () => window.removeEventListener("pipeline:dataready", handler)
  }, [])

  useEffect(() => {
    setLoading(true)
    getInventory()
      .then((res) => {
        setAlerts(buildAlerts(res.items))
        setHasTbd(res.items.some((i) => i.stock_status === "TBD"))
      })
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }, [refreshKey])

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-card-foreground">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Alertas de Inventario
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {hasTbd
              ? "Análisis de alertas disponible en Sprint 2 — requiere integración con predicciones."
              : "Sin alertas activas — inventario en buen estado."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="hidden md:table-cell">Alerta</TableHead>
                <TableHead className="text-right">Días a Stockout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell>
                    <Badge
                      variant={alert.type === "critical" ? "destructive" : "secondary"}
                      className={
                        alert.type === "warning"
                          ? "bg-warning text-warning-foreground"
                          : alert.type === "info"
                            ? "bg-chart-1/10 text-chart-1"
                            : ""
                      }
                    >
                      {alert.type === "critical" ? "Crítico" : alert.type === "warning" ? "Atención" : "Info"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-card-foreground">{alert.product}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{alert.message}</TableCell>
                  <TableCell className="text-right">
                    {alert.daysToStockout !== null ? (
                      <span className="flex items-center justify-end gap-1">
                        {alert.daysToStockout <= 7 ? (
                          <ArrowDown className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className={alert.daysToStockout <= 7 ? "font-semibold text-destructive" : "text-muted-foreground"}>
                          {alert.daysToStockout} días
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
