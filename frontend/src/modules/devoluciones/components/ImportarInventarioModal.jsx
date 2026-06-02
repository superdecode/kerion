import { useState, useRef, useMemo } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Trash2,
  Download, TrendingUp, TrendingDown, Minus, ArrowRight, Package,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { importarInventario } from '../services/devolucionesService'
import * as XLSX from 'xlsx'

const TIPO_AJUSTE_OPTS = [
  { value: 'set', label: 'Fijar exacto' },
  { value: 'add', label: 'Aumentar (+)' },
  { value: 'subtract', label: 'Reducir (-)' },
]

const IMPORT_TYPES = [
  {
    value: 'ajuste',
    label: 'Ajuste de inventario',
    desc: 'Modifica cantidades de SKUs existentes. Puede aumentar, reducir o fijar valor exacto.',
  },
  {
    value: 'importacion',
    label: 'Importación de nuevos registros',
    desc: 'Importa SKUs nuevos que no existen en inventario. También puede ajustar existentes.',
  },
]

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function pickField(raw, candidates) {
  const keys = Object.keys(raw)
  for (const k of keys) {
    if (candidates.includes(k.toLowerCase().trim())) return raw[k]
  }
  return ''
}

function normalizeRow(raw, idx) {
  return {
    _rowId: idx,
    _sheetRowNumber: idx + 2,
    sku: String(pickField(raw, ['sku', 'codigo', 'code']) || '').trim(),
    cantidad: pickField(raw, ['cantidad', 'qty', 'quantity', 'stock']),
    tipo_ajuste: String(pickField(raw, ['tipo_ajuste', 'tipo', 'type', 'ajuste', 'operacion']) || '').toLowerCase().trim() || 'set',
    descripcion: String(pickField(raw, ['descripcion', 'description', 'desc', 'motivo', 'nota']) || '').trim(),
    ubicacion: String(pickField(raw, ['ubicacion', 'ubicación', 'location', 'loc', 'bodega']) || '').trim(),
    guia1: String(pickField(raw, ['guia1', 'guía1', 'guia_1', 'guía_1', 'tracking1']) || '').trim(),
    guia2: String(pickField(raw, ['guia2', 'guía2', 'guia_2', 'guía_2', 'tracking2']) || '').trim(),
    multicaja: String(pickField(raw, ['multicaja', 'multi_caja', 'box_id']) || '').trim(),
    observacion: String(pickField(raw, ['observacion', 'observación', 'comment', 'comentario', 'obs']) || '').trim(),
  }
}

function computeExpected(row, stockActual) {
  const cant = Number(row.cantidad)
  if (isNaN(cant)) return null
  if (row.tipo_ajuste === 'add') return (stockActual || 0) + cant
  if (row.tipo_ajuste === 'subtract') return Math.max(0, (stockActual || 0) - cant)
  return cant
}

function validateRow(row, inventario, tipoImport, ubicaciones = []) {
  const errors = []
  if (!row.sku) errors.push('SKU requerido')

  const cantNum = parseFloat(row.cantidad)
  if (row.cantidad === '' || row.cantidad === undefined || isNaN(cantNum)) {
    errors.push('Cantidad inválida')
  } else if (cantNum < 0) {
    errors.push('Cantidad no puede ser negativa')
  }

  const tipoAj = ['set', 'add', 'subtract'].includes(row.tipo_ajuste) ? row.tipo_ajuste : 'set'
  const match = inventario.find(i => i.sku?.toLowerCase() === row.sku?.toLowerCase())
  const normalizedUbicacion = row.ubicacion?.trim().toLowerCase()
  const ubicacionExiste = normalizedUbicacion
    ? ubicaciones.some(u => u.codigo?.trim().toLowerCase() === normalizedUbicacion)
    : false

  if (!match && tipoImport === 'ajuste') {
    errors.push('SKU no encontrado en inventario')
  }
  if (row.ubicacion && !ubicacionExiste) {
    errors.push('Ubicación no encontrada')
  }
  if (tipoImport === 'importacion' && !match && !row.ubicacion) {
    errors.push('Ubicación requerida para SKU nuevo')
  }

  const stockActual = match?.cantidad_disponible ?? null
  const expected = errors.length === 0 ? computeExpected({ ...row, tipo_ajuste: tipoAj }, stockActual) : null

  return {
    ...row,
    cantidad: isNaN(cantNum) ? '' : cantNum,
    tipo_ajuste: tipoAj,
    _match: match || null,
    _isNew: !match,
    _stockActual: stockActual,
    _expected: expected,
    _errors: errors,
    _serverErrors: [],
    _valid: errors.length === 0,
  }
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['sku', 'cantidad', 'tipo_ajuste', 'descripcion', 'ubicacion', 'guia1', 'guia2', 'multicaja', 'observacion'],
    ['SKU-EJEMPLO-01', 10, 'set', 'Ajuste fisico mensual', 'A-01', 'GUIA-A-123', '', '', 'Conteo anual'],
    ['SKU-EJEMPLO-02', 5, 'add', 'Ingreso adicional', '', 'GUIA-B-456', 'GUIA-B-789', 'MC-100', 'Entrada extra'],
    ['SKU-EJEMPLO-03', 2, 'subtract', 'Merma detectada', 'B-02', '', '', '', 'Dañado'],
  ])
  ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Importacion')
  XLSX.writeFile(wb, 'plantilla_importacion_inventario.xlsx')
}

const FILTER_TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'errors', label: 'Errores' },
  { id: 'valid', label: 'Válidos' },
]

export default function ImportarInventarioModal({ isOpen, onClose, inventario = [], ubicaciones = [], onImported }) {
  const toast = useToastStore()
  const fileRef = useRef(null)
  const [step, setStep] = useState('config')
  const [tipoImport, setTipoImport] = useState('ajuste')
  const [descripcion, setDescripcion] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [rows, setRows] = useState([])
  const [filterMode, setFilterMode] = useState('all')
  const [importResult, setImportResult] = useState(null)

  const reset = () => {
    setStep('config')
    setTipoImport('ajuste')
    setDescripcion('')
    setRows([])
    setFilterMode('all')
    setImportResult(null)
  }

  const applyServerErrors = (currentRows, serverErrors = []) => {
    if (!serverErrors.length) return currentRows
    const errorMap = new Map(serverErrors.map(err => [Number(err.row), err.error]))
    return currentRows.map(row => {
      const serverError = errorMap.get(row._sheetRowNumber)
      if (!serverError) return { ...row, _serverErrors: [] }
      return {
        ...row,
        _errors: [...row._errors, serverError],
        _serverErrors: [serverError],
        _valid: false,
      }
    })
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const rawRows = await parseExcelFile(file)
      if (!rawRows.length) { toast.error('El archivo está vacío'); return }
      const processed = rawRows
        .map((r, i) => normalizeRow(r, i))
        .filter(r => r.sku || String(r.cantidad).trim() !== '')
        .map(r => validateRow(r, inventario, tipoImport, ubicaciones))
      if (!processed.length) { toast.error('No se encontraron filas con datos'); return }
      setRows(processed)
      setFilterMode('all')
      setImportResult(null)
      setStep('review')
    } catch (err) {
      console.error('Error leyendo archivo de inventario:', err)
      toast.error('Error al leer el archivo. Verifica que sea .xlsx o .xls')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile({ target: { files: [file], value: '' } })
  }

  const deleteRow = (rowId) => {
    setRows(prev => prev.filter(r => r._rowId !== rowId))
  }

  const updateTipoAjuste = (rowId, val) => {
    setRows(prev => prev.map(r => {
      if (r._rowId !== rowId) return r
      const updated = { ...r, tipo_ajuste: val }
      updated._expected = r._valid ? computeExpected(updated, r._stockActual) : null
      return updated
    }))
  }

  const stats = useMemo(() => ({
    total: rows.length,
    valid: rows.filter(r => r._valid).length,
    errors: rows.filter(r => !r._valid).length,
    nuevos: rows.filter(r => r._valid && r._isNew).length,
    existentes: rows.filter(r => r._valid && !r._isNew).length,
  }), [rows])

  const filteredRows = useMemo(() => {
    if (filterMode === 'errors') return rows.filter(r => !r._valid)
    if (filterMode === 'valid') return rows.filter(r => r._valid)
    return rows
  }, [rows, filterMode])

  const handleImport = async () => {
    const validRows = rows.filter(r => r._valid)
    if (!validRows.length) { toast.error('No hay filas válidas para importar'); return }
    setImporting(true)
    try {
      const result = await importarInventario({
        tipo: tipoImport,
        descripcion: descripcion || `Importación masiva - ${new Date().toLocaleDateString()}`,
        filas: validRows.map(r => ({
          row_number: r._sheetRowNumber,
          sku: r.sku,
          cantidad: r.cantidad,
          tipo_ajuste: r.tipo_ajuste,
          inventario_id: r._match?.id || null,
          descripcion: r.descripcion || null,
          ubicacion_codigo: r.ubicacion || null,
          guia1: r.guia1 || null,
          guia2: r.guia2 || null,
          multicaja: r.multicaja || null,
          observacion: r.observacion || null,
        })),
      })
      setImportResult(result)
      onImported?.()
      if ((result.summary?.fallidos || 0) > 0) {
        setRows(prev => applyServerErrors(prev, result.errors || []))
        setFilterMode('errors')
        setStep('review')
        toast.warning?.(`Importación parcial: ${result.summary?.creados || 0} creados, ${result.summary?.actualizados || 0} actualizados, ${result.summary?.fallidos || 0} fallidos`)
        return
      }
      setStep('success')
    } catch (err) {
      console.error('Error importando inventario:', err.response?.data || err)
      toast.error(err.response?.data?.error || 'Error al importar')
    } finally {
      setImporting(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white'
  const labelCls = 'block text-[11px] text-warm-500 mb-1 font-medium'

  const renderFooter = () => {
    if (step === 'review') {
      return (
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-warm-500">
            {stats.valid} de {stats.total} fila{stats.total !== 1 ? 's' : ''} válida{stats.valid !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="btn-ghost">Volver</button>
            <button
              onClick={handleImport}
              disabled={importing || stats.valid === 0}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {importing ? 'Importando...' : `Importar ${stats.valid} fila${stats.valid !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )
    }
    if (step === 'success') {
      return (
        <button onClick={() => { onClose(); reset() }} className="btn-primary">Cerrar</button>
      )
    }
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!importing) { onClose(); reset() } }}
      title={
        step === 'success' ? 'Importación completada' :
        step === 'review' ? 'Análisis y validación' :
        'Importar inventario'
      }
      icon={FileSpreadsheet}
      size="xl"
      footer={renderFooter()}
    >
      <AnimatePresence mode="wait">

        {/* ── STEP: CONFIG ── */}
        {step === 'config' && (
          <motion.div
            key="config"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Tipo de importación */}
            <div>
              <label className={labelCls}>Tipo de importación</label>
              <div className="grid grid-cols-1 gap-2">
                {IMPORT_TYPES.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      tipoImport === opt.value
                        ? 'border-primary-400 bg-primary-50/60'
                        : 'border-warm-200 hover:border-warm-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipo_import"
                      value={opt.value}
                      checked={tipoImport === opt.value}
                      onChange={() => setTipoImport(opt.value)}
                      className="mt-0.5 accent-primary-500"
                    />
                    <div>
                      <p className={`text-sm font-semibold ${tipoImport === opt.value ? 'text-primary-700' : 'text-warm-700'}`}>{opt.label}</p>
                      <p className="text-xs text-warm-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className={labelCls}>Descripción / motivo (opcional)</label>
              <input
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                className={inputCls}
                placeholder="Ej. Inventario físico mayo 2026"
              />
            </div>

            {/* Upload area */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Archivo Excel (.xlsx / .xls)</label>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1 text-xs text-primary-600 font-semibold hover:text-primary-700"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar plantilla
                </button>
              </div>
              <motion.label
                whileHover={{ scale: 1.005 }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center gap-3 w-full h-40 border-2 border-dashed border-warm-300 rounded-2xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/20 transition-all"
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-warm-500">Procesando archivo...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-9 h-9 text-warm-300" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-warm-600">Haz clic o arrastra tu archivo aquí</p>
                      <p className="text-xs text-warm-400 mt-0.5">Columnas requeridas: <span className="font-mono bg-warm-100 px-1 rounded">sku</span>, <span className="font-mono bg-warm-100 px-1 rounded">cantidad</span></p>
                    </div>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFile}
                  disabled={loading}
                />
              </motion.label>
              <p className="text-[11px] text-warm-400 mt-1.5">
                Columnas opcionales: <span className="font-mono">tipo_ajuste</span>, <span className="font-mono">descripcion</span>, <span className="font-mono">ubicacion</span>, <span className="font-mono">guia1</span>, <span className="font-mono">guia2</span>, <span className="font-mono">multicaja</span>, <span className="font-mono">observacion</span>
              </p>
            </div>
          </motion.div>
        )}

        {/* ── STEP: REVIEW ── */}
        {step === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Stats summary */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total filas', value: stats.total, color: 'bg-warm-50 text-warm-700 border-warm-200' },
                { label: 'Válidas', value: stats.valid, color: 'bg-success-50 text-success-700 border-success-200' },
                { label: 'Con errores', value: stats.errors, color: stats.errors > 0 ? 'bg-danger-50 text-danger-700 border-danger-200' : 'bg-warm-50 text-warm-400 border-warm-100' },
                { label: tipoImport === 'importacion' ? 'SKUs nuevos' : 'Existentes', value: tipoImport === 'importacion' ? stats.nuevos : stats.existentes, color: 'bg-accent-50 text-accent-700 border-accent-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 text-center ${s.color}`}>
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-[10px] font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 border-b border-warm-100">
              {FILTER_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilterMode(t.id)}
                  className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                    filterMode === t.id
                      ? 'border-primary-500 text-primary-700'
                      : 'border-transparent text-warm-400 hover:text-warm-600'
                  }`}
                >
                  {t.label}
                  {t.id === 'errors' && stats.errors > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-danger-100 text-danger-600 text-[10px] font-bold">{stats.errors}</span>
                  )}
                  {t.id === 'valid' && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-success-100 text-success-600 text-[10px] font-bold">{stats.valid}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Table */}
            {filteredRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-warm-400">Sin filas en esta categoría</div>
            ) : (
              <div className="border border-warm-100 rounded-xl overflow-hidden">
                <div className="overflow-y-auto max-h-[360px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-warm-50 border-b border-warm-100 text-warm-500 text-left text-[10px] uppercase">
                        <th className="px-3 py-2.5 w-7" />
                        <th className="px-3 py-2.5 w-12">Fila</th>
                        <th className="px-3 py-2.5">SKU</th>
                        <th className="px-3 py-2.5 w-24">Cantidad</th>
                        <th className="px-3 py-2.5 w-32">Operación</th>
                        <th className="px-3 py-2.5 w-20 text-right">Stock actual</th>
                        <th className="px-3 py-2.5 w-20 text-right">Resultado</th>
                        <th className="px-3 py-2.5">Descripción</th>
                        <th className="px-3 py-2.5 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(row => {
                        const delta = row._valid && row._expected !== null && row._stockActual !== null
                          ? row._expected - row._stockActual
                          : null
                        return (
                          <tr
                            key={row._rowId}
                            className={`border-b border-warm-50 last:border-0 transition-colors ${
                              !row._valid
                                ? 'bg-danger-50/40'
                                : row._isNew
                                ? 'bg-accent-50/30'
                                : 'hover:bg-warm-50/40'
                            }`}
                          >
                            {/* Status */}
                            <td className="px-3 py-2.5">
                              {row._valid
                                ? <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                                : <XCircle className="w-3.5 h-3.5 text-danger-500" />
                              }
                            </td>

                            <td className="px-3 py-2.5 text-[11px] font-mono text-warm-400">
                              {row._sheetRowNumber}
                            </td>

                            {/* SKU */}
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-warm-800">{row.sku || '—'}</span>
                              {row._isNew && row._valid && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-accent-100 text-accent-700 text-[9px] font-bold uppercase tracking-wide">Nuevo</span>
                              )}
                            </td>

                            {/* Cantidad */}
                            <td className="px-3 py-2.5 font-mono text-right text-warm-700">
                              {row.cantidad !== '' ? row.cantidad : <span className="text-danger-500">—</span>}
                            </td>

                            {/* Tipo ajuste */}
                            <td className="px-3 py-2.5">
                              {row._valid ? (
                                <select
                                  value={row.tipo_ajuste}
                                  onChange={e => updateTipoAjuste(row._rowId, e.target.value)}
                                  className="w-full px-2 py-1 rounded-lg border border-warm-200 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-primary-200"
                                >
                                  {TIPO_AJUSTE_OPTS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-warm-400 text-[11px]">—</span>
                              )}
                            </td>

                            {/* Stock actual */}
                            <td className="px-3 py-2.5 text-right text-warm-500">
                              {row._stockActual !== null ? row._stockActual : <span className="text-warm-300">—</span>}
                            </td>

                            {/* Resultado esperado */}
                            <td className="px-3 py-2.5 text-right">
                              {row._valid && row._expected !== null ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-bold text-warm-800">{row._expected}</span>
                                  {delta !== null && delta !== 0 && (
                                    <span className={`text-[10px] font-bold ${delta > 0 ? 'text-success-600' : 'text-danger-500'}`}>
                                      {delta > 0 ? `+${delta}` : delta}
                                    </span>
                                  )}
                                </div>
                              ) : <span className="text-warm-300">—</span>}
                            </td>

                            {/* Descripción */}
                            <td className="px-3 py-2.5 max-w-[180px]">
                              {!row._valid ? (
                                <div className="space-y-0.5">
                                  {row._errors.map((err, ei) => (
                                    <div key={ei} className="flex items-center gap-1 text-danger-600">
                                      <AlertCircle className="w-3 h-3 shrink-0" />
                                      <span className="text-[11px]">{err}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="text-[11px] text-warm-400 truncate block">{row.descripcion || '—'}</span>
                                  {row.observacion && (
                                    <span className="text-[10px] text-warm-300 truncate block">Obs: {row.observacion}</span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Delete */}
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => deleteRow(row._rowId)}
                                className="p-1 rounded-lg text-warm-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                                title="Eliminar fila"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stats.errors > 0 && (
              <div className="flex items-center gap-2 text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-xl px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {stats.errors} fila{stats.errors !== 1 ? 's' : ''} con error{stats.errors !== 1 ? 'es' : ''} serán omitida{stats.errors !== 1 ? 's' : ''} al importar. Puedes eliminarlas o corregir el archivo.
              </div>
            )}

            {importResult?.summary && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-success-200 bg-success-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-success-700">{importResult.summary.creados || 0}</p>
                  <p className="text-[10px] text-success-700">Creados</p>
                </div>
                <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-primary-700">{importResult.summary.actualizados || 0}</p>
                  <p className="text-[10px] text-primary-700">Actualizados</p>
                </div>
                <div className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-danger-700">{importResult.summary.fallidos || 0}</p>
                  <p className="text-[10px] text-danger-700">Fallidos</p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── STEP: SUCCESS ── */}
        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center py-8 gap-5 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-success-100 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-success-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-warm-800">Importación exitosa</p>
              <p className="text-sm text-warm-500 mt-1">El inventario ha sido actualizado correctamente.</p>
            </div>
            {importResult && (
              <div className="flex items-center gap-6 bg-warm-50 rounded-2xl px-8 py-4 border border-warm-100">
                <div className="text-center">
                  <p className="text-2xl font-bold text-success-700">{importResult.summary?.creados ?? 0}</p>
                  <p className="text-xs text-warm-500 mt-0.5">Creados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-700">{importResult.summary?.actualizados ?? 0}</p>
                  <p className="text-xs text-warm-500 mt-0.5">Actualizados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-danger-600">{importResult.summary?.fallidos ?? 0}</p>
                  <p className="text-xs text-warm-500 mt-0.5">Fallidos</p>
                </div>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </Modal>
  )
}
