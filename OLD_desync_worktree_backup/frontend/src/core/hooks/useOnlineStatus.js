import { useEffect } from 'react'
import { useOfflineStore } from '../stores/offlineStore'

/**
 * Listens to browser online/offline events and keeps offlineStore in sync.
 * Mount once at app root level.
 */
export function useOnlineStatus() {
  const setOnline = useOfflineStore((s) => s.setOnline)
  const setOffline = useOfflineStore((s) => s.setOffline)

  useEffect(() => {
    const handleOnline = () => setOnline()
    const handleOffline = () => setOffline()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline, setOffline])
}
