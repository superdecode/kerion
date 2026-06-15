// frontend/src/modules/Despacho/pages/Ordenes.jsx
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search, X, Truck, PackageCheck, RefreshCw, Clock, Filter,
  Users, ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle,
  ScanLine, CalendarDays, Copy, Check, MapPin, Package,
  Loader2, CheckCircle2, Pencil,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import MultiSelect from '../../../core/components/common/MultiSelect'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDate, fmtTimeShort, toDateKey, fmtDateString } from '../../../core/utils/dateFormat'
import { getOutboundList, getOrdenesDispatch, getConductores, getUnidades, findAllOrdersByBarcode } from '../services/despachoService'
import { ConductoresModal, UnidadesModal } from '../components/CatalogsModals'
import IniciarDespachoModal  from '../components/IniciarDespachoModal'
import DispatchQuantityModal from '../components/DispatchQuantityModal'
import AgendaView            from '../components/AgendaView'
import ScanResolutionModal  from '../components/ScanResolutionModal'
import { getDespachoDates, setDespachoDates, clearDespachoDates } from '../utils/despachoSession'

const SCAN_IDLE      = 'idle'
const SCAN_LOADING   = 'loading'
const SCAN_FOUND     = 'found'
const SCAN_NOT_FOUND = 'not_found'
const SCAN_OUT_RANGE = 'out_of_range'

const SCAN_STATUS_META = {
  [SCAN_IDLE]:      { icon: null,         cls: '',                    text: '' },
  [SCAN_LOADING]:   { icon: Loader2,      cls: 'text-primary-500',   text: 'Buscando...' },
  [SCAN_FOUND]:     { icon: CheckCircle2, cls: 'text-success-600',   text: 'Orden encontrada' },
  [SCAN_NOT_FOUND]: { icon: AlertCircle,  cls: 'text-danger-500',    text: 'Orden no encontrada' },
  [SCAN_OUT_RANGE]: { icon: AlertCircle,  cls: 'text-warning-600',   text: 'Fuera del rango de fechas activo' },
}

const STATUS_META = {
  pending_assignment: { label: 'Por Asignar', cls: 'bg-warm-100 text-warm-600' },
  sorting:            { label: 'En Surtido',  cls: 'bg-primary-100 text-primary-700' },
  validating:         { label: 'Validando',   cls: 'bg-accent-100 text-accent-700' },
  complete:           { label: 'Completo',    cls: 'bg-success-100 text-success-700' },
  partial:            { label: 'Parcial',     cls: 'bg-warning-100 text-warning-700' },
  cancelled:          { label: 'Cancelado',   cls: 'bg-danger-100 text-danger-700' },
}

const DISPATCH_ESTADO_META = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-warm-100 text-warm-600' },
  cargado:    { label: 'Cargado',    cls: 'bg-primary-100 text-primary-700' },
  entregado:  { label: 'Entregado',  cls: 'bg-success-100 text-success-700' },
  devolucion: { label: 'Devolución', cls: 'bg-danger-100 text-danger-600' },
}

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

  const [copiedOrderNo, setCopiedOrderNo] = useState(null)
  const [scanInput, setScanInput]         = useState('')
  const [scanStatus, setScanStatus]       = useState(SCAN_IDLE)
  const scanInputRef  = useRef(null)
  const scanDebounce  = useRef(null)
  const [showIniciarDespacho, setShowIniciarDespacho] = useState(false)
  const [showAgenda, setShowAgenda]           = useState(false)
  const [dispatchOrder, setDispatchOrder]     = useState(null)
  const [showDispatchQty, setShowDispatchQty] = useState(false)
  const [scanResolutionData, setScanResolutionData] = useState(null)
  const [showScanResolution, setShowScanResolution] = useState(false)

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

  // All filters except tab — used for tab counters
  const filteredBase = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allOrders.filter(order => {
      const orderNo   = order.outboundOrderNo || order.order_no || ''
      const orderDate = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
      let dateKey = ''
      if (orderDate) {
        try {
          dateKey = /^\d{4}-\d{2}-\d{2}/.test(orderDate) ? orderDate.slice(0, 10) : toDateKey(orderDate)
        } catch { dateKey = '' }
      }
      if (dateFrom && dateKey && dateKey < dateFrom) return false
      if (dateTo   && dateKey && dateKey > dateTo)   return false
      if (statusFilter.length > 0) {
        const status = order.trackingStatus || order.status || 'pending_assignment'
        if (!statusFilter.includes(status)) return false
      }
      if (dispatchFilter.length > 0) {
        const dispatch   = dispatchMap.get(orderNo)
        const dispEstado = dispatch ? dispatch.order_estado : 'none'
        if (!dispatchFilter.includes(dispEstado)) return false
      }
      if (q) {
        const destino = (order.receiverName || order.customerName || order.cliente || '').toLowerCase()
        if (!orderNo.toLowerCase().includes(q) && !destino.includes(q)) return false
      }
      return true
    })
  }, [allOrders, search, dateFrom, dateTo, statusFilter, dispatchFilter, dispatchMap])

  const filtered = useMemo(() => {
    if (tab === 'all') return filteredBase
    return filteredBase.filter(order => {
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      const dispatch = dispatchMap.get(orderNo)
      const wmsStatus = order.trackingStatus || order.status || ''
      if (tab === 'pendiente') return !dispatch || dispatch.order_estado === 'pendiente'
      if (tab === 'cargado')   return dispatch?.order_estado === 'cargado'
      if (tab === 'entregado') return dispatch?.order_estado === 'entregado'
      if (tab === 'cancelado') return wmsStatus === 'cancelled' || dispatch?.order_estado === 'devolucion'
      return true
    })
  }, [filteredBase, tab, dispatchMap])

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
      } else if (sortField === 'receiverName') {
        av = a.receiverName || a.customerName || a.cliente || ''
        bv = b.receiverName || b.customerName || b.cliente || ''
      } else if (sortField === 'cantidad') {
        av = a.outboundBoxCount ?? 0
        bv = b.outboundBoxCount ?? 0
      } else if (sortField === 'dispatchEstado') {
        av = dispatchMap.get(noA)?.order_estado ?? ''
        bv = dispatchMap.get(noB)?.order_estado ?? ''
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
    const saved = getDespachoDates()
    if (!saved?.dateFrom || !saved?.dateTo) {
      setShowIniciarDespacho(true)
    }
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

  const runScan = useCallback(async (q) => {
    const raw = q.trim().toUpperCase()
    if (!raw) { setScanStatus(SCAN_IDLE); return }
    setScanStatus(SCAN_LOADING)

    // Fast path: exact order number already in filtered view
    const inFilter = filtered.find(o => (o.outboundOrderNo || o.order_no || '').toUpperCase() === raw)
    if (inFilter) {
      setScanStatus(SCAN_FOUND)
      setTimeout(() => { setScanInput(''); setScanStatus(SCAN_IDLE); handleOrderFound(inFilter) }, 300)
      return
    }

    try {
      const matches = await findAllOrdersByBarcode(raw)
      if (!matches || matches.length === 0) { setScanStatus(SCAN_NOT_FOUND); return }

      const ordersWithRange = matches.map(order => {
        const orderDate = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
        let dk = ''
        if (orderDate) {
          try { dk = /^\d{4}-\d{2}-\d{2}/.test(orderDate) ? orderDate.slice(0, 10) : toDateKey(orderDate) }
          catch { dk = '' }
        }
        const inRange = !!(dk && dateFrom && dateTo && dk >= dateFrom && dk <= dateTo)
        return { order, inRange }
      })

      const inRangeList = ordersWithRange.filter(e => e.inRange)

      // Single result that is in range — dispatch directly without modal
      if (ordersWithRange.length === 1 && inRangeList.length === 1) {
        setScanStatus(SCAN_FOUND)
        setTimeout(() => { setScanInput(''); setScanStatus(SCAN_IDLE); handleOrderFound(ordersWithRange[0].order) }, 300)
        return
      }

      // All other cases: out-of-range, multiple matches, mixed — open resolution modal
      setScanResolutionData({ orders: ordersWithRange, query: raw })
      setShowScanResolution(true)
      setScanInput('')
      setScanStatus(SCAN_IDLE)
    } catch {
      setScanStatus(SCAN_NOT_FOUND)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, dateFrom, dateTo])

  function handleScanChange(e) {
    const val = e.target.value
    setScanInput(val)
    setScanStatus(SCAN_IDLE)
    clearTimeout(scanDebounce.current)
    scanDebounce.current = setTimeout(() => runScan(val), 420)
  }

  function handleScanKeyDown(e) {
    if (e.key === 'Enter') {
      clearTimeout(scanDebounce.current)
      runScan(scanInput)
    }
    if (e.key === 'Escape') {
      setScanInput('')
      setScanStatus(SCAN_IDLE)
    }
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
    const counts = { all: filteredBase.length, pendiente: 0, cargado: 0, entregado: 0, cancelado: 0 }
    for (const order of filteredBase) {
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      const dispatch = dispatchMap.get(orderNo)
      const wmsStatus = order.trackingStatus || order.status || ''
      if (!dispatch || dispatch.order_estado === 'pendiente') counts.pendiente++
      if (dispatch?.order_estado === 'cargado')   counts.cargado++
      if (dispatch?.order_estado === 'entregado') counts.entregado++
      if (wmsStatus === 'cancelled' || dispatch?.order_estado === 'devolucion') counts.cancelado++
    }
    return counts
  }, [filteredBase, dispatchMap])

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
              {/* Date range pill — click to re-open dispatch modal */}
              <button
                onClick={() => setShowIniciarDespacho(true)}
                title="Cambiar rango de fechas de despacho"
                className="group flex items-center gap-2 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 hover:border-primary-300 hover:bg-primary-50/50 transition-all cursor-pointer"
              >
                <CalendarDays className="w-3.5 h-3.5 text-warm-400 group-hover:text-primary-500 shrink-0 transition-colors" />
                {dateFrom && dateTo ? (
                  <span className="text-xs text-warm-700 font-medium">
                    {fmtDateString(dateFrom)} → {fmtDateString(dateTo)}
                  </span>
                ) : (
                  <span className="text-xs text-warm-400 italic">Seleccionar fechas</span>
                )}
                <Pencil className="w-3 h-3 text-warm-300 group-hover:text-primary-400 transition-colors" />
              </button>
              {isPartial && (
                <span className="text-[11px] text-warning-600 font-medium ml-1">Cargando datos...</span>
              )}
            </div>

            {canDispatch && (
              <div className="flex flex-col gap-1 min-w-[300px]">
                <div className={`flex items-center gap-2 rounded-xl border-2 pl-3 pr-2.5 h-10 transition-all duration-200 ${
                  scanStatus === SCAN_FOUND
                    ? 'border-success-400 bg-success-50'
                    : scanStatus === SCAN_NOT_FOUND || scanStatus === SCAN_OUT_RANGE
                    ? 'border-danger-300 bg-danger-50/70'
                    : scanStatus === SCAN_LOADING
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-primary-200 bg-gradient-to-r from-primary-50/70 to-accent-50/50 focus-within:border-primary-400 focus-within:bg-white focus-within:shadow-sm'
                }`}>
                  <ScanLine className={`w-4 h-4 shrink-0 transition-colors ${
                    scanStatus === SCAN_FOUND     ? 'text-success-500' :
                    scanStatus === SCAN_NOT_FOUND || scanStatus === SCAN_OUT_RANGE ? 'text-danger-400' :
                    scanStatus === SCAN_LOADING   ? 'text-primary-400 animate-pulse' :
                    'text-primary-500'
                  }`} />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={scanInput}
                    onChange={handleScanChange}
                    onKeyDown={handleScanKeyDown}
                    placeholder="Escanear o escribir orden..."
                    disabled={!allOrders.length}
                    className="flex-1 min-w-0 bg-transparent font-mono text-xs text-warm-800 outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-warm-400 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {scanStatus === SCAN_LOADING   && <Loader2    className="w-3.5 h-3.5 text-primary-400 animate-spin shrink-0" />}
                  {scanStatus === SCAN_FOUND     && <CheckCircle2 className="w-3.5 h-3.5 text-success-500 shrink-0" />}
                  {(scanStatus === SCAN_NOT_FOUND || scanStatus === SCAN_OUT_RANGE) && <AlertCircle className="w-3.5 h-3.5 text-danger-400 shrink-0" />}
                  {scanInput && scanStatus === SCAN_IDLE && (
                    <button onClick={() => { setScanInput(''); setScanStatus(SCAN_IDLE) }} className="text-warm-400 hover:text-warm-600 shrink-0 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <span className="text-[10px] font-bold text-primary-500 uppercase tracking-wide shrink-0 border-l border-primary-200/80 pl-2.5 ml-0.5">
                    Despacho
                  </span>
                </div>
                {scanStatus !== SCAN_IDLE && (
                  <p className={`text-[10px] font-medium px-1 ${SCAN_STATUS_META[scanStatus].cls}`}>
                    {SCAN_STATUS_META[scanStatus].text}
                  </p>
                )}
              </div>
            )}
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
                    <SortHeader label="Fecha Entrega"  field="date"            {...sp} />
                    <SortHeader label="Destino"        field="receiverName"    {...sp} />
                    <SortHeader label="Estado WMS"     field="trackingStatus"  {...sp} />
                    <SortHeader label="Folio Despacho" field="folio"           {...sp} />
                    <SortHeader label="Estado Folio"   field="dispatchEstado"  {...sp} />
                    <SortHeader label="Cantidad"       field="cantidad"        {...sp} />
                    {canDispatch && <th className="table-header">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={canDispatch ? 8 : 7} className="py-14 text-center">
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
                    const destino  = order.receiverName || order.customerName || order.cliente || '—'
                    const status   = order.trackingStatus || order.status || 'pending_assignment'
                    const dateVal  = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
                    const cantidad = order.outboundBoxCount ?? null
                    const dispatch = dispatchMap.get(orderNo)
                    const dm       = dispatch ? DISPATCH_ESTADO_META[dispatch.order_estado] : null

                    return (
                      <motion.tr key={orderNo || i}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3) }}
                        className="hover:bg-warm-50/60 transition-colors"
                      >
                        {/* Orden — copy on hover */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 group/copy">
                            <span className="font-mono font-semibold text-primary-700 text-xs">{orderNo || '—'}</span>
                            {orderNo && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(orderNo)
                                  setCopiedOrderNo(orderNo)
                                  setTimeout(() => setCopiedOrderNo(n => n === orderNo ? null : n), 1500)
                                }}
                                className="opacity-0 group-hover/copy:opacity-100 p-0.5 rounded text-warm-300 hover:text-primary-600 transition-all"
                                title="Copiar"
                              >
                                {copiedOrderNo === orderNo
                                  ? <Check className="w-3 h-3 text-success-500" />
                                  : <Copy className="w-3 h-3" />
                                }
                              </button>
                            )}
                          </div>
                        </td>
                        {/* Fecha Entrega */}
                        <td className="px-4 py-3">
                          {dateVal ? (
                            <div className="flex flex-col leading-tight">
                              <span className="text-xs text-warm-700">{fmtDate(dateVal)}</span>
                              <span className="text-[10px] text-warm-400">{fmtTimeShort(dateVal)}</span>
                            </div>
                          ) : <span className="text-warm-300 text-xs">—</span>}
                        </td>
                        {/* Destino */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-warm-300 shrink-0" />
                            <span className="text-xs text-warm-700 font-medium">{destino}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{statusBadge(status)}</td>
                        {/* Folio número */}
                        <td className="px-4 py-3">
                          {dispatch ? (
                            <div className="flex items-center gap-1.5">
                              <Truck className="w-3 h-3 text-warm-400" />
                              <span className="font-mono text-xs text-warm-600">{dispatch.folio_numero}</span>
                            </div>
                          ) : (
                            <span className="text-warm-300 text-xs">—</span>
                          )}
                        </td>
                        {/* Estado Folio */}
                        <td className="px-4 py-3">
                          {dm
                            ? <span className={`badge text-[11px] font-semibold ${dm.cls}`}>{dm.label}</span>
                            : <span className="text-warm-200 text-xs">—</span>
                          }
                        </td>
                        {/* Cantidad */}
                        <td className="px-4 py-3">
                          {cantidad !== null ? (
                            <div className="flex items-center gap-1">
                              <Package className="w-3 h-3 text-warm-300 shrink-0" />
                              <span className="text-xs font-semibold text-warm-700">{cantidad}</span>
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

      {/* Dispatch quantity + folio selector modal */}
      <DispatchQuantityModal
        isOpen={showDispatchQty}
        onClose={() => { setShowDispatchQty(false); setDispatchOrder(null) }}
        order={dispatchOrder}
        conductores={conductores}
        unidades={unidades}
      />

      {/* Scan resolution modal — out-of-range and multi-match cases */}
      <ScanResolutionModal
        isOpen={showScanResolution}
        onClose={() => { setShowScanResolution(false); setScanResolutionData(null) }}
        onConfirm={(order) => {
          setShowScanResolution(false)
          setScanResolutionData(null)
          handleOrderFound(order)
        }}
        orders={scanResolutionData?.orders ?? []}
        query={scanResolutionData?.query ?? ''}
        dateFrom={dateFrom}
        dateTo={dateTo}
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
