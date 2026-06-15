import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  Search, X, Eye, Trash2, Download, PackageCheck, Copy, Check,
  ScanBarcode, Printer, Clock, Filter,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { listOrders, listClientes, deleteOrder } from '../services/recepcionService'
import { fmtDate } from '../../../core/utils/dateFormat'
import ImportarOrdenModal from '../components/ImportarOrdenModal'
import ListaRecepcionSelectorModal from '../components/ListaRecepcionSelectorModal'

const ESTADO_META = {
  pendiente_validacion: { cls: 'bg-warm-100 text-warm-600',       dot: 'bg-warm-400' },
  en_validacion:        { cls: 'bg-sky-100 text-sky-700',         dot: 'bg-sky-400' },
  completo:             { cls: 'bg-success-100 text-success-700', dot: 'bg-success-500' },
  parcial:              { cls: 'bg-warning-100 text-warning-700', dot: 'bg-warning-500' },
  cancelado:            { cls: 'bg-danger-100 text-danger-700',   dot: 'bg-danger-500' },
}

const TH = 'table-header whitespace-nowrap'

function EstadoBadge({ estado, t }) {
  const meta = ESTADO_META[estado] ?? ESTADO_META.pendiente_validacion
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${meta.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {t(`rec.status.${estado}`) || estado}
    </span>
  )
}

function CopyCell({ value, className = '', muted = false }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (event) => {
    event.stopPropagation()
    if (!value) return
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // Ignore clipboard failures.
    }
  }

  return (
    <div className={`inline-flex max-w-full items-center gap-1.5 ${className}`}>
      <span className={`truncate ${muted ? 'text-warm-600' : ''}`}>{value || '—'}</span>
      {value ? (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-0.5 text-warm-300 opacity-0 transition-all hover:bg-warm-100 hover:text-primary-600 group-hover:opacity-100"
          title="Copiar"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  )
}

export default function Recibir() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission, canDelete } = useAuthStore()
  const toast = useToastStore()
  const { t } = useI18nStore()

  const [q, setQ] = useState('')
  const [qFilter, setQFilter] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [estados, setEstados] = useState([])
  const [clienteFilter, setClienteFilter] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [showImport, setShowImport] = useState(false)
  const [showListaSelector, setShowListaSelector] = useState(false)
  const [deleteRow, setDeleteRow] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkDelOpen, setBulkDelOpen] = useState(false)

  const params = useMemo(() => ({
    q: qFilter || undefined,
    estado: estados.length === 1 ? estados[0] : undefined,
    clientes: clienteFilter.length ? clienteFilter.join(',') : undefined,
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    page,
    limit: pageSize,
  }), [qFilter, estados, clienteFilter, fechaDesde, fechaHasta, page, pageSize])

  const { data, isLoading } = useQuery({
    queryKey: ['recepcion-orders', params],
    queryFn: () => listOrders(params),
  })

  const { data: clientesData } = useQuery({
    queryKey: ['recepcion-clientes'],
    queryFn: listClientes,
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteOrder(id),
    onSuccess: () => {
      toast.success('Orden eliminada')
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      setDeleteRow(null)
      setSelected(prev => { const n = new Set(prev); return n })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) await deleteOrder(id)
    },
    onSuccess: () => {
      toast.success(`${selected.size} órdenes eliminadas`)
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      setSelected(new Set())
      setBulkDelOpen(false)
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const orders = data?.orders || []
  const total = data?.total || 0
  const clienteOptions = (clientesData?.clientes || []).map(c => ({ value: c, label: c }))
  const estadoOptions = [
    { value: 'pendiente_validacion', label: t('rec.status.pendiente_validacion') },
    { value: 'en_validacion',        label: t('rec.status.en_validacion') },
    { value: 'completo',             label: t('rec.status.completo') },
    { value: 'parcial',              label: t('rec.status.parcial') },
    { value: 'cancelado',            label: t('rec.status.cancelado') },
  ]

  const canCreate = hasPermission('recepcion.recibir', 'crear')
  const canDel = canDelete('recepcion.recibir')
  const canValidate = hasPermission('recepcion.recibir', 'actualizar')
  const hasActiveFilters =
    Boolean(q.trim()) ||
    Boolean(qFilter.trim()) ||
    estados.length > 0 ||
    clienteFilter.length > 0 ||
    Boolean(fechaDesde) ||
    Boolean(fechaHasta)

  // Checkbox helpers
  const pageIds = orders.map(o => o.id)
  const allChecked = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const someChecked = pageIds.some(id => selected.has(id))
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) pageIds.forEach(id => next.delete(id))
      else pageIds.forEach(id => next.add(id))
      return next
    })
  }
  const toggleRow = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Deletable selected: only pendiente_validacion
  const deletableSelected = orders.filter(o => selected.has(o.id) && o.estado === 'pendiente_validacion').map(o => o.id)

  const handleApply = () => { setQFilter(q); setPage(1) }
  const handleClear = () => {
    setQ(''); setQFilter(''); setEstados([]); setClienteFilter([])
    setFechaDesde(''); setFechaHasta(''); setPage(1); setSelected(new Set())
  }

  const handleExportSelected = () => {
    const sel = orders.filter(o => selected.has(o.id))
    if (!sel.length) return
    const rows = sel.map(o => [
      o.folio, o.cliente || '', o.inbound_order_no || '', o.tracking_no || '',
      o.reference_no || '', o.total_cajas, o.cajas_validadas,
      t(`rec.status.${o.estado}`), o.responsable_nombre || '', fmtDate(o.created_at),
    ])
    const ws = XLSX.utils.aoa_to_sheet([[
      'Folio', 'Cliente', 'Orden WMS', 'Tracking', 'Referencia',
      'Total Cajas', 'Validadas', 'Estado', 'Responsable', 'Fecha',
    ], ...rows])
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recepcion')
    XLSX.writeFile(wb, `recepcion-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('rec.recibir.title')}
        icon={PackageCheck}
        actions={
          canCreate ? (
            <button
              onClick={() => setShowListaSelector(true)}
              className="btn-ghost inline-flex items-center gap-1.5 text-sm h-9 px-3"
            >
              <Printer size={15} />
              {t('rec.btn.listaRecepcion')}
            </button>
          ) : null
        }
      />

      {/* Sticky filter bar */}
      <div className="sticky top-[3.5rem] z-[20] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">
        {/* Row 1: dates + primary actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
            <Clock size={13} className="text-warm-400 shrink-0" />
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="text-xs outline-none bg-transparent text-warm-700 w-[108px]" />
            <span className="text-warm-300 text-xs">→</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="text-xs outline-none bg-transparent text-warm-700 w-[108px]" />
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {canCreate && (
              <button
                onClick={() => setShowImport(true)}
                className="btn-primary inline-flex items-center gap-2 text-sm h-10 px-4"
              >
                <PackageCheck size={15} />
                {t('rec.btn.recibir')}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: filters + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelect
            options={estadoOptions}
            value={estados}
            onChange={setEstados}
            placeholder={t('rec.filter.estado')}
          />
          <MultiSelect
            options={clienteOptions}
            value={clienteFilter}
            onChange={setClienteFilter}
            placeholder={t('rec.filter.cliente')}
          />

          <div className="flex-1 min-w-[220px] flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 transition-all focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
            <Search size={14} className="text-warm-400 shrink-0" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleApply()}
              placeholder="Folio, cliente, referencia, tracking, SKU, código caja..."
              className="flex-1 text-xs bg-transparent outline-none text-warm-700 placeholder:text-warm-400"
            />
            {q && (
              <button onClick={() => { setQ(''); setQFilter(''); setPage(1) }} className="text-warm-300 hover:text-warm-500">
                <X size={13} />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1 h-10 px-3 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
            >
              <X className="w-3 h-3" /> {t('common.clear')}
            </button>
          )}
          <button
            onClick={handleApply}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-100 px-4 text-xs font-semibold text-violet-700 hover:bg-violet-200 transition-colors"
          >
            <Filter size={13} /> {t('common.apply')}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col px-5 py-3 gap-3">
        <div className="card overflow-hidden table-shell">
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-50 border-b border-sky-100 flex-wrap">
              <span className="text-xs text-sky-700 font-semibold tabular-nums">
                {selected.size} {selected.size === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
              </span>
              {canDel && deletableSelected.length > 0 && (
                <button
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-danger-700 border border-danger-200 hover:bg-danger-50 transition-colors"
                  onClick={() => setBulkDelOpen(true)}
                >
                  <Trash2 size={12} /> Eliminar seleccionadas ({deletableSelected.length})
                </button>
              )}
              <button
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors"
                onClick={handleExportSelected}
              >
                <Download size={12} /> {t('common.export')} ({selected.size})
              </button>
              <button
                className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors ml-auto"
                onClick={() => setSelected(new Set())}
              >
                <X size={12} /> {t('common.clear')}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-warm-400">
              <PackageCheck className="w-10 h-10 mb-3 text-warm-200" />
              <p className="text-sm">{t('common.noData')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                  <tr>
                    <th className={`${TH} w-8`}>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                        onChange={toggleAll}
                        className="cb"
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <th className={TH}>{t('rec.folio')}</th>
                    <th className={TH}>{t('rec.cliente')}</th>
                    <th className={TH}>{t('rec.inbound_order_no')}</th>
                    <th className={TH}>{t('rec.tracking_no')}</th>
                    <th className={TH}>{t('rec.reference_no')}</th>
                    <th className={`${TH} text-right`}>{t('rec.total_cajas')}</th>
                    <th className={`${TH} text-right`}>{t('rec.cajas_validadas')}</th>
                    <th className={TH}>{t('common.status')}</th>
                    <th className={TH}>{t('rec.created_at')}</th>
                    <th className={`${TH} text-right`}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {orders.map(order => (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/recepcion/recibir/${order.id}`)}
                      className="hover:bg-sky-50/30 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleRow(order.id)}
                          className="cb"
                        />
                      </td>
                      <td className="group px-3 py-2.5 font-mono font-semibold text-primary-700 text-xs">
                        <CopyCell value={order.folio} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-warm-700 font-medium max-w-[140px] truncate">{order.cliente || '—'}</td>
                      <td className="group px-3 py-2.5 font-mono text-xs text-warm-600">
                        <CopyCell value={order.inbound_order_no} muted />
                      </td>
                      <td className="group px-3 py-2.5 font-mono text-xs text-warm-600">
                        <CopyCell value={order.tracking_no} muted />
                      </td>
                      <td className="group px-3 py-2.5 text-xs text-warm-600">
                        <CopyCell value={order.reference_no} muted />
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-medium text-warm-700">{order.total_cajas}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-medium text-success-700">{order.cajas_validadas}</td>
                      <td className="px-3 py-2.5"><EstadoBadge estado={order.estado} t={t} /></td>
                      <td className="px-3 py-2.5 text-xs text-warm-500">{fmtDate(order.created_at)}</td>
                      <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => navigate(`/recepcion/recibir/${order.id}`)}
                            className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-primary-600 transition-colors"
                            title={t('common.view')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canValidate && (
                            <button
                              onClick={() => navigate(`/recepcion/recibir/${order.id}/validar`)}
                              className="p-1.5 rounded-lg hover:bg-sky-50 text-warm-400 hover:text-sky-600 transition-colors"
                              title={t('rec.btn.validar')}
                            >
                              <ScanBarcode className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDel && order.estado === 'pendiente_validacion' && (
                            <button
                              onClick={() => setDeleteRow(order)}
                              className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </div>
      </div>

      {/* Single delete confirm */}
      {deleteRow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-danger-600" />
              </div>
              <div>
                <p className="font-semibold text-warm-900">{t('rec.delete.confirm')}</p>
                <p className="text-sm text-warm-500 font-mono">{deleteRow.folio}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteRow(null)} className="btn-ghost">{t('common.cancel')}</button>
              <button
                onClick={() => deleteMutation.mutate(deleteRow.id)}
                disabled={deleteMutation.isPending}
                className="btn-danger disabled:opacity-50"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirm */}
      {bulkDelOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-danger-600" />
              </div>
              <div>
                <p className="font-semibold text-warm-900">Eliminar {deletableSelected.length} órdenes</p>
                <p className="text-xs text-warm-500">Solo se eliminarán las órdenes en estado pendiente</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBulkDelOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
              <button
                onClick={() => bulkDeleteMutation.mutate(deletableSelected)}
                disabled={bulkDeleteMutation.isPending}
                className="btn-danger disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportarOrdenModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onCreated={(order) => {
          setShowImport(false)
          qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
          navigate(`/recepcion/recibir/${order.id}`)
        }}
      />

      <ListaRecepcionSelectorModal
        isOpen={showListaSelector}
        onClose={() => setShowListaSelector(false)}
      />
    </div>
  )
}
