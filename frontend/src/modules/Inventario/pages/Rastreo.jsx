import React, { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useFilterAutoCollapse } from '../../../core/hooks/useFilterAutoCollapse'
import {
  Plus, LayoutList, LayoutGrid, Users, Search,
  Eye, Trash2, X, Package, User, Crosshair, BookOpen,
  Calendar, ChevronDown, ChevronUp, RefreshCw, FileDown, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import MultiSelect from '../../../core/components/common/MultiSelect'
import TablePagination from '../../../core/components/common/TablePagination'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import CopyableCell from '../../../core/components/common/CopyableCell'
import Modal from '../../../core/components/common/Modal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import {
  getRastreoOrdenes, getRastreoUsuarios,
  deleteRastreoOrden, updateRastreoOrden,
  bulkUpdateEstado, bulkUpdateResponsable,
} from '../../../core/services/rastreoService'
import { getOutboundList } from '../../WmsHub/services/googleSheetsService'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import NuevaOrdenRastreoModal from '../components/NuevaOrdenRastreoModal'
import RastreoKanban from '../components/RastreoKanban'
import RastreoCards from '../components/RastreoCards'
import RastreoSearchModal from '../components/RastreoSearchModal'
import GestionCausasRastreoModal from '../components/GestionCausasRastreoModal'

const TH = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'

function parseStoredDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  let parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
    if (match) {
      const [, day, month, year, hour = '0', minute = '0', second = '0'] = match
      parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    }
  }
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const ESTADO_META = {
  borrador:   { cls: 'bg-warm-100 text-warm-500 border-warm-200',          dot: 'bg-warm-300',    labelKey: 'rastreo.estado.borrador' },
  abierta:    { cls: 'bg-primary-100 text-primary-700 border-primary-200', dot: 'bg-primary-400', labelKey: 'rastreo.estado.abierta' },
  en_proceso: { cls: 'bg-warning-100 text-warning-700 border-warning-200', dot: 'bg-warning-500', labelKey: 'rastreo.estado.en_proceso' },
  parcial:    { cls: 'bg-accent-100 text-accent-700 border-accent-200',    dot: 'bg-accent-500',  labelKey: 'rastreo.estado.parcial' },
  completada: { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500', labelKey: 'rastreo.estado.completada' },
  cancelada:  { cls: 'bg-warm-100 text-warm-500 border-warm-200',          dot: 'bg-warm-400',    labelKey: 'rastreo.estado.cancelada' },
}

const ESTADO_CAJA_META = {
  pendiente:      { cls: 'bg-warm-100 text-warm-500 border-warm-200',          dot: 'bg-warm-400',    labelKey: 'rastreo.caja.pendiente' },
  localizada:     { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500', labelKey: 'rastreo.caja.localizada' },
  no_encontrada:  { cls: 'bg-danger-100 text-danger-700 border-danger-200',    dot: 'bg-danger-500',  labelKey: 'rastreo.caja.no_encontrada' },
}

function EstadoChip({ estado, t }) {
  const m = ESTADO_META[estado] || ESTADO_META.abierta
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
      {t ? t(m.labelKey) : m.labelKey.split('.').pop()}
    </span>
  )
}

function SortableHeader({ label, sortKey, currentKey, currentDir, onSort }) {
  const active = currentKey === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-primary-700' : 'text-warm-500 hover:text-warm-700'}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider leading-none">{label}</span>
      {active ? (
        currentDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
      ) : (
        <ArrowUpDown size={11} className="opacity-60" />
      )}
    </button>
  )
}

function getEstadoOptionsForRow(estado) {
  switch (estado) {
    case 'borrador':
      return ['borrador', 'abierta', 'en_proceso', 'parcial', 'cancelada']
    case 'abierta':
      return ['abierta', 'en_proceso', 'parcial', 'completada', 'cancelada']
    case 'en_proceso':
      return ['en_proceso', 'parcial', 'completada', 'cancelada']
    case 'parcial':
      return ['parcial', 'en_proceso', 'completada', 'cancelada']
    case 'completada':
      return ['completada', 'parcial', 'cancelada']
    case 'cancelada':
      return ['cancelada', 'parcial', 'completada']
    default:
      return ['abierta', 'en_proceso', 'parcial', 'completada', 'cancelada']
  }
}


export default function Rastreo() {
  const { t } = useI18nStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  // View
  const [view, setView] = useState('tabla')

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filtersExpanded, setFiltersExpanded] = useFilterAutoCollapse()

  // Filters
  const [search, setSearch] = useState('')
  const [estadosFilter, setEstadosFilter] = useState([])
  const [responsableFilter, setResponsableFilter] = useState([])
  const [estadoCajaFilter, setEstadoCajaFilter] = useState([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Modals
  const [showModal, setShowModal] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showCausas, setShowCausas] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Bulk selection
  const [selected, setSelected] = useState(new Set())
  const [loadingAllIds, setLoadingAllIds] = useState(false)

  // Bulk action modals
  const [bulkEstadoValue, setBulkEstadoValue] = useState('')
  const [bulkEstadoOpen, setBulkEstadoOpen] = useState(false)
  const [bulkResponsableValue, setBulkResponsableValue] = useState('')
  const [bulkResponsableOpen, setBulkResponsableOpen] = useState(false)

  // Inline editing
  const [inlineEstadoId, setInlineEstadoId] = useState(null)
  const [inlineResponsableId, setInlineResponsableId] = useState(null)

  const canCreate = hasPermission('inventario.rastreo', 'crear')
  const canEdit   = hasPermission('inventario.rastreo', 'editar')
  const canDelete = hasPermission('inventario.rastreo', 'eliminar')

  const { data: usersData } = useQuery({
    queryKey: ['rastreo-usuarios'],
    queryFn: () => getRastreoUsuarios(),
    staleTime: 5 * 60 * 1000,
  })
  const usuarios = usersData?.data || []

  const queryParams = {
    page,
    limit: pageSize,
    search: search || undefined,
    estado: estadosFilter.length ? estadosFilter.join(',') : undefined,
    asignado_a: responsableFilter.length ? responsableFilter.join(',') : undefined,
    estado_caja: estadoCajaFilter.length ? estadoCajaFilter.join(',') : undefined,
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    sort: sortKey,
    dir: sortDir.toUpperCase(),
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['rastreo-ordenes', queryParams],
    queryFn: () => getRastreoOrdenes(queryParams),
    keepPreviousData: true,
  })

  const baseFilterParams = {
    search: search || undefined,
    estado: estadosFilter.length ? estadosFilter.join(',') : undefined,
    asignado_a: responsableFilter.length ? responsableFilter.join(',') : undefined,
    estado_caja: estadoCajaFilter.length ? estadoCajaFilter.join(',') : undefined,
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    sort: sortKey,
    dir: sortDir.toUpperCase(),
  }

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(nextKey)
      setSortDir('asc')
    }
    setPage(1)
  }

  const { data: allData } = useQuery({
    queryKey: ['rastreo-ordenes-all', baseFilterParams],
    queryFn: () => getRastreoOrdenes({ ...baseFilterParams, page: 1, limit: 1000 }),
    enabled: view !== 'tabla',
    keepPreviousData: true,
  })

  // Orders created before the outbound-snapshot fields existed (or via the "sin orden" flow)
  // have no stored fecha_entrega — fall back to the live WMS sheet by outbound_order_no,
  // same source used at creation time and the same fallback RastreoDetalle.jsx already applies.
  const { data: wmsOutboundData } = useQuery({
    queryKey: ['wms-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
  })
  const wmsOutboundByOrderNo = useMemo(() => {
    const records = wmsOutboundData?.data?.records ?? wmsOutboundData?.data ?? []
    const map = new Map()
    records.forEach(r => {
      const key = normalizeCodeFast(r.outboundOrderNo || '')
      if (key) map.set(key, r)
    })
    return map
  }, [wmsOutboundData])

  const ordenes = data?.data || []
  const total = data?.meta?.total || 0
  const totalPages = data?.meta?.totalPages || 1
  const allOrdenes = allData?.data || []

  const [deliverySortDir, setDeliverySortDir] = useState(null)
  const toggleDeliverySort = () => setDeliverySortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))

  const displayedOrdenes = useMemo(() => {
    if (!deliverySortDir) return ordenes
    const getTime = (o) => {
      const ts = parseStoredDate(o.outbound_delivery_at)?.getTime()
      return ts ?? null
    }
    return [...ordenes].sort((a, b) => {
      const ta = getTime(a)
      const tb = getTime(b)
      if (ta === null && tb === null) return 0
      if (ta === null) return 1
      if (tb === null) return -1
      return deliverySortDir === 'asc' ? ta - tb : tb - ta
    })
  }, [ordenes, deliverySortDir])

  // Reset page when filters change
  const setFilter = useCallback((setter) => (val) => { setter(val); setPage(1); setSelected(new Set()) }, [])

  function exportToExcel() {
    const rows = ordenes.filter(o => selected.size === 0 || selected.has(o.id))
    const header = ['Folio', 'Creado', 'Orden salida', 'Fecha entrega', 'Cliente', 'Cajas', 'Estado', 'Responsable']
    const csvRows = [header, ...rows.map(o => {
      const deliveryDate = parseStoredDate(o.outbound_delivery_at)
      return [
      o.folio,
      new Date(o.created_at).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      o.outbound_order_no || '',
      deliveryDate ? deliveryDate.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
      o.customer_code || '',
      o.total_cajas || 0,
      t(ESTADO_META[o.estado]?.labelKey || 'rastreo.col.estado'),
      o.asignado_nombre || '',
      ]
    })]
    const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rastreo_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function clearFilters() {
    setSearch('')
    setEstadosFilter([])
    setResponsableFilter([])
    setEstadoCajaFilter([])
    setFechaDesde('')
    setFechaHasta('')
    setPage(1)
    setSelected(new Set())
  }

  const hasActiveFilters = search || estadosFilter.length || responsableFilter.length ||
    estadoCajaFilter.length || fechaDesde || fechaHasta

  function handleCreated(folio) {
    qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
    if (folio) navigate(`/Inventario/rastreo/${folio}`)
  }

  // Checkbox selection
  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === ordenes.length && ordenes.every(o => selected.has(o.id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(ordenes.map(o => o.id)))
    }
  }

  async function selectAllInFilter() {
    setLoadingAllIds(true)
    try {
      const res = await getRastreoOrdenes({ ...baseFilterParams, page: 1, limit: 10000 })
      setSelected(new Set((res?.data || []).map(o => o.id)))
    } catch {
      toast.error(t('toast.error'))
    } finally {
      setLoadingAllIds(false)
    }
  }

  const allCurrentSelected = ordenes.length > 0 && ordenes.every(o => selected.has(o.id))
  const someSelected = selected.size > 0

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRastreoOrden(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
      toast.success(t('rastreo.ordenEliminada'))
      setDeleteTarget(null)
    },
    onError: () => toast.error(t('toast.error')),
  })

  const inlineEstadoMutation = useMutation({
    mutationFn: ({ id, estado }) => updateRastreoOrden(id, { estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
      toast.success(t('rastreo.toast.estadoActualizado'))
    },
    onError: () => toast.error(t('toast.error')),
  })

  const inlineResponsableMutation = useMutation({
    mutationFn: ({ id, asignado_a }) => updateRastreoOrden(id, { asignado_a }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
      toast.success(t('rastreo.toast.responsableActualizado'))
    },
    onError: () => toast.error(t('toast.error')),
  })

  const bulkEstadoMutation = useMutation({
    mutationFn: ({ ids, estado }) => bulkUpdateEstado(ids, estado),
    onSuccess: (_, { ids }) => {
      qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
      toast.success(`${ids.length} ${t('rastreo.toast.estadoActualizadoMultiple')}`)
      setSelected(new Set())
      setBulkEstadoOpen(false)
    },
    onError: () => toast.error(t('toast.error')),
  })

  const bulkResponsableMutation = useMutation({
    mutationFn: ({ ids, asignado_a }) => bulkUpdateResponsable(ids, asignado_a),
    onSuccess: (_, { ids }) => {
      qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
      toast.success(`${ids.length} ${t('rastreo.toast.responsableActualizadoMultiple')}`)
      setSelected(new Set())
      setBulkResponsableOpen(false)
    },
    onError: () => toast.error(t('toast.error')),
  })

  const VIEWS = [
    { key: 'tabla',       icon: LayoutList, labelKey: 'rastreo.view.tabla' },
    { key: 'responsable', icon: Users,       labelKey: 'rastreo.view.responsable' },
    { key: 'kanban',      icon: LayoutGrid,  labelKey: 'rastreo.view.kanban' },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('rastreo.titulo')}
        subtitle={!isLoading ? `${total} ${t('rastreo.subtitulo')}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <button
              data-tour="inv-btn-gestion-causas"
              onClick={() => setShowCausas(true)}
              className="hidden sm:inline-flex btn-ghost text-xs items-center gap-1.5"
            >
              <BookOpen size={14} />
              {t('rastreo.causas.btnGestion')}
            </button>
            <button
              onClick={() => setShowSearch(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-all text-xs font-semibold"
            >
              <Crosshair size={13} />
              {t('rastreo.rastrearCaja')}
            </button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="sticky top-[3.5rem] z-[9] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60">
        <button
          onClick={() => setFiltersExpanded(v => !v)}
          className="sm:hidden w-full flex items-center justify-between px-5 py-2 hover:bg-warm-50/80 transition-colors"
        >
          <span className="text-xs font-semibold text-warm-600">Filtros</span>
          {filtersExpanded ? <ChevronUp size={14} className="text-warm-400" /> : <ChevronDown size={14} className="text-warm-400" />}
        </button>
        <div className={`${filtersExpanded ? '' : 'hidden sm:block'} px-5 py-2 space-y-2`}>
        {/* Row 1: date range (no quick shortcuts) */}
        <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5 w-fit">
          <Calendar className="w-3.5 h-3.5 text-warm-400 shrink-0" />
          <input
            type="date"
            className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
          />
          <span className="text-warm-300 text-xs">→</span>
          <input
            type="date"
            className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
          />
          {(fechaDesde || fechaHasta) && (
            <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setPage(1) }}>
              <X size={11} className="text-warm-400 hover:text-warm-600" />
            </button>
          )}
        </div>

        {/* Row 2: dropdown filters — 2-column grid on mobile so it compacts
            into clean rows instead of overflowing; Nueva Orden sits in the
            grid right next to the filters. Reverts to a plain flex row on sm+. */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 max-sm:[&_button]:min-w-0">
          <MultiSelect
            placeholder={t('rastreo.filter.orderStatus')}
            options={Object.entries(ESTADO_META).map(([k, m]) => ({ value: k, label: t(m.labelKey) }))}
            selected={estadosFilter}
            onChange={setFilter(setEstadosFilter)}
            className="w-full sm:w-auto sm:min-w-[160px]"
          />

          <MultiSelect
            placeholder={t('rastreo.filter.responsable')}
            icon={User}
            options={usuarios.map(u => ({ value: String(u.id), label: u.nombre_completo }))}
            selected={responsableFilter}
            onChange={setFilter(setResponsableFilter)}
            className="w-full sm:w-auto sm:min-w-[160px]"
          />

          <MultiSelect
            placeholder={t('rastreo.filter.boxStatus')}
            icon={Package}
            options={Object.entries(ESTADO_CAJA_META).map(([k, m]) => ({ value: k, label: t(m.labelKey) }))}
            selected={estadoCajaFilter}
            onChange={setFilter(setEstadoCajaFilter)}
            className="w-full sm:w-auto sm:min-w-[160px]"
          />

          {canCreate && (
            <button
              onClick={() => setShowModal(true)}
              className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-primary-600 text-white inline-flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold hover:bg-primary-700 transition-all shadow-sm hover:shadow-md active:scale-[0.98] w-full sm:w-auto sm:ml-1"
            >
              <Plus size={14} />
              <span className="truncate">{t('rastreo.nuevaOrden')}</span>
            </button>
          )}
        </div>

        {/* Row 3: search + clear + view toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-[11px] sm:px-3 h-9 sm:h-10 flex-1 min-w-[220px] sm:min-w-[260px] max-w-[300px] sm:max-w-sm transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
            <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-warm-400 shrink-0" />
            <input
              className="flex-1 min-w-0 text-[13px] sm:text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder={t('rastreo.searchPlaceholder')}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1) }}>
                <X size={11} className="text-warm-400 hover:text-warm-600 sm:w-3 sm:h-3" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
              <X className="w-3 h-3" />
              {t('common.clear')}
            </button>
          )}

          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-warm-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
            </span>
          )}

          <div className="flex items-center rounded-lg sm:rounded-xl border border-warm-200 overflow-hidden ml-auto shrink-0">
            {VIEWS.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                title={t(v.labelKey)}
                className={`flex items-center gap-1 px-2.5 sm:px-3 h-9 sm:h-10 text-[11px] sm:text-xs font-medium transition-colors
                  ${view === v.key ? 'bg-primary-500 text-white' : 'text-warm-500 hover:bg-warm-50'}`}
              >
                <v.icon size={12} className="sm:w-[13px] sm:h-[13px]" />
                <span className="hidden md:inline">{t(v.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : view === 'tabla' ? (
          <div className="px-5 pt-3 pb-6">
            {/* Bulk actions bar */}
            {someSelected && (
              <div className="flex items-center gap-2 px-4 py-2 mb-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700 flex-wrap">
                <span className="font-semibold">
                  {selected.size} {t('rastreo.selected')}
                </span>
                <button
                  onClick={selectAllInFilter}
                  disabled={loadingAllIds}
                  className="text-primary-600 hover:text-primary-800 underline font-semibold transition-colors disabled:opacity-50"
                >
                  {loadingAllIds ? t('common.loading') : `${t('rastreo.selectAll')} (${total})`}
                </button>
                <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                  {/* Bulk estado */}
                  <div className="relative">
                    <button
                      onClick={() => setBulkEstadoOpen(v => !v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-warm-200 text-warm-700 font-semibold hover:bg-warm-50 transition-colors"
                    >
                      {t('rastreo.cambiarEstado')}
                      <ChevronDown size={11} />
                    </button>
                    {bulkEstadoOpen && (
                      <div className="absolute z-20 top-full right-0 mt-0.5 bg-white rounded-xl border border-warm-200 shadow-lg overflow-hidden min-w-[150px]">
                        {Object.entries(ESTADO_META).filter(([key]) => key !== 'abierta').map(([key, m]) => (
                          <button
                            key={key}
                            onClick={() => bulkEstadoMutation.mutate({ ids: [...selected], estado: key })}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-warm-50 transition-colors"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                            {t(m.labelKey)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bulk responsable */}
                  <div className="relative">
                    <button
                      onClick={() => setBulkResponsableOpen(v => !v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-warm-200 text-warm-700 font-semibold hover:bg-warm-50 transition-colors"
                    >
                      {t('rastreo.asignarResponsable')}
                      <ChevronDown size={11} />
                    </button>
                    {bulkResponsableOpen && (
                      <div className="absolute z-20 top-full right-0 mt-0.5 bg-white rounded-xl border border-warm-200 shadow-lg overflow-hidden min-w-[180px] max-h-[240px] overflow-y-auto">
                        <button
                          onClick={() => bulkResponsableMutation.mutate({ ids: [...selected], asignado_a: null })}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-warm-50 transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-warm-300" />
                          {t('rastreo.sinResponsable')}
                        </button>
                        {usuarios.map(u => (
                          <button
                            key={u.id}
                            onClick={() => bulkResponsableMutation.mutate({ ids: [...selected], asignado_a: u.id })}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-warm-50 transition-colors"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                            {u.nombre_completo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={exportToExcel}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success-600 text-white font-semibold hover:bg-success-700 transition-colors"
                    title={t('rastreo.exportar')}
                  >
                    <FileDown size={13} />
                    {t('rastreo.exportar')}
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="ml-auto text-primary-500 hover:text-primary-700 transition-colors"
                    title={t('rastreo.deselect')}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="card overflow-hidden shadow-sm table-shell">
              <div className="overflow-x-auto table-scroll">
              <table className="min-w-[700px] w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-warm-50 border-b border-warm-100">
                    <th className="table-header w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allCurrentSelected}
                        onChange={toggleAll}
                        className="cb"
                      />
                    </th>
                    <th className={TH}><SortableHeader label={t('rastreo.col.folio')} sortKey="folio" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} /></th>
                    <th className={TH}><SortableHeader label={t('rastreo.col.creado')} sortKey="created_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} /></th>
                    <th className={TH}><SortableHeader label={t('rastreo.col.ordenSalida')} sortKey="outbound_order_no" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} /></th>
                    <th className={`${TH} w-[112px]`}>
                      <button
                        type="button"
                        onClick={toggleDeliverySort}
                        className={`inline-flex items-center gap-1 transition-colors ${deliverySortDir ? 'text-primary-700' : 'text-warm-500 hover:text-warm-700'}`}
                      >
                        <span className="text-xs font-semibold uppercase tracking-wider leading-none">{t('rastreo.col.fechaEntrega')}</span>
                        {deliverySortDir ? (
                          deliverySortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-60" />
                        )}
                      </button>
                    </th>
                    <th className={TH}><SortableHeader label={t('rastreo.col.cliente')} sortKey="customer_code" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} /></th>
                    <th className={TH}><SortableHeader label={t('rastreo.col.cajas')} sortKey="total_cajas" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} /></th>
                    <th className={TH}><SortableHeader label={t('rastreo.col.estado')} sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} /></th>
                    <th className={TH}><SortableHeader label={t('rastreo.col.responsable')} sortKey="asignado_nombre" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} /></th>
                    <th className={TH}><span className={TH_TEXT}>{t('rastreo.col.acciones')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {ordenes.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-14 text-center text-xs text-warm-400">
                        <Crosshair size={24} className="mx-auto mb-2 text-warm-200" />
                        {t('rastreo.noOrdenes')}
                        {hasActiveFilters && (
                          <span className="block mt-1">{t('rastreo.tryRemoveFilters')}</span>
                        )}
                      </td>
                    </tr>
                  ) : displayedOrdenes.map(o => (
                    <tr
                      key={o.id}
                      className={`table-row group cursor-pointer ${selected.has(o.id) ? 'bg-primary-50/40' : ''}`}
                      onClick={() => navigate(`/Inventario/rastreo/${o.folio}`)}
                    >
                      {/* Checkbox */}
                      <td className="table-cell text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggleRow(o.id)}
                          className="cb"
                        />
                      </td>

                      {/* Folio */}
                      <td className="table-cell">
                        <CopyableCell text={o.folio} className="font-mono font-semibold text-xs text-primary-700" />
                      </td>

                      {/* Creado */}
                      <td className="table-cell">
                        <div className="leading-tight">
                          <p className="text-xs text-warm-600">{new Date(o.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                          <p className="text-[11px] text-warm-400">{new Date(o.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </td>

                      {/* Orden salida */}
                      <td className="table-cell">
                        {o.outbound_order_no
                          ? <CopyableCell text={o.outbound_order_no} className="font-mono text-xs text-warm-600" />
                          : <span className="text-xs text-warm-300">—</span>}
                      </td>

                      {/* Fecha entrega de la orden de salida */}
                      <td className="table-cell w-[112px]">
                        {(() => {
                          const wmsMatch = o.outbound_order_no
                            ? wmsOutboundByOrderNo.get(normalizeCodeFast(o.outbound_order_no))
                            : null
                          const deliveryDate = parseStoredDate(
                            o.outbound_delivery_at || wmsMatch?.outboundTime || wmsMatch?.expectedTime
                          )
                          if (!deliveryDate) return <span className="text-xs text-warm-300">—</span>
                          return (
                            <div className="leading-tight">
                              <p className="text-[11px] text-warm-600">{deliveryDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                              <p className="text-[10px] text-warm-400">{deliveryDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          )
                        })()}
                      </td>

                      {/* Cliente */}
                      <td className="table-cell">
                        <span className="text-xs text-warm-700 font-medium">{o.customer_code || '—'}</span>
                      </td>

                      {/* Cajas */}
                      <td className="table-cell">
                        <div className="flex items-center gap-1 text-xs text-warm-600">
                          <Package size={11} />
                          <span>{o.total_cajas || 0}</span>
                          {o.cajas_localizadas > 0 && (
                            <span className="text-success-600 font-medium">+{o.cajas_localizadas}</span>
                          )}
                          {o.cajas_no_encontradas > 0 && (
                            <span className="text-danger-500 font-medium">-{o.cajas_no_encontradas}</span>
                          )}
                        </div>
                      </td>

                      {/* Estado — native select */}
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        {canEdit ? (
                          inlineEstadoId === o.id ? (
                            <select
                              autoFocus
                              className="text-xs rounded-lg border border-primary-300 bg-white px-2 py-1 cursor-pointer focus:outline-none"
                              value={o.estado}
                              onChange={e => { inlineEstadoMutation.mutate({ id: o.id, estado: e.target.value }); setInlineEstadoId(null) }}
                              onBlur={() => setInlineEstadoId(null)}
                            >
                              {getEstadoOptionsForRow(o.estado).map((k) => <option key={k} value={k}>{t(ESTADO_META[k].labelKey)}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => setInlineEstadoId(o.id)} className="hover:opacity-75 transition-opacity">
                              <EstadoChip estado={o.estado} t={t} />
                            </button>
                          )
                        ) : (
                          <EstadoChip estado={o.estado} t={t} />
                        )}
                      </td>

                      {/* Responsable — native select */}
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        {canEdit ? (
                          inlineResponsableId === o.id ? (
                            <select
                              autoFocus
                              className="text-xs rounded-lg border border-primary-300 bg-white px-2 py-1 cursor-pointer focus:outline-none max-w-[160px]"
                              value={o.asignado_a || ''}
                              onChange={e => { inlineResponsableMutation.mutate({ id: o.id, asignado_a: e.target.value || null }); setInlineResponsableId(null) }}
                              onBlur={() => setInlineResponsableId(null)}
                            >
                              <option value="">{t('rastreo.sinResponsable')}</option>
                              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => setInlineResponsableId(o.id)} className="flex items-center gap-1 text-xs text-warm-600 hover:text-warm-800 transition-colors">
                              {o.asignado_nombre ? <><User size={11} />{o.asignado_nombre}</> : <span className="text-warm-300">{t('rastreo.sinResponsable')}</span>}
                            </button>
                          )
                        ) : (
                          o.asignado_nombre
                            ? <span className="flex items-center gap-1.5 text-xs text-warm-600"><User size={11} />{o.asignado_nombre}</span>
                            : <span className="text-xs text-warm-300">—</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/Inventario/rastreo/${o.folio}`)}
                            className="p-1.5 rounded-lg hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-colors"
                            title={t('rastreo.action.ver')}
                          >
                            <Eye size={14} />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(o)}
                              className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-400 hover:text-danger-600 transition-colors"
                              title={t('rastreo.action.eliminar')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="mt-3">
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={total}
                  onPageChange={setPage}
                  onPageSizeChange={size => { setPageSize(size); setPage(1) }}
                  itemLabel={t('rastreo.items.ordenes')}
                />
              </div>
            )}
          </div>
        ) : view === 'responsable' ? (
          <div className="px-5 pt-4 pb-6">
            <RastreoKanban
              ordenes={allOrdenes}
              usuarios={usuarios}
              onReassigned={() => qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })}
            />
          </div>
        ) : (
          <div className="px-5 pt-4 pb-6">
            <RastreoCards ordenes={allOrdenes} />
          </div>
        )}
      </div>

      {/* Modals */}
      <NuevaOrdenRastreoModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        usuarios={usuarios}
        onCreated={handleCreated}
      />

      <RastreoSearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
      />

      <GestionCausasRastreoModal
        isOpen={showCausas}
        onClose={() => setShowCausas(false)}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('rastreo.eliminarOrden')}
        icon={Trash2}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary text-sm">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="btn-danger text-sm !bg-danger-600 !text-white hover:!bg-danger-700 inline-flex items-center gap-1.5"
            >
              {deleteMutation.isPending && <RefreshCw size={12} className="animate-spin" />}
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          ¿{t('rastreo.eliminarOrden')}{' '}
          <span className="font-mono font-semibold text-primary-700">{deleteTarget?.folio}</span>?{' '}
          {t('rastreo.confirmDelete')}
        </p>
      </Modal>
    </div>
  )
}
