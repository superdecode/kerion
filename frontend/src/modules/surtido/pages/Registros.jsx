import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Eye, X,
  CheckCircle2, XCircle, AlertTriangle,
  Clock, ScanBarcode, Package2,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getScanSessions, getScanSession } from '../services/surtidoService'

const STATUS_META = {
  open:               { labelKey: 'surtido.registros.status.open',               cls: 'bg-warning-100 text-warning-700' },
  complete:           { labelKey: 'surtido.registros.status.complete',           cls: 'bg-success-100 text-success-700' },
  with_discrepancies: { labelKey: 'surtido.registros.status.with_discrepancies', cls: 'bg-danger-100 text-danger-700' },
  cancelled:          { labelKey: 'surtido.registros.status.cancelled',          cls: 'bg-warm-100 text-warm-600' },
}

const RESULT_META = {
  ok:        { labelKey: 'surtido.registros.result.ok',        icon: CheckCircle2, cls: 'text-success-600' },
  rejected:  { labelKey: 'surtido.registros.result.rejected',  icon: XCircle,      cls: 'text-danger-600' },
  duplicate: { labelKey: 'surtido.registros.result.duplicate', icon: AlertTriangle, cls: 'text-warning-600' },
}

function durationLabel(startedAt, endedAt) {
  if (!startedAt) return '—'
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date()
  const mins = Math.round((end - start) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function DetailModal({ sessionId, isOpen, onClose }) {
  const { t } = useI18nStore()
  const { data, isLoading } = useQuery({
    queryKey: ['surtido-session-detail', sessionId],
    queryFn: () => getScanSession(sessionId),
    enabled: isOpen && !!sessionId,
    staleTime: 30000,
  })
  const session = data?.data ?? {}
  const events = session.events ?? []
  const totalOk  = events.filter(e => e.result === 'ok').length
  const totalRej = events.filter(e => e.result === 'rejected').length
  const totalDup = events.filter(e => e.result === 'duplicate').length
  const notFound = [...new Set(events.filter(e => e.result === 'rejected').map(e => e.normalized_code || e.code))]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={session.outbound_order_no ? `OBC · ${session.outbound_order_no}` : t('surtido.registros.detail.title_fallback')}
      icon={ScanBarcode}
      footer={<button className="btn-ghost" onClick={onClose}><X size={14} /> {t('common.close')}</button>}
    >
      {isLoading ? (
        <div className="flex justify-center py-8"><LoadingSpinner /></div>
      ) : (
        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: t('surtido.registros.detail.operator'), value: session.operator_nombre },
              { label: t('surtido.registros.detail.duration'), value: durationLabel(session.started_at, session.ended_at) },
              { label: t('surtido.registros.detail.start'), value: session.started_at ? new Date(session.started_at).toLocaleString() : null },
              { label: t('surtido.registros.detail.status'), value: STATUS_META[session.status]?.labelKey ? t(STATUS_META[session.status].labelKey) : null },
            ].filter(i => i.value).map((item, i) => (
              <div key={i} className="bg-warm-50 rounded-lg px-3 py-2">
                <p className="text-warm-400 text-[10px] uppercase tracking-wide">{item.label}</p>
                <p className="font-semibold text-warm-800 truncate">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Counters */}
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="bg-success-50 rounded-xl py-3">
              <p className="text-2xl font-bold text-success-600 leading-none">{totalOk}</p>
              <p className="text-success-600 mt-1 font-medium">{t('surtido.registros.detail.validated')}</p>
            </div>
            <div className="bg-danger-50 rounded-xl py-3">
              <p className="text-2xl font-bold text-danger-600 leading-none">{totalRej}</p>
              <p className="text-danger-600 mt-1 font-medium">{t('surtido.registros.detail.rejected_count')}</p>
            </div>
            <div className="bg-warning-50 rounded-xl py-3">
              <p className="text-2xl font-bold text-warning-600 leading-none">{totalDup}</p>
              <p className="text-warning-600 mt-1 font-medium">{t('surtido.registros.detail.duplicated')}</p>
            </div>
          </div>

          {/* Not found codes */}
          {notFound.length > 0 && (
            <div className="bg-danger-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-danger-700 mb-2">
                {t('surtido.registros.detail.not_found')} ({notFound.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {notFound.map((code, i) => (
                  <span key={i} className="font-mono text-[10px] bg-white border border-danger-200 text-danger-700 rounded-md px-1.5 py-0.5">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {session.notes && (
            <div className="bg-warm-50 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-warm-400 uppercase tracking-wide mb-1">{t('surtido.registros.detail.notes')}</p>
              <p className="text-xs text-warm-700">{session.notes}</p>
            </div>
          )}

          {/* Event timeline */}
          <div>
            <p className="text-[10px] font-semibold text-warm-500 uppercase tracking-wide mb-2">
              {t('surtido.registros.detail.events')} ({events.length})
            </p>
            <div className="max-h-60 overflow-y-auto divide-y divide-warm-100 -mx-1 px-1">
              {events.length === 0 ? (
                <p className="text-xs text-warm-400 py-4 text-center">{t('surtido.registros.detail.no_events')}</p>
              ) : (
                events.map((ev, i) => {
                  const meta = RESULT_META[ev.result] ?? RESULT_META.rejected
                  const Icon = meta.icon
                  return (
                    <div key={i} className="flex items-center gap-2 py-2">
                      <Icon size={12} className={`shrink-0 ${meta.cls}`} />
                      <span className="font-mono text-xs flex-1 truncate text-warm-700">{ev.normalized_code || ev.code}</span>
                      <span className={`text-[10px] font-semibold shrink-0 ${meta.cls}`}>{t(meta.labelKey)}</span>
                      <span className="text-[10px] text-warm-400 shrink-0 tabular-nums">
                        {ev.scan_time ? new Date(ev.scan_time).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
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

      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-lg border-b border-warm-100 px-4 py-2.5 shadow-sm">
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
                  <tr className="bg-warm-50/60">
                    <th className="table-header font-semibold">{t('surtido.registros.order_no')}</th>
                    <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.registros.operator')}</th>
                    <th className="table-header hidden md:table-cell font-semibold">{t('surtido.registros.date')}</th>
                    <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.registros.duration')}</th>
                    <th className="table-header text-right font-semibold">{t('surtido.registros.expected')}</th>
                    <th className="table-header text-right font-semibold">{t('surtido.registros.validated')}</th>
                    <th className="table-header text-right hidden md:table-cell font-semibold">{t('surtido.registros.rejected')}</th>
                    <th className="table-header font-semibold">{t('surtido.registros.status')}</th>
                    <th className="table-header" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {filtered.map(r => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.cancelled
                    const rejected = Math.max(0, (r.total_expected ?? 0) - (r.total_scanned ?? 0))
                    return (
                      <tr key={r.id} className="hover:bg-primary-50/20 transition-colors">
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
                          <span className="font-bold text-success-600 text-sm tabular-nums">{r.total_scanned ?? 0}</span>
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
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                            onClick={() => setDetailId(r.id)}
                            title={t('common.show')}
                          >
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <TablePagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                itemLabel={t('surtido.historial.sessions')}
              />
            )}
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
