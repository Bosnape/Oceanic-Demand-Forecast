"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { getSales, getSalesRange, type SaleRecord } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import {
  Package,
  DollarSign,
  Star,
  Search,
  X,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  Download,
  ChevronsUpDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from "date-fns"

const PAGE_SIZE = 10
function getBarColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1)
  const l = (0.42 + t * 0.28).toFixed(2)
  const c = (0.16 - t * 0.08).toFixed(2)
  return `oklch(${l} ${c} 250)`
}

const CAT_STYLES: Record<string, string> = {
  FOODS: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  HOUSEHOLD: "bg-blue-50 text-blue-700 border border-blue-200",
  HOBBIES: "bg-orange-50 text-orange-700 border border-orange-200",
}

const STORE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

type SortKey = "date" | "item_id" | "store_id" | "units_sold" | "sell_price" | "total"
type SortDir = "asc" | "desc"
type ChartMode = "top8" | "top20" | "all"

function formatRevenue(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function formatPct(curr: number, prev: number): { label: string; type: "positive" | "negative" | "neutral" } {
  if (prev === 0) return { label: "Sin período de comparación", type: "neutral" }
  const pct = ((curr - prev) / prev) * 100
  return {
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs período anterior`,
    type: pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral",
  }
}

interface KpiCardProps {
  title: string
  value: string
  delta?: string
  deltaType?: "positive" | "negative" | "neutral"
  sub?: string
  icon: React.ReactNode
  iconBg: string
  loading?: boolean
}

function KpiCard({ title, value, delta, deltaType, sub, icon, iconBg, loading }: KpiCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
          <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">{value}</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
          {delta && (
            <div className="flex items-center gap-1 mt-1">
              {deltaType === "positive" && <TrendingUp className="h-3 w-3 text-success" />}
              {deltaType === "negative" && <TrendingDown className="h-3 w-3 text-destructive" />}
              <span
                className={cn(
                  "text-xs font-medium",
                  deltaType === "positive" && "text-success",
                  deltaType === "negative" && "text-destructive",
                  deltaType === "neutral" && "text-muted-foreground",
                )}
              >
                {delta}
              </span>
            </div>
          )}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="ml-1 inline h-3 w-3 opacity-40" />
  return sortDir === "asc"
    ? <ChevronUp className="ml-1 inline h-3 w-3 text-primary" />
    : <ChevronDown className="ml-1 inline h-3 w-3 text-primary" />
}

export default function VentasHistoricasPage() {
  const [allRecords, setAllRecords] = useState<SaleRecord[]>([])
  const [prevRecords, setPrevRecords] = useState<SaleRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [storeFilter, setStoreFilter] = useState("")
  const [catFilter, setCatFilter] = useState("")
  const [dateRange, setDateRange] = useState<"1m" | "3m" | "6m" | "all">("6m")

  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)
  const [chartMode, setChartMode] = useState<ChartMode>("top8")

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const rangeRes = await getSalesRange().catch(() => null)
        const anchor = rangeRes ? parseISO(rangeRes.max_date) : new Date()

        const monthsMap: Record<typeof dateRange, number> = { "1m": 1, "3m": 3, "6m": 6, "all": 999 }
        const months = monthsMap[dateRange]

        const dateFrom = months >= 999
          ? undefined
          : format(startOfMonth(subMonths(anchor, months - 1)), "yyyy-MM-dd")
        const dateTo = format(endOfMonth(anchor), "yyyy-MM-dd")

        const prevDateFrom = months >= 999
          ? undefined
          : format(startOfMonth(subMonths(anchor, months * 2 - 1)), "yyyy-MM-dd")
        const prevDateTo = dateFrom
          ? format(endOfMonth(subMonths(anchor, months)), "yyyy-MM-dd")
          : undefined

        const [curr, prev] = await Promise.all([
          getSales({ date_from: dateFrom, date_to: dateTo }),
          prevDateFrom && prevDateTo
            ? getSales({ date_from: prevDateFrom, date_to: prevDateTo })
            : Promise.resolve([]),
        ])
        setAllRecords(curr)
        setPrevRecords(prev)
      } catch {
        setAllRecords([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dateRange])

  // Derived filter values
  const allStores = useMemo(() => {
    const s = new Set(allRecords.map((r) => r.store_id).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [allRecords])

  const allCats = useMemo(() => {
    const s = new Set(allRecords.map((r) => r.cat_id).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [allRecords])

  const storeColors = useMemo(() => {
    const map: Record<string, string> = {}
    allStores.forEach((s, i) => { map[s] = STORE_COLORS[i % STORE_COLORS.length] })
    return map
  }, [allStores])

  // Filtered records
  const filtered = useMemo(() => {
    return allRecords.filter((r) => {
      if (search && !r.item_id.toLowerCase().includes(search.toLowerCase())) return false
      if (storeFilter && r.store_id !== storeFilter) return false
      if (catFilter && r.cat_id !== catFilter) return false
      return true
    })
  }, [allRecords, search, storeFilter, catFilter])

  // KPIs
  const totalUnits = useMemo(() => filtered.reduce((s, r) => s + r.units_sold, 0), [filtered])
  const totalRevenue = useMemo(
    () => filtered.reduce((s, r) => s + r.units_sold * (r.sell_price ?? 0), 0),
    [filtered],
  )
  const prevUnits = prevRecords.reduce((s, r) => s + r.units_sold, 0)
  const prevRevenue = prevRecords.reduce((s, r) => s + r.units_sold * (r.sell_price ?? 0), 0)

  const topSku = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((r) => { map[r.item_id] = (map[r.item_id] ?? 0) + r.units_sold })
    const best = Object.entries(map).sort((a, b) => b[1] - a[1])[0]
    if (!best) return null
    const rev = filtered
      .filter((r) => r.item_id === best[0])
      .reduce((s, r) => s + r.units_sold * (r.sell_price ?? 0), 0)
    const pct = totalUnits > 0 ? (best[1] / totalUnits) * 100 : 0
    return { id: best[0], units: best[1], revenue: rev, pct }
  }, [filtered, totalUnits])

  // Chart data
  const chartData = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((r) => { map[r.item_id] = (map[r.item_id] ?? 0) + r.units_sold })
    const sorted = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([sku, units]) => ({ sku, units }))
    const limitMap: Record<ChartMode, number> = { top8: 8, top20: 20, all: Infinity }
    return sorted.slice(0, limitMap[chartMode])
  }, [filtered, chartMode])

  // Sorted & paginated table
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0
      if (sortKey === "date") { av = a.date; bv = b.date }
      else if (sortKey === "item_id") { av = a.item_id; bv = b.item_id }
      else if (sortKey === "store_id") { av = a.store_id ?? ""; bv = b.store_id ?? "" }
      else if (sortKey === "units_sold") { av = a.units_sold; bv = b.units_sold }
      else if (sortKey === "sell_price") { av = a.sell_price ?? 0; bv = b.sell_price ?? 0 }
      else if (sortKey === "total") {
        av = a.units_sold * (a.sell_price ?? 0)
        bv = b.units_sold * (b.sell_price ?? 0)
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(col); setSortDir("asc") }
    setPage(1)
  }

  const activeFilters: { label: string; clear: () => void }[] = [
    ...(search ? [{ label: `SKU: ${search}`, clear: () => { setSearch(""); setPage(1) } }] : []),
    ...(storeFilter ? [{ label: `Tienda: ${storeFilter}`, clear: () => { setStoreFilter(""); setPage(1) } }] : []),
    ...(catFilter ? [{ label: `Cat: ${catFilter}`, clear: () => { setCatFilter(""); setPage(1) } }] : []),
  ]

  function exportCsv() {
    const header = "Fecha,SKU,Tienda,Categoría,Unidades,Precio,Total"
    const rows = sorted.map((r) =>
      [
        r.date,
        r.item_id,
        r.store_id ?? "",
        r.cat_id ?? "",
        r.units_sold,
        r.sell_price?.toFixed(2) ?? "",
        (r.units_sold * (r.sell_price ?? 0)).toFixed(2),
      ].join(","),
    )
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "ventas-historicas.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const unitsChange = formatPct(totalUnits, prevUnits)
  const revenueChange = formatPct(totalRevenue, prevRevenue)

  const catLabel = (cat: string | null) => {
    if (!cat) return null
    const base = cat.split("_")[0]
    return { text: base.charAt(0) + base.slice(1).toLowerCase(), cls: CAT_STYLES[base] ?? "bg-muted text-foreground" }
  }

  return (
    <DashboardLayout
      title="Ventas Históricas"
      subtitle="Explore el desempeño pasado por producto, tienda y período"
    >
      {/* Header actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(["1m", "3m", "6m", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setDateRange(r); setPage(1) }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                dateRange === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {r === "all" ? "Todo" : r === "1m" ? "1 mes" : r === "3m" ? "3 meses" : "6 meses"}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          loading={loading}
          title="Unidades Vendidas"
          value={loading ? "—" : totalUnits.toLocaleString("es-CO")}
          delta={totalUnits > 0 ? unitsChange.label : undefined}
          deltaType={unitsChange.type}
          icon={<Package className="h-5 w-5" />}
          iconBg="bg-chart-1/10 text-chart-1"
        />
        <KpiCard
          loading={loading}
          title="Ingresos Totales"
          value={loading ? "—" : formatRevenue(totalRevenue)}
          delta={totalRevenue > 0 ? revenueChange.label : undefined}
          deltaType={revenueChange.type}
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-chart-2/10 text-chart-2"
        />
        {loading ? (
          <KpiCard
            loading
            title=""
            value=""
            icon={<Star className="h-5 w-5" />}
            iconBg="bg-chart-3/10 text-chart-3"
          />
        ) : topSku ? (
          <Card>
            <CardContent className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  SKU Más Vendido
                </span>
                <span className="mt-1 text-lg font-bold tracking-tight text-foreground">
                  {topSku.id}
                </span>
                <span className="text-xs text-muted-foreground">
                  {topSku.units.toLocaleString("es-CO")} uds · {formatRevenue(topSku.revenue)} ·{" "}
                  {topSku.pct.toFixed(1)}% del total
                </span>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-3/10 text-chart-3">
                <Star className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <KpiCard
            title="SKU Más Vendido"
            value="Sin datos"
            icon={<Star className="h-5 w-5" />}
            iconBg="bg-chart-3/10 text-chart-3"
          />
        )}
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por SKU…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <select
              value={storeFilter}
              onChange={(e) => { setStoreFilter(e.target.value); setPage(1) }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas las tiendas</option>
              {allStores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={catFilter}
              onChange={(e) => { setCatFilter(e.target.value); setPage(1) }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas las categorías</option>
              {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {activeFilters.length > 0 && (
              <button
                onClick={() => { setSearch(""); setStoreFilter(""); setCatFilter(""); setPage(1) }}
                className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-3 pt-2">
              {activeFilters.map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {f.label}
                  <button onClick={f.clear} className="opacity-70 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                {activeFilters.length} filtro{activeFilters.length > 1 ? "s" : ""} · {filtered.length.toLocaleString()} registros
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Unidades Vendidas por SKU
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ordenado por volumen · período seleccionado
              </p>
            </div>
            <div className="flex gap-1 rounded-lg border border-border bg-muted p-0.5">
              {(["top8", "top20", "all"] as ChartMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    chartMode === m
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "top8" ? "Top 8" : m === "top20" ? "Top 20" : "Todos"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-6 flex-1" style={{ width: `${80 - i * 12}%` }} />
                </div>
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay datos para mostrar con los filtros actuales.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 60, left: 8, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="oklch(0.91 0.005 247)" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                <YAxis
                  type="category"
                  dataKey="sku"
                  width={140}
                  tick={{ fontSize: 11, fill: "var(--foreground)" }}
                />
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString("es-CO"), "Unidades"]}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--foreground)",
                  }}
                />
                <Bar dataKey="units" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, formatter: (v: number) => v.toLocaleString() }}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={getBarColor(i, chartData.length)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Transacciones de Venta
            </h3>
            <p className="text-xs text-muted-foreground">
              {sorted.length.toLocaleString()} resultados · ordenadas por{" "}
              {sortKey === "date" ? "fecha" : sortKey} {sortDir === "desc" ? "descendente" : "ascendente"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col gap-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 border-b border-border px-5 py-3">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="h-3 flex-1" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {(
                    [
                      { key: "date", label: "Fecha" },
                      { key: "item_id", label: "SKU" },
                      { key: "store_id", label: "Tienda" },
                      { key: null, label: "Categoría" },
                      { key: "units_sold", label: "Unidades" },
                      { key: "sell_price", label: "Precio" },
                      { key: "total", label: "Total" },
                    ] as { key: SortKey | null; label: string }[]
                  ).map(({ key, label }) => (
                    <th
                      key={label}
                      onClick={key ? () => toggleSort(key) : undefined}
                      className={cn(
                        "px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
                        key && "cursor-pointer select-none hover:text-foreground",
                        (label === "Unidades" || label === "Precio" || label === "Total") && "text-right",
                      )}
                    >
                      {label}
                      {key && <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No hay registros para los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  pageData.map((r, i) => {
                    const total = r.units_sold * (r.sell_price ?? 0)
                    const cat = catLabel(r.cat_id)
                    const storeColor = r.store_id ? storeColors[r.store_id] : "var(--muted-foreground)"
                    return (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {r.date}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-foreground">
                            {r.item_id}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.store_id ? (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ background: storeColor }}
                              />
                              <span className="text-xs">{r.store_id}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {cat ? (
                            <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium", cat.cls)}>
                              {cat.text}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {r.units_sold.toLocaleString("es-CO")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {r.sell_price != null ? `$${r.sell_price.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {total > 0 ? `$${total.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {Math.min((page - 1) * PAGE_SIZE + 1, sorted.length)}–{Math.min(page * PAGE_SIZE, sorted.length)} de{" "}
              {sorted.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-xs hover:bg-muted disabled:opacity-40"
              >
                <ChevronUp className="h-3 w-3 -rotate-90" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const n = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                return (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md border text-xs",
                      n === page
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {n}
                  </button>
                )
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-xs hover:bg-muted disabled:opacity-40"
              >
                <ChevronDown className="h-3 w-3 -rotate-90" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </DashboardLayout>
  )
}
