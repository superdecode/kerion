import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Upload, ArrowRightFromLine, Download, Copy, Check,
  ChevronDown, ChevronUp, Filter, X, Clock, Eye, Search, Printer, Trash2, AlertTriangle,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { createSalida, listSalidas, downloadSalidaExcel, cancelarSalida, deleteSalida } from '../services/devolucionesService'
import { fmtDate, fmtTimeShort, getToday, subtractDays } from '../../../core/utils/dateFormat'

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

const STATUS_TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'borrador', label: 'Borrador' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'completado', label: 'Completado' },
  { id: 'cancelado', label: 'Cancelado' },
]

const ESTADO_OPTS = Object.entries(ESTADO_LABELS).map(([value, label]) => ({ value, label }))

export default function Salidas() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const defaultEnd = getToday()
  const defaultStart = subtractDays(defaultEnd, 30)

  const [estados, setEstados] = useState([])
  const [fechaDesde, setFechaDesde] = useState(defaultStart)
  const [fechaHasta, setFechaHasta] = useState(defaultEnd)
  const [showFilters, setShowFilters] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [copied, setCopied] = useState(null)
  const [activeStatus, setActiveStatus] = useState('todos')
  const [cancelRow, setCancelRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [qInput, setQInput] = useState('')
  const [qFilter, setQFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const debounceRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dev-salidas', estados, fechaDesde, fechaHasta, qFilter],
    queryFn: () => listSalidas({
      estado: estados.join(','),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      q: qFilter,
    }),
  })

  const handleQChange = (val) => {
    setQInput(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setQFilter(''); return }
    debounceRef.current = setTimeout(() => setQFilter(val.trim()), 300)
  }

  const createMutation = useMutation({
    mutationFn: (payload) => createSalida(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      const salidaId = res.data?.id || res.salida?.id || res.id
      navigate(`/devoluciones/salidas/${salidaId}`)
    },
    onError: () => toast.error('Error al crear salida'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelarSalida(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      toast.success('Orden cancelada')
      setCancelRow(null)
    },
    onError: () => toast.error('Error al cancelar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteSalida(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      toast.success('Orden eliminada')
      setDeleteRow(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  })

  const clearFilters = () => { setEstados([]); setFechaDesde(defaultStart); setFechaHasta(defaultEnd); setQInput(''); setQFilter('') }

  const copy = (codigo, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(codigo).then(() => {
      setCopied(codigo); setTimeout(() => setCopied(null), 2000)
    })
  }

  const exportExcel = async (row, e) => {
    e.stopPropagation()
    try {
      const blob = await downloadSalidaExcel(row.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${row.codigo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Error al exportar') }
  }

  const allSalidas = data?.data || data?.salidas || []

  const statusCounts = useMemo(() => {
    const counts = { todos: allSalidas.length }
    STATUS_TABS.slice(1).forEach(({ id }) => {
      counts[id] = allSalidas.filter(s => s.estado === id).length
    })
    return counts
  }, [allSalidas])

  const salidas = useMemo(() =>
    activeStatus === 'todos' ? allSalidas : allSalidas.filter(s => s.estado === activeStatus),
    [allSalidas, activeStatus]
  )
  const totalPages = Math.max(1, Math.ceil(salidas.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedSalidas = useMemo(
    () => salidas.slice((safePage - 1) * pageSize, safePage * pageSize),
    [salidas, safePage, pageSize]
  )

  const canCreate = hasPermission('devoluciones.salidas', 'crear')
  const canEdit = hasPermission('devoluciones.salidas', 'actualizar')
  const canDelete = hasPermission('devoluciones.salidas', 'eliminar')
  const hasActiveFilters = estados.length > 0 || !!qFilter

  useEffect(() => {
    setPage(1)
  }, [estados, fechaDesde, fechaHasta, qFilter, activeStatus, pageSize])

  return (
    <div className="flex flex-col h-full">
      <Header title="Órdenes de salida" subtitle="Surtido y descarga de inventario de devoluciones" />

      <div className="flex-1 overflow-y-auto">

        {/* Sticky filter bar */}
        <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">

          {/* Row 1 */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Date range */}
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="date" value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
            </div>

            {/* Shortcuts */}
            {[{ label: 'Hoy', d: 0 }, { label: '7 días', d: 7 }, { label: '30 días', d: 30 }].map(({ label, d }) => (
              <button key={label}
                onClick={() => { const t = getToday(); setFechaDesde(d === 0 ? t : subtractDays(t, d)); setFechaHasta(t) }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
              >{label}</button>
            ))}

            {/* Search */}
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="text" value={qInput} onChange={e => handleQChange(e.target.value)}
                placeholder="Buscar código, responsable..."
                className="text-xs outline-none bg-transparent text-warm-700 flex-1" />
              {qInput && <button onClick={() => handleQChange('')} className="text-warm-400 hover:text-warm-600"><X className="w-3 h-3" /></button>}
            </div>

            {/* Filter toggle */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                  showFilters ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
                } ${estados.length ? 'ring-1 ring-primary-400' : ''}`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filtros
                {estados.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary-500 text-white text-[9px] flex items-center justify-center font-bold">{estados.length}</span>
                )}
                {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-primary-600 font-semibold">
                  <X className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {canCreate && (
                <button onClick={() => setShowNewModal(true)}
                  className="btn-primary inline-flex items-center gap-2 hover:shadow-glow hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.97]">
                  <Plus className="w-4 h-4" /> Nueva salida
                </button>
              )}
            </div>
          </div>

          {/* Row 2: advanced filters */}
          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div key="filters"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}>
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <MultiSelect
                    placeholder="Estado"
                    options={ESTADO_OPTS}
                    selected={estados}
                    onChange={setEstados}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Status tabs */}
        <div className="flex gap-0 border-b border-warm-100 bg-white px-5">
          {STATUS_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveStatus(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                activeStatus === id
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-warm-400 hover:text-warm-600'
              }`}
            >
              {label}
              <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${
                activeStatus === id ? 'bg-primary-100 text-primary-700' : 'bg-warm-100 text-warm-500'
              }`}>
                {statusCounts[id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4">
          <motion.div className="card overflow-hidden"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            {isLoading ? (
              <div className="py-14 text-center text-sm text-warm-400">Cargando...</div>
            ) : salidas.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-warm-300">
                <ArrowRightFromLine className="w-10 h-10" />
                <p className="text-sm">Sin órdenes de salida</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header">Código</th>
                        <th className="table-header">Fecha</th>
                        <th className="table-header">Responsable</th>
                        <th className="table-header">Ref. externa</th>
                        <th className="table-header text-center">Líneas</th>
                        <th className="table-header text-center">Estado</th>
                        <th className="table-header text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {paginatedSalidas.map(row => (
                        <tr key={row.id}
                          className="hover:bg-gradient-to-r hover:from-primary-50/40 hover:to-transparent cursor-pointer transition-all duration-150 group border-b border-warm-50"
                          onClick={() => navigate(`/devoluciones/salidas/${row.id}`)}>
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-semibold text-warm-700">{row.codigo}</span>
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
                          <td className="table-cell text-xs font-mono text-warm-500">{row.referencia || <span className="text-warm-300">—</span>}</td>
                          <td className="table-cell text-center font-bold text-warm-700">{row.lineas_count ?? row.total_lineas ?? '—'}</td>
                          <td className="table-cell text-center">
                            <span className={`badge text-[10px] ${ESTADO_COLORS[row.estado] || 'bg-warm-100 text-warm-600'}`}>
                              {ESTADO_LABELS[row.estado] || row.estado}
                            </span>
                          </td>
                          <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigate(`/devoluciones/salidas/${row.id}`)}
                                title="Ver detalle"
                                className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => navigate(`/devoluciones/salidas/${row.id}?print=1`)}
                                title="Imprimir hoja de surtido"
                                className="p-2 rounded-xl hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all">
                                <Printer className="w-4 h-4" />
                              </button>
                              {row.estado === 'completado' && (
                                <button onClick={e => exportExcel(row, e)}
                                  title="Exportar Excel"
                                  className="p-2 rounded-xl hover:bg-success-50 text-warm-400 hover:text-success-600 transition-all">
                                  <Download className="w-4 h-4" />
                                </button>
                              )}
                              {canEdit && row.estado === 'en_proceso' && (
                                <button
                                  onClick={e => { e.stopPropagation(); setCancelRow(row) }}
                                  title="Cancelar orden"
                                  className="p-2 rounded-xl hover:bg-warning-50 text-warm-400 hover:text-warning-700 transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && ['borrador', 'cancelado'].includes(row.estado) && (
                                <button
                                  onClick={e => { e.stopPropagation(); setDeleteRow(row) }}
                                  title="Eliminar orden"
                                  className="p-2 rounded-xl hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={safePage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={salidas.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="salidas"
                />
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Modal cancelar salida */}
      <Modal
        isOpen={!!cancelRow}
        onClose={() => setCancelRow(null)}
        title="Cancelar orden"
        icon={X}
        size="sm"
        footer={
          <>
            <button onClick={() => setCancelRow(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              No cancelar
            </button>
            <button
              onClick={() => cancelMutation.mutate(cancelRow.id)}
              disabled={cancelMutation.isPending}
              className="px-4 py-2 rounded-xl bg-warning-600 text-white text-sm font-semibold disabled:opacity-60">
              {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          ¿Cancelar la orden <span className="font-semibold font-mono text-warm-800">{cancelRow?.codigo}</span>?
          La orden quedará marcada como cancelada.
        </p>
      </Modal>

      <Modal
        isOpen={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        title="Eliminar orden"
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteRow(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              No eliminar
            </button>
            <button
              onClick={() => deleteMutation.mutate(deleteRow.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-xl bg-danger-600 text-white text-sm font-semibold disabled:opacity-60">
              {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-600">
          ¿Eliminar la orden <span className="font-semibold font-mono text-warm-800">{deleteRow?.codigo}</span>? Desaparecerá completamente.
        </p>
      </Modal>

      {/* Modal nueva salida */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)}
        title="Nueva orden de salida" icon={ArrowRightFromLine} size="sm">
        <div className="space-y-3 py-2">
          <p className="text-sm text-warm-600">Elige cómo crear la orden:</p>
          <div className="grid grid-cols-2 gap-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setShowNewModal(false); createMutation.mutate({ notas: '', items: [] }) }}
              disabled={createMutation.isPending}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-warm-200 hover:border-primary-400 hover:bg-primary-50 transition-all text-sm font-medium text-warm-700 disabled:opacity-60">
              <Plus className="w-7 h-7 text-primary-500" />
              Crear manualmente
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setShowNewModal(false); createMutation.mutate({ notas: '', items: [], _showImport: true }) }}
              disabled={createMutation.isPending}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-warm-200 hover:border-accent-400 hover:bg-accent-50 transition-all text-sm font-medium text-warm-700 disabled:opacity-60">
              <Upload className="w-7 h-7 text-accent-500" />
              Importar Excel
            </motion.button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
