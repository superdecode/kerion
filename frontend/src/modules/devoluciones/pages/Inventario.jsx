import { useState, useRef, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Check, ArrowLeftRight, ClipboardList, Boxes, Search, X,
  LayoutGrid, Clock, ChevronDown, ChevronUp, Filter, Download, Calendar, Upload, Settings2,
} from 'lucide-react'
import { getToday, subtractDays } from '../../../core/utils/dateFormat'
import Header from '../../../core/components/layout/Header'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
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

/* ─── Ubicacion combobox para filtro ─── */
function UbicacionFilter({ ubicaciones, value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

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
      <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5 min-w-[200px]">
        <LayoutGrid className="w-3.5 h-3.5 text-warm-400 shrink-0" />
        <input
          type="text"
          value={selected ? selected.codigo : q}
          onChange={e => { setQ(e.target.value); onChange(''); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Filtrar por ubicación..."
          className="text-xs outline-none bg-transparent text-warm-700 flex-1 min-w-0 w-32"
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
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const [tab, setTab] = useState('actual')
  const [qInput, setQInput] = useState('')
  const [qFilter, setQFilter] = useState('')
  const [ubicacionFilterId, setUbicacionFilterId] = useState('')
  const [tiposHistorial, setTiposHistorial] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [copied, setCopied] = useState(null)
  const [showUbicaciones, setShowUbicaciones] = useState(false)
  const [showAjuste, setShowAjuste] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showImportUbicaciones, setShowImportUbicaciones] = useState(false)
  const [ajusteTipo, setAjusteTipo] = useState('ajuste')
  const [showColConfig, setShowColConfig] = useState(false)
  const [visibleCols, setVisibleCols] = useState([])
  const [stockPage, setStockPage] = useState(1)
  const [stockPageSize, setStockPageSize] = useState(10)
  const [historialPage, setHistorialPage] = useState(1)
  const [historialPageSize, setHistorialPageSize] = useState(10)
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-inventario'] })
      qc.invalidateQueries({ queryKey: ['dev-movimientos'] })
      toast.success('Ajuste registrado')
      setShowAjuste(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al guardar ajuste'),
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

  const exportInventario = () => {
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

  const exportHistorial = () => {
    const movs = movimientos
    if (!movs.length) return
    const headers = ['Fecha', 'Tipo', 'Código', 'SKU', 'Cant. Anterior', 'Cant. Nueva', 'Cambio', 'Ubicación', 'Observación', 'Usuario']
    const rows = movs.map(r => {
      const delta = (r.cantidad_anterior != null && r.cantidad_nueva != null)
        ? r.cantidad_nueva - r.cantidad_anterior : ''
      const ubicacion = getMovimientoUbicacion(r)
      return [
        fmtDateTime(r.created_at), r.tipo, r.codigo_trazabilidad || '', r.sku || '',
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

  const tabCounts = useMemo(() => ({
    actual: inventarioFiltrado.length,
    historial: allMovimientos.length,
  }), [inventarioFiltrado, allMovimientos])
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
  const canCreate = hasPermission('devoluciones.inventario', 'crear')

  useEffect(() => {
    setStockPage(1)
  }, [qFilter, ubicacionFilterId, stockPageSize])

  useEffect(() => {
    setHistorialPage(1)
  }, [tiposHistorial, historialFechaDesde, historialFechaHasta, historialQ, historialPageSize])

  return (
    <div className="flex flex-col h-full">
      <Header title="Inventario de devoluciones" subtitle="Stock activo e historial de movimientos" />

      <div className="flex-1 overflow-y-auto">

        {/* Sticky section: tabs + filter bar */}
        <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur-2xl border-b border-warm-100/60">

          {/* Tab row */}
          <div className="flex gap-0 border-b border-warm-100 px-5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                  tab === t.id
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-warm-400 hover:text-warm-600'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${
                  tab === t.id ? 'bg-primary-100 text-primary-700' : 'bg-warm-100 text-warm-500'
                }`}>
                  {tabCounts[t.id] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-5 py-2.5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">

              {/* ── Stock actual filters ── */}
              {tab === 'actual' && (
                <>
                  <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5 min-w-[220px]">
                    <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <input
                      type="text"
                      value={qInput}
                      onChange={e => handleQChange(e.target.value)}
                      placeholder="Buscar SKU, código, descripción..."
                      className="text-xs outline-none bg-transparent text-warm-700 flex-1"
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
                </>
              )}

              {/* ── Historial filters ── */}
              {tab === 'historial' && (
                <>
                  <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <input type="date" value={historialFechaDesde}
                      onChange={e => setHistorialFechaDesde(e.target.value)}
                      className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
                    <span className="text-warm-300 text-xs">→</span>
                    <input type="date" value={historialFechaHasta}
                      onChange={e => setHistorialFechaHasta(e.target.value)}
                      className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
                  </div>

                  <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5 min-w-[190px]">
                    <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <input
                      type="text" value={historialQ}
                      onChange={e => setHistorialQ(e.target.value)}
                      placeholder="Código, SKU, ubicación..."
                      className="text-xs outline-none bg-transparent text-warm-700 flex-1"
                    />
                    {historialQ && (
                      <button onClick={() => setHistorialQ('')} className="text-warm-400 hover:text-warm-600">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowFilters(v => !v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                        showFilters ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
                      } ${tiposHistorial.length ? 'ring-1 ring-primary-400' : ''}`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Tipo
                      {tiposHistorial.length > 0 && (
                        <span className="w-4 h-4 rounded-full bg-primary-500 text-white text-[9px] flex items-center justify-center font-bold">
                          {tiposHistorial.length}
                        </span>
                      )}
                      {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {tiposHistorial.length > 0 && (
                      <button onClick={() => setTiposHistorial([])} className="inline-flex items-center gap-1 text-xs text-primary-600 font-semibold">
                        <X className="w-3 h-3" /> Limpiar
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={tab === 'actual' ? exportInventario : exportHistorial}
                  title="Exportar CSV"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar
                </button>

                {tab === 'actual' && canCreate && (
                  <button
                    onClick={() => setShowImport(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Importar
                  </button>
                )}

                {canManage && (
                  <button
                    onClick={() => setShowUbicaciones(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Ubicaciones
                  </button>
                )}
                {canCreate && (
                  <button
                    onClick={() => { setAjusteTipo('movimiento'); setShowAjuste(true) }}
                    className="btn-ghost inline-flex items-center gap-1.5 border border-violet-400 text-violet-600 hover:bg-violet-50 hover:border-violet-500"
                  >
                    <ArrowLeftRight className="w-4 h-4" /> Mover
                  </button>
                )}
                {canCreate && (
                  <button
                    onClick={() => { setAjusteTipo('ajuste'); setShowAjuste(true) }}
                    className="btn-primary inline-flex items-center gap-1.5"
                  >
                    <ClipboardList className="w-4 h-4" /> Inventario físico
                  </button>
                )}
              </div>
            </div>

            {/* Historial tipo multiselect */}
            <AnimatePresence initial={false}>
              {tab === 'historial' && showFilters && (
                <motion.div
                  key="tipo-filters"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    {TIPO_OPTS.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setTiposHistorial(prev =>
                          prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
                        )}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                          tiposHistorial.includes(value)
                            ? `${TIPO_COLORS[value]} border-transparent`
                            : 'bg-warm-50 border-warm-200 text-warm-600 hover:bg-warm-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="p-4">
          <motion.div
            key={tab}
            className="card overflow-hidden"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >

            {/* Tab: Stock activo */}
            {tab === 'actual' && (
              inventarioQuery.isLoading ? (
                <div className="py-14 text-center text-sm text-warm-400">Cargando inventario...</div>
              ) : inventarioFiltrado.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3 text-warm-300">
                  <Boxes className="w-10 h-10" />
                  <p className="text-sm">
                    {ubicacionFilterId ? 'Sin inventario en esta ubicación' : 'Sin inventario disponible'}
                  </p>
                  {ubicacionFilterId && (
                    <button onClick={() => setUbicacionFilterId('')} className="text-xs text-primary-600 font-semibold hover:text-primary-700">
                      Quitar filtro de ubicación
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header">Código</th>
                        <th className="table-header">SKU</th>
                        <th className="table-header">Descripción</th>
                        <th className="table-header">Embalaje</th>
                        <th className="table-header">Ubicación</th>
                        {OPTIONAL_COLS.filter(c => visibleCols.includes(c.id)).map(c => (
                          <th key={c.id} className="table-header">{c.label}</th>
                        ))}
                        <th className="table-header text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span>Disponible</span>
                            <div className="relative" ref={colConfigRef}>
                              <button
                                onClick={() => setShowColConfig(v => !v)}
                                title="Configurar columnas"
                                className={`p-1 rounded-md transition-colors ${showColConfig ? 'bg-primary-100 text-primary-600' : 'text-warm-400 hover:text-warm-600 hover:bg-warm-100'}`}
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                              </button>
                              {showColConfig && (
                                <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl border border-warm-200 shadow-xl p-2 w-44">
                                  <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wide px-1 mb-1.5">Columnas opcionales</p>
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
                                      <span className="text-xs text-warm-700">{c.label}</span>
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
                    itemLabel="líneas"
                  />
                </>
              )
            )}

            {/* Tab: Historial */}
            {tab === 'historial' && (
              historialQuery.isLoading ? (
                <div className="py-14 text-center text-sm text-warm-400">Cargando historial...</div>
              ) : movimientos.length === 0 ? (
                <div className="py-14 text-center text-sm text-warm-400">Sin movimientos registrados</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header">Fecha</th>
                        <th className="table-header">Tipo</th>
                        <th className="table-header">Código</th>
                        <th className="table-header">SKU</th>
                        <th className="table-header text-right">Anterior</th>
                        <th className="table-header text-right">Nueva</th>
                        <th className="table-header text-right">Cambio</th>
                        <th className="table-header">Ubicación</th>
                        <th className="table-header">Observación</th>
                        <th className="table-header">Usuario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {paginatedMovimientos.map(row => {
                        const cantAnterior = row.cantidad_anterior
                        const cantNueva = row.cantidad_nueva
                        const delta = (cantAnterior != null && cantNueva != null)
                          ? cantNueva - cantAnterior
                          : null

                        return (
                          <tr key={row.id} className="hover:bg-warm-50/60 transition-all duration-150 border-b border-warm-50">
                            <td className="table-cell text-xs text-warm-500">{fmtDateTime(row.created_at)}</td>
                            <td className="table-cell">
                              <span className={`badge text-[10px] ${TIPO_COLORS[row.tipo] || 'bg-warm-100 text-warm-600'}`}>
                                {TIPO_LABELS[row.tipo] || row.tipo}
                              </span>
                            </td>
                            <td className="table-cell font-mono text-xs text-warm-600">{row.codigo_trazabilidad || '—'}</td>
                            <td className="table-cell text-xs font-medium text-warm-800">{row.sku || '—'}</td>
                            <td className="table-cell text-right text-xs text-warm-500">
                              {cantAnterior ?? <span className="text-warm-300">—</span>}
                            </td>
                            <td className="table-cell text-right text-xs font-semibold text-warm-800">
                              {cantNueva ?? <span className="text-warm-300">—</span>}
                            </td>
                            <td className="table-cell text-right">
                              {delta !== null ? (
                                <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-lg ${
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
                    itemLabel="movimientos"
                  />
                </>
              )
            )}
          </motion.div>
        </div>
      </div>

      <InventarioUbicacionesModal
        isOpen={showUbicaciones}
        onClose={() => setShowUbicaciones(false)}
        ubicaciones={ubicaciones}
        onSaved={() => qc.invalidateQueries({ queryKey: ['dev-ubicaciones'] })}
        onImportClick={() => setShowImportUbicaciones(true)}
      />
      <AjusteModal
        isOpen={showAjuste}
        onClose={() => setShowAjuste(false)}
        initialTipo={ajusteTipo}
        inventario={inventario}
        ubicaciones={ubicaciones}
        onSubmit={(payload) => ajusteMutation.mutate(payload)}
        saving={ajusteMutation.isPending}
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
