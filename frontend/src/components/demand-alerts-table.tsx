"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TrendingUp, TrendingDown, Activity, ChevronDown, ChevronUp, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { getDemandAlerts, type DemandAlert } from "@/lib/api"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

// ---------------------------------------------------------------------------
// Guía informativa
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

function DemandAlertsGuide() {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cómo interpretar las alertas de demanda"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-96 p-4 text-xs space-y-4">
        <p className="text-sm font-semibold text-foreground">Cómo leer las alertas de demanda</p>

        <div className="rounded-md bg-muted/60 px-3 py-2">
          <p className="text-muted-foreground leading-relaxed">
            Compara el <span className="font-medium text-foreground">promedio diario pronosticado</span> (próximos 30 días)
            contra las <span className="font-medium text-foreground">ventas históricas recientes</span> (últimos 30 días).
            Una desviación grande indica que la demanda se está alejando del comportamiento habitual del SKU.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Severidad</p>
          <GuideRow dot="bg-destructive" label="Crítico"  desc="Desviación ≥40% respecto al histórico reciente. Requiere atención inmediata." />
          <GuideRow dot="bg-warning"     label="Atención" desc="Desviación ≥25%. Monitorear y planificar con anticipación." />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dirección</p>
          <GuideRow dot="bg-blue-400" label="Alza"  desc="El pronóstico supera las ventas recientes. Considera aumentar el stock." />
          <GuideRow dot="bg-slate-400" label="Caída" desc="El pronóstico está por debajo del histórico. Revisa si hay sobrestock." />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Columnas</p>
          <ColRow label="Desviación"          desc="Diferencia porcentual entre pronóstico e histórico. Positivo = alza, negativo = caída." />
          <ColRow label="Histórico → Pron."   desc="Promedio diario vendido en los últimos 30 días vs el pronosticado para los próximos 30." />
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

// ---------------------------------------------------------------------------
// Helpers de estilo por severidad
// ---------------------------------------------------------------------------

function rowStyle(severity: DemandAlert["severity"]) {
  return severity === "critical"
    ? "border-l-2 border-l-destructive bg-destructive/5 hover:bg-destructive/10"
    : "border-l-2 border-l-warning bg-warning/5 hover:bg-warning/10"
}

function badgeStyle(severity: DemandAlert["severity"]) {
  return severity === "critical"
    ? "bg-destructive/15 text-destructive"
    : "bg-warning/15 text-warning"
}

function deviationStyle(severity: DemandAlert["severity"]) {
  return severity === "critical" ? "text-destructive" : "text-warning"
}

function severityLabel(severity: DemandAlert["severity"]) {
  return severity === "critical" ? "Crítico" : "Atención"
}

// ---------------------------------------------------------------------------
// Fila individual
// ---------------------------------------------------------------------------

function DemandAlertRow({ alert }: { alert: DemandAlert }) {
  const isSurge = alert.direction === "surge"

  return (
    <TableRow className={cn("transition-colors", rowStyle(alert.severity))}>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge variant="secondary" className={cn("gap-1 w-fit", badgeStyle(alert.severity))}>
            {isSurge ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {severityLabel(alert.severity)}
          </Badge>
          <span className="text-[10px] text-muted-foreground pl-0.5">
            {isSurge ? "Alza" : "Caída"}
          </span>
        </div>
      </TableCell>

      <TableCell className="font-medium text-card-foreground">
        {alert.item_id}
      </TableCell>

      <TableCell>
        <span className={cn("font-semibold", deviationStyle(alert.severity))}>
          {isSurge ? "+" : ""}{alert.deviation_pct}%
        </span>
      </TableCell>

      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
        <span>{alert.historical_avg.toFixed(1)} uds/día</span>
        <span className="mx-1.5 text-muted-foreground/50">→</span>
        <span className="font-medium text-card-foreground">{alert.forecast_avg.toFixed(1)} uds/día</span>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

/** Demand deviation alerts: forecast vs recent historical sales per SKU. */
export function DemandAlertsTable() {
  const [alerts, setAlerts]         = useState<DemandAlert[]>([])
  const [message, setMessage]       = useState("")
  const [loading, setLoading]       = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expanded, setExpanded]     = useState(false)

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
    getDemandAlerts()
      .then((res) => {
        setAlerts(res.alerts)
        setMessage(res.message)
      })
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const VISIBLE_LIMIT = 3
  const visibleAlerts = expanded ? alerts : alerts.slice(0, VISIBLE_LIMIT)
  const hiddenCount   = alerts.length - VISIBLE_LIMIT
  const criticalCount = alerts.filter((a) => a.severity === "critical").length
  const warningCount  = alerts.filter((a) => a.severity === "warning").length

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-card-foreground">
          <Activity className="h-5 w-5 text-warning" />
          Alertas de Demanda
          <DemandAlertsGuide />
          {alerts.length > 0 && (
            <Badge variant="secondary" className="ml-auto bg-warning/10 text-warning">
              {alerts.length} activas
            </Badge>
          )}
        </CardTitle>
        {criticalCount > 0 && (
          <CardDescription className="text-destructive font-medium">
            {criticalCount} SKU{criticalCount > 1 ? "s" : ""} con desviación crítica ≥40%
          </CardDescription>
        )}
        {criticalCount === 0 && warningCount > 0 && (
          <CardDescription>
            {warningCount} SKU{warningCount > 1 ? "s" : ""} con desviación moderada ≥25%
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {message || "Sin alertas — la demanda proyectada es consistente con el histórico reciente."}
            </p>
          </div>
        ) : (
          <>
            {message && (
              <p className="text-xs text-muted-foreground mb-3">{message}</p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs uppercase tracking-wide">
                    <TableHead>Tipo</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Desviación</TableHead>
                    <TableHead className="hidden md:table-cell">Histórico → Pronóstico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleAlerts.map((alert) => (
                    <DemandAlertRow key={alert.item_id} alert={alert} />
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
