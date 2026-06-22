import api from './api'
import { useOfflineStore } from '../stores/offlineStore'
import { addScanEvent } from '../../modules/Surtido/services/surtidoService'
import { saveInventorySession } from '../../modules/Inventario/services/inventarioService'
import { addOrderScan, addFolioScan } from '../../modules/Despacho/services/despachoService'
import { scanCode } from '../../modules/Recepcion/services/recepcionService'

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
  const deadSessions = new Set()

  try {
    for (const item of [...store.queue]) {
      if (deadSessions.has(item.sessionId)) {
        skipped++
        store.dequeue(item.id)
        continue
      }

      try {
        await api.post(`/DropScan/sessions/${item.sessionId}/scan`, {
          codigo_guia: item.codigo_guia,
          tarima_id: item.tarimaId,
        })
        store.dequeue(item.id)
        synced++
      } catch (err) {
        const status = err.response?.status
        const msg = err.response?.data?.error || err.message

        if (msg === 'DUPLICADO') {
          store.dequeue(item.id)
          synced++
          continue
        }

        if (status === 404 || (status === 400 && msg?.includes('tarima'))) {
          deadSessions.add(item.sessionId)
          skipped++
          errors.push(`${item.codigo_guia}: sesión/tarima no válida (omitido)`)
          store.dequeue(item.id)
          continue
        }

        if (status === 401) {
          failed++
          errors.push(`${item.codigo_guia}: sesión expirada`)
          break
        }

        if (status === 429) {
          failed++
          errors.push(`${item.codigo_guia}: límite de peticiones alcanzado`)
          break
        }

        failed++
        errors.push(`${item.codigo_guia}: ${msg}`)
        break
      }
    }
  } finally {
    store.setSyncing(false)
    if (errors.length > 0) store.setSyncError(errors.join('; '))
    syncInProgress = false
  }

  return { synced, failed, skipped, errors }
}

let moduleSyncInProgress = false

/**
 * Replays queued offline events for Surtido, Inventario, and Despacho modules.
 * Returns { synced, failed }.
 */
export async function syncModuleQueue() {
  const store = useOfflineStore.getState()
  if (moduleSyncInProgress || store.moduleQueue.length === 0) return { synced: 0, failed: 0 }

  moduleSyncInProgress = true
  store.setSyncing(true)
  let synced = 0
  let failed = 0

  try {
    for (const item of [...store.moduleQueue]) {
      try {
        if (item.type === 'surtido_event') {
          await addScanEvent(item.payload)
        } else if (item.type === 'inventario_session') {
          await saveInventorySession(item.payload)
        } else if (item.type === 'despacho_order_scan') {
          const { folioId, orderId, ...body } = item.payload
          await addOrderScan(folioId, orderId, body)
        } else if (item.type === 'despacho_folio_scan') {
          await addFolioScan(item.payload.folioId, item.payload.body)
        } else if (item.type === 'recepcion_scan') {
          const { orderId, ...payload } = item.payload
          await scanCode(orderId, payload)
        }
        store.dequeueModule(item.id)
        synced++
      } catch (err) {
        const status = err.response?.status
        if (status === 401 || status === 429) break
        // 4xx client errors (except 429): item is unrecoverable, discard it
        if (status >= 400 && status < 500) {
          store.dequeueModule(item.id)
          failed++
        } else {
          // Network / 5xx: keep in queue, stop to preserve order
          failed++
          break
        }
      }
    }
  } finally {
    moduleSyncInProgress = false
    store.setSyncing(false)
  }

  return { synced, failed }
}
