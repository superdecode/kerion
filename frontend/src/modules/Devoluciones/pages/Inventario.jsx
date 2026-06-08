import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Copy, Check, ArrowLeftRight, ClipboardList, Boxes, Search, X,
  LayoutGrid, Clock, Download, Calendar, Upload, Settings2,
} from 'lucide-react'
import { getToday, subtractDays } from '../../../core/utils/dateFormat'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import AjusteModal from '../components/AjusteModal'
import InventarioUbicacionesModal from '../components/InventarioUbicacionesModal'
import ImportarInventarioModal from '../components/ImportarInventarioModal'
import ImportarUbicacionesModal from '../components/ImportarUbicacionesModal'
import {
  listInventario, listMovimientos, listUbicaciones, createAjuste,
} from '../services/devolucionesService'
import { fmtDateTime } from '../../../core/utils/dateFormat'

const TIPO_COLORS = {
  entrada:  'bg-success-100 text-success-700',
  salida:   'bg-danger-100 text-danger-600',
  ajuste:   'bg-warning-100 text-warning-700',
  traslado: 'bg-accent-100 text-accent-700',
}
const TIPO_LABELS = {
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', traslado: 'Traslado',
}

const TIPO_OPTS = Object.entries(TIPO_LABELS).map(([value, label]) => ({ value, label }))

const TABS = [
  { id: 'actual',    label: 'Stock actual',             icon: Boxes },
  { id: 'historial', label: 'Historial de movimientos', icon: Clock },
]

const OPTIONAL_COLS = [
  { id: 'referencia', label: 'Referencia',        field: 'ultima_referencia' },
  { id: 'usuario',    label: 'Últ. usuario',       field: 'ultimo_usuario_nombre' },
]

const getMovimientoUbicacion = (row) => {
  if (row?.ubicacion_codigo) return row.ubicacion_codigo
  if (row?.tipo === 'salida') return row?.ubicacion_anterior_codigo || row?.ubicacion_nueva_codigo || ''
  if (row?.tipo === 'entrada') return row?.ubicacion_nueva_codigo || row?.ubicacion_anterior_codigo || ''
  return row?.ubicacion_nueva_codigo || row?.ubicacion_anterior_codigo || ''
}

const getMovimientoTipoLabel = (row) => {
  if (row?.referencia_tipo === 'importacion') return 'Importación'
  return TIPO_LABELS[row?.tipo] || row?.tipo || '—'
}

const getMovimientoReferenciaHref = (row) => {
  if (row?.referencia_tipo === 'sesion' && row?.referencia_id) return `/Devoluciones/entradas/${row.referencia_id}`
  if (row?.referencia_tipo === 'salida' && row?.referencia_id) return `/Devoluciones/salidas/${row.referencia_id}`
  return null
}

/* ─── Ubicacion combobox para filtro ─── */
function UbicacionFilter({ ubicaciones, value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const { t } = useI18nStore()

  const selected = useMemo(
    () => ubicaciones.find(u => String(u.id) === String(value)),
    [ubicaciones, value]
  )

  const filtered = useMemo(() => {
    const qn = q.toLowerCase()
    if (!qn && !open) return []
    if (!qn) return ubicaciones.slice(0, 20)
    return ubicaciones.filter(u =>
      u.codigo?.toLowerCase().includes(qn) ||
      u.nombre?.toLowerCase().includes(qn)
    ).slice(0, 20)
  }, [ubicaciones, q, open])

  const select = (u) => {
    onChange(String(u.id))
    setQ('')
    setOpen(false)
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange('')
    setQ('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[200px] transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
        <LayoutGrid className="w-3.5 h-3.5 text-warm-400 shrink-0" />
        <input
          type="text"
          value={selected ? selected.codigo : q}
          onChange={e => { setQ(e.target.value); onChange(''); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t('dev.inventario.filter_ubicacion')}
          className="text-xs outline-none bg-transparent text-warm-700 flex-1 min-w-0 w-32 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {(value || q) && (
          <button onMouseDown={clear} className="text-warm-400 hover:text-warm-600 shrink-0">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-30 left-0 top-full mt-1 min-w-[240px] w-full bg-white rounded-xl border border-warm-200 shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(u => (
            <button
              key={u.id}
              type="button"
              onMouseDown={() => select(u)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 border-b border-warm-50 last:border-0 flex items-center gap-2"
            >
              <span className="font-mono text-warm-700 flex-1 truncate">{u.codigo}</span>
              {Number(u.pcs_stock) > 0 && (
                <span className="text-[10px] text-warm-400 shrink-0">{u.pcs_stock} pcs</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Inventario() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()
  const { t } = useI18nStore()

  const [tab, setTab] = useState('actual')
  const [qInput, setQInput] = useState('')
  const [qFilter, setQFilter] = useState('')
  const [ubicacionFilterId, setUbicacionFilterId] = useState('')
  const [tiposHistorial, setTiposHistorial] = useState([])
  const [copied, setCopied] = useState(null)
  const [showUbicaciones, setShowUbicaciones] = useState(false)
  const [showAjuste, setShowAjuste] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showImportUbicaciones, setShowImportUbicaciones] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(null)
  const [ajusteTipo, setAjusteTipo] = useState('ajuste')
  const [ajusteFeedback, setAjusteFeedback] = useState(null)
  const [showColConfig, setShowColConfig] = useState(false)
  const [visibleCols, setVisibleCols] = useState([])
  const [stockPage, setStockPage] = useState(1)
  const [stockPageSize, setStockPageSize] = useState(50)
  const [historialPage, setHistorialPage] = useState(1)
  const [historialPageSize, setHistorialPageSize] = useState(50)
  const colConfigRef = useRef(null)

  useEffect(() => {
    if (!showColConfig) return
    const handler = (e) => {
      if (colConfigRef.current && !colConfigRef.current.contains(e.target)) setShowColConfig(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColConfig])
  const debounceRef = useRef(null)

  const defaultEnd = getToday()
  const defaultStart = subtractDays(defaultEnd, 30)
  const [historialFechaDesde, setHistorialFechaDesde] = useState(defaultStart)
  const [historialFechaHasta, setHistorialFechaHasta] = useState(defaultEnd)
  const [historialQ, setHistorialQ] = useState('')

  const inventarioQuery = useQuery({
    queryKey: ['dev-inventario', qFilter],
    queryFn: () => listInventario({ q: qFilter }),
  })
  const historialQuery = useQuery({
    queryKey: ['dev-movimientos', tiposHistorial, historialFechaDesde, historialFechaHasta],
    queryFn: () => listMovimientos({
      ...(tiposHistorial.length ? { tipo: tiposHistorial.join(',') } : {}),
      fecha_inicio: historialFechaDesde,
      fecha_fin: historialFechaHasta,
    }),
  })
  const ubicacionesQuery = useQuery({ queryKey: ['dev-ubicaciones'], queryFn: listUbicaciones })

  const ajusteMutation = useMutation({
    mutationFn: createAjuste,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['dev-inventario'] })
      qc.invalidateQueries({ queryKey: ['dev-movimientos'] })
      setAjusteFeedback(result)
      if ((result?.summary?.fallidos || 0) > 0) {
        toast.warning?.(`Resultado parcial: ${result.summary?.creados || 0} creados, ${result.summary?.actualizados || 0} actualizados, ${result.summary?.fallidos || 0} fallidos`)
        return
      }
      toast.success(t('dev.ajuste.toast.ok'))
      setShowAjuste(false)
    },
    onError: (e) => {
      console.error('Error guardando ajuste:', e.response?.data || e)
      toast.error(e.response?.data?.error || t('dev.ajuste.toast.err'))
    },
  })

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text); setTimeout(() => setCopied(null), 2000)
    })
  }

  const handleQChange = (val) => {
    setQInput(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setQFilter(''); return }
    debounceRef.current = setTimeout(() => setQFilter(val.trim()), 300)
  }

  const doExportInventario = () => {
    const inv = inventarioFiltrado
    if (!inv.length) return
    const headers = ['Código', 'SKU', 'SKU2', 'Descripción', 'Embalaje', 'Ubicación', 'Disponible']
    const rows = inv.map(r => [
      r.codigo_trazabilidad, r.sku, r.sku2 || '', r.descripcion || '',
      r.embalaje1 || '', r.ubicacion_codigo || r.ubicacion_nombre || '', r.cantidad_disponible,
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'inventario_devoluciones.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const exportInventario = () => {
    if (!inventarioFiltrado.length) return
    setExportConfirm({ count: inventarioFiltrado.length, label: 'artículos en stock', onConfirm: doExportInventario })
  }

  const doExportHistorial = () => {
    const movs = movimientos
    if (!movs.length) return
    const headers = ['Fecha', 'Tipo', 'Referencia', 'Código', 'SKU', 'Cant. Anterior', 'Cant. Nueva', 'Cambio', 'Ubicación', 'Observación', 'Usuario']
    const rows = movs.map(r => {
      const delta = (r.cantidad_anterior != null && r.cantidad_nueva != null)
        ? r.cantidad_nueva - r.cantidad_anterior : ''
      const ubicacion = getMovimientoUbicacion(r)
      return [
        fmtDateTime(r.created_at), getMovimientoTipoLabel(r), r.documento || '', r.codigo_trazabilidad || '', r.sku || '',
        r.cantidad_anterior ?? '', r.cantidad_nueva ?? '',
        delta !== '' ? (delta >= 0 ? `+${delta}` : delta) : '',
        ubicacion || '', r.observacion || '', r.usuario_nombre || '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'historial_movimientos.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const exportHistorial = () => {
    if (!movimientos.length) return
    setExportConfirm({ count: movimientos.length, label: 'movimientos en historial', onConfirm: doExportHistorial })
  }

  const inventario = inventarioQuery.data?.data || inventarioQuery.data?.inventario || []
  const allMovimientos = historialQuery.data?.data || historialQuery.data?.movimientos || []
  const ubicaciones = ubicacionesQuery.data?.data || ubicacionesQuery.data?.ubicaciones || []

  const inventarioFiltrado = useMemo(() => {
    if (!ubicacionFilterId) return inventario
    return inventario.filter(r => String(r.ubicacion_id) === ubicacionFilterId)
  }, [inventario, ubicacionFilterId])

  const movimientos = useMemo(() => {
    if (!historialQ.trim()) return allMovimientos
    const q = historialQ.toLowerCase()
    return allMovimientos.filter(m =>
      m.codigo_trazabilidad?.toLowerCase().includes(q) ||
      m.sku?.toLowerCase().includes(q) ||
      m.sku2?.toLowerCase().includes(q) ||
      m.ubicacion_codigo?.toLowerCase().includes(q) ||
      m.ubicacion_anterior_codigo?.toLowerCase().includes(q) ||
      m.ubicacion_nueva_codigo?.toLowerCase().includes(q) ||
      m.observacion?.toLowerCase().includes(q) ||
      m.usuario_nombre?.toLowerCase().includes(q)
    )
  }, [allMovimientos, historialQ])

  const stockTotalPages = Math.max(1, Math.ceil(inventarioFiltrado.length / stockPageSize))
  const safeStockPage = Math.min(stockPage, stockTotalPages)
  const paginatedInventario = useMemo(
    () => inventarioFiltrado.slice((safeStockPage - 1) * stockPageSize, safeStockPage * stockPageSize),
    [inventarioFiltrado, safeStockPage, stockPageSize]
  )
  const historialTotalPages = Math.max(1, Math.ceil(movimientos.length / historialPageSize))
  const safeHistorialPage = Math.min(historialPage, historialTotalPages)
  const paginatedMovimientos = useMemo(
    () => movimientos.slice((safeHistorialPage - 1) * historialPageSize, safeHistorialPage * historialPageSize),
    [movimientos, safeHistorialPage, historialPageSize]
  )

  const canManage = hasPermission('devoluciones.inventario', 'actualizar')

  useEffect(() => {
    setStockPage(1)
  }, [qFilter, ubicacionFilterId, stockPageSize])

  useEffect(() => {
    setHistorialPage(1)
  }, [tiposHistorial, historialFechaDesde, historialFechaHasta, historialQ, historialPageSize])

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('dev.inventario.title')}
        subtitle={t('dev.inventario.subtitle')}
        actions={
          canManage ? (
            <button
              onClick={() => setShowUbicaciones(true)}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Gestionar ubicaciones
            </button>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto">

        {/* Sticky section: tabs + filter bar */}
        <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur-2xl border-b border-warm-100/60">

          {/* Tab row */}
          <div className="flex gap-0 border-b border-warm-100 px-5">
            {TABS.map(tabItem => (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                  tab === tabItem.id
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-warm-400 hover:text-warm-600'
                }`}
              >
                <tabItem.icon className="w-3.5 h-3.5" />
                {t(`dev.inventario.tab.${tabItem.id}`)}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-5 py-2.5 space-y-2">
            {tab === 'actual' && (
              <div className="flex items-center gap-2 flex-wrap justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[220px] transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
                    <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <input
                      type="text"
                      value={qInput}
                      onChange={e => handleQChange(e.target.value)}
                      placeholder={t('dev.inventario.search_sku')}
                      className="text-xs outline-none bg-transparent text-warm-700 flex-1 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    {qInput && (
                      <button onClick={() => handleQChange('')} className="text-warm-400 hover:text-warm-600">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <UbicacionFilter
                    ubicaciones={ubicaciones}
                    value={ubicacionFilterId}
                    onChange={setUbicacionFilterId}
                  />

                  {ubicacionFilterId && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary-100 text-primary-700 text-[11px] font-semibold">
                      <LayoutGrid className="w-3 h-3" />
                      {ubicaciones.find(u => String(u.id) === ubicacionFilterId)?.codigo || ''}
                      <button onClick={() => setUbicacionFilterId('')} className="ml-0.5 hover:text-primary-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={exportInventario}
                    title="Exportar CSV"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> {t('dev.inventario.exportar')}
                  </button>

                  {canManage && (
                    <button
                      onClick={() => setShowImport(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" /> {t('dev.inventario.importar')}
                    </button>
                  )}

                  {canManage && (
                    <button
                      onClick={() => { setAjusteFeedback(null); setAjusteTipo('movimiento'); setShowAjuste(true) }}
                      className="btn-ghost inline-flex items-center gap-1.5 border border-violet-400 text-violet-600 hover:bg-violet-50 hover:border-violet-500"
                    >
                      <ArrowLeftRight className="w-4 h-4" /> {t('dev.inventario.mover')}
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => { setAjusteFeedback(null); setAjusteTipo('ajuste'); setShowAjuste(true) }}
                      className="btn-primary inline-flex items-center gap-1.5"
                    >
                      <ClipboardList className="w-4 h-4" /> {t('dev.inventario.inv_fisico')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === 'historial' && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
                    <Calendar className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <input type="date" value={historialFechaDesde}
                      onChange={e => setHistorialFechaDesde(e.target.value)}
                      className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
                    <span className="text-warm-300 text-xs">→</span>
                    <input type="date" value={historialFechaHasta}
                      onChange={e => setHistorialFechaHasta(e.target.value)}
                      className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
                  </div>

                  <button
                    onClick={() => { const today = getToday(); setHistorialFechaDesde(today); setHistorialFechaHasta(today) }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() => { const today = getToday(); setHistorialFechaDesde(subtractDays(today, 7)); setHistorialFechaHasta(today) }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
                  >
                    7 días
                  </button>
                  <button
                    onClick={() => { const today = getToday(); setHistorialFechaDesde(subtractDays(today, 30)); setHistorialFechaHasta(today) }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
                  >
                    30 días
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={exportHistorial}
                      title="Exportar CSV"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> {t('dev.inventario.exportar')}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <MultiSelect
                    placeholder={t('dev.inventario.tipo')}
                    options={TIPO_OPTS.map(({ value, label }) => ({ value, label: t(`dev.inventario.tipo.${value}`) || label }))}
                    selected={tiposHistorial}
                    onChange={setTiposHistorial}
                  />

                  <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[220px] transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
                    <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <input
                      type="text" value={historialQ}
                      onChange={e => setHistorialQ(e.target.value)}
                      placeholder={t('dev.inventario.filter_ubicacion')}
                      className="text-xs outline-none bg-transparent text-warm-700 flex-1 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    {historialQ && (
                      <button onClick={() => setHistorialQ('')} className="text-warm-400 hover:text-warm-600">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {(tiposHistorial.length > 0 || historialQ) && (
                    <button onClick={() => { setTiposHistorial([]); setHistorialQ('') }} className="inline-flex items-center gap-1 text-xs text-primary-600 font-semibold">
                      <X className="w-3 h-3" /> {t('dev.inventario.clear')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-4">
          <motion.div
            key={tab}
            className="card overflow-hidden table-shell"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >

            {/* Tab: Stock activo */}
            {tab === 'actual' && (
              inventarioQuery.isLoading ? (
                <div className="py-14 text-center text-sm text-warm-400">{t('dev.inventario.loading_inv')}</div>
              ) : inventarioFiltrado.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3 text-warm-300">
                  <Boxes className="w-10 h-10" />
                  <p className="text-sm">
                    {ubicacionFilterId ? t('dev.inventario.sin_inv_ub') : t('dev.inventario.sin_inv')}
                  </p>
                  {ubicacionFilterId && (
                    <button onClick={() => setUbicacionFilterId('')} className="text-xs text-primary-600 font-semibold hover:text-primary-700">
                      {t('dev.inventario.quitar_filtro')}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto table-scroll">
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header">{t('dev.inventario.col.codigo')}</th>
                        <th className="table-header">{t('dev.inventario.col.sku')}</th>
                        <th className="table-header">{t('dev.inventario.col.descripcion')}</th>
                        <th className="table-header">{t('dev.inventario.col.embalaje')}</th>
                        <th className="table-header">{t('dev.inventario.col.ubicacion')}</th>
                        {OPTIONAL_COLS.filter(c => visibleCols.includes(c.id)).map(c => (
                          <th key={c.id} className="table-header">{t(`dev.inventario.col_opt.${c.id}`)}</th>
                        ))}
                        <th className="table-header text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span>{t('dev.inventario.col.disponible')}</span>
                            <div className="relative" ref={colConfigRef}>
                              <button
                                onClick={() => setShowColConfig(v => !v)}
                                title={t('dev.inventario.col_config')}
                                className={`p-1 rounded-md transition-colors ${showColConfig ? 'bg-primary-100 text-primary-600' : 'text-warm-400 hover:text-warm-600 hover:bg-warm-100'}`}
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                              </button>
                              {showColConfig && (
                                <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl border border-warm-200 shadow-xl p-2 w-44">
                                  <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wide px-1 mb-1.5">{t('dev.inventario.cols_opcionales')}</p>
                                  {OPTIONAL_COLS.map(c => (
                                    <button
                                      key={c.id}
                                      onClick={() => setVisibleCols(prev =>
                                        prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                                      )}
                                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-warm-50 text-left transition-colors"
                                    >
                                      <span className={`w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                                        visibleCols.includes(c.id) ? 'bg-primary-500 border-primary-500' : 'border-warm-300'
                                      }`}>
                                        {visibleCols.includes(c.id) && <Check className="w-2.5 h-2.5 text-white" />}
                                      </span>
                                      <span className="text-xs text-warm-700">{t(`dev.inventario.col_opt.${c.id}`)}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {paginatedInventario.map(row => (
                        <tr key={row.id} className="hover:bg-gradient-to-r hover:from-primary-50/30 hover:to-transparent transition-all duration-150 group border-b border-warm-50">
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-warm-700">{row.codigo_trazabilidad}</span>
                              <button
                                onClick={() => copy(row.codigo_trazabilidad)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-all"
                              >
                                {copied === row.codigo_trazabilidad ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </td>
                          <td className="table-cell text-xs font-medium text-warm-800">
                            {row.sku}{row.sku2 ? <span className="text-warm-400 ml-1">/ {row.sku2}</span> : ''}
                          </td>
                          <td className="table-cell text-xs text-warm-600">{row.descripcion || '—'}</td>
                          <td className="table-cell text-xs text-warm-600">{row.embalaje1 || '—'}</td>
                          <td className="table-cell">
                            {row.ubicacion_codigo || row.ubicacion_nombre
                              ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-warm-100 text-warm-700 text-[11px] font-medium">
                                  <LayoutGrid className="w-3 h-3" />
                                  {row.ubicacion_codigo || row.ubicacion_nombre}
                                </span>
                              )
                              : <span className="text-xs text-warm-300">—</span>}
                          </td>
                          {OPTIONAL_COLS.filter(c => visibleCols.includes(c.id)).map(c => (
                            <td key={c.id} className="table-cell text-xs text-warm-600">
                              {row[c.field] || <span className="text-warm-300">—</span>}
                            </td>
                          ))}
                          <td className="table-cell text-right">
                            <span className={`text-sm font-bold ${row.cantidad_disponible > 0 ? 'text-warm-800' : 'text-danger-500'}`}>
                              {row.cantidad_disponible}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                  <TablePagination
                    page={safeStockPage}
                    totalPages={stockTotalPages}
                    pageSize={stockPageSize}
                    totalItems={inventarioFiltrado.length}
                    onPageChange={setStockPage}
                    onPageSizeChange={setStockPageSize}
                    itemLabel={t('dev.inventario.stock.itemLabel')}
                  />
                </>
              )
            )}

            {/* Tab: Historial */}
            {tab === 'historial' && (
              historialQuery.isLoading ? (
                <div className="py-14 text-center text-sm text-warm-400">{t('dev.inventario.loading_hist')}</div>
              ) : movimientos.length === 0 ? (
                <div className="py-14 text-center text-sm text-warm-400">{t('dev.inventario.sin_movimientos')}</div>
              ) : (
                <>
                  <div className="overflow-x-auto table-scroll">
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header">{t('dev.inventario.hist.fecha')}</th>
                        <th className="table-header">{t('dev.inventario.hist.tipo')}</th>
                        <th className="table-header">{t('dev.inventario.hist.referencia')}</th>
                        <th className="table-header">{t('dev.inventario.hist.codigo')}</th>
                        <th className="table-header">{t('dev.inventario.hist.sku')}</th>
                        <th className="table-header text-right w-[68px] whitespace-nowrap px-2">{t('dev.inventario.hist.anterior')}</th>
                        <th className="table-header text-right w-[68px] whitespace-nowrap px-2">{t('dev.inventario.hist.nueva')}</th>
                        <th className="table-header text-right w-[76px] whitespace-nowrap px-2">{t('dev.inventario.hist.cambio')}</th>
                        <th className="table-header">{t('dev.inventario.hist.ubicacion')}</th>
                        <th className="table-header">{t('dev.inventario.hist.observacion')}</th>
                        <th className="table-header">{t('dev.inventario.hist.usuario')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {paginatedMovimientos.map(row => {
                        const cantAnterior = row.cantidad_anterior
                        const cantNueva = row.cantidad_nueva
                        const referenciaHref = getMovimientoReferenciaHref(row)
                        const delta = (cantAnterior != null && cantNueva != null)
                          ? cantNueva - cantAnterior
                          : null

                        return (
                          <tr key={row.id} className="table-row border-b border-warm-50">
                            <td className="table-cell text-xs text-warm-500">{fmtDateTime(row.created_at)}</td>
                            <td className="table-cell">
                              <span className={`badge text-[10px] ${TIPO_COLORS[row.tipo] || 'bg-warm-100 text-warm-600'}`}>
                                {row?.referencia_tipo === 'importacion'
                                  ? t('dev.inventario.tipo.importacion')
                                  : t(`dev.inventario.tipo.${row?.tipo}`) || row?.tipo || '—'}
                              </span>
                            </td>
                            <td className="table-cell text-xs">
                              {row.documento ? (
                                referenciaHref ? (
                                  <button
                                    onClick={() => navigate(referenciaHref)}
                                    className="font-mono text-primary-700 hover:text-primary-800 hover:underline"
                                  >
                                    {row.documento}
                                  </button>
                                ) : (
                                  <span className="font-mono text-warm-600">{row.documento}</span>
                                )
                              ) : (
                                <span className="text-warm-300">—</span>
                              )}
                            </td>
                            <td className="table-cell font-mono text-xs text-warm-600">{row.codigo_trazabilidad || '—'}</td>
                            <td className="table-cell text-xs font-medium text-warm-800">{row.sku || '—'}</td>
                            <td className="table-cell text-right text-xs text-warm-500 whitespace-nowrap px-2">
                              {cantAnterior ?? <span className="text-warm-300">—</span>}
                            </td>
                            <td className="table-cell text-right text-xs font-semibold text-warm-800 whitespace-nowrap px-2">
                              {cantNueva ?? <span className="text-warm-300">—</span>}
                            </td>
                            <td className="table-cell text-right whitespace-nowrap px-2">
                              {delta !== null ? (
                                <span className={`inline-flex items-center justify-center min-w-[52px] text-xs font-bold px-1.5 py-0.5 rounded-md ${
                                  delta > 0
                                    ? 'bg-success-100 text-success-700'
                                    : delta < 0
                                    ? 'bg-danger-100 text-danger-600'
                                    : 'bg-warm-100 text-warm-500'
                                }`}>
                                  {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta}
                                </span>
                              ) : <span className="text-warm-300">—</span>}
                            </td>

                            <td className="table-cell text-xs text-warm-500">
                              {getMovimientoUbicacion(row) || '—'}
                            </td>
                            <td className="table-cell text-xs text-warm-500 max-w-[200px] truncate" title={row.observacion}>
                              {row.observacion || '—'}
                            </td>
                            <td className="table-cell text-xs text-warm-500">{row.usuario_nombre || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    </table>
                  </div>
                  <TablePagination
                    page={safeHistorialPage}
                    totalPages={historialTotalPages}
                    pageSize={historialPageSize}
                    totalItems={movimientos.length}
                    onPageChange={setHistorialPage}
                    onPageSizeChange={setHistorialPageSize}
                    itemLabel={t('dev.inventario.hist.itemLabel')}
                  />
                </>
              )
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
          <p className="text-sm text-warm-600">
            Se exportará la información visible con los filtros aplicados actualmente.
          </p>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-success-50 border border-success-100">
            <div className="w-9 h-9 rounded-xl bg-success-100 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-success-700" />
            </div>
            <div>
              <p className="text-[11px] text-success-600 font-semibold uppercase tracking-wide">
                {exportConfirm?.label || 'Registros a exportar'}
              </p>
              <p className="text-2xl font-bold text-success-700 tabular-nums leading-tight">{exportConfirm?.count}</p>
            </div>
          </div>
        </div>
      </Modal>

      <InventarioUbicacionesModal
        isOpen={showUbicaciones}
        onClose={() => setShowUbicaciones(false)}
        ubicaciones={ubicaciones}
        onSaved={() => qc.invalidateQueries({ queryKey: ['dev-ubicaciones'] })}
        onImportClick={() => setShowImportUbicaciones(true)}
      />
      <AjusteModal
        isOpen={showAjuste}
        onClose={() => { setShowAjuste(false); setAjusteFeedback(null) }}
        initialTipo={ajusteTipo}
        inventario={inventario}
        ubicaciones={ubicaciones}
        onSubmit={(payload) => ajusteMutation.mutate(payload)}
        saving={ajusteMutation.isPending}
        submitResult={ajusteFeedback}
      />
      <ImportarInventarioModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        inventario={inventario}
        ubicaciones={ubicaciones}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ['dev-inventario'] })
          qc.invalidateQueries({ queryKey: ['dev-movimientos'] })
        }}
      />
      <ImportarUbicacionesModal
        isOpen={showImportUbicaciones}
        onClose={() => setShowImportUbicaciones(false)}
        existingUbicaciones={ubicaciones}
        onImported={() => qc.invalidateQueries({ queryKey: ['dev-ubicaciones'] })}
      />
    </div>
  )
}
