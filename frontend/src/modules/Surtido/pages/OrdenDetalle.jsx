import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Package2, Truck, Clock, User, Hash,
  ScanBarcode, UserCheck, ClipboardList, CheckCircle2, Loader2,
  Boxes, BarChart3, ShieldAlert, AlertTriangle, ExternalLink, Crosshair,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import StatusPill from '../../../core/components/common/StatusPill'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { normalizeCode } from '../../Shared/Wms/normalizeCode'
import {
  getOutboundList,
  getOutboundDetail,
  getOrderTrackingByOBC,
  getScanSessions,
  upsertOrderTracking,
  forceValidateOrder,
  getSurtidores,
  getRecords,
  getBoxStatus,
  updateBoxStatus,
} from '../services/surtidoService'
import { buscarCaja, createRastreoOrden } from '../../../core/services/rastreoService'

const BOX_STATUS_TRANSITIONS = {
  pendiente:   ['faltante', 'anormalidad', 'reparacion', 'rastreo'],
  validada:    [],
  faltante:    ['pendiente', 'anormalidad', 'reparacion', 'rastreo'],
  anormalidad: ['pendiente', 'faltante', 'reparacion', 'rastreo'],
  reparacion:  ['pendiente', 'faltante', 'anormalidad', 'rastreo'],
  rastreo:     ['pendiente', 'faltante', 'anormalidad', 'reparacion'],
}

const BOX_STATUS_META = {
  pendiente:   { cls: 'bg-warm-100 text-warm-600',       dot: 'bg-warm-400' },
  validada:    { cls: 'bg-success-100 text-success-700', dot: 'bg-success-500', locked: true },
  faltante:    { cls: 'bg-danger-100 text-danger-700',   dot: 'bg-danger-500' },
  anormalidad: { cls: 'bg-warning-100 text-warning-700', dot: 'bg-warning-500' },
  reparacion:  { cls: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-500' },
  rastreo:     { cls: 'bg-sky-100 text-sky-700',         dot: 'bg-sky-500' },
}

function BoxStatusChip({ code, estado, onOpen, t, disabled }) {
  const meta = BOX_STATUS_META[estado] ?? BOX_STATUS_META.pendiente
  const isLocked = meta.locked || disabled
  return (
    <button
      type="button"
      onClick={isLocked ? undefined : () => onOpen(code, estado)}
      disabled={isLocked}
      title={isLocked ? t('surtido.ordenes.box_status.locked_validada') : t('surtido.ordenes.box_status.change_title')}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all
        ${meta.cls} ${isLocked ? 'cursor-default' : 'cursor-pointer hover:opacity-75'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {t(`surtido.ordenes.box_status.${estado}`)}
    </button>
  )
}

function BoxStatusChangeModal({ isOpen, code, currentEstado, onClose, onConfirm, isPending, t }) {
  const allowed = BOX_STATUS_TRANSITIONS[currentEstado] ?? []
  const [selected, setSelected] = useState(allowed[0] ?? 'pendiente')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (isOpen) {
      const next = BOX_STATUS_TRANSITIONS[currentEstado] ?? []
      setSelected(next[0] ?? 'pendiente')
      setNotes('')
    }
  }, [isOpen, currentEstado])

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.box_status.change_title')} icon={AlertTriangle}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className={selected === 'faltante' ? 'btn-danger' : selected ? 'btn-primary' : 'btn-ghost'}
            disabled={!selected || isPending}
            onClick={() => onConfirm(selected, notes)}
          >
            {isPending ? <Loader2 size={13} className="animate-spin inline mr-1" /> : null}
            {t('common.confirm')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-warm-500">
          {t('surtido.ordenes.box_status.title')}: <span className="font-mono font-bold text-warm-900">{code}</span>
        </p>
        <div className="space-y-1.5">
          {allowed.map(s => {
            const meta = BOX_STATUS_META[s]
            return (
              <button key={s} type="button"
                onClick={() => setSelected(s)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm transition-all
                  ${selected === s ? 'border-primary-300 bg-primary-50' : 'border-warm-100 hover:border-warm-200 hover:bg-warm-50'}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                <span className="font-medium">{t(`surtido.ordenes.box_status.${s}`)}</span>
              </button>
            )
          })}
        </div>
        <div>
          <label className="block text-xs font-semibold text-warm-700 mb-1">{t('surtido.ordenes.box_status.notes_label')}</label>
          <input
            type="text"
            className="input-field text-sm w-full"
            placeholder={t('surtido.ordenes.box_status.notes_placeholder')}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}

const STATUS_META = {
  pending_assignment: { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  sorting:            { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-primary-100 text-primary-700' },
  validating:         { labelKey: 'surtido.ordenes.status.validating',         cls: 'bg-accent-100 text-accent-700' },
  complete:           { labelKey: 'surtido.ordenes.status.complete',           cls: 'bg-success-100 text-success-700' },
  partial:            { labelKey: 'surtido.ordenes.status.partial',            cls: 'bg-warning-100 text-warning-700' },
  cancelled:          { labelKey: 'surtido.ordenes.status.cancelled',          cls: 'bg-danger-100 text-danger-700' },
  assigned:           { labelKey: 'surtido.ordenes.status.assigned',           cls: 'bg-warm-100 text-warm-600' },
  pending_validation: { labelKey: 'surtido.ordenes.status.pending_validation', cls: 'bg-primary-100 text-primary-700' },
}

function safeDate(v) {
  if (!v) return '—'
  try { return fmtDateTime(v) } catch { return '—' }
}


function GeneralInfoBlock({ icon: Icon, label, value, tone = 'warm', mono = false, compact = false }) {
  const toneCls = {
    warm: 'border-warm-100/80 bg-white/85 text-warm-500',
    primary: 'border-primary-100/80 bg-primary-50/55 text-primary-600',
    accent: 'border-accent-100/80 bg-accent-50/55 text-accent-600',
    success: 'border-success-100/80 bg-success-50/55 text-success-600',
  }
  return (
    <div className={`rounded-2xl border px-3 py-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.4)] ${toneCls[tone] || toneCls.warm}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
          <p className={`${compact ? 'text-xs' : 'text-sm'} mt-1 truncate font-bold text-warm-800 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}

function ValidationProgressCard({ scanned, expected, pct, t }) {
  const done = pct !== null && pct >= 100
  const tone = done ? 'success' : 'primary'
  const toneCls = {
    primary: 'border-primary-100/80 bg-primary-50/55 text-primary-600',
    success: 'border-success-100/80 bg-success-50/55 text-success-600',
  }
  return (
    <div className={`rounded-2xl border px-3 py-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.4)] ${toneCls[tone]}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
            {t('surtido.ordenes.trace.step_validation')}
          </p>
          <p className="text-sm mt-1 font-bold text-warm-800 tabular-nums">
            {scanned}/{expected || '?'}{pct !== null ? ` · ${pct}%` : ''}
          </p>
          <div className="mt-1.5 h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-success-500' : 'bg-primary-400'}`}
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function TraceabilityTimeline({ tracking, sessions = [], isComplete, t }) {
  const surtidorActual = tracking?.surtidor_nombre || tracking?.surtidor_nombre_actual || null
  const hasSession = sessions.length > 0

  // Most recent completed (or latest updated) session — source of validation timestamp + operator
  const lastSession = [...sessions].sort((a, b) => {
    const ta = a.completed_at || a.updated_at || ''
    const tb = b.completed_at || b.updated_at || ''
    return tb > ta ? 1 : tb < ta ? -1 : 0
  })[0] ?? null

  const validationAt =
    tracking?.validation_completed_at ||
    lastSession?.completed_at ||
    lastSession?.updated_at ||
    (isComplete ? tracking?.updated_at : null)

  const validatedBy =
    tracking?.validated_by || lastSession?.operator_nombre || null

  const steps = [
    {
      key: 'received',
      label: t('surtido.ordenes.trace.step_received'),
      Icon: ClipboardList,
      at: tracking?.created_at,
      by: null,
      done: true,
    },
    {
      key: 'assigned',
      label: t('surtido.ordenes.trace.step_assigned'),
      Icon: UserCheck,
      at: tracking?.assigned_at,
      by: tracking?.assigned_by || surtidorActual || null,
      done: !!(tracking?.assigned_at || surtidorActual),
    },
    {
      key: 'sorting',
      label: t('surtido.ordenes.trace.step_sorting'),
      Icon: Package2,
      at: tracking?.sorting_completed_at || (hasSession ? lastSession?.started_at : null),
      by: surtidorActual || null,
      done: !!(tracking?.sorting_started_at) || hasSession,
    },
    {
      key: 'validation',
      label: t('surtido.ordenes.trace.step_validation'),
      Icon: ScanBarcode,
      at: validationAt,
      by: validatedBy,
      done: isComplete || !!(tracking?.validation_started_at) || hasSession,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {steps.map((step, idx) => {
        const isConnected = idx < steps.length - 1
        const nextDone = steps[idx + 1]?.done ?? false
        const isValidatedStep = step.key === 'validation' && isComplete
        return (
          <div key={step.key} className="relative">
            {isConnected && (
              <div
                className={`hidden sm:block absolute top-3.5 h-0.5 transition-colors ${
                  step.done && nextDone ? 'bg-primary-400' : step.done ? 'bg-primary-200' : 'bg-warm-200'
                }`}
                style={{ left: '50%', width: 'calc(100% - 28px)' }}
              />
            )}
            <div className="flex flex-col items-center text-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 z-10 relative ${
                isValidatedStep
                  ? 'border-success-400 bg-success-50'
                  : step.done
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-warm-200 bg-white'
              }`}>
                <step.Icon size={12} className={
                  isValidatedStep ? 'text-success-600' : step.done ? 'text-primary-600' : 'text-warm-300'
                } />
              </div>
              <p className={`text-[10px] font-semibold leading-tight ${
                isValidatedStep ? 'text-success-700' : step.done ? 'text-warm-800' : 'text-warm-400'
              }`}>
                {step.label}
              </p>
              {step.done ? (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-warm-500 tabular-nums">{step.at ? safeDate(step.at) : '—'}</p>
                  {step.by && (
                    <p className={`text-[10px] font-semibold ${isValidatedStep ? 'text-success-600' : 'text-primary-600'}`}>
                      {step.by}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-warm-300">{t('surtido.ordenes.trace.pending')}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PackagesTable({ packages, referencia, trackingNo, obc, boxStatuses, onOpenStatus, navigate, rastreoLinks, hasRastreoAccess, t }) {
  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-warm-300">
        <Boxes size={28} className="opacity-40" />
        <p className="text-xs">{t('surtido.ordenes.detail.no_packages')}</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-warm-100">
      <table className="w-full text-xs">
        <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
          <tr>
            <th className="table-header hidden sm:table-cell">#</th>
            <th className="table-header">{t('surtido.ordenes.detail.box_type')}</th>
            <th className="table-header">{t('surtido.ordenes.detail.box_code')}</th>
            <th className="table-header text-right">{t('surtido.ordenes.detail.qty')}</th>
            <th className="table-header hidden md:table-cell">{t('surtido.ordenes.referencia')}</th>
            <th className="table-header hidden md:table-cell">{t('surtido.ordenes.detail.tracking')}</th>
            <th className="table-header">{t('surtido.ordenes.box_status.title')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {packages.map((p, i) => {
            const rawCode = p.customizeCode || p.boxCode || p.code || '—'
            const normKey = rawCode !== '—' ? normalizeCode(rawCode) : null
            const estado = (normKey && boxStatuses?.[normKey]) ?? 'pendiente'
            const type = p.boxType || p.type || '—'
            const qty = p.quantity ?? p.qty ?? p.count ?? 1
            const rastreoFolio = normKey ? rastreoLinks?.[normKey] : null
            return (
              <tr key={i} className="table-row">
                <td className="table-cell text-warm-400 font-bold tabular-nums w-8 hidden sm:table-cell">{i + 1}</td>
                <td className="table-cell text-warm-600">{type}</td>
                <td className="table-cell font-mono font-semibold text-warm-800">{rawCode}</td>
                <td className="table-cell text-right font-semibold text-warm-700 tabular-nums">{qty}</td>
                <td className="table-cell font-mono text-xs text-warm-500 hidden md:table-cell">{referencia || '—'}</td>
                <td className="table-cell font-mono text-xs text-warm-500 hidden md:table-cell">{trackingNo || '—'}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-1.5">
                    {normKey ? (
                      <BoxStatusChip
                        code={normKey}
                        estado={estado}
                        onOpen={onOpenStatus}
                        t={t}
                      />
                    ) : <span className="text-warm-300 text-[11px]">—</span>}
                    {estado === 'anormalidad' && normKey && (
                      <button
                        type="button"
                        title={t('surtido.ordenes.box_status.ver_anorm')}
                        onClick={() => navigate(`/anormalidades?proceso=Picking&orden=${encodeURIComponent(obc)}&caja=${encodeURIComponent(normKey)}`)}
                        className="p-0.5 rounded text-warning-500 hover:text-warning-700 hover:bg-warning-50 transition-colors"
                      >
                        <ExternalLink size={11} />
                      </button>
                    )}
                    {estado === 'rastreo' && rastreoFolio && (
                      hasRastreoAccess ? (
                        <button
                          type="button"
                          title={`Orden de rastreo: ${rastreoFolio}`}
                          onClick={() => navigate(`/inventario/rastreo/${encodeURIComponent(rastreoFolio)}`)}
                          className="p-0.5 rounded text-sky-500 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                        >
                          <Crosshair size={11} />
                        </button>
                      ) : (
                        <span
                          title={`Orden de rastreo: ${rastreoFolio}`}
                          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-sky-100"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        </span>
                      )
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AssignSurtidorModal({ isOpen, obc, onClose, onAssigned, t }) {
  const { data } = useQuery({
    queryKey: ['wms-surtidores'],
    queryFn: getSurtidores,
    staleTime: 5 * 60 * 1000,
  })
  const surtidores = getRecords(data)
  const [selected, setSelected] = useState(undefined)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.assign_surtidor')} icon={UserCheck}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={selected === undefined}
            onClick={() => { onAssigned(selected); onClose() }}>
            {t('common.save')}
          </button>
        </div>
      }
    >
      <p className="text-xs text-warm-500 mb-3">
        OBC: <strong className="font-mono text-warm-800">{obc}</strong>
      </p>
      <div className="space-y-1.5">
        <button
          onClick={() => setSelected(null)}
          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
            selected === null
              ? 'border-warm-300 bg-warm-50 text-warm-600'
              : 'border-warm-200 hover:border-warm-300 text-warm-500'
          }`}>
          {t('surtido.ordenes.no_surtidor')}
        </button>
        {surtidores.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
              selected === s.id
                ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700'
                : 'border-warm-200 hover:border-warm-300 text-warm-700'
            }`}>
            {s.nombre}
          </button>
        ))}
      </div>
    </Modal>
  )
}

export default function OrdenDetalle() {
  const { obc: obcParam } = useParams()
  const obc = decodeURIComponent(obcParam)
  const navigate = useNavigate()
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const canForceValidate = hasPermission('surtido.ordenes', 'eliminar')
  const hasRastreoAccess = hasPermission('inventario.rastreo', 'ver')

  const [copied, setCopied] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showForceValidate, setShowForceValidate] = useState(false)
  const [forceReason, setForceReason] = useState('')
  const [statusModal, setStatusModal] = useState(null) // { code, currentEstado }
  const [rastreoLinksSession, setRastreoLinksSession] = useState({})

  const { data: wmsListData } = useQuery({
    queryKey: ['wms-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
  })

  const { data: rawDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['wms-outbound-detail', obc],
    queryFn: () => getOutboundDetail(obc),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const { data: trackingRaw, refetch: refetchTracking } = useQuery({
    queryKey: ['wms-tracking-obc', obc],
    queryFn: () => getOrderTrackingByOBC(obc),
    staleTime: 30000,
    retry: 0,
  })

  const { data: sessionsRaw } = useQuery({
    queryKey: ['wms-scan-sessions-obc', obc],
    queryFn: () => getScanSessions({ outbound_order_no: obc, pageSize: 100 }),
    staleTime: 30000,
  })

  const { data: boxStatusRaw, refetch: refetchBoxStatus } = useQuery({
    queryKey: ['wms-box-status', obc],
    queryFn: () => getBoxStatus(obc),
    staleTime: 30000,
    retry: 0,
  })
  const boxStatuses = boxStatusRaw?.data ?? {}

  // Para cajas ya en estado rastreo al cargar la pagina, buscar la orden de rastreo asociada
  const rasteroCodes = Object.entries(boxStatuses)
    .filter(([, estado]) => estado === 'rastreo')
    .map(([code]) => code)

  const { data: rastreoLinksDb } = useQuery({
    queryKey: ['surtido-rastreo-links', obc, rasteroCodes.slice().sort().join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        rasteroCodes.map(code =>
          buscarCaja(code, 'exact')
            .catch(() => ({ data: { rastreo: [] } }))
            .then(r => ({ code, rastreo: r?.data?.rastreo || [] }))
        )
      )
      return results.reduce((acc, { code, rastreo }) => {
        const active = rastreo.find(r => r.orden_estado !== 'cancelada')
        if (active) acc[code] = active.folio
        return acc
      }, {})
    },
    staleTime: 60000,
    enabled: rasteroCodes.length > 0,
  })

  const rastreoLinks = { ...rastreoLinksDb, ...rastreoLinksSession }

  const boxStatusMut = useMutation({
    mutationFn: ({ code, estado, notes }) => updateBoxStatus(obc, code, estado, notes),
    onSuccess: async (_, { code, estado }) => {
      qc.invalidateQueries({ queryKey: ['wms-box-status', obc] })
      qc.invalidateQueries({ queryKey: ['wms-tracking-obc', obc] })
      refetchBoxStatus()
      refetchTracking()
      setStatusModal(null)
      toast.success(t('common.save') + ' OK')

      if (estado === 'rastreo') {
        try {
          const searchRes = await buscarCaja(code, 'exact')
          const existing = (searchRes?.data?.rastreo || []).find(
            r => r.orden_estado !== 'cancelada'
          )
          if (existing) {
            setRastreoLinksSession(prev => ({ ...prev, [code]: existing.folio }))
            toast.info(t('rastreo.toast.rastreoYaExiste') + existing.folio)
          } else {
            const { user } = useAuthStore.getState()
            const res = await createRastreoOrden({
              outbound_order_no: obc,
              estado: 'borrador',
              notas: `Creado automaticamente desde surtido (${obc})`,
              creado_por_id: user?.id,
              cajas: [{ box_code: code }],
            })
            const folio = res?.data?.folio
            if (folio) {
              setRastreoLinksSession(prev => ({ ...prev, [code]: folio }))
              toast.success(t('rastreo.toast.rastreoAutoCreado') + folio)
            }
          }
          qc.invalidateQueries({ queryKey: ['surtido-rastreo-links', obc] })
        } catch {
          // creacion de rastreo es best-effort, no bloquear flujo
        }
      }
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('toast.error')),
  })

  const allWmsRecords = getRecords(wmsListData)
  const wmsRecord = allWmsRecords.find(r => r.outboundOrderNo === obc)
  const detail = rawDetail?.data ?? rawDetail ?? null
  const tracking = trackingRaw?.data ?? null
  const sessions = getRecords(sessionsRaw)

  const d = detail ?? wmsRecord ?? {}
  const packageList = d?.packageList ?? d?.outboundBoxList ?? d?.boxList ?? []

  const status = tracking?.status || 'pending_assignment'
  const totalExpected = Number(
    wmsRecord?.outboundBoxCount ?? wmsRecord?.packageCount ?? wmsRecord?.totalQty ??
    d?.outboundBoxCount ?? d?.packageCount ?? d?.totalQty ?? tracking?.total_expected ?? 0
  )
  // order-tracking derives this count directly from deduplicated validation events.
  // Keep the session sum only as a compatibility fallback for older API responses.
  const totalScanned = Number(tracking?.total_scanned ??
    sessions.reduce((sum, s) => sum + Number(s.total_scanned || 0), 0))
  const is100Percent = totalExpected > 0 && totalScanned >= totalExpected
  // A stored status of 'complete' can go stale — e.g. a scan failed to persist
  // after a transient backend hiccup, or a box got reset after the order was
  // first marked complete — leaving total_scanned below total_expected while
  // the tracking row still says 'complete'. Showing "Completado" in that case
  // (and hiding the Validar button below, since isClosedOrder gated it) left
  // operators unable to get back into the scan screen to add the missing box.
  const staleComplete = status === 'complete' && totalExpected > 0 && !is100Percent
  const displayStatus = staleComplete
    ? 'validating'
    : (is100Percent && status !== 'complete' && status !== 'cancelled') ? 'complete' : status
  const statusMeta = STATUS_META[displayStatus] ?? STATUS_META.pending_assignment
  const isClosedOrder = !staleComplete && (status === 'complete' || status === 'partial' || is100Percent)

  const referencia = d?.thirdOrderNo || d?.referenceNo || '—'
  const trackingNo = d?.logisticsTrackNo || d?.trackingNo || '—'

  const pct = totalExpected > 0 ? Math.min(100, Math.round((totalScanned / totalExpected) * 100)) : null
  const hasValidation = pct !== null || totalScanned > 0

  const assignMut = useMutation({
    mutationFn: (surtidorId) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      ...(!surtidorId ? { status: 'pending_assignment' } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      qc.invalidateQueries({ queryKey: ['wms-tracking-obc', obc] })
      refetchTracking()
      toast.success(t('common.save') + ' OK')
    },
    onError: () => toast.error(t('toast.error')),
  })

  const forceValidateMut = useMutation({
    mutationFn: (reason) => forceValidateOrder(obc, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      qc.invalidateQueries({ queryKey: ['wms-tracking-obc', obc] })
      refetchTracking()
      setShowForceValidate(false)
      setForceReason('')
      toast.success(t('surtido.force.toast.success'))
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('toast.error')),
  })

  if (detailLoading && !wmsRecord) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.ordenes.detail.title')} subtitle={t('nav.surtido_wms')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/surtido')}
              className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-mono text-base font-black text-warm-900 leading-none truncate">{obc}</span>
              <button
                onClick={() => navigator.clipboard.writeText(obc).then(() => {
                  setCopied(true); setTimeout(() => setCopied(false), 1500)
                })}
                className="p-1 rounded-md text-warm-300 hover:text-primary-600 transition-colors shrink-0">
                {copied ? <Check size={14} className="text-success-600" /> : <Copy size={14} />}
              </button>
              <StatusPill className={`shrink-0 ${statusMeta.cls}`}>
                {t(statusMeta.labelKey)}
              </StatusPill>
            </div>
          </div>
        }
        subtitle={t('nav.surtido_wms')}
        actions={
          <div className="flex items-center gap-2">
            {!isClosedOrder && (
              <button
                className="btn-ghost text-sm flex items-center gap-1.5"
                onClick={() => setShowAssign(true)}>
                <UserCheck size={14} />
                {t('surtido.ordenes.assign_surtidor')}
              </button>
            )}
            {!isClosedOrder && (
              <button
                className="btn-primary text-sm flex items-center gap-1.5"
                onClick={() => navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`)}>
                <ScanBarcode size={14} />
                {t('surtido.ordenes.validate_btn')}
              </button>
            )}
            {canForceValidate && !isClosedOrder && (
              <button
                className="btn-ghost text-sm flex items-center gap-1.5 text-danger-600 border-danger-200 hover:bg-danger-50"
                onClick={() => { setShowForceValidate(true); setForceReason('') }}>
                <ShieldAlert size={14} />
                {t('surtido.force.btn')}
              </button>
            )}
          </div>
        }
      />

      {/* General info */}
      <div className="shrink-0 px-5 py-3 border-b border-warm-100">
        <motion.div
          className="overflow-hidden rounded-[28px] border border-warm-100/80 bg-gradient-to-br from-white via-warm-50/55 to-primary-50/35 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.28)]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="border-b border-warm-100/80 bg-gradient-to-r from-white via-white to-primary-50/50 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-500">{t('surtido.info.general')}</p>
          </div>

          <div className="px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <GeneralInfoBlock icon={User} label={t('surtido.ordenes.cliente')} value={d?.customerCode || d?.customerName || '—'} mono />
              <GeneralInfoBlock icon={Truck} label={t('surtido.ordenes.receiver')} value={d?.receiverName || '—'} compact />
              <GeneralInfoBlock icon={Clock} label={t('surtido.ordenes.fecha_entrega')} value={safeDate(d?.outboundTime || d?.expectedTime)} tone="primary" compact />
              <GeneralInfoBlock icon={Package2} label={t('surtido.ordenes.cajas')} value={d?.outboundBoxCount ?? d?.packageCount ?? d?.totalQty ?? '—'} tone="primary" />
              <GeneralInfoBlock icon={Truck} label={t('surtido.ordenes.canal')} value={d?.logisticsChannel || '—'} compact />
              <GeneralInfoBlock icon={Hash} label={t('surtido.ordenes.referencia')} value={referencia} tone="accent" mono compact />
              <GeneralInfoBlock icon={BarChart3} label={t('surtido.ordenes.detail.tracking')} value={trackingNo} tone="accent" mono compact />
              {tracking?.notes && (
                <div className="rounded-2xl border border-warning-100/80 bg-warning-50/55 px-3 py-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.4)] sm:col-span-2 xl:col-span-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-warning-600 shadow-sm">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warning-600/75">{t('surtido.ordenes.observaciones')}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-5 text-warm-800">{tracking.notes}</p>
                    </div>
                  </div>
                </div>
              )}
              {hasValidation && (
                <ValidationProgressCard
                  scanned={totalScanned}
                  expected={totalExpected}
                  pct={pct}
                  t={t}
                />
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main scrollable — single column */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

        {/* Operación — traceability timeline */}
        <motion.div className="card p-4"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-warm-100">
            <ClipboardList size={13} className="text-primary-500 shrink-0" />
            <p className="text-[10px] uppercase tracking-wider font-bold text-primary-600">
              {t('surtido.ordenes.trace.operacion') || 'Operación'}
            </p>
          </div>
          {tracking ? (
            <TraceabilityTimeline
              tracking={tracking}
              sessions={sessions}
              isComplete={displayStatus === 'complete' || displayStatus === 'partial'}
              t={t}
            />
          ) : (
            <p className="text-xs text-warm-400 text-center py-4">{t('common.noData')}</p>
          )}
        </motion.div>

        {/* Cajas de la orden */}
        <motion.div className="card p-4"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-warm-100">
            <Boxes size={13} className="text-accent-500 shrink-0" />
            <p className="text-[10px] uppercase tracking-wider font-bold text-accent-600">
              {t('surtido.ordenes.detail.packages')} ({packageList.length})
            </p>
            {detailLoading && (
              <Loader2 size={12} className="animate-spin text-warm-400 ml-auto" />
            )}
          </div>
          <PackagesTable
            packages={packageList}
            referencia={referencia !== '—' ? referencia : ''}
            trackingNo={trackingNo !== '—' ? trackingNo : ''}
            obc={obc}
            boxStatuses={boxStatuses}
            onOpenStatus={(code, currentEstado) => setStatusModal({ code, currentEstado })}
            navigate={navigate}
            rastreoLinks={rastreoLinks}
            hasRastreoAccess={hasRastreoAccess}
            t={t}
          />
        </motion.div>
      </div>

      <AssignSurtidorModal
        isOpen={showAssign}
        obc={obc}
        onClose={() => setShowAssign(false)}
        onAssigned={(surtidorId) => assignMut.mutate(surtidorId)}
        t={t}
      />

      <Modal
        isOpen={showForceValidate}
        onClose={() => { setShowForceValidate(false); setForceReason('') }}
        title={t('surtido.force.title')}
        icon={ShieldAlert}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => { setShowForceValidate(false); setForceReason('') }}>{t('common.cancel')}</button>
            <button
              className="btn-danger"
              disabled={!forceReason.trim() || forceValidateMut.isPending}
              onClick={() => forceValidateMut.mutate(forceReason)}
            >
              {forceValidateMut.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {t('surtido.force.confirm.btn')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">
            {t('surtido.force.body').replace('{obc}', obc)}
          </p>
          <div>
            <label className="block text-xs font-semibold text-warm-700 mb-1">{t('surtido.force.motivo.label')}</label>
            <textarea
              className="input-field text-sm w-full h-20 resize-none"
              placeholder={t('surtido.force.motivo.placeholder')}
              value={forceReason}
              onChange={e => setForceReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </Modal>

      <BoxStatusChangeModal
        isOpen={!!statusModal}
        code={statusModal?.code ?? ''}
        currentEstado={statusModal?.currentEstado ?? 'pendiente'}
        onClose={() => setStatusModal(null)}
        onConfirm={(estado, notes) => boxStatusMut.mutate({ code: statusModal.code, estado, notes })}
        isPending={boxStatusMut.isPending}
        t={t}
      />
    </div>
  )
}
