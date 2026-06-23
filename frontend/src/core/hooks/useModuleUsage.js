import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { STALE } from '../constants/queryConfig'

async function fetchUsageSummary() {
  const res = await api.get('/usage/summary')
  return res.data
}

/**
 * Fetches monthly usage summary for all modules.
 * Cached for 2 minutes; background refetch every 5 minutes.
 * Returns { dropscan, surtido, inventario, devoluciones, recepcion, despacho, plan_name }
 * where each module has: { used, limit, at_limit, warning, pct }
 */
export function useModuleUsage() {
  return useQuery({
    queryKey: ['module-usage-summary'],
    queryFn: fetchUsageSummary,
    staleTime: STALE.CATALOG,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  })
}
