import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Crosshair, ArrowLeft, User, Package, MapPin, CheckCircle2,
  XCircle, Clock, Loader2, AlertTriangle, FileText, History,
  ChevronDown, Truck, Tag, Calendar,
} from 'lucide-react'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import {
  getRastreoDetalle, updateRastreoOrden, updateRastreaoCaja,
  deleteRastreoOrden, getRastreoUsuarios,
} from '../../../core/services/rastreoService'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'

const ESTADO_BADGE = {
  abierta: 'bg-blue-100 text-blue-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  resuelta: 'bg-green-100 text-green-700',
  cerrada: 'bg-warm-100 text-warm-500',
}

const CAJA_ESTADO_BADGE = {
  pendiente: 'bg-warm-100 text-warm-500',
  localizada: 'bg-green-100 text-green-700',
  no_encontrada: 'bg-red-100 text-red-600',
}

const CAJA_ESTADO_LABELS = {
  pendiente: 'Pendiente',
  localizada: 'Localizada',
  no_encontrada: 'No encontrada',
}

function InfoBlock({ icon: Icon, label, value, mono = false }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-warm-400 font-medium">{label}</span>
      <span className={`text-sm text-warm-800 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

function safeDate(raw) {
  if (!raw) return null
  try {
    const d = new Date(raw)
    if (isNaN(d)) return raw
    return d.toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return raw }
}

export default function RastreoDetalle() {
  const { folio } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const { t } = useI18nStore()

  const [activeTab, setActiveTab] = useState('cajas')
  const [editNotas, setEditNotas] = useState(false)
  const [notasValue, setNotasValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cajaConfirm, setCajaConfirm] = useState(null)

  const canEdit = hasPermission('inventario.rastreo', 'editar')
  const canDelete = hasPermission('inventario.rastreo', 'eliminar')

  const { data, isLoading, error } = useQuery({
    queryKey: ['rastreo-detalle', folio],
    queryFn: () => getRastreoDetalle(folio),
    onSuccess: d => {
      if (d?.data?.orden?.notas) setNotasValue(d.data.orden.notas)
    },
  })

  const { data: usersData } = useQuery({
    queryKey: ['rastreo-usuarios'],
    queryFn: () => getRastreoUsuarios(),
    staleTime: 5 * 60 * 1000,
  })
  const usuarios = usersData?.data || []

  const { data: outboundData } = useQuery({
    queryKey: ['outbound-detail', data?.data?.orden?.outbound_order_no],
    queryFn: () => getOutboundDetail(data.data.orden.outbound_order_no),
    enabled: !!data?.data?.orden?.outbound_order_no,
    staleTime: 10 * 60 * 1000,
  })

  const updateOrden = useMutation({
    mutationFn: ({ id, body }) => updateRastreoOrden(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] }),
  })

  const updateCajaMutation = useMutation({
    mutationFn: ({ id, body }) => updateRastreaoCaja(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setCajaConfirm(null)
    },
  })

  const deleteOrden = useMutation({
    mutationFn: (id) => deleteRastreoOrden(id),
    onSuccess: () => navigate('/Inventario/rastreo'),
  })

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  if (error || !data?.data) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle className="text-warm-300" size={32} />
      <p className="text-warm-500 text-sm">Orden no encontrada</p>
      <button onClick={() => navigate('/Inventario/rastreo')} className="btn btn-secondary text-xs">Volver</button>
    </div>
  )

  const { orden, cajas, historial } = data.data
  const od = outboundData?.data

  function handleEstadoChange(e) {
    updateOrden.mutate({ id: orden.id, body: { estado: e.target.value } })
  }

  function handleAsignadoChange(e) {
    updateOrden.mutate({ id: orden.id, body: { asignado_a: e.target.value || null } })
  }

  function saveNotas() {
    updateOrden.mutate({ id: orden.id, body: { notas: notasValue } })
    setEditNotas(false)
  }

  function handleCajaEstado(caja, nuevoEstado) {
    if (nuevoEstado === 'no_encontrada' && !caja.anormalidad_id) {
      setCajaConfirm({ caja, nuevoEstado })
      return
    }
    updateCajaMutation.mutate({ id: caja.id, body: { estado_caja: nuevoEstado } })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-warm-100">
        <button
          onClick={() => navigate('/Inventario/rastreo')}
          className="flex items-center gap-1.5 text-xs text-warm-400 hover:text-warm-700 mb-3 transition-colors"
        >
          <ArrowLeft size={13} />
          Órdenes de rastreo
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Crosshair size={18} className="text-primary-600 flex-shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-xl text-primary-700">{orden.folio}</span>
                <span className={`badge text-[11px] font-semibold ${ESTADO_BADGE[orden.estado] || ''}`}>
                  {orden.estado}
                </span>
              </div>
              {orden.outbound_order_no && (
                <p className="text-xs text-warm-500 mt-0.5 font-mono">{orden.outbound_order_no}</p>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <select
                className="input text-xs py-1.5"
                value={orden.estado}
                onChange={handleEstadoChange}
              >
                <option value="abierta">Abierta</option>
                <option value="en_proceso">En proceso</option>
                <option value="resuelta">Resuelta</option>
                <option value="cerrada">Cerrada</option>
              </select>
              <select
                className="input text-xs py-1.5"
                value={orden.asignado_a || ''}
                onChange={handleAsignadoChange}
              >
                <option value="">Sin asignar</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre_completo}</option>
                ))}
              </select>
              {canDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="btn text-xs py-1.5 text-red-500 border border-red-200 hover:bg-red-50"
                >
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Outbound summary */}
      {orden.outbound_order_no ? (
        <div className="mx-5 mt-4 rounded-xl border border-warm-200 bg-warm-50 p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-warm-400 mb-3">Resumen de orden de salida</p>
          {od ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
              <InfoBlock icon={User} label="Cliente" value={od.customerCode || od.customerName} />
              <InfoBlock icon={User} label="Receptor" value={od.receiverName} />
              <InfoBlock icon={Calendar} label="Fecha entrega" value={safeDate(od.outboundTime || od.expectedTime)} />
              <InfoBlock icon={Truck} label="Canal logístico" value={od.logisticsChannel} />
              <InfoBlock icon={Tag} label="Tracking" value={od.logisticsTrackNo || od.trackingNo} mono />
              <InfoBlock icon={Tag} label="Ref. externa" value={od.thirdOrderNo} mono />
              <InfoBlock icon={Package} label="Total cajas" value={od.outboundBoxCount ? String(od.outboundBoxCount) : null} />
              <InfoBlock icon={MapPin} label="Almacén" value={od.whCode} />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-warm-400">
              <Loader2 size={12} className="animate-spin" />
              Cargando datos de la orden...
            </div>
          )}
        </div>
      ) : (
        <div className="mx-5 mt-4 rounded-xl border border-warm-100 bg-warm-50 px-4 py-3">
          <p className="text-xs text-warm-400 italic">Rastreo sin orden de salida vinculada</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-warm-200 px-5 mt-4">
        {[
          { key: 'cajas', label: `Cajas (${cajas.length})`, icon: Package },
          { key: 'notas', label: 'Notas', icon: FileText },
          { key: 'historial', label: 'Historial', icon: History },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab.key
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-warm-400 hover:text-warm-700'}`}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === 'cajas' && (
          <div className="rounded-xl border border-warm-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                <tr>
                  <th className="table-header whitespace-nowrap"><span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500">Código</span></th>
                  <th className="table-header whitespace-nowrap"><span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500">Estado</span></th>
                  <th className="table-header whitespace-nowrap"><span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500">Ubicación</span></th>
                  <th className="table-header whitespace-nowrap"><span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500">Producto</span></th>
                  <th className="table-header whitespace-nowrap"><span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500">Validada Surtido</span></th>
                  <th className="table-header whitespace-nowrap"><span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500">Anormalidad</span></th>
                  {canEdit && <th className="table-header whitespace-nowrap"><span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500">Acción</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {cajas.map(c => (
                  <tr key={c.id} className="hover:bg-warm-50/40 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs text-warm-600">{c.box_code}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`badge text-[11px] font-semibold ${CAJA_ESTADO_BADGE[c.estado_caja] || ''}`}>
                        {CAJA_ESTADO_LABELS[c.estado_caja] || c.estado_caja}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-warm-600 font-mono">{c.ubicacion || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-warm-700 font-medium">{c.producto || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {c.validada_en_surtido
                        ? <CheckCircle2 size={14} className="text-green-500 mx-auto" />
                        : <XCircle size={14} className="text-warm-300 mx-auto" />}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.anormalidad_folio
                        ? <span className="font-mono text-xs text-red-600">{c.anormalidad_folio}</span>
                        : <span className="text-xs text-warm-300">—</span>}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2.5">
                        {c.estado_caja === 'pendiente' && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleCajaEstado(c, 'localizada')}
                              disabled={updateCajaMutation.isLoading}
                              className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                            >
                              Localizar
                            </button>
                            <button
                              onClick={() => handleCajaEstado(c, 'no_encontrada')}
                              disabled={updateCajaMutation.isLoading}
                              className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                            >
                              No encontrada
                            </button>
                          </div>
                        )}
                        {c.estado_caja !== 'pendiente' && (
                          <button
                            onClick={() => handleCajaEstado(c, 'pendiente')}
                            className="text-xs px-2 py-1 rounded border border-warm-200 text-warm-500 hover:bg-warm-50 transition-colors"
                          >
                            Reabrir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {cajas.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-xs text-warm-400">Sin cajas registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'notas' && (
          <div className="max-w-2xl">
            {editNotas ? (
              <div className="space-y-2">
                <textarea
                  className="input w-full min-h-[120px] text-sm resize-y"
                  value={notasValue}
                  onChange={e => setNotasValue(e.target.value)}
                  placeholder="Escribe notas sobre esta orden..."
                />
                <div className="flex gap-2">
                  <button onClick={saveNotas} className="btn btn-primary text-xs">Guardar</button>
                  <button onClick={() => setEditNotas(false)} className="btn btn-secondary text-xs">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-warm-200 p-4 bg-warm-50 min-h-[80px]">
                {orden.notas ? (
                  <p className="text-sm text-warm-700 whitespace-pre-wrap">{orden.notas}</p>
                ) : (
                  <p className="text-xs text-warm-400 italic">Sin notas</p>
                )}
                {canEdit && (
                  <button onClick={() => { setNotasValue(orden.notas || ''); setEditNotas(true) }} className="mt-3 text-xs text-primary-600 hover:underline">
                    Editar notas
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="max-w-2xl space-y-2">
            {historial.length === 0 && <p className="text-xs text-warm-400 py-4">Sin historial</p>}
            {historial.map(h => (
              <div key={h.id} className="flex gap-3 items-start">
                <div className="mt-1.5 w-2 h-2 rounded-full bg-warm-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-warm-700">{h.accion}</span>
                    {h.actor_nombre && (
                      <span className="text-xs text-warm-400">por {h.actor_nombre}</span>
                    )}
                    <span className="ml-auto text-[11px] text-warm-300">
                      {safeDate(h.created_at)}
                    </span>
                  </div>
                  {h.descripcion && <p className="text-xs text-warm-600 mt-0.5">{h.descripcion}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <AlertTriangle className="text-red-400 mb-3" size={28} />
            <h3 className="font-semibold text-warm-900 mb-1">¿Eliminar orden {orden.folio}?</h3>
            <p className="text-xs text-warm-500 mb-4">Esta acción no se puede deshacer. Se eliminarán las cajas y el historial.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary text-xs">Cancelar</button>
              <button onClick={() => deleteOrden.mutate(orden.id)} className="btn text-xs bg-red-600 text-white hover:bg-red-700">
                {deleteOrden.isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm no_encontrada dialog */}
      {cajaConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <AlertTriangle className="text-amber-400 mb-3" size={28} />
            <h3 className="font-semibold text-warm-900 mb-1">Confirmar: caja no encontrada</h3>
            <p className="text-xs text-warm-500 mb-1">
              Caja: <span className="font-mono font-semibold">{cajaConfirm.caja.box_code}</span>
            </p>
            <p className="text-xs text-warm-500 mb-4">
              Se generará automáticamente una anormalidad INV-07 para esta caja.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCajaConfirm(null)} className="btn btn-secondary text-xs">Cancelar</button>
              <button
                onClick={() => updateCajaMutation.mutate({ id: cajaConfirm.caja.id, body: { estado_caja: 'no_encontrada' } })}
                className="btn text-xs bg-red-600 text-white hover:bg-red-700 flex items-center gap-1.5"
              >
                {updateCajaMutation.isLoading && <Loader2 size={12} className="animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
