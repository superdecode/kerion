import { useInventarioStore } from '../stores/inventarioStore'

// Inventario uses batch-save (all scans saved at once when "Guardar registro" is clicked).
// No per-event sync is needed. This hook exists only to provide pendingCount to the UI.
export function useAutoSync() {
  const tabs = useInventarioStore(s => s.tabs)
  const pendingCount = tabs.reduce((sum, tab) => sum + (tab.items?.length ?? 0), 0)
  return { isPending: false, pendingCount }
}
