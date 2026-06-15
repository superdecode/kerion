import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  Plus, Upload, ArrowRightFromLine, Download, Copy, Check,
  X, Clock, Eye, Search, Printer, Trash2, AlertTriangle,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { createSalida, listSalidas, downloadSalidaExcel, cancelarSalida, deleteSalida } from '../services/devolucionesService'
import { fmtDate, fmtTimeShort, getToday, subtractDays } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  borrador:   'bg-warm-100 text-warm-600',
  pendiente:  'bg-accent-100 text-accent-700',
  en_proceso: 'bg-warning-100 text-warning-700',
  completado: 'bg-success-100 text-success-700',
  cancelado:  'bg-danger-100 text-danger-600',
}
const ESTADO_LABELS = {
  borrador: 'Borrador', pendiente: 'Pendiente', en_proceso: 'En proceso',
  completado: 'Completado', cancelado: 'Cancelado',
}

const STATUS_TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'borrador', label: 'Borrador' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'completado', label: 'Completado' },
  { id: 'cancelado', label: 'Cancelado' },
]

const ESTADO_OPTS = Object.entries(ESTADO_LABELS).map(([value, label]) => ({ value, label }))

const EXPORT_HEADERS = ['Código', 'Fecha', 'Responsable', 'Referencia', 'Líneas', 'Estado']

function buildRows(rows) {
  return rows.map(r => [
    r.codigo,
    fmtDate(r.created_at),
    r.responsable_nombre || '',
    r.referencia || '',
    r.lineas_count ?? r.total_lineas ?? '',
    ESTADO_LABELS[r.estado] || r.estado,
  ])
}

function exportToXlsx(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Salidas')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export default function Salidas() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const toast = useToastStore()
  const { t } = useI18nStore()

  const defaultEnd = getToday()
  const defaultStart = subtractDays(defaultEnd, 30)

  const [estados, setEstados] = useState([])
  const [fechaDesde, setFechaDesde] = useState(defaultStart)
  const [fechaHasta, setFechaHasta] = useState(defaultEnd)
  const [showNewModal, setShowNewModal] = useState(false)
  const [copied, setCopied] = useState(null)
  const [activeStatus, setActiveStatus] = useState('todos')
  const [cancelRow, setCancelRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [qInput, setQInput] = useState('')
  const [qFilter, setQFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const debounceRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(new Set())


  const { data, isLoading } = useQuery({
    queryKey: ['dev-salidas', estados, fechaDesde, fechaHasta, qFilter],
    queryFn: () => listSalidas({
      estado: estados.join(','),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      q: qFilter,
    }),
    enabled: backendOnline,
  })

  const handleQChange = (val) => {
    setQInput(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setQFilter(''); return }
    debounceRef.current = setTimeout(() => setQFilter(val.trim()), 300)
  }

  const createMutation = useMutation({
    mutationFn: (payload) => createSalida(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      const salidaId = res.data?.id || res.salida?.id || res.id
      navigate(`/Devoluciones/salidas/${salidaId}`)
    },
    onError: () => toast.error(t('dev.salidas.err.crear')),
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelarSalida(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      toast.success(t('dev.salidas.toast.cancelada'))
      setCancelRow(null)
    },
    onError: () => toast.error(t('dev.salidas.err.cancelar')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteSalida(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      toast.success(t('dev.salidas.toast.eliminada'))
      setDeleteRow(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || t('dev.salidas.err.eliminar')),
  })

  const clearFilters = () => { setEstados([]); setFechaDesde(defaultStart); setFechaHasta(defaultEnd); setQInput(''); setQFilter('') }

  const copy = (codigo, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(codigo).then(() => {
      setCopied(codigo); setTimeout(() => setCopied(null), 2000)
    })
  }

  const exportExcel = async (row, e) => {
    e.stopPropagation()
    try {
      const blob = await downloadSalidaExcel(row.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${row.codigo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error(t('dev.salidas.err.exportar')) }
  }

  const allSalidas = data?.data || data?.salidas || []

  const statusCounts = useMemo(() => {
    const counts = { todos: allSalidas.length }
    STATUS_TABS.slice(1).forEach(({ id }) => {
      counts[id] = allSalidas.filter(s => s.estado === id).length
    })
    return counts
  }, [allSalidas])

  const salidas = useMemo(() =>
    activeStatus === 'todos' ? allSalidas : allSalidas.filter(s => s.estado === activeStatus),
    [allSalidas, activeStatus]
  )
  const totalPages = Math.max(1, Math.ceil(salidas.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedSalidas = useMemo(
    () => salidas.slice((safePage - 1) * pageSize, safePage * pageSize),
    [salidas, safePage, pageSize]
  )

  const canCreate = hasPermission('devoluciones.salidas', 'crear')
  const canEdit = hasPermission('devoluciones.salidas', 'actualizar')
  const canDelete = hasPermission('devoluciones.salidas', 'eliminar')
  const canExport = canEdit
  const hasActiveFilters = estados.length > 0 || !!qFilter

  useEffect(() => {
    setPage(1)
  }, [estados, fechaDesde, fechaHasta, qFilter, activeStatus, pageSize])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, activeStatus])

  const allChecked = paginatedSalidas.length > 0 && paginatedSalidas.every(r => selectedIds.has(r.id))
  const someChecked = paginatedSalidas.some(r => selectedIds.has(r.id))
  const allFilteredSelected = salidas.length > 0 && selectedIds.size === salidas.length
  const canSelectAllFiltered = allChecked && salidas.length > paginatedSalidas.length && !allFilteredSelected

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allChecked) { paginatedSalidas.forEach(r => next.delete(r.id)) }
      else { paginatedSalidas.forEach(r => next.add(r.id)) }
      return next
    })
  }, [allChecked, paginatedSalidas])

  const toggleRow = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleExportSelected = useCallback(() => {
    const rows = salidas.filter(r => selectedIds.has(r.id))
    if (!rows.length) return
    exportToXlsx(buildRows(rows), `salidas-seleccionadas-${getToday()}`)
  }, [salidas, selectedIds])

  return (
    <div className="flex flex-col h-full">
      <Header title={t('dev.salidas.title')} subtitle={t('dev.salidas.subtitle')} />

      <div className="flex-1 overflow-y-auto">

        {/* Sticky filter bar */}
        <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">

          {/* Row 1 */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Date range */}
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="date" value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
            </div>

            {/* Shortcuts */}
            {[{ label: t('dev.salidas.today'), d: 0 }, { label: t('dev.salidas.days7'), d: 7 }, { label: t('dev.salidas.days30'), d: 30 }].map(({ label, d }) => (
              <button key={label}
                onClick={() => { const today = getToday(); setFechaDesde(d === 0 ? today : subtractDays(today, d)); setFechaHasta(today) }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
              >{label}</button>
            ))}
          </div>

          {/* Row 2 */}
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <MultiSelect
                placeholder={t('dev.salidas.estado')}
                options={[
                  { value: 'borrador', label: t('dev.estado.borrador') },
                  { value: 'pendiente', label: t('dev.estado.pendiente') },
                  { value: 'en_proceso', label: t('dev.estado.en_proceso') },
                  { value: 'completado', label: t('dev.estado.completado') },
                  { value: 'cancelado', label: t('dev.estado.cancelado') },
                ]}
                selected={estados}
                onChange={setEstados}
              />

              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[220px] transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
                <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                <input type="text" value={qInput} onChange={e => handleQChange(e.target.value)}
                  placeholder={t('dev.salidas.search')}
                  className="text-xs outline-none bg-transparent text-warm-700 flex-1 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                {qInput && <button onClick={() => handleQChange('')} className="text-warm-400 hover:text-warm-600"><X className="w-3 h-3" /></button>}
              </div>

              {hasActiveFilters && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                  <X className="w-3 h-3" /> {t('common.clear')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canCreate && (
                <button onClick={() => setShowNewModal(true)}
                  className="btn-primary inline-flex items-center gap-2 hover:shadow-glow hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.97]">
                  <Plus className="w-4 h-4" /> {t('dev.salidas.new')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-0 border-b border-warm-100 bg-white px-5">
          {STATUS_TABS.map(({ id }) => (
            <button
              key={id}
              onClick={() => setActiveStatus(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                activeStatus === id
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-warm-400 hover:text-warm-600'
              }`}
            >
              {id === 'todos' ? t('dev.estado.todos') : t(`dev.estado.${id}`)}
              <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${
                activeStatus === id ? 'bg-primary-100 text-primary-700' : 'bg-warm-100 text-warm-500'
              }`}>
                {statusCounts[id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4">
          <motion.div className="card overflow-hidden table-shell"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            {isLoading ? (
              <LoadingSpinner text={t('dev.salidas.loading')} />
            ) : salidas.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-warm-300">
                <ArrowRightFromLine className="w-10 h-10" />
                <p className="text-sm">{t('dev.salidas.empty')}</p>
              </div>
            ) : (
              <>
                {someChecked && canExport && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700 flex-wrap">
                    <span className="font-semibold">
                      {selectedIds.size} seleccionados
                      {allFilteredSelected && (
                        <span className="ml-1 font-normal text-primary-500">(todos los {salidas.length} del filtro)</span>
                      )}
                    </span>
                    {canSelectAllFiltered && (
                      <button
                        className="text-primary-600 hover:text-primary-800 underline font-semibold transition-colors"
                        onClick={() => setSelectedIds(new Set(salidas.map(r => r.id)))}>
                        Seleccionar todos ({salidas.length})
                      </button>
                    )}
                    <button onClick={handleExportSelected}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success-600 text-white font-semibold hover:bg-success-700 transition-colors">
                      <Download className="w-3 h-3" /> Exportar ({selectedIds.size})
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-primary-500 hover:text-primary-700 font-semibold">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto table-scroll">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header w-8">
                          <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                            onChange={toggleAll} className="cb" />
                        </th>
                        <th className="table-header">{t('dev.salidas.col.codigo')}</th>
                        <th className="table-header">{t('dev.salidas.col.fecha')}</th>
                        <th className="table-header">{t('dev.salidas.col.responsable')}</th>
                        <th className="table-header">{t('dev.salidas.col.ref')}</th>
                        <th className="table-header text-center">{t('dev.salidas.col.lineas')}</th>
                        <th className="table-header text-center">{t('dev.salidas.col.estado')}</th>
                        <th className="table-header text-right">{t('dev.salidas.col.acciones')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {paginatedSalidas.map(row => {
                        const isSelected = selectedIds.has(row.id)
                        return (
                        <tr key={row.id}
                          className={`hover:bg-gradient-to-r hover:from-primary-50/40 hover:to-transparent cursor-pointer transition-all duration-150 group border-b border-warm-50 ${isSelected ? 'bg-primary-50/20' : ''}`}
                          onClick={() => navigate(`/Devoluciones/salidas/${row.id}`)}>
                          <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)}
                              className="cb" />
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <span className="code-main">{row.codigo}</span>
                              <button onClick={e => copy(row.codigo, e)}
                                className="p-0.5 rounded hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-all">
                                {copied === row.codigo ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="table-cell text-warm-500 text-xs">
                            {fmtDate(row.created_at)}<br />
                            <span className="text-warm-400">{fmtTimeShort(row.created_at)}</span>
                          </td>
                          <td className="table-cell text-warm-600 text-xs">{row.responsable_nombre || '—'}</td>
                          <td className="table-cell text-xs font-mono text-warm-500">{row.referencia || <span className="text-warm-300">—</span>}</td>
                          <td className="table-cell text-center font-bold text-warm-700">{row.lineas_count ?? row.total_lineas ?? '—'}</td>
                          <td className="table-cell text-center">
                            <span className={`badge text-[10px] ${ESTADO_COLORS[row.estado] || 'bg-warm-100 text-warm-600'}`}>
                              {t(`dev.estado.${row.estado}`) || row.estado}
                            </span>
                          </td>
                          <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => navigate(`/Devoluciones/salidas/${row.id}`)}
                                title={t('dev.salidas.title.ver')}
                                className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => navigate(`/Devoluciones/salidas/${row.id}?print=1`)}
                                title={t('dev.salidas.title.imprimir')}
                                className="p-2 rounded-xl hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all">
                                <Printer className="w-4 h-4" />
                              </button>
                              {canExport && row.estado === 'completado' && (
                                <button onClick={e => exportExcel(row, e)}
                                  title={t('dev.salidas.title.exportar')}
                                  className="p-2 rounded-xl hover:bg-success-50 text-warm-400 hover:text-success-600 transition-all">
                                  <Download className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && row.estado === 'en_proceso' && (
                                <button
                                  onClick={e => { e.stopPropagation(); setCancelRow(row) }}
                                  title={t('dev.salidas.title.cancelar')}
                                  className="p-2 rounded-xl hover:bg-warning-50 text-warm-400 hover:text-warning-700 transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && ['borrador', 'cancelado'].includes(row.estado) && (
                                <button
                                  onClick={e => { e.stopPropagation(); setDeleteRow(row) }}
                                  title={t('dev.salidas.title.eliminar')}
                                  className="p-2 rounded-xl hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={safePage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={salidas.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel={t('dev.salidas.itemLabel')}
                />
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Modal cancelar salida */}
      <Modal
        isOpen={!!cancelRow}
        onClose={() => setCancelRow(null)}
        title={t('dev.salidas.cancel.modal.title')}
        icon={X}
        size="sm"
        footer={
          <>
            <button onClick={() => setCancelRow(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              {t('dev.salidas.cancel.no')}
            </button>
            <button
              onClick={() => cancelMutation.mutate(cancelRow.id)}
              disabled={cancelMutation.isPending}
              className="px-4 py-2 rounded-xl bg-warning-600 text-white text-sm font-semibold disabled:opacity-60">
              {cancelMutation.isPending ? t('dev.salidas.cancel.ing') : t('dev.salidas.cancel.yes')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          {t('dev.salidas.cancel.modal.body')} <span className="code-main">{cancelRow?.codigo}</span>?
        </p>
      </Modal>

      <Modal
        isOpen={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        title={t('dev.salidas.delete.modal.title')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteRow(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              {t('dev.salidas.delete.no')}
            </button>
            <button
              onClick={() => deleteMutation.mutate(deleteRow.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-xl bg-danger-600 text-white text-sm font-semibold disabled:opacity-60">
              {deleteMutation.isPending ? t('dev.salidas.delete.ing') : t('dev.salidas.delete.yes')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          {t('dev.salidas.delete.modal.body')} <span className="code-main">{deleteRow?.codigo}</span>? {t('dev.salidas.delete.body')}
        </p>
      </Modal>

      {/* Modal nueva salida */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)}
        title={t('dev.salidas.new_modal.title')} icon={ArrowRightFromLine} size="sm">
        <div className="space-y-3 py-2">
          <p className="text-sm text-warm-600">{t('dev.salidas.new_modal.elige')}</p>
          <div className="grid grid-cols-2 gap-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setShowNewModal(false); createMutation.mutate({ notas: '', items: [] }) }}
              disabled={createMutation.isPending}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-warm-200 hover:border-primary-400 hover:bg-primary-50 transition-all text-sm font-medium text-warm-700 disabled:opacity-60">
              <Plus className="w-7 h-7 text-primary-500" />
              {t('dev.salidas.new_modal.manual')}
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setShowNewModal(false); createMutation.mutate({ notas: '', items: [], _showImport: true }) }}
              disabled={createMutation.isPending}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-warm-200 hover:border-accent-400 hover:bg-accent-50 transition-all text-sm font-medium text-warm-700 disabled:opacity-60">
              <Upload className="w-7 h-7 text-accent-500" />
              {t('dev.salidas.new_modal.importar')}
            </motion.button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
