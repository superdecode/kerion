import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Package2, Truck, Clock, User, Hash,
  ScanBarcode, UserCheck, ClipboardList, CheckCircle2, Loader2,
  Boxes, BarChart3,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import {
  getOutboundList,
  getOutboundDetail,
  getOrderTrackingByOBC,
  getScanSessions,
  upsertOrderTracking,
  getSurtidores,
} from '../services/surtidoService'

const STATUS_META = {
  pending_assignment: { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  sorting:            { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-primary-100 text-primary-700' },
  validating:         { labelKey: 'surtido.ordenes.status.validating',         cls: 'bg-accent-100 text-accent-700' },
  complete:           { labelKey: 'surtido.ordenes.status.complete',           cls: 'bg-success-100 text-success-700' },
  partial:            { labelKey: 'surtido.ordenes.status.partial',            cls: 'bg-warning-100 text-warning-700' },
  cancelled:          { labelKey: 'surtido.ordenes.status.cancelled',          cls: 'bg-danger-100 text-danger-700' },
  assigned:           { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  pending_validation: { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-primary-100 text-primary-700' },
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

function SummaryCard({ icon: Icon, label, value, color = 'warm', mono = false }) {
  const ring = {
    warm:    'border-warm-100 bg-warm-50',
    primary: 'border-primary-100 bg-primary-50',
    success: 'border-success-100 bg-success-50',
    accent:  'border-accent-100 bg-accent-50',
  }
  const iconCls = {
    warm:    'text-warm-500',
    primary: 'text-primary-600',
    success: 'text-success-700',
    accent:  'text-accent-600',
  }
  return (
    <div className={`rounded-2xl border p-3 flex items-center gap-3 ${ring[color]} shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all duration-200`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm ${iconCls[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${iconCls[color]} opacity-70`}>{label}</p>
        <p className={`text-sm font-bold text-warm-800 truncate mt-0.5 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</p>
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
    queryKey: ['upapex-surtidores'],
    queryFn: getSurtidores,
    staleTime: 30000,
    enabled: isOpen,
  })
  const surtidores = data?.data ?? []
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

  const [copied, setCopied] = useState(false)
  const [showAssign, setShowAssign] = useState(false)

  const { data: wmsListData } = useQuery({
    queryKey: ['upapex-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
  })

  const { data: rawDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['upapex-outbound-detail', obc],
    queryFn: () => getOutboundDetail(obc),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const { data: trackingRaw, refetch: refetchTracking } = useQuery({
    queryKey: ['upapex-tracking-obc', obc],
    queryFn: () => getOrderTrackingByOBC(obc),
    staleTime: 30000,
    retry: 0,
  })

  const { data: sessionsRaw } = useQuery({
    queryKey: ['upapex-scan-sessions-obc', obc],
    queryFn: () => getScanSessions({ outbound_order_no: obc, pageSize: 100 }),
    staleTime: 30000,
  })

  const allWmsRecords = wmsListData?.data?.records ?? wmsListData?.data ?? []
  const wmsRecord = allWmsRecords.find(r => r.outboundOrderNo === obc)
  const detail = rawDetail?.data ?? rawDetail ?? null
  const tracking = trackingRaw?.data ?? null
  const sessions = sessionsRaw?.data?.records ?? sessionsRaw?.data ?? []

  const d = detail ?? wmsRecord ?? {}
  const packageList = d?.packageList ?? d?.outboundBoxList ?? d?.boxList ?? []

  const status = tracking?.status || 'pending_assignment'
  const statusMeta = STATUS_META[status] ?? STATUS_META.pending_assignment

  const referencia = d?.thirdOrderNo || d?.referenceNo || '—'
  const trackingNo = d?.logisticsTrackNo || d?.trackingNo || '—'

  const totalExpected = Number(
    wmsRecord?.outboundBoxCount ?? wmsRecord?.packageCount ?? wmsRecord?.totalQty ??
    d?.outboundBoxCount ?? d?.packageCount ?? d?.totalQty ?? 0
  )
  const totalScanned = sessions.reduce((sum, s) => sum + (s.total_scanned || 0), 0)
  const pct = totalExpected > 0 ? Math.min(100, Math.round((totalScanned / totalExpected) * 100)) : null
  const hasValidation = pct !== null || totalScanned > 0

  const assignMut = useMutation({
    mutationFn: (surtidorId) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      ...(!surtidorId ? { status: 'pending_assignment' } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upapex-order-tracking'] })
      qc.invalidateQueries({ queryKey: ['upapex-tracking-obc', obc] })
      refetchTracking()
      toast.success(t('common.save') + ' OK')
    },
    onError: () => toast.error(t('toast.error')),
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
            <button
              className="btn-ghost text-sm flex items-center gap-1.5"
              onClick={() => setShowAssign(true)}>
              <UserCheck size={14} />
              {t('surtido.ordenes.assign_surtidor')}
            </button>
            {status !== 'complete' && (
              <button
                className="btn-primary text-sm flex items-center gap-1.5"
                onClick={() => navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`)}>
                <ScanBarcode size={14} />
                {t('surtido.ordenes.validate_btn')}
              </button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="shrink-0 px-5 py-3 border-b border-warm-100">
        <div className={`grid gap-3 ${hasValidation ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-7' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
          <SummaryCard icon={User}     label={t('surtido.ordenes.cliente')}       value={d?.customerCode || d?.customerName || '—'} mono color="warm" />
          <SummaryCard icon={Truck}    label={t('surtido.ordenes.receiver')}      value={d?.receiverName || '—'}                    color="warm" />
          <SummaryCard icon={Clock}    label={t('surtido.ordenes.fecha_entrega')} value={safeDate(d?.outboundTime || d?.expectedTime)} color="warm" />
          <SummaryCard icon={Package2} label={t('surtido.ordenes.cajas')}         value={d?.outboundBoxCount ?? d?.packageCount ?? d?.totalQty ?? '—'} color="primary" />
          <SummaryCard icon={Truck}    label={t('surtido.ordenes.canal')}         value={d?.logisticsChannel || '—'}                color="warm" />
          <SummaryCard icon={Hash}     label={t('surtido.ordenes.referencia')}    value={referencia}                                mono color="accent" />
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
    </div>
  )
}
