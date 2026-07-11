import { useState, useMemo, useCallback, useRef, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, X, Eye, Trash2, Download, PackageCheck, Copy, Check,
  ScanBarcode, Printer, Clock, Tags, Plus, Edit3,
} from 'lucide-react'
import RecepcionMobileHub from '../components/RecepcionMobileHub'
import RecepcionQuickSearch from '../components/RecepcionQuickSearch'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import MultiSelect from '../../../core/components/common/MultiSelect'
import StatusPill from '../../../core/components/common/StatusPill'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import ModuleLimitBanner from '../../../core/components/common/ModuleLimitBanner'
import { useModuleUsage } from '../../../core/hooks/useModuleUsage'
import { listOrders, listClientes, deleteOrder, getNovedadTipos, createNovedadTipo, updateNovedadTipo, deleteNovedadTipo } from '../services/recepcionService'
import { STALE } from '../../../core/constants/queryConfig'
import { fmtDate } from '../../../core/utils/dateFormat'
import ImportarOrdenModal from '../components/ImportarOrdenModal'
import ListaRecepcionSelectorModal from '../components/ListaRecepcionSelectorModal'
import { useRecepcionValidationLauncher } from '../hooks/useRecepcionValidationLauncher'

const MemoRecepcionMobileHub = memo(RecepcionMobileHub)

const ESTADO_META = {
  pendiente_validacion: { cls: 'bg-warm-100 text-warm-600' },
  en_validacion:        { cls: 'bg-sky-100 text-sky-700' },
  completo:             { cls: 'bg-success-100 text-success-700' },
  parcial:              { cls: 'bg-warning-100 text-warning-700' },
  anormal:              { cls: 'bg-danger-100 text-danger-700' },
  cancelado:            { cls: 'bg-danger-100 text-danger-700' },
}

const TH = 'table-header whitespace-nowrap'

function EstadoBadge({ estado, t }) {
  const meta = ESTADO_META[estado] ?? ESTADO_META.pendiente_validacion
  return (
    <StatusPill className={meta.cls}>
      {t(`rec.status.${estado}`) || estado}
    </StatusPill>
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
    } catch { /* ignore */ }
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

const DesktopOrdersPanel = memo(function DesktopOrdersPanel({
  orders,
  total,
  isLoading,
  selected,
  setSelected,
  deletableSelected,
  canUpdateDelete,
  canValidate,
  canDeleteOrder,
  handleExportSelected,
  onOpenBulkDelete,
  onDeleteRow,
  onValidateRow,
  page,
  pageSize,
  setPage,
  t,
}) {
  const navigate = useNavigate()

  const pageIds = useMemo(() => orders.map(o => o.id), [orders])
  const allChecked = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const someChecked = pageIds.some(id => selected.has(id))

  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) pageIds.forEach(id => next.delete(id))
      else pageIds.forEach(id => next.add(id))
      return next
    })
  }, [allChecked, pageIds, setSelected])

  const toggleRow = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [setSelected])

  return (
    <div className="flex-1 overflow-hidden flex flex-col px-5 py-3 gap-3">
      <div className="card overflow-hidden table-shell">
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-50 border-b border-sky-100 flex-wrap">
            <span className="text-xs text-sky-700 font-semibold tabular-nums">
              {selected.size} {selected.size === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
            </span>
            {canUpdateDelete && deletableSelected.length > 0 && (
              <button
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-danger-700 border border-danger-200 hover:bg-danger-50 transition-colors"
                onClick={onOpenBulkDelete}
              >
                <Trash2 size={12} /> {t('rec.delete.selected').replace('{count}', String(deletableSelected.length))}
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
          <div className="flex min-h-[360px] items-center justify-center">
            <LoadingSpinner size="lg" text={t('common.loadingData')} delayMs={1000} />
          </div>
        ) : orders.length === 0 ? null : (
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
                  <th className={TH}>{t('rec.created_at')}</th>
                  <th className={TH}>{t('rec.cliente')}</th>
                  <th className={TH}>{t('rec.inbound_order_no')}</th>
                  <th className={TH}>{t('rec.tracking_no')}</th>
                  <th className={TH}>{t('rec.reference_no')}</th>
                  <th className={`${TH} text-right`}>{t('rec.total_cajas')}</th>
                  <th className={`${TH} text-right`}>{t('rec.cajas_registradas')}</th>
                  <th className={TH}>{t('common.status')}</th>
                  <th className={`${TH} text-right`}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {orders.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/recepcion/recibir/${order.id}`)}
                    className="hover:bg-primary-100 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(order.id)} onChange={() => toggleRow(order.id)} className="cb" />
                    </td>
                    <td className="group px-3 py-2.5 font-mono font-semibold text-primary-700 text-xs">
                      <CopyCell value={order.folio} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-warm-500">{fmtDate(order.created_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-warm-700 font-medium max-w-[140px] truncate">{order.cliente || '—'}</td>
                    <td className="group px-3 py-2.5 font-mono text-xs text-warm-600"><CopyCell value={order.inbound_order_no} muted /></td>
                    <td className="group px-3 py-2.5 font-mono text-xs text-warm-600"><CopyCell value={order.tracking_no} muted /></td>
                    <td className="group px-3 py-2.5 text-xs text-warm-600"><CopyCell value={order.reference_no} muted /></td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-warm-700">{order.total_cajas}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-success-700">{order.cajas_registradas ?? order.cajas_validadas}</td>
                    <td className="px-3 py-2.5"><EstadoBadge estado={order.estado} t={t} /></td>
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
                            onClick={() => onValidateRow(order)}
                            className="p-1.5 rounded-lg hover:bg-sky-50 text-warm-400 hover:text-sky-600 transition-colors"
                            title={t('rec.btn.validar')}
                          >
                            <ScanBarcode className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canUpdateDelete && canDeleteOrder(order) && (
                          <button
                            onClick={() => onDeleteRow(order)}
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

        {!isLoading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-warm-400">
            <PackageCheck className="w-10 h-10 mb-3 text-warm-200" />
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        )}

        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>
    </div>
  )
})

export default function Recibir() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission, getPermissionLevel, isAuthenticated } = useAuthStore()
  const toast = useToastStore()
  const { t } = useI18nStore()
  const { data: moduleUsage } = useModuleUsage()
  const { openValidationFlow, validationModeModal } = useRecepcionValidationLauncher()

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
  const [tiposModalOpen, setTiposModalOpen] = useState(false)
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState('')
  const [editingTipoId, setEditingTipoId] = useState(null)
  const [editingTipoNombre, setEditingTipoNombre] = useState('')

  const params = useMemo(() => ({
    q: qFilter || undefined,
    estado: estados.length === 1 ? estados[0] : undefined,
    clientes: clienteFilter.length ? clienteFilter.join(',') : undefined,
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    page,
    limit: pageSize,
  }), [qFilter, estados, clienteFilter, fechaDesde, fechaHasta, page, pageSize])

  const canQueryRecepcion = isAuthenticated

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['recepcion-orders', params],
    queryFn: () => listOrders(params),
    enabled: canQueryRecepcion,
    retry: false,
  })

  const { data: clientesData } = useQuery({
    queryKey: ['recepcion-clientes'],
    queryFn: listClientes,
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.MEDIUM,
  })

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['recepcion-orders-active'],
    queryFn: () => listOrders({ limit: 200 }),
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.SHORT,
    refetchInterval: canQueryRecepcion ? 60_000 : false,
  })
  const activeOrders = useMemo(() =>
    (activeData?.orders || []).filter(o => o.estado !== 'completo' && o.estado !== 'cancelado'),
    [activeData?.orders]
  )

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteOrder(id),
    onSuccess: () => {
      toast.success(t('rec.toast.order_deleted'))
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders-active'] })
      setDeleteRow(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) await deleteOrder(id)
    },
    onSuccess: (_data, ids) => {
      toast.success(t('rec.toast.orders_deleted').replace('{count}', String(ids.length)))
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders-active'] })
      setSelected(new Set())
      setBulkDelOpen(false)
    },
    onError: (err) => {
      // Partial deletes may have succeeded — re-sync list to reflect actual server state
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders-active'] })
      toast.error(err.response?.data?.error || t('toast.error'))
    },
  })

  const { data: tiposData } = useQuery({
    queryKey: ['recepcion-novedad-tipos'],
    queryFn: getNovedadTipos,
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.MEDIUM,
  })

  const createTipoMut = useMutation({
    mutationFn: (payload) => createNovedadTipo(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recepcion-novedad-tipos'] }); setNuevoTipoNombre('') },
    onError: () => toast.error(t('toast.error')),
  })

  const updateTipoMut = useMutation({
    mutationFn: ({ id, nombre }) => updateNovedadTipo(id, { nombre }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recepcion-novedad-tipos'] }); setEditingTipoId(null); setEditingTipoNombre('') },
    onError: () => toast.error(t('toast.error')),
  })

  const deleteTipoMut = useMutation({
    mutationFn: (id) => deleteNovedadTipo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recepcion-novedad-tipos'] }),
    onError: () => toast.error(t('toast.error')),
  })

  const orders = data?.orders || []
  const total = data?.total || 0
  const loadingOrders = canQueryRecepcion && (isLoading || (isFetching && !data))
  const clienteOptions = useMemo(() =>
    (clientesData?.clientes || []).map(c => ({ value: c, label: c })),
    [clientesData?.clientes]
  )
  const estadoOptions = useMemo(() => [
    { value: 'pendiente_validacion', label: t('rec.status.pendiente_validacion') },
    { value: 'en_validacion',        label: t('rec.status.en_validacion') },
    { value: 'completo',             label: t('rec.status.completo') },
    { value: 'parcial',              label: t('rec.status.parcial') },
    { value: 'anormal',              label: t('rec.status.anormal') },
    { value: 'cancelado',            label: t('rec.status.cancelado') },
  ], [t])

  const canCreate = hasPermission('recepcion.recibir', 'crear')
  const canUpdateDelete = hasPermission('recepcion.recibir', 'actualizar')
  const canForceDelete = getPermissionLevel('recepcion.recibir') === 'eliminar'
  const canValidate = hasPermission('recepcion.recibir', 'actualizar')
  const canManageTipos = hasPermission('recepcion.validacion', 'actualizar')
  const hasActiveFilters =
    Boolean(q.trim()) || Boolean(qFilter.trim()) ||
    estados.length > 0 || clienteFilter.length > 0 ||
    Boolean(fechaDesde) || Boolean(fechaHasta)

  const canDeleteOrder = useCallback((order) =>
    canForceDelete || Number(order.validation_records || 0) === 0
  , [canForceDelete])

  const deletableSelected = useMemo(() =>
    orders.filter(o => selected.has(o.id) && canDeleteOrder(o)).map(o => o.id),
    [orders, selected, canDeleteOrder]
  )

  const searchDebounceRef = useRef(null)
  const handleSearchChange = useCallback((value) => {
    setQ(value)
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setQFilter(value)
      setPage(1)
    }, 400)
  }, [])
  const handleClear = useCallback(() => {
    setQ(''); setQFilter(''); setEstados([]); setClienteFilter([])
    setFechaDesde(''); setFechaHasta(''); setPage(1); setSelected(new Set())
  }, [])
  const handleOpenBulkDelete = useCallback(() => setBulkDelOpen(true), [])

  const handleExportSelected = useCallback(async () => {
    const sel = orders.filter(o => selected.has(o.id))
    if (!sel.length) return
    const XLSX = await import('xlsx')
    const rows = sel.map(o => [
      o.folio, fmtDate(o.created_at), o.cliente || '', o.inbound_order_no || '', o.tracking_no || '',
      o.reference_no || '', o.total_cajas, o.cajas_registradas ?? o.cajas_validadas,
      t(`rec.status.${o.estado}`), o.responsable_nombre || '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([[
      'Folio', 'Fecha', 'Cliente', 'Orden WMS', 'Tracking', 'Referencia',
      'Total Cajas', 'Validadas', 'Estado', 'Responsable',
    ], ...rows])
    ws['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 },
      { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recepcion')
    XLSX.writeFile(wb, `recepcion-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }, [orders, selected, t])

  return (
    <ModuleLimitBanner module="recepcion" usage={moduleUsage?.recepcion}>
    <div className="flex flex-col h-full">
      <Header
        hideUserOnMobile
        title={t('rec.recibir.title')}
        icon={PackageCheck}
        quickSearch={<RecepcionQuickSearch />}
        actions={
          <div className="flex items-center gap-1.5">
            {canCreate && (
              <button
                onClick={() => setShowImport(true)}
                className="btn-primary sm:hidden inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold"
              >
                <PackageCheck size={13} />
                {t('rec.btn.recibir')}
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => setShowListaSelector(true)}
                className="btn-ghost hidden sm:inline-flex items-center gap-1.5 text-sm h-9 px-3"
              >
                <Printer size={15} />
                {t('rec.btn.listaRecepcion')}
              </button>
            )}
            {canManageTipos && (
              <button
                onClick={() => setTiposModalOpen(true)}
                className="btn-ghost hidden sm:inline-flex items-center gap-1.5 text-sm h-9 px-3"
              >
                <Tags size={15} />
                {t('rec.tipos.btn_header')}
              </button>
            )}
          </div>
        }
      />

      {/* MOBILE: scan hub — completely different layout */}
      <div className="flex sm:hidden flex-col flex-1 overflow-hidden">
        <MemoRecepcionMobileHub
          orders={activeOrders}
          isLoading={activeLoading}
          t={t}
          onValidateOrder={openValidationFlow}
        />
      </div>

      {/* DESKTOP: filter bar + table */}
      <div className="hidden sm:flex flex-col flex-1 min-h-0">
        {/* Sticky filter bar */}
        <div className="sticky top-[3.5rem] z-[20] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
              <Clock size={13} className="text-warm-400 shrink-0" />
              <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[108px]" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[108px]" />
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {canCreate && (
                <button
                  data-tour="rec-btn-recibir"
                  onClick={() => setShowImport(true)}
                  className="btn-primary inline-flex items-center gap-2 text-sm h-10 px-4"
                >
                  <PackageCheck size={15} />
                  {t('rec.btn.recibir')}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <MultiSelect options={estadoOptions} value={estados} onChange={v => { setEstados(v); setPage(1) }} placeholder={t('rec.filter.estado')} />
            <MultiSelect options={clienteOptions} value={clienteFilter} onChange={v => { setClienteFilter(v); setPage(1) }} placeholder={t('rec.filter.cliente')} />
            <div className="flex-1 min-w-[220px] flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 transition-all focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
              <Search size={14} className="text-warm-400 shrink-0" />
              <input
                value={q}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder={t('rec.recibir.search_placeholder')}
                className="flex-1 text-xs bg-transparent outline-none text-warm-700 placeholder:text-warm-400"
              />
              {q && (
                <button onClick={() => { setQ(''); setQFilter(''); setPage(1) }} className="text-warm-300 hover:text-warm-500">
                  <X size={13} />
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <button onClick={handleClear} className="inline-flex items-center gap-1 h-10 px-3 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                <X className="w-3 h-3" /> {t('common.clear')}
              </button>
            )}
          </div>
        </div>

        <DesktopOrdersPanel
          orders={orders}
          total={total}
          isLoading={loadingOrders}
          selected={selected}
          setSelected={setSelected}
          deletableSelected={deletableSelected}
          canUpdateDelete={canUpdateDelete}
          canValidate={canValidate}
          canDeleteOrder={canDeleteOrder}
          handleExportSelected={handleExportSelected}
          onOpenBulkDelete={handleOpenBulkDelete}
          onDeleteRow={setDeleteRow}
          onValidateRow={openValidationFlow}
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          t={t}
        />
      </div>

      {/* Delete confirm */}
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
            <p className="text-sm text-warm-600">
              {canForceDelete
                ? t('rec.delete.force_body')
                : t('rec.delete.update_body')}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteRow(null)} className="btn-ghost">{t('common.cancel')}</button>
              <button onClick={() => deleteMutation.mutate(deleteRow.id)} disabled={deleteMutation.isPending} className="btn-danger disabled:opacity-50">
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
                <p className="font-semibold text-warm-900">{t('rec.delete.bulk_title').replace('{count}', String(deletableSelected.length))}</p>
                <p className="text-xs text-warm-500">
                  {canForceDelete ? t('rec.delete.bulk_force_body') : t('rec.delete.bulk_update_body')}
                </p>
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

      {/* Tipos de incidencia modal */}
      <Modal
        isOpen={tiposModalOpen}
        onClose={() => { setTiposModalOpen(false); setNuevoTipoNombre(''); setEditingTipoId(null); setEditingTipoNombre('') }}
        title={t('rec.tipos.title')}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevoTipoNombre}
              onChange={e => setNuevoTipoNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && nuevoTipoNombre.trim() && createTipoMut.mutate({ nombre: nuevoTipoNombre.trim() })}
              placeholder={t('rec.tipos.placeholder')}
              className="flex-1 px-3 py-2 rounded-xl border border-warm-200 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => nuevoTipoNombre.trim() && createTipoMut.mutate({ nombre: nuevoTipoNombre.trim() })}
              disabled={!nuevoTipoNombre.trim() || createTipoMut.isPending}
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-50 whitespace-nowrap"
            >
              {createTipoMut.isPending
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Plus className="w-4 h-4" />}
              {t('rec.tipos.add')}
            </button>
          </div>
          <div className="border border-warm-100 rounded-xl overflow-hidden">
            {(tiposData?.tipos || []).length === 0 ? (
              <div className="py-8 text-center text-sm text-warm-400">{t('rec.tipos.empty')}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">{t('common.name')}</th>
                    <th className="table-header text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {(tiposData?.tipos || []).map(tipo => (
                    <tr key={tipo.id} className="table-row">
                      <td className="px-3 py-2.5">
                        {editingTipoId === tipo.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingTipoNombre}
                            onChange={e => setEditingTipoNombre(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && editingTipoNombre.trim()) updateTipoMut.mutate({ id: tipo.id, nombre: editingTipoNombre.trim() })
                              if (e.key === 'Escape') { setEditingTipoId(null); setEditingTipoNombre('') }
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-primary-300 text-xs font-medium outline-none focus:ring-2 focus:ring-primary-100"
                          />
                        ) : (
                          <span className="text-warm-700 text-xs font-medium">{tipo.nombre}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-0.5">
                          {editingTipoId === tipo.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => editingTipoNombre.trim() && updateTipoMut.mutate({ id: tipo.id, nombre: editingTipoNombre.trim() })}
                                disabled={!editingTipoNombre.trim() || updateTipoMut.isPending}
                                className="inline-flex rounded-lg p-1.5 text-success-600 hover:bg-success-50 disabled:opacity-30"
                                title={t('common.save')}
                              >
                                {updateTipoMut.isPending
                                  ? <div className="w-3.5 h-3.5 border-2 border-success-600 border-t-transparent rounded-full animate-spin" />
                                  : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingTipoId(null); setEditingTipoNombre('') }}
                                className="inline-flex rounded-lg p-1.5 text-warm-400 hover:bg-warm-50"
                                title={t('common.cancel')}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingTipoId(tipo.id); setEditingTipoNombre(tipo.nombre) }}
                              className="inline-flex rounded-lg p-1.5 text-warm-400 hover:bg-warm-50 hover:text-primary-600"
                              title={t('common.edit')}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteTipoMut.mutate(tipo.id)}
                            disabled={deleteTipoMut.isPending || editingTipoId === tipo.id}
                            className="inline-flex rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 disabled:opacity-30"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      <ImportarOrdenModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onCreated={(order) => {
          setShowImport(false)
          qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
          qc.invalidateQueries({ queryKey: ['recepcion-orders-active'] })
          navigate(`/recepcion/recibir/${order.id}`)
        }}
      />

      <ListaRecepcionSelectorModal
        isOpen={showListaSelector}
        onClose={() => setShowListaSelector(false)}
      />
      {validationModeModal}
    </div>
    </ModuleLimitBanner>
  )
}
