// frontend/src/modules/Despacho/pages/Ordenes.jsx
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search, X, Truck, PackageCheck, RefreshCw, Clock, Filter,
  Users, ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle,
  ScanLine, CalendarDays,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import MultiSelect from '../../../core/components/common/MultiSelect'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDate, fmtTimeShort } from '../../../core/utils/dateFormat'
import { getOutboundList, getOrdenesDispatch, getConductores, getUnidades } from '../services/despachoService'
import { ConductoresModal, UnidadesModal } from '../components/CatalogsModals'
import IniciarDespachoModal  from '../components/IniciarDespachoModal'
import ScanDispatchModal     from '../components/ScanDispatchModal'
import DispatchQuantityModal from '../components/DispatchQuantityModal'
import AgendaView            from '../components/AgendaView'
import { getDespachoDates, setDespachoDates, clearDespachoDates } from '../utils/despachoSession'

const STATUS_META = {
  pending_assignment: { label: 'Por Asignar', cls: 'bg-warm-100 text-warm-600' },
  sorting:            { label: 'En Surtido',  cls: 'bg-primary-100 text-primary-700' },
  validating:         { label: 'Validando',   cls: 'bg-accent-100 text-accent-700' },
  complete:           { label: 'Completo',    cls: 'bg-success-100 text-success-700' },
  partial:            { label: 'Parcial',     cls: 'bg-warning-100 text-warning-700' },
  cancelled:          { label: 'Cancelado',   cls: 'bg-danger-100 text-danger-700' },
}

const DISPATCH_ESTADO_META = {
  pendiente:  { label: 'Pendiente',  cls: 'text-warm-500' },
  cargado:    { label: 'Cargado',    cls: 'text-primary-700' },
  entregado:  { label: 'Entregado',  cls: 'text-success-700' },
  devolucion: { label: 'Devolución', cls: 'text-danger-600' },
}

const DATE_PRESETS = [
  { label: 'Hoy',     d: 0 },
  { label: '7 días',  d: 7 },
  { label: '30 días', d: 30 },
]

const STATUS_OPTIONS  = Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))
const DISPATCH_OPTIONS = [
  { value: 'none', label: 'Sin folio' },
  ...Object.entries(DISPATCH_ESTADO_META).map(([k, v]) => ({ value: k, label: v.label })),
]

const TABS = [
  { id: 'all',       label: 'Todos' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'cargado',   label: 'Cargado' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' },
]

function statusBadge(status) {
  const meta = STATUS_META[status] ?? STATUS_META.pending_assignment
  return <span className={`badge text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
}

function SortHeader({ label, field, sortField, sortDir, onSort, className = '' }) {
  const active = field === sortField
  return (
    <th
      className={`table-header cursor-pointer select-none hover:bg-warm-100/60 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-primary-500" />
            : <ChevronDown className="w-3 h-3 text-primary-500" />
          : <ChevronsUpDown className="w-3 h-3 text-warm-300" />
        }
      </div>
    </th>
  )
}

export default function Ordenes() {
  const qc = useQueryClient()

  const canManageCatalogs = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.ordenes')
    return lvl === 'actualizar' || lvl === 'eliminar'
  })
  const canDispatch = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.folios')
    return ['crear', 'actualizar', 'eliminar'].includes(lvl)
  })

  const [searchInput, setSearchInput]   = useState('')
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState(() => getDespachoDates()?.dateFrom ?? '')
  const [dateTo, setDateTo]             = useState(() => getDespachoDates()?.dateTo   ?? '')
  const [statusFilter, setStatusFilter] = useState([])
  const [dispatchFilter, setDispatchFilter] = useState([])
  const [tab, setTab]       = useState('all')
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir]     = useState('desc')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(20)
  const [refreshing, setRefreshing]   = useState(false)
  const [showConductores, setShowConductores] = useState(false)
  const [showUnidades, setShowUnidades]       = useState(false)

  const [showIniciarDespacho, setShowIniciarDespacho] = useState(false)
  const [showScan, setShowScan]               = useState(false)
  const [showAgenda, setShowAgenda]           = useState(false)
  const [dispatchOrder, setDispatchOrder]     = useState(null)
  const [showDispatchQty, setShowDispatchQty] = useState(false)

  const { data: sheetsData, isLoading: loadingSheets, isError } = useQuery({
    queryKey: ['despacho-outbound-list'],
    queryFn: getOutboundList,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.data?.partial ? 5000 : false,
  })

  const { data: dispatchData } = useQuery({
    queryKey: ['despacho-ordenes-dispatch'],
    queryFn: getOrdenesDispatch,
    refetchInterval: 30000,
  })

  const { data: conductoresData } = useQuery({ queryKey: ['despacho-conductores'], queryFn: getConductores })
  const { data: unidadesData }    = useQuery({ queryKey: ['despacho-unidades'],    queryFn: getUnidades })
  const conductores = conductoresData?.conductores ?? []
  const unidades    = unidadesData?.unidades    ?? []

  const dispatchMap = useMemo(() => {
    const map = new Map()
    for (const d of (dispatchData?.dispatch ?? [])) {
      map.set(d.outbound_order_no, d)
    }
    return map
  }, [dispatchData])

  const allOrders = useMemo(() => {
    const raw = sheetsData?.data?.records ?? sheetsData?.records ?? []
    return Array.isArray(raw) ? raw : []
  }, [sheetsData])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allOrders.filter(order => {
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      const orderDate = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
      const dateKey  = orderDate ? orderDate.slice(0, 10) : ''
      if (dateFrom && dateKey && dateKey < dateFrom) return false
      if (dateTo   && dateKey && dateKey > dateTo)   return false
      if (statusFilter.length > 0) {
        const status = order.trackingStatus || order.status || 'pending_assignment'
        if (!statusFilter.includes(status)) return false
      }
      if (dispatchFilter.length > 0) {
        const dispatch    = dispatchMap.get(orderNo)
        const dispEstado  = dispatch ? dispatch.order_estado : 'none'
        if (!dispatchFilter.includes(dispEstado)) return false
      }
      if (tab !== 'all') {
        const dispatch   = dispatchMap.get(orderNo)
        const wmsStatus  = order.trackingStatus || order.status || ''
        if (tab === 'pendiente') {
          if (dispatch && dispatch.order_estado !== 'pendiente') return false
        } else if (tab === 'cargado') {
          if (!dispatch || dispatch.order_estado !== 'cargado') return false
        } else if (tab === 'entregado') {
          if (!dispatch || dispatch.order_estado !== 'entregado') return false
        } else if (tab === 'cancelado') {
          if (wmsStatus !== 'cancelled' && (!dispatch || dispatch.order_estado !== 'devolucion')) return false
        }
      }
      if (q) {
        const customer = (order.customerName || order.cliente || '').toLowerCase()
        if (!orderNo.toLowerCase().includes(q) && !customer.includes(q)) return false
      }
      return true
    })
  }, [allOrders, search, dateFrom, dateTo, statusFilter, dispatchFilter, tab, dispatchMap])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const noA = a.outboundOrderNo || a.order_no || ''
      const noB = b.outboundOrderNo || b.order_no || ''
      let av, bv
      if (sortField === 'date') {
        av = a.outboundTime || a.expectedTime || a.orderCreateTime || ''
        bv = b.outboundTime || b.expectedTime || b.orderCreateTime || ''
      } else if (sortField === 'folio') {
        av = dispatchMap.get(noA)?.folio_numero ?? ''
        bv = dispatchMap.get(noB)?.folio_numero ?? ''
      } else if (sortField === 'outboundOrderNo') {
        av = noA; bv = noB
      } else if (sortField === 'customerName') {
        av = a.customerName || a.cliente || ''
        bv = b.customerName || b.cliente || ''
      } else if (sortField === 'trackingStatus') {
        av = a.trackingStatus || a.status || ''
        bv = b.trackingStatus || b.status || ''
      } else {
        av = a[sortField] ?? ''
        bv = b[sortField] ?? ''
      }
      av = String(av).toLowerCase()
      bv = String(bv).toLowerCase()
      if (sortDir === 'asc') return av < bv ? -1 : av > bv ? 1 : 0
      return bv < av ? -1 : bv > av ? 1 : 0
    })
    return arr
  }, [filtered, sortField, sortDir, dispatchMap])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize]
  )

  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo, statusFilter, dispatchFilter, tab])

  useEffect(() => {
    setShowIniciarDespacho(true)
  }, [])

  function handleSort(field) {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function applyFilters() { setSearch(searchInput.trim()) }

  function clearFilters() {
    clearDespachoDates()
    setSearchInput('')
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter([])
    setDispatchFilter([])
    setTab('all')
    setShowIniciarDespacho(true)
  }

  function handleDateFromChange(val) {
    setDateFrom(val)
    if (val && dateTo) setDespachoDates(val, dateTo)
  }
  function handleDateToChange(val) {
    setDateTo(val)
    if (dateFrom && val) setDespachoDates(dateFrom, val)
  }

  function handleOrderFound(order) {
    setDispatchOrder(order)
    setShowDispatchQty(true)
  }
  function handleTruckClick(order) {
    setDispatchOrder(order)
    setShowDispatchQty(true)
  }

  const hasFilters = search || statusFilter.length > 0 || dispatchFilter.length > 0 || dateFrom || dateTo

  const isPartial = sheetsData?.data?.partial ?? false
  const sp = { sortField, sortDir, onSort: handleSort }

  const tabCounts = useMemo(() => {
    const counts = { all: allOrders.length, pendiente: 0, cargado: 0, entregado: 0, cancelado: 0 }
    for (const order of allOrders) {
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      const dispatch = dispatchMap.get(orderNo)
      const wmsStatus = order.trackingStatus || order.status || ''
      if (!dispatch || dispatch.order_estado === 'pendiente') counts.pendiente++
      if (dispatch?.order_estado === 'cargado')   counts.cargado++
      if (dispatch?.order_estado === 'entregado') counts.entregado++
      if (wmsStatus === 'cancelled' || dispatch?.order_estado === 'devolucion') counts.cancelado++
    }
    return counts
  }, [allOrders, dispatchMap])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await qc.invalidateQueries({ queryKey: ['despacho-outbound-list'] })
      await qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Órdenes de Despacho"
        subtitle="Órdenes de salida disponibles para embarque"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAgenda(true)}
              disabled={!filtered.length}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Agenda
            </button>
            {canManageCatalogs && (
              <>
                <button onClick={() => setShowConductores(true)} className="btn-ghost text-xs flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Conductores
                </button>
                <button onClick={() => setShowUnidades(true)} className="btn-ghost text-xs flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  Unidades
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-[100] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 pt-2.5 space-y-2">

          {/* Row 1 — date range + presets + actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
                <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                <input
                  type="date" value={dateFrom}
                  onChange={e => handleDateFromChange(e.target.value)}
                  className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0" />
                <span className="text-warm-300 text-xs">→</span>
                <input
                  type="date" value={dateTo}
                  onChange={e => handleDateToChange(e.target.value)}
                  className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0" />
              </div>
              {DATE_PRESETS.map(({ label, d }) => (
                <button key={label}
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10)
                    const from  = d === 0 ? today : new Date(Date.now() - d * 864e5).toISOString().slice(0, 10)
                    setDateFrom(from)
                    setDateTo(today)
                    setDespachoDates(from, today)
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
                >{label}</button>
              ))}
              {isPartial && (
                <span className="text-[11px] text-warning-600 font-medium ml-1">Cargando datos...</span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {canDispatch && (
                <button
                  onClick={() => setShowScan(true)}
                  disabled={!allOrders.length}
                  className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  Iniciar Despacho
                </button>
              )}
            </div>
          </div>

          {/* Row 2 — MultiSelects + search + apply */}
          <div className="flex items-center gap-2 flex-wrap">
            <MultiSelect
              options={STATUS_OPTIONS}
              selected={statusFilter}
              onChange={setStatusFilter}
              placeholder="Estado WMS"
            />
            <MultiSelect
              options={DISPATCH_OPTIONS}
              selected={dispatchFilter}
              onChange={setDispatchFilter}
              placeholder="Folio estado"
              icon={Truck}
            />
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[200px] flex-1 transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
              <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input
                type="text"
                placeholder="Buscar por orden o cliente..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyFilters() }}
                className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0"
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearch('') }} className="text-warm-400 hover:text-warm-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {hasFilters && (
              <button onClick={clearFilters}
                className="inline-flex items-center gap-1 h-10 px-3 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
            <button onClick={applyFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-100 px-4 text-xs font-semibold text-violet-700 hover:bg-violet-200 transition-colors">
              <Filter className="w-3 h-3" /> Aplicar
            </button>
          </div>

          {/* Row 3 — status tabs */}
          <div className="flex gap-0 border-b border-warm-100 -mx-5 px-5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
                  tab === t.id
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                }`}
              >
                {t.label}
                {tabCounts[t.id] > 0 && (
                  <span className={`text-[10px] font-bold ${tab === t.id ? 'text-primary-500' : 'text-warm-400'}`}>
                    {tabCounts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loadingSheets ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="w-10 h-10 text-danger-300" />
            <p className="text-sm font-medium text-warm-600">No se pudieron cargar las órdenes</p>
            <p className="text-xs text-warm-400">Verifica la configuración de WMS Hub o presiona Actualizar</p>
            <button onClick={handleRefresh} className="btn-secondary text-xs flex items-center gap-1.5 mt-1">
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="rounded-2xl border border-warm-100 overflow-hidden shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                  <tr>
                    <SortHeader label="Orden"          field="outboundOrderNo" {...sp} />
                    <SortHeader label="Cliente"        field="customerName"    {...sp} />
                    <SortHeader label="Estado WMS"     field="trackingStatus"  {...sp} />
                    <SortHeader label="Folio Despacho" field="folio"           {...sp} />
                    <SortHeader label="Fecha"          field="date"            {...sp} />
                    {canDispatch && <th className="table-header w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={canDispatch ? 6 : 5} className="py-14 text-center">
                        <PackageCheck className="w-8 h-8 text-warm-200 mx-auto mb-2" />
                        <p className="text-sm text-warm-400 font-medium">Sin órdenes en el rango seleccionado</p>
                        {allOrders.length === 0 && (
                          <p className="text-xs text-warm-300 mt-1">
                            Presiona <strong>Actualizar</strong> para cargar datos desde la hoja
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : paginated.map((order, i) => {
                    const orderNo  = order.outboundOrderNo || order.order_no || ''
                    const customer = order.customerName || order.cliente || '—'
                    const status   = order.trackingStatus || order.status || 'pending_assignment'
                    const dateVal  = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
                    const dispatch = dispatchMap.get(orderNo)
                    const dm       = dispatch ? DISPATCH_ESTADO_META[dispatch.order_estado] : null

                    return (
                      <motion.tr key={orderNo || i}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3) }}
                        className="hover:bg-warm-50/60 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-primary-700 text-xs">{orderNo || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-warm-700 font-medium">{customer}</span>
                        </td>
                        <td className="px-4 py-3">{statusBadge(status)}</td>
                        <td className="px-4 py-3">
                          {dispatch ? (
                            <div className="flex items-center gap-1.5">
                              <Truck className="w-3 h-3 text-warm-400" />
                              <span className="font-mono text-xs text-warm-600">{dispatch.folio_numero}</span>
                              {dm && <span className={`text-[10px] font-semibold ${dm.cls}`}>{dm.label}</span>}
                            </div>
                          ) : (
                            <span className="text-warm-300 text-xs">Sin folio</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {dateVal ? (
                            <div className="flex flex-col leading-tight">
                              <span className="text-xs text-warm-700">{fmtDate(dateVal)}</span>
                              <span className="text-[10px] text-warm-400">{fmtTimeShort(dateVal)}</span>
                            </div>
                          ) : <span className="text-warm-300 text-xs">—</span>}
                        </td>
                        {canDispatch && (
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleTruckClick(order)}
                              title="Despachar orden"
                              className="p-1.5 rounded-xl hover:bg-primary-50 text-warm-300 hover:text-primary-600 transition-all"
                            >
                              <Truck className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
              <TablePagination
                page={safePage}
                totalPages={totalPages}
                pageSize={pageSize}
                total={sorted.length}
                onPageChange={setPage}
                onPageSizeChange={p => { setPageSize(p); setPage(1) }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Existing catalog modals */}
      <ConductoresModal isOpen={showConductores} onClose={() => setShowConductores(false)} canManage={canManageCatalogs} />
      <UnidadesModal    isOpen={showUnidades}    onClose={() => setShowUnidades(false)}    canManage={canManageCatalogs} />

      {/* Date gate modal (non-dismissable) */}
      <IniciarDespachoModal
        isOpen={showIniciarDespacho}
        initialFrom={dateFrom || undefined}
        initialTo={dateTo || undefined}
        onConfirm={(from, to) => {
          setDateFrom(from)
          setDateTo(to)
          setShowIniciarDespacho(false)
        }}
      />

      {/* Barcode scan modal */}
      <ScanDispatchModal
        isOpen={showScan}
        onClose={() => setShowScan(false)}
        filteredOrders={filtered}
        onOrderFound={handleOrderFound}
      />

      {/* Dispatch quantity + folio selector modal */}
      <DispatchQuantityModal
        isOpen={showDispatchQty}
        onClose={() => { setShowDispatchQty(false); setDispatchOrder(null) }}
        order={dispatchOrder}
        conductores={conductores}
        unidades={unidades}
      />

      {/* Full-screen agenda overlay */}
      {showAgenda && (
        <div className="fixed inset-0 z-[150] bg-white flex flex-col">
          <AgendaView
            orders={filtered}
            dispatchMap={dispatchMap}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onClose={() => setShowAgenda(false)}
          />
        </div>
      )}
    </div>
  )
}
