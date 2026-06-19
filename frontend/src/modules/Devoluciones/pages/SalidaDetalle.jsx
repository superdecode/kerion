import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Trash2, Download, Printer, X, AlertTriangle, Search,
  ArrowRightFromLine, PackageCheck, Hash, Layers, User, CalendarDays,
  Edit3, ChevronsUpDown, ChevronUp, ChevronDown, Settings2, Check, Save, LayoutGrid,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import StatusPill from '../../../core/components/common/StatusPill'
import SalidaImportModal from '../components/SalidaImportModal'
import SurtidoConfirmModal from '../components/SurtidoConfirmModal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import {
  getSalida, updateSalida, completarSalida, cancelarSalida, deleteSalida,
  downloadSalidaExcel, listInventario,
} from '../services/devolucionesService'
import { fmtDate, fmtDateTime } from '../../../core/utils/dateFormat'

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
// Columns that participate in grouping key (identifying fields)
const PRINT_EXTRA_COLS = [
  { id: 'descripcion', label: 'Descripción',       field: 'descripcion',          isKey: true },
  { id: 'codigo',      label: 'Código',             field: 'codigo_trazabilidad',  isKey: true },
  { id: 'sku2',        label: 'SKU2',               field: 'sku2',                 isKey: true },
  { id: 'guia1',       label: 'Guía 1',             field: 'guia1',                isKey: true },
  { id: 'guia2',       label: 'Guía 2',             field: 'guia2',                isKey: true },
  { id: 'cant_sol',    label: 'Cant. Solicitada',   field: null,                   isKey: false },
  { id: 'cant_sur',    label: 'Cant. Surtida',      field: null,                   isKey: false },
]

function SummaryCard({ icon: Icon, label, value, color = 'warm' }) {
  const ring = { warm: 'border-warm-100 bg-warm-50', primary: 'border-primary-100 bg-primary-50', success: 'border-success-100 bg-success-50' }
  const iconCls = { warm: 'text-warm-500', primary: 'text-primary-600', success: 'text-success-700' }
  return (
    <div className={`rounded-2xl border p-3 flex items-center gap-3 ${ring[color]} shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all duration-200`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm ${iconCls[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${iconCls[color]} opacity-70`}>{label}</p>
        <p className="text-sm font-bold text-warm-800 truncate mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  )
}

function SortHeader({ label, field, currentField, dir, onSort, className = '' }) {
  const active = field === currentField
  return (
    <th
      className={`table-header cursor-pointer select-none hover:bg-warm-100/60 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary-500" /> : <ChevronDown className="w-3 h-3 text-primary-500" />
          : <ChevronsUpDown className="w-3 h-3 text-warm-300" />
        }
      </div>
    </th>
  )
}

// Inline print content rendered in a hidden div — always in DOM so print CSS works
function HojaSurtidoContent({ salida, groupedItems, printExtraCols, totalPiezas, totalSurtidas, isCompleted, fmtDate }) {
  const colsToShow = PRINT_EXTRA_COLS.filter(c => printExtraCols.includes(c.id))

  const tdStyle = { padding: '4px 6px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', verticalAlign: 'top' }
  const thStyle = { padding: '5px 6px', background: '#f3f4f6', borderBottom: '2px solid #9ca3af', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#111', background: '#fff', padding: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #374151', paddingBottom: '10px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: 1.1 }}>HOJA DE SURTIDO</div>
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>Sistema de Devoluciones</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'Courier New, monospace' }}>{salida.codigo}</div>
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{fmtDate(salida.created_at)}</div>
          <div style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '700', background: '#f3f4f6', color: '#374151' }}>
            {ESTADO_LABELS[salida.estado] || salida.estado}
          </div>
        </div>
      </div>

      {/* Info row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '6px 10px' }}>
          <div style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Responsable</div>
          <div style={{ fontSize: '12px', fontWeight: '600', marginTop: '2px' }}>{salida.responsable_nombre || '—'}</div>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '6px 10px' }}>
          <div style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Observaciones</div>
          <div style={{ fontSize: '11px', marginTop: '2px', color: '#4b5563' }}>{salida.observaciones || '—'}</div>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', padding: '7px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
        <div><span style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase' }}>Líneas: </span><span style={{ fontSize: '13px', fontWeight: '800' }}>{groupedItems.length}</span></div>
        <div><span style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase' }}>Piezas solicitadas: </span><span style={{ fontSize: '13px', fontWeight: '800' }}>{totalPiezas}</span></div>
        {isCompleted && <div><span style={{ fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase' }}>Piezas surtidas: </span><span style={{ fontSize: '13px', fontWeight: '800' }}>{totalSurtidas}</span></div>}
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '26px', textAlign: 'center' }}>#</th>
            <th style={{ ...thStyle, minWidth: '80px' }}>SKU</th>
            {colsToShow.filter(c => c.isKey && c.id !== 'cant_sol' && c.id !== 'cant_sur').map(col => (
              <th key={col.id} style={thStyle}>{col.label}</th>
            ))}
            <th style={{ ...thStyle, minWidth: '70px' }}>Ubicación</th>
            <th style={{ ...thStyle, textAlign: 'right', width: '50px' }}>Cant.</th>
            {printExtraCols.includes('cant_sol') && <th style={{ ...thStyle, textAlign: 'right', width: '55px' }}>Solicitada</th>}
            {isCompleted && printExtraCols.includes('cant_sur') && <th style={{ ...thStyle, textAlign: 'right', width: '50px' }}>Surtida</th>}
          </tr>
        </thead>
        <tbody>
          {groupedItems.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontWeight: '600' }}>{i + 1}</td>
              <td style={{ ...tdStyle, fontWeight: '700' }}>{row.sku}</td>
              {colsToShow.filter(c => c.isKey && c.id !== 'cant_sol' && c.id !== 'cant_sur').map(col => (
                <td key={col.id} style={{ ...tdStyle, color: '#4b5563' }}>{row[col.field] || '—'}</td>
              ))}
              <td style={{ ...tdStyle, color: '#4b5563' }}>
                {row._ubicsList.length > 0
                  ? row._ubicsList.join(', ')
                  : '—'}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700' }}>{row._cantSolTotal}</td>
              {printExtraCols.includes('cant_sol') && (
                <td style={{ ...tdStyle, textAlign: 'right' }}>{row._cantSolTotal}</td>
              )}
              {isCompleted && printExtraCols.includes('cant_sur') && (
                <td style={{ ...tdStyle, textAlign: 'right' }}>{row._cantSurTotal ?? '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: '8px', color: '#9ca3af' }}>
          Generado: {fmtDateTime(new Date())}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '180px', borderTop: '1px solid #374151', paddingTop: '4px' }}>
            <div style={{ fontSize: '9px', color: '#6b7280' }}>Firma responsable de surtido</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SalidaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()
  const { t } = useI18nStore()

  const [showImport, setShowImport] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [deletingLineId, setDeletingLineId] = useState(null)
  const [editingLine, setEditingLine] = useState(null)
  const [editQty, setEditQty] = useState(1)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [refValue, setRefValue] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Print state
  const [showPrintConfig, setShowPrintConfig] = useState(false)
  const [printExtraCols, setPrintExtraCols] = useState(['descripcion'])

  const [invSearch, setInvSearch] = useState('')
  const [invQ, setInvQ] = useState('')
  const [selectedInv, setSelectedInv] = useState(null)
  const [qty, setQty] = useState(1)
  const debounceRef = useRef(null)

  const salidaQuery = useQuery({
    queryKey: ['dev-salida', id],
    queryFn: () => getSalida(id),
  })
  const invQuery = useQuery({
    queryKey: ['dev-inventario-sel', invQ],
    queryFn: () => listInventario({ q: invQ }),
    enabled: invQ.length >= 2,
  })

  const salida = salidaQuery.data?.data?.salida || salidaQuery.data?.salida
  const items = salidaQuery.data?.data?.items || salida?.items || []
  const invOptions = invQuery.data?.data || invQuery.data?.inventario || []

  const isEditable = salida && ['borrador', 'pendiente'].includes(salida.estado)
  const canEdit = hasPermission('devoluciones.salidas', 'actualizar')
  const canCreate = hasPermission('devoluciones.salidas', 'crear')
  const canDelete = hasPermission('devoluciones.salidas', 'eliminar')
  const canExport = hasPermission('devoluciones.salidas', 'actualizar')
  const isCompleted = salida?.estado === 'completado'
  const isPrintable = salida && !['cancelado'].includes(salida.estado)
  const canCancelRecord = salida?.estado === 'en_proceso' && canDelete
  const canDeleteRecord = ['borrador', 'cancelado'].includes(salida?.estado) && canDelete

  // Auto-open print config when ?print=1 is in URL
  useEffect(() => {
    if (searchParams.get('print') === '1' && salida && !salidaQuery.isLoading && items.length > 0) {
      setShowPrintConfig(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, salida, salidaQuery.isLoading, items.length, setSearchParams])

  const refresh = () => qc.invalidateQueries({ queryKey: ['dev-salida', id] })

  // Sync referencia from loaded salida
  useEffect(() => {
    if (salida) setRefValue(salida.referencia || '')
  }, [salida?.id])

  const updateMutation = useMutation({
    mutationFn: (payload) => updateSalida(id, payload),
    onSuccess: refresh,
    onError: () => toast.error(t('dev.salida_detalle.toast.err_update')),
  })

  const saveRef = () => {
    if (!salida) return
    updateMutation.mutate({
      notas: salida.notas || '',
      estado: salida.estado,
      referencia: refValue.trim() || null,
      items: items.map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada })),
    })
  }

  const completeMutation = useMutation({
    mutationFn: (surtidos) => completarSalida(id, {
      items: surtidos.map(s => ({
        id: s.salida_item_id,
        cantidad_surtida: s.cantidad_surtida,
        surtido: s.surtido,
      })),
    }),
    onSuccess: () => {
      refresh()
      qc.invalidateQueries({ queryKey: ['dev-inventario'] })
      toast.success(t('dev.salida_detalle.toast.completada'))
      setShowConfirm(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || t('dev.salida_detalle.toast.err_completar')),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarSalida(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      refresh()
      setShowCancelModal(false)
      toast.success(t('dev.salida_detalle.toast.cancelado'))
    },
    onError: () => toast.error(t('dev.salida_detalle.toast.err_cancelar')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteSalida(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      toast.success(t('dev.salida_detalle.toast.cerrado'))
      navigate('/Devoluciones/salidas')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('dev.salida_detalle.toast.err_cerrar')),
  })

  const exportExcel = async () => {
    try {
      const blob = await downloadSalidaExcel(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${salida.codigo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error(t('dev.salida_detalle.toast.err_exportar')) }
  }

  const handleInvSearch = (val) => {
    setInvSearch(val)
    setSelectedInv(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setInvQ(val), 300)
  }

  const selectInv = (inv) => {
    setSelectedInv(inv)
    setInvSearch(inv.sku)
    setInvQ('')
  }

  const addLine = () => {
    if (!selectedInv) return
    const nextItems = [
      ...items.map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada })),
      { inventario_id: selectedInv.id, cantidad_solicitada: Number(qty) || 1 },
    ]
    updateMutation.mutate({ items: nextItems }, {
      onSuccess: () => toast.success(t('dev.salida_detalle.toast.linea_add')),
    })
    setSelectedInv(null); setInvSearch(''); setInvQ(''); setQty(1)
  }

  const removeLine = (lineId) => {
    const nextItems = items
      .filter(it => it.id !== lineId)
      .map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada }))
    updateMutation.mutate({ items: nextItems }, {
      onSuccess: () => { toast.success(t('dev.salida_detalle.toast.linea_del')); setDeletingLineId(null) },
    })
  }

  const saveLine = () => {
    if (!editingLine) return
    const nextItems = items.map(it =>
      it.id === editingLine.id
        ? { inventario_id: it.inventario_id, cantidad_solicitada: Number(editQty) || 1 }
        : { inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada }
    )
    updateMutation.mutate({ items: nextItems }, {
      onSuccess: () => { toast.success(t('dev.salida_detalle.toast.cant_upd')); setEditingLine(null) },
    })
  }

  const handleImportRows = (encontrados) => {
    const nextItems = [
      ...items.map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada })),
      ...encontrados.map(r => ({ inventario_id: r.inventario_id, cantidad_solicitada: r.cantidad_solicitada })),
    ]
    updateMutation.mutate({ items: nextItems }, {
      onSuccess: () => { setShowImport(false); toast.success(t('dev.salida_detalle.toast.importadas')) },
    })
  }

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const totalPiezas = useMemo(() =>
    items.reduce((a, it) => a + (it.cantidad_solicitada || 0), 0),
    [items]
  )

  const displayItems = useMemo(() => {
    let result = [...items]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(it =>
        it.codigo_trazabilidad?.toLowerCase().includes(q) ||
        it.sku?.toLowerCase().includes(q) ||
        it.descripcion?.toLowerCase().includes(q) ||
                        it.ubicacion_nombre?.toLowerCase().includes(q) ||
                        it.ubicacion_codigo?.toLowerCase().includes(q) ||
        it.ubicacion_codigo?.toLowerCase().includes(q)
      )
    }
    if (sortField) {
      result = result.slice().sort((a, b) => {
        const av = a[sortField] ?? ''
        const bv = b[sortField] ?? ''
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return result
  }, [items, search, sortField, sortDir])
  const totalPages = Math.max(1, Math.ceil(displayItems.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedItems = useMemo(
    () => displayItems.slice((safePage - 1) * pageSize, safePage * pageSize),
    [displayItems, safePage, pageSize]
  )

  useEffect(() => {
    setPage(1)
  }, [search, sortField, sortDir, pageSize])

  // Grouping for print: key = sku + selected identifying extra cols
  const groupedPrintItems = useMemo(() => {
    const keyFields = ['sku']
    for (const col of PRINT_EXTRA_COLS) {
      if (col.isKey && col.field && printExtraCols.includes(col.id)) {
        keyFields.push(col.field)
      }
    }

    const groups = new Map()
    for (const row of items) {
      const key = keyFields.map(f => row[f] ?? '').join('\x00')
      if (!groups.has(key)) {
        const ubi = row.ubicacion_codigo || row.ubicacion_nombre
        groups.set(key, {
          ...row,
          _cantSol: row.cantidad_solicitada || 0,
          _cantSur: row.cantidad_surtida || 0,
          _ubis: ubi ? new Set([ubi]) : new Set(),
        })
      } else {
        const g = groups.get(key)
        g._cantSol += row.cantidad_solicitada || 0
        g._cantSur += row.cantidad_surtida || 0
        const ubi = row.ubicacion_codigo || row.ubicacion_nombre
        if (ubi) g._ubis.add(ubi)
      }
    }
    return [...groups.values()].map(g => ({
      ...g,
      _cantSolTotal: g._cantSol,
      _cantSurTotal: g._cantSur,
      _ubicsList: [...g._ubis],
    }))
  }, [items, printExtraCols])

  const printTotalPiezas = useMemo(() =>
    groupedPrintItems.reduce((a, r) => a + r._cantSolTotal, 0),
    [groupedPrintItems]
  )
  const printTotalSurtidas = useMemo(() =>
    groupedPrintItems.reduce((a, r) => a + (r._cantSurTotal || 0), 0),
    [groupedPrintItems]
  )

  const executePrint = useCallback(() => {
    const styleId = '__surtido_print_css__'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 12mm 15mm; }
        body * { visibility: hidden !important; }
        #__surtido_print_area__, #__surtido_print_area__ * { visibility: visible !important; }
        #__surtido_print_area__ { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; }
      }
    `
    window.print()
    const cleanup = () => {
      const el = document.getElementById(styleId)
      if (el) el.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    setShowPrintConfig(false)
  }, [])

  const togglePrintCol = (id) => {
    setPrintExtraCols(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  if (salidaQuery.isLoading) return <div className="p-8 text-sm text-warm-400">{t('dev.salida_detalle.loading')}</div>
  if (!salida) return <div className="p-8 text-sm text-warm-400">{t('dev.salida_detalle.not_found')}</div>

  const hasExtraCols = isCompleted

  return (
    <div className="flex flex-col h-full">
      <Header
        title={
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/Devoluciones/salidas')} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-warm-800">{salida.codigo}</span>
              <span className={`badge text-xs ${ESTADO_COLORS[salida.estado]}`}>
                {t('dev.estado.' + salida.estado)}
              </span>
            </div>
          </div>
        }
        actions={
          <div className="flex gap-2">
            {isCompleted && canExport && (
              <button onClick={exportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border bg-success-50 text-success-700 border-success-200 hover:bg-success-100 transition-colors">
                <Download className="w-3.5 h-3.5" /> {t('dev.salida_detalle.export_excel')}
              </button>
            )}
            {isPrintable && items.length > 0 && (
              <button
                onClick={() => setShowPrintConfig(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> {t('dev.salida_detalle.hoja_surtido')}
              </button>
            )}
            {isEditable && canCreate && (
              <button onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors">
                {t('dev.salida_detalle.importar_excel')}
              </button>
            )}
            {isEditable && canEdit && (
              <button
                onClick={() => updateMutation.mutate({
                  notas: salida.notas || '',
                  estado: salida.estado,
                  referencia: refValue.trim() || null,
                  items: items.map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada })),
                }, { onSuccess: () => toast.success(t('dev.salida_detalle.toast.guardado')) })}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {updateMutation.isPending ? t('dev.salida_detalle.guardando') : t('dev.salida_detalle.guardar')}
              </button>
            )}
            {isEditable && canEdit && items.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold shadow-sm hover:shadow-glow-success hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.97]"
              >
                <PackageCheck className="w-4 h-4" /> {t('dev.salida_detalle.confirmar_surtido')}
              </motion.button>
            )}
            {canCancelRecord && (
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warning-200 text-warning-700 text-sm hover:bg-warning-50 disabled:opacity-60"
              >
                <X className="w-4 h-4" />
                {cancelMutation.isPending ? t('dev.salida_detalle.cancelando') : t('dev.salida_detalle.cancelar')}
              </button>
            )}
            {canDeleteRecord && (
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-danger-200 text-danger-600 text-sm hover:bg-danger-50 disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
                {deleteMutation.isPending ? t('dev.salida_detalle.eliminando') : t('dev.salida_detalle.eliminar')}
              </button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="shrink-0 px-5 py-3 border-b border-warm-100 grid grid-cols-4 gap-3">
        <SummaryCard icon={User}         label={t('dev.salida_detalle.card.responsable')} value={salida.responsable_nombre || t('dev.salida_detalle.sin_asignar')} color="warm" />
        <SummaryCard icon={CalendarDays} label={t('dev.salida_detalle.card.fecha')}        value={fmtDate(salida.created_at)} color="warm" />
        <SummaryCard icon={Hash}         label={t('dev.salida_detalle.card.lineas')}       value={items.length} color="primary" />
        <SummaryCard icon={Layers}       label={t('dev.salida_detalle.card.piezas')}       value={totalPiezas} color="primary" />
      </div>

      {/* Referencia / notas bar */}
      <div className="shrink-0 px-5 py-2 border-b border-warm-100 flex items-center gap-3">
        <span className="text-[11px] font-semibold text-warm-400 uppercase tracking-wider shrink-0">{t('dev.salida_detalle.ref_externa')}</span>
        {isEditable && canEdit ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={refValue}
              onChange={e => setRefValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveRef()}
              placeholder={t('dev.salida_detalle.ref_placeholder')}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-warm-200 bg-warm-50 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
            {refValue !== (salida.referencia || '') && (
              <button
                onClick={saveRef}
                disabled={updateMutation.isPending}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {t('dev.salida_detalle.guardar')}
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-warm-700">{salida.referencia || <span className="text-warm-300">—</span>}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">

        <div className="px-5 py-2 border-b border-warm-100 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide shrink-0">
            {t('dev.salida_detalle.lineas_label')} ({items.length})
          </span>
          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-2.5 py-1.5 max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('dev.salida_detalle.search')}
              className="text-xs outline-none bg-transparent text-warm-700 flex-1"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-warm-400 hover:text-warm-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="card overflow-hidden">

            {items.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-warm-300">
                <ArrowRightFromLine className="w-10 h-10 mb-3" />
                <p className="text-sm">{t('dev.salida_detalle.sin_lineas')}</p>
              </div>
            ) : displayItems.length === 0 && search ? (
              <div className="flex flex-col items-center py-10 text-warm-300">
                <Search className="w-8 h-8 mb-2" />
                <p className="text-sm">{t('dev.salida_detalle.sin_resultados')} "{search}"</p>
              </div>
            ) : (
              <div className="table-shell">
                <div className="overflow-x-auto table-scroll">
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/80">
                      <th className="table-header w-10">{t('dev.salida_detalle.col.num')}</th>
                      <SortHeader label={t('dev.salida_detalle.col.codigo')} field="codigo_trazabilidad" currentField={sortField} dir={sortDir} onSort={handleSort} />
                      <SortHeader label={t('dev.salida_detalle.col.sku')} field="sku" currentField={sortField} dir={sortDir} onSort={handleSort} />
                      <th className="table-header">{t('dev.salida_detalle.col.descripcion')}</th>
                      <SortHeader label={t('dev.salida_detalle.col.ubicacion')} field="ubicacion_nombre" currentField={sortField} dir={sortDir} onSort={handleSort} />
                      <SortHeader label={t('dev.salida_detalle.col.solicitada')} field="cantidad_solicitada" currentField={sortField} dir={sortDir} onSort={handleSort} className="text-right" />
                      {hasExtraCols && <th className="table-header text-right">{t('dev.salida_detalle.col.surtida')}</th>}
                      {hasExtraCols && <th className="table-header">{t('dev.salida_detalle.col.surtido')}</th>}
                      {isEditable && (canEdit || canDelete) && <th className="table-header text-right w-20">{t('dev.salida_detalle.col.acciones')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((row, idx) => (
                      <tr key={row.id} className="border-b border-warm-50 table-row group">
                        <td className="table-cell text-xs text-warm-400 font-medium">{(safePage - 1) * pageSize + idx + 1}</td>
                        <td className="table-cell font-mono text-xs text-warm-600">{row.codigo_trazabilidad || '—'}</td>
                        <td className="table-cell text-xs font-semibold text-warm-800">{row.sku}</td>
                        <td className="table-cell text-xs text-warm-600">{row.descripcion || '—'}</td>
                        <td className="table-cell text-xs text-warm-500">
                          {row.ubicacion_codigo || row.ubicacion_nombre
                            ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-warm-100 text-warm-700 text-[11px]"><LayoutGrid className="w-3 h-3" />{row.ubicacion_codigo || row.ubicacion_nombre}</span>
                            : '—'}
                        </td>
                        <td className="table-cell text-right text-sm font-bold text-warm-800">{row.cantidad_solicitada}</td>
                        {hasExtraCols && (
                          <td className="table-cell text-right text-xs font-medium text-warm-800">{row.cantidad_surtida ?? '—'}</td>
                        )}
                        {hasExtraCols && (
                          <td className="table-cell">
                            <StatusPill size="xs" className={row.surtido ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-600'}>
                              {row.surtido ? t('dev.salida_detalle.surtido_si') : t('dev.salida_detalle.surtido_no')}
                            </StatusPill>
                          </td>
                        )}
                        {isEditable && (canEdit || canDelete) && (
                          <td className="table-cell text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <button
                                  onClick={() => { setEditingLine(row); setEditQty(row.cantidad_solicitada) }}
                                  className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors">
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => setDeletingLineId(row.id)}
                                  className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
                <TablePagination
                  page={safePage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={displayItems.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel={t('dev.salida_detalle.lineas_label').toLowerCase()}
                />
              </div>
            )}

            {/* Add-line form */}
            {isEditable && canCreate && (
              <div className="border-t-2 border-dashed border-primary-200/70 bg-gradient-to-br from-primary-50/40 via-white to-accent-50/20 px-5 py-4">
                <div className="text-[11px] font-bold text-primary-500 uppercase tracking-wider mb-3">
                  {t('dev.salida_detalle.agregar_linea')}
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[240px]">
                    <label className="block text-[11px] text-warm-500 mb-1">{t('dev.salida_detalle.buscar_inv')}</label>
                    <div className="flex items-center gap-1.5 bg-white border border-warm-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary-200">
                      <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                      <input
                        value={invSearch}
                        onChange={e => handleInvSearch(e.target.value)}
                        placeholder={t('dev.salida_detalle.inv_search_ph')}
                        className="text-sm outline-none bg-transparent text-warm-700 flex-1"
                      />
                      {invSearch && (
                        <button onClick={() => { setInvSearch(''); setInvQ(''); setSelectedInv(null) }} className="text-warm-400 hover:text-warm-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <AnimatePresence>
                      {invOptions.length > 0 && !selectedInv && invQ.length >= 2 && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="absolute bottom-full left-0 right-0 z-20 mb-1 bg-white/95 backdrop-blur-xl rounded-xl border border-warm-100 shadow-depth max-h-48 overflow-y-auto"
                        >
                          {invOptions.slice(0, 8).map(inv => (
                            <button
                              key={inv.id} type="button"
                              onClick={() => selectInv(inv)}
                              className="w-full text-left px-3 py-2.5 hover:bg-primary-50 border-b border-warm-50 last:border-0 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-xs font-bold text-warm-800">{inv.sku}</div>
                                  <div className="text-[11px] text-warm-500 mt-0.5">{inv.descripcion || '—'}</div>
                                  <div className="text-[11px] text-warm-400 font-mono mt-0.5">
                                    {inv.embalaje1 || inv.codigo_trazabilidad || '—'}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-xs font-bold text-success-700">{inv.cantidad_disponible} {t('dev.salida_detalle.disp')}</div>
                                  {inv.ubicacion_nombre && <div className="text-[10px] text-warm-400 mt-0.5">{inv.ubicacion_nombre}</div>}
                                </div>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {selectedInv && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                      className="flex-1 min-w-[160px] rounded-xl bg-primary-50 border border-primary-100 px-3 py-2 text-xs"
                    >
                      <div className="font-bold text-warm-800">{selectedInv.sku}</div>
                      <div className="text-warm-500 mt-0.5">{selectedInv.descripcion}</div>
                      <div className="flex gap-3 mt-0.5">
                        <span className="font-mono text-warm-400">{selectedInv.embalaje1 || selectedInv.codigo_trazabilidad || '—'}</span>
                        <span className="font-bold text-success-700">{selectedInv.cantidad_disponible} {t('dev.salida_detalle.disp')}</span>
                      </div>
                    </motion.div>
                  )}

                  <div className="w-28 shrink-0">
                    <label className="block text-[11px] text-warm-500 mb-1">{t('dev.salida_detalle.cantidad')}</label>
                    <input
                      type="number" min="1"
                      value={qty}
                      onChange={e => setQty(e.target.value)}
                      onFocus={e => e.target.select()}
                      onKeyDown={e => e.key === 'Enter' && addLine()}
                      className="w-full px-3 py-2 rounded-xl border border-warm-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                    />
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={addLine}
                    disabled={!selectedInv || updateMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    {updateMutation.isPending ? t('dev.salida_detalle.agregando') : t('dev.salida_detalle.agregar')}
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Print config modal ── */}
      <Modal
        isOpen={showPrintConfig}
        onClose={() => setShowPrintConfig(false)}
        title={t('dev.salida_detalle.hoja_surtido')}
        icon={Printer}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowPrintConfig(false)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              {t('dev.salida_detalle.print.cancelar')}
            </button>
            <button
              onClick={executePrint}
              disabled={items.length === 0}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> {t('dev.salida_detalle.print.imprimir')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-warm-50 border border-warm-100">
            <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wide mb-2">{t('dev.salida_detalle.print.base_cols')}</p>
            <div className="flex gap-3 text-xs text-warm-600 font-medium">
              <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-success-500" /> SKU</span>
              <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-success-500" /> Ubicación</span>
              <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-success-500" /> Cantidad</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wide mb-2">{t('dev.salida_detalle.print.extra_cols')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRINT_EXTRA_COLS
                .filter(c => c.id !== 'cant_sur' || isCompleted)
                .map(col => (
                  <button
                    key={col.id}
                    onClick={() => togglePrintCol(col.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-warm-50 border border-transparent hover:border-warm-200 transition-colors text-left"
                  >
                    <span className={`w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                      printExtraCols.includes(col.id) ? 'bg-primary-500 border-primary-500' : 'border-warm-300'
                    }`}>
                      {printExtraCols.includes(col.id) && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <span className="text-xs text-warm-700">{col.label}</span>
                  </button>
                ))}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-primary-50 border border-primary-100 text-xs text-primary-700">
            <span className="font-semibold">{groupedPrintItems.length}</span> {t('dev.salida_detalle.print.filas')} · <span className="font-semibold">{printTotalPiezas}</span> {t('dev.salida_detalle.print.piezas')}
            {isCompleted && <span> · <span className="font-semibold">{printTotalSurtidas}</span> {t('dev.salida_detalle.print.surtidas')}</span>}
          </div>
        </div>
      </Modal>

      {/* Edit quantity modal */}
      <Modal
        isOpen={!!editingLine}
        onClose={() => setEditingLine(null)}
        title={t('dev.salida_detalle.edit_qty.title')}
        icon={Edit3}
        size="sm"
        footer={
          <>
            <button onClick={() => setEditingLine(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">{t('dev.salida_detalle.edit_qty.cancelar')}</button>
            <button
              onClick={saveLine}
              disabled={updateMutation.isPending}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {updateMutation.isPending ? t('dev.salida_detalle.edit_qty.guardando') : t('dev.salida_detalle.edit_qty.guardar')}
            </button>
          </>
        }
      >
        {editingLine && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100 text-xs text-warm-700">
              <span className="font-semibold">{editingLine.sku}</span>
              {editingLine.descripcion && <span className="text-warm-400 ml-1.5">— {editingLine.descripcion}</span>}
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-500 mb-1.5">{t('dev.salida_detalle.edit_qty.label')}</label>
              <input
                type="number" min="1"
                value={editQty}
                onChange={e => setEditQty(e.target.value)}
                onFocus={e => e.target.select()}
                autoFocus
                className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Delete line modal */}
      <Modal
        isOpen={!!deletingLineId}
        onClose={() => setDeletingLineId(null)}
        title={t('dev.salida_detalle.del_linea.title')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeletingLineId(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">{t('dev.salida_detalle.del_linea.cancel')}</button>
            <button
              onClick={() => removeLine(deletingLineId)}
              disabled={updateMutation.isPending}
              className="px-4 py-2 rounded-xl bg-danger-600 text-white text-sm font-semibold disabled:opacity-60">
              {updateMutation.isPending ? '...' : t('dev.salida_detalle.del_linea.confirm')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-700">{t('dev.salida_detalle.del_linea.body')}</p>
      </Modal>

      {/* Cancel modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title={t('dev.salida_detalle.cancel.title')}
        icon={X}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowCancelModal(false)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              {t('dev.salida_detalle.cancel.no')}
            </button>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="px-4 py-2 rounded-xl bg-warning-600 text-white text-sm font-semibold disabled:opacity-60">
              {cancelMutation.isPending ? t('dev.salida_detalle.cancel.ing') : t('dev.salida_detalle.cancel.yes')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          {t('dev.salida_detalle.cancel.body')} {items.length} {t('dev.salida_detalle.cancel.lineas')} {totalPiezas} {t('dev.salida_detalle.cancel.piezas')}
        </p>
      </Modal>

      <SalidaImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImportRows}
      />
      <SurtidoConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        items={items}
        salida={salida}
        onConfirm={(surtidos) => completeMutation.mutate(surtidos)}
        saving={completeMutation.isPending}
      />

      {/* Hidden print area — always in DOM, CSS-injected to show only on print */}
      <div
        id="__surtido_print_area__"
        style={{ position: 'absolute', left: '-9999px', top: 0, width: '210mm', visibility: 'hidden', pointerEvents: 'none' }}
      >
        {salida && (
          <HojaSurtidoContent
            salida={salida}
            groupedItems={groupedPrintItems}
            printExtraCols={printExtraCols}
            totalPiezas={printTotalPiezas}
            totalSurtidas={printTotalSurtidas}
            isCompleted={isCompleted}
            fmtDate={fmtDate}
          />
        )}
      </div>
    </div>
  )
}
