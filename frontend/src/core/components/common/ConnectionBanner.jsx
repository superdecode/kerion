import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CloudOff, RefreshCw, AlertCircle, PlugZap, WifiOff } from 'lucide-react'
import { useOfflineStore } from '../../stores/offlineStore'
import { useToastStore } from '../../stores/toastStore'
import { syncOfflineQueue, syncModuleQueue } from '../../services/offlineSync'
import { useI18nStore } from '../../stores/i18nStore'

export default function ConnectionBanner() {
  const { t } = useI18nStore()
  const status = useOfflineStore((s) => s.status)
  const quality = useOfflineStore((s) => s.quality)
  const manualOffline = useOfflineStore((s) => s.manualOffline)
  const dropScanLen = useOfflineStore((s) => s.queue.length)
  const moduleLen = useOfflineStore((s) => s.moduleQueue.length)
  const queueLen = dropScanLen + moduleLen
  const syncing = useOfflineStore((s) => s.syncing)
  const syncError = useOfflineStore((s) => s.lastSyncError)
  const degraded = status === 'online' && quality === 'degraded'

  const handleSync = useCallback(async () => {
    const [r1, r2] = await Promise.all([syncOfflineQueue(), syncModuleQueue()])
    const totalSynced = r1.synced + r2.synced
    const totalFailed = r1.failed + r2.failed
    if (totalSynced > 0) {
      useToastStore.getState().success(`${totalSynced} ${t('inventario.escaneo.scans_label')}`)
    }
    if (totalFailed > 0) {
      useToastStore.getState().error(`${totalFailed} ${t('inventario.escaneo.scans_label')} - ${t('toast.error')}`)
    }
  }, [t])

  // Auto-sync only when connectivity is restored, not on every queue/syncing state change.
  // Reading the store imperatively here avoids re-triggering on each dequeue during an
  // active sync, which would create an immediate-retry loop when sync ends with failures.
  useEffect(() => {
    if (status !== 'online') return
    const { queue, moduleQueue, syncing: isSyncing } = useOfflineStore.getState()
    if ((queue.length > 0 || moduleQueue.length > 0) && !isSyncing) {
      handleSync()
    }
  }, [status, handleSync])

  const showBanner = status === 'offline' || degraded || queueLen > 0 || syncError

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${
            status === 'offline'
              ? 'bg-red-900 text-white'
              : degraded || syncError
                ? 'bg-amber-100 text-amber-900 border-b border-amber-200'
                : 'bg-emerald-700 text-white'
          }`}>
            {status === 'offline' ? (
              <CloudOff className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            ) : degraded ? (
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
            ) : syncError ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <PlugZap className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate flex-1 min-w-0">
              {status === 'offline'
                ? (manualOffline ? t('connection.manualOffline') : t('connection.offline'))
                : degraded ? t('connection.degraded')
                : syncError ? t('connection.syncError')
                : t('connection.restored')}
              {queueLen > 0 && ` · ${queueLen} ${t('connection.pending')}`}
            </span>
            {degraded && (
              <button
                onClick={() => useOfflineStore.getState().enableManualOffline('connection_degraded')}
                className="shrink-0 px-2 py-0.5 rounded bg-amber-900/10 hover:bg-amber-900/20 transition-colors text-[11px] font-bold"
              >
                <CloudOff className="w-3 h-3 inline mr-1" />{t('connection.workOffline')}
              </button>
            )}
            {manualOffline && (
              <button
                onClick={() => useOfflineStore.getState().disableManualOffline()}
                className="shrink-0 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors text-[11px] font-bold"
              >
                <PlugZap className="w-3 h-3 inline mr-1" />{t('connection.goOnline')}
              </button>
            )}
            {status === 'online' && queueLen > 0 && !syncing && (
              <button
                onClick={handleSync}
                className="shrink-0 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors text-[11px] font-bold"
              >
                <RefreshCw className="w-3 h-3 inline mr-1" />{t('connection.sync')}
              </button>
            )}
            {syncing && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
