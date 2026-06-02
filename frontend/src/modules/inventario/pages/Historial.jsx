import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getScanSessions } from '../services/inventarioService'

export default function InventarioHistorial() {
  const { t } = useI18nStore()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['upapex-scan-sessions-historial', { page, pageSize }],
    queryFn: () => getScanSessions({ page, pageSize }),
    staleTime: 30000,
  })

  const records = data?.data?.records ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize) || 1

  const filtered = records.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (r.outbound_order_no || '').toLowerCase().includes(q)
  })

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('inventario.historial.title')} subtitle="Inventario" />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('inventario.historial.title')} subtitle="Inventario" />

      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-warm-100 px-4 py-3">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            type="text"
            className="input-field pl-9 text-sm"
            placeholder={t('inventario.historial.search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">{t('common.date')}</th>
                  <th className="table-header">{t('inventario.historial.order_no')}</th>
                  <th className="table-header">{t('inventario.historial.operator')}</th>
                  <th className="table-header">{t('inventario.historial.status')}</th>
                  <th className="table-header text-right">{t('inventario.historial.scanned')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-cell text-center text-warm-400 py-8">{t('common.noData')}</td>
                  </tr>
                ) : (
                  filtered.map(s => (
                    <tr key={s.id} className="hover:bg-warm-50">
                      <td className="table-cell text-warm-500 text-xs">{(s.started_at || '').slice(0, 16).replace('T', ' ')}</td>
                      <td className="table-cell font-mono text-xs">{s.outbound_order_no || '—'}</td>
                      <td className="table-cell text-warm-600">{s.operator_nombre || '—'}</td>
                      <td className="table-cell">
                        <span className={`badge ${
                          s.status === 'open' ? 'bg-warning-100 text-warning-700' :
                          s.status === 'complete' ? 'bg-success-100 text-success-700' :
                          'bg-warm-100 text-warm-600'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="table-cell text-right font-semibold">{s.total_scanned ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
              itemLabel="registros"
            />
          )}
        </div>
      </div>
    </div>
  )
}
