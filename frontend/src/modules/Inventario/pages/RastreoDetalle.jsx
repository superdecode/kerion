import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Crosshair, ArrowLeft, User, Package, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle, History, MessageSquare,
  Trash2, Search, X, ScanBarcode, ChevronUp, ChevronDown as ChevronDownIcon, Plus, Edit3, FileText,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import CopyableCell from '../../../core/components/common/CopyableCell'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import {
  getRastreoDetalle, updateRastreoOrden, updateRastreaoCaja,
  deleteRastreoOrden, getRastreoUsuarios, addCajaToOrden, deleteCaja,
} from '../../../core/services/rastreoService'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'
import RastreoSearchModal from '../components/RastreoSearchModal'

const ESTADO_META = {
  abierta:    { cls: 'bg-primary-100 text-primary-700 border-primary-200', dot: 'bg-primary-500', label: 'Abierta' },
  en_proceso: { cls: 'bg-warning-100 text-warning-700 border-warning-200', dot: 'bg-warning-500', label: 'En proceso' },
  resuelta:   { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Resuelta' },
  cerrada:    { cls: 'bg-warm-100 text-warm-500 border-warm-200',          dot: 'bg-warm-400',    label: 'Cerrada' },
}

const CAJA_META = {
  pendiente:     { cls: 'bg-warm-100 text-warm-600 border-warm-200',        dot: 'bg-warm-400',    label: 'Pendiente' },
  localizada:    { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Localizada' },
  no_encontrada: { cls: 'bg-danger-100 text-danger-700 border-danger-200',  dot: 'bg-danger-500',  label: 'No encontrada' },
  cancelada:     { cls: 'bg-warm-100 text-warm-400 border-warm-100',        dot: 'bg-warm-300',    label: 'Cancelada' },
}

const ACCION_LABELS = {
  creada:             'Orden creada',
  asignada:           'Asignada',
  estado_cambiado:    'Estado cambiado',
  caja_localizada:    'Caja localizada',
  caja_no_encontrada: 'Caja no encontrada',
  nota:               'Nota',
  resuelta:           'Resuelta',
}

const ACCION_DOT = {
  nota:               'bg-primary-400 ring-primary-200',
  caja_no_encontrada: 'bg-danger-400 ring-danger-200',
  caja_localizada:    'bg-success-400 ring-success-200',
  creada:             'bg-accent-400 ring-accent-200',
}

function EstadoChip({ estado }) {
  const meta = ESTADO_META[estado] || ESTADO_META.abierta
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function CajaChip({ estado }) {
  const meta = CAJA_META[estado] || CAJA_META.pendiente
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  )
}


function safeDate(raw) {
  if (!raw) return null
  try {
    const d = new Date(raw)
    return isNaN(d) ? raw : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return raw }
}

function elapsed(raw) {
  if (!raw) return null
  const h = Math.floor((Date.now() - new Date(raw)) / 3600000)
  return h < 24 ? `${h}h` : h < 720 ? `${Math.floor(h / 24)}d` : `${Math.floor(h / 720)}m`
}

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field
  return (
    <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider leading-none text-warm-500 hover:text-warm-700 transition-colors">
      {label}
      {active
        ? sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDownIcon size={11} />
        : <ChevronDownIcon size={11} className="opacity-30" />}
    </button>
  )
}

export default function RastreoDetalle() {
  const { folio } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const [activeTab, setActiveTab] = useState('cajas')
  const [newNota, setNewNota] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cajaConfirm, setCajaConfirm] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [cajaSearch, setCajaSearch] = useState('')
  const [cajaSort, setCajaSort] = useState({ field: null, dir: 'asc' })
  const [showAddCaja, setShowAddCaja] = useState(false)
  const [newCajaCode, setNewCajaCode] = useState('')
  const [cajaDeleteConfirm, setCajaDeleteConfirm] = useState(null)
  const [cajaNota, setCajaNota] = useState('')
  const [cajaNotaModal, setCajaNotaModal] = useState(null)
  const [cajaNotaText, setCajaNotaText] = useState('')

  const canEdit   = hasPermission('inventario.rastreo', 'editar')
  const canDelete = hasPermission('inventario.rastreo', 'eliminar')

  const { data, isLoading, error } = useQuery({
    queryKey: ['rastreo-detalle', folio],
    queryFn: () => getRastreoDetalle(folio),
  })

  const { data: usersData } = useQuery({
    queryKey: ['rastreo-usuarios'],
    queryFn: () => getRastreoUsuarios(),
    staleTime: 5 * 60 * 1000,
  })
  const usuarios = usersData?.data || []

  const { data: outboundData, isLoading: loadingObd } = useQuery({
    queryKey: ['outbound-detail', data?.data?.orden?.outbound_order_no],
    queryFn: () => getOutboundDetail(data.data.orden.outbound_order_no),
    enabled: !!data?.data?.orden?.outbound_order_no,
    staleTime: 10 * 60 * 1000,
  })

  const updateOrden = useMutation({
    mutationFn: ({ id, body }) => updateRastreoOrden(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] }),
    onError: () => toast.error('Error al actualizar la orden'),
  })

  const updateCajaMutation = useMutation({
    mutationFn: ({ id, body }) => updateRastreaoCaja(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setCajaConfirm(null)
      setCajaNota('')
    },
    onError: () => toast.error('Error al actualizar caja'),
  })

  const addCajaMutation = useMutation({
    mutationFn: ({ orden_id, box_code }) => addCajaToOrden(orden_id, { box_code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setNewCajaCode('')
      setShowAddCaja(false)
      toast.success('Caja agregada')
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Error al agregar caja'),
  })

  const deleteCajaMutation = useMutation({
    mutationFn: (id) => deleteCaja(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setCajaDeleteConfirm(null)
      toast.success('Caja eliminada')
    },
    onError: (err) => {
      if (err?.response?.status === 404) {
        qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
        setCajaDeleteConfirm(null)
        toast.error('La caja ya no existe en rastreo')
        return
      }
      toast.error(err?.response?.data?.error || 'Error al eliminar caja')
    },
  })

  const deleteOrden = useMutation({
    mutationFn: (id) => deleteRastreoOrden(id),
    onSuccess: () => {
      toast.success('Orden eliminada')
      navigate('/Inventario/rastreo')
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Error al eliminar la orden'),
  })

  const orden = data?.data?.orden || null
  const cajas = data?.data?.cajas || []
  const historial = data?.data?.historial || []
  const od = outboundData?.data
  const notas = historial.filter(h => h.accion === 'nota')

  const cajasStats = {
    total: cajas.length,
    localizadas: cajas.filter(c => c.estado_caja === 'localizada').length,
    no_encontradas: cajas.filter(c => c.estado_caja === 'no_encontrada').length,
  }

  function handleEstadoChange(e) {
    updateOrden.mutate({ id: orden.id, body: { estado: e.target.value } })
  }

  function handleResponsableChange(e) {
    updateOrden.mutate({ id: orden.id, body: { asignado_a: e.target.value || null } })
  }

  function submitNota() {
    if (!newNota.trim()) return
    updateOrden.mutate(
      { id: orden.id, body: { agregar_nota: newNota.trim() } },
      { onSuccess: () => setNewNota('') }
    )
  }

  function handleCajaEstado(caja, nuevoEstado) {
    if (nuevoEstado === 'no_encontrada') {
      setCajaConfirm({ caja, nuevoEstado })
      return
    }
    updateCajaMutation.mutate({ id: caja.id, body: { estado_caja: nuevoEstado } })
  }

  function confirmCajaNoEncontrada() {
    updateCajaMutation.mutate({
      id: cajaConfirm.caja.id,
      body: { estado_caja: 'no_encontrada', ...(cajaNota.trim() ? { nota: cajaNota.trim() } : {}) },
    })
  }

  function toggleSort(field) {
    setCajaSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' }
    )
  }

  const filteredCajas = useMemo(() => {
    let list = cajas
    if (cajaSearch.trim()) {
      const q = cajaSearch.trim().toLowerCase()
      list = list.filter(c =>
        c.box_code?.toLowerCase().includes(q) ||
        c.ubicacion?.toLowerCase().includes(q) ||
        c.producto?.toLowerCase().includes(q)
      )
    }
    if (cajaSort.field) {
      list = [...list].sort((a, b) => {
        const av = (a[cajaSort.field] ?? '').toString().toLowerCase()
        const bv = (b[cajaSort.field] ?? '').toString().toLowerCase()
        return cajaSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return list
  }, [cajas, cajaSearch, cajaSort])

  const tabs = [
    { key: 'cajas',    label: `Cajas (${cajas.length})`,   icon: Package },
    { key: 'notas',    label: `Notas (${notas.length})`,   icon: MessageSquare },
    { key: 'historial',label: 'Historial',                 icon: History },
  ]

  if (isLoading) return (
    <>
      <Header title="Rastreo" subtitle="Detalle de orden" />
      <div className="flex justify-center py-16"><LoadingSpinner /></div>
    </>
  )

  if (error || !orden) return (
    <>
      <Header title="Rastreo" subtitle="Detalle de orden" />
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="text-warm-300" size={32} />
        <p className="text-warm-500 text-sm">Orden no encontrada</p>
        <button onClick={() => navigate('/Inventario/rastreo')} className="btn btn-secondary text-xs">Volver</button>
      </div>
    </>
  )

  return (
    <>
      <Header
        title={orden.folio}
        subtitle="Orden de rastreo"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-all text-xs font-medium"
            >
              <Crosshair size={13} />
              Rastrear caja
            </button>
            {canDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="h-9 px-3 flex items-center gap-1.5 text-xs rounded-xl border border-danger-200 text-danger-600 hover:bg-danger-50 transition-colors"
              >
                <Trash2 size={13} />
                Eliminar
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-4">
          <button
            onClick={() => navigate('/Inventario/rastreo')}
            className="flex items-center gap-1.5 text-xs text-warm-400 hover:text-warm-700 mb-4 transition-colors"
          >
            <ArrowLeft size={13} />
            Órdenes de rastreo
          </button>
        </div>

        {/* Header card: integrated summary + order detail */}
        <div className="px-5 mb-4">
          <div className="overflow-hidden rounded-[28px] border border-warm-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_30%),linear-gradient(135deg,_rgba(255,255,255,0.99),_rgba(248,250,252,0.97))] shadow-[0_16px_44px_-34px_rgba(15,23,42,0.24)]">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_340px]">

              <div className="bg-white px-6 py-6 sm:px-7 sm:py-7">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-500">Informacion general</p>

                  <div className="mt-3 flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm text-primary-600">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">Orden de salida</p>
                      {orden.outbound_order_no ? (
                        <CopyableCell text={orden.outbound_order_no} className="mt-1 font-mono text-base font-black text-warm-900" />
                      ) : (
                        <span className="mt-1 block text-xs italic text-warm-400">Sin orden vinculada</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-warm-100 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm text-primary-600">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">Cajas rastreo</p>
                          <p className="mt-1 text-sm font-bold text-warm-800">{cajasStats.total}</p>
                          <p className="text-[10px] text-warm-400">{cajasStats.localizadas} loc. • {cajasStats.no_encontradas} NE</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-primary-100 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 shadow-sm text-primary-600">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-600/70">Cajas orden</p>
                          <p className="mt-1 text-sm font-bold text-warm-800">{od?.packageList?.length ?? '—'}</p>
                          <p className="text-[10px] text-warm-400">Cantidad declarada en la orden</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-primary-100 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm text-primary-600">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-600/70">Fecha</p>
                          <p className="mt-1 text-xs font-bold text-warm-800">
                            {new Date(orden.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          <p className="text-[10px] text-warm-400">Hace {elapsed(orden.created_at)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-warm-100 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)] sm:col-span-2 xl:col-span-1">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm text-primary-600">
                          <Crosshair className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">Pendientes</p>
                          <p className="mt-1 text-sm font-bold text-warm-800">{Math.max(cajasStats.total - cajasStats.localizadas - cajasStats.no_encontradas, 0)}</p>
                          <p className="text-[10px] text-warm-400">Cajas aun sin resolver</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {orden.outbound_order_no && (
                    <div className="mt-5 rounded-2xl border border-warm-100 bg-white p-4 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.18)]">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">
                        Resumen de orden de salida
                      </p>
                      {loadingObd ? (
                        <div className="flex items-center gap-2 text-xs text-warm-400">
                          <Loader2 size={12} className="animate-spin" />
                          Cargando datos...
                        </div>
                      ) : od ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                          {[
                            { label: 'Cliente', value: od.customerCode },
                            { label: 'Receptor', value: od.receiverName },
                            { label: 'Fecha entrega', value: safeDate(od.outboundTime || od.expectedTime) },
                            { label: 'Canal logístico', value: od.logisticsChannel },
                          ].filter(f => f.value).map(f => (
                            <div key={f.label} className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wider text-warm-400 font-medium">{f.label}</span>
                              <span className="text-xs text-warm-700 font-medium">{f.value}</span>
                            </div>
                          ))}
                          {(od.logisticsTrackNo || od.trackingNo) && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wider text-warm-400 font-medium">Tracking</span>
                              <CopyableCell text={od.logisticsTrackNo || od.trackingNo} className="font-mono text-xs text-warm-600" />
                            </div>
                          )}
                          {od.thirdOrderNo && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wider text-warm-400 font-medium">Ref. externa</span>
                              <CopyableCell text={od.thirdOrderNo} className="font-mono text-xs text-warm-600" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-warm-400">No se pudieron cargar los datos de la orden</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-warm-200/80 bg-white px-6 py-6 lg:border-l lg:border-t-0">
                <div className="flex h-full flex-col gap-4">
                  <div className="rounded-2xl border border-warm-200 bg-white p-4 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.28)]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Estado de la orden</p>
                      {!canEdit && <EstadoChip estado={orden.estado} />}
                    </div>
                    {canEdit ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="h-9 flex-1 rounded-xl border border-warm-200 bg-white px-3 text-xs font-medium text-warm-700 transition-all focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                          value={orden.estado}
                          onChange={handleEstadoChange}
                          disabled={updateOrden.isLoading}
                        >
                          <option value="abierta">Abierta</option>
                          <option value="en_proceso">En proceso</option>
                          <option value="resuelta">Resuelta</option>
                          <option value="cerrada">Cerrada</option>
                        </select>
                        {updateOrden.isLoading && <Loader2 size={14} className="animate-spin text-warm-300 flex-shrink-0" />}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-warm-200 bg-white p-4 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.28)]">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Responsable</p>
                    {canEdit ? (
                      <select
                        className="h-9 w-full rounded-xl border border-warm-200 bg-white px-3 text-xs font-medium text-warm-700 transition-all focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        value={orden.asignado_a || ''}
                        onChange={handleResponsableChange}
                        disabled={updateOrden.isLoading}
                      >
                        <option value="">Sin responsable</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
                      </select>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl bg-warm-50 px-3 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
                          <User size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-warm-800">{orden.asignado_nombre || 'Sin responsable'}</p>
                          <p className="text-[11px] text-warm-400">Seguimiento actual de la orden</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* Tab bar */}
        <div className="px-5">
          <div className="flex rounded-t-2xl border border-warm-200 border-b-0 bg-white px-2 pt-2 shadow-[0_16px_30px_-34px_rgba(15,23,42,0.22)]">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-t-xl px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab.key
                  ? 'border-primary-500 bg-primary-50/70 text-primary-700'
                  : 'border-transparent text-warm-400 hover:bg-warm-50 hover:text-warm-700'}`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-5 pb-4">
          <div className="rounded-b-2xl border border-warm-200 bg-white px-4 py-4 shadow-[0_22px_38px_-36px_rgba(15,23,42,0.22)] sm:px-5">
          {activeTab === 'cajas' && (
            <div>
              {/* Cajas table toolbar */}
              <div className="mb-3 flex items-center gap-2 flex-wrap rounded-2xl border border-warm-100 bg-warm-50/70 px-3 py-3">
                <div className="flex items-center gap-1.5 bg-white border border-warm-200 rounded-xl px-3 h-9 min-w-[200px] max-w-[260px] focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
                  <Search size={12} className="text-warm-400 shrink-0" />
                  <input
                    className="text-xs outline-none bg-transparent text-warm-700 flex-1 min-w-0"
                    placeholder="Buscar código, ubicación..."
                    value={cajaSearch}
                    onChange={e => setCajaSearch(e.target.value)}
                  />
                  {cajaSearch && (
                    <button onClick={() => setCajaSearch('')}>
                      <X size={11} className="text-warm-400" />
                    </button>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => setShowAddCaja(v => !v)}
                    className="flex items-center gap-1.5 ml-auto px-3 py-2 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors"
                  >
                    <Plus size={12} />
                    Agregar caja
                  </button>
                )}
              </div>

              {/* Add caja input row */}
              {showAddCaja && canEdit && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl bg-primary-50 border border-primary-100">
                  <ScanBarcode size={13} className="text-primary-500 flex-shrink-0" />
                  <input
                    autoFocus
                    className="text-xs flex-1 outline-none bg-transparent text-warm-800 placeholder-warm-400"
                    placeholder="Código de caja + Enter para agregar"
                    value={newCajaCode}
                    onChange={e => setNewCajaCode(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCajaCode.trim())
                        addCajaMutation.mutate({ orden_id: orden.id, box_code: newCajaCode.trim().toUpperCase() })
                      if (e.key === 'Escape') { setShowAddCaja(false); setNewCajaCode('') }
                    }}
                  />
                  {addCajaMutation.isLoading && <Loader2 size={12} className="animate-spin text-primary-400" />}
                  <button onClick={() => { setShowAddCaja(false); setNewCajaCode('') }}>
                    <X size={12} className="text-warm-400" />
                  </button>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-warm-200 bg-white shadow-[0_14px_28px_-30px_rgba(15,23,42,0.22)]">
                <table className="w-full text-sm">
                  <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                    <tr>
                      <th className="table-header w-9 text-center">#</th>
                      <th className="table-header whitespace-nowrap">
                        <SortHeader label="Código" field="box_code" sort={cajaSort} onSort={toggleSort} />
                      </th>
                      <th className="table-header whitespace-nowrap">
                        <SortHeader label="Estado" field="estado_caja" sort={cajaSort} onSort={toggleSort} />
                      </th>
                      <th className="table-header whitespace-nowrap">
                        <SortHeader label="Ubicación" field="ubicacion" sort={cajaSort} onSort={toggleSort} />
                      </th>
                      <th className="table-header whitespace-nowrap">Producto</th>
                      <th className="table-header whitespace-nowrap text-center">Surtido</th>
                      <th className="table-header whitespace-nowrap">Anormalidad</th>
                      <th className="table-header whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {filteredCajas.map((c, idx) => (
                      <tr key={c.id} className="hover:bg-primary-50/20 transition-colors">
                        <td className="px-3 py-2.5 text-center text-[11px] text-warm-300 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={c.box_code} className="font-mono text-xs text-warm-600" />
                        </td>
                        {/* Estado caja — interactive select */}
                        <td className="px-3 py-2.5">
                          {canEdit && c.estado_caja !== 'cancelada' ? (
                            <select
                              className="text-xs rounded-lg border border-warm-200 bg-white px-2 py-1 cursor-pointer focus:outline-none focus:border-primary-400 w-[130px]"
                              value={c.estado_caja}
                              onChange={e => handleCajaEstado(c, e.target.value)}
                              disabled={updateCajaMutation.isLoading}
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="localizada">Localizada</option>
                              <option value="no_encontrada">No encontrada</option>
                            </select>
                          ) : (
                            <CajaChip estado={c.estado_caja} />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs text-warm-500">{c.ubicacion || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <span className="text-xs text-warm-700 font-medium truncate block">{c.producto || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.validada_en_surtido
                            ? <CheckCircle2 size={14} className="text-success-500 mx-auto" />
                            : <XCircle size={14} className="text-warm-300 mx-auto" />}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.anormalidad_folio
                            ? <CopyableCell text={c.anormalidad_folio} className="font-mono text-xs text-danger-600" />
                            : <span className="text-xs text-warm-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <button
                                onClick={() => { setCajaNotaModal(c); setCajaNotaText('') }}
                                className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-300 hover:text-primary-500 transition-colors"
                                title="Agregar nota"
                              >
                                <Edit3 size={12} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setCajaDeleteConfirm(c)}
                                className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-300 hover:text-danger-600 transition-colors"
                                title="Eliminar caja"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCajas.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-xs text-warm-400">
                          {cajaSearch ? 'Sin resultados para esa búsqueda' : 'Sin cajas registradas'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'notas' && (
            <div className="max-w-2xl space-y-4">
              {canEdit && (
                <div className="rounded-2xl border border-warm-200 bg-white p-4 shadow-[0_14px_28px_-30px_rgba(15,23,42,0.22)]">
                  <label className="block text-xs font-semibold text-warm-600 mb-2">Agregar nota</label>
                  <textarea
                    className="w-full min-h-[90px] resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 placeholder-warm-300 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                    placeholder="Escribe una nota sobre esta orden..."
                    value={newNota}
                    onChange={e => setNewNota(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitNota() }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-warm-300">Ctrl+Enter para guardar</span>
                    <button
                      onClick={submitNota}
                      disabled={!newNota.trim() || updateOrden.isLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors"
                    >
                      {updateOrden.isLoading ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                      Guardar nota
                    </button>
                  </div>
                </div>
              )}

              {notas.length === 0 ? (
                <div className="rounded-2xl border border-warm-100 bg-warm-50/60 py-10 text-center">
                  <MessageSquare size={20} className="text-warm-300 mx-auto mb-2" />
                  <p className="text-xs text-warm-400">Sin notas todavía</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notas.map((nota, i) => (
                    <div key={nota.id || i} className="rounded-2xl border border-warm-100 bg-white p-4 shadow-[0_14px_28px_-30px_rgba(15,23,42,0.18)]">
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                            <User size={11} className="text-primary-600" />
                          </div>
                          <span className="text-xs font-semibold text-warm-700">{nota.actor_nombre || 'Usuario'}</span>
                        </div>
                        <span className="text-[11px] text-warm-300 flex items-center gap-1 flex-shrink-0">
                          <Clock size={10} />
                          {safeDate(nota.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-warm-700 leading-relaxed whitespace-pre-wrap pl-8">
                        {nota.descripcion}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="max-w-2xl">
              {historial.length === 0 ? (
                <div className="rounded-2xl border border-warm-100 bg-warm-50/60 px-4 py-8 text-center text-xs text-warm-400">Sin historial</div>
              ) : (
                <div className="relative rounded-2xl border border-warm-100 bg-white px-4 py-4 shadow-[0_14px_28px_-30px_rgba(15,23,42,0.18)]">
                  <div className="absolute left-[6px] top-3 bottom-3 w-px bg-warm-100" />
                  <div className="space-y-4">
                    {historial.map((h, i) => {
                      const dotCls = ACCION_DOT[h.accion] || 'bg-warm-300 ring-warm-100'
                      return (
                        <div key={h.id || i} className="flex gap-3 items-start">
                          <div className={`mt-1.5 w-3 h-3 rounded-full flex-shrink-0 ring-2 ${dotCls}`} />
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-warm-700">
                                {ACCION_LABELS[h.accion] || h.accion}
                              </span>
                              {h.actor_nombre && (
                                <span className="text-xs text-warm-400">por {h.actor_nombre}</span>
                              )}
                              <span className="ml-auto text-[11px] text-warm-300 whitespace-nowrap">
                                {safeDate(h.created_at)}
                              </span>
                            </div>
                            {h.descripcion && (
                              <p className="text-xs text-warm-600 mt-0.5 leading-relaxed">{h.descripcion}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Rastrear caja modal */}
      <RastreoSearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} />

      {/* Delete orden modal */}
      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Eliminar orden de rastreo"
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost text-xs">Cancelar</button>
            <button
              onClick={() => deleteOrden.mutate(orden.id)}
              disabled={deleteOrden.isPending}
              className="btn-danger text-xs !bg-danger-600 !text-white hover:!bg-danger-700 inline-flex items-center gap-1.5"
            >
              {deleteOrden.isPending && <Loader2 size={12} className="animate-spin" />}
              Eliminar
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700 mb-1">
          ¿Eliminar la orden <span className="font-mono font-semibold text-warm-900">{orden.folio}</span>?
        </p>
        <p className="text-xs text-warm-500">Esta acción no se puede deshacer. Se eliminarán las cajas y el historial.</p>
      </Modal>

      {/* No encontrada confirm modal */}
      <Modal
        isOpen={!!cajaConfirm}
        onClose={() => { setCajaConfirm(null); setCajaNota('') }}
        title="Confirmar: caja no encontrada"
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setCajaConfirm(null); setCajaNota('') }} className="btn-ghost text-xs">Cancelar</button>
            <button
              onClick={confirmCajaNoEncontrada}
              disabled={updateCajaMutation.isPending}
              className="btn-danger text-xs !bg-danger-600 !text-white hover:!bg-danger-700 inline-flex items-center gap-1.5"
            >
              {updateCajaMutation.isPending && <Loader2 size={12} className="animate-spin" />}
              Confirmar
            </button>
          </div>
        }
      >
        <p className="text-xs text-warm-500 mb-3">
          Caja: <span className="font-mono font-semibold text-warm-900">{cajaConfirm?.caja.box_code}</span>
        </p>
        <p className="text-xs text-warm-500 mb-3">
          Se generará automáticamente una anormalidad <span className="font-semibold">INV-07</span> para esta caja.
        </p>
        <textarea
          className="w-full min-h-[70px] resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-xs text-warm-800 placeholder-warm-300 focus:outline-none focus:border-primary-400 transition-colors"
          placeholder="Nota opcional sobre la caja no encontrada..."
          value={cajaNota}
          onChange={e => setCajaNota(e.target.value)}
        />
      </Modal>

      {/* Delete caja confirm */}
      <Modal
        isOpen={!!cajaDeleteConfirm}
        onClose={() => setCajaDeleteConfirm(null)}
        title="Eliminar caja"
        icon={Trash2}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCajaDeleteConfirm(null)} className="btn-ghost text-xs">Cancelar</button>
            <button
              onClick={() => cajaDeleteConfirm?.id && deleteCajaMutation.mutate(cajaDeleteConfirm.id)}
              disabled={deleteCajaMutation.isPending || !cajaDeleteConfirm?.id}
              className="btn-danger text-xs !bg-danger-600 !text-white hover:!bg-danger-700 inline-flex items-center gap-1.5"
            >
              {deleteCajaMutation.isPending && <Loader2 size={12} className="animate-spin" />}
              Eliminar
            </button>
          </div>
        }
      >
        <p className="text-xs text-warm-500">
          ¿Eliminar la caja <span className="font-mono font-semibold text-warm-900">{cajaDeleteConfirm?.box_code}</span>?
          Si tiene historial de estados, se marcará como cancelada en lugar de eliminarse.
        </p>
      </Modal>

      {/* Caja nota modal */}
      <Modal
        isOpen={!!cajaNotaModal}
        onClose={() => setCajaNotaModal(null)}
        title="Agregar nota a caja"
        icon={Edit3}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCajaNotaModal(null)} className="btn btn-secondary text-xs">Cancelar</button>
            <button
              onClick={() => {
                if (!cajaNotaText.trim()) return
                updateOrden.mutate(
                  { id: orden.id, body: { agregar_nota: `[${cajaNotaModal.box_code}] ${cajaNotaText.trim()}` } },
                  { onSuccess: () => setCajaNotaModal(null) }
                )
              }}
              disabled={!cajaNotaText.trim() || updateOrden.isLoading}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              {updateOrden.isLoading && <Loader2 size={12} className="animate-spin" />}
              Guardar
            </button>
          </div>
        }
      >
        <p className="text-xs text-warm-500 mb-3">
          Caja: <span className="font-mono font-semibold text-warm-900">{cajaNotaModal?.box_code}</span>
        </p>
        <textarea
          autoFocus
          className="w-full min-h-[80px] resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-xs text-warm-800 placeholder-warm-300 focus:outline-none focus:border-primary-400 transition-colors"
          placeholder="Escribe una nota sobre esta caja..."
          value={cajaNotaText}
          onChange={e => setCajaNotaText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && cajaNotaText.trim()) {
            updateOrden.mutate({ id: orden.id, body: { agregar_nota: `[${cajaNotaModal.box_code}] ${cajaNotaText.trim()}` } }, { onSuccess: () => setCajaNotaModal(null) })
          }}}
        />
        <p className="text-[11px] text-warm-300 mt-1">Ctrl+Enter para guardar</p>
      </Modal>
    </>
  )
}
