"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { NotificationBell } from "@/components/notification-bell"
import { PipelineToast } from "@/components/pipeline-toast"
import { getPredictionsStatus, type PredictionsStatus } from "@/lib/api"

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getPredictionsStatus()
      const prev = prevStatusRef.current
      const next = data.status
      prevStatusRef.current = next
      setPipelineStatus(next)
      if (data.last_run_at) setLastRunAt(data.last_run_at)

      // Show toast on status transitions; also fires on initial load if already processing
      if (prev !== next) {
        if (next === "processing" || next === "uploaded") {
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

  // Initial fetch on mount
  useEffect(() => {
    fetchStatus()
    return () => {
      stopPolling()
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    }
  }, [fetchStatus, stopPolling])

  // Listen for trigger from data-ingestion page after upload
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
                hasActiveNotification={(pipelineStatus === "processing" || pipelineStatus === "uploaded" || pipelineStatus === "failed") && toastDismissed}
                onClick={() => { setToastDismissed(false); setToastVisible(true) }}
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
    </div>
  )
}
