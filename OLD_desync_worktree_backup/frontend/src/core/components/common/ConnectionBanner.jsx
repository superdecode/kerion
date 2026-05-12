import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, Wifi, Upload, AlertCircle } from 'lucide-react'
import { useOfflineStore } from '../../stores/offlineStore'
import { useToastStore } from '../../stores/toastStore'
import { syncOfflineQueue } from '../../services/offlineSync'

export default function ConnectionBanner() {
  const status = useOfflineStore((s) => s.status)
  const queueLen = useOfflineStore((s) => s.queue.length)
  const syncing = useOfflineStore((s) => s.syncing)
  const syncError = useOfflineStore((s) => s.lastSyncError)

  const handleSync = useCallback(async () => {
    const result = await syncOfflineQueue()
    if (result.synced > 0) {
      useToastStore.getState().success(`${result.synced} escaneo(s) sincronizado(s)`)
    }
    if (result.failed > 0) {
      useToastStore.getState().error(`${result.failed} escaneo(s) fallaron al sincronizar`)
    }
  }, [])

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
          className="overflow-hidden"
        >
          <div className={`flex items-center justify-between gap-3 px-4 py-2 text-sm font-semibold ${
            status === 'offline'
              ? 'bg-danger-500 text-white'
              : syncError
                ? 'bg-warning-400 text-warning-900'
                : 'bg-primary-500 text-white'
          }`}>
            <div className="flex items-center gap-2">
              {status === 'offline' ? (
                <>
                  <WifiOff className="w-4 h-4 animate-pulse" />
                  <span>Sin conexion — los escaneos se guardan localmente</span>
                </>
              ) : syncError ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>Error al sincronizar: {syncError}</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  <span>Conexion restaurada</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {queueLen > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  status === 'offline' ? 'bg-white/20' : 'bg-white/30'
                }`}>
                  {queueLen} pendiente{queueLen !== 1 ? 's' : ''}
                </span>
              )}
              {status === 'online' && queueLen > 0 && !syncing && (
                <button
                  onClick={handleSync}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs font-bold"
                >
                  <Upload className="w-3.5 h-3.5" /> Sincronizar
                </button>
              )}
              {syncing && (
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sincronizando...
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
