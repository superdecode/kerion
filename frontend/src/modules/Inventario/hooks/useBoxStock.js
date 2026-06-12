import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { generateCodeVariations, normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { useInventarioStore } from '../stores/inventarioStore'
import { getBoxStock } from '../services/inventarioService'

export function useBoxStock() {
  const setSnapshot = useInventarioStore(s => s.setInventorySnapshot)

  const query = useQuery({
    queryKey: ['wms-box-stock'],
    queryFn: getBoxStock,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!query.data?.data) return
    const list = query.data.data?.records ?? query.data.data ?? []
    const map = new Map()
    for (const item of list) {
      const barcode = normalizeCodeFast(item.customizeBarcode || '')
      const sku     = normalizeCodeFast(item.customizeCode || '')
      // Index by both barcode and SKU — use whichever is available.
      // normalize=false: these codes are already clean from Google Sheets,
      // do NOT run scanner-specific transforms on them.
      const codes = [...new Set([barcode, sku].filter(Boolean))]
      if (codes.length === 0) continue
      const isAvailable = (item.availableAmount ?? 0) > 0
      const isBlocked = (item.lockAmount ?? 0) > 0 && !isAvailable
      const enrichedItem = { ...item, isAvailable, isBlocked }
      for (const code of codes) {
        for (const variant of generateCodeVariations(code, false)) {
          if (!map.has(variant)) map.set(variant, enrichedItem)
        }
      }
    }
    setSnapshot(map)
  }, [query.data, setSnapshot])

  return query
}
