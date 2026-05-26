import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Copy, Check, ArrowLeftRight, ClipboardList, Boxes } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import AjusteModal from '../components/AjusteModal'
import InventarioUbicacionesModal from '../components/InventarioUbicacionesModal'
import {
  listInventario, listMovimientos, listUbicaciones, createAjuste,
} from '../services/devolucionesService'
import { fmtDateTime, fmtDate } from '../../../core/utils/dateFormat'

const TIPO_COLORS = {
  entrada:  'bg-success-100 text-success-700',
  salida:   'bg-danger-100 text-danger-600',
  ajuste:   'bg-warning-100 text-warning-700',
  traslado: 'bg-accent-100 text-accent-700',
}

export default function Inventario() {
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const [tab, setTab] = useState('actual')
  const [q, setQ] = useState('')
  const [historialTipo, setHistorialTipo] = useState('')
  const [copied, setCopied] = useState(null)
  const [showUbicaciones, setShowUbicaciones] = useState(false)
  const [showAjuste, setShowAjuste] = useState(false)
  const [ajusteTipo, setAjusteTipo] = useState('ajuste')
  const debounceRef = useRef(null)
  const [qFilter, setQFilter] = useState('')

  const inventarioQuery = useQuery({
    queryKey: ['dev-inventario', qFilter],
    queryFn: () => listInventario({ q: qFilter }),
  })
  const historialQuery = useQuery({
    queryKey: ['dev-movimientos', historialTipo],
    queryFn: () => listMovimientos(historialTipo ? { tipo: historialTipo } : {}),
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
    setQ(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQFilter(val), 300)
  }

  const inventario = inventarioQuery.data?.data || inventarioQuery.data?.inventario || []
  const movimientos = historialQuery.data?.data || historialQuery.data?.movimientos || []
  const ubicaciones = ubicacionesQuery.data?.data || ubicacionesQuery.data?.ubicaciones || []

  const tabs = [
    { id: 'actual', label: 'Inventario activo' },
    { id: 'historial', label: 'Historial de movimientos' },
  ]

  const canManage = hasPermission('devoluciones.inventario', 'actualizar')
  const canCreate = hasPermission('devoluciones.inventario', 'crear')

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Inventario de devoluciones"
        subtitle="Stock activo e historial de movimientos"
        actions={
          <div className="flex gap-2">
            {canManage && (
              <button
                onClick={() => setShowUbicaciones(true)}
                className="px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50"
              >
                Ubicaciones
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => { setAjusteTipo('movimiento'); setShowAjuste(true) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50"
              >
                <ArrowLeftRight className="w-4 h-4" /> Mover mercancía
              </button>
            )}
            {canCreate && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setAjusteTipo('ajuste'); setShowAjuste(true) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold shadow-sm"
              >
                <ClipboardList className="w-4 h-4" /> Inventario físico
              </motion.button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id ? 'bg-primary-600 text-white shadow-sm' : 'bg-white border border-warm-200 text-warm-700 hover:bg-warm-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Inventario actual */}
        {tab === 'actual' && (
          <div className="space-y-3">
            <input
              value={q}
              onChange={e => handleQChange(e.target.value)}
              placeholder="Buscar por SKU, embalaje, descripción, código..."
              className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
            <div className="bg-white rounded-2xl border border-warm-100 overflow-hidden">
              {inventarioQuery.isLoading ? (
                <div className="py-10 text-center text-sm text-warm-400">Cargando inventario...</div>
              ) : inventario.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-warm-300">
                  <Boxes className="w-10 h-10 mb-3" />
                  <p className="text-sm">Sin inventario disponible</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/50">
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Descripción</th>
                      <th className="px-4 py-3">Embalaje 1</th>
                      <th className="px-4 py-3">Ubicación</th>
                      <th className="px-4 py-3 text-right">Disponible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventario.map(row => (
                      <tr key={row.id} className="border-b border-warm-50 hover:bg-warm-50/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-warm-700">{row.codigo_trazabilidad}</span>
                            <button onClick={() => copy(row.codigo_trazabilidad)} className="text-warm-300 hover:text-primary-500">
                              {copied === row.codigo_trazabilidad ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-warm-800">
                          {row.sku}{row.sku2 ? <span className="text-warm-400 ml-1">/ {row.sku2}</span> : ''}
                        </td>
                        <td className="px-4 py-3 text-xs text-warm-600">{row.descripcion || '—'}</td>
                        <td className="px-4 py-3 text-xs text-warm-600">{row.embalaje1 || '—'}</td>
                        <td className="px-4 py-3 text-xs text-warm-600">{row.ubicacion_nombre || row.ubicacion_codigo || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-warm-800">{row.cantidad_disponible}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab: Historial */}
        {tab === 'historial' && (
          <div className="space-y-3">
            {/* Filtros tipo */}
            <div className="flex flex-wrap gap-2">
              {['', 'entrada', 'salida', 'ajuste', 'traslado'].map(tipo => (
                <button
                  key={tipo}
                  onClick={() => setHistorialTipo(tipo)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    historialTipo === tipo
                      ? tipo
                        ? `${TIPO_COLORS[tipo]} border-transparent`
                        : 'bg-warm-700 text-white border-transparent'
                      : 'bg-white border-warm-200 text-warm-600 hover:border-warm-300'
                  }`}
                >
                  {tipo || 'Todos'}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-warm-100 overflow-hidden">
              {historialQuery.isLoading ? (
                <div className="py-10 text-center text-sm text-warm-400">Cargando historial...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/50">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Cantidad</th>
                      <th className="px-4 py-3">Ubicación</th>
                      <th className="px-4 py-3">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-warm-400">Sin movimientos</td></tr>
                    ) : movimientos.map(row => (
                      <tr key={row.id} className="border-b border-warm-50 hover:bg-warm-50/40 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-warm-500">{fmtDateTime(row.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`badge text-[10px] ${TIPO_COLORS[row.tipo] || 'bg-warm-100 text-warm-600'}`}>
                            {row.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-warm-600">{row.codigo_trazabilidad || '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-warm-800">{row.sku || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-warm-600">
                          {row.tipo === 'traslado'
                            ? <span className="text-accent-700">Traslado</span>
                            : <>{row.cantidad_anterior} → <span className="font-medium">{row.cantidad_nueva}</span></>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-xs text-warm-500">
                          {row.ubicacion_anterior_codigo && row.ubicacion_nueva_codigo
                            ? `${row.ubicacion_anterior_codigo} → ${row.ubicacion_nueva_codigo}`
                            : row.ubicacion_nueva_codigo || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-warm-500">{row.usuario_nombre || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <InventarioUbicacionesModal
        isOpen={showUbicaciones}
        onClose={() => setShowUbicaciones(false)}
        ubicaciones={ubicaciones}
        onSaved={() => qc.invalidateQueries({ queryKey: ['dev-ubicaciones'] })}
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
    </div>
  )
}
