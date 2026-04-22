"use client"

import { useCallback, useState, useRef } from "react"
import * as XLSX from "xlsx"
import axios from "axios"
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Trash2,
  Eye,
  ShoppingCart,
  Package,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { uploadSalesFile, uploadInventoryFile } from "@/lib/api"

type UploadType = "sales" | "inventory"

interface UploadedFile {
  id: string
  name: string
  size: number
  type: "csv" | "xlsx"
  uploadType: UploadType
  status: "uploading" | "processing" | "success" | "error"
  progress: number
  rows?: number
  columns?: string[]
  preview?: Record<string, unknown>[]
  error?: string
  dataSourceId?: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function parseFile(file: File): Promise<{ rows: number; columns: string[]; preview: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) throw new Error("No se pudo leer el archivo")

        let workbook: XLSX.WorkBook

        if (file.name.endsWith(".csv")) {
          workbook = XLSX.read(data, { type: "string", cellDates: true })
        } else {
          workbook = XLSX.read(data, { type: "array", cellDates: true })
        }

        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

        if (json.length === 0) throw new Error("El archivo esta vacio")

        const columns = Object.keys(json[0])
        const preview = json.slice(0, 10)

        resolve({ rows: json.length, columns, preview })
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Error al procesar el archivo"))
      }
    }

    reader.onerror = () => reject(new Error("Error al leer el archivo"))

    if (file.name.endsWith(".csv")) {
      reader.readAsText(file)
    } else {
      reader.readAsArrayBuffer(file)
    }
  })
}

export default function DataIngestionPage() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [uploadType, setUploadType] = useState<UploadType>("sales")
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerPipelineRefetch = useCallback(() => {
    window.dispatchEvent(new CustomEvent("pipeline:refetch"))
  }, [])

  const processFile = useCallback(async (file: File) => {
const ext = file.name.split(".").pop()?.toLowerCase()
if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  setFiles((prev) => [
    {
      id,
      name: file.name,
      size: file.size,
      type: "csv",
      uploadType,
      status: "error",
      progress: 100,
      error: `format not supported: .${ext ?? "unknown"}. Use .csv, .xlsx o .xls`,
    },
    ...prev,
  ])
  return
}

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const newFile: UploadedFile = {
      id,
      name: file.name,
      size: file.size,
      type: ext === "csv" ? "csv" : "xlsx",
      uploadType,
      status: "uploading",
      progress: 0,
    }

    setFiles((prev) => [newFile, ...prev])

    // Client-side parse runs in parallel for the preview table (non-blocking)
    parseFile(file)
      .then((result) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, columns: result.columns, preview: result.preview }
              : f,
          ),
        )
      })
      .catch(() => {
        // Preview is optional — API result is the source of truth
      })

    const uploadFn = uploadType === "sales" ? uploadSalesFile : uploadInventoryFile

    try {
      const response = await uploadFn(file, (percent) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, progress: percent, status: percent < 100 ? "uploading" : "processing" }
              : f,
          ),
        )
      })

      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: "success",
                progress: 100,
                rows: response.rows_saved,
                dataSourceId: response.data_source_id,
              }
            : f,
        ),
      )
      // Trigger immediate pipeline status check so the notification appears right away
      if (uploadType === "sales") {
        triggerPipelineRefetch()
      }
    } catch (err) {
      let message = "Error desconocido"
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.detail ?? err.message
      } else if (err instanceof Error) {
        message = err.message
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: "error", progress: 100, error: message }
            : f,
        ),
      )
    }
  }, [uploadType, triggerPipelineRefetch])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      droppedFiles.forEach(processFile)
    },
    [processFile],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files ?? [])
      selectedFiles.forEach(processFile)
      if (inputRef.current) inputRef.current.value = ""
    },
    [processFile],
  )

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setPreviewFile((prev) => (prev === id ? null : prev))
  }, [])

  const activePreview = files.find((f) => f.id === previewFile)

  return (
    <DashboardLayout title="Ingesta de Datos" subtitle="Cargue archivos CSV o Excel con datos históricos de ventas e inventario.">

      <Tabs defaultValue="upload" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="upload">Cargar Archivos</TabsTrigger>
          <TabsTrigger value="history">Historial de Cargas</TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload">
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Drop Zone */}
            <div className="lg:col-span-3">
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="text-card-foreground">Cargar Archivos</CardTitle>
                  <CardDescription>
                    Arrastre archivos CSV o Excel aqui, o haga clic para seleccionar
                  </CardDescription>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant={uploadType === "sales" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUploadType("sales")}
                      className="gap-1.5"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Ventas
                    </Button>
                    <Button
                      variant={uploadType === "inventory" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUploadType("inventory")}
                      className="gap-1.5"
                    >
                      <Package className="h-3.5 w-3.5" />
                      Inventario
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragActive(true)
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors",
                      dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
                    )}
                    role="button"
                    tabIndex={0}
                    aria-label="Zona de carga de archivos"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        inputRef.current?.click()
                      }
                    }}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      <Upload className="h-7 w-7 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        {dragActive ? "Suelte los archivos aqui" : "Arrastre y suelte sus archivos"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Formatos soportados: .csv, .xlsx, .xls (max 10MB)
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="pointer-events-none">
                      Seleccionar Archivos
                    </Button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      multiple
                      className="hidden"
                      onChange={handleFileInput}
                      aria-hidden="true"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* File Preview */}
              {activePreview?.preview && (
                <Card className="mt-6 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-card-foreground">
                      <Eye className="h-5 w-5 text-primary" />
                      Vista Previa: {activePreview.name}
                    </CardTitle>
                    <CardDescription>
                      Mostrando las primeras {activePreview.preview.length} filas de {activePreview.rows?.toLocaleString()} totales
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {activePreview.columns?.map((col) => (
                              <TableHead key={col}>{col}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activePreview.preview.map((row, idx) => (
                            <TableRow key={idx}>
                              {activePreview.columns?.map((col) => (
                                <TableCell key={col} className="text-card-foreground">
                                  {row[col] instanceof Date
                                    ? (row[col] as Date).toISOString().slice(0, 10)
                                    : String(row[col] ?? "")}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Uploaded Files List */}
            <div className="lg:col-span-2">
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="text-card-foreground">Archivos Cargados</CardTitle>
                  <CardDescription>
                    {files.length === 0
                      ? "No hay archivos cargados aun"
                      : `${files.length} archivo(s) en total`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                      <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        Los archivos cargados apareceran aqui
                      </p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {files.map((file) => (
                        <li
                          key={file.id}
                          className={cn(
                            "flex flex-col gap-2 rounded-lg border p-3 transition-colors",
                            previewFile === file.id && "border-primary bg-primary/5",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium leading-tight text-card-foreground">
                                    {file.name}
                                  </span>
                                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                                    {file.uploadType === "sales" ? "Ventas" : "Inventario"}
                                  </Badge>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatFileSize(file.size)}
                                  {file.rows && ` - ${file.rows.toLocaleString()} filas`}
                                  {file.columns && ` - ${file.columns.length} columnas`}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {file.status === "success" && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setPreviewFile(previewFile === file.id ? null : file.id)}
                                  aria-label="Ver vista previa"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeFile(file.id)}
                                aria-label="Eliminar archivo"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {(file.status === "uploading" || file.status === "processing") && (
                            <div className="flex flex-col gap-1">
                              <Progress value={file.progress} className="h-1.5" />
                              <span className="text-xs text-muted-foreground">
                                {file.status === "uploading" ? "Cargando..." : "Procesando datos..."}
                              </span>
                            </div>
                          )}
                          {file.status === "success" && (
                            <Badge variant="secondary" className="w-fit bg-success/10 text-success">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Procesado exitosamente
                            </Badge>
                          )}
                          {file.status === "error" && (
                          <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="break-words">{file.error ?? "Error processing file"}</span>
                          </div>
                        )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Data Checklist */}
              <Card className="mt-6 bg-card">
                <CardHeader>
                  <CardTitle className="text-card-foreground">Datos Requeridos</CardTitle>
                  <CardDescription>
                    Columnas necesarias para el motor predictivo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    <DataChecklistItem
                      area="Ventas"
                      fields={["SKU", "Fecha", "Cantidad", "Precio"]}
                      purpose="Predecir demanda y estacionalidad"
                    />
                    <DataChecklistItem
                      area="Inventario"
                      fields={["Stock diario", "Lead Time", "Devoluciones"]}
                      purpose="Optimizar punto de reorden"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-card-foreground">Historial de Cargas</CardTitle>
              <CardDescription>
                Registro de todos los archivos procesados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <FileSpreadsheet className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No hay registros de cargas aun</p>
                  <p className="text-sm text-muted-foreground">
                    Los archivos que procese apareceran aqui
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Archivo</TableHead>
                      <TableHead>Formato</TableHead>
                      <TableHead>Datos</TableHead>
                      <TableHead>Tamaño</TableHead>
                      <TableHead>Filas</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium text-card-foreground">{file.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{file.type.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {file.uploadType === "sales" ? "Ventas" : "Inventario"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatFileSize(file.size)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {file.rows?.toLocaleString() ?? "-"}
                        </TableCell>
                        <TableCell>
                          {file.status === "success" ? (
                            <Badge variant="secondary" className="bg-success/10 text-success">
                              Exitoso
                            </Badge>
                          ) : file.status === "error" ? (
                            <Badge variant="destructive">Error</Badge>
                          ) : (
                            <Badge variant="secondary">Procesando</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  )
}

function DataChecklistItem({
  area,
  fields,
  purpose,
}: {
  area: string
  fields: string[]
  purpose: string
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3">
      <span className="text-sm font-semibold text-foreground">{area}</span>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <Badge key={field} variant="outline" className="text-xs">
            {field}
          </Badge>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{purpose}</span>
    </div>
  )
}
