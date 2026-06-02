import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { generateTabId } from '../../_shared/wms/generatePalletId'

const MAX_TABS = 4

function emptyTab(id, scanType = 'unificado') {
  return {
    id,
    name: `Sesión ${id.slice(-4)}`,
    createdAt: new Date().toISOString(),
    scanType,          // 'unificado' | 'clasificacion'
    items: [],
    sessionId: null,
  }
}

export const useInventarioStore = create(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      pendingCode1: null,   // { raw, code } when awaiting second code after SWAP
      pendingSync: [],      // events queued while offline
      lastSyncAt: null,
      inventorySnapshot: null, // Map<normalizedCode, wmsItem> — built from box-stock

      openTab: (scanType = 'unificado') => {
        const { tabs } = get()
        if (tabs.length >= MAX_TABS) return { error: 'max_tabs' }
        const id = generateTabId()
        const tab = emptyTab(id, scanType)
        set({ tabs: [...tabs, tab], activeTabId: id })
        return { id }
      },

      closeTab: (tabId) => {
        const { tabs, activeTabId } = get()
        const remaining = tabs.filter(t => t.id !== tabId)
        const nextActive = activeTabId === tabId
          ? (remaining[remaining.length - 1]?.id ?? null)
          : activeTabId
        set({ tabs: remaining, activeTabId: nextActive, pendingCode1: null })
      },

      setActiveTab: (tabId) => set({ activeTabId: tabId, pendingCode1: null }),

      addScanItem: (item) => {
        const { tabs, activeTabId } = get()
        const updated = tabs.map(t =>
          t.id === activeTabId
            ? { ...t, items: [...t.items, { ...item, ts: Date.now() }] }
            : t
        )
        set({ tabs: updated })
      },

      removeItem: (tabId, index) => {
        const { tabs } = get()
        const updated = tabs.map(t =>
          t.id === tabId
            ? { ...t, items: t.items.filter((_, i) => i !== index) }
            : t
        )
        set({ tabs: updated })
      },

      moveItemGroup: (tabId, index, newGroup) => {
        const { tabs } = get()
        const updated = tabs.map(t => {
          if (t.id !== tabId) return t
          const items = t.items.map((item, i) =>
            i === index ? { ...item, groupAssignment: newGroup } : item
          )
          return { ...t, items }
        })
        set({ tabs: updated })
      },

      updateTabLocation: (tabId, field, value) => {
        const { tabs } = get()
        const updated = tabs.map(t => t.id === tabId ? { ...t, [field]: value } : t)
        set({ tabs: updated })
      },

      setTabSessionId: (tabId, sessionId) => {
        const { tabs } = get()
        const updated = tabs.map(t => t.id === tabId ? { ...t, sessionId } : t)
        set({ tabs: updated })
      },

      setPendingCode1: (code1) => set({ pendingCode1: code1 }),
      clearPendingCode1: () => set({ pendingCode1: null }),

      enqueueSync: (event) => {
        set(s => ({ pendingSync: [...s.pendingSync, event] }))
      },

      markSynced: (keys) => {
        set(s => ({
          pendingSync: s.pendingSync.filter(e => !keys.includes(e.key)),
          lastSyncAt: new Date().toISOString(),
        }))
      },

      setInventorySnapshot: (snapshot) => set({ inventorySnapshot: snapshot }),

      getActiveTab: () => {
        const { tabs, activeTabId } = get()
        return tabs.find(t => t.id === activeTabId) ?? null
      },

      getSummary: () => {
        const { tabs, activeTabId } = get()
        const tab = tabs.find(t => t.id === activeTabId)
        if (!tab) return { ok: 0, blocked: 0, nowms: 0, total: 0 }
        const counts = tab.items.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1
          return acc
        }, {})
        const ok = counts.ok || 0
        const blocked = counts.blocked || 0
        const nowms = counts.nowms || 0
        return { ok, blocked, nowms, total: ok + blocked + nowms }
      },
    }),
    { name: 'kirion-inventario' }
  )
)
