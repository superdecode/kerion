import * as XLSX from 'xlsx'

self.onmessage = (event) => {
  const { buffer } = event.data || {}

  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    self.postMessage({ ok: true, rows })
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error?.message || 'No se pudo procesar el archivo',
    })
  }
}
