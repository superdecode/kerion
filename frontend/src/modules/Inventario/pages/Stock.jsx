import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import StatusPill from '../../../core/components/common/StatusPill'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useBoxStock } from '../hooks/useBoxStock'

export default function Stock() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [refreshState, setRefreshState] = useState('idle')
  const [refreshMessage, setRefreshMessage] = useState('')

  const { data, isLoading, isFetching, refetch } = useBoxStock()

  const rows = data?.data?.records ?? data?.data ?? []
  const isPartial = data?.data?.partial ?? false

  useEffect(() => {
    if (!isPartial) return
    const timer = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['wms-box-stock'] })
    }, 15000)
    return () => clearTimeout(timer)
  }, [isPartial, qc])

  const filtered = rows.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (r.customizeBarcode || '').toLowerCase().includes(q) ||
      (r.customizeCode || '').toLowerCase().includes(q) ||
      (r.productName || '').toLowerCase().includes(q) ||
      (r.boxType || '').toLowerCase().includes(q) ||
      (r.cellNo || '').toLowerCase().includes(q)
    )
  })

  const handleRefresh = async () => {
    setRefreshState('loading')
    setRefreshMessage('Actualizando...')
    try {
      await refetch()
      setRefreshState('success')
      setRefreshMessage('Actualizado')
      toast.success('Stock actualizado')
    } catch (error) {
      setRefreshState('error')
      setRefreshMessage('Error')
      toast.error(error?.message || t('toast.error'))
    } finally {
      window.setTimeout(() => {
        setRefreshState('idle')
        setRefreshMessage('')
      }, 1800)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('inventario.stock.title')} subtitle={t('nav.inventario')} />

      {/* Partial data banner */}
      {isPartial && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-warning-50 border-b border-warning-100 text-warning-700 text-[11px]">
          <Loader2 size={11} className="animate-spin shrink-0" />
          <span>{t('wmshub.partial_loading')}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-warm-100 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
            <input
              type="text"
              className="input-field pl-9 text-sm"
              placeholder={t('inventario.stock.search_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              refreshState === 'success'
                ? 'bg-success-50 text-success-700 border border-success-200'
                : refreshState === 'error'
                ? 'bg-danger-50 text-danger-700 border border-danger-200'
                : 'btn-ghost'
            }`}
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
          {refreshMessage && (
            <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
              refreshState === 'success'
                ? 'bg-success-50 text-success-700 border border-success-200'
                : refreshState === 'error'
                ? 'bg-danger-50 text-danger-700 border border-danger-200'
                : 'bg-primary-50 text-primary-700 border border-primary-200'
            }`}>
              {refreshState === 'success' ? <CheckCircle2 size={13} /> : refreshState === 'error' ? <AlertTriangle size={13} /> : <Loader2 size={13} className="animate-spin" />}
              {refreshMessage}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">{t('inventario.stock.box_code')}</th>
                    <th className="table-header">{t('inventario.stock.sku')}</th>
                    <th className="table-header">Producto</th>
                    <th className="table-header">{t('inventario.stock.location')}</th>
                    <th className="table-header text-right">{t('inventario.stock.qty')}</th>
                    <th className="table-header text-right">Bloqueado</th>
                    <th className="table-header">{t('inventario.stock.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="table-cell text-center text-warm-400 py-8">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => (
                      <tr key={r.customizeBarcode || r.boxType || i} className="table-row">
                        <td className="table-cell font-mono text-xs">{r.customizeBarcode || '—'}</td>
                        <td className="table-cell text-warm-600">{r.customizeCode || '—'}</td>
                        <td className="table-cell text-warm-600">{r.productName || '—'}</td>
                        <td className="table-cell text-warm-600 font-mono text-xs">{r.cellNo || '—'}</td>
                        <td className="table-cell text-right font-semibold">{r.availableAmount ?? 0}</td>
                        <td className="table-cell text-right font-semibold text-warning-700">{r.lockAmount ?? 0}</td>
                        <td className="table-cell">
                          <StatusPill className={
                            r.isAvailable ? 'bg-success-100 text-success-700' :
                            r.isBlocked ? 'bg-warning-100 text-warning-700' :
                            'bg-danger-100 text-danger-700'
                          }>
                            {r.isAvailable ? t('inventario.stock.available') : r.isBlocked ? t('inventario.stock.blocked') : 'No disponible'}
                          </StatusPill>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
