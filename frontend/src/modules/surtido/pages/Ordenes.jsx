import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, UserCheck, Users, Plus, Trash2, X, ChevronDown, Play, Loader2,
  Package2, Truck, ScanBarcode, Copy, Check, Info, Activity,
  User, Clock, BarChart3, RefreshCw, Database, CheckCircle2,
  MapPin, Timer, XCircle, AlertCircle,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import {
  getOutboundList, getOutboundDetail,
  getSurtidores, createSurtidor, deleteSurtidor,
  getOrderTracking, upsertOrderTracking, getScanSessions, getScanSession,
} from '../services/surtidoService'
import { refreshSheet, getCacheTimestamp } from '../../wmshub/services/googleSheetsService'

const STATUS_META = {
  pending_assignment: { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  assigned:           { labelKey: 'surtido.ordenes.status.assigned',           cls: 'bg-accent-100 text-accent-700' },
  sorting:            { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-warning-100 text-warning-700' },
  pending_validation: { labelKey: 'surtido.ordenes.status.pending_validation', cls: 'bg-primary-100 text-primary-700' },
  validating:         { labelKey: 'surtido.ordenes.status.validating',         cls: 'bg-success-100 text-success-700' },
  complete:           { labelKey: 'surtido.ordenes.status.complete',           cls: 'bg-success-200 text-success-800' },
}

function SurtidoresModal({ isOpen, onClose }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')

  const { data } = useQuery({ queryKey: ['upapex-surtidores'], queryFn: getSurtidores, staleTime: 30000, enabled: isOpen })
  const surtidores = data?.data ?? []

  const addMut = useMutation({
    mutationFn: createSurtidor,
    onSuccess: () => { setNombre(''); qc.invalidateQueries({ queryKey: ['upapex-surtidores'] }) },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })
  const delMut = useMutation({
    mutationFn: deleteSurtidor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upapex-surtidores'] }),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.surtidores_title')} icon={Users}
      footer={<button className="btn-ghost" onClick={onClose}><X size={14} /> {t('common.close')}</button>}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="input-field flex-1 text-sm" placeholder={t('surtido.ordenes.surtidor_name')}
            value={nombre} onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nombre.trim()) addMut.mutate({ nombre: nombre.trim() }) }} />
          <button className="btn-primary shrink-0" onClick={() => addMut.mutate({ nombre: nombre.trim() })}
            disabled={!nombre.trim() || addMut.isPending}>
            {addMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('surtido.ordenes.add_surtidor')}
          </button>
        </div>
        <div className="divide-y divide-warm-100 max-h-60 overflow-y-auto">
          {surtidores.length === 0 ? (
            <p className="text-sm text-warm-400 text-center py-6">{t('common.noData')}</p>
          ) : surtidores.map(s => (
            <div key={s.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                  {s.nombre[0]?.toUpperCase()}
                </div>
                <span className="text-sm text-warm-800 font-medium">{s.nombre}</span>
              </div>
              <button className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                onClick={() => delMut.mutate(s.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function AssignModal({ isOpen, order, onClose, onAssign }) {
  const { t } = useI18nStore()
  const { data } = useQuery({ queryKey: ['upapex-surtidores'], queryFn: getSurtidores, staleTime: 30000, enabled: isOpen })
  const surtidores = data?.data ?? []
  const [selected, setSelected] = useState(null)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.assign_surtidor')} icon={UserCheck}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={() => { onAssign(selected); onClose() }}>{t('common.save')}</button>
        </div>
      }
    >
      <p className="text-xs text-warm-500 mb-3">
        OBC: <strong className="font-mono text-warm-800">{order?.outboundOrderNo || order?.outbound_order_no}</strong>
      </p>
      <div className="space-y-1.5">
        <button onClick={() => setSelected(null)}
          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
            selected === null ? 'border-warm-300 bg-warm-50 text-warm-600' : 'border-warm-200 hover:border-warm-300 text-warm-500'
          }`}>
          {t('surtido.ordenes.no_surtidor')}
        </button>
        {surtidores.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
              selected === s.id ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700' : 'border-warm-200 hover:border-warm-300 text-warm-700'
            }`}>
            {s.nombre}
          </button>
        ))}
      </div>
    </Modal>
  )
}

function WmsDetailModal({ order, onClose }) {
  const { t } = useI18nStore()
  if (!order) return null
  const d = order._detail ?? order
  const packageList = d?.packageList ?? d?.outboundBoxList ?? d?.boxList ?? []

  const infoRows = [
    { label: 'OBC',                        value: order.outboundOrderNo,                                   mono: true, span: true },
    { label: t('surtido.ordenes.cliente'),  value: d?.customerCode  || order.customerCode  || d?.customerName },
    { label: t('surtido.ordenes.referencia'), value: d?.thirdOrderNo || order.thirdOrderNo || d?.referenceNo },
    { label: t('surtido.ordenes.canal'),    value: d?.logisticsChannel || order.logisticsChannel,           span: true },
    { label: t('surtido.ordenes.detail.tracking'), value: d?.logisticsTrackNo || order.logisticsTrackNo,    mono: true, span: true },
    { label: t('surtido.ordenes.detail.warehouse'), value: d?.whCode || order.whCode },
    { label: t('surtido.ordenes.receiver'), value: d?.receiverName || order.receiverName },
    { label: t('surtido.ordenes.fecha_entrega'),  value: d?.expectedTime || order.outboundTime ? String(d?.expectedTime || order.outboundTime).slice(0, 10) : null },
  ].filter(i => i.value)

  return (
    <Modal isOpen={!!order} onClose={onClose} title="Detalles WMS" icon={Package2}
      footer={<button className="btn-ghost" onClick={onClose}><X size={14} /> {t('common.close')}</button>}
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-2">
          {infoRows.map((item, i) => (
            <div key={i} className={`bg-warm-50 rounded-lg px-2.5 py-2 ${item.span ? 'col-span-2' : ''}`}>
              <p className="text-warm-400 text-[10px] uppercase tracking-wide">{item.label}</p>
              <p className={`font-semibold text-warm-800 break-all ${item.mono ? 'font-mono text-[11px]' : ''}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {!order._detail && (
          <div className="flex items-center justify-center py-8 text-warm-400 gap-2">
            <Loader2 size={16} className="animate-spin" /> {t('common.loading')}
          </div>
        )}

        {packageList.length > 0 && (
          <div>
            <p className="font-semibold text-warm-500 mb-2 uppercase tracking-wider text-[10px] flex items-center gap-1">
              <Package2 size={10} /> {t('surtido.escaneo.tab_cajas')} ({packageList.length})
            </p>
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-warm-50/60">
                    <th className="table-header">Tipo</th>
                    <th className="table-header">{t('surtido.ordenes.referencia')}</th>
                    <th className="table-header text-right">{t('surtido.ordenes.cajas')}</th>
                    <th className="table-header text-right">Uds.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {packageList.map((p, i) => {
                    const unitQty = (p.boxSkuQueryVOList ?? []).reduce((s, x) => s + (x.quantity ?? 0), 0)
                    return (
                      <tr key={i} className="hover:bg-warm-50 transition-colors">
                        <td className="table-cell text-warm-500 text-[10px]">{p.boxType || '—'}</td>
                        <td className="table-cell font-mono font-semibold text-warm-800 text-[11px]">{p.customizeCode || '—'}</td>
                        <td className="table-cell text-right font-semibold">{p.quantity ?? 1}</td>
                        <td className="table-cell text-right text-warm-500">{unitQty || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

const SESSION_STATUS = {
  complete:           { cls: 'bg-success-100 text-success-700',  label: 'Completa' },
  with_discrepancies: { cls: 'bg-warning-100 text-warning-700',  label: 'Con diferencias' },
  validating:         { cls: 'bg-primary-100 text-primary-700',  label: 'En curso' },
}

function fmtDt(v) {
  if (!v) return '—'
  return String(v).slice(0, 16).replace('T', ' ')
}

function calcSessionDuration(s) {
  if (!s?.started_at) return '—'
  const end = s.completed_at ? new Date(s.completed_at) : new Date()
  const secs = Math.max(0, Math.floor((end - new Date(s.started_at)) / 1000))
  const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const sc = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sc}s`
  return `${sc}s`
}

function OrderDetailModal({ obc, tracking, onClose }) {
  const { t } = useI18nStore()
  const status = tracking?.status || 'pending_assignment'
  const meta = STATUS_META[status] ?? STATUS_META.pending_assignment

  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [detailTab, setDetailTab] = useState('registros')

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['upapex-scan-sessions-obc', obc],
    queryFn: () => getScanSessions({ outbound_order_no: obc, pageSize: 50 }),
    enabled: !!obc,
    staleTime: 30000,
    onSuccess: (data) => {
      const records = data?.data?.records ?? data?.data ?? []
      if (records.length > 0 && !selectedSessionId) {
        setSelectedSessionId(records[0].id)
      }
    },
  })
  const sessions = sessionsData?.data?.records ?? sessionsData?.data ?? []

  const activeSession = selectedSessionId
    ? sessions.find(s => s.id === selectedSessionId) ?? sessions[0]
    : sessions[0]

  const { data: sessionDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['upapex-scan-session-detail', activeSession?.id],
    queryFn: () => getScanSession(activeSession.id),
    enabled: !!activeSession?.id,
    staleTime: 30000,
  })

  const events = sessionDetail?.data?.events ?? []
  const okEvents  = events.filter(e => e.scan_result === 'ok')
  const badEvents = events.filter(e => e.scan_result !== 'ok')

  const handleClose = () => { setSelectedSessionId(null); onClose() }

  return (
    <Modal isOpen={!!obc} onClose={handleClose}
      title={
        <div className="flex items-center gap-2.5">
          <span className="font-mono font-bold text-warm-900">{obc}</span>
          <span className={`badge text-[11px] font-semibold ${meta.cls}`}>{t(meta.labelKey)}</span>
        </div>
      }
      icon={Activity}
      size="full"
      footer={<button className="btn-ghost" onClick={handleClose}><X size={14} /> {t('common.close')}</button>}
    >
      {sessionsLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-warm-400">
          <Loader2 size={18} className="animate-spin" /> {t('common.loading')}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Order summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t('surtido.ordenes.status'),   value: <span className={`badge text-xs font-semibold ${meta.cls}`}>{t(meta.labelKey)}</span> },
              { label: t('surtido.ordenes.surtidor'),  value: tracking?.surtidor_nombre || '—' },
              { label: 'Sesiones',                     value: sessions.length },
              { label: 'Total escaneados',             value: tracking?.total_scanned ?? okEvents.length },
            ].map(f => (
              <div key={f.label} className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
                <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1">{f.label}</p>
                <div className="text-sm font-semibold text-warm-700">{f.value}</div>
              </div>
            ))}
          </div>

          {/* Session selector (if multiple) */}
          {sessions.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {sessions.map((s, i) => {
                const sm = SESSION_STATUS[s.status] ?? { cls: 'bg-warm-100 text-warm-600', label: s.status }
                return (
                  <button key={s.id}
                    onClick={() => { setSelectedSessionId(s.id); setDetailTab('registros') }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      (activeSession?.id === s.id)
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-warm-600 border-warm-200 hover:border-primary-300 hover:text-primary-700'
                    }`}>
                    #{i + 1} · {fmtDt(s.started_at).slice(11, 16)}
                    <span className={`ml-1.5 badge text-[10px] font-bold ${sm.cls} ${activeSession?.id === s.id ? 'opacity-80' : ''}`}>{sm.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Active session detail */}
          {activeSession && (
            <>
              {/* Session info cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Inicio validación', value: fmtDt(activeSession.started_at),   icon: Clock },
                  { label: 'Fin validación',    value: fmtDt(activeSession.completed_at) || 'En curso', icon: Clock },
                  { label: 'Duración',          value: calcSessionDuration(activeSession), icon: Timer },
                  { label: 'Operador',          value: activeSession.operator_nombre || '—', icon: User },
                ].map(f => (
                  <div key={f.label} className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
                    <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                      <f.icon size={9} /> {f.label}
                    </p>
                    <p className="text-sm font-semibold text-warm-700 font-mono">{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-success-50 border border-success-100 text-center">
                  <p className="text-2xl font-black text-success-600 leading-none">{activeSession.total_scanned ?? okEvents.length}</p>
                  <p className="text-[10px] text-success-600 uppercase tracking-wider font-bold mt-1">Validados</p>
                </div>
                <div className="p-3 rounded-xl bg-warm-50 border border-warm-100 text-center">
                  <p className="text-2xl font-black text-warm-700 leading-none">{activeSession.total_expected ?? '?'}</p>
                  <p className="text-[10px] text-warm-500 uppercase tracking-wider font-bold mt-1">Esperados</p>
                </div>
                <div className="p-3 rounded-xl bg-danger-50 border border-danger-100 text-center">
                  <p className="text-2xl font-black text-danger-600 leading-none">{badEvents.length}</p>
                  <p className="text-[10px] text-danger-600 uppercase tracking-wider font-bold mt-1">Rechazados</p>
                </div>
              </div>

              {activeSession.notes && (
                <div className="bg-warm-50 rounded-xl px-3 py-2.5 border border-warm-100">
                  <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-0.5">Notas</p>
                  <p className="text-sm text-warm-700">{activeSession.notes}</p>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 border-b border-warm-100">
                <button onClick={() => setDetailTab('registros')}
                  className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                    detailTab === 'registros' ? 'text-primary-600 border-primary-500' : 'text-warm-400 border-transparent hover:text-warm-600'
                  }`}>
                  <CheckCircle2 size={12} /> {t('surtido.escaneo.tab_registros')}
                  <span className="bg-success-100 text-success-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case">{okEvents.length}</span>
                </button>
                <button onClick={() => setDetailTab('rechazados')}
                  className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                    detailTab === 'rechazados' ? 'text-primary-600 border-primary-500' : 'text-warm-400 border-transparent hover:text-warm-600'
                  }`}>
                  <XCircle size={12} /> {t('surtido.escaneo.tab_rechazados')}
                  {badEvents.length > 0 && (
                    <span className="bg-danger-100 text-danger-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case">{badEvents.length}</span>
                  )}
                </button>
              </div>

              {detailLoading ? (
                <div className="flex justify-center py-8 text-warm-400 gap-2">
                  <Loader2 size={16} className="animate-spin" /> {t('common.loading')}
                </div>
              ) : detailTab === 'registros' ? (
                <EventsTable events={okEvents} t={t} />
              ) : (
                <EventsTable events={badEvents} t={t} showResult />
              )}
            </>
          )}

          {sessions.length === 0 && (
            <p className="text-center text-warm-400 py-10 text-sm">{t('common.noData')}</p>
          )}
        </div>
      )}
    </Modal>
  )
}

function EventsTable({ events, t, showResult = false }) {
  if (events.length === 0) return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-warm-400">
      <CheckCircle2 size={32} className="opacity-30" />
      <p className="text-sm">{t('common.noData')}</p>
    </div>
  )
  return (
    <div className="max-h-80 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
      <table className="w-full text-xs">
        <thead className="bg-warm-50 sticky top-0 z-10 border-b border-warm-100">
          <tr>
            <th className="text-left px-3 py-2.5 font-bold text-warm-500">#</th>
            <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('surtido.validacion.code_header')}</th>
            {showResult && <th className="text-left px-3 py-2.5 font-bold text-warm-500">Tipo</th>}
            <th className="text-right px-3 py-2.5 font-bold text-warm-500">Hora escaneo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {events.map((e, i) => (
            <tr key={e.id || i} className={`hover:bg-warm-50/50 transition-colors ${
              showResult && e.scan_result === 'duplicate' ? 'bg-warning-50/30' : ''
            }`}>
              <td className="px-3 py-2 text-warm-400 tabular-nums font-bold">{i + 1}</td>
              <td className="px-3 py-2 font-mono font-semibold text-warm-700">{e.normalized_code || e.scanned_code}</td>
              {showResult && (
                <td className="px-3 py-2">
                  <span className={`badge text-[10px] ${
                    e.scan_result === 'duplicate' ? 'bg-warning-100 text-warning-700' : 'bg-danger-100 text-danger-700'
                  }`}>
                    {e.scan_result === 'duplicate' ? t('surtido.escaneo.match_duplicate') : t('surtido.escaneo.match_rejected')}
                  </span>
                </td>
              )}
              <td className="px-3 py-2 text-right text-warm-400 tabular-nums">
                {String(e.scanned_at || '').slice(11, 19)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CopyableObc({ obc }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(obc).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="flex items-center gap-1 group/obc">
      <span className="font-mono font-bold text-primary-700 text-xs">{obc || '—'}</span>
      {obc && (
        <button onClick={handleCopy}
          className="opacity-0 group-hover/obc:opacity-100 p-0.5 rounded text-warm-400 hover:text-primary-600 transition-all">
          {copied ? <Check size={11} className="text-success-600" /> : <Copy size={11} />}
        </button>
      )}
    </div>
  )
}

function StatusChips({ selected, onChange, t }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onChange('')}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
          !selected
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-white text-warm-600 border-warm-200 hover:border-primary-300 hover:text-primary-700'
        }`}>
        {t('common.all')}
      </button>
      {Object.entries(STATUS_META).map(([k, v]) => (
        <button key={k} onClick={() => onChange(k === selected ? '' : k)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
            selected === k
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-warm-500 border-warm-200 hover:border-primary-300 hover:text-primary-700'
          }`}>
          {t(v.labelKey)}
        </button>
      ))}
    </div>
  )
}

export default function Ordenes() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = useState('wms')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSurtidor, setFilterSurtidor] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showSurtidoresModal, setShowSurtidoresModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)
  const [wmsDetailOrder, setWmsDetailOrder] = useState(null)
  const [progressObc, setProgressObc] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [sheetTs, setSheetTs] = useState(() => getCacheTimestamp('outbound'))

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refreshSheet('outbound')
      setSheetTs(getCacheTimestamp('outbound'))
      qc.invalidateQueries({ queryKey: ['upapex-outbound'] })
    } finally {
      setRefreshing(false)
    }
  }

  const { data: wmsData, isLoading: wmsLoading } = useQuery({
    queryKey: ['upapex-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
  })

  const { data: trackingData } = useQuery({
    queryKey: ['upapex-order-tracking'],
    queryFn: getOrderTracking,
    staleTime: 30000,
  })

  const { data: surtidoresData } = useQuery({
    queryKey: ['upapex-surtidores'],
    queryFn: getSurtidores,
    staleTime: 60000,
  })

  const allWmsRecords = wmsData?.data?.records ?? wmsData?.data ?? []
  const trackingList  = trackingData?.data ?? []
  const surtidores    = surtidoresData?.data ?? []

  const trackingMap = trackingList.reduce((m, tr) => {
    m[tr.outbound_order_no] = tr; return m
  }, {})

  const wmsMap = allWmsRecords.reduce((m, r) => {
    m[r.outboundOrderNo] = r; return m
  }, {})

  const q = search.trim().toLowerCase()

  function matchesDateFilter(dateStr) {
    if (!dateStr) return true
    const d = String(dateStr).slice(0, 10)
    if (dateFrom && d < dateFrom) return false
    if (dateTo   && d > dateTo)   return false
    return true
  }

  const filteredWms = allWmsRecords.filter(r => {
    const tracking = trackingMap[r.outboundOrderNo]
    if (filterStatus && (tracking?.status || 'pending_assignment') !== filterStatus) return false
    if (filterSurtidor && tracking?.surtidor_nombre !== filterSurtidor) return false
    if (!matchesDateFilter(r.orderCreateTime)) return false
    if (q) {
      const haystack = [r.outboundOrderNo, r.customerCode, r.thirdOrderNo, r.receiverName, r.logisticsChannel].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const filteredValidacion = trackingList.filter(tr => {
    if (filterStatus && tr.status !== filterStatus) return false
    if (filterSurtidor && tr.surtidor_nombre !== filterSurtidor) return false
    const wms = wmsMap[tr.outbound_order_no]
    if (!matchesDateFilter(wms?.orderCreateTime || tr.updated_at)) return false
    if (q) {
      const haystack = [tr.outbound_order_no, tr.surtidor_nombre, wms?.customerCode, wms?.thirdOrderNo].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const activeRecords = tab === 'wms' ? filteredWms : filteredValidacion
  const total       = activeRecords.length
  const totalPages  = Math.ceil(total / pageSize) || 1
  const pagedRecords = activeRecords.slice((page - 1) * pageSize, page * pageSize)

  const assignMut = useMutation({
    mutationFn: ({ obc, surtidorId }) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      status: surtidorId ? 'assigned' : 'pending_assignment',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['upapex-order-tracking'] }); toast.success(t('common.save') + ' OK') },
    onError: () => toast.error(t('toast.error')),
  })

  const loadDetailMut = useMutation({
    mutationFn: (obc) => getOutboundDetail(obc),
    onSuccess: (data, obc) => {
      const row = allWmsRecords.find(r => r.outboundOrderNo === obc)
      setWmsDetailOrder(row ? { ...row, _detail: data?.data } : { outboundOrderNo: obc, _detail: data?.data })
    },
    onError: () => toast.error(t('toast.error')),
  })

  function clearFilters() {
    setFilterStatus(''); setFilterSurtidor(''); setSearch(''); setDateFrom(''); setDateTo('')
  }

  const hasFilters = filterStatus || filterSurtidor || search || dateFrom || dateTo

  const tabs = [
    { key: 'wms',        icon: Database,     label: t('surtido.ordenes.tab_wms') },
    { key: 'validacion', icon: CheckCircle2, label: t('surtido.ordenes.tab_validacion') },
  ]

  if (wmsLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.ordenes.title')} subtitle={t('nav.surtido_wms')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('surtido.ordenes.title')} subtitle={t('nav.surtido_wms')}
        actions={
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs flex items-center gap-1.5"
              onClick={handleRefresh}
              disabled={refreshing}>
              {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {t('wmshub.config.sheet_refresh')}
              {sheetTs > 0 && (
                <span className="text-warm-400 font-normal">
                  {t('wmshub.config.datos_al')} {new Date(sheetTs).toLocaleTimeString()}
                </span>
              )}
            </button>
            <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => setShowSurtidoresModal(true)}>
              <Users size={14} /> {t('surtido.ordenes.manage_surtidores')}
            </button>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6">
        <div className="flex gap-1">
          {tabs.map(item => (
            <button key={item.key}
              onClick={() => { setTab(item.key); setPage(1) }}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-200 ${
                tab === item.key
                  ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                  : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
              }`}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">
        {/* Status chips — top row */}
        <StatusChips selected={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1) }} t={t} />
        {/* Search + date + surtidor — second row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-44 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
            <input type="text" className="input-field pl-8 text-sm h-9"
              placeholder={t('surtido.ordenes.search_placeholder')}
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
            <Clock size={13} className="text-warm-400 shrink-0" />
            <input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
            <span className="text-warm-300 text-xs">→</span>
            <input type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
          </div>
          {surtidores.length > 0 && (
            <select className="px-2.5 py-1.5 rounded-xl border border-warm-200 text-xs text-warm-700 outline-none focus:border-primary-400 bg-warm-50" value={filterSurtidor} onChange={e => setFilterSurtidor(e.target.value)}>
              <option value="">{t('surtido.ordenes.surtidor')} — {t('common.all')}</option>
              {surtidores.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
            </select>
          )}
          {hasFilters && (
            <button className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors" onClick={clearFilters}>
              <X size={12} /> {t('common.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {pagedRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-warm-400">
            <Package2 size={40} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        ) : tab === 'wms' ? (
          <WmsTable
            records={pagedRecords} trackingMap={trackingMap}
            onAssign={r => setAssignTarget(r)}
            onDetail={obc => loadDetailMut.mutate(obc)}
            isLoadingDetail={(obc) => loadDetailMut.isPending && loadDetailMut.variables === obc}
            onProgress={obc => setProgressObc(obc)}
            onValidate={obc => navigate(`/surtido/validacion?obc=${encodeURIComponent(obc)}`)}
            t={t}
            page={page} totalPages={totalPages} pageSize={pageSize} total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        ) : (
          <ValidacionTable
            records={pagedRecords} wmsMap={wmsMap}
            onProgress={obc => setProgressObc(obc)}
            onValidate={obc => navigate(`/surtido/validacion?obc=${encodeURIComponent(obc)}`)}
            t={t}
            page={page} totalPages={totalPages} pageSize={pageSize} total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        )}
      </div>

      <SurtidoresModal isOpen={showSurtidoresModal} onClose={() => setShowSurtidoresModal(false)} />

      <AssignModal
        isOpen={!!assignTarget} order={assignTarget}
        onClose={() => setAssignTarget(null)}
        onAssign={(surtidorId) => {
          if (!assignTarget) return
          assignMut.mutate({ obc: assignTarget.outboundOrderNo || assignTarget.outbound_order_no, surtidorId })
        }}
      />

      <WmsDetailModal order={wmsDetailOrder} onClose={() => setWmsDetailOrder(null)} />

      <OrderDetailModal
        obc={progressObc}
        tracking={progressObc ? trackingMap[progressObc] : null}
        onClose={() => setProgressObc(null)}
      />
    </div>
  )
}

function WmsTable({ records, trackingMap, onAssign, onDetail, isLoadingDetail, onProgress, onValidate, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  return (
    <motion.div className="card overflow-hidden"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-warm-50 border-b border-warm-100">
              <th className="table-header font-semibold">OBC</th>
              <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.ordenes.cliente')}</th>
              <th className="table-header hidden xl:table-cell font-semibold">{t('surtido.ordenes.receiver')}</th>
              <th className="table-header hidden xl:table-cell font-semibold">{t('surtido.ordenes.canal')}</th>
              <th className="table-header hidden 2xl:table-cell font-semibold">{t('surtido.ordenes.referencia')}</th>
              <th className="table-header text-right font-semibold">{t('surtido.ordenes.cajas')}</th>
              <th className="table-header font-semibold">{t('surtido.ordenes.surtidor')}</th>
              <th className="table-header font-semibold">{t('surtido.ordenes.status')}</th>
              <th className="table-header text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {records.map((r, i) => {
              const obc = r.outboundOrderNo
              const tracking = trackingMap[obc]
              const status = tracking?.status || 'pending_assignment'
              const meta = STATUS_META[status] ?? STATUS_META.pending_assignment
              const noSurtidor = !tracking?.surtidor_nombre
              const cliente = r.customerCode || r.customerNo || r.customerName || '—'
              const destino = r.receiverName || '—'
              const canal = r.logisticsChannel || '—'
              const referencia = r.thirdOrderNo || r.referenceNo || '—'
              const cajas = r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? '—'
              const loadingDetail = isLoadingDetail(obc)

              return (
                <tr key={obc || i} className={`transition-colors hover:bg-primary-50/20 ${noSurtidor ? 'bg-warning-50/20' : ''}`}>

                  <td className="table-cell"><CopyableObc obc={obc} /></td>

                  <td className="table-cell hidden lg:table-cell">
                    <span className="font-mono text-primary-700 text-xs font-semibold">{cliente}</span>
                  </td>

                  <td className="table-cell hidden xl:table-cell">
                    <span className="text-warm-600 text-xs flex items-center gap-1">
                      <Truck size={10} className="text-warm-300" />
                      <span className="truncate max-w-[100px] block">{destino}</span>
                    </span>
                  </td>

                  <td className="table-cell hidden xl:table-cell">
                    <span className="text-warm-600 text-xs truncate max-w-[120px] block">{canal}</span>
                  </td>

                  <td className="table-cell hidden 2xl:table-cell">
                    <span className="font-mono text-xs text-warm-600">{referencia}</span>
                  </td>

                  <td className="table-cell text-right">
                    <span className="font-semibold text-warm-700">{cajas}</span>
                  </td>

                  <td className="table-cell">
                    <button
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all hover:shadow-sm ${
                        noSurtidor
                          ? 'border-warning-300 text-warning-700 bg-warning-50 hover:border-warning-400'
                          : 'border-warm-200 text-warm-700 hover:border-primary-300 hover:text-primary-700'
                      }`}
                      onClick={e => { e.stopPropagation(); onAssign(r) }}>
                      <UserCheck size={11} />
                      <span className="max-w-[90px] truncate">
                        {tracking?.surtidor_nombre || t('surtido.ordenes.no_surtidor')}
                      </span>
                      <ChevronDown size={9} />
                    </button>
                  </td>

                  <td className="table-cell">
                    <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                  </td>

                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Ver detalles WMS"
                        className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                        onClick={e => { e.stopPropagation(); onDetail(obc) }}
                        disabled={loadingDetail}>
                        {loadingDetail ? <Loader2 size={13} className="animate-spin" /> : <Info size={13} />}
                      </button>
                      <button title="Ver progreso interno"
                        className="p-1.5 rounded-lg text-warm-400 hover:text-accent-600 hover:bg-accent-50 border border-transparent hover:border-accent-200 transition-all"
                        onClick={e => { e.stopPropagation(); onProgress(obc) }}>
                        <Activity size={13} />
                      </button>
                      <button title={t('surtido.ordenes.validate_btn')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                        onClick={e => { e.stopPropagation(); onValidate(obc) }}>
                        <Play size={11} /> {t('surtido.ordenes.validate_btn')}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <TablePagination
          page={page} totalPages={totalPages} pageSize={pageSize} totalItems={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          itemLabel={t('surtido.ordenes.item_label')}
        />
      )}
    </motion.div>
  )
}

function ValidacionTable({ records, wmsMap, onProgress, onValidate, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  return (
    <motion.div className="card overflow-hidden"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-warm-50 border-b border-warm-100">
              <th className="table-header font-semibold">OBC</th>
              <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.ordenes.cliente')}</th>
              <th className="table-header font-semibold">{t('surtido.ordenes.surtidor')}</th>
              <th className="table-header text-right font-semibold">{t('surtido.escaneo.scanned')}</th>
              <th className="table-header font-semibold">{t('surtido.ordenes.status')}</th>
              <th className="table-header text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {records.map((tr, i) => {
              const obc = tr.outbound_order_no
              const wms = wmsMap[obc]
              const status = tr.status || 'pending_assignment'
              const meta = STATUS_META[status] ?? STATUS_META.pending_assignment
              const total_expected = wms?.outboundBoxCount ?? wms?.packageCount ?? wms?.totalQty ?? tr.total_expected ?? '?'
              const scanned = tr.total_scanned ?? 0
              const pct = total_expected !== '?' && total_expected > 0
                ? Math.min(100, Math.round((scanned / total_expected) * 100))
                : null

              return (
                <tr key={obc || i} className="transition-colors hover:bg-primary-50/20">
                  <td className="table-cell"><CopyableObc obc={obc} /></td>
                  <td className="table-cell hidden lg:table-cell">
                    <span className="font-mono text-primary-700 text-xs font-semibold">
                      {wms?.customerCode || wms?.customerName || '—'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="text-warm-700 text-xs flex items-center gap-1">
                      <User size={10} className="text-warm-300" />
                      {tr.surtidor_nombre || '—'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-semibold text-warm-700 tabular-nums">{scanned}/{total_expected}</span>
                      {pct !== null && (
                        <div className="w-16 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? 'bg-success-500' : 'bg-primary-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Ver progreso interno"
                        className="p-1.5 rounded-lg text-warm-400 hover:text-accent-600 hover:bg-accent-50 border border-transparent hover:border-accent-200 transition-all"
                        onClick={e => { e.stopPropagation(); onProgress(obc) }}>
                        <Activity size={13} />
                      </button>
                      <button title={t('surtido.ordenes.validate_btn')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                        onClick={e => { e.stopPropagation(); onValidate(obc) }}>
                        <ScanBarcode size={11} /> {t('surtido.ordenes.validate_btn')}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <TablePagination
          page={page} totalPages={totalPages} pageSize={pageSize} totalItems={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          itemLabel={t('surtido.ordenes.item_label')}
        />
      )}
    </motion.div>
  )
}
