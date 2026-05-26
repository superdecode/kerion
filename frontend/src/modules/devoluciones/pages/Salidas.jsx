import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Upload, ArrowRightFromLine } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { createSalida, listSalidas } from '../services/devolucionesService'
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
const ESTADOS = Object.keys(ESTADO_LABELS)

export default function Salidas() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()
  const [estados, setEstados] = useState([])
  const [showNewModal, setShowNewModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['dev-salidas', estados],
    queryFn: () => listSalidas({ estado: estados.join(',') }),
  })

  const createMutation = useMutation({
    mutationFn: (payload) => createSalida(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dev-salidas'] })
      const salidaId = res.data?.id || res.salida?.id || res.id
      navigate(`/devoluciones/salidas/${salidaId}`)
    },
    onError: () => toast.error('Error al crear salida'),
  })

  const toggleEstado = (e) => {
    setEstados(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])
  }

  const salidas = data?.data || data?.salidas || []

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Órdenes de salida"
        subtitle="Surtido y descarga de inventario de devoluciones"
        actions={
          hasPermission('devoluciones.salidas', 'crear') && (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nueva salida
            </motion.button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Filtro chips estado */}
        <div className="bg-white rounded-2xl border border-warm-100 p-4">
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map(e => (
              <button
                key={e}
                onClick={() => toggleEstado(e)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  estados.includes(e)
                    ? `${ESTADO_COLORS[e]} border-transparent`
                    : 'bg-white border-warm-200 text-warm-600 hover:border-warm-300'
                }`}
              >
                {ESTADO_LABELS[e]}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-2xl border border-warm-100 overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-warm-400">Cargando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/50">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Líneas</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {salidas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-warm-400">
                      <ArrowRightFromLine className="w-8 h-8 mx-auto mb-2 text-warm-300" />
                      Sin órdenes de salida
                    </td>
                  </tr>
                ) : salidas.map(row => (
                  <tr
                    key={row.id}
                    className="border-b border-warm-50 hover:bg-primary-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/devoluciones/salidas/${row.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-warm-800">{row.codigo}</td>
                    <td className="px-4 py-3 text-warm-600">{fmtDateTime(row.created_at)}</td>
                    <td className="px-4 py-3 text-warm-700">{row.responsable_nombre || '—'}</td>
                    <td className="px-4 py-3 text-warm-600">{row.lineas_count ?? row.total_lineas ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${ESTADO_COLORS[row.estado] || 'bg-warm-100 text-warm-600'}`}>
                        {ESTADO_LABELS[row.estado] || row.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: nueva salida — elegir modo */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Nueva orden de salida"
        icon={ArrowRightFromLine}
        size="sm"
      >
        <div className="space-y-3 py-2">
          <p className="text-sm text-warm-600">Elige cómo crear la orden:</p>
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => {
                setShowNewModal(false)
                createMutation.mutate({ notas: '', items: [] })
              }}
              disabled={createMutation.isPending}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-warm-200 hover:border-primary-400 hover:bg-primary-50 transition-all text-sm font-medium text-warm-700 disabled:opacity-60"
            >
              <Plus className="w-7 h-7 text-primary-500" />
              Crear manualmente
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => {
                setShowNewModal(false)
                createMutation.mutate({ notas: '', items: [], _showImport: true })
              }}
              disabled={createMutation.isPending}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-warm-200 hover:border-accent-400 hover:bg-accent-50 transition-all text-sm font-medium text-warm-700 disabled:opacity-60"
            >
              <Upload className="w-7 h-7 text-accent-500" />
              Importar Excel
            </motion.button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
