"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { DashboardLayout } from "@/components/dashboard-layout"
import { InventoryTable } from "@/components/tables/InventoryTable"
import { Skeleton } from "@/components/ui/skeleton"
import { getInventory, type InventoryItem } from "@/lib/api"
import { PackageX, ShoppingCart, TrendingDown, DollarSign } from "lucide-react"

type LoadState = "loading" | "ready" | "empty" | "error"

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [state, setState] = useState<LoadState>("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    getInventory()
      .then((data) => {
        setItems(data.items)
        setState(data.items.length === 0 ? "empty" : "ready")
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setState("empty")
        } else {
          setErrorMsg(
            axios.isAxiosError(err)
              ? (err.response?.data?.detail ?? err.message)
              : "Error desconocido"
          )
          setState("error")
        }
      })
  }, [])

  const totalStock = items.reduce((acc, i) => acc + i.current_stock, 0)

  const belowReorderCount = items.filter(
    (i) => i.reorder_point != null && i.current_stock <= i.reorder_point
  ).length

  const slowMovingCount = items.filter((i) => i.slow_moving_flag === true).length

  const totalImmobilized = items.reduce(
    (acc, i) => acc + (i.immobilized_capital ?? 0),
    0
  )

  return (
    <DashboardLayout
      title="Inventario"
      subtitle={
        state === "ready" ? `${items.length} SKUs cargados`
        : state === "loading" ? "Cargando datos..."
        : state === "empty" ? "Sin datos — sube un archivo de inventario primero"
        : "Error al cargar datos"
      }
    >
      {/* Stat cards */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {state === "loading" ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total en Stock"
              value={state === "ready" ? totalStock.toLocaleString() : "-"}
              sub="unidades en inventario"
              icon={<ShoppingCart className="h-5 w-5" />}
              iconColor="text-primary"
              iconBg="bg-primary/10"
            />
            <StatCard
              label="Por Reordenar"
              value={state === "ready" ? String(belowReorderCount) : "-"}
              sub="SKUs bajo punto de reorden"
              icon={<PackageX className="h-5 w-5" />}
              iconColor={belowReorderCount > 0 ? "text-destructive" : "text-muted-foreground"}
              iconBg={belowReorderCount > 0 ? "bg-destructive/10" : "bg-muted"}
              highlight={belowReorderCount > 0 ? "destructive" : undefined}
            />
            <StatCard
              label="Movimiento Lento"
              value={state === "ready" ? String(slowMovingCount) : "-"}
              sub="SKUs de movimiento lento"
              icon={<TrendingDown className="h-5 w-5" />}
              iconColor={slowMovingCount > 0 ? "text-warning" : "text-muted-foreground"}
              iconBg={slowMovingCount > 0 ? "bg-warning/10" : "bg-muted"}
              highlight={slowMovingCount > 0 ? "warning" : undefined}
            />
            <StatCard
              label="Capital Inmovilizado"
              value={
                state === "ready"
                  ? totalImmobilized > 0
                    ? `$${totalImmobilized.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    : "$0"
                  : "-"
              }
              sub="en inventario sin rotación"
              icon={<DollarSign className="h-5 w-5" />}
              iconColor={totalImmobilized > 0 ? "text-warning" : "text-muted-foreground"}
              iconBg={totalImmobilized > 0 ? "bg-warning/10" : "bg-muted"}
              highlight={totalImmobilized > 0 ? "warning" : undefined}
            />
          </>
        )}
      </section>

      {/* Table */}
      <section>
        {state === "loading" && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        )}
        {state === "ready" && <InventoryTable items={items} />}
        {state === "empty" && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground">No hay datos de inventario disponibles.</p>
            <p className="text-sm text-muted-foreground">
              Ve a{" "}
              <a href="/data-ingestion" className="text-primary underline underline-offset-2">
                Ingesta de Datos
              </a>{" "}
              y sube un archivo de inventario.
            </p>
          </div>
        )}
        {state === "error" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
            <p className="text-sm font-medium text-destructive">{errorMsg}</p>
          </div>
        )}
      </section>
    </DashboardLayout>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  iconColor,
  iconBg,
  highlight,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  highlight?: "destructive" | "warning"
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </div>
      </div>
      <p
        className={
          highlight === "destructive"
            ? "mt-2 text-2xl font-bold text-destructive"
            : highlight === "warning"
            ? "mt-2 text-2xl font-bold text-warning"
            : "mt-2 text-2xl font-bold tracking-tight text-card-foreground"
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
