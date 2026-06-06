import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { generateCodeVariations, normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { useInventarioStore } from '../stores/inventarioStore'
import { getBoxStock } from '../services/inventarioService'

export function useBoxStock() {
  const setSnapshot = useInventarioStore(s => s.setInventorySnapshot)

  const query = useQuery({
    queryKey: ['upapex-box-stock'],
    queryFn: getBoxStock,
    staleTime: 5 * 60 * 1000,
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
      const enrichedItem = { ...item, isAvailable, isBlocked }
      for (const variant of generateCodeVariations(code)) {
        map.set(variant, enrichedItem)
      }
    }
    setSnapshot(map)
  }, [query.data, setSnapshot])

  return query
}
