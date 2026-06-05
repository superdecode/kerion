import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useWmsHubStore = create(
  persist(
    (set) => ({
      lastTest: null,   // { ok: bool, testedAt: ISO string, latencyMs: number }
      lastSync: null,   // { boxStock: ISO string, outbound: ISO string }

      recordTest: (ok, latencyMs) => set({
        lastTest: { ok, testedAt: new Date().toISOString(), latencyMs },
      }),

      recordSync: (type) => set((state) => ({
        lastSync: {
          ...(state.lastSync || {}),
          [type]: new Date().toISOString(),
        },
      })),
    }),
    { name: 'kirion-wmshub' }
  )
)
