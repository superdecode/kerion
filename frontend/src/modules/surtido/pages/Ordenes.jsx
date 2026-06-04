import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, UserCheck, Users, Plus, Trash2, X, ChevronDown, Play, Loader2,
  Package2, Calendar, Truck, ScanBarcode, Copy, Check, Info, Activity,
  User, Clock, BarChart3, RefreshCw,
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
  getOrderTracking, upsertOrderTracking, getScanSessions,
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

const fmtDate = (v) => {
  if (!v) return '—'
  const s = String(v)
  if (s.length <= 10) return s || '—'
  const date = s.slice(0, 10)
  const time = s.slice(11, 16)
  return time ? `${date} ${time}` : date
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
    { label: t('surtido.ordenes.fecha_creacion'), value: fmtDate(order.orderCreateTime) },
    { label: t('surtido.ordenes.fecha_entrega'),  value: fmtDate(d?.expectedTime || order.outboundTime) },
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

function ProgressModal({ obc, tracking, onClose }) {
  const { t } = useI18nStore()
  const status = tracking?.status || 'pending_assignment'
  const meta = STATUS_META[status] ?? STATUS_META.pending_assignment

  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['upapex-scan-sessions-obc', obc],
    queryFn: () => getScanSessions({ outbound_order_no: obc, pageSize: 50 }),
    enabled: !!obc,
    staleTime: 30000,
  })
  const sessions = sessionsData?.data?.records ?? sessionsData?.data ?? []

  return (
    <Modal isOpen={!!obc} onClose={onClose} title="Progreso interno" icon={Activity}
      footer={<button className="btn-ghost" onClick={onClose}><X size={14} /> {t('common.close')}</button>}
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-warm-50 rounded-lg px-3 py-2.5">
            <p className="text-warm-400 text-[10px] uppercase tracking-wide mb-1">{t('surtido.ordenes.status')}</p>
            <span className={`badge text-[11px] font-semibold ${meta.cls}`}>{t(meta.labelKey)}</span>
          </div>
          <div className="bg-warm-50 rounded-lg px-3 py-2.5">
            <p className="text-warm-400 text-[10px] uppercase tracking-wide mb-1">{t('surtido.ordenes.surtidor')}</p>
            <p className="font-semibold text-warm-800 flex items-center gap-1">
              <User size={11} className="text-warm-400" />
              {tracking?.surtidor_nombre || '—'}
            </p>
          </div>
          <div className="bg-warm-50 rounded-lg px-3 py-2.5">
            <p className="text-warm-400 text-[10px] uppercase tracking-wide mb-1">Sesiones</p>
            <p className="font-bold text-warm-800 text-base">{tracking?.session_count ?? 0}</p>
          </div>
          <div className="bg-warm-50 rounded-lg px-3 py-2.5">
            <p className="text-warm-400 text-[10px] uppercase tracking-wide mb-1">Escaneados</p>
            <p className="font-bold text-primary-700 text-base">{tracking?.total_scanned ?? 0}</p>
          </div>
        </div>

        {tracking?.notes && (
          <div className="bg-warm-50 rounded-lg px-3 py-2.5">
            <p className="text-warm-400 text-[10px] uppercase tracking-wide mb-1">Notas</p>
            <p className="text-warm-700">{tracking.notes}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-6 gap-2 text-warm-400">
            <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
          </div>
        ) : sessions.length > 0 ? (
          <div>
            <p className="font-semibold text-warm-500 mb-2 uppercase tracking-wider text-[10px] flex items-center gap-1">
              <BarChart3 size={10} /> Sesiones de validacion ({sessions.length})
            </p>
            <div className="space-y-2">
              {sessions.map((s, i) => (
                <div key={s.id || i} className="bg-warm-50 rounded-lg px-3 py-2.5 border border-warm-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge text-[10px] ${
                      s.status === 'complete' ? 'bg-success-100 text-success-700' :
                      s.status === 'with_discrepancies' ? 'bg-warning-100 text-warning-700' :
                      'bg-primary-100 text-primary-700'
                    }`}>{s.status}</span>
                    <span className="text-warm-400 text-[10px] flex items-center gap-1">
                      <Clock size={9} /> {String(s.started_at || '').slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-warm-600">
                    <span>{s.operator_nombre || '—'}</span>
                    <span className="text-warm-300">|</span>
                    <span>{s.total_scanned ?? 0} / {s.total_expected ?? '?'} escaneados</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-warm-400 py-4">{t('common.noData')}</p>
        )}
      </div>
    </Modal>
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

export default function Ordenes() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSurtidor, setFilterSurtidor] = useState('')
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

  const allRecords = wmsData?.data?.records ?? wmsData?.data ?? []

  const trackingMap = (trackingData?.data ?? []).reduce((m, tr) => {
    m[tr.outbound_order_no] = tr; return m
  }, {})

  const surtidores = surtidoresData?.data ?? []

  const q = search.trim().toLowerCase()
  const filteredRecords = allRecords.filter(r => {
    const tracking = trackingMap[r.outboundOrderNo]
    if (filterStatus && (tracking?.status || 'pending_assignment') !== filterStatus) return false
    if (filterSurtidor && tracking?.surtidor_nombre !== filterSurtidor) return false
    if (q) {
      const haystack = [r.outboundOrderNo, r.customerCode, r.thirdOrderNo, r.receiverName, r.logisticsChannel].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const total = filteredRecords.length
  const totalPages = Math.ceil(total / pageSize) || 1
  const pagedRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize)

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
      const row = allRecords.find(r => r.outboundOrderNo === obc)
      setWmsDetailOrder(row ? { ...row, _detail: data?.data } : { outboundOrderNo: obc, _detail: data?.data })
    },
    onError: () => toast.error(t('toast.error')),
  })

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

      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-lg border-b border-warm-100 px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <div className="relative flex-1 min-w-44 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input type="text" className="input-field pl-8 text-sm h-9"
            placeholder={t('surtido.ordenes.search_placeholder')}
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input-field text-sm h-9 w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{t('surtido.ordenes.status')} — {t('common.all')}</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{t(v.labelKey)}</option>)}
        </select>
        {surtidores.length > 0 && (
          <select className="input-field text-sm h-9 w-auto" value={filterSurtidor} onChange={e => setFilterSurtidor(e.target.value)}>
            <option value="">{t('surtido.ordenes.surtidor')} — {t('common.all')}</option>
            {surtidores.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
          </select>
        )}
        {(filterStatus || filterSurtidor || search) && (
          <button className="btn-ghost text-xs h-9 px-2" onClick={() => { setFilterStatus(''); setFilterSurtidor(''); setSearch('') }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {pagedRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-warm-400">
            <Package2 size={40} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-warm-50/60">
                    <th className="table-header font-semibold">OBC</th>
                    <th className="table-header hidden md:table-cell font-semibold">{t('surtido.ordenes.fecha_creacion')}</th>
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
                  {pagedRecords.map((r, i) => {
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
                    const isLoadingDetail = loadDetailMut.isPending && loadDetailMut.variables === obc

                    return (
                      <tr key={obc || i}
                        className={`transition-colors hover:bg-primary-50/20 ${noSurtidor ? 'bg-warning-50/20' : ''}`}>

                        <td className="table-cell"><CopyableObc obc={obc} /></td>

                        <td className="table-cell hidden md:table-cell">
                          <span className="text-warm-500 text-xs flex items-center gap-1">
                            <Calendar size={10} className="text-warm-300" />
                            {fmtDate(r.orderCreateTime)}
                          </span>
                        </td>

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
                            onClick={e => { e.stopPropagation(); setAssignTarget(r) }}>
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
                              onClick={e => { e.stopPropagation(); loadDetailMut.mutate(obc) }}
                              disabled={isLoadingDetail}>
                              {isLoadingDetail ? <Loader2 size={13} className="animate-spin" /> : <Info size={13} />}
                            </button>
                            <button title="Ver progreso interno"
                              className="p-1.5 rounded-lg text-warm-400 hover:text-accent-600 hover:bg-accent-50 border border-transparent hover:border-accent-200 transition-all"
                              onClick={e => { e.stopPropagation(); setProgressObc(obc) }}>
                              <Activity size={13} />
                            </button>
                            <button title={t('surtido.ordenes.validate_btn')}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                              onClick={e => { e.stopPropagation(); navigate(`/surtido/validacion?obc=${encodeURIComponent(obc)}`) }}>
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
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                itemLabel={t('surtido.ordenes.item_label')}
              />
            )}
          </div>
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

      <ProgressModal
        obc={progressObc}
        tracking={progressObc ? trackingMap[progressObc] : null}
        onClose={() => setProgressObc(null)}
      />
    </div>
  )
}
