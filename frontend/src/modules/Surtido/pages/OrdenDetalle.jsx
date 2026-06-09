import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Package2, Truck, Clock, User, Hash,
  ScanBarcode, UserCheck, ClipboardList, CheckCircle2, Loader2,
  Boxes, BarChart3, ShieldAlert,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import {
  getOutboundList,
  getOutboundDetail,
  getOrderTrackingByOBC,
  getScanSessions,
  upsertOrderTracking,
  forceValidateOrder,
  getSurtidores,
  getRecords,
} from '../services/surtidoService'

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

function calcTraceDuration(from, to) {
  if (!from || !to) return null
  const ms = new Date(to) - new Date(from)
  if (ms <= 0) return null
  const min = Math.floor(ms / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
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
  return (
    <div className={`rounded-2xl border p-3 flex items-center gap-3 shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all duration-200 ${
      done ? 'border-success-100 bg-success-50' : 'border-primary-100 bg-primary-50'
    }`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm ${done ? 'text-success-600' : 'text-primary-600'}`}>
        <CheckCircle2 className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className={`text-[10px] font-semibold uppercase tracking-wider opacity-70 ${done ? 'text-success-700' : 'text-primary-600'}`}>
            {t('surtido.ordenes.detail.validation_progress')}
          </p>
          <span className="text-xs font-bold tabular-nums text-warm-700 ml-2 shrink-0">
            {scanned}/{expected || '?'} {pct !== null ? `· ${pct}%` : ''}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-success-500' : 'bg-primary-400'}`}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function TraceabilityTimeline({ tracking, t }) {
  const steps = [
    {
      key: 'received',
      label: t('surtido.ordenes.trace.step_received'),
      Icon: ClipboardList,
      at: tracking?.created_at,
      to: null,
      by: null,
      done: true,
    },
    {
      key: 'assigned',
      label: t('surtido.ordenes.trace.step_assigned'),
      Icon: UserCheck,
      at: tracking?.assigned_at,
      to: null,
      by: tracking?.assigned_by || tracking?.surtidor_nombre || null,
      done: !!(tracking?.assigned_at || tracking?.surtidor_nombre),
    },
    {
      key: 'sorting',
      label: t('surtido.ordenes.trace.step_sorting'),
      Icon: Package2,
      at: tracking?.sorting_started_at,
      to: tracking?.sorting_completed_at,
      by: tracking?.surtidor_nombre || null,
      done: !!(tracking?.sorting_started_at),
    },
    {
      key: 'validation',
      label: t('surtido.ordenes.trace.step_validation'),
      Icon: ScanBarcode,
      at: tracking?.validation_started_at,
      to: tracking?.validation_completed_at,
      by: tracking?.validated_by,
      done: !!(tracking?.validation_started_at),
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {steps.map((step, idx) => {
        const duration = calcTraceDuration(step.at, step.to)
        const isConnected = idx < steps.length - 1
        return (
          <div key={step.key} className="relative">
            {isConnected && (
              <div className={`hidden sm:block absolute top-3.5 left-[calc(50%+14px)] right-[-calc(50%-14px)] h-px ${
                step.done ? 'bg-primary-200' : 'bg-warm-200'
              }`} style={{ width: 'calc(100% - 28px)', left: '50%' }} />
            )}
            <div className="flex flex-col items-center text-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 z-10 relative ${
                step.done ? 'border-primary-400 bg-primary-50' : 'border-warm-200 bg-white'
              }`}>
                <step.Icon size={12} className={step.done ? 'text-primary-600' : 'text-warm-300'} />
              </div>
              <p className={`text-[10px] font-semibold leading-tight ${step.done ? 'text-warm-800' : 'text-warm-400'}`}>
                {step.label}
              </p>
              {step.done ? (
                <div className="space-y-0.5">
                  {step.at && <p className="text-[10px] text-warm-500 tabular-nums">{safeDate(step.at)}</p>}
                  {step.by && <p className="text-[10px] text-primary-600 font-semibold">{step.by}</p>}
                  {duration && <p className="text-[10px] text-warm-400">{duration}</p>}
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

function PackagesTable({ packages, referencia, trackingNo, t }) {
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
            <th className="table-header">#</th>
            <th className="table-header">{t('surtido.ordenes.detail.box_type')}</th>
            <th className="table-header">{t('surtido.ordenes.detail.box_code')}</th>
            <th className="table-header text-right">{t('surtido.ordenes.detail.qty')}</th>
            <th className="table-header">{t('surtido.ordenes.referencia')}</th>
            <th className="table-header">{t('surtido.ordenes.detail.tracking')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {packages.map((p, i) => {
            const code = p.customizeCode || p.boxCode || p.code || '—'
            const type = p.boxType || p.type || '—'
            const qty = p.quantity ?? p.qty ?? p.count ?? 1
            return (
              <tr key={i} className="table-row">
                <td className="table-cell text-warm-400 font-bold tabular-nums w-8">{i + 1}</td>
                <td className="table-cell text-warm-600">{type}</td>
                <td className="table-cell font-mono font-semibold text-warm-800">{code}</td>
                <td className="table-cell text-right font-semibold text-warm-700 tabular-nums">{qty}</td>
                <td className="table-cell font-mono text-xs text-warm-500">{referencia || '—'}</td>
                <td className="table-cell font-mono text-xs text-warm-500">{trackingNo || '—'}</td>
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
    staleTime: 30000,
    enabled: isOpen,
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
  const { user } = useAuthStore()
  const isAdmin = user?.rol_nombre === 'Administrador'

  const [copied, setCopied] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showForceValidate, setShowForceValidate] = useState(false)
  const [forceReason, setForceReason] = useState('')

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
  const totalScanned = sessions.reduce((sum, s) => sum + (s.total_scanned || 0), 0)
  const is100Percent = totalExpected > 0 && totalScanned >= totalExpected
  const displayStatus = (is100Percent && status !== 'complete' && status !== 'partial' && status !== 'cancelled') ? 'complete' : status
  const statusMeta = STATUS_META[displayStatus] ?? STATUS_META.pending_assignment
  const isClosedOrder = status === 'complete' || status === 'partial' || is100Percent

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
      toast.success('Orden cerrada forzosamente')
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
              <span className={`badge text-[11px] font-semibold shrink-0 ${statusMeta.cls}`}>
                {t(statusMeta.labelKey)}
              </span>
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
            {isAdmin && !isClosedOrder && (
              <button
                className="btn-ghost text-sm flex items-center gap-1.5 text-danger-600 border-danger-200 hover:bg-danger-50"
                onClick={() => { setShowForceValidate(true); setForceReason('') }}>
                <ShieldAlert size={14} />
                Forzar validación
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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-500">Informacion general</p>
              </div>
              {hasValidation && (
                <div className="w-full lg:w-[320px]">
                  <ValidationProgressCard
                    scanned={totalScanned}
                    expected={totalExpected}
                    pct={pct}
                    t={t}
                  />
                </div>
              )}
            </div>
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
              <GeneralInfoBlock icon={UserCheck} label={t('surtido.ordenes.surtidor')} value={tracking?.surtidor_nombre || '—'} tone="success" compact />
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
            {tracking?.surtidor_nombre && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-warm-500">
                <UserCheck size={11} className="text-primary-400" />
                <span className="font-semibold text-warm-700">{tracking.surtidor_nombre}</span>
              </span>
            )}
          </div>
          {tracking ? (
            <TraceabilityTimeline tracking={tracking} t={t} />
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
        title="Cerrar orden / Forzar validación"
        icon={ShieldAlert}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => { setShowForceValidate(false); setForceReason('') }}>Cancelar</button>
            <button
              className="btn-danger"
              disabled={!forceReason.trim() || forceValidateMut.isPending}
              onClick={() => forceValidateMut.mutate(forceReason)}
            >
              {forceValidateMut.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Confirmar cierre
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">
            Se marcará la orden <span className="font-mono font-semibold text-warm-900">{obc}</span> como <span className="font-semibold text-success-700">Completa</span>. Esta acción queda registrada en el historial de la orden.
          </p>
          <div>
            <label className="block text-xs font-semibold text-warm-700 mb-1">Motivo (requerido)</label>
            <textarea
              className="input-field text-sm w-full h-20 resize-none"
              placeholder="Describe el motivo del cierre forzado..."
              value={forceReason}
              onChange={e => setForceReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
