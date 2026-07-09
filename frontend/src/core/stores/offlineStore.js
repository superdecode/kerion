import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Offline scan queue — buffers scans when the network is down.
 * Each queued item stores enough context to replay the scan API call.
 * On reconnect, the sync loop replays them in order.
 */
export const useOfflineStore = create(
  persist(
    (set, get) => ({
      /** @type {{ id: number, sessionId: number, codigo_guia: string, tarimaId: number|null, timestamp: string }[]} */
      queue: [],
      /** @type {'online'|'offline'} */
      status: navigator.onLine ? 'online' : 'offline',
      /** @type {'ok'|'degraded'} */
      quality: 'ok',
      manualOffline: false,
      lastConnectionIssue: null,
      syncing: false,
      lastSyncError: null,

      setOnline: () => set({ status: 'online', quality: 'ok', manualOffline: false, lastConnectionIssue: null }),
      setOffline: (reason = null) => set({ status: 'offline', quality: 'ok', manualOffline: false, lastConnectionIssue: reason }),
      setConnectionDegraded: (reason = null) => set((s) => (
        s.status === 'offline'
          ? { lastConnectionIssue: reason || s.lastConnectionIssue }
          : { quality: 'degraded', lastConnectionIssue: reason || 'connection_unstable' }
      )),
      clearConnectionIssue: () => set((s) => (
        s.status === 'online' ? { quality: 'ok', lastConnectionIssue: null } : {}
      )),
      enableManualOffline: (reason = null) => set({
        status: 'offline',
        quality: 'ok',
        manualOffline: true,
        lastConnectionIssue: reason || 'manual_offline',
      }),
      disableManualOffline: () => set({
        status: navigator.onLine ? 'online' : 'offline',
        quality: 'ok',
        manualOffline: false,
        lastConnectionIssue: null,
      }),

      enqueue: (sessionId, codigo_guia, tarimaId) => {
        const item = {
          id: Date.now() + Math.random(),
          sessionId,
          codigo_guia,
          tarimaId,
          timestamp: new Date().toISOString(),
        }
        set((s) => ({ queue: [...s.queue, item] }))
        return item
      },

      dequeue: (id) => {
        set((s) => ({ queue: s.queue.filter((i) => i.id !== id) }))
      },

      clearQueue: () => set({ queue: [], lastSyncError: null }),

      setSyncing: (v) => set({ syncing: v }),
      setSyncError: (err) => set({ lastSyncError: err }),

      /** Generic module queue — surtido/inventario/despacho offline scans */
      /** @type {{ id: number, type: string, payload: object, ts: string }[]} */
      moduleQueue: [],

      enqueueModule: (item) =>
        set((s) => ({
          moduleQueue: [
            ...s.moduleQueue,
            { id: Date.now() + Math.random(), ts: new Date().toISOString(), ...item },
          ],
        })),

      dequeueModule: (id) =>
        set((s) => ({ moduleQueue: s.moduleQueue.filter((i) => i.id !== id) })),

      /**
       * Rewrites the ubicacion on any not-yet-synced recepcion_scan queue items
       * for this order that still carry `from`, so they sync with the corrected
       * location instead of the one that was active when they were scanned.
       * Returns how many queued items were touched.
       */
      relocateQueuedRecepcionScans: (orderId, from, to) => {
        let touched = 0
        set((s) => ({
          moduleQueue: s.moduleQueue.map((item) => {
            if (
              item.type === 'recepcion_scan' &&
              String(item.payload?.orderId) === String(orderId) &&
              String(item.payload?.ubicacion || '') === String(from || '')
            ) {
              touched += 1
              return { ...item, payload: { ...item.payload, ubicacion: to } }
            }
            return item
          }),
        }))
        return touched
      },
    }),
    {
      name: 'wms-offline-queue',
      partialize: (s) => ({ queue: s.queue, moduleQueue: s.moduleQueue, manualOffline: s.manualOffline }),
      onRehydrateStorage: () => (state) => {
        if (state?.manualOffline) {
          state.status = 'offline'
          state.quality = 'ok'
          state.lastConnectionIssue = 'manual_offline'
        }
      },
    }
  )
)
