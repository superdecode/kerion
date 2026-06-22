function sheetName(name, fallback) {
  const clean = String(name || fallback)
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
  return (clean || fallback).slice(0, 31)
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function flattenObject(value, prefix = '') {
  const out = {}
  Object.entries(value || {}).forEach(([key, val]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(val)) {
      Object.assign(out, flattenObject(val, nextKey))
    } else if (Array.isArray(val)) {
      out[nextKey] = val.length
    } else {
      out[nextKey] = val
    }
  })
  return out
}

function appendJsonSheet(XLSX, workbook, rows, name) {
  const safeRows = rows.length > 0 ? rows : [{}]
  const worksheet = XLSX.utils.json_to_sheet(safeRows.map(row => flattenObject(row)))
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName(name, 'Datos'))
}

function appendMetricSheet(XLSX, workbook, object, name) {
  const rows = Object.entries(object || {}).map(([metric, value]) => ({ metric, value }))
  appendJsonSheet(XLSX, workbook, rows, name)
}

export function exportDashboardToExcel(XLSX, { moduleLabel, dateRange, payload, t }) {
  const workbook = XLSX.utils.book_new()
  const data = payload?.data || payload || {}

  appendJsonSheet(XLSX, workbook, [{
    modulo: moduleLabel,
    fecha_inicio: dateRange?.from || '',
    fecha_fin: dateRange?.to || '',
    generado_en: new Date().toISOString(),
  }], t('dashboard.export.metaSheet'))

  if (data.resumen) appendMetricSheet(XLSX, workbook, data.resumen, t('dashboard.export.summarySheet'))
  if (data.kpis) appendMetricSheet(XLSX, workbook, data.kpis, t('dashboard.export.kpiSheet'))

  const chartGroups = data.graficas || {}
  Object.entries(chartGroups).forEach(([name, value]) => {
    if (Array.isArray(value)) appendJsonSheet(XLSX, workbook, value, name)
  })

  const tableGroups = data.tablas || {}
  Object.entries(tableGroups).forEach(([name, value]) => {
    if (Array.isArray(value)) appendJsonSheet(XLSX, workbook, value, name)
  })

  ;[
    ['orders', data.orders],
    ['users', Array.isArray(data.users) ? data.users : data.users?.users],
    ['roles', Array.isArray(data.roles) ? data.roles : data.roles?.roles],
    ['guias_por_hora', data.guias_por_hora],
    ['por_empresa', data.por_empresa],
    ['por_operador', data.por_operador],
    ['sesiones_activas', data.sesiones_activas],
  ].forEach(([name, value]) => {
    if (Array.isArray(value)) appendJsonSheet(XLSX, workbook, value, name)
  })

  if (workbook.SheetNames.length === 1) appendJsonSheet(XLSX, workbook, [flattenObject(data)], t('dashboard.export.dataSheet'))

  const safeModule = String(moduleLabel || 'dashboard')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  XLSX.writeFile(workbook, `dashboard_${safeModule}_${dateRange?.from || 'inicio'}_${dateRange?.to || 'fin'}.xlsx`)
}
