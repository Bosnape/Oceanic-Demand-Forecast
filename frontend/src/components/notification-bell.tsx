"use client"

import { Bell } from "lucide-react"

interface NotificationBellProps {
  /** Shows a pulsing dot for pipeline status (processing / failed) */
  hasActiveNotification: boolean
  /** Shows a numeric badge for inventory stockout alerts */
  inventoryAlertCount?: number
  /** Shows additional count for demand deviation alerts */
  demandAlertCount?: number
  onClick: () => void
}

export function NotificationBell({ hasActiveNotification, inventoryAlertCount = 0, demandAlertCount = 0, onClick }: NotificationBellProps) {
  const totalCount = inventoryAlertCount + demandAlertCount
  const showCount  = totalCount > 0
  const showDot    = !showCount && hasActiveNotification

  return (
    <button
      onClick={onClick}
      title="Notificaciones"
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <Bell className="h-4 w-4" />

      {/* Numeric badge — combined inventory + demand alerts */}
      {showCount && (
        <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white">
          {totalCount > 9 ? "9+" : totalCount}
        </span>
      )}

      {/* Dot — pipeline activity only */}
      {showDot && (
        <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive" />
      )}

      <span className="sr-only">Notificaciones</span>
    </button>
  )
}
