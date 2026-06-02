import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Copy, Check, Download, PackageCheck,
  Search, X, ChevronDown, ChevronUp, Filter, Clock, Eye, Trash2, AlertTriangle,
} from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import Header from '../../../core/components/layout/Header'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { createEntrada, listEntradas, downloadEntradaExcel, cancelEntrada, deleteEntrada } from '../services/devolucionesService'
import { fmtDate, fmtTimeShort, getToday, subtractDays } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  borrador:   'bg-warm-100 text-warm-600',
  en_proceso: 'bg-warning-100 text-warning-700',
  confirmado: 'bg-success-100 text-success-700',
  cancelado:  'bg-danger-100 text-danger-700',
}
const ESTADO_LABELS = {
  borrador:   'Borrador',
  en_proceso: 'En proceso',
  confirmado: 'Confirmado',
  cancelado:  'Cancelado',
}

const STATUS_TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'borrador', label: 'Borrador' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'confirmado', label: 'Confirmado' },
  { id: 'cancelado', label: 'Cancelado' },
]

export default function Entradas() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const defaultEnd = getToday()
  const defaultStart = subtractDays(defaultEnd, 30)

  const [qInput, setQInput]   = useState('')
  const [qFilter, setQFilter] = useState('')
  const [estados, setEstados] = useState([])
  const [fechaDesde, setFechaDesde] = useState(defaultStart)
  const [fechaHasta, setFechaHasta] = useState(defaultEnd)
  const [showFilters, setShowFilters] = useState(true)
  const [copied, setCopied] = useState(null)
  const [activeStatus, setActiveStatus] = useState('todos')
  const [cancelRow, setCancelRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const debounceRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dev-entradas', qFilter, estados, fechaDesde, fechaHasta],
    queryFn: () => listEntradas({
      q: qFilter,
      estado: estados.join(','),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
    }),
  })

  const createMutation = useMutation({
    mutationFn: () => createEntrada({}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      navigate(`/devoluciones/entradas/${data.data?.id || data.sesion?.id || data.id}`)
    },
    onError: () => toast.error('Error al crear entrada'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelEntrada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      toast.success('Entrada cancelada')
      setCancelRow(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al cancelar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteEntrada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      toast.success('Entrada eliminada')
      setDeleteRow(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  })

  const handleQChange = (val) => {
    setQInput(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setQFilter(''); return }
    debounceRef.current = setTimeout(() => setQFilter(val.trim()), 300)
  }

  const clearFilters = () => {
    setQInput(''); setQFilter('')
    setEstados([])
    setFechaDesde(defaultStart)
    setFechaHasta(defaultEnd)
  }

  const copy = (codigo, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(codigo).then(() => {
      setCopied(codigo); setTimeout(() => setCopied(null), 2000)
    })
  }

  const exportExcel = async (row, e) => {
    e.stopPropagation()
    try {
      const blob = await downloadEntradaExcel(row.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${row.codigo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Error al exportar') }
  }

  const allSesiones = data?.data || data?.sesiones || []

  const statusCounts = useMemo(() => {
    const counts = { todos: allSesiones.length }
    STATUS_TABS.slice(1).forEach(({ id }) => {
      counts[id] = allSesiones.filter(s => s.estado === id).length
    })
    return counts
  }, [allSesiones])

  const sesiones = useMemo(() =>
    activeStatus === 'todos' ? allSesiones : allSesiones.filter(s => s.estado === activeStatus),
    [allSesiones, activeStatus]
  )
  const totalPages = Math.max(1, Math.ceil(sesiones.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedSesiones = useMemo(
    () => sesiones.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sesiones, safePage, pageSize]
  )

  useEffect(() => {
    setPage(1)
  }, [qFilter, estados, fechaDesde, fechaHasta, activeStatus, pageSize])

  const hasActiveFilters = !!(qFilter || estados.length)
  const canCreate = hasPermission('devoluciones.entradas', 'crear')
  const canEdit = hasPermission('devoluciones.entradas', 'actualizar')
  const canDelete = hasPermission('devoluciones.entradas', 'eliminar')

  return (
    <div className="flex flex-col h-full">
      <Header title="Entradas de devoluciones" subtitle="Registro y confirmación de mercancía devuelta" />

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
                placeholder="Buscar código, SKU..."
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
                <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                  className="btn-primary inline-flex items-center gap-2 hover:shadow-glow hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.97]">
                  {createMutation.isPending
                    ? <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    : <Plus className="w-4 h-4" />
                  }
                  {createMutation.isPending ? 'Creando...' : 'Nueva entrada'}
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
                    options={Object.entries(ESTADO_LABELS).map(([value, label]) => ({ value, label }))}
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
            ) : sesiones.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-warm-300">
                <PackageCheck className="w-10 h-10" />
                <p className="text-sm">Sin entradas registradas</p>
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
                        <th className="table-header text-center">Items</th>
                        <th className="table-header text-center">Estado</th>
                        <th className="table-header text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {paginatedSesiones.map(row => (
                        <tr key={row.id}
                          className="hover:bg-gradient-to-r hover:from-primary-50/40 hover:to-transparent cursor-pointer transition-all duration-150 group border-b border-warm-50"
                          onClick={() => navigate(`/devoluciones/entradas/${row.id}`)}>
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
                          <td className="table-cell text-center font-bold text-warm-700">{row.items_count ?? row.total_items ?? '—'}</td>
                          <td className="table-cell text-center">
                            <span className={`badge text-[10px] ${ESTADO_COLORS[row.estado] || 'bg-warm-100 text-warm-600'}`}>
                              {ESTADO_LABELS[row.estado] || row.estado}
                            </span>
                          </td>
                          <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigate(`/devoluciones/entradas/${row.id}`)}
                                title="Ver detalle"
                                className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all">
                                <Eye className="w-4 h-4" />
                              </button>
                              {row.estado === 'confirmado' && (
                                <button onClick={e => exportExcel(row, e)}
                                  title="Exportar Excel"
                                  className="p-2 rounded-xl hover:bg-success-50 text-warm-400 hover:text-success-600 transition-all">
                                  <Download className="w-4 h-4" />
                                </button>
                              )}
                              {canEdit && row.estado === 'en_proceso' && (
                                <button
                                  onClick={e => { e.stopPropagation(); setCancelRow(row) }}
                                  title="Cancelar entrada"
                                  className="p-2 rounded-xl hover:bg-warning-50 text-warm-400 hover:text-warning-700 transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && ['borrador', 'cancelado'].includes(row.estado) && (
                                <button
                                  onClick={e => { e.stopPropagation(); setDeleteRow(row) }}
                                  title="Eliminar entrada"
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
                  totalItems={sesiones.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="entradas"
                />
              </>
            )}
          </motion.div>
        </div>
      </div>

      <Modal
        isOpen={!!cancelRow}
        onClose={() => setCancelRow(null)}
        title="Cancelar entrada"
        icon={X}
        size="sm"
        footer={
          <>
            <button onClick={() => setCancelRow(null)} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
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
          ¿Cancelar la entrada <span className="font-semibold font-mono text-warm-800">{cancelRow?.codigo}</span>?
        </p>
      </Modal>

      <Modal
        isOpen={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        title="Eliminar entrada"
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteRow(null)} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
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
          ¿Eliminar la entrada <span className="font-semibold font-mono text-warm-800">{deleteRow?.codigo}</span>? Desaparecerá completamente.
        </p>
      </Modal>
    </div>
  )
}
