import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Copy, Check, Download, PackageCheck } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { createEntrada, listEntradas, downloadEntradaExcel } from '../services/devolucionesService'
import { fmtDateTime } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  borrador:    'bg-warm-100 text-warm-600',
  en_proceso:  'bg-warning-100 text-warning-700',
  confirmado:  'bg-success-100 text-success-700',
  cancelado:   'bg-danger-100 text-danger-700',
}
const ESTADO_LABELS = {
  borrador:   'Borrador',
  en_proceso: 'En proceso',
  confirmado: 'Confirmado',
  cancelado:  'Cancelado',
}
const ESTADOS = Object.keys(ESTADO_LABELS)

export default function Entradas() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()
  const [q, setQ] = useState('')
  const [estados, setEstados] = useState([])
  const [copied, setCopied] = useState(null)
  const debounceRef = useRef(null)

  const [filters, setFilters] = useState({ q: '', estados: [] })

  const { data, isLoading } = useQuery({
    queryKey: ['dev-entradas', filters],
    queryFn: () => listEntradas({ q: filters.q, estado: filters.estados.join(',') }),
  })

  const createMutation = useMutation({
    mutationFn: () => createEntrada({}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dev-entradas'] })
      navigate(`/devoluciones/entradas/${data.data?.id || data.sesion?.id || data.id}`)
    },
    onError: () => toast.error('Error al crear entrada'),
  })

  const handleQChange = (val) => {
    setQ(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setFilters(f => ({ ...f, q: val })), 300)
  }

  const toggleEstado = (e) => {
    const next = estados.includes(e) ? estados.filter(x => x !== e) : [...estados, e]
    setEstados(next)
    setFilters(f => ({ ...f, estados: next }))
  }

  const copy = (codigo, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(codigo).then(() => {
      setCopied(codigo)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const exportExcel = async (row, e) => {
    e.stopPropagation()
    try {
      const blob = await downloadEntradaExcel(row.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${row.codigo}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al exportar')
    }
  }

  const sesiones = data?.data || data?.sesiones || []

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Entradas de devoluciones"
        subtitle="Registro y confirmación de mercancía devuelta"
        actions={
          hasPermission('devoluciones.entradas', 'crear') && (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold shadow-sm disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              {createMutation.isPending ? 'Creando...' : 'Nueva entrada'}
            </motion.button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-warm-100 p-4 space-y-3">
          <input
            value={q}
            onChange={e => handleQChange(e.target.value)}
            placeholder="Buscar por código, embalaje, SKU..."
            className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
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
            <div className="px-4 py-12 text-center text-sm text-warm-400">Cargando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/50">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sesiones.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-warm-400">
                      <PackageCheck className="w-8 h-8 mx-auto mb-2 text-warm-300" />
                      Sin entradas registradas
                    </td>
                  </tr>
                ) : sesiones.map(row => (
                  <tr
                    key={row.id}
                    className="border-b border-warm-50 hover:bg-primary-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/devoluciones/entradas/${row.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-warm-800">{row.codigo}</span>
                        <button
                          onClick={e => copy(row.codigo, e)}
                          className="text-warm-300 hover:text-primary-500 transition-colors"
                        >
                          {copied === row.codigo ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-warm-600">{fmtDateTime(row.created_at)}</td>
                    <td className="px-4 py-3 text-warm-700">{row.responsable_nombre || '—'}</td>
                    <td className="px-4 py-3 text-warm-600">{row.items_count ?? row.total_items ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${ESTADO_COLORS[row.estado] || 'bg-warm-100 text-warm-600'}`}>
                        {ESTADO_LABELS[row.estado] || row.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.estado === 'confirmado' && (
                        <button
                          onClick={e => exportExcel(row, e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs text-warm-700 hover:bg-warm-50 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Excel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
