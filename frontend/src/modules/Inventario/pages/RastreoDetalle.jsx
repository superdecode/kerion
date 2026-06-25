import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Crosshair, ArrowLeft, User, Package, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle, History, MessageSquare,
  Trash2, Search, X, ScanBarcode, ChevronUp, ChevronDown as ChevronDownIcon, Plus, Edit3, FileText,
  FileDown, ClipboardList,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import CopyableCell from '../../../core/components/common/CopyableCell'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import {
  getRastreoDetalle, updateRastreoOrden, updateRastreaoCaja,
  deleteRastreoOrden, getRastreoUsuarios, addCajaToOrden, deleteCaja,
  getCausasRastreo, bulkAssignCausa, resolverRastreoOrden,
} from '../../../core/services/rastreoService'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'
import RastreoSearchModal from '../components/RastreoSearchModal'

const ESTADO_META = {
  borrador:   { cls: 'bg-warm-100 text-warm-500 border-warm-200',          dot: 'bg-warm-300',    labelKey: 'rastreo.estado.borrador' },
  abierta:    { cls: 'bg-primary-100 text-primary-700 border-primary-200', dot: 'bg-primary-500', labelKey: 'rastreo.estado.abierta' },
  en_proceso: { cls: 'bg-warning-100 text-warning-700 border-warning-200', dot: 'bg-warning-500', labelKey: 'rastreo.estado.en_proceso' },
  completada: { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500', labelKey: 'rastreo.estado.completada' },
  cancelada:  { cls: 'bg-warm-100 text-warm-500 border-warm-200',          dot: 'bg-warm-400',    labelKey: 'rastreo.estado.cancelada' },
}

const CAJA_META = {
  pendiente:     { cls: 'bg-warm-100 text-warm-600 border-warm-200',        dot: 'bg-warm-400',    labelKey: 'rastreo.caja.pendiente' },
  localizada:    { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500', labelKey: 'rastreo.caja.localizada' },
  no_encontrada: { cls: 'bg-danger-100 text-danger-700 border-danger-200',  dot: 'bg-danger-500',  labelKey: 'rastreo.caja.no_encontrada' },
  cancelada:     { cls: 'bg-warm-100 text-warm-400 border-warm-100',        dot: 'bg-warm-300',    labelKey: 'rastreo.caja.cancelada' },
}

const ACCION_LABEL_KEYS = {
  creada:             'rastreo.hist.creada',
  asignada:           'rastreo.hist.asignada',
  actualizada:        'rastreo.hist.actualizada',
  estado_cambiado:    'rastreo.hist.estadoCambiado',
  caja_localizada:    'rastreo.hist.cajaLocalizada',
  caja_no_encontrada: 'rastreo.hist.cajaNoEncontrada',
  nota:               'rastreo.hist.nota',
  resuelta:           'rastreo.hist.completada',
}

const ACCION_DOT = {
  nota:               'bg-primary-400 ring-primary-200',
  caja_no_encontrada: 'bg-danger-400 ring-danger-200',
  caja_localizada:    'bg-success-400 ring-success-200',
  creada:             'bg-accent-400 ring-accent-200',
}

function getEstadoOptions(estado) {
  switch (estado) {
    case 'borrador':
      return ['borrador', 'abierta', 'en_proceso', 'cancelada']
    case 'abierta':
      return ['abierta', 'en_proceso', 'completada', 'cancelada']
    case 'en_proceso':
      return ['en_proceso', 'completada', 'cancelada']
    case 'completada':
      return ['completada', 'cancelada']
    case 'cancelada':
      return ['cancelada', 'completada']
    default:
      return ['abierta', 'en_proceso', 'completada', 'cancelada']
  }
}

function EstadoChip({ estado, t }) {
  const meta = ESTADO_META[estado] || ESTADO_META.abierta
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {t(meta.labelKey)}
    </span>
  )
}

function CajaChip({ estado, t }) {
  const meta = CAJA_META[estado] || CAJA_META.pendiente
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {t(meta.labelKey)}
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

function formatCountLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}

export default function RastreoDetalle() {
  const { t } = useI18nStore()
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
  const [cajaConfirmCausa, setCajaConfirmCausa] = useState('')
  const [cajaEditModal, setCajaEditModal] = useState(null)  // { caja }
  const [cajaEditNotas, setCajaEditNotas] = useState('')
  const [cajaEditCausa, setCajaEditCausa] = useState('')
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [resolveMode, setResolveMode] = useState('all')
  const [resolveSelection, setResolveSelection] = useState({})
  const [resolveCausas, setResolveCausas] = useState({})   // caja_id -> causa_rastreo_id
  const [resolveSearch, setResolveSearch] = useState('')
  const [resolveBulkCausa, setResolveBulkCausa] = useState('')

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

  const { data: causasData } = useQuery({
    queryKey: ['rastreo-causas'],
    queryFn: getCausasRastreo,
    staleTime: 5 * 60 * 1000,
  })
  const causas = causasData?.data || []

  const updateOrden = useMutation({
    mutationFn: ({ id, body }) => updateRastreoOrden(id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      if (variables?.silentSuccess) return
      toast.success(variables?.successMessage || t('rastreo.toast.ordenActualizada'))
    },
    onError: (err, variables) => toast.error(err?.response?.data?.error || variables?.errorMessage || t('rastreo.toast.errorActualizarOrden')),
  })

  const updateCajaMutation = useMutation({
    mutationFn: ({ id, body }) => updateRastreaoCaja(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setCajaConfirm(null)
      setCajaNota('')
    },
    onError: () => toast.error(t('rastreo.toast.errorActualizarCaja')),
  })

  const addCajaMutation = useMutation({
    mutationFn: ({ orden_id, box_code }) => addCajaToOrden(orden_id, { box_code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setNewCajaCode('')
      setShowAddCaja(false)
      toast.success(t('rastreo.toast.cajaAgregada'))
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('rastreo.toast.errorAgregarCaja')),
  })

  const updateCajaCausaMutation = useMutation({
    mutationFn: ({ id, causa_rastreo_id }) => updateRastreaoCaja(id, { causa_rastreo_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] }),
    onError: () => toast.error(t('toast.error')),
  })

  const deleteCajaMutation = useMutation({
    mutationFn: (id) => deleteCaja(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setCajaDeleteConfirm(null)
      toast.success(t('rastreo.toast.cajaEliminada'))
    },
    onError: (err) => {
      if (err?.response?.status === 404) {
        qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
        setCajaDeleteConfirm(null)
        toast.error(t('rastreo.toast.cajaNoExiste'))
        return
      }
      toast.error(err?.response?.data?.error || t('rastreo.toast.errorEliminarCaja'))
    },
  })

  const deleteOrden = useMutation({
    mutationFn: (id) => deleteRastreoOrden(id),
    onSuccess: () => {
      toast.success(t('rastreo.ordenEliminada'))
      navigate('/Inventario/rastreo')
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('rastreo.toast.errorEliminarOrden')),
  })

  const orden = data?.data?.orden || null
  const cajas = data?.data?.cajas || []
  const historial = data?.data?.historial || []
  const surtidoTracking = data?.data?.surtido_tracking || null
  const od = outboundData?.data
  const outboundBoxTotal = od?.outboundBoxCount ?? od?.packageList?.length ?? od?.outboundBoxList?.length ?? cajas.length ?? null
  const notas = historial.filter(h => h.accion === 'nota')
  const resolveCandidates = cajas.filter(c => c.estado_caja !== 'cancelada')

  const cajasStats = {
    total: cajas.length,
    localizadas: cajas.filter(c => c.estado_caja === 'localizada').length,
    no_encontradas: cajas.filter(c => c.estado_caja === 'no_encontrada').length,
  }

  const resolveSelectedCount = useMemo(
    () => resolveCandidates.filter(c => resolveSelection[c.id]).length,
    [resolveCandidates, resolveSelection]
  )

  const resolveOrdenMutation = useMutation({
    mutationFn: async ({ selection, targetEstado, causas }) => {
      const isCancelling = targetEstado === 'cancelada'
      if (isCancelling) {
        await updateRastreoOrden(orden.id, { estado: targetEstado })
        return
      }
      const updates = resolveCandidates.map(caja => ({
        caja_id: caja.id,
        found: resolveMode === 'all' ? true : !!selection[caja.id],
        causa_rastreo_id: causas[caja.id] || null,
      }))
      await resolverRastreoOrden({ orden_id: orden.id, target_estado: targetEstado, updates })
    },
    onSuccess: (_, { targetEstado }) => {
      qc.invalidateQueries({ queryKey: ['rastreo-detalle', folio] })
      setResolveModalOpen(false)
      setResolveSearch('')
      setResolveCausas({})
      setResolveBulkCausa('')
      toast.success(targetEstado === 'cancelada'
        ? t('rastreo.toast.ordenCancelada')
        : t('rastreo.toast.ordenCompletada'))
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('rastreo.toast.errorCompletarOrden')),
  })

  function mutateOrden(body, options = {}) {
    updateOrden.mutate({
      id: orden.id,
      body,
      successMessage: options.successMessage,
      errorMessage: options.errorMessage,
      silentSuccess: options.silentSuccess,
    }, options.mutationOptions)
  }

  const [resolveTargetEstado, setResolveTargetEstado] = useState('completada')

  function openResolveModal(targetEstado = 'completada') {
    const nextSelection = Object.fromEntries(
      resolveCandidates.map((caja) => [caja.id, caja.estado_caja !== 'no_encontrada'])
    )
    setResolveSelection(nextSelection)
    setResolveCausas(Object.fromEntries(
      resolveCandidates.map(c => [c.id, c.causa_rastreo_id || ''])
    ))
    setResolveMode(resolveCandidates.every(caja => caja.estado_caja === 'localizada') ? 'all' : 'manual')
    setResolveTargetEstado(targetEstado)
    setResolveSearch('')
    setResolveBulkCausa('')
    setResolveModalOpen(true)
  }

  function handleEstadoChange(e) {
    const nextEstado = e.target.value
    if (nextEstado === 'completada' || nextEstado === 'cancelada') {
      openResolveModal(nextEstado)
      return
    }
    mutateOrden(
      { estado: nextEstado },
      { successMessage: t('rastreo.toast.estadoActualizado'), errorMessage: t('rastreo.toast.errorActualizarEstado') }
    )
  }

  function handleResponsableChange(e) {
    mutateOrden(
      { asignado_a: e.target.value || null },
      { successMessage: t('rastreo.toast.responsableActualizado'), errorMessage: t('rastreo.toast.errorActualizarResponsable') }
    )
  }

  function submitNota() {
    if (!newNota.trim()) return
    mutateOrden(
      { agregar_nota: newNota.trim() },
      {
        successMessage: t('rastreo.toast.notaAgregada'),
        mutationOptions: { onSuccess: () => setNewNota('') },
      }
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
      body: {
        estado_caja: 'no_encontrada',
        ...(cajaNota.trim() ? { notas: cajaNota.trim() } : {}),
        ...(cajaConfirmCausa ? { causa_rastreo_id: cajaConfirmCausa } : {}),
      },
    })
  }

  function toggleSort(field) {
    setCajaSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' }
    )
  }

  function toggleResolveCaja(cajaId) {
    setResolveSelection(prev => ({ ...prev, [cajaId]: !prev[cajaId] }))
  }

  function markAllResolve(value) {
    setResolveSelection(Object.fromEntries(resolveCandidates.map(caja => [caja.id, value])))
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

  const resolveVisibleCandidates = useMemo(() => {
    const q = resolveSearch.trim().toLowerCase()
    if (!q) return resolveCandidates
    return resolveCandidates.filter(c =>
      c.box_code?.toLowerCase().includes(q) ||
      c.ubicacion?.toLowerCase().includes(q) ||
      c.producto?.toLowerCase().includes(q)
    )
  }, [resolveCandidates, resolveSearch])

  const isCancelFlow = resolveTargetEstado === 'cancelada'
  const isCompletadaOrCancelada = orden && (orden.estado === 'completada' || orden.estado === 'cancelada')

  const tabs = [
    { key: 'cajas',    label: `${t('rastreo.detalle.cajas')} (${cajas.length})`,   icon: Package },
    { key: 'notas',    label: `${t('rastreo.detalle.notas')} (${notas.length})`,   icon: MessageSquare },
    { key: 'historial',label: t('rastreo.detalle.historial'),                      icon: History },
  ]

  if (isLoading) return (
    <>
      <Header title={t('rastreo.titulo')} subtitle={t('rastreo.detalle.titulo')} />
      <div className="flex justify-center py-16"><LoadingSpinner /></div>
    </>
  )

  if (error || !orden) return (
    <>
      <Header title={t('rastreo.titulo')} subtitle={t('rastreo.detalle.titulo')} />
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="text-warm-300" size={32} />
        <p className="text-warm-500 text-sm">{t('rastreo.detalle.noEncontrada')}</p>
        <button onClick={() => navigate('/Inventario/rastreo')} className="btn btn-secondary text-xs">{t('common.back')}</button>
      </div>
    </>
  )

  return (
    <>
      <Header
        title={orden.folio}
        subtitle={t('rastreo.detalle.titulo')}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-all text-xs font-medium"
            >
              <Crosshair size={13} />
              {t('rastreo.rastrearCaja')}
            </button>
            {canDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="h-9 px-3 flex items-center gap-1.5 text-xs rounded-xl border border-danger-200 text-danger-600 hover:bg-danger-50 transition-colors"
              >
                <Trash2 size={13} />
                {t('common.delete')}
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
            {t('rastreo.titulo')}
          </button>
        </div>

        {/* Header card: integrated summary + order detail */}
        <div className="px-5 mb-4">
          <div className="overflow-hidden rounded-[28px] border border-warm-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_30%),linear-gradient(135deg,_rgba(255,255,255,0.99),_rgba(248,250,252,0.97))] shadow-[0_16px_44px_-34px_rgba(15,23,42,0.24)]">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_340px]">

              <div className="bg-white px-6 py-6 sm:px-7 sm:py-7">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-500">{t('rastreo.detalle.infoGeneral')}</p>

                  <div className="mt-3 flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm text-primary-600">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">{t('rastreo.detalle.infoOrden')}</p>
                      {orden.outbound_order_no ? (
                        <CopyableCell text={orden.outbound_order_no} className="mt-1 font-mono text-base font-black text-warm-900" />
                      ) : (
                        <span className="mt-1 block text-xs italic text-warm-400">{t('rastreo.detalle.sinOrdenVinculada')}</span>
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
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">{t('rastreo.detalle.cajasRastreo')}</p>
                          <p className="mt-1 text-sm font-bold text-warm-800">{cajasStats.total}</p>
                          <p className="text-[10px] text-warm-400">{cajasStats.localizadas} {t('rastreo.detalle.loc')} • {cajasStats.no_encontradas} {t('rastreo.detalle.ne')}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-primary-100 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 shadow-sm text-primary-600">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-600/70">{t('rastreo.detalle.cajasOrden')}</p>
                          <p className="mt-1 text-sm font-bold text-warm-800">{outboundBoxTotal ?? '—'}</p>
                          <p className="text-[10px] text-warm-400">{t('rastreo.detalle.cajasOrdenHint')}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-primary-100 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm text-primary-600">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-600/70">{t('common.date')}</p>
                          <p className="mt-1 text-xs font-bold text-warm-800">
                            {new Date(orden.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          <p className="text-[10px] text-warm-400">{t('rastreo.detalle.hace')} {elapsed(orden.created_at)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-warm-100 bg-white px-3 py-3 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.22)] sm:col-span-2 xl:col-span-1">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm text-primary-600">
                          <Crosshair className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">{t('rastreo.detalle.pendientes')}</p>
                          <p className="mt-1 text-sm font-bold text-warm-800">{Math.max(cajasStats.total - cajasStats.localizadas - cajasStats.no_encontradas, 0)}</p>
                          <p className="text-[10px] text-warm-400">{t('rastreo.detalle.pendientesHint')}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {orden.outbound_order_no && (
                    <div className="mt-5 rounded-2xl border border-warm-100 bg-white p-4 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.18)]">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">
                        {t('rastreo.detalle.resumenOrden')}
                      </p>
                      {loadingObd ? (
                        <div className="flex items-center gap-2 text-xs text-warm-400">
                          <Loader2 size={12} className="animate-spin" />
                          {t('common.loading')}
                        </div>
                      ) : od ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                          {[
                            { label: t('rastreo.col.cliente'), value: od.customerCode },
                            { label: t('rastreo.detalle.receptor'), value: od.receiverName },
                            { label: t('rastreo.searchModal.col.fechaEntrega'), value: safeDate(od.outboundTime || od.expectedTime) },
                            { label: t('rastreo.detalle.canalLogistico'), value: od.logisticsChannel },
                          ].filter(f => f.value).map(f => (
                            <div key={f.label} className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wider text-warm-400 font-medium">{f.label}</span>
                              <span className="text-xs text-warm-700 font-medium">{f.value}</span>
                            </div>
                          ))}
                          {(od.logisticsTrackNo || od.trackingNo) && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wider text-warm-400 font-medium">{t('rastreo.detalle.tracking')}</span>
                              <CopyableCell text={od.logisticsTrackNo || od.trackingNo} className="font-mono text-xs text-warm-600" />
                            </div>
                          )}
                          {od.thirdOrderNo && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wider text-warm-400 font-medium">{t('rastreo.detalle.refExterna')}</span>
                              <CopyableCell text={od.thirdOrderNo} className="font-mono text-xs text-warm-600" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-warm-400">{t('rastreo.detalle.errorOrdenVinculada')}</p>
                      )}
                    </div>
                  )}

                  {orden.outbound_order_no && (
                    <div className="mt-4 rounded-2xl border border-accent-100 bg-accent-50/35 p-4 shadow-[0_12px_24px_-28px_rgba(15,23,42,0.18)]">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-accent-600 shadow-sm">
                          <ClipboardList className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-600">{t('rastreo.detalle.surtidoSection')}</p>
                          <p className="text-[11px] text-warm-500">{t('rastreo.detalle.surtidoSectionHint')}</p>
                        </div>
                      </div>
                      {surtidoTracking ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            { label: t('rastreo.detalle.surtidorAsignado'), value: surtidoTracking.surtidor_nombre || t('rastreo.detalle.emptyDash'), icon: User },
                            { label: t('rastreo.detalle.fechaAsignacionSurtido'), value: safeDate(surtidoTracking.assigned_at) || t('rastreo.detalle.emptyDash'), icon: Clock },
                            { label: t('rastreo.detalle.estadoSurtido'), value: surtidoTracking.status ? t(`surtido.ordenes.status.${surtidoTracking.status}`) : t('rastreo.detalle.emptyDash'), icon: CheckCircle2 },
                            { label: t('rastreo.detalle.validacionSurtido'), value: safeDate(surtidoTracking.validation_completed_at) || t('rastreo.detalle.emptyDash'), icon: ScanBarcode },
                          ].map(item => (
                            <div key={item.label} className="rounded-xl border border-white/80 bg-white/85 px-3 py-2.5">
                              <div className="flex items-start gap-2.5">
                                <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warm-400">{item.label}</p>
                                  <p className="mt-0.5 truncate text-xs font-semibold text-warm-800">{item.value}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                          {surtidoTracking.notes && (
                            <div className="rounded-xl border border-warning-100 bg-white/90 px-3 py-2.5 sm:col-span-2 xl:col-span-4">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning-600">{t('rastreo.detalle.notasSurtido')}</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs font-medium leading-5 text-warm-700">{surtidoTracking.notes}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="rounded-xl border border-dashed border-accent-200 bg-white/70 px-3 py-3 text-xs text-warm-400">
                          {t('rastreo.detalle.sinSurtidoTracking')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-warm-200/80 bg-white px-6 py-6 lg:border-l lg:border-t-0">
                <div className="flex h-full flex-col gap-4">
                  <div className="rounded-2xl border border-warm-200 bg-white p-4 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.28)]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">{t('rastreo.detalle.estadoOrden')}</p>
                      {!canEdit && <EstadoChip estado={orden.estado} t={t} />}
                    </div>
                    {canEdit ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="h-9 flex-1 rounded-xl border border-warm-200 bg-white px-3 text-xs font-medium text-warm-700 transition-all focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                          value={orden.estado}
                          onChange={handleEstadoChange}
                          disabled={updateOrden.isPending || resolveOrdenMutation.isPending}
                        >
                          {getEstadoOptions(orden.estado).map((estado) => (
                            <option key={estado} value={estado}>{t(ESTADO_META[estado].labelKey)}</option>
                          ))}
                        </select>
                        {(updateOrden.isPending || resolveOrdenMutation.isPending) && <Loader2 size={14} className="animate-spin text-warm-300 flex-shrink-0" />}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-warm-200 bg-white p-4 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.28)]">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">{t('rastreo.detalle.responsable')}</p>
                    {canEdit ? (
                      <select
                        className="h-9 w-full rounded-xl border border-warm-200 bg-white px-3 text-xs font-medium text-warm-700 transition-all focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        value={orden.asignado_a || ''}
                        onChange={handleResponsableChange}
                        disabled={updateOrden.isPending || resolveOrdenMutation.isPending}
                      >
                        <option value="">{t('rastreo.sinResponsable')}</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
                      </select>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl bg-warm-50 px-3 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
                          <User size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-warm-800">{orden.asignado_nombre || t('rastreo.sinResponsable')}</p>
                          <p className="text-[11px] text-warm-400">{t('rastreo.detalle.responsableHint')}</p>
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
                    placeholder={t('rastreo.detalle.searchPlaceholder')}
                    value={cajaSearch}
                    onChange={e => setCajaSearch(e.target.value)}
                  />
                  {cajaSearch && (
                    <button onClick={() => setCajaSearch('')}>
                      <X size={11} className="text-warm-400" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => {
                      const headers = [
                        t('rastreo.detalle.col.codigo'),
                        t('rastreo.detalle.col.estadoCaja'),
                        t('rastreo.detalle.col.ubicacion'),
                        t('rastreo.detalle.col.producto'),
                        t('rastreo.causas.col.causa'),
                        t('rastreo.causas.col.area'),
                        t('rastreo.detalle.col.surtido'),
                        t('rastreo.detalle.surtidoOperador'),
                        t('rastreo.detalle.surtidoValidadoEn'),
                        t('rastreo.detalle.col.anormalidad'),
                      ]
                      const rows = filteredCajas.map(c => [
                        c.box_code,
                        t(CAJA_META[c.estado_caja]?.labelKey || 'rastreo.caja.pendiente'),
                        c.ubicacion || '',
                        c.producto || '',
                        c.causa_descripcion || '',
                        c.causa_area || '',
                        c.validada_en_surtido ? 'SI' : 'NO',
                        c.surtido_validacion?.surtido_operator_nombre || '',
                        c.surtido_validacion?.surtido_validated_at ? safeDate(c.surtido_validacion.surtido_validated_at) : '',
                        c.anormalidad_folio || '',
                      ])
                      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `rastreo_cajas_${orden.folio}_${new Date().toISOString().slice(0, 10)}.csv`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-success-200 bg-success-50 text-success-700 hover:bg-success-100 text-xs font-medium transition-colors"
                    title={t('rastreo.exportar')}
                  >
                    <FileDown size={12} />
                    {t('rastreo.exportar')}
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddCaja(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors"
                    >
                      <Plus size={12} />
                      {t('rastreo.detalle.agregarCaja')}
                    </button>
                  )}
                </div>
              </div>

              {/* Add caja input row */}
              {showAddCaja && canEdit && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl bg-primary-50 border border-primary-100">
                  <ScanBarcode size={13} className="text-primary-500 flex-shrink-0" />
                  <input
                    autoFocus
                    className="text-xs flex-1 outline-none bg-transparent text-warm-800 placeholder-warm-400"
                    placeholder={t('rastreo.detalle.addBoxPlaceholder')}
                    value={newCajaCode}
                    onChange={e => setNewCajaCode(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCajaCode.trim())
                        addCajaMutation.mutate({ orden_id: orden.id, box_code: newCajaCode.trim().toUpperCase() })
                      if (e.key === 'Escape') { setShowAddCaja(false); setNewCajaCode('') }
                    }}
                  />
                  {addCajaMutation.isPending && <Loader2 size={12} className="animate-spin text-primary-400" />}
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
                        <SortHeader label={t('rastreo.detalle.col.codigo')} field="box_code" sort={cajaSort} onSort={toggleSort} />
                      </th>
                      <th className="table-header whitespace-nowrap">
                        <SortHeader label={t('rastreo.detalle.col.estadoCaja')} field="estado_caja" sort={cajaSort} onSort={toggleSort} />
                      </th>
                      <th className="table-header whitespace-nowrap">
                        <SortHeader label={t('rastreo.detalle.col.ubicacion')} field="ubicacion" sort={cajaSort} onSort={toggleSort} />
                      </th>
                      <th className="table-header whitespace-nowrap">{t('rastreo.detalle.col.producto')}</th>
                      <th className="table-header whitespace-nowrap text-center">{t('rastreo.detalle.col.surtido')}</th>
                      <th className="table-header whitespace-nowrap">{t('rastreo.detalle.col.anormalidad')}</th>
                      {isCompletadaOrCancelada && (
                        <th className="table-header whitespace-nowrap">{t('rastreo.causas.col.causa')}</th>
                      )}
                      <th className="table-header whitespace-nowrap">{t('rastreo.detalle.col.acciones')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {filteredCajas.map((c, idx) => (
                      <tr key={c.id} className="hover:bg-primary-100 transition-colors">
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
                              disabled={updateCajaMutation.isPending || resolveOrdenMutation.isPending}
                            >
                              <option value="pendiente">{t('rastreo.caja.pendiente')}</option>
                              <option value="localizada">{t('rastreo.caja.localizada')}</option>
                              <option value="no_encontrada">{t('rastreo.caja.no_encontrada')}</option>
                            </select>
                          ) : (
                            <CajaChip estado={c.estado_caja} t={t} />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs text-warm-500">{c.ubicacion || t('rastreo.detalle.emptyDash')}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <span className="text-xs text-warm-700 font-medium truncate block">{c.producto || t('rastreo.detalle.emptyDash')}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.validada_en_surtido ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <CheckCircle2 size={14} className="text-success-500" />
                              {c.surtido_validacion?.surtido_operator_nombre && (
                                <span className="max-w-[120px] truncate text-[10px] font-semibold text-warm-600" title={c.surtido_validacion.surtido_operator_nombre}>
                                  {c.surtido_validacion.surtido_operator_nombre}
                                </span>
                              )}
                              {c.surtido_validacion?.surtido_validated_at && (
                                <span className="whitespace-nowrap text-[10px] text-warm-400">
                                  {safeDate(c.surtido_validacion.surtido_validated_at)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <XCircle size={14} className="text-warm-300" />
                              <span className="text-[10px] text-warm-300">{t('rastreo.detalle.emptyDash')}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.anormalidad_folio
                            ? <CopyableCell text={c.anormalidad_folio} className="font-mono text-xs text-danger-600" />
                            : <span className="text-xs text-warm-300">{t('rastreo.detalle.emptyDash')}</span>}
                        </td>
                        {isCompletadaOrCancelada && (
                          <td className="px-3 py-2.5 min-w-[160px]">
                            {canEdit ? (
                              <select
                                className="text-xs rounded-lg border border-warm-200 bg-white px-2 py-1 cursor-pointer focus:outline-none focus:border-primary-400 w-full"
                                value={c.causa_rastreo_id || ''}
                                onChange={e => updateCajaCausaMutation.mutate({ id: c.id, causa_rastreo_id: e.target.value || null })}
                                disabled={updateCajaCausaMutation.isPending}
                              >
                                <option value="">{t('rastreo.causas.sinCausa')}</option>
                                {causas.map(ca => (
                                  <option key={ca.id} value={ca.id}>
                                    {ca.descripcion} ({ca.area})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              c.causa_descripcion
                                ? <span className="text-xs text-warm-700">{c.causa_descripcion} <span className="text-warm-400">({c.causa_area})</span></span>
                                : <span className="text-xs text-warm-300">{t('rastreo.detalle.emptyDash')}</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <button
                                onClick={() => { setCajaEditModal(c); setCajaEditNotas(c.notas || ''); setCajaEditCausa(c.causa_rastreo_id || '') }}
                                className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-300 hover:text-primary-500 transition-colors"
                                title={t('rastreo.detalle.addBoxNote')}
                              >
                                <Edit3 size={12} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setCajaDeleteConfirm(c)}
                                className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-300 hover:text-danger-600 transition-colors"
                                title={t('rastreo.detalle.eliminarCaja')}
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
                        <td colSpan={isCompletadaOrCancelada ? 9 : 8} className="py-8 text-center text-xs text-warm-400">
                          {cajaSearch ? t('rastreo.detalle.noSearchResults') : t('rastreo.detalle.noBoxes')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'notas' && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
              {canEdit && (
                <div className="rounded-2xl border border-warm-200 bg-white p-4 shadow-[0_14px_28px_-30px_rgba(15,23,42,0.22)]">
                  <label className="block text-xs font-semibold text-warm-600 mb-2">{t('rastreo.detalle.addNote')}</label>
                  <textarea
                    className="w-full min-h-[90px] resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 placeholder-warm-300 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                    placeholder={t('rastreo.detalle.notePlaceholder')}
                    value={newNota}
                    onChange={e => setNewNota(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitNota() }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-warm-300">{t('rastreo.detalle.ctrlEnter')}</span>
                    <button
                      onClick={submitNota}
                      disabled={!newNota.trim() || updateOrden.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors"
                    >
                      {updateOrden.isPending ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                      {t('rastreo.detalle.guardarNotas')}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-400">{t('rastreo.detalle.savedNotes')}</p>
                    <p className="text-[11px] text-warm-400">{t('rastreo.detalle.savedNotesHint')}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-[10px] font-semibold text-primary-700">
                    {formatCountLabel(notas.length, t('rastreo.detalle.noteSingular'), t('rastreo.detalle.notePlural'))}
                  </span>
                </div>
                {notas.length === 0 ? (
                <div className="rounded-2xl border border-warm-100 bg-warm-50/60 py-10 text-center">
                  <MessageSquare size={20} className="text-warm-300 mx-auto mb-2" />
                  <p className="text-xs text-warm-400">{t('rastreo.detalle.noNotes')}</p>
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
                          <span className="text-xs font-semibold text-warm-700">{nota.actor_nombre || t('rastreo.detalle.userFallback')}</span>
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
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="max-w-2xl">
              {historial.length === 0 ? (
                <div className="rounded-2xl border border-warm-100 bg-warm-50/60 px-4 py-8 text-center text-xs text-warm-400">{t('rastreo.detalle.noHistory')}</div>
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
                                {ACCION_LABEL_KEYS[h.accion] ? t(ACCION_LABEL_KEYS[h.accion]) : h.accion}
                              </span>
                              {h.actor_nombre && (
                                <span className="text-xs text-warm-400">{t('rastreo.detalle.by')} {h.actor_nombre}</span>
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

      <Modal
        isOpen={resolveModalOpen}
        onClose={() => { if (!resolveOrdenMutation.isPending) { setResolveModalOpen(false); setResolveSearch(''); setResolveCausaId(''); setBulkCausaId('') } }}
        title={isCancelFlow ? t('rastreo.detalle.cancelTitle') : t('rastreo.detalle.resolveTitle')}
        icon={isCancelFlow ? XCircle : CheckCircle2}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-[11px] text-warm-400">
              {!isCancelFlow && (resolveMode === 'all'
                ? t('rastreo.detalle.resolveAllSummary')
                  .replace('{total}', String(resolveCandidates.length))
                : t('rastreo.detalle.resolveManualSummary')
                  .replace('{found}', String(resolveSelectedCount))
                  .replace('{missing}', String(Math.max(resolveCandidates.length - resolveSelectedCount, 0))))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setResolveModalOpen(false); setResolveSearch(''); setResolveCausaId(''); setBulkCausaId('') }}
                disabled={resolveOrdenMutation.isPending}
                className="btn-ghost text-xs"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => resolveOrdenMutation.mutate({ selection: resolveSelection, targetEstado: resolveTargetEstado, causas: resolveCausas })}
                disabled={resolveOrdenMutation.isPending}
                className={`text-xs inline-flex items-center gap-1.5 ${isCancelFlow ? 'btn-danger !bg-danger-600 !text-white hover:!bg-danger-700' : 'btn-primary'}`}
              >
                {resolveOrdenMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                {isCancelFlow ? t('rastreo.detalle.confirmCancel') : t('rastreo.detalle.confirmResolution')}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-warm-800">{isCancelFlow ? t('rastreo.detalle.cancelQuestion') : t('rastreo.detalle.resolveQuestion')}</p>
            <p className="mt-1 text-xs text-warm-500">{isCancelFlow ? t('rastreo.detalle.cancelHint') : t('rastreo.detalle.resolveHint')}</p>
          </div>


          {!isCancelFlow && (
            <div className="rounded-2xl border border-warm-200 bg-warm-50/70 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setResolveMode('all')}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    resolveMode === 'all'
                      ? 'bg-success-50 text-success-700 border border-success-200 shadow-[0_12px_24px_-24px_rgba(34,197,94,0.6)]'
                      : 'bg-transparent text-warm-500 border border-transparent hover:bg-white hover:text-warm-700'
                  }`}
                >
                  {t('rastreo.detalle.resolveAllTitle')}
                </button>
                <button
                  onClick={() => setResolveMode('manual')}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    resolveMode === 'manual'
                      ? 'bg-primary-50 text-primary-700 border border-primary-200 shadow-[0_12px_24px_-24px_rgba(59,130,246,0.6)]'
                      : 'bg-transparent text-warm-500 border border-transparent hover:bg-white hover:text-warm-700'
                  }`}
                >
                  {t('rastreo.detalle.resolveManualTitle')}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-warm-200 bg-white p-4 shadow-[0_16px_30px_-34px_rgba(15,23,42,0.2)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm-400">{t('rastreo.detalle.quickSummary')}</p>
                <p className="text-[11px] text-warm-500">{t('rastreo.detalle.quickSummaryHint')}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!isCancelFlow && resolveMode === 'manual' && (
                  <>
                    <button onClick={() => {
                      const ids = resolveVisibleCandidates.map(c => c.id)
                      setResolveSelection(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = true }); return n })
                    }} className="rounded-lg border border-success-200 bg-success-50 px-2.5 py-1 text-[11px] font-semibold text-success-700">
                      {t('rastreo.detalle.markVisible')}
                    </button>
                    <button onClick={() => {
                      const ids = resolveVisibleCandidates.map(c => c.id)
                      setResolveSelection(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = false }); return n })
                    }} className="rounded-lg border border-warm-200 bg-warm-50 px-2.5 py-1 text-[11px] font-semibold text-warm-600">
                      {t('rastreo.detalle.unmarkVisible')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="flex gap-2 mb-2">
              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-8 flex-1 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
                <Search size={11} className="text-warm-400 shrink-0" />
                <input
                  className="flex-1 text-xs outline-none bg-transparent text-warm-700 placeholder-warm-300"
                  placeholder={t('rastreo.detalle.searchPlaceholder')}
                  value={resolveSearch}
                  onChange={e => setResolveSearch(e.target.value)}
                />
                {resolveSearch && (
                  <button onClick={() => setResolveSearch('')}>
                    <X size={10} className="text-warm-400 hover:text-warm-600" />
                  </button>
                )}
              </div>
            </div>
            {/* Bulk causa */}
            {!isCancelFlow && causas.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <select
                  className="flex-1 h-7 rounded-xl border border-warm-200 bg-white px-2 text-[11px] text-warm-600 focus:outline-none focus:border-primary-400"
                  value={resolveBulkCausa}
                  onChange={e => setResolveBulkCausa(e.target.value)}
                >
                  <option value="">{t('rastreo.causas.sinCausa')}</option>
                  {causas.map(ca => <option key={ca.id} value={ca.id}>{ca.descripcion} ({ca.area})</option>)}
                </select>
                <button
                  onClick={() => {
                    const ids = resolveVisibleCandidates.map(c => c.id)
                    setResolveCausas(prev => {
                      const n = { ...prev }
                      ids.forEach(id => { n[id] = resolveBulkCausa })
                      return n
                    })
                  }}
                  disabled={!resolveBulkCausa}
                  className="h-7 px-2.5 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-semibold hover:bg-primary-100 disabled:opacity-40 whitespace-nowrap"
                >
                  {t('rastreo.causas.aplicarVisibles')}
                </button>
                <button
                  onClick={() => setResolveCausas(prev => {
                    const n = { ...prev }
                    resolveCandidates.forEach(c => { n[c.id] = '' })
                    return n
                  })}
                  className="h-7 px-2.5 rounded-xl border border-warm-200 bg-warm-50 text-warm-600 text-[11px] font-semibold hover:bg-warm-100 whitespace-nowrap"
                >
                  {t('rastreo.causas.limpiarTodas')}
                </button>
              </div>
            )}

            {resolveCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-warm-200 bg-warm-50/60 px-4 py-6 text-center text-xs text-warm-400">
                {t('rastreo.detalle.noActiveBoxes')}
              </div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto grid gap-2 pr-0.5">
                {resolveVisibleCandidates.map((caja) => {
                  const checked = isCancelFlow ? false : (resolveMode === 'all' ? true : !!resolveSelection[caja.id])
                  return (
                    <label
                      key={caja.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition-all ${
                        isCancelFlow
                          ? 'border-warm-200 bg-white'
                          : checked
                            ? 'border-success-200 bg-success-50/70'
                            : 'border-warm-200 bg-white'
                      } ${!isCancelFlow && resolveMode === 'manual' ? 'cursor-pointer hover:border-primary-200' : ''}`}
                    >
                      {!isCancelFlow && (
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={resolveMode === 'all'}
                          onChange={() => toggleResolveCaja(caja.id)}
                          className="cb"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-semibold text-warm-800">{caja.box_code}</p>
                        <p className="text-[11px] text-warm-400">{caja.ubicacion || t('rastreo.detalle.noLocation')} • {caja.producto || t('rastreo.detalle.noProduct')}</p>
                        {!isCancelFlow && causas.length > 0 && (
                          <select
                            className="mt-1.5 w-full h-6 rounded-lg border border-warm-200 bg-white/80 px-1.5 text-[11px] text-warm-600 focus:outline-none focus:border-primary-400"
                            value={resolveCausas[caja.id] || ''}
                            onChange={e => { e.stopPropagation(); setResolveCausas(prev => ({ ...prev, [caja.id]: e.target.value })) }}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="">{t('rastreo.causas.sinCausa')}</option>
                            {causas.map(ca => <option key={ca.id} value={ca.id}>{ca.descripcion} ({ca.area})</option>)}
                          </select>
                        )}
                      </div>
                      {!isCancelFlow && (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 self-start ${
                          checked ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700'
                        }`}>
                          {checked ? t('rastreo.detalle.found') : t('rastreo.detalle.notFound')}
                        </span>
                      )}
                    </label>
                  )
                })}
                {resolveVisibleCandidates.length === 0 && resolveSearch && (
                  <div className="py-4 text-center text-xs text-warm-400">{t('rastreo.detalle.noSearchResults')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete orden modal */}
      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('rastreo.eliminarOrden')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost text-xs">{t('common.cancel')}</button>
            <button
              onClick={() => deleteOrden.mutate(orden.id)}
              disabled={deleteOrden.isPending}
              className="btn-danger text-xs !bg-danger-600 !text-white hover:!bg-danger-700 inline-flex items-center gap-1.5"
            >
              {deleteOrden.isPending && <Loader2 size={12} className="animate-spin" />}
              {t('common.delete')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700 mb-1">
          {t('rastreo.detalle.deleteOrderQuestion')} <span className="font-mono font-semibold text-warm-900">{orden.folio}</span>?
        </p>
        <p className="text-xs text-warm-500">{t('rastreo.detalle.deleteOrderHint')}</p>
      </Modal>

      {/* No encontrada confirm modal */}
      <Modal
        isOpen={!!cajaConfirm}
        onClose={() => { setCajaConfirm(null); setCajaNota(''); setCajaConfirmCausa('') }}
        title={t('rastreo.detalle.confirmMissingBoxTitle')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setCajaConfirm(null); setCajaNota(''); setCajaConfirmCausa('') }} className="btn-ghost text-xs">{t('common.cancel')}</button>
            <button
              onClick={confirmCajaNoEncontrada}
              disabled={updateCajaMutation.isPending}
              className="btn-danger text-xs !bg-danger-600 !text-white hover:!bg-danger-700 inline-flex items-center gap-1.5"
            >
              {updateCajaMutation.isPending && <Loader2 size={12} className="animate-spin" />}
              {t('common.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-xs text-warm-500 mb-3">
          {t('rastreo.detalle.boxLabel')} <span className="font-mono font-semibold text-warm-900">{cajaConfirm?.caja.box_code}</span>
        </p>
        {causas.length > 0 && (
          <select
            className="w-full h-8 rounded-xl border border-warm-200 bg-white px-3 text-xs text-warm-700 mb-3 focus:outline-none focus:border-primary-400"
            value={cajaConfirmCausa}
            onChange={e => setCajaConfirmCausa(e.target.value)}
          >
            <option value="">{t('rastreo.causas.sinCausa')}</option>
            {causas.map(ca => <option key={ca.id} value={ca.id}>{ca.descripcion} ({ca.area})</option>)}
          </select>
        )}
        <textarea
          className="w-full min-h-[70px] resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-xs text-warm-800 placeholder-warm-300 focus:outline-none focus:border-primary-400 transition-colors"
          placeholder={t('rastreo.detalle.missingBoxNotePlaceholder')}
          value={cajaNota}
          onChange={e => setCajaNota(e.target.value)}
        />
      </Modal>

      {/* Delete caja confirm */}
      <Modal
        isOpen={!!cajaDeleteConfirm}
        onClose={() => setCajaDeleteConfirm(null)}
        title={t('rastreo.detalle.eliminarCaja')}
        icon={Trash2}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCajaDeleteConfirm(null)} className="btn-ghost text-xs">{t('common.cancel')}</button>
            <button
              onClick={() => cajaDeleteConfirm?.id && deleteCajaMutation.mutate(cajaDeleteConfirm.id)}
              disabled={deleteCajaMutation.isPending || !cajaDeleteConfirm?.id}
              className="btn-danger text-xs !bg-danger-600 !text-white hover:!bg-danger-700 inline-flex items-center gap-1.5"
            >
              {deleteCajaMutation.isPending && <Loader2 size={12} className="animate-spin" />}
              {t('common.delete')}
            </button>
          </div>
        }
      >
        <p className="text-xs text-warm-500">
          {t('rastreo.detalle.deleteBoxQuestion')} <span className="font-mono font-semibold text-warm-900">{cajaDeleteConfirm?.box_code}</span>?
          {t('rastreo.detalle.deleteBoxHint')}
        </p>
      </Modal>

      {/* Caja edit modal */}
      <Modal
        isOpen={!!cajaEditModal}
        onClose={() => setCajaEditModal(null)}
        title={t('rastreo.detalle.addBoxNote')}
        icon={Edit3}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCajaEditModal(null)} className="btn btn-secondary text-xs">{t('common.cancel')}</button>
            <button
              onClick={() => {
                updateCajaMutation.mutate(
                  { id: cajaEditModal.id, body: { notas: cajaEditNotas.trim() || null, causa_rastreo_id: cajaEditCausa || null } },
                  { onSuccess: () => setCajaEditModal(null) }
                )
              }}
              disabled={updateCajaMutation.isPending}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              {updateCajaMutation.isPending && <Loader2 size={12} className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        }
      >
        <p className="text-xs text-warm-500 mb-3">
          {t('rastreo.detalle.boxLabel')} <span className="font-mono font-semibold text-warm-900">{cajaEditModal?.box_code}</span>
        </p>
        {causas.length > 0 && (
          <div className="mb-3">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400 mb-1">{t('rastreo.causas.col.causa')}</label>
            <select
              className="w-full h-9 rounded-xl border border-warm-200 bg-white px-3 text-xs text-warm-700 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              value={cajaEditCausa}
              onChange={e => setCajaEditCausa(e.target.value)}
            >
              <option value="">{t('rastreo.causas.sinCausa')}</option>
              {causas.map(ca => <option key={ca.id} value={ca.id}>{ca.descripcion} ({ca.area})</option>)}
            </select>
          </div>
        )}
        <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400 mb-1">{t('rastreo.detalle.addBoxNote')}</label>
        <textarea
          autoFocus
          className="w-full min-h-[80px] resize-y rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-xs text-warm-800 placeholder-warm-300 focus:outline-none focus:border-primary-400 transition-colors"
          placeholder={t('rastreo.detalle.boxNotePlaceholder')}
          value={cajaEditNotas}
          onChange={e => setCajaEditNotas(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) {
            updateCajaMutation.mutate(
              { id: cajaEditModal.id, body: { notas: cajaEditNotas.trim() || null, causa_rastreo_id: cajaEditCausa || null } },
              { onSuccess: () => setCajaEditModal(null) }
            )
          }}}
        />
        <p className="text-[11px] text-warm-300 mt-1">{t('rastreo.detalle.ctrlEnter')}</p>
      </Modal>
    </>
  )
}
