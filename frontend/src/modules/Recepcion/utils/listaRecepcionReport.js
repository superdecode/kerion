import * as XLSX from 'xlsx'
import { extractBaseCode } from '../../Shared/Wms/extractBaseCode'

export function getCodeBase(barcode) {
  return extractBaseCode(barcode) ?? ''
}

function assignTarimaNums(lines) {
  const baseToNum = new Map()
  let counter = 1
  for (const line of lines) {
    const base = getCodeBase(line.custom_box_barcode)
    if (base && !baseToNum.has(base)) {
      baseToNum.set(base, counter++)
    }
  }
  return baseToNum
}

function sortByBase(a, b) {
  return String(a.base || '').localeCompare(String(b.base || ''), 'es')
}

export function buildListaRecepcionData(order, lines, withTarimas = false) {
  const groups = new Map()
  for (const line of lines) {
    const base = getCodeBase(line.custom_box_barcode) || line.box_type || '—'
    if (!groups.has(base)) {
      groups.set(base, { base, cajas: 0, sku: line.sku || '', qty_per_box: line.qty_per_box || '' })
    }
    groups.get(base).cajas += 1
  }

  const tarimaNums = withTarimas ? assignTarimaNums(lines) : null

  const rows = []
  let totalCajas = 0
  for (const [, g] of groups) {
    rows.push({
      base: g.base,
      cajas: g.cajas,
      sku: g.sku,
      qty_per_box: g.qty_per_box,
      tarima: withTarimas ? (tarimaNums?.get(g.base) || '') : '',
    })
    totalCajas += g.cajas
  }
  rows.sort(sortByBase)

  const fecha = order.created_at ? new Date(order.created_at).toLocaleDateString('es-MX') : ''

  return {
    title: 'LISTA DE RECEPCIÓN',
    order,
    rows,
    totalCajas,
    totalGrupos: rows.length,
    withTarimas,
    generatedAt: new Date(),
    fecha,
  }
}

export function generateListaRecepcionXlsx(orderOrData, lines, withTarimas = false) {
  const data = lines
    ? buildListaRecepcionData(orderOrData, lines, withTarimas)
    : orderOrData

  const headers = ['#', 'Código base', 'Cajas', 'SKU', 'Qty/Caja']
  if (data.withTarimas) headers.push('# Tarima')

  const rows = data.rows.map((row, index) => {
    const values = [index + 1, row.base, row.cajas, row.sku, row.qty_per_box]
    if (data.withTarimas) values.push(row.tarima || '')
    return values
  })

  const totalRow = ['', 'TOTAL', data.totalCajas, '', '']
  if (data.withTarimas) totalRow.push('')

  const sheetData = [
    [data.title],
    [],
    ['Cliente:', data.order.cliente || ''],
    ['Orden WMS:', data.order.inbound_order_no || ''],
    ['Tracking:', data.order.tracking_no || ''],
    ['Referencia:', data.order.reference_no || ''],
    ['Fecha:', data.fecha],
    ['Folio:', data.order.folio],
    [],
    headers,
    ...rows,
    [],
    totalRow,
  ]

  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 10 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lista Recepcion')
  XLSX.writeFile(wb, `lista-recepcion-${data.order.folio}.xlsx`)
}
