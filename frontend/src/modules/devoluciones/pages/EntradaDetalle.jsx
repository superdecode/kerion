import { useState, useCallback, useMemo, Fragment, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Download, PackageCheck,
  Pencil, Trash2, AlertTriangle, X, Boxes, Save, Image as ImageIcon,
  User, Hash, Layers, CalendarDays, Search,
  ChevronsUpDown, ChevronUp, ChevronDown, LayoutGrid,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import EntradaFormItem from '../components/EntradaFormItem'
import InventarioUbicacionesModal from '../components/InventarioUbicacionesModal'
import {
  confirmEntrada, cancelEntrada, deleteEntrada, createEntradaItem, updateEntradaItem,
  deleteEntradaItem, downloadEntradaExcel, getEntrada, listUbicaciones, uploadEntradaFoto,
} from '../services/devolucionesService'
import { fmtDate, fmtDateTime } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  borrador:   'bg-warm-100 text-warm-600',
  en_proceso: 'bg-warning-100 text-warning-700',
  confirmado: 'bg-success-100 text-success-700',
  cancelado:  'bg-danger-100 text-danger-700',
}
const ESTADO_LABELS = {
  borrador: 'Borrador', en_proceso: 'En proceso',
  confirmado: 'Confirmado', cancelado: 'Cancelado',
}

function SummaryCard({ icon: Icon, label, value, color = 'warm', sub }) {
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
        {sub && <p className="text-[10px] text-warm-400 mt-0.5">{sub}</p>}
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

function getItemSkuRows(item) {
  if (item?.skus?.length) return item.skus

  return [{
    sku: '',
    cantidad: null,
    peso: item?.peso ?? null,
    largo: item?.largo ?? null,
    ancho: item?.ancho ?? null,
    alto: item?.alto ?? null,
  }]
}

export default function EntradaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const [copied, setCopied] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [deletingItemId, setDeletingItemId] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showSaveProgressModal, setShowSaveProgressModal] = useState(false)
  const [showUbicaciones, setShowUbicaciones] = useState(false)
  const [selectedUbicacionEvent, setSelectedUbicacionEvent] = useState(null)
  const [currentFormState, setCurrentFormState] = useState({ form: null, isDirty: false })
  const [restoredDraft, setRestoredDraft] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)
  const [previewFoto, setPreviewFoto] = useState(null)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [filterAdjunto, setFilterAdjunto] = useState(null) // null=todos, true=con foto, false=sin foto
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data, isLoading } = useQuery({
    queryKey: ['dev-entrada', id],
    queryFn: () => getEntrada(id),
  })
  const ubicacionesQuery = useQuery({
    queryKey: ['dev-ubicaciones'],
    queryFn: listUbicaciones,
  })

  const sesion = data?.data?.sesion || data?.sesion
  const items = data?.data?.items || sesion?.items || []
  const ubicaciones = ubicacionesQuery.data?.data || ubicacionesQuery.data?.ubicaciones || []

  const isEditable = sesion && !['confirmado', 'cancelado'].includes(sesion.estado)
  const canEdit = hasPermission('devoluciones.entradas', 'actualizar')
  const canDelete = hasPermission('devoluciones.entradas', 'eliminar')
  const canManageUbicaciones = hasPermission('devoluciones.inventario', 'actualizar')
  const canCancelRecord = sesion?.estado === 'en_proceso' && canEdit
  const canDeleteRecord = ['borrador', 'cancelado'].includes(sesion?.estado) && canDelete
  const formDraftStorageKey = `dev-entrada-form-draft:${id}`

  const refresh = () => qc.invalidateQueries({ queryKey: ['dev-entrada', id] })

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(formDraftStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      setRestoredDraft(parsed)
      if (parsed?.editingItemId) {
        const found = items.find((item) => item.id === parsed.editingItemId)
        if (found) setEditingItem(found)
      }
      toast.success('Se restauró el progreso pendiente')
    } catch {
      sessionStorage.removeItem(formDraftStorageKey)
    }
  }, [formDraftStorageKey])

  useEffect(() => {
    if (!restoredDraft?.editingItemId) return
    const found = items.find((item) => item.id === restoredDraft.editingItemId)
    if (found && editingItem?.id !== found.id) {
      setEditingItem(found)
    }
  }, [items, restoredDraft?.editingItemId, editingItem?.id])

  const addItemMutation = useMutation({
    mutationFn: (payload) => createEntradaItem(id, payload),
    onSuccess: () => refresh(),
    onError: () => toast.error('Error al guardar item'),
  })

  const editItemMutation = useMutation({
    mutationFn: ({ itemId, payload }) => updateEntradaItem(id, itemId, payload),
    onSuccess: () => { refresh(); setEditingItem(null) },
    onError: () => toast.error('Error al actualizar item'),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemId) => deleteEntradaItem(id, itemId),
    onSuccess: () => { refresh(); setDeletingItemId(null) },
    onError: () => toast.error('Error al eliminar item'),
  })

  const confirmMutation = useMutation({
    mutationFn: () => confirmEntrada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      refresh()
      setShowConfirmModal(false)
      toast.success('Entrada confirmada — items en inventario')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al confirmar'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelEntrada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      refresh()
      setShowCancelModal(false)
      toast.success('Cancelado')
    },
    onError: () => toast.error('Error al cancelar'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntrada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      toast.success('Cerrado')
      navigate('/devoluciones/entradas')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al cerrar'),
  })

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text); setTimeout(() => setCopied(null), 2000)
    })
  }

  const exportExcel = async () => {
    try {
      const blob = await downloadEntradaExcel(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${sesion.codigo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Error al exportar') }
  }

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })

  const uploadEvidenceForItem = async (itemId, file) => {
    if (!itemId || !file) return
    const dataBase64 = await fileToBase64(file)
    await uploadEntradaFoto(id, itemId, {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      dataBase64,
    })
  }

  const handleSaveAndAdd = useCallback((payload, onDone) => {
    const { evidencia, ...itemPayload } = payload
    addItemMutation.mutate(itemPayload, {
      onSuccess: async (response) => {
        const createdItemId = response?.created_item_id
        if (evidencia && createdItemId) {
          try {
            await uploadEvidenceForItem(createdItemId, evidencia)
          } catch (e) {
            toast.error(e.response?.data?.error || 'El registro se guardó, pero la evidencia no se pudo subir')
          }
        }
        sessionStorage.removeItem(formDraftStorageKey)
        setRestoredDraft(null)
        toast.success('Registro guardado')
        onDone?.()
        refresh()
      },
    })
  }, [formDraftStorageKey, id])

  const defaultEditingInitialValue = editingItem ? {
    embalaje1: editingItem.embalaje1 || '',
    embalaje2: editingItem.embalaje2 || '',
    peso: editingItem.peso || '',
    largo: editingItem.largo || '',
    ancho: editingItem.ancho || '',
    alto: editingItem.alto || '',
    multicaja: editingItem.multicaja || false,
    es_danado: editingItem.es_danado || false,
    notas: editingItem.notas || '',
    ubicacion_id: editingItem.ubicacion_id || '',
    skus: editingItem.skus?.length ? editingItem.skus : [{ sku: '', sku2: '', descripcion: '', cantidad: 1 }],
  } : null

  const formInitialValue = editingItem
    ? (restoredDraft?.editingItemId === editingItem.id ? restoredDraft.form : defaultEditingInitialValue)
    : (restoredDraft?.editingItemId ? null : restoredDraft?.form || null)

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const totalPiezas = useMemo(() =>
    items.reduce((acc, it) => acc + (it.skus || []).reduce((a, s) => a + Number(s.cantidad || 0), 0), 0),
    [items]
  )

  const existingSkus = useMemo(() =>
    items.flatMap(it => (it.skus || []).map(s => s.sku).filter(Boolean)),
    [items]
  )

  const displayItems = useMemo(() => {
    let result = [...items]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(it =>
        it.codigo_trazabilidad?.toLowerCase().includes(q) ||
        it.embalaje1?.toLowerCase().includes(q) ||
        (it.skus || []).some(s => s.sku?.toLowerCase().includes(q)) ||
        it.ubicacion_codigo?.toLowerCase().includes(q) ||
        it.ubicacion_nombre?.toLowerCase().includes(q) ||
        it.notas?.toLowerCase().includes(q)
      )
    }
    if (filterAdjunto !== null) {
      result = result.filter(it => filterAdjunto ? (it.fotos?.length > 0) : !(it.fotos?.length > 0))
    }
    if (sortField) {
      result = result.slice().sort((a, b) => {
        let av, bv
        if (sortField === 'piezas') {
          av = (a.skus || []).reduce((s, r) => s + Number(r.cantidad || 0), 0)
          bv = (b.skus || []).reduce((s, r) => s + Number(r.cantidad || 0), 0)
        } else {
          av = a[sortField] ?? ''
          bv = b[sortField] ?? ''
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return result
  }, [items, search, filterAdjunto, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(displayItems.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedItems = useMemo(
    () => displayItems.slice((safePage - 1) * pageSize, safePage * pageSize),
    [displayItems, safePage, pageSize]
  )

  useEffect(() => {
    setPage(1)
  }, [search, filterAdjunto, sortField, sortDir, pageSize])

  if (isLoading) return <div className="p-8 text-sm text-warm-400">Cargando...</div>
  if (!sesion) return <div className="p-8 text-sm text-warm-400">Entrada no encontrada</div>

  const colSpan = isEditable && (canEdit || canDelete) ? 10 : 9

  return (
    <div className="flex flex-col h-full">
      {/* Header — subtitle removed (info is in summary cards) */}
      <Header
        title={
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/devoluciones/entradas')} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-warm-800">{sesion.codigo}</span>
              <button onClick={() => copy(sesion.codigo)} className="text-warm-300 hover:text-primary-500">
                {copied === sesion.codigo ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <span className={`badge text-xs ml-1 ${ESTADO_COLORS[sesion.estado]}`}>
                {ESTADO_LABELS[sesion.estado]}
              </span>
            </div>
          </div>
        }
        actions={
          <div className="flex gap-2">
            {sesion.estado === 'confirmado' && (
              <button onClick={exportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100 transition-colors">
                <Download className="w-3.5 h-3.5" /> Exportar Excel
              </button>
            )}
            {isEditable && canEdit && items.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowConfirmModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold shadow-sm hover:shadow-glow-success hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.97]"
              >
                <PackageCheck className="w-4 h-4" /> Confirmar sesión
              </motion.button>
            )}
            {isEditable && canEdit && (
              <button
                onClick={() => setShowSaveProgressModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
              >
                <Save className="w-4 h-4" />
                Guardar
              </button>
            )}
            {canCancelRecord && (
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warning-200 text-warning-700 text-sm hover:bg-warning-50 disabled:opacity-60"
              >
                <X className="w-4 h-4" />
                {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar'}
              </button>
            )}
            {canDeleteRecord && (
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-danger-200 text-danger-600 text-sm hover:bg-danger-50 disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="shrink-0 px-5 py-3 border-b border-warm-100 grid grid-cols-4 gap-3">
        <SummaryCard icon={User}         label="Responsable"    value={sesion.responsable_nombre || 'Sin asignar'} color="warm" />
        <SummaryCard icon={CalendarDays} label="Fecha creación" value={fmtDate(sesion.created_at)} color="warm" />
        <SummaryCard icon={Hash}         label="Registros"      value={items.length} sub="guías" color="primary" />
        <SummaryCard icon={Layers}       label="Piezas totales" value={totalPiezas} color="primary" />
      </div>

      {/* Scrollable main */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {sesion.estado === 'confirmado' && (
          <div className="px-5 py-2.5 bg-success-50 border-b border-success-100 flex items-center gap-2 text-xs text-success-700">
            <PackageCheck className="w-4 h-4" />
            Sesión confirmada — {items.length} items en inventario activo
          </div>
        )}

        {/* Sub-header: count + search */}
        <div className="px-5 py-2 border-b border-warm-100 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide shrink-0">
            Items ({items.length})
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-2.5 py-1.5 max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar código, SKU, ubicación..."
                className="text-xs outline-none bg-transparent text-warm-700 flex-1"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-warm-400 hover:text-warm-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              onClick={() => setFilterAdjunto(v => v === true ? null : true)}
              title="Con evidencia fotográfica"
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                filterAdjunto === true ? 'bg-warning-100 border-warning-300 text-warning-700' : 'bg-warm-50 border-warm-200 text-warm-500 hover:bg-warm-100'
              }`}
            >
              Adjunto
            </button>
          </div>
        </div>

        {/* Card wrapper for table + form */}
        <div className="p-4">
          <div className="card overflow-hidden">

            {/* Table */}
            {items.length === 0 && !isEditable ? (
              <div className="flex flex-col items-center justify-center py-16 text-warm-300">
                <Boxes className="w-10 h-10 mb-3" />
                <p className="text-sm">Sin items registrados</p>
              </div>
            ) : displayItems.length === 0 && search ? (
              <div className="flex flex-col items-center justify-center py-10 text-warm-300">
                <Search className="w-8 h-8 mb-2" />
                <p className="text-sm">Sin resultados para "{search}"</p>
              </div>
            ) : items.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/80">
                      <th className="table-header w-10">#</th>
                      <SortHeader label="Código" field="codigo_trazabilidad" currentField={sortField} dir={sortDir} onSort={handleSort} />
                      <SortHeader label="Embalaje 1" field="embalaje1" currentField={sortField} dir={sortDir} onSort={handleSort} />
                      <th className="table-header">SKU(s)</th>
                      <SortHeader label="Cant." field="piezas" currentField={sortField} dir={sortDir} onSort={handleSort} className="text-center" />
                      <th className="table-header">Peso</th>
                      <th className="table-header">Dimensiones</th>
                      <SortHeader label="Ubicación" field="ubicacion_nombre" currentField={sortField} dir={sortDir} onSort={handleSort} />
                      <th className="table-header">Tipo</th>
                      <th className="table-header text-center w-16">Adjunto</th>
                      {isEditable && (canEdit || canDelete) && <th className="table-header text-right w-20">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((item, idx) => (
                      <Fragment key={item.id}>
                        {(() => {
                          const skuRows = getItemSkuRows(item)
                          return (
                        <tr
                          className={`border-b border-warm-50 hover:bg-warm-50/60 cursor-pointer transition-colors group ${
                            editingItem?.id === item.id ? 'bg-primary-50/60' : ''
                          }`}
                          onClick={() => setExpandedRow(r => r === item.id ? null : item.id)}
                        >
                          <td className="table-cell text-xs text-warm-400 font-medium w-10">{(safePage - 1) * pageSize + idx + 1}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-warm-700">{item.codigo_trazabilidad}</span>
                              <button type="button"
                                onClick={e => { e.stopPropagation(); copy(item.codigo_trazabilidad) }}
                                className="text-warm-300 hover:text-primary-500 transition-all">
                                {copied === item.codigo_trazabilidad ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </td>
                          <td className="table-cell text-xs text-warm-600">
                            <div>{item.embalaje1 || '—'}</div>
                            {item.embalaje2 && <div className="text-warm-400">{item.embalaje2}</div>}
                          </td>
                          <td className="table-cell text-xs text-warm-700">
                            <div className="space-y-1">
                              {skuRows.map((skuRow, skuIdx) => (
                                <div
                                  key={`${item.id}-sku-${skuIdx}`}
                                  className={`${skuIdx > 0 ? 'border-t border-warm-100 pt-1' : ''} font-mono`}
                                >
                                  {skuRow.sku || '—'}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="table-cell text-center text-sm font-bold text-warm-800">
                            <div className="space-y-1">
                              {skuRows.map((skuRow, skuIdx) => (
                                <div
                                  key={`${item.id}-qty-${skuIdx}`}
                                  className={`${skuIdx > 0 ? 'border-t border-warm-100 pt-1' : ''}`}
                                >
                                  {Number(skuRow.cantidad || 0) || '—'}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="table-cell text-xs text-warm-500">
                            <div className="space-y-1">
                              {skuRows.map((skuRow, skuIdx) => {
                                const peso = skuRow.peso ?? item.peso

                                return (
                                  <div
                                    key={`${item.id}-peso-${skuIdx}`}
                                    className={`${skuIdx > 0 ? 'border-t border-warm-100 pt-1' : ''}`}
                                  >
                                    {peso ? `${peso} kg` : <span className="text-warm-300">—</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                          <td className="table-cell text-xs text-warm-500">
                            <div className="space-y-1">
                              {skuRows.map((skuRow, skuIdx) => {
                                const largo = skuRow.largo ?? item.largo
                                const ancho = skuRow.ancho ?? item.ancho
                                const alto = skuRow.alto ?? item.alto

                                return (
                                  <div
                                    key={`${item.id}-dim-${skuIdx}`}
                                    className={`${skuIdx > 0 ? 'border-t border-warm-100 pt-1' : ''}`}
                                  >
                                    {(largo || ancho || alto)
                                      ? <span className="text-warm-400">{largo || '—'}×{ancho || '—'}×{alto || '—'}</span>
                                      : <span className="text-warm-300">—</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                          <td className="table-cell text-xs text-warm-500">
                            {item.ubicacion_codigo || item.ubicacion_nombre
                              ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-warm-100 text-warm-700 text-[11px]"><LayoutGrid className="w-3 h-3" />{item.ubicacion_codigo || item.ubicacion_nombre}</span>
                              : <span className="text-warm-300">—</span>
                            }
                          </td>
                          <td className="table-cell">
                            <div className="flex gap-1 flex-wrap">
                              {item.multicaja && <span className="badge text-[10px] bg-accent-100 text-accent-700">Multicaja</span>}
                              {item.es_danado && <span className="badge text-[10px] bg-danger-100 text-danger-600">Dañado</span>}
                              {item.codigo_multicaja && (
                                <span className="badge text-[10px] bg-warm-100 text-warm-600 font-mono">{item.codigo_multicaja}</span>
                              )}
                            </div>
                          </td>
                          <td className="table-cell text-center">
                            {item.fotos?.length > 0
                              ? (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setPreviewFoto({
                                      itemCodigo: item.codigo_trazabilidad,
                                      fotos: item.fotos,
                                      activeIndex: 0,
                                    })
                                  }}
                                  className="inline-flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-2 py-1 text-left hover:bg-warning-100 transition-colors max-w-[140px]"
                                >
                                  {item.fotos[0]?.public_url
                                    ? (
                                      <img
                                        src={item.fotos[0].public_url}
                                        alt={item.fotos[0].nombre_original || 'Adjunto'}
                                        className="h-8 w-8 rounded object-cover border border-warning-200 shrink-0"
                                      />
                                    )
                                    : (
                                      <span className="inline-flex items-center justify-center h-8 w-8 rounded bg-warning-100 text-warning-600 shrink-0">
                                        <ImageIcon className="w-4 h-4" />
                                      </span>
                                    )}
                                  <span className="min-w-0">
                                    <span className="block truncate text-[11px] font-medium text-warning-800">
                                      {item.fotos[0]?.nombre_original || 'Adjunto'}
                                    </span>
                                    {item.fotos.length > 1 && (
                                      <span className="block text-[10px] text-warning-700">+{item.fotos.length - 1} más</span>
                                    )}
                                  </span>
                                </button>
                              )
                              : <span className="text-warm-200 text-xs">—</span>
                            }
                          </td>
                          {isEditable && (canEdit || canDelete) && (
                            <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => { setEditingItem(item); setExpandedRow(null) }}
                                  className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {canDelete && (
                                  <button onClick={() => setDeletingItemId(item.id)}
                                    className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                          )
                        })()}

                        <AnimatePresence>
                          {expandedRow === item.id && (
                            <motion.tr key={`${item.id}-exp`}
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="bg-warm-50/50 border-b border-warm-100"
                            >
                              <td colSpan={colSpan} className="px-5 py-3">
                                {item.notas
                                  ? (
                                    <div className="text-xs text-warm-600">
                                      <span className="text-warm-400 font-medium">Notas:</span> {item.notas}
                                    </div>
                                  )
                                  : <div className="text-xs text-warm-300">Sin detalle adicional</div>}
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
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
                  itemLabel="registros"
                />
              </>
            )}

            {/* Inline form — inside the card, separated by a dashed border */}
            {isEditable && (
              <div className="border-t-2 border-dashed border-primary-200/70 bg-gradient-to-br from-primary-50/40 via-white to-accent-50/20 p-5">
                <div className="text-[11px] font-bold text-primary-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                  <span>{editingItem ? `Editando: ${editingItem.codigo_trazabilidad}` : 'Nuevo registro'}</span>
                  {editingItem && (
                    <button onClick={() => setEditingItem(null)}
                      className="text-xs text-warm-400 hover:text-warm-600 normal-case tracking-normal font-medium">
                      Cancelar edición
                    </button>
                  )}
                </div>
                <EntradaFormItem
                  key={editingItem?.id || (restoredDraft ? 'restored-draft' : 'new')}
                  initialValue={formInitialValue}
                  saving={addItemMutation.isPending || editItemMutation.isPending}
                  ubicaciones={ubicaciones}
                  existingSkus={existingSkus}
                  selectedUbicacionEvent={selectedUbicacionEvent}
                  onFormStateChange={setCurrentFormState}
                  onOpenUbicaciones={() => setShowUbicaciones(true)}
                  canManageUbicaciones={canManageUbicaciones}
                  onSubmit={(payload) => {
                    const { evidencia, ...itemPayload } = payload
                    if (editingItem) {
                      editItemMutation.mutate({ itemId: editingItem.id, payload: itemPayload }, {
                        onSuccess: async (response) => {
                          const updatedItemId = response?.updated_item_id || editingItem.id
                          if (evidencia && updatedItemId) {
                            try {
                              await uploadEvidenceForItem(updatedItemId, evidencia)
                            } catch (e) {
                              toast.error(e.response?.data?.error || 'El registro se guardó, pero la evidencia no se pudo subir')
                            }
                          }
                          sessionStorage.removeItem(formDraftStorageKey)
                          setRestoredDraft(null)
                          refresh()
                        },
                      })
                    } else {
                      addItemMutation.mutate(itemPayload, {
                        onSuccess: async (response) => {
                          const createdItemId = response?.created_item_id
                          if (evidencia && createdItemId) {
                            try {
                              await uploadEvidenceForItem(createdItemId, evidencia)
                            } catch (e) {
                              toast.error(e.response?.data?.error || 'El registro se guardó, pero la evidencia no se pudo subir')
                            }
                          }
                          sessionStorage.removeItem(formDraftStorageKey)
                          setRestoredDraft(null)
                          refresh()
                        },
                      })
                    }
                  }}
                  onSaveAndAdd={!editingItem ? handleSaveAndAdd : null}
                  onSaveDraft={(payload) => {
                    const { evidencia, ...itemPayload } = payload
                    if (editingItem) {
                      editItemMutation.mutate({ itemId: editingItem.id, payload: itemPayload }, {
                        onSuccess: async (response) => {
                          const updatedItemId = response?.updated_item_id || editingItem.id
                          if (evidencia && updatedItemId) {
                            try {
                              await uploadEvidenceForItem(updatedItemId, evidencia)
                            } catch (e) {
                              toast.error(e.response?.data?.error || 'El borrador se guardó, pero la evidencia no se pudo subir')
                            }
                          }
                          sessionStorage.removeItem(formDraftStorageKey)
                          setRestoredDraft(null)
                          refresh()
                        },
                      })
                      return
                    }

                    addItemMutation.mutate(itemPayload, {
                      onSuccess: async (response) => {
                        const createdItemId = response?.created_item_id
                        if (evidencia && createdItemId) {
                          try {
                            await uploadEvidenceForItem(createdItemId, evidencia)
                          } catch (e) {
                            toast.error(e.response?.data?.error || 'El borrador se guardó, pero la evidencia no se pudo subir')
                          }
                        }
                        sessionStorage.removeItem(formDraftStorageKey)
                        setRestoredDraft(null)
                        toast.success('Borrador guardado')
                        refresh()
                        setEditingItem(null)
                      },
                    })
                  }}
                  onCancel={editingItem ? () => setEditingItem(null) : undefined}
                />
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Confirm modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirmar sesión de entrada"
        icon={PackageCheck}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowConfirmModal(false)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              Continuar registrando
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              className="px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {confirmMutation.isPending ? 'Confirmando...' : 'Confirmar definitivamente'}
            </motion.button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-success-50 border border-success-100">
            <PackageCheck className="w-8 h-8 text-success-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-success-800">{items.length} items · {totalPiezas} piezas</p>
              <p className="text-xs text-success-700 mt-0.5">pasarán al inventario activo</p>
            </div>
          </div>
          <p className="text-sm text-warm-600">
            Una vez confirmada, la sesión queda cerrada y los items aparecen en el stock disponible. Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={showSaveProgressModal}
        onClose={() => setShowSaveProgressModal(false)}
        title="Guardar progreso"
        icon={Save}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setShowSaveProgressModal(false)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50"
            >
              Seguir editando
            </button>
            <button
              onClick={() => {
                if (currentFormState?.isDirty && currentFormState?.form) {
                  sessionStorage.setItem(formDraftStorageKey, JSON.stringify({
                    form: currentFormState.form,
                    editingItemId: editingItem?.id || null,
                  }))
                } else {
                  sessionStorage.removeItem(formDraftStorageKey)
                }
                setShowSaveProgressModal(false)
                setEditingItem(null)
                toast.success('Progreso guardado en borrador')
                navigate('/devoluciones/entradas')
              }}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold"
            >
              Guardar y cerrar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-50 border border-primary-100">
            <Save className="w-8 h-8 text-primary-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-primary-800">{items.length} registros guardados</p>
              <p className="text-xs text-primary-700 mt-0.5">la sesión quedará disponible para continuar después</p>
            </div>
          </div>
          <p className="text-sm text-warm-600">
            Se conservará el progreso actual de la sesión en estado borrador o en proceso, y podrás retomarla más tarde desde el listado de entradas.
          </p>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancelar sesión"
        icon={X}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowCancelModal(false)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              No cancelar
            </button>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="px-4 py-2 rounded-xl bg-warning-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          ¿Cancelar esta sesión de entrada? Los {items.length} items registrados no pasarán al inventario. La sesión quedará marcada como cancelada.
        </p>
      </Modal>

      <Modal
        isOpen={!!previewFoto}
        onClose={() => setPreviewFoto(null)}
        title={`Adjuntos ${previewFoto?.itemCodigo ? `· ${previewFoto.itemCodigo}` : ''}`}
        icon={ImageIcon}
        size="xl"
      >
        {previewFoto && (
          <div className="space-y-4">
            {previewFoto.fotos[previewFoto.activeIndex]?.public_url && (
              <div className="overflow-hidden rounded-2xl border border-warm-100 bg-warm-50">
                <img
                  src={previewFoto.fotos[previewFoto.activeIndex].public_url}
                  alt={previewFoto.fotos[previewFoto.activeIndex].nombre_original || 'Adjunto'}
                  className="max-h-[60vh] w-full object-contain bg-white"
                />
              </div>
            )}
            <div className="text-sm text-warm-700 font-medium">
              {previewFoto.fotos[previewFoto.activeIndex]?.nombre_original || 'Adjunto'}
            </div>
            <div className="flex flex-wrap gap-2">
              {previewFoto.fotos.map((foto, idx) => (
                <button
                  key={foto.id || idx}
                  type="button"
                  onClick={() => setPreviewFoto(prev => ({ ...prev, activeIndex: idx }))}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    idx === previewFoto.activeIndex ? 'border-primary-400 ring-2 ring-primary-100' : 'border-warm-200 hover:border-warm-300'
                  }`}
                >
                  {foto.public_url
                    ? (
                      <img
                        src={foto.public_url}
                        alt={foto.nombre_original || `Adjunto ${idx + 1}`}
                        className="h-16 w-16 object-cover bg-white"
                      />
                    )
                    : (
                      <div className="flex h-16 w-16 items-center justify-center bg-warm-50 text-warm-400">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete item modal */}
      <Modal
        isOpen={!!deletingItemId}
        onClose={() => setDeletingItemId(null)}
        title="Eliminar item"
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeletingItemId(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">Cancelar</button>
            <button
              onClick={() => deleteItemMutation.mutate(deletingItemId)}
              disabled={deleteItemMutation.isPending}
              className="px-4 py-2 rounded-xl bg-danger-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {deleteItemMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-700">¿Eliminar este item? La acción no se puede deshacer.</p>
      </Modal>

      {/* Manage ubicaciones modal */}
      <InventarioUbicacionesModal
        isOpen={showUbicaciones}
        onClose={() => setShowUbicaciones(false)}
        ubicaciones={ubicaciones}
        allowManagement={canManageUbicaciones}
        onSelect={(ubicacion) => {
          setSelectedUbicacionEvent({ ubicacion, nonce: Date.now() })
        }}
        selectActionLabel={editingItem ? 'Usar' : 'Seleccionar'}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['dev-ubicaciones'] })
        }}
      />
    </div>
  )
}
