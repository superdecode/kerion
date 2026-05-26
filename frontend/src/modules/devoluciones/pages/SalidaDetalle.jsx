import { useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Trash2, Download, Printer, X, AlertTriangle, Search,
  ArrowRightFromLine, PackageCheck,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import SalidaImportModal from '../components/SalidaImportModal'
import SurtidoConfirmModal from '../components/SurtidoConfirmModal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import {
  getSalida, updateSalida, completarSalida, cancelarSalida,
  downloadSalidaExcel, listInventario, importarSalida,
} from '../services/devolucionesService'
import { fmtDateTime } from '../../../core/utils/dateFormat'

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

export default function SalidaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const [showImport, setShowImport] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [invSearch, setInvSearch] = useState('')
  const [selectedInv, setSelectedInv] = useState(null)
  const [qty, setQty] = useState(1)
  const [deletingLineId, setDeletingLineId] = useState(null)
  const debounceRef = useRef(null)
  const [invQ, setInvQ] = useState('')

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

  const refresh = () => qc.invalidateQueries({ queryKey: ['dev-salida', id] })

  const updateMutation = useMutation({
    mutationFn: (payload) => updateSalida(id, payload),
    onSuccess: refresh,
    onError: () => toast.error('Error al actualizar salida'),
  })

  const completeMutation = useMutation({
    mutationFn: (surtidos) => completarSalida(id, { surtidos }),
    onSuccess: () => {
      refresh()
      qc.invalidateQueries({ queryKey: ['dev-inventario'] })
      toast.success('Salida completada')
      setShowConfirm(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al completar'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarSalida(id),
    onSuccess: () => { refresh(); toast.success('Salida cancelada') },
    onError: () => toast.error('Error al cancelar'),
  })

  const exportExcel = async () => {
    try {
      const blob = await downloadSalidaExcel(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${salida.codigo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Error al exportar') }
  }

  const handleInvSearch = (val) => {
    setInvSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setInvQ(val), 300)
  }

  const addLine = () => {
    if (!selectedInv) return
    const nextItems = [
      ...items.map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada })),
      { inventario_id: selectedInv.id, cantidad_solicitada: Number(qty) || 1 },
    ]
    updateMutation.mutate({ items: nextItems })
    setSelectedInv(null)
    setInvSearch('')
    setInvQ('')
    setQty(1)
  }

  const removeLine = (lineId) => {
    const nextItems = items
      .filter(it => it.id !== lineId)
      .map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada }))
    updateMutation.mutate({ items: nextItems })
    setDeletingLineId(null)
  }

  const handleImportRows = (encontrados) => {
    const nextItems = [
      ...items.map(it => ({ inventario_id: it.inventario_id, cantidad_solicitada: it.cantidad_solicitada })),
      ...encontrados.map(r => ({ inventario_id: r.inventario_id, cantidad_solicitada: r.cantidad_solicitada })),
    ]
    updateMutation.mutate({ items: nextItems }, {
      onSuccess: () => { setShowImport(false); toast.success('Líneas importadas') }
    })
  }

  const printSurtido = () => {
    window.print()
  }

  if (salidaQuery.isLoading) return <div className="p-8 text-sm text-warm-400">Cargando...</div>
  if (!salida) return <div className="p-8 text-sm text-warm-400">Orden no encontrada</div>

  return (
    <div className="flex flex-col h-full">
      <Header
        title={
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/devoluciones/salidas')} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-warm-800">{salida.codigo}</span>
              <span className={`badge text-xs ${ESTADO_COLORS[salida.estado]}`}>
                {ESTADO_LABELS[salida.estado]}
              </span>
            </div>
          </div>
        }
        subtitle={`${salida.responsable_nombre || ''} · ${fmtDateTime(salida.created_at)} · ${items.length} líneas`}
        actions={
          <div className="flex gap-2">
            {salida.estado === 'completado' && (
              <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50">
                <Download className="w-4 h-4" /> Excel
              </button>
            )}
            {items.length > 0 && ['pendiente', 'en_proceso', 'confirmado'].includes(salida.estado) && (
              <button onClick={printSurtido} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50">
                <Printer className="w-4 h-4" /> Imprimir lista
              </button>
            )}
            {isEditable && canCreate && (
              <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50">
                Importar Excel
              </button>
            )}
            {isEditable && canEdit && items.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold"
              >
                <PackageCheck className="w-4 h-4" /> Confirmar surtido
              </motion.button>
            )}
            {isEditable && canDelete && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-danger-200 text-danger-600 text-sm hover:bg-danger-50"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-hidden flex gap-0">
        {/* Panel izquierdo: agregar línea (solo borrador/pendiente) */}
        {isEditable && canCreate && (
          <div className="w-[36%] min-w-[280px] border-r border-warm-100 p-5 flex flex-col gap-4 overflow-y-auto">
            <div className="text-xs font-semibold text-warm-500 uppercase tracking-wide">Agregar línea</div>

            {/* Búsqueda inventario */}
            <div className="relative">
              <label className="block text-[11px] text-warm-500 mb-1">Buscar en inventario</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-warm-300" />
                <input
                  value={invSearch}
                  onChange={e => { handleInvSearch(e.target.value); setSelectedInv(null) }}
                  placeholder="SKU, código, embalaje..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
              </div>
              <AnimatePresence>
                {invOptions.length > 0 && !selectedInv && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl border border-warm-200 shadow-lg max-h-52 overflow-y-auto"
                  >
                    {invOptions.slice(0, 8).map(inv => (
                      <button
                        key={inv.id} type="button"
                        onClick={() => { setSelectedInv(inv); setInvSearch(inv.sku); setInvQ('') }}
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-50 border-b border-warm-50 last:border-0"
                      >
                        <div className="text-xs font-medium text-warm-800">{inv.sku}</div>
                        <div className="text-[11px] text-warm-400 flex gap-2 mt-0.5">
                          <span>{inv.codigo_trazabilidad}</span>
                          <span>·</span>
                          <span className="font-medium text-success-700">{inv.cantidad_disponible} disp.</span>
                          {inv.ubicacion_nombre && <><span>·</span><span>{inv.ubicacion_nombre}</span></>}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {selectedInv && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl bg-primary-50 border border-primary-100 p-3 text-xs space-y-1">
                <div className="font-medium text-warm-800">{selectedInv.sku}</div>
                <div className="text-warm-500">{selectedInv.descripcion}</div>
                <div className="flex gap-3 text-warm-500">
                  <span>Código: <span className="font-mono">{selectedInv.codigo_trazabilidad}</span></span>
                  <span>Disponible: <span className="font-medium text-success-700">{selectedInv.cantidad_disponible}</span></span>
                </div>
              </motion.div>
            )}

            <div>
              <label className="block text-[11px] text-warm-500 mb-1">Cantidad solicitada</label>
              <input
                type="number" min="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
                onFocus={e => e.target.select()}
                className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={addLine}
              disabled={!selectedInv || updateMutation.isPending}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Agregar línea
            </motion.button>
          </div>
        )}

        {/* Panel derecho: tabla de líneas */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3 border-b border-warm-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
              Líneas de salida ({items.length})
            </span>
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-warm-300">
              <ArrowRightFromLine className="w-10 h-10 mb-3" />
              <p className="text-sm">Sin líneas — agrega items del inventario</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/50">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Descripción</th>
                  <th className="px-4 py-2.5">Ubicación</th>
                  <th className="px-4 py-2.5 text-right">Solicitada</th>
                  {salida.estado === 'completado' && <th className="px-4 py-2.5 text-right">Surtida</th>}
                  {salida.estado === 'completado' && <th className="px-4 py-2.5">Surtido</th>}
                  {isEditable && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr key={row.id} className="border-b border-warm-50 hover:bg-warm-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-warm-600">{row.codigo_trazabilidad || '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-warm-800">{row.sku}</td>
                    <td className="px-4 py-2.5 text-xs text-warm-600">{row.descripcion || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-warm-500">{row.ubicacion_nombre || row.ubicacion_codigo || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-medium text-warm-800">{row.cantidad_solicitada}</td>
                    {salida.estado === 'completado' && (
                      <td className="px-4 py-2.5 text-right text-xs font-medium text-warm-800">{row.cantidad_surtida ?? '—'}</td>
                    )}
                    {salida.estado === 'completado' && (
                      <td className="px-4 py-2.5">
                        <span className={`badge text-[10px] ${row.surtido ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-600'}`}>
                          {row.surtido ? 'Sí' : 'No'}
                        </span>
                      </td>
                    )}
                    {isEditable && (
                      <td className="px-4 py-2.5 text-right">
                        {canDelete && (
                          <button onClick={() => setDeletingLineId(row.id)} className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: eliminar línea */}
      <Modal
        isOpen={!!deletingLineId}
        onClose={() => setDeletingLineId(null)}
        title="Eliminar línea"
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeletingLineId(null)} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">Cancelar</button>
            <button onClick={() => removeLine(deletingLineId)} disabled={updateMutation.isPending} className="px-4 py-2 rounded-xl bg-danger-600 text-white text-sm font-semibold disabled:opacity-60">
              {updateMutation.isPending ? '...' : 'Eliminar'}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-700">¿Eliminar esta línea de la orden?</p>
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
        onConfirm={(surtidos) => completeMutation.mutate(surtidos)}
        saving={completeMutation.isPending}
      />
    </div>
  )
}
