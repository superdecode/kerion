import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { normalizeCodeFast } from '../../_shared/wms/normalizeCode'
import { useInventarioStore } from '../stores/inventarioStore'
import { getBoxStock } from '../services/inventarioService'

/**
 * Fetches box-stock and builds the in-memory inventory Map used for scan classification.
 * Stores the map in inventarioStore so Escaneo page can lookup instantly without re-fetching.
 */
export function useBoxStock(params = {}) {
  const setSnapshot = useInventarioStore(s => s.setInventorySnapshot)

  const query = useQuery({
    queryKey: ['upapex-box-stock', params],
    queryFn: () => getBoxStock({ pageSize: 100, ...params }),
    staleTime: 30000,
  })

  useEffect(() => {
    if (!query.data?.data) return
    const list = query.data.data?.records ?? query.data.data ?? []
    const map = new Map()
    for (const item of list) {
      const code = normalizeCodeFast(item.customizeBarcode || '')
      if (!code) continue
      const isAvailable = (item.availableAmount ?? 0) > 0
      const isBlocked = (item.lockAmount ?? 0) > 0 && !isAvailable
      map.set(code, { ...item, isAvailable, isBlocked })
    }
    setSnapshot(map)
  }, [query.data, setSnapshot])

  return query
}
