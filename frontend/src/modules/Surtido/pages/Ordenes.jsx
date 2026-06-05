import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  Search, UserCheck, Users, Plus, Trash2, X, ChevronDown, Play, Loader2,
  Package2, Truck, ScanBarcode, Copy, Check, Eye, ClipboardList,
  User, Clock, BarChart3, RefreshCw, Database, CheckCircle2,
  MapPin, Timer, XCircle, AlertCircle, Pencil, BadgeCheck, Download,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import {
  getOutboundList,
  getSurtidores, createSurtidor, deleteSurtidor,
  getOrderTracking, upsertOrderTracking, getScanSessions,
  getRecords,
} from '../services/surtidoService'
import { refreshSheet, getCacheTimestamp } from '../../WmsHub/services/googleSheetsService'

const STATUS_META = {
  pending_assignment: { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  sorting:            { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-primary-100 text-primary-700' },
  validating:         { labelKey: 'surtido.ordenes.status.validating',         cls: 'bg-accent-100 text-accent-700' },
  complete:           { labelKey: 'surtido.ordenes.status.complete',           cls: 'bg-success-100 text-success-700' },
  partial:            { labelKey: 'surtido.ordenes.status.partial',            cls: 'bg-warning-100 text-warning-700' },
  cancelled:          { labelKey: 'surtido.ordenes.status.cancelled',          cls: 'bg-danger-100 text-danger-700' },
  // legacy — kept for existing DB records
  assigned:           { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  pending_validation: { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-primary-100 text-primary-700' },
}

const STATUS_FILTER_KEYS = ['pending_assignment', 'sorting', 'validating', 'complete', 'partial', 'cancelled']
const TH_CLASS = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'
const getToday = () => new Date().toISOString().slice(0, 10)

function SurtidoresModal({ isOpen, onClose, canUpdate, canDelete }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')

  const { data } = useQuery({ queryKey: ['upapex-surtidores'], queryFn: getSurtidores, staleTime: 30000, enabled: isOpen })
  const surtidores = getRecords(data)

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
      footer={<button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>}
    >
      <div className="space-y-3">
        {canUpdate && (
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
        )}
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
              {canDelete && (
                <button className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                  onClick={() => delMut.mutate(s.id)}>
                  <Trash2 size={13} />
                </button>
              )}
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
  const surtidores = getRecords(data)
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

function QuickEditPanel({ obc, wmsRecord, tracking, surtidores, isOpen, onClose, onAssign, onStatusChange, t }) {
  const navigate = useNavigate()
  const [localSurtidorId, setLocalSurtidorId] = useState('')

  useEffect(() => {
    if (isOpen) {
      const current = surtidores.find(s => s.nombre === tracking?.surtidor_nombre)
      setLocalSurtidorId(current?.id ? String(current.id) : '')
    }
  }, [isOpen, tracking, surtidores])

  const status = tracking?.status || 'pending_assignment'
  const meta = STATUS_META[status] ?? STATUS_META.pending_assignment
  const cliente = wmsRecord?.customerCode || wmsRecord?.customerName || '—'
  const destino = wmsRecord?.receiverName || '—'
  const cajas = wmsRecord?.outboundBoxCount ?? wmsRecord?.packageCount ?? '—'
  const canal = wmsRecord?.logisticsChannel || '—'
  const referencia = wmsRecord?.thirdOrderNo || wmsRecord?.referenceNo || '—'
  const trackingNo = wmsRecord?.logisticsTrackNo || '—'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed top-16 inset-x-0 bottom-0 z-[30] bg-black/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            className="fixed top-16 right-0 bottom-0 w-[400px] bg-white shadow-depth z-[35] flex flex-col border-l border-warm-200"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-warm-100 bg-warm-50/60 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                <ClipboardList size={17} className="text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="code-main truncate">{obc || '—'}</p>
                <span className={`badge text-[10px] font-semibold mt-0.5 inline-block ${meta.cls}`}>{t(meta.labelKey)}</span>
              </div>
              <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Key info */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t('surtido.ordenes.cliente'),         value: cliente },
                  { label: t('surtido.ordenes.receiver'),        value: destino },
                  { label: t('surtido.ordenes.cajas'),           value: String(cajas) },
                  { label: t('surtido.ordenes.canal'),           value: canal },
                  { label: t('surtido.ordenes.referencia'),      value: referencia },
                  { label: t('surtido.ordenes.detail.tracking'), value: trackingNo, mono: true },
                ].map(item => (
                  <div key={item.label} className="rounded-xl bg-warm-50 border border-warm-100 px-3 py-2.5">
                    <p className="text-[10px] text-warm-400 uppercase tracking-wide font-bold mb-0.5">{item.label}</p>
                    <p className={`text-xs font-semibold text-warm-800 truncate ${item.mono ? 'font-mono' : ''}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Assign surtidor */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wider">{t('surtido.ordenes.surtidor')}</p>
                <div className="flex gap-2">
                  <select
                    value={localSurtidorId}
                    onChange={e => setLocalSurtidorId(e.target.value)}
                    className="flex-1 h-10 pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all cursor-pointer"
                  >
                    <option value="">{t('surtido.ordenes.no_surtidor')}</option>
                    {surtidores.map(s => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
                  </select>
                  <button
                    onClick={() => onAssign(localSurtidorId ? Number(localSurtidorId) : null)}
                    className="px-4 h-10 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors shrink-0"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>

              {/* Change status */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wider">{t('surtido.ordenes.status')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_FILTER_KEYS.map(k => {
                    const m = STATUS_META[k]
                    const isActive = status === k
                    return (
                      <button
                        key={k}
                        onClick={() => { onStatusChange([obc], k) }}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          isActive
                            ? `${m.cls} border-current ring-1 ring-current/30`
                            : 'bg-warm-50 text-warm-500 border-warm-200 hover:border-warm-300 hover:text-warm-700'
                        }`}
                      >
                        {t(m.labelKey)}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-warm-100 bg-warm-50/40 flex items-center gap-2 shrink-0">
              <button
                onClick={() => { onClose(); navigate(`/Surtido/ordenes/${encodeURIComponent(obc)}`) }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold bg-warm-100 text-warm-700 hover:bg-warm-200 transition-colors"
              >
                <Eye size={14} /> {t('admin.view')}
              </button>
              {status !== 'complete' && (
                <button
                  onClick={() => { onClose(); navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`) }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                >
                  <ScanBarcode size={14} /> {t('surtido.ordenes.validate_btn')}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

const SESSION_STATUS = {
  complete:           { cls: 'bg-success-100 text-success-700',  label: 'Completa' },
  with_discrepancies: { cls: 'bg-warning-100 text-warning-700',  label: 'Con diferencias' },
  validating:         { cls: 'bg-primary-100 text-primary-700',  label: 'En curso' },
}

function fmtDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

function ObcCopyHeader({ obc, meta, t }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono font-black text-warm-900 text-xl leading-none truncate">{obc}</span>
        <button
          onClick={() => navigator.clipboard.writeText(obc).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
          className="shrink-0 p-1 rounded-md text-warm-300 hover:text-primary-600 transition-colors">
          {copied ? <Check size={14} className="text-success-600" /> : <Copy size={14} />}
        </button>
      </div>
      <span className={`badge text-[11px] font-semibold shrink-0 ${meta.cls}`}>{t(meta.labelKey)}</span>
    </div>
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
            <th className="table-header">#</th>
            <th className="table-header">{t('surtido.validacion.code_header')}</th>
            {showResult && <th className="table-header">Tipo</th>}
            <th className="table-header text-right">Hora escaneo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {events.map((e, i) => (
            <tr key={e.id || i} className={`table-row ${
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
      <span className="code-main">{obc || '—'}</span>
      {obc && (
        <button onClick={handleCopy}
          className="opacity-0 group-hover/obc:opacity-100 p-0.5 rounded text-warm-400 hover:text-primary-600 transition-all">
          {copied ? <Check size={11} className="text-success-600" /> : <Copy size={11} />}
        </button>
      )}
    </div>
  )
}

function StatusTabs({ selected, onChange, t }) {
  return (
    <div className="flex gap-0 border-b border-warm-100 bg-white/60">
      <button
        onClick={() => onChange('')}
        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
          !selected
            ? 'border-primary-500 text-primary-700'
            : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
        }`}>
        {t('common.all')}
      </button>
      {STATUS_FILTER_KEYS.map(k => {
        const v = STATUS_META[k]
        return (
          <button key={k} onClick={() => onChange(k === selected ? '' : k)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
              selected === k
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
            }`}>
            {t(v.labelKey)}
          </button>
        )
      })}
    </div>
  )
}



export default function Ordenes() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const canCreateValidation = hasPermission('surtido.validacion', 'crear')
  const canUpdateOrders = hasPermission('surtido.ordenes', 'actualizar')
  const canDeleteOrders = hasPermission('surtido.ordenes', 'eliminar')
  const canExportOrders = canUpdateOrders

  const [tab, setTab] = useState('wms')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSurtidor, setFilterSurtidor] = useState('')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState('')
  const [showSurtidoresModal, setShowSurtidoresModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)
  const [quickEditObc, setQuickEditObc] = useState(null)

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

  const allWmsRecords = getRecords(wmsData)
  const trackingList  = getRecords(trackingData)
  const surtidores    = getRecords(surtidoresData)

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
      ...(!surtidorId ? { status: 'pending_assignment' } : {}),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['upapex-order-tracking'] }); toast.success(t('common.save') + ' OK') },
    onError: () => toast.error(t('toast.error')),
  })

  const statusMut = useMutation({
    mutationFn: ({ obcs, status }) => Promise.all(obcs.map(obc => upsertOrderTracking(obc, { status }))),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['upapex-order-tracking'] })
      if (vars.obcs.length > 1) toast.success(`${vars.obcs.length} ${t('surtido.ordenes.item_label')} actualizadas`)
    },
    onError: () => toast.error(t('toast.error')),
  })

  function clearFilters() {
    setFilterStatus(''); setFilterSurtidor(''); setSearch('')
  }

  const hasFilters = filterStatus || filterSurtidor || search

  function buildWmsRows(records) {
    return records.map(r => {
      const tr = trackingMap[r.outboundOrderNo] ?? {}
      return [
        r.outboundOrderNo || '',
        r.customerCode || r.customerName || '',
        r.receiverName || '',
        r.logisticsChannel || '',
        r.thirdOrderNo || r.referenceNo || '',
        r.logisticsTrackNo || r.trackingNo || '',
        r.outboundBoxCount ?? r.packageCount ?? '',
        tr.surtidor_nombre || '',
        tr.status || 'pending_assignment',
        r.orderCreateTime || '',
      ]
    })
  }

  function buildValidacionRows(records) {
    return records.map(tr => {
      const wms = wmsMap[tr.outbound_order_no] ?? {}
      return [
        tr.outbound_order_no || '',
        wms.customerCode || wms.customerName || '',
        tr.surtidor_nombre || '',
        tr.total_scanned ?? 0,
        tr.total_expected ?? '',
        tr.status || '',
        tr.updated_at || '',
      ]
    })
  }

  const WMS_HEADERS = ['OBC', 'Cliente', 'Destinatario', 'Canal', 'Referencia', 'Tracking', 'Cajas', 'Surtidor', 'Estado', 'Fecha creación']
  const VAL_HEADERS = ['OBC', 'Cliente', 'Surtidor', 'Escaneado', 'Esperado', 'Estado', 'Actualizado']

  function exportSheet(headers, rows, sheetName, filename) {
    try {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, filename)
      toast.success(t('common.export') + ' OK')
    } catch { toast.error(t('toast.error')) }
  }

  function handleExportWmsSelected(obcs) {
    const rows = buildWmsRows(allWmsRecords.filter(r => obcs.includes(r.outboundOrderNo)))
    exportSheet(WMS_HEADERS, rows, 'Órdenes WMS', `ordenes_wms_${getToday()}.xlsx`)
  }

  function handleExportWmsAll() {
    exportSheet(WMS_HEADERS, buildWmsRows(filteredWms), 'Órdenes WMS', `ordenes_wms_${getToday()}.xlsx`)
  }

  function handleExportValSelected(obcs) {
    const rows = buildValidacionRows(filteredValidacion.filter(tr => obcs.includes(tr.outbound_order_no)))
    exportSheet(VAL_HEADERS, rows, 'Validación', `validacion_${getToday()}.xlsx`)
  }

  function handleExportValAll() {
    exportSheet(VAL_HEADERS, buildValidacionRows(filteredValidacion), 'Validación', `validacion_${getToday()}.xlsx`)
  }

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
            {canUpdateOrders && (
              <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => setShowSurtidoresModal(true)}>
                <Users size={14} /> {t('surtido.ordenes.manage_surtidores')}
              </button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {tabs.map(item => (
              <button key={item.key}
                onClick={() => { setTab(item.key); setPage(1) }}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-200 ${
                  tab === item.key
                    ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                    : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="sticky top-[3.5rem] z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5">
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
              <Clock size={13} className="text-warm-400 shrink-0" />
              <input type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
            </div>

            {surtidores.length > 0 && (
              <select
                className="h-10 pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:shadow-sm transition-all cursor-pointer"
                value={filterSurtidor}
                onChange={e => setFilterSurtidor(e.target.value)}
              >
                <option value="">{t('surtido.ordenes.surtidor')} — {t('common.all')}</option>
                {surtidores.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            )}

            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[260px] flex-1 max-w-xs transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
              <Search size={13} className="text-warm-400 shrink-0" />
              <input
                type="text"
                className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder={t('surtido.ordenes.search_placeholder')}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>

            {hasFilters && (
              <button
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                onClick={clearFilters}
              >
                <X className="w-3 h-3" /> {t('common.clear')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canExportOrders && (
              <button
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 h-10 rounded-xl bg-success-50 text-success-700 border border-success-200 hover:bg-success-100 transition-all"
                onClick={() => tab === 'wms' ? handleExportWmsAll() : handleExportValAll()}
                title={`${t('common.export')} ${t('common.all')}`}
              >
                <Download size={13} /> {t('common.export')}
              </button>
            )}
            {canCreateValidation && (
              <button
                className="btn-primary inline-flex items-center gap-2 text-sm py-2 px-4 h-10"
                onClick={() => navigate('/Surtido/validacion')}
              >
                <BadgeCheck size={15} />
                {t('surtido.ordenes.validate_btn')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sticky top-[7.1rem] z-[4] bg-white/70 backdrop-blur-2xl border-b border-warm-100/40 px-6">
        <StatusTabs selected={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1) }} t={t} />
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {pagedRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-warm-400">
            <Package2 size={40} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        ) : tab === 'wms' ? (
          <WmsTable
            records={pagedRecords} trackingMap={trackingMap}
            onAssign={r => setAssignTarget(r)}
            onView={obc => navigate(`/Surtido/ordenes/${encodeURIComponent(obc)}`)}
            onQuickEdit={obc => setQuickEditObc(obc)}
            onValidate={obc => navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`)}
            onExportSelected={handleExportWmsSelected}
            onExportAll={handleExportWmsAll}
            canAssign={canUpdateOrders}
            canQuickEdit={canUpdateOrders}
            canValidate={canCreateValidation}
            canExport={canExportOrders}
            t={t}
            page={page} totalPages={totalPages} pageSize={pageSize} total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        ) : (
          <ValidacionTable
            records={pagedRecords} wmsMap={wmsMap}
            onView={obc => navigate(`/Surtido/ordenes/${encodeURIComponent(obc)}`)}
            onQuickEdit={obc => setQuickEditObc(obc)}
            onValidate={obc => navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`)}
            onStatusChange={(obcs, status) => statusMut.mutate({ obcs, status })}
            onExportSelected={handleExportValSelected}
            onExportAll={handleExportValAll}
            canQuickEdit={canUpdateOrders}
            canValidate={canCreateValidation}
            canUpdateStatus={canUpdateOrders}
            canExport={canExportOrders}
            t={t}
            page={page} totalPages={totalPages} pageSize={pageSize} total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        )}
      </div>

<SurtidoresModal
        isOpen={showSurtidoresModal}
        onClose={() => setShowSurtidoresModal(false)}
        canUpdate={canUpdateOrders}
        canDelete={canDeleteOrders}
      />

      <AssignModal
        isOpen={!!assignTarget} order={assignTarget}
        onClose={() => setAssignTarget(null)}
        onAssign={(surtidorId) => {
          if (!assignTarget) return
          assignMut.mutate({ obc: assignTarget.outboundOrderNo || assignTarget.outbound_order_no, surtidorId })
        }}
      />

      <QuickEditPanel
        obc={quickEditObc}
        wmsRecord={wmsMap[quickEditObc]}
        tracking={trackingMap[quickEditObc]}
        surtidores={surtidores}
        isOpen={!!quickEditObc}
        onClose={() => setQuickEditObc(null)}
        onAssign={(surtidorId) => {
          if (!quickEditObc) return
          assignMut.mutate({ obc: quickEditObc, surtidorId })
        }}
        onStatusChange={(obcs, status) => statusMut.mutate({ obcs, status })}
        t={t}
      />
    </div>
  )
}

function WmsTable({ records, trackingMap, onAssign, onView, onQuickEdit, onValidate, onExportSelected, onExportAll, canAssign, canQuickEdit, canValidate, canExport, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  const [selected, setSelected] = useState(new Set())
  useEffect(() => { setSelected(new Set()) }, [page])
  const allChecked = records.length > 0 && records.every(r => selected.has(r.outboundOrderNo))
  const someChecked = selected.size > 0
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allChecked) records.forEach(r => next.delete(r.outboundOrderNo))
    else records.forEach(r => next.add(r.outboundOrderNo))
    return next
  })
  const toggleRow = (obc) => setSelected(prev => {
    const next = new Set(prev)
    next.has(obc) ? next.delete(obc) : next.add(obc)
    return next
  })

  return (
    <motion.div className="card overflow-hidden table-shell"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

      {someChecked && canExport && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100">
          <span className="text-xs text-primary-700 font-semibold tabular-nums">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors"
            onClick={() => { onExportSelected([...selected]); setSelected(new Set()) }}>
            <Download size={12} /> {t('common.export')} ({selected.size})
          </button>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-success-700 border border-success-200 hover:bg-success-50 transition-colors"
            onClick={onExportAll}>
            <Download size={12} /> {t('common.export')} {t('common.all')}
          </button>
          <button
            className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors ml-auto"
            onClick={() => setSelected(new Set())}>
            <X className="w-3 h-3" /> {t('common.clear')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto table-scroll">
        <table className="w-full text-sm">
          <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
            <tr>
              <th className={`${TH_CLASS} w-8`}>
                <input type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                  onChange={toggleAll}
                  className="rounded border-warm-300 text-primary-600 cursor-pointer"
                  onClick={e => e.stopPropagation()} />
              </th>
              <th className={TH_CLASS}><span className={TH_TEXT}>OBC</span></th>
              <th className={`${TH_CLASS} hidden lg:table-cell`}><span className={TH_TEXT}>{t('surtido.ordenes.cliente')}</span></th>
              <th className={`${TH_CLASS} hidden xl:table-cell`}><span className={TH_TEXT}>{t('surtido.ordenes.receiver')}</span></th>
              <th className={`${TH_CLASS} hidden xl:table-cell`}><span className={TH_TEXT}>{t('surtido.ordenes.canal')}</span></th>
              <th className={`${TH_CLASS} hidden 2xl:table-cell`}><span className={TH_TEXT}>{t('surtido.ordenes.referencia')}</span></th>
              <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('surtido.ordenes.cajas')}</span></th>
              <th className={TH_CLASS}><span className={TH_TEXT}>{t('surtido.ordenes.surtidor')}</span></th>
              <th className={TH_CLASS}><span className={TH_TEXT}>{t('surtido.ordenes.status')}</span></th>
              <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>Acciones</span></th>
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

              const isChecked = selected.has(obc)
              return (
                <tr key={obc || i}
                  onClick={() => onView(obc)}
                  className={`transition-colors cursor-pointer hover:bg-primary-50/30 ${isChecked ? 'bg-primary-50/20' : noSurtidor ? 'bg-warning-50/20' : ''}`}>

                  <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRow(obc)}
                      className="rounded border-warm-300 text-primary-600 cursor-pointer"
                      onClick={e => e.stopPropagation()} />
                  </td>

                  <td className="table-cell"><CopyableObc obc={obc} /></td>

                  <td className="table-cell hidden lg:table-cell">
                    <span className="font-mono text-xs font-semibold text-primary-700 truncate">{cliente}</span>
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
                    {canAssign ? (
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
                    ) : (
                      <span className="text-warm-600 text-xs">{tracking?.surtidor_nombre || '—'}</span>
                    )}
                  </td>

                  <td className="table-cell">
                    <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                  </td>

                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title={t('admin.view')}
                        className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                        onClick={e => { e.stopPropagation(); onView(obc) }}>
                        <Eye size={13} />
                      </button>
                      {canQuickEdit && (
                        <button title="Edición rápida"
                          className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onQuickEdit(obc) }}>
                          <ClipboardList size={13} />
                        </button>
                      )}
                      {canValidate && tracking?.status !== 'complete' && (
                        <button title={t('surtido.ordenes.validate_btn')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 hover:text-primary-800 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onValidate(obc) }}>
                          <ScanBarcode size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page} totalPages={totalPages} pageSize={pageSize} totalItems={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel={t('surtido.ordenes.item_label')}
      />
    </motion.div>
  )
}

function ValidacionTable({ records, wmsMap, onView, onQuickEdit, onValidate, onStatusChange, onExportSelected, onExportAll, canQuickEdit, canValidate, canUpdateStatus, canExport, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  const [selected, setSelected] = useState(new Set())
  const [editStatusObc, setEditStatusObc] = useState(null)

  useEffect(() => { setSelected(new Set()) }, [page])

  const allChecked = records.length > 0 && records.every(r => selected.has(r.outbound_order_no))
  const someChecked = selected.size > 0

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) records.forEach(r => next.delete(r.outbound_order_no))
      else records.forEach(r => next.add(r.outbound_order_no))
      return next
    })
  }

  const toggleRow = (obc) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(obc)) next.delete(obc); else next.add(obc)
      return next
    })
  }

  return (
    <motion.div className="card overflow-hidden table-shell"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

      {someChecked && (canUpdateStatus || canExport) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100">
          <span className="text-xs text-primary-700 font-semibold tabular-nums">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          {canUpdateStatus && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
              onClick={() => { onStatusChange([...selected], 'sorting'); setSelected(new Set()) }}>
              <ScanBarcode size={12} /> Marcar Surtido
            </button>
          )}
          {canExport && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors"
              onClick={() => { onExportSelected([...selected]); setSelected(new Set()) }}>
              <Download size={12} /> {t('common.export')} ({selected.size})
            </button>
          )}
          {canExport && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-success-700 border border-success-200 hover:bg-success-50 transition-colors"
              onClick={onExportAll}>
              <Download size={12} /> {t('common.export')} {t('common.all')}
            </button>
          )}
          <button
            className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors ml-auto"
            onClick={() => setSelected(new Set())}>
            <X className="w-3 h-3" /> {t('common.clear')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto table-scroll">
        <table className="w-full text-sm">
          <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
            <tr>
              <th className={`${TH_CLASS} w-8`}>
                <input type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                  onChange={toggleAll}
                  className="rounded border-warm-300 text-primary-600 cursor-pointer"
                  onClick={e => e.stopPropagation()} />
              </th>
              <th className={TH_CLASS}><span className={TH_TEXT}>OBC</span></th>
              <th className={`${TH_CLASS} hidden lg:table-cell`}><span className={TH_TEXT}>{t('surtido.ordenes.cliente')}</span></th>
              <th className={TH_CLASS}><span className={TH_TEXT}>{t('surtido.ordenes.surtidor')}</span></th>
              <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('surtido.escaneo.scanned')}</span></th>
              <th className={TH_CLASS}><span className={TH_TEXT}>{t('surtido.ordenes.status')}</span></th>
              <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>Acciones</span></th>
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
              const isChecked = selected.has(obc)
              const isEditingStatus = editStatusObc === obc

              return (
                <tr key={obc || i}
                  onClick={() => onView(obc)}
                  className={`transition-colors cursor-pointer hover:bg-primary-50/30 ${isChecked ? 'bg-primary-50/20' : ''}`}>

                  <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRow(obc)}
                      className="rounded border-warm-300 text-primary-600 cursor-pointer"
                      onClick={e => e.stopPropagation()} />
                  </td>

                  <td className="table-cell"><CopyableObc obc={obc} /></td>
                  <td className="table-cell hidden lg:table-cell">
                    <span className="font-mono text-xs font-semibold text-primary-700 truncate">
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
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    {canUpdateStatus && isEditingStatus ? (
                      <select
                        autoFocus
                        defaultValue={status}
                        onChange={e => { onStatusChange([obc], e.target.value); setEditStatusObc(null) }}
                        onBlur={() => setEditStatusObc(null)}
                        className="text-xs rounded-lg border border-primary-300 outline-none focus:border-primary-500 px-1.5 py-1 text-warm-700 bg-white">
                        {STATUS_FILTER_KEYS.map(k => (
                          <option key={k} value={k}>{t(STATUS_META[k].labelKey)}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1.5 group/statusEdit">
                        <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                        {canUpdateStatus && (
                          <button
                            title="Editar estado"
                            onClick={e => { e.stopPropagation(); setEditStatusObc(obc) }}
                            className="opacity-0 group-hover/statusEdit:opacity-100 p-0.5 rounded text-warm-300 hover:text-warm-600 transition-all">
                            <Pencil size={10} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title={t('admin.view')}
                        className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                        onClick={e => { e.stopPropagation(); onView(obc) }}>
                        <Eye size={13} />
                      </button>
                      {canQuickEdit && (
                        <button title="Edición rápida"
                          className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onQuickEdit(obc) }}>
                          <ClipboardList size={13} />
                        </button>
                      )}
                      {canValidate && status !== 'complete' && (
                        <button title={t('surtido.ordenes.validate_btn')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 hover:text-primary-800 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onValidate(obc) }}>
                          <ScanBarcode size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page} totalPages={totalPages} pageSize={pageSize} totalItems={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel={t('surtido.ordenes.item_label')}
      />
    </motion.div>
  )
}
