import { CloudOff, RefreshCw } from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'

/**
 * Blocking modal shown when the device is offline and the required working data
 * has not been loaded yet. There is no way to dismiss it — the user must restore
 * connectivity, either by waiting for the browser to detect it automatically or,
 * since that detection can lag or miss a briefly-restored connection, by forcing
 * one attempt via onRetry.
 */
export default function OfflineBlockedModal({ isBlocked, message, onRetry, retrying }) {
  const { t } = useI18nStore()
  if (!isBlocked) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <CloudOff className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-warm-900 mb-2">{t('connection.offline_title')}</h2>
        <p className="text-sm text-warm-600 leading-relaxed">
          {message || t('connection.offline_data_required')}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-6 inline-flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? t('connection.retrying') : t('common.retry')}
          </button>
        ) : (
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-warm-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {t('connection.waiting')}
          </div>
        )}
      </div>
    </div>
  )
}
