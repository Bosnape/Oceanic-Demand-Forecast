"use client"

import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: "critical" | "warning" | "ok"
}

const config = {
  critical: {
    label: "Crítico",
    className: "bg-destructive/10 text-destructive animate-pulse",
  },
  warning: {
    label: "Atención",
    className: "bg-warning/10 text-warning",
  },
  ok: {
    label: "Estable",
    className: "bg-success/10 text-success",
  },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, className } = config[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {label}
    </span>
  )
}
