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
      syncing: false,
      lastSyncError: null,

      setOnline: () => set({ status: 'online' }),
      setOffline: () => set({ status: 'offline' }),

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
    }),
    {
      name: 'wms-offline-queue',
      partialize: (s) => ({ queue: s.queue }),
    }
  )
)
