"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { PredictionsStatus } from "@/lib/api"

interface PipelineToastProps {
  status: PredictionsStatus["status"]
  visible: boolean
  onDismiss: () => void
  lastRunAt?: string
}

/** Floating toast that shows Prophet pipeline status transitions and the last-run timestamp. */
export function PipelineToast({ status, visible, onDismiss, lastRunAt }: PipelineToastProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const shouldShow =
    visible &&
    (status === "processing" || status === "uploaded" || status === "ready" || status === "failed")

  if (!mounted || !shouldShow) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
      <Card
        className={cn(
          "w-80 shadow-lg border-border pointer-events-auto py-0",
          "animate-in slide-in-from-bottom-4 fade-in duration-300",
        )}
      >
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              {(status === "processing" || status === "uploaded") && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
              {status === "ready" && <CheckCircle2 className="h-5 w-5 text-success" />}
              {status === "failed" && <XCircle className="h-5 w-5 text-destructive" />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {(status === "processing" || status === "uploaded") && "Generando predicciones..."}
                {status === "ready" && "¡Predicciones listas!"}
                {status === "failed" && "Error al generar predicciones"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(status === "processing" || status === "uploaded") && "Esto puede tomar varios minutos."}
                {status === "ready" && (
                  <>
                    {lastRunAt && (
                      <span className="block">
                        {new Date(lastRunAt).toLocaleString("es-CO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    <Link href="/predictions" className="text-primary hover:underline">
                      Ver predicciones →
                    </Link>
                  </>
                )}
                {status === "failed" && "Intenta subir el archivo nuevamente."}
              </p>
            </div>

            <button
              onClick={onDismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
