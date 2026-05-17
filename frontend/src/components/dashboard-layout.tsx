"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { NotificationBell } from "@/components/notification-bell"
import { PipelineToast } from "@/components/pipeline-toast"
import { getPredictionsStatus, getInventoryAlerts, getDemandAlerts, type PredictionsStatus } from "@/lib/api"
import { AlertTriangle, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Inventory alert toast — shown globally on every page via DashboardLayout
// ---------------------------------------------------------------------------
function InventoryAlertToast({
  criticalCount,
  totalCount,
  visible,
  abovePipeline,
  onDismiss,
}: {
  criticalCount: number
  totalCount: number
  visible: boolean
  abovePipeline: boolean
  onDismiss: () => void
}) {
  if (!visible || totalCount === 0) return null
  return (
    <div
      className={cn(
        "fixed right-4 z-50 pointer-events-none transition-all duration-300",
        abovePipeline ? "bottom-24" : "bottom-4",
      )}
    >
      <Card className="w-80 shadow-lg border-destructive/30 pointer-events-auto py-0 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <CardContent className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <AlertTriangle
                className={cn("h-5 w-5", criticalCount > 0 ? "text-destructive" : "text-orange-500")}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {criticalCount > 0
                  ? `${criticalCount} SKU${criticalCount > 1 ? "s" : ""} en riesgo crítico de stockout`
                  : `${totalCount} SKU${totalCount > 1 ? "s" : ""} con riesgo de stockout`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {criticalCount > 0 && totalCount > criticalCount
                  ? `+${totalCount - criticalCount} en atención · `
                  : ""}
                Revisa{" "}
                <a href="/inventory" className="font-medium text-foreground underline underline-offset-2">
                  Inventario → Riesgo Stockout
                </a>
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface DashboardLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  showLastRunAt?: boolean
}

const POLL_INTERVAL = 10000

/** Shared layout wrapper: sidebar, page header, pipeline status polling, and notifications. */
export function DashboardLayout({ children, title, subtitle, showLastRunAt }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  // Pipeline notification state
  const [pipelineStatus, setPipelineStatus] = useState<PredictionsStatus["status"]>("no_data")
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastDismissed, setToastDismissed] = useState(false)
  const prevStatusRef = useRef<PredictionsStatus["status"]>("no_data")
  const isInitialFetchRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inventory alert notification state
  const [invAlertTotal, setInvAlertTotal]       = useState(0)
  const [invAlertCritical, setInvAlertCritical] = useState(0)
  const [invToastVisible, setInvToastVisible]   = useState(false)
  const [invToastDismissed, setInvToastDismissed] = useState(false)
  const invAutoDismissRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const invProgressiveRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Persisted across navigations via sessionStorage — resets only on new predictions
  const invDismissedRef = useRef(
    typeof window !== "undefined" && sessionStorage.getItem("oceanic-inv-alert-dismissed") === "1"
  )

  const [demandAlertCount, setDemandAlertCount] = useState(0)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  // ------------------------------------------------------------------
  // Inventory alert fetch — runs on mount and on pipeline:dataready
  // ------------------------------------------------------------------
  const fetchInventoryAlerts = useCallback(async () => {
    try {
      const data = await getInventoryAlerts()
      const total    = data.alerts.length
      const critical = data.alerts.filter((a) => a.stock_status === "critical").length
      setInvAlertTotal(total)
      setInvAlertCritical(critical)

      if (total > 0 && !invDismissedRef.current) {
        setInvToastVisible(true)
        // Auto-dismiss after 8 s
        if (invAutoDismissRef.current) clearTimeout(invAutoDismissRef.current)
        invAutoDismissRef.current = setTimeout(() => setInvToastVisible(false), 8000)
      }
    } catch {
      // Silent — don't break layout if inventory endpoint is unavailable
    }
  }, [])

  const fetchDemandAlerts = useCallback(async () => {
    try {
      const data = await getDemandAlerts()
      setDemandAlertCount(data.alerts.length)
    } catch {
      // Silent — no romper el layout si el endpoint no está disponible
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getPredictionsStatus()
      const prev = prevStatusRef.current
      const next = data.status
      prevStatusRef.current = next
      setPipelineStatus(next)
      if (data.last_run_at) setLastRunAt(data.last_run_at)

      // Show toast on real transitions; skip auto-show on initial mount if already processing
      if (prev !== next) {
        if ((next === "processing" || next === "uploaded") && !isInitialFetchRef.current) {
          setToastDismissed(false)
          setToastVisible(true)
        }
        // Only show "ready" toast if we were previously processing (real transition)
        if (next === "ready" && (prev === "processing" || prev === "uploaded")) {
          setToastDismissed(false)
          setToastVisible(true)
          // Auto-dismiss after 10s
          if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
          autoDismissRef.current = setTimeout(() => setToastVisible(false), 10000)
          window.dispatchEvent(new CustomEvent("pipeline:dataready"))
          stopPolling()
        }
        if (next === "failed") {
          setToastDismissed(false)
          setToastVisible(true)
          stopPolling()
        }
      }

      isInitialFetchRef.current = false

      // Start/stop polling based on status
      if ((next === "processing" || next === "uploaded") && !pollRef.current) {
        pollRef.current = setInterval(fetchStatus, POLL_INTERVAL)
      } else if (next !== "processing" && next !== "uploaded") {
        stopPolling()
      }
    } catch {
      // Silent — don't break the layout if the API is unreachable
    }
  }, [stopPolling])

  // Initial fetch on mount — pipeline status
  useEffect(() => {
    fetchStatus()
    return () => {
      stopPolling()
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    }
  }, [fetchStatus, stopPolling])

  // Initial fetch on mount — inventory alerts
  // 150ms delay so the first render paints before the toast slides in
  useEffect(() => {
    const t = setTimeout(() => {
      fetchInventoryAlerts()
      fetchDemandAlerts()
    }, 150)
    return () => {
      clearTimeout(t)
      if (invAutoDismissRef.current) clearTimeout(invAutoDismissRef.current)
      if (invProgressiveRef.current)  clearTimeout(invProgressiveRef.current)
    }
  }, [fetchInventoryAlerts, fetchDemandAlerts])

  // Re-fetch inventory alerts when pipeline finishes with new predictions
  useEffect(() => {
    const handler = () => {
      sessionStorage.removeItem("oceanic-inv-alert-dismissed")
      invDismissedRef.current = false
      setInvToastDismissed(false)
      fetchInventoryAlerts()
      fetchDemandAlerts()
    }
    window.addEventListener("pipeline:dataready", handler)
    window.addEventListener("pipeline:refetch", handler)
    return () => {
      window.removeEventListener("pipeline:dataready", handler)
      window.removeEventListener("pipeline:refetch", handler)
    }
  }, [fetchInventoryAlerts, fetchDemandAlerts])

  // Listen for trigger from data-ingestion page after upload — pipeline
  useEffect(() => {
    const handler = () => fetchStatus()
    window.addEventListener("pipeline:refetch", handler)
    return () => window.removeEventListener("pipeline:refetch", handler)
  }, [fetchStatus])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/login")
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Cargando...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <main className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4 lg:px-8">
            <div className="flex flex-col gap-0.5">
              {title && (
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
              )}
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {showLastRunAt && lastRunAt && (
                <span className="hidden text-xs text-muted-foreground sm:block">
                  Actualizado:{" "}
                  {new Date(lastRunAt).toLocaleString("es-CO", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <NotificationBell
                hasActiveNotification={
                  (pipelineStatus === "processing" || pipelineStatus === "uploaded" || pipelineStatus === "failed") &&
                  toastDismissed
                }
                inventoryAlertCount={invAlertTotal}
                demandAlertCount={demandAlertCount}
                onClick={() => {
                  // Bell click → re-show inventory alert toast (primary) …
                  if (invAlertTotal > 0) {
                    invDismissedRef.current = false
                    setInvToastDismissed(false)
                    setInvToastVisible(true)
                    if (invAutoDismissRef.current) clearTimeout(invAutoDismissRef.current)
                    invAutoDismissRef.current = setTimeout(() => setInvToastVisible(false), 15000)
                  }
                  // … and re-show pipeline toast if applicable
                  if (pipelineStatus !== "no_data" && pipelineStatus !== "ready") {
                    setToastDismissed(false)
                    setToastVisible(true)
                  }
                }}
              />
            </div>
          </div>
          <div className="px-6 py-6 lg:px-8">{children}</div>
        </main>
      </div>

      <PipelineToast
        status={pipelineStatus}
        visible={toastVisible}
        lastRunAt={lastRunAt ?? undefined}
        onDismiss={() => { setToastVisible(false); setToastDismissed(true) }}
      />

      <InventoryAlertToast
        criticalCount={invAlertCritical}
        totalCount={invAlertTotal}
        visible={invToastVisible && !invToastDismissed}
        abovePipeline={toastVisible && !toastDismissed}
        onDismiss={() => {
          setInvToastVisible(false)
          setInvToastDismissed(true)
          invDismissedRef.current = true
          sessionStorage.setItem("oceanic-inv-alert-dismissed", "1")
        }}
      />
    </div>
  )
}
