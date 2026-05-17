"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { DashboardLayout } from "@/components/dashboard-layout";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadLog {
  id: number;
  filename: string;
  file_type: "sales" | "inventory";
  upload_date: string;
  status: "success" | "failed";
  records_processed: number | null;
  error_message: string | null;
}

interface ModelExecutionLog {
  id: number;
  execution_date: string;
  status: "success" | "failed";
  skus_trained: number | null;
  avg_mae: number | null;
  avg_rmse: number | null;
  avg_mape: number | null;
  avg_coverage_ic: number | null;
  duration_seconds: number | null;
  error_message: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });

const fmtNum = (n: number | null, decimals = 4) =>
  n !== null && n !== undefined ? n.toFixed(decimals) : "—";

function StatusBadge({ status }: { status: "success" | "failed" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold
        ${
          status === "success"
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-red-50 text-red-700 ring-1 ring-red-200"
        }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      {status === "success" ? "Éxito" : "Error"}
    </span>
  );
}

function FileTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium
        ${
          type === "sales"
            ? "bg-blue-50 text-blue-700"
            : "bg-violet-50 text-violet-700"
        }`}
    >
      {type === "sales" ? "Ventas" : "Inventario"}
    </span>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-slate-100">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-3 rounded bg-slate-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [uploadLogs, setUploadLogs] = useState<UploadLog[]>([]);
  const [modelLogs, setModelLogs] = useState<ModelExecutionLog[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [loadingModel, setLoadingModel] = useState(true);
  const [errorUploads, setErrorUploads] = useState<string | null>(null);
  const [errorModel, setErrorModel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"uploads" | "model">("uploads");

  useEffect(() => {
    api
      .get<UploadLog[]>("/api/logs/uploads")
      .then((r) => setUploadLogs(r.data))
      .catch(() => setErrorUploads("No se pudieron cargar los logs de carga."))
      .finally(() => setLoadingUploads(false));

    api
      .get<ModelExecutionLog[]>("/api/logs/model-executions")
      .then((r) => setModelLogs(r.data))
      .catch(() =>
        setErrorModel("No se pudieron cargar los logs de ejecución.")
      )
      .finally(() => setLoadingModel(false));
  }, []);

  return (
    <DashboardLayout title="Audit Logs" subtitle="Historial de cargas de datos y ejecuciones del modelo de pronóstico.">
    <div className="min-h-screen bg-slate-50 px-6 py-8">

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Total cargas"
          value={uploadLogs.length}
          loading={loadingUploads}
        />
        <SummaryCard
          label="Cargas exitosas"
          value={uploadLogs.filter((l) => l.status === "success").length}
          loading={loadingUploads}
          accent="emerald"
        />
        <SummaryCard
          label="Ejecuciones ML"
          value={modelLogs.length}
          loading={loadingModel}
        />
        <SummaryCard
          label="Ejecuciones exitosas"
          value={modelLogs.filter((l) => l.status === "success").length}
          loading={loadingModel}
          accent="emerald"
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {(["uploads", "model"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors
              ${
                activeTab === tab
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
          >
            {tab === "uploads" ? "Cargas de datos" : "Ejecuciones del modelo"}
          </button>
        ))}
      </div>

      {/* Panel: Upload Logs */}
      {activeTab === "uploads" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-800">
              Historial de cargas
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cada archivo subido a /upload-sales o /upload-inventory
            </p>
          </div>
          {errorUploads ? (
            <p className="p-6 text-sm text-red-600">{errorUploads}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Archivo</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Registros</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUploads ? (
                    <TableSkeleton cols={7} />
                  ) : uploadLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        No hay registros de cargas todavía.
                      </td>
                    </tr>
                  ) : (
                    uploadLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-slate-50 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-400">{log.id}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-700">
                          {log.filename}
                        </td>
                        <td className="px-4 py-3">
                          <FileTypeBadge type={log.file_type} />
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {fmt(log.upload_date)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {log.records_processed?.toLocaleString() ?? "—"}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-xs text-red-500">
                          {log.error_message ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Panel: Model Execution Logs */}
      {activeTab === "model" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-800">
              Ejecuciones del modelo Prophet
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Una fila por ejecución completa del pipeline — métricas agregadas de todos los SKUs entrenados
            </p>
          </div>
          {errorModel ? (
            <p className="p-6 text-sm text-red-600">{errorModel}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">SKUs</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">MAE prom.</th>
                    <th className="px-4 py-3 text-right">RMSE prom.</th>
                    <th className="px-4 py-3 text-right">MAPE prom.</th>
                    <th className="px-4 py-3 text-right">Coverage prom.</th>
                    <th className="px-4 py-3 text-right">Duración (s)</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingModel ? (
                    <TableSkeleton cols={10} />
                  ) : modelLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        No hay ejecuciones registradas todavía.
                      </td>
                    </tr>
                  ) : (
                    modelLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-slate-50 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-400">{log.id}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {fmt(log.execution_date)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {log.skus_trained ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {fmtNum(log.avg_mae, 2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {fmtNum(log.avg_rmse, 2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {log.avg_mape !== null ? `${log.avg_mape.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {log.avg_coverage_ic !== null
                            ? `${log.avg_coverage_ic.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                          {fmtNum(log.duration_seconds, 1)}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-xs text-red-500">
                          {log.error_message ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}

// ─── SummaryCard ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  loading,
  accent = "slate",
}: {
  label: string;
  value: number;
  loading: boolean;
  accent?: "slate" | "emerald";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-slate-100" />
      ) : (
        <p
          className={`mt-1 text-2xl font-bold tabular-nums
            ${accent === "emerald" ? "text-emerald-600" : "text-slate-900"}`}
        >
          {value}
        </p>
      )}
    </div>
  );
}
