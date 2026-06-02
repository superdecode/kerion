import { useState, useRef, useMemo } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Trash2,
  Download, LayoutGrid, Check,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { importUbicaciones } from '../services/devolucionesService'
import * as XLSX from 'xlsx'

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
    codigo: String(pickField(raw, ['codigo', 'código', 'code', 'id']) || '').trim(),
    nombre: String(pickField(raw, ['nombre', 'name', 'ubicacion', 'ubicación', 'nombre (opcional)']) || '').trim(),
  }
}

function validateRow(row, existingUbicaciones) {
  const errors = []
  if (!row.codigo) errors.push('Código requerido')
  else if (row.codigo.length > 50) errors.push('Código demasiado largo (máx 50)')

  if (!row.nombre) {
    row.nombre = row.codigo
  } else if (row.nombre.length > 200) {
    errors.push('Nombre demasiado largo (máx 200)')
  }

  const match = existingUbicaciones.find(u => u.codigo?.toLowerCase() === row.codigo?.toLowerCase())

  return {
    ...row,
    _isUpdate: !!match,
    _errors: errors,
    _valid: errors.length === 0,
  }
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['codigo', 'nombre (opcional)'],
    ['A-01', 'Pasillo A - Nivel 1'],
    ['B-02', 'Pasillo B - Nivel 2'],
    ['RACK-05', 'Rack Principal 05'],
  ])
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ubicaciones')
  XLSX.writeFile(wb, 'plantilla_importacion_ubicaciones.xlsx')
}

const FILTER_TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'errors', label: 'Errores' },
  { id: 'valid', label: 'Válidos' },
]

export default function ImportarUbicacionesModal({ isOpen, onClose, existingUbicaciones = [], onImported }) {
  const toast = useToastStore()
  const fileRef = useRef(null)
  const [step, setStep] = useState('upload')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [rows, setRows] = useState([])
  const [filterMode, setFilterMode] = useState('all')
  const [importResult, setImportResult] = useState(null)

  const reset = () => {
    setStep('upload')
    setRows([])
    setFilterMode('all')
    setImportResult(null)
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
        .filter(r => r.codigo || r.nombre)
        .map(r => validateRow(r, existingUbicaciones))
      if (!processed.length) { toast.error('No se encontraron filas con datos'); return }
      setRows(processed)
      setFilterMode('all')
      setStep('review')
    } catch {
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

  const stats = useMemo(() => ({
    total: rows.length,
    valid: rows.filter(r => r._valid).length,
    errors: rows.filter(r => !r._valid).length,
    nuevos: rows.filter(r => r._valid && !r._isUpdate).length,
    actualizaciones: rows.filter(r => r._valid && r._isUpdate).length,
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
      const res = await importUbicaciones({
        rows: validRows.map(r => ({
          codigo: r.codigo,
          nombre: r.nombre,
        })),
      })
      setImportResult(res.data || res)
      setStep('success')
      onImported?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al importar')
    } finally {
      setImporting(false)
    }
  }

  const labelCls = 'block text-[11px] text-warm-500 mb-1 font-medium'

  const renderFooter = () => {
    if (step === 'review') {
      return (
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-warm-500">
            {stats.valid} de {stats.total} fila{stats.total !== 1 ? 's' : ''} válida{stats.valid !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="btn-ghost text-xs">Atrás</button>
            <button
              onClick={handleImport}
              disabled={importing || stats.valid === 0}
              className="btn-primary inline-flex items-center gap-2 text-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              {importing ? 'Importando...' : `Importar ${stats.valid} ubicaciones`}
            </button>
          </div>
        </div>
      )
    }
    if (step === 'success') {
      return (
        <button onClick={() => { onClose(); reset() }} className="btn-primary">Entendido</button>
      )
    }
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!importing) { onClose(); reset() } }}
      title={
        step === 'success' ? 'Carga completada' :
        step === 'review' ? 'Revisión de ubicaciones' :
        'Importar ubicaciones'
      }
      icon={LayoutGrid}
      size="lg"
      footer={renderFooter()}
    >
      <AnimatePresence mode="wait">

        {/* ── STEP: UPLOAD ── */}
        {step === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 py-2"
          >
            <div className="text-center max-w-md mx-auto space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-7 h-7 text-primary-500" />
              </div>
              <h3 className="text-lg font-bold text-warm-800">Carga masiva de ubicaciones</h3>
              <p className="text-sm text-warm-500">
                Sube un archivo Excel para crear nuevas ubicaciones o actualizar las existentes de forma masiva.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className={labelCls}>Archivo Excel (.xlsx / .xls)</label>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs text-primary-600 font-bold hover:text-primary-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar plantilla
                </button>
              </div>

              <motion.label
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center gap-4 w-full h-52 border-2 border-dashed border-warm-200 rounded-3xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/20 transition-all group"
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-warm-600">Analizando archivo...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-warm-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                      <Upload className="w-6 h-6 text-warm-400 group-hover:text-primary-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-warm-700">Selecciona o arrastra el archivo</p>
                      <p className="text-xs text-warm-400 mt-1">Formatos compatibles: .xlsx, .xls</p>
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
              
              <div className="bg-warm-50 rounded-2xl p-4 border border-warm-100">
                <p className="text-[11px] font-bold text-warm-400 uppercase tracking-widest mb-2">Columnas del archivo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-warm-700">codigo</span>
                    <span className="text-[10px] text-warm-500">Requerido. Máx 50 car.</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-warm-700">nombre</span>
                    <span className="text-[10px] text-warm-500">Opcional. Máx 200 car.</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STEP: REVIEW ── */}
        {step === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total filas', value: stats.total, color: 'bg-warm-50 text-warm-700 border-warm-200' },
                { label: 'Válidas', value: stats.valid, color: 'bg-success-50 text-success-700 border-success-200' },
                { label: 'Nuevas', value: stats.nuevos, color: 'bg-primary-50 text-primary-700 border-primary-200' },
                { label: 'Existentes', value: stats.actualizaciones, color: 'bg-accent-50 text-accent-700 border-accent-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl border p-3.5 text-center ${s.color} shadow-sm`}>
                  <p className="text-2xl font-bold leading-none">{s.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide mt-1.5 opacity-80">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-1 border-b border-warm-100">
              {FILTER_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilterMode(t.id)}
                  className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-all ${
                    filterMode === t.id
                      ? 'border-primary-500 text-primary-700'
                      : 'border-transparent text-warm-400 hover:text-warm-600'
                  }`}
                >
                  {t.label}
                  {t.id === 'errors' && stats.errors > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-danger-100 text-danger-600 text-[10px] font-black">{stats.errors}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="border border-warm-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-y-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-warm-50 border-b border-warm-100 text-warm-500 text-left text-[10px] uppercase font-black tracking-widest">
                      <th className="px-4 py-3 w-10" />
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Acción</th>
                      <th className="px-4 py-3">Validación</th>
                      <th className="px-4 py-3 w-10 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {filteredRows.map(row => (
                      <tr
                        key={row._rowId}
                        className={`transition-colors ${
                          !row._valid ? 'bg-danger-50/30' : 'hover:bg-warm-50/40'
                        }`}
                      >
                        <td className="px-4 py-3">
                          {row._valid
                            ? <CheckCircle className="w-4 h-4 text-success-500" />
                            : <XCircle className="w-4 h-4 text-danger-500" />
                          }
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-warm-700">{row.codigo || '—'}</td>
                        <td className="px-4 py-3 text-warm-600">{row.nombre || '—'}</td>
                        <td className="px-4 py-3">
                          {row._valid && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                              row._isUpdate ? 'bg-accent-100 text-accent-700' : 'bg-primary-100 text-primary-700'
                            }`}>
                              {row._isUpdate ? 'Actualizar' : 'Crear'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!row._valid && (
                            <div className="flex items-center gap-1.5 text-danger-600 font-medium">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{row._errors[0]}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => deleteRow(row._rowId)}
                            className="p-1.5 rounded-xl text-warm-300 hover:text-danger-600 hover:bg-danger-50 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {stats.errors > 0 && (
              <div className="flex items-start gap-3 p-4 bg-warning-50 border border-warning-100 rounded-2xl shadow-sm">
                <AlertCircle className="w-5 h-5 text-warning-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-warning-800">Hay filas con errores</p>
                  <p className="text-xs text-warning-700 mt-0.5 opacity-90">
                    Se detectaron {stats.errors} registros inválidos que no serán importados. Puedes eliminarlos de la lista o corregir el archivo y volver a subirlo.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── STEP: SUCCESS ── */}
        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center py-10 gap-6 text-center"
          >
            <div className="w-20 h-20 rounded-[2rem] bg-success-100 flex items-center justify-center shadow-glow-success animate-bounce-short">
              <Check className="w-10 h-10 text-success-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-warm-800 tracking-tight">¡Importación Exitosa!</h3>
              <p className="text-sm text-warm-500 max-w-sm mx-auto">
                Las ubicaciones han sido procesadas correctamente y ya están disponibles en el sistema.
              </p>
            </div>
            
            {importResult && (
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                <div className="bg-success-50/50 border border-success-100 rounded-2xl p-4">
                  <p className="text-2xl font-black text-success-700 leading-none">{importResult.resumen?.procesados ?? 0}</p>
                  <p className="text-[10px] font-bold text-success-600 uppercase tracking-widest mt-1.5">Procesados</p>
                </div>
                <div className="bg-primary-50/50 border border-primary-100 rounded-2xl p-4">
                  <p className="text-2xl font-black text-primary-700 leading-none">{(importResult.resumen?.creados ?? 0) + (importResult.resumen?.actualizados ?? 0)}</p>
                  <p className="text-[10px] font-bold text-primary-600 uppercase tracking-widest mt-1.5">Guardados</p>
                </div>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </Modal>
  )
}
