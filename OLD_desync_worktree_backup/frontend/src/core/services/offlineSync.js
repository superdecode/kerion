import api from './api'
import { useOfflineStore } from '../stores/offlineStore'

let syncInProgress = false

/**
 * Replays all queued offline scans in FIFO order.
 * Called automatically when the browser comes back online.
 * Returns { synced: number, failed: number, skipped: number, errors: string[] }
 * 
 * Session-level errors (404, 400 "No hay tarima activa") skip the item
 * instead of blocking the entire queue — a dead session shouldn't prevent
 * other sessions' scans from syncing.
 */
export async function syncOfflineQueue() {
  const store = useOfflineStore.getState()
  if (syncInProgress || store.queue.length === 0) return { synced: 0, failed: 0, skipped: 0, errors: [] }

  syncInProgress = true
  store.setSyncing(true)
  store.setSyncError(null)

  let synced = 0
  let failed = 0
  let skipped = 0
  const errors = []
  const deadSessions = new Set() // Track sessions known to be invalid

  // Process in order — each scan depends on server state from the previous one
  for (const item of [...store.queue]) {
    // Skip items belonging to sessions already known to be dead
    if (deadSessions.has(item.sessionId)) {
      skipped++
      store.dequeue(item.id)
      continue
    }

    try {
      await api.post(`/dropscan/sessions/${item.sessionId}/scan`, {
        codigo_guia: item.codigo_guia,
        tarima_id: item.tarimaId,
      })
      store.dequeue(item.id)
      synced++
    } catch (err) {
      const status = err.response?.status
      const msg = err.response?.data?.error || err.message

      // DUPLICADO is not a real failure — the scan was already registered
      if (msg === 'DUPLICADO') {
        store.dequeue(item.id)
        synced++
        continue
      }

      // Session-level errors: session is dead (ended, tarima finalized/cancelled).
      // Skip ALL remaining items for this session instead of blocking the queue.
      if (status === 404 || (status === 400 && msg?.includes('tarima'))) {
        deadSessions.add(item.sessionId)
        skipped++
        errors.push(`${item.codigo_guia}: sesión/tarima no válida (omitido)`)
        store.dequeue(item.id)
        continue
      }

      // Auth errors: stop sync entirely — the interceptor will handle redirect
      if (status === 401) {
        failed++
        errors.push(`${item.codigo_guia}: sesión expirada`)
        break
      }

      // Rate limit: wait and retry later
      if (status === 429) {
        failed++
        errors.push(`${item.codigo_guia}: límite de peticiones alcanzado`)
        break
      }

      // Other errors: stop to preserve order for recoverable errors (network, 5xx)
      failed++
      errors.push(`${item.codigo_guia}: ${msg}`)
      break
    }
  }

  store.setSyncing(false)
  if (errors.length > 0) store.setSyncError(errors.join('; '))
  syncInProgress = false

  return { synced, failed, skipped, errors }
}
