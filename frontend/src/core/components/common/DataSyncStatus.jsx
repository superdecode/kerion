import { Database, RefreshCw, ShieldCheck } from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'
import { getTimezone } from '../../utils/dateFormat'

function formatSyncDate(ts, locale) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : 'es-MX', {
      timeZone: getTimezone(),
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

export default function DataSyncStatus({ records = 0, updatedAt = null, partial = false, onRefresh, refreshing = false }) {
  const { t, locale } = useI18nStore()
  const tone = partial
    ? 'border-warning-200/60 bg-warning-50/45 text-warning-800'
    : 'border-success-200/60 bg-success-50/45 text-success-800'
  const accent = partial ? 'text-warning-600' : 'text-success-600'
  const formattedDate = formatSyncDate(updatedAt, locale)
  const fullTitle = t('wmshub.sync.summary_title')

  return (
    <div className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-2.5 ${tone}`}>
      <div className={`flex h-5 w-5 items-center justify-center rounded-md border border-white/70 bg-white/75 ${accent}`}>
        {partial ? <Database className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 whitespace-nowrap text-[11px] leading-none">
        <span className="font-semibold" title={fullTitle}>BD</span>
        <span className="mx-1 text-warm-300">•</span>
        <span><strong>{records.toLocaleString(locale === 'zh' ? 'zh-CN' : 'es-MX')}</strong> {t('wmshub.sync.records')}</span>
        <span className="mx-1 text-warm-300">•</span>
        <span>{formattedDate}</span>
      </div>
      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${partial ? 'bg-warning-100/80 text-warning-700' : 'bg-success-100/80 text-success-700'}`}>
        {partial ? t('wmshub.sync.partial') : t('wmshub.sync.ok')}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/70 bg-white/70 text-warm-700 transition-all hover:bg-white disabled:opacity-50"
          title={t('wmshub.config.sheet_refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  )
}
