import { create } from 'zustand'

export const useTourStore = create((set) => ({
  triggerCount: 0,
  active: false,
  highlightedSidebarItem: null,
  trigger: () => set((s) => ({ triggerCount: s.triggerCount + 1 })),
  setActive: (v) => set({ active: v }),
  setHighlightedItem: (id) => set({ highlightedSidebarItem: id }),
}))
