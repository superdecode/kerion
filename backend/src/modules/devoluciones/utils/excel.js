import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const HEADERS = {
  entradas: {
    es: ['Codigo sesion', 'Fecha', 'Responsable', 'Ubicacion', 'Trazabilidad', 'Embalaje1', 'Embalaje2', 'SKU', 'SKU2', 'Descripcion', 'Cantidad', 'Peso', 'Largo', 'Ancho', 'Alto', 'Multicaja', 'Notas'],
    zh: ['会话编码', '日期', '负责人', '库位', '追踪码', '包装1', '包装2', 'SKU', 'SKU2', '描述', '数量', '重量', '长', '宽', '高', '多箱', '备注'],
  },
  salidas: {
    es: ['Codigo salida', 'Fecha', 'Responsable', 'Ubicacion', 'Trazabilidad', 'SKU', 'SKU2', 'Descripcion', 'Cantidad solicitada', 'Cantidad surtida', 'Surtido', 'Notas'],
    zh: ['出库编码', '日期', '负责人', '库位', '追踪码', 'SKU', 'SKU2', '描述', '申请数量', '实配数量', '已配货', '备注'],
  },
}

async function loadXlsx() {
  try {
    return await import('xlsx')
  } catch {
    const fallback = path.resolve(__dirname, '../../../../../frontend/node_modules/xlsx/xlsx.mjs')
    return import(pathToFileURL(fallback).href)
  }
}

function normalizeRows(rows) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value ?? ''])
    )
  )
}

async function workbookBuffer(kind, rows) {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  const normalized = normalizeRows(rows)

  const sheets = [
    ['ES', HEADERS[kind].es],
    ['ZH', HEADERS[kind].zh],
  ]

  for (const [name, headers] of sheets) {
    const data = [headers, ...normalized.map((row) => Object.values(row))]
    const ws = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export async function buildEntradaWorkbook(rows) {
  return workbookBuffer('entradas', rows)
}

export async function buildSalidaWorkbook(rows) {
  return workbookBuffer('salidas', rows)
}
