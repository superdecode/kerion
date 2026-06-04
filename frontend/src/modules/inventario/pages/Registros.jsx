import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Trash2, CheckCircle2, AlertTriangle, Ban, X, Package2, Loader2 } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { getInventorySessions, getInventorySession, deleteInventorySession } from '../services/inventarioService'

const STATUS_META_KEYS = {
  ok:      { labelKey: 'inventario.escaneo.group_disponible', icon: CheckCircle2, bg: 'bg-success-100 text-success-700' },
  blocked: { labelKey: 'inventario.escaneo.group_bloqueado',  icon: AlertTriangle, bg: 'bg-warning-100 text-warning-700' },
  nowms:   { labelKey: 'inventario.escaneo.group_nowms',      icon: Ban, bg: 'bg-danger-100 text-danger-700' },
}

function DetailModal({ session, isOpen, onClose }) {
  const { t } = useI18nStore()
  const { data, isLoading } = useQuery({
    queryKey: ['upapex-inventory-session', session?.id],
    queryFn: () => getInventorySession(session.id),
    enabled: isOpen && !!session?.id,
    staleTime: 30000,
  })
  const scans = data?.data?.scans ?? []

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('inventario.registros.detail')} · ${session?.scan_type === 'clasificacion' ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')}`}
      icon={Eye}
      footer={<button className="btn-ghost" onClick={onClose}><X size={14} /> {t('common.close')}</button>}
    >
      {isLoading ? (
        <div className="flex justify-center py-8"><LoadingSpinner /></div>
      ) : (
        <div className="space-y-4">
          {/* Summary counters */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {['ok', 'blocked', 'nowms'].map(s => {
              const meta = STATUS_META_KEYS[s]
              const count = scans.filter(sc => sc.scan_status === s).length
              return (
                <div key={s} className={`rounded-xl px-3 py-3 text-center ${meta.bg}`}>
                  <p className="text-2xl font-bold leading-none">{count}</p>
                  <p className="mt-1 font-medium">{t(meta.labelKey)}</p>
                </div>
              )
            })}
          </div>

          {/* Scan list */}
          <div className="divide-y divide-warm-100 max-h-80 overflow-y-auto -mx-1 px-1">
            {scans.length === 0 ? (
              <p className="text-xs text-warm-400 text-center py-6">{t('common.noData')}</p>
            ) : (
              scans.map((scan, i) => {
                const meta = STATUS_META_KEYS[scan.scan_status] ?? STATUS_META_KEYS.nowms
                const Icon = meta.icon
                return (
                  <div key={i} className="flex items-start gap-2.5 py-2.5">
                    <span className={`badge mt-0.5 ${meta.bg} inline-flex items-center gap-1 shrink-0`}>
                      <Icon size={10} /> {t(meta.labelKey)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold truncate text-warm-800">{scan.normalized_code}</p>
                      {scan.code2 && (
                        <p className="font-mono text-[10px] text-warm-400">
                          {scan.was_swapped && <span className="text-accent-600 mr-1 font-semibold">SWAP</span>}
                          {scan.code2}
                        </p>
                      )}
                      {scan.sku && <p className="text-[10px] text-warm-400">{scan.sku}</p>}
                    </div>
                    <span className="text-[10px] text-warm-400 shrink-0 tabular-nums">
                      {scan.scanned_at ? new Date(scan.scanned_at).toLocaleTimeString() : ''}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function InventarioRegistros() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detailSession, setDetailSession] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['upapex-inventory-sessions', { page, pageSize }],
    queryFn: () => getInventorySessions({ page, pageSize }),
    staleTime: 30000,
  })

  const records = data?.data?.records ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize) || 1
  const mostRecentId = records[0]?.id

  const deleteMut = useMutation({
    mutationFn: deleteInventorySession,
    onSuccess: () => {
      toast.success(t('common.delete') + ' OK')
      setDeleteConfirmId(null)
      qc.invalidateQueries({ queryKey: ['upapex-inventory-sessions'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('inventario.registros.title')} subtitle={t('nav.inventario')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('inventario.registros.title')} subtitle={t('nav.inventario')} />

      <div className="flex-1 overflow-y-auto p-4">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
              <Package2 size={28} className="text-warm-300" />
            </div>
            <p className="text-sm text-warm-400 font-medium">{t('inventario.registros.no_registros')}</p>
          </div>
        ) : (
          <div className="card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-warm-50/60">
                    <th className="table-header font-semibold">{t('inventario.registros.date')}</th>
                    <th className="table-header font-semibold">{t('inventario.registros.type')}</th>
                    <th className="table-header hidden md:table-cell font-semibold">{t('inventario.registros.operator')}</th>
                    <th className="table-header text-right font-semibold">D / B / N</th>
                    <th className="table-header text-right font-semibold">{t('inventario.registros.total')}</th>
                    <th className="table-header" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {records.map(r => (
                    <tr key={r.id} className="hover:bg-primary-50/20 transition-colors">
                      <td className="table-cell">
                        <span className="text-warm-600 text-xs tabular-nums">
                          {(r.completed_at || r.created_at || '').slice(0, 16).replace('T', ' ')}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className={`badge text-xs font-semibold ${
                          r.scan_type === 'clasificacion'
                            ? 'bg-accent-100 text-accent-700'
                            : 'bg-primary-100 text-primary-700'
                        }`}>
                          {r.scan_type === 'clasificacion' ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')}
                        </span>
                      </td>
                      <td className="table-cell hidden md:table-cell text-warm-600 text-xs">
                        {r.operator_nombre || '—'}
                      </td>
                      <td className="table-cell text-right text-xs tabular-nums">
                        <span className="text-success-600 font-bold">{r.total_ok ?? 0}</span>
                        <span className="text-warm-300 mx-1">/</span>
                        <span className="text-warning-600 font-bold">{r.total_blocked ?? 0}</span>
                        <span className="text-warm-300 mx-1">/</span>
                        <span className="text-danger-600 font-bold">{r.total_nowms ?? 0}</span>
                      </td>
                      <td className="table-cell text-right">
                        <span className="font-bold text-primary-700 text-sm">{r.total_scans ?? 0}</span>
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                            onClick={() => setDetailSession(r)}
                            title={t('inventario.registros.detail')}>
                            <Eye size={13} />
                          </button>
                          {r.id === mostRecentId && (
                            <button
                              className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                              onClick={() => setDeleteConfirmId(r.id)}
                              title={t('inventario.registros.delete_last')}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
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
                itemLabel={t('inventario.registros.title').toLowerCase()}
              />
            )}
          </div>
        )}
      </div>

      <DetailModal
        session={detailSession}
        isOpen={!!detailSession}
        onClose={() => setDetailSession(null)}
      />

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t('inventario.registros.delete_last')}
        icon={Trash2}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setDeleteConfirmId(null)}>{t('common.cancel')}</button>
            <button
              className="btn-primary bg-danger-600 hover:bg-danger-700"
              onClick={() => deleteMut.mutate(deleteConfirmId)}
              disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('common.delete')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-600">{t('inventario.registros.delete_confirm')}</p>
      </Modal>
    </div>
  )
}
