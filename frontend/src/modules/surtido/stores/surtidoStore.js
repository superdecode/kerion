import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSurtidoStore = create(
  persist(
    (set, get) => ({
      activeOBC: null,
      sessionId: null,
      bdCodes: [],          // serialized array — rebuilt as Set on use
      obcTotals: {},        // { [obc]: { expected, scanned } }
      history: [],          // [{ code, result, ts, obc }]
      pendingSync: [],
      lastSyncAt: null,

      setActiveOBC: (obc, sessionId, bdCodes, obcTotals) => set({
        activeOBC: obc,
        sessionId,
        bdCodes: Array.isArray(bdCodes) ? bdCodes : [...(bdCodes || [])],
        obcTotals: obcTotals || {},
        history: [],
      }),

      clearSession: () => set({
        activeOBC: null,
        sessionId: null,
        bdCodes: [],
        obcTotals: {},
        history: [],
      }),

      addHistoryEntry: (entry) => set(s => ({
        history: [{ ...entry, ts: Date.now() }, ...s.history].slice(0, 200),
      })),

      incrementScanned: (obc) => set(s => ({
        obcTotals: {
          ...s.obcTotals,
          [obc]: {
            ...s.obcTotals[obc],
            scanned: ((s.obcTotals[obc]?.scanned) || 0) + 1,
          },
        },
      })),

      enqueueSync: (event) => set(s => ({ pendingSync: [...s.pendingSync, event] })),

      markSynced: (keys) => set(s => ({
        pendingSync: s.pendingSync.filter(e => !keys.includes(e.key)),
        lastSyncAt: new Date().toISOString(),
      })),

      getBdCodesSet: () => new Set(get().bdCodes),
    }),
    { name: 'kirion-surtido' }
  )
)
