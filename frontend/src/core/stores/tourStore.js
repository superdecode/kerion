import { create } from 'zustand'

export const useTourStore = create((set) => ({
  triggerCount: 0,
  trigger: () => set((s) => ({ triggerCount: s.triggerCount + 1 })),
}))
