import { create } from 'zustand'

export const useNavStore = create((set) => ({
  mobileOpen: false,
  openNav: () => set({ mobileOpen: true }),
  closeNav: () => set({ mobileOpen: false }),
  toggleNav: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
}))
