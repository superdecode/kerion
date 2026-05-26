import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Download, Package, PackageCheck,
  Pencil, Trash2, ChevronDown, AlertTriangle, X, Boxes
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import EntradaFormItem from '../components/EntradaFormItem'
import {
  confirmEntrada, cancelEntrada, createEntradaItem, updateEntradaItem,
  deleteEntradaItem, downloadEntradaExcel, getEntrada,
} from '../services/devolucionesService'
import { fmtDateTime } from '../../../core/utils/dateFormat'

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

export default function EntradaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const [copied, setCopied] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [deletingItemId, setDeletingItemId] = useState(null)
  const [showConfirmPanel, setShowConfirmPanel] = useState(false)
  const [expandedRow, setExpandedRow] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dev-entrada', id],
    queryFn: () => getEntrada(id),
  })

  const sesion = data?.data?.sesion || data?.sesion
  const items = data?.data?.items || sesion?.items || []
  const isEditable = sesion && !['confirmado', 'cancelado'].includes(sesion.estado)
  const canEdit = hasPermission('devoluciones.entradas', 'actualizar')
  const canCreate = hasPermission('devoluciones.entradas', 'crear')
  const canDelete = hasPermission('devoluciones.entradas', 'eliminar')

  const refresh = () => qc.invalidateQueries({ queryKey: ['dev-entrada', id] })

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
      setShowConfirmPanel(false)
      toast.success('Entrada confirmada — items en inventario')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al confirmar'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelEntrada(id),
    onSuccess: () => { refresh(); toast.success('Entrada cancelada') },
    onError: () => toast.error('Error al cancelar'),
  })

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text)
      setTimeout(() => setCopied(null), 2000)
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

  const handleSaveAndAdd = useCallback((payload, onDone) => {
    addItemMutation.mutate(payload, { onSuccess: () => { onDone?.(); refresh() } })
  }, [id])

  const totalPiezas = items.reduce((acc, it) => acc + (it.skus || []).reduce((a, s) => a + Number(s.cantidad || 0), 0), 0)

  if (isLoading) return <div className="p-8 text-sm text-warm-400">Cargando...</div>
  if (!sesion) return <div className="p-8 text-sm text-warm-400">Entrada no encontrada</div>

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
        subtitle={`${sesion.responsable_nombre || ''} · ${fmtDateTime(sesion.created_at)} · ${items.length} items · ${totalPiezas} piezas`}
        actions={
          <div className="flex gap-2">
            {sesion.estado === 'confirmado' && (
              <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50">
                <Download className="w-4 h-4" /> Excel
              </button>
            )}
            {isEditable && canEdit && items.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowConfirmPanel(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold shadow-sm"
              >
                <PackageCheck className="w-4 h-4" /> Confirmar sesión
              </motion.button>
            )}
            {isEditable && canDelete && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-danger-200 text-danger-600 text-sm hover:bg-danger-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
            )}
          </div>
        }
      />

      {/* Confirm panel inline */}
      <AnimatePresence>
        {showConfirmPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-success-200 bg-success-50"
          >
            <div className="px-6 py-4 flex items-start justify-between gap-6">
              <div>
                <div className="text-sm font-semibold text-success-800 mb-1">Confirmar entrada — resumen</div>
                <div className="text-xs text-success-700 space-y-0.5">
                  <div>{items.length} items registrados · {totalPiezas} piezas totales</div>
                  <div>Todos los items pasarán al inventario activo. Esta acción no se puede deshacer.</div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setShowConfirmPanel(false)} className="px-3 py-2 rounded-xl border border-success-300 text-sm text-success-700 hover:bg-success-100">
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content: 40% form left / 60% table right */}
      <div className="flex-1 overflow-hidden flex gap-0">

        {/* PANEL IZQUIERDO — Formulario de registro (40%) */}
        {isEditable && !showConfirmPanel && (
          <div className="w-[40%] min-w-[320px] border-r border-warm-100 flex flex-col overflow-y-auto p-5">
            <div className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-3">
              {editingItem ? 'Editar item' : 'Registrar nuevo item'}
            </div>
            <EntradaFormItem
              key={editingItem?.id || 'new'}
              initialValue={editingItem ? {
                embalaje1: editingItem.embalaje1 || '',
                embalaje2: editingItem.embalaje2 || '',
                descripcion: editingItem.descripcion || '',
                peso: editingItem.peso || '',
                largo: editingItem.largo || '',
                ancho: editingItem.ancho || '',
                alto: editingItem.alto || '',
                multicaja: editingItem.multicaja || false,
                es_danado: editingItem.es_danado || false,
                notas: editingItem.notas || '',
                skus: editingItem.skus?.length ? editingItem.skus : [{ sku: '', sku2: '', descripcion: '', cantidad: 1 }],
              } : null}
              saving={addItemMutation.isPending || editItemMutation.isPending}
              onSubmit={(payload) => {
                if (editingItem) {
                  editItemMutation.mutate({ itemId: editingItem.id, payload })
                } else {
                  addItemMutation.mutate(payload)
                }
              }}
              onSaveAndAdd={!editingItem ? handleSaveAndAdd : null}
              onCancel={editingItem ? () => setEditingItem(null) : undefined}
            />
          </div>
        )}

        {/* PANEL DERECHO — Tabla de items (60%) */}
        <div className="flex-1 overflow-y-auto">
          {/* Sesión confirmada: solo lectura */}
          {sesion.estado === 'confirmado' && (
            <div className="px-5 py-3 bg-success-50 border-b border-success-100 flex items-center gap-2 text-xs text-success-700">
              <PackageCheck className="w-4 h-4" />
              Sesión confirmada — {items.length} items en inventario activo
            </div>
          )}

          <div className="px-5 py-3 border-b border-warm-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
              Items registrados ({items.length})
            </span>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-warm-300">
              <Boxes className="w-10 h-10 mb-3" />
              <p className="text-sm">Sin items — usa el formulario para registrar</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/50">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Embalaje 1</th>
                  <th className="px-4 py-2.5">SKU(s)</th>
                  <th className="px-4 py-2.5">Cant.</th>
                  <th className="px-4 py-2.5">Flags</th>
                  {isEditable && <th className="px-4 py-2.5 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <>
                    <tr
                      key={item.id}
                      className="border-b border-warm-50 hover:bg-warm-50/60 cursor-pointer transition-colors"
                      onClick={() => setExpandedRow(r => r === item.id ? null : item.id)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-warm-700">{item.codigo_trazabilidad}</span>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); copy(item.codigo_trazabilidad) }}
                            className="text-warm-300 hover:text-primary-500"
                          >
                            {copied === item.codigo_trazabilidad ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-warm-600">
                        <div>{item.embalaje1 || '—'}</div>
                        {item.embalaje2 && <div className="text-warm-400">{item.embalaje2}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-warm-700">
                        {(item.skus || []).map(s => s.sku).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-warm-800">
                        {(item.skus || []).reduce((a, s) => a + Number(s.cantidad || 0), 0)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          {item.multicaja && <span className="badge text-[10px] bg-accent-100 text-accent-700">Multicaja</span>}
                          {item.es_danado && <span className="badge text-[10px] bg-danger-100 text-danger-600">Dañado</span>}
                        </div>
                      </td>
                      {isEditable && (
                        <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <button onClick={() => setEditingItem(item)} className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setDeletingItemId(item.id)} className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* Fila expandida */}
                    {expandedRow === item.id && (
                      <tr key={`${item.id}-exp`} className="bg-warm-50/50 border-b border-warm-100">
                        <td colSpan={isEditable ? 6 : 5} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-warm-600">
                            {item.peso && <div><span className="text-warm-400">Peso:</span> {item.peso} kg</div>}
                            {item.largo && <div><span className="text-warm-400">Dim:</span> {item.largo}×{item.ancho}×{item.alto} cm</div>}
                            {item.notas && <div className="col-span-2"><span className="text-warm-400">Notas:</span> {item.notas}</div>}
                            {item.skus?.length > 1 && (
                              <div className="col-span-2">
                                <span className="text-warm-400">SKUs:</span>
                                {item.skus.map((s, i) => (
                                  <span key={i} className="ml-2">{s.sku} ×{s.cantidad}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal confirmación de eliminar */}
      <Modal
        isOpen={!!deletingItemId}
        onClose={() => setDeletingItemId(null)}
        title="Eliminar item"
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeletingItemId(null)} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">Cancelar</button>
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
    </div>
  )
}
