export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columnsMapping?: { [K in keyof T]?: string }
) {
  if (!data || !data.length) return

  // Si se pasa un mapeo de columnas, usar ese orden. Si no, tomar las keys del primer objeto.
  const keys = columnsMapping
    ? (Object.keys(columnsMapping) as (keyof T)[])
    : (Object.keys(data[0]) as (keyof T)[])

  const headers = columnsMapping
    ? keys.map((k) => columnsMapping[k])
    : keys

  // Helper para escapar valores de CSV (comillas, comas, saltos de línea)
  const escapeCsvValue = (val: any) => {
    if (val === null || val === undefined) return ""
    const str = String(val)
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`
    }
    return str
  }

  // Generar contenido CSV
  const csvRows = []
  csvRows.push(headers.join(",")) // Header row

  for (const row of data) {
    const values = keys.map((key) => {
      // Manejo especial para valores numéricos para forzar hasta 2 decimales si no son enteros
      const val = row[key]
      if (typeof val === "number" && !Number.isInteger(val)) {
        return escapeCsvValue(val.toFixed(2))
      }
      return escapeCsvValue(val)
    })
    csvRows.push(values.join(","))
  }

  const csvString = csvRows.join("\n")

  // Crear y descargar el archivo
  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" }) // \uFEFF para soportar UTF-8 BOM en Excel
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
