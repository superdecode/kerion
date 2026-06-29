import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { generateTabId } from '../../Shared/Wms/generatePalletId'

export const useRecepcionEscanearStore = create(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      // Create a new empty tab (search mode)
      openEmptyTab: () => {
        const id = generateTabId()
        const now = new Date().toISOString()
        set(s => ({
          tabs: [...s.tabs, { id, orderId: null, folio: null, cliente: null, sessionId: null, openedAt: now, lastActiveAt: now }],
          activeTabId: id,
        }))
        return id
      },

      // Open a tab for a specific order directly (for conflict resolution)
      openOrderTab: (orderId, folio, cliente, orderSnapshot = null) => {
        const { tabs } = get()
        const existing = tabs.find(t => t.orderId === String(orderId))
        if (existing) {
          set({ activeTabId: existing.id })
          return { alreadyOpen: true, tabId: existing.id }
        }
        const id = generateTabId()
        const now = new Date().toISOString()
        set(s => ({
          tabs: [...s.tabs, { id, orderId: String(orderId), folio, cliente, orderSnapshot, sessionId: null, openedAt: now, lastActiveAt: now }],
          activeTabId: id,
        }))
        return { alreadyOpen: false, tabId: id }
      },

      // Transition a tab between search mode (orderId=null) and validation mode
      setTabOrder: (tabId, orderId, folio, cliente, orderSnapshot = null) => {
        set(s => ({
          tabs: s.tabs.map(t =>
            t.id === tabId
              ? { ...t, orderId: orderId != null ? String(orderId) : null, folio: folio ?? null, cliente: cliente ?? null, orderSnapshot, sessionId: null }
              : t
          ),
        }))
      },

      closeTab: (tabId) => {
        const { tabs, activeTabId } = get()
        const remaining = tabs.filter(t => t.id !== tabId)
        const nextActive = activeTabId === tabId
          ? (remaining[remaining.length - 1]?.id ?? null)
          : activeTabId
        set({ tabs: remaining, activeTabId: nextActive })
      },

      setActiveTab: (tabId) => set({ activeTabId: tabId }),

      touchTab: (tabId) => {
        set(s => ({
          tabs: s.tabs.map(t => t.id === tabId ? { ...t, lastActiveAt: new Date().toISOString() } : t)
        }))
      },

      updateTabSession: (tabId, sessionId) => {
        set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, sessionId } : t) }))
      },

      findTabByOrderId: (orderId) => {
        return get().tabs.find(t => t.orderId === String(orderId)) ?? null
      },
    }),
    {
      name: 'kirion-recepcion-escanear',
      // Exclude orderSnapshot from persistence: it may contain PII (cliente, tracking, references)
      // and can grow large. Restore it from React Query cache on mount instead.
      partialize: (state) => ({
        ...state,
        tabs: state.tabs.map(({ orderSnapshot: _snap, ...rest }) => rest),
      }),
    }
  )
)
