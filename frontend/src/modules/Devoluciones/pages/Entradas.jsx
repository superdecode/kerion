import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  Plus, Copy, Check, Download, PackageCheck,
  Search, X, Clock, Eye, Trash2, AlertTriangle,
} from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import Header from '../../../core/components/layout/Header'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { createEntrada, listEntradas, downloadEntradaExcel, cancelEntrada, deleteEntrada } from '../services/devolucionesService'
import { fmtDate, fmtTimeShort, getToday, subtractDays } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  borrador:   'bg-warm-100 text-warm-600',
  en_proceso: 'bg-warning-100 text-warning-700',
  confirmado: 'bg-success-100 text-success-700',
  cancelado:  'bg-danger-100 text-danger-700',
}

const STATUS_TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'borrador', label: 'Borrador' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'confirmado', label: 'Confirmado' },
  { id: 'cancelado', label: 'Cancelado' },
]

const EXPORT_HEADERS = ['Código', 'Fecha', 'Responsable', 'Items', 'Estado']

function buildRows(rows) {
  return rows.map(r => [
    r.codigo || '',
    r.created_at ? fmtDate(r.created_at) : '',
    r.responsable_nombre || '',
    r.items_count ?? r.total_items ?? '',
    r.estado || '',
  ])
}

function exportToXlsx(rows, filename) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows])
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Entradas')
  XLSX.writeFile(wb, filename)
}

export default function Entradas() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()
  const { t } = useI18nStore()

  const defaultEnd = getToday()
  const defaultStart = subtractDays(defaultEnd, 30)

  const [qInput, setQInput]   = useState('')
  const [qFilter, setQFilter] = useState('')
  const [estados, setEstados] = useState([])
  const [fechaDesde, setFechaDesde] = useState(defaultStart)
  const [fechaHasta, setFechaHasta] = useState(defaultEnd)
  const [copied, setCopied] = useState(null)
  const [activeStatus, setActiveStatus] = useState('todos')
  const [cancelRow, setCancelRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportConfirm, setExportConfirm] = useState(null)
  const debounceRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dev-entradas', qFilter, estados, fechaDesde, fechaHasta],
    queryFn: () => listEntradas({
      q: qFilter,
      estado: estados.join(','),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
    }),
  })

  const createMutation = useMutation({
    mutationFn: () => createEntrada({}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      navigate(`/Devoluciones/entradas/${data.data?.id || data.sesion?.id || data.id}`)
    },
    onError: () => toast.error(t('dev.entradas.err.crear')),
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelEntrada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      toast.success(t('dev.entradas.toast.cancelada'))
      setCancelRow(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || t('dev.entradas.err.cancelar')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteEntrada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      toast.success(t('dev.entradas.toast.eliminada'))
      setDeleteRow(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || t('dev.entradas.err.eliminar')),
  })

  const handleQChange = (val) => {
    setQInput(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setQFilter(''); return }
    debounceRef.current = setTimeout(() => setQFilter(val.trim()), 300)
  }

  const clearFilters = () => {
    setQInput(''); setQFilter('')
    setEstados([])
    setFechaDesde(defaultStart)
    setFechaHasta(defaultEnd)
  }

  const copy = (codigo, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(codigo).then(() => {
      setCopied(codigo); setTimeout(() => setCopied(null), 2000)
    })
  }

  const exportExcel = async (row, e) => {
    e.stopPropagation()
    try {
      const blob = await downloadEntradaExcel(row.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${row.codigo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error(t('dev.entradas.err.exportar')) }
  }

  const allSesiones = data?.data || data?.sesiones || []

  const statusCounts = useMemo(() => {
    const counts = { todos: allSesiones.length }
    STATUS_TABS.slice(1).forEach(({ id }) => {
      counts[id] = allSesiones.filter(s => s.estado === id).length
    })
    return counts
  }, [allSesiones])

  const sesiones = useMemo(() =>
    activeStatus === 'todos' ? allSesiones : allSesiones.filter(s => s.estado === activeStatus),
    [allSesiones, activeStatus]
  )
  const totalPages = Math.max(1, Math.ceil(sesiones.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedSesiones = useMemo(
    () => sesiones.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sesiones, safePage, pageSize]
  )

  useEffect(() => { setPage(1) }, [qFilter, estados, fechaDesde, fechaHasta, activeStatus, pageSize])
  useEffect(() => { setSelectedIds(new Set()) }, [page, activeStatus])

  const allChecked = paginatedSesiones.length > 0 && paginatedSesiones.every(r => selectedIds.has(r.id))
  const someChecked = selectedIds.size > 0

  const toggleAll = () => setSelectedIds(prev => {
    const next = new Set(prev)
    if (allChecked) paginatedSesiones.forEach(r => next.delete(r.id))
    else paginatedSesiones.forEach(r => next.add(r.id))
    return next
  })

  const toggleRow = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleExportSelected = () => {
    try {
      const rows = buildRows(sesiones.filter(r => selectedIds.has(r.id)))
      exportToXlsx(rows, `entradas_${getToday()}.xlsx`)
      toast.success(t('common.export') + ' OK')
      setSelectedIds(new Set())
    } catch { toast.error(t('toast.error')) }
  }

  const doExportAll = () => {
    try {
      exportToXlsx(buildRows(sesiones), `entradas_${getToday()}.xlsx`)
      toast.success(t('common.export') + ' OK')
    } catch { toast.error(t('toast.error')) }
  }

  const handleExportAll = () => {
    if (!sesiones.length) return
    setExportConfirm({ count: sesiones.length, label: 'entradas', onConfirm: doExportAll })
  }

  const hasActiveFilters = !!(qFilter || estados.length)
  const canCreate = hasPermission('devoluciones.entradas', 'crear')
  const canEdit = hasPermission('devoluciones.entradas', 'actualizar')
  const canDelete = hasPermission('devoluciones.entradas', 'eliminar')
  const canExport = canEdit

  return (
    <div className="flex flex-col h-full">
      <Header title={t('dev.entradas.title')} subtitle={t('dev.entradas.subtitle')} />

      <div className="flex-1 overflow-y-auto">

        {/* Sticky filter bar */}
        <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">

          {/* Row 1 */}
          <div className="flex items-center gap-2 flex-wrap">
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
            {[{ label: t('dev.entradas.today'), d: 0 }, { label: t('dev.entradas.days7'), d: 7 }, { label: t('dev.entradas.days30'), d: 30 }].map(({ label, d }) => (
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
                placeholder={t('dev.entradas.estado')}
                options={[
                  { value: 'borrador', label: t('dev.estado.borrador') },
                  { value: 'en_proceso', label: t('dev.estado.en_proceso') },
                  { value: 'confirmado', label: t('dev.estado.confirmado') },
                  { value: 'cancelado', label: t('dev.estado.cancelado') },
                ]}
                selected={estados}
                onChange={setEstados}
              />
              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[220px] transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
                <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                <input type="text" value={qInput} onChange={e => handleQChange(e.target.value)}
                  placeholder={t('dev.entradas.search')}
                  className="text-xs outline-none bg-transparent text-warm-700 flex-1 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                {qInput && <button onClick={() => handleQChange('')} className="text-warm-400 hover:text-warm-600"><X className="w-3 h-3" /></button>}
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                  <X className="w-3 h-3" /> {t('common.clear')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {canExport && (
                <button
                  onClick={handleExportAll}
                  disabled={sesiones.length === 0}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 h-9 rounded-xl bg-success-50 text-success-700 border border-success-200 hover:bg-success-100 transition-all disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" /> {t('common.export')}
                </button>
              )}
              {canCreate && (
                <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                  className="btn-primary inline-flex items-center gap-2 hover:shadow-glow hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.97]">
                  {createMutation.isPending
                    ? <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    : <Plus className="w-4 h-4" />
                  }
                  {createMutation.isPending ? t('dev.entradas.creating') : t('dev.entradas.new')}
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
              <div className="py-14 text-center text-sm text-warm-400">{t('dev.entradas.loading')}</div>
            ) : sesiones.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-warm-300">
                <PackageCheck className="w-10 h-10" />
                <p className="text-sm">{t('dev.entradas.empty')}</p>
              </div>
            ) : (
              <>
                {/* Bulk action bar */}
                {someChecked && canExport && (
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100">
                    <span className="text-xs text-primary-700 font-semibold tabular-nums">
                      {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={handleExportSelected}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors">
                      <Download className="w-3 h-3" /> {t('common.export')} ({selectedIds.size})
                    </button>
                    <button
                      onClick={handleExportAll}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-success-700 border border-success-200 hover:bg-success-50 transition-colors">
                      <Download className="w-3 h-3" /> {t('common.export')} {t('common.all')}
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors ml-auto">
                      <X className="w-3 h-3" /> {t('common.clear')}
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto table-scroll">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header w-8">
                          <input type="checkbox"
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                            onChange={toggleAll}
                            className="rounded border-warm-300 text-primary-600 cursor-pointer"
                            onClick={e => e.stopPropagation()} />
                        </th>
                        <th className="table-header">{t('dev.entradas.col.codigo')}</th>
                        <th className="table-header">{t('dev.entradas.col.fecha')}</th>
                        <th className="table-header">{t('dev.entradas.col.responsable')}</th>
                        <th className="table-header text-center">{t('dev.entradas.col.items')}</th>
                        <th className="table-header text-center">{t('dev.entradas.col.estado')}</th>
                        <th className="table-header text-right">{t('dev.entradas.col.acciones')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {paginatedSesiones.map(row => {
                        const isSelected = selectedIds.has(row.id)
                        return (
                          <tr key={row.id}
                            className={`hover:bg-gradient-to-r hover:from-primary-50/40 hover:to-transparent cursor-pointer transition-all duration-150 group border-b border-warm-50 ${isSelected ? 'bg-primary-50/20' : ''}`}
                            onClick={() => navigate(`/Devoluciones/entradas/${row.id}`)}>
                            <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                              <input type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRow(row.id)}
                                className="rounded border-warm-300 text-primary-600 cursor-pointer"
                                onClick={e => e.stopPropagation()} />
                            </td>
                            <td className="table-cell">
                              <div className="flex items-center gap-1.5">
                                <span className="code-main">{row.codigo}</span>
                                <button onClick={e => copy(row.codigo, e)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-all">
                                  {copied === row.codigo ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                            <td className="table-cell text-warm-500 text-xs">
                              {fmtDate(row.created_at)}<br />
                              <span className="text-warm-400">{fmtTimeShort(row.created_at)}</span>
                            </td>
                            <td className="table-cell text-warm-600 text-xs">{row.responsable_nombre || '—'}</td>
                            <td className="table-cell text-center font-bold text-warm-700">{row.items_count ?? row.total_items ?? '—'}</td>
                            <td className="table-cell text-center">
                              <span className={`badge text-[10px] ${ESTADO_COLORS[row.estado] || 'bg-warm-100 text-warm-600'}`}>
                                {t(`dev.estado.${row.estado}`) || row.estado}
                              </span>
                            </td>
                            <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => navigate(`/Devoluciones/entradas/${row.id}`)}
                                  title={t('dev.entradas.title.ver')}
                                  className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all">
                                  <Eye className="w-4 h-4" />
                                </button>
                                {canExport && row.estado === 'confirmado' && (
                                  <button onClick={e => exportExcel(row, e)}
                                    title={t('dev.entradas.title.exportar')}
                                    className="p-2 rounded-xl hover:bg-success-50 text-warm-400 hover:text-success-600 transition-all">
                                    <Download className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete && row.estado === 'en_proceso' && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setCancelRow(row) }}
                                    title={t('dev.entradas.title.cancelar')}
                                    className="p-2 rounded-xl hover:bg-warning-50 text-warm-400 hover:text-warning-700 transition-all">
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete && ['borrador', 'cancelado'].includes(row.estado) && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setDeleteRow(row) }}
                                    title={t('dev.entradas.title.eliminar')}
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
                  totalItems={sesiones.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel={t('dev.entradas.itemLabel')}
                />
              </>
            )}
          </motion.div>
        </div>
      </div>

      <Modal
        isOpen={!!exportConfirm}
        onClose={() => setExportConfirm(null)}
        title="Confirmar exportación"
        icon={Download}
        size="sm"
        footer={
          <>
            <button onClick={() => setExportConfirm(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => { exportConfirm?.onConfirm(); setExportConfirm(null) }}
              className="px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold hover:bg-success-700 transition-colors">
              Exportar
            </button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-sm text-warm-600">Se exportará la información visible en la tabla con los filtros actuales.</p>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-success-50 border border-success-100">
            <div className="w-9 h-9 rounded-xl bg-success-100 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-success-700" />
            </div>
            <div>
              <p className="text-[11px] text-success-600 font-semibold uppercase tracking-wide">Registros a exportar</p>
              <p className="text-2xl font-bold text-success-700 tabular-nums leading-tight">{exportConfirm?.count}</p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!cancelRow}
        onClose={() => setCancelRow(null)}
        title={t('dev.entradas.cancel.modal.title')}
        icon={X}
        size="sm"
        footer={
          <>
            <button onClick={() => setCancelRow(null)} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              {t('dev.entradas.cancel.no')}
            </button>
            <button
              onClick={() => cancelMutation.mutate(cancelRow.id)}
              disabled={cancelMutation.isPending}
              className="px-4 py-2 rounded-xl bg-warning-600 text-white text-sm font-semibold disabled:opacity-60">
              {cancelMutation.isPending ? t('dev.entradas.cancel.ing') : t('dev.entradas.cancel.yes')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          {t('dev.entradas.cancel.modal.body')} <span className="code-main">{cancelRow?.codigo}</span>?
        </p>
      </Modal>

      <Modal
        isOpen={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        title={t('dev.entradas.delete.modal.title')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteRow(null)} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              {t('dev.entradas.delete.no')}
            </button>
            <button
              onClick={() => deleteMutation.mutate(deleteRow.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-xl bg-danger-600 text-white text-sm font-semibold disabled:opacity-60">
              {deleteMutation.isPending ? t('dev.entradas.delete.ing') : t('dev.entradas.delete.yes')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          {t('dev.entradas.delete.modal.body')} <span className="code-main">{deleteRow?.codigo}</span>? {t('dev.entradas.delete.body')}
        </p>
      </Modal>
    </div>
  )
}
