import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
  Clock, ScanBarcode, Package2, Activity, User, Timer,
  Loader2, AlertCircle, Eye, Truck, Calendar,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getScanSessions, getScanSession, getOutboundList } from '../services/surtidoService'

const STATUS_META = {
  open:               { labelKey: 'surtido.registros.status.open',               cls: 'bg-warning-100 text-warning-700' },
  complete:           { labelKey: 'surtido.registros.status.complete',           cls: 'bg-success-100 text-success-700' },
  with_discrepancies: { labelKey: 'surtido.registros.status.with_discrepancies', cls: 'bg-danger-100 text-danger-700' },
  cancelled:          { labelKey: 'surtido.registros.status.cancelled',          cls: 'bg-warm-100 text-warm-600' },
}

function durationLabel(startedAt, endedAt) {
  if (!startedAt) return '—'
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date()
  const secs = Math.max(0, Math.floor((end - start) / 1000))
  const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${secs % 60}s`
  return `${secs}s`
}

function fmtDt(v) {
  if (!v) return '—'
  return String(v).slice(0, 16).replace('T', ' ')
}

function fmtTime(v) {
  if (!v) return '—'
  return String(v).slice(11, 19)
}

function ObcHeader({ obc, status, t }) {
  const [copied, setCopied] = useState(false)
  const meta = STATUS_META[status] ?? STATUS_META.open
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono font-black text-warm-900 text-xl leading-none truncate">{obc || '—'}</span>
        {obc && (
          <button
            onClick={() => navigator.clipboard.writeText(obc).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
            className="shrink-0 p-1 rounded-md text-warm-300 hover:text-primary-600 transition-colors">
            {copied ? <Check size={14} className="text-success-600" /> : <Copy size={14} />}
          </button>
        )}
      </div>
      <span className={`badge text-[11px] font-semibold shrink-0 ${meta.cls}`}>{t(meta.labelKey)}</span>
    </div>
  )
}

function ScanTable({ events, showType = false, t }) {
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
            {showType && <th className="text-left px-3 py-2.5 font-bold text-warm-500">Tipo</th>}
            <th className="text-right px-3 py-2.5 font-bold text-warm-500">Hora</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {events.map((e, i) => (
            <tr key={e.id || i} className={`hover:bg-warm-50/50 transition-colors ${
              e.scan_result === 'duplicate' ? 'bg-warning-50/30' : ''
            }`}>
              <td className="px-3 py-2 text-warm-400 tabular-nums font-bold">{i + 1}</td>
              <td className="px-3 py-2 font-mono font-semibold text-warm-700">
                {e.normalized_code || e.scanned_code}
              </td>
              {showType && (
                <td className="px-3 py-2">
                  <span className={`badge text-[10px] ${
                    e.scan_result === 'duplicate' ? 'bg-warning-100 text-warning-700' : 'bg-danger-100 text-danger-700'
                  }`}>
                    {e.scan_result === 'duplicate' ? t('surtido.escaneo.match_duplicate') : t('surtido.escaneo.match_rejected')}
                  </span>
                </td>
              )}
              <td className="px-3 py-2 text-right text-warm-400 tabular-nums">
                {fmtTime(e.scanned_at || e.scan_time)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailModal({ sessionId, isOpen, onClose }) {
  const { t } = useI18nStore()
  const [detailTab, setDetailTab] = useState('validados')

  const { data, isLoading } = useQuery({
    queryKey: ['surtido-session-detail', sessionId],
    queryFn: () => getScanSession(sessionId),
    enabled: isOpen && !!sessionId,
    staleTime: 30000,
    onSuccess: () => setDetailTab('validados'),
  })

  // Correct data shape: { session: {...}, events: [...] }
  const session = data?.data?.session ?? {}
  const events  = data?.data?.events  ?? []

  // WMS data for destino + fecha entrega (uses cached list)
  const { data: wmsData } = useQuery({
    queryKey: ['upapex-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
    enabled: isOpen && !!session.outbound_order_no,
  })
  const wmsOrder = (wmsData?.data?.records ?? wmsData?.data ?? [])
    .find(r => r.outboundOrderNo === session.outbound_order_no)

  const validados  = events.filter(e => e.scan_result === 'ok')
  // rechazados = everything that is not ok (not_found + duplicate)
  const rechazados = events.filter(e => e.scan_result !== 'ok')

  const totalExpected = session.total_expected ?? 0
  const totalScanned  = session.total_scanned ?? validados.length
  const progress      = totalExpected > 0 ? Math.min(100, Math.round((totalScanned / totalExpected) * 100)) : 0

  const destino      = wmsOrder?.receiverName || wmsOrder?.consignee || '—'
  const fechaEntrega = wmsOrder?.expectedTime || wmsOrder?.outboundTime
    ? String(wmsOrder?.expectedTime || wmsOrder?.outboundTime).slice(0, 10)
    : '—'

  const handleClose = () => { setDetailTab('validados'); onClose() }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isLoading
        ? <span className="text-warm-400 text-sm">{t('common.loading')}</span>
        : <ObcHeader obc={session.outbound_order_no} status={session.status} t={t} />
      }
      icon={Activity}
      size="full"
      footer={<button className="btn-ghost" onClick={handleClose}><X size={14} /> {t('common.close')}</button>}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-warm-400">
          <Loader2 size={18} className="animate-spin" /> {t('common.loading')}
        </div>
      ) : (
        <div className="space-y-5">

          {/* Info grid — row 1: Estado, Validador, Duración, Validados */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1">{t('surtido.registros.status')}</p>
              <div className="mt-0.5">
                <span className={`badge text-xs font-semibold ${(STATUS_META[session.status] ?? STATUS_META.open).cls}`}>
                  {t((STATUS_META[session.status] ?? STATUS_META.open).labelKey)}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                <User size={9} /> {t('surtido.registros.operator')}
              </p>
              <p className="text-sm font-semibold text-warm-700 truncate">{session.operator_nombre || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                <Timer size={9} /> {t('surtido.registros.duration')}
              </p>
              <p className="text-sm font-semibold text-warm-700 font-mono">
                {durationLabel(session.started_at, session.ended_at ?? session.completed_at)}
              </p>
            </div>
            {/* Single quantity card: validated / total — % */}
            <div className={`p-3 rounded-xl border ${progress >= 100 ? 'bg-success-50 border-success-200' : 'bg-primary-50 border-primary-100'}`}>
              <p className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${progress >= 100 ? 'text-success-500' : 'text-primary-500'}`}>
                {t('surtido.registros.validated')}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-black leading-none ${progress >= 100 ? 'text-success-600' : 'text-primary-600'}`}>{totalScanned}</span>
                <span className={`text-xs font-semibold ${progress >= 100 ? 'text-success-400' : 'text-primary-400'}`}>/ {totalExpected}</span>
                <span className={`ml-auto text-sm font-black ${progress >= 100 ? 'text-success-600' : 'text-primary-600'}`}>{progress}%</span>
              </div>
              {totalExpected > 0 && (
                <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden mt-2">
                  <div className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-success-500' : 'bg-primary-500'}`}
                    style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Info grid — row 2: Inicio, Destino, Fecha entrega */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                <Clock size={9} /> {t('surtido.registros.detail.start')}
              </p>
              <p className="text-sm font-semibold text-warm-700 font-mono">{fmtDt(session.started_at)}</p>
            </div>
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                <Truck size={9} /> Destino
              </p>
              <p className="text-sm font-semibold text-warm-700 truncate">{destino}</p>
            </div>
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100/60">
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                <Calendar size={9} /> Fecha entrega
              </p>
              <p className="text-sm font-semibold text-warm-700 font-mono">{fechaEntrega}</p>
            </div>
          </div>

          {/* Notes */}
          {session.notes && (
            <div className="bg-warm-50 rounded-xl px-3 py-2.5 border border-warm-100 flex items-start gap-2">
              <AlertCircle size={13} className="text-warm-400 shrink-0 mt-0.5" />
              <p className="text-xs text-warm-700">{session.notes}</p>
            </div>
          )}

          {/* Discrepancy banner */}
          {rechazados.length > 0 && (
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-danger-700">
                {rechazados.length} {rechazados.length === 1 ? 'caja no validada' : 'cajas no validadas'} (rechazadas o duplicadas)
              </p>
            </div>
          )}

          {/* Tabs — sticky */}
          <div className="sticky top-0 z-10 bg-white -mx-1 px-1 flex gap-1 border-b border-warm-100">
            <button onClick={() => setDetailTab('validados')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                detailTab === 'validados' ? 'text-primary-600 border-primary-500' : 'text-warm-400 border-transparent hover:text-warm-600'
              }`}>
              <CheckCircle2 size={12} /> {t('surtido.registros.detail.validated')}
              <span className="bg-success-100 text-success-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case">{validados.length}</span>
            </button>
            <button onClick={() => setDetailTab('rechazados')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                detailTab === 'rechazados' ? 'text-primary-600 border-primary-500' : 'text-warm-400 border-transparent hover:text-warm-600'
              }`}>
              <XCircle size={12} /> {t('surtido.escaneo.tab_rechazados')}
              {rechazados.length > 0 && (
                <span className="bg-danger-100 text-danger-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case">{rechazados.length}</span>
              )}
            </button>
          </div>

          {/* Tab content */}
          {detailTab === 'validados'  && <ScanTable events={validados}  t={t} />}
          {detailTab === 'rechazados' && <ScanTable events={rechazados} t={t} showType />}

        </div>
      )}
    </Modal>
  )
}

export default function SurtidoRegistros() {
  const { t } = useI18nStore()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['surtido-sessions', { page, pageSize }],
    queryFn: () => getScanSessions({ page, pageSize }),
    staleTime: 30000,
  })

  const records = data?.data?.records ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize) || 1

  const filtered = search.trim()
    ? records.filter(r => {
        const q = search.toLowerCase()
        return (r.outbound_order_no || '').toLowerCase().includes(q)
            || (r.operator_nombre || '').toLowerCase().includes(q)
      })
    : records

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.registros.title')} subtitle={t('nav.surtido_wms')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('surtido.registros.title')} subtitle={t('nav.surtido_wms')} />

      <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5">
        <div className="relative max-w-sm">
          <ScanBarcode size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            type="text"
            className="input-field pl-9 text-sm h-9"
            placeholder={t('surtido.registros.search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
              <Package2 size={28} className="text-warm-300" />
            </div>
            <p className="text-sm text-warm-400 font-medium">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-warm-50 border-b border-warm-100">
                    <th className="table-header font-semibold">{t('surtido.registros.order_no')}</th>
                    <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.registros.operator')}</th>
                    <th className="table-header hidden md:table-cell font-semibold">{t('surtido.registros.date')}</th>
                    <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.registros.duration')}</th>
                    <th className="table-header text-right font-semibold">{t('surtido.registros.expected')}</th>
                    <th className="table-header text-right font-semibold">{t('surtido.registros.validated')}</th>
                    <th className="table-header text-right hidden md:table-cell font-semibold">{t('surtido.registros.rejected')}</th>
                    <th className="table-header font-semibold">{t('surtido.registros.status')}</th>
                    <th className="table-header text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {filtered.map(r => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.open
                    const rejected = Math.max(0, (r.total_expected ?? 0) - (r.total_scanned ?? 0))
                    const pct = r.total_expected > 0
                      ? Math.min(100, Math.round(((r.total_scanned ?? 0) / r.total_expected) * 100))
                      : null
                    return (
                      <tr key={r.id}
                        onClick={() => setDetailId(r.id)}
                        className="hover:bg-primary-50/20 transition-colors cursor-pointer">
                        <td className="table-cell">
                          <span className="font-mono font-bold text-primary-700 text-xs">{r.outbound_order_no || '—'}</span>
                        </td>
                        <td className="table-cell hidden lg:table-cell text-warm-600 text-xs">{r.operator_nombre || '—'}</td>
                        <td className="table-cell hidden md:table-cell">
                          <span className="text-warm-500 text-xs tabular-nums">
                            {(r.started_at || r.created_at || '').slice(0, 16).replace('T', ' ')}
                          </span>
                        </td>
                        <td className="table-cell hidden lg:table-cell">
                          <span className="text-warm-500 text-xs inline-flex items-center gap-1">
                            <Clock size={10} className="text-warm-300" />
                            {durationLabel(r.started_at, r.ended_at)}
                          </span>
                        </td>
                        <td className="table-cell text-right">
                          <span className="text-warm-500 text-xs tabular-nums">{r.total_expected ?? 0}</span>
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold text-success-600 text-sm tabular-nums">{r.total_scanned ?? 0}</span>
                            {pct !== null && (
                              <div className="w-12 h-1.5 bg-warm-100 rounded-full overflow-hidden hidden xl:block">
                                <div className={`h-full rounded-full ${pct >= 100 ? 'bg-success-500' : 'bg-primary-400'}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="table-cell text-right hidden md:table-cell">
                          <span className={`font-bold text-xs tabular-nums ${rejected > 0 ? 'text-danger-600' : 'text-warm-300'}`}>
                            {rejected}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                        </td>
                        <td className="table-cell text-right">
                          <button
                            className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                            onClick={e => { e.stopPropagation(); setDetailId(r.id) }}
                            title={t('common.show')}>
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
              itemLabel={t('surtido.historial.sessions')}
            />
          </div>
        )}
      </div>

      <DetailModal
        sessionId={detailId}
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}
