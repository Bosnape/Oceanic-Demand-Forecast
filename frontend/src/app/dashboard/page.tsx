"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { KpiCardsGrid } from "@/components/kpi-cards"
import { SalesForecastChart, InventoryChart, CategoryDistributionChart } from "@/components/dashboard-charts"
import { AlertsTable } from "@/components/alerts-table"
import { DemandAlertsTable } from "@/components/demand-alerts-table"
import { useAuth } from "@/lib/auth-context"
export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <DashboardLayout
      title="Dashboard de Decisiones"
      subtitle={`Bienvenido de nuevo, ${user?.name ?? "Usuario"}.`}
    >

      {/* KPI Cards */}
      <section aria-label="Indicadores clave" className="mb-8">
        <KpiCardsGrid />
      </section>

      {/* Charts Row */}
      <section aria-label="Graficas" className="mb-8 grid gap-6 lg:grid-cols-2">
        <SalesForecastChart />
        <InventoryChart />
      </section>

      {/* Alerts Row — stockout alerts + demand alerts lado a lado */}
      <section aria-label="Alertas" className="mb-8 grid gap-6 lg:grid-cols-2">
        <AlertsTable />
        <DemandAlertsTable />
      </section>

      {/* Bottom Row */}
      <section aria-label="Detalle" className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <CategoryDistributionChart />
        </div>
      </section>
    </DashboardLayout>
  )
}
