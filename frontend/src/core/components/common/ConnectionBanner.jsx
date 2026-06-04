import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CloudOff, RefreshCw, Upload, AlertCircle, PlugZap } from 'lucide-react'
import { useOfflineStore } from '../../stores/offlineStore'
import { useToastStore } from '../../stores/toastStore'
import { syncOfflineQueue } from '../../services/offlineSync'
import { useI18nStore } from '../../stores/i18nStore'

export default function ConnectionBanner() {
  const { t } = useI18nStore()
  const status = useOfflineStore((s) => s.status)
  const queueLen = useOfflineStore((s) => s.queue.length)
  const syncing = useOfflineStore((s) => s.syncing)
  const syncError = useOfflineStore((s) => s.lastSyncError)

  const handleSync = useCallback(async () => {
    const result = await syncOfflineQueue()
    if (result.synced > 0) {
      useToastStore.getState().success(`${result.synced} ${t('inventario.escaneo.scans_label')}`)
    }
    if (result.failed > 0) {
      useToastStore.getState().error(`${result.failed} ${t('inventario.escaneo.scans_label')} - ${t('toast.error')}`)
    }
  }, [t])

  // Auto-sync only when connectivity is restored, not on every queue/syncing state change.
  // Reading the store imperatively here avoids re-triggering on each dequeue during an
  // active sync, which would create an immediate-retry loop when sync ends with failures.
  useEffect(() => {
    if (status !== 'online') return
    const { queue, syncing: isSyncing } = useOfflineStore.getState()
    if (queue.length > 0 && !isSyncing) {
      handleSync()
    }
  }, [status, handleSync])

  const showBanner = status === 'offline' || queueLen > 0 || syncError

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden px-3 pt-3"
        >
          <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-sm ${
            status === 'offline'
              ? 'border-red-300/35 bg-gradient-to-r from-red-950/85 via-red-800/72 to-rose-500/60 text-white shadow-red-950/20'
              : syncError
                ? 'border-amber-300/60 bg-gradient-to-r from-amber-200 via-orange-200 to-amber-100 text-amber-950'
                : 'border-emerald-300/45 bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-500 text-white shadow-emerald-950/20'
          }`}>
            <div className="flex items-center gap-2">
              {status === 'offline' ? (
                <>
                  <CloudOff className="w-4 h-4 animate-pulse" />
                  <span>{t('connection.offline')}</span>
                </>
              ) : syncError ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>{t('connection.syncError')}{syncError}</span>
                </>
              ) : (
                <>
                  <PlugZap className="w-4 h-4" />
                  <span>{t('connection.restored')}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {queueLen > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  status === 'offline' ? 'bg-white/20' : 'bg-white/30'
                }`}>
                  {queueLen} {t('connection.pending')}
                </span>
              )}
              {status === 'online' && queueLen > 0 && !syncing && (
                <button
                  onClick={handleSync}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs font-bold"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> {t('connection.sync')}
                </button>
              )}
              {syncing && (
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('connection.syncing')}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
