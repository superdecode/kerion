/**
 * Classification engine for WMS inventory scan results.
 * Ported from upapex/apps/inventory/app.js UnifiedModule.processScan classification block.
 *
 * Status hierarchy:
 *  ok       — item found in WMS, isAvailable
 *  blocked  — item found in WMS, isBlocked or no stock
 *  nowms    — item not in WMS inventory map
 */

/**
 * @param {{ isBlocked?: boolean, isAvailable?: boolean } | null} wmsItem
 * @returns {{ status: 'ok' | 'blocked' | 'nowms', label: string }}
 */
export function classifyItem(wmsItem) {
  if (!wmsItem) return { status: 'nowms', label: 'NO WMS' }
  if (wmsItem.isBlocked) return { status: 'blocked', label: 'BLOQUEADO' }
  if (wmsItem.isAvailable) return { status: 'ok', label: 'OK' }
  return { status: 'blocked', label: 'SIN STOCK' }
}

/**
 * Processes a dual-code SWAP.
 * Rule: if code1 not found in WMS but code2 is found → swap.
 * Returns the item to push into the items list.
 *
 * @param {{ raw: string, code: string }} pendingCode1
 * @param {{ code: string, item: object | null }} code2Result
 * @param {string} rawCode2
 * @returns {{ code: string, code2: string, raw: string, status: string, label: string, sku: string, product: string, location: string }}
 */
export function resolveSwap(pendingCode1, code2Result, rawCode2) {
  const { code: code1, raw: raw1 } = pendingCode1
  const { code: code2, item: item2 } = code2Result

  const { status, label } = classifyItem(item2)

  if (item2) {
    // SWAP: code2 is in WMS — it becomes the primary code
    return {
      raw: rawCode2,
      code: code2,
      code2: code1,
      wasSwapped: true,
      status,
      label,
      sku: item2.sku || '-',
      product: item2.productName || '-',
      location: item2.cellNo || '-',
    }
  }

  // No SWAP: both codes are NoWMS
  return {
    raw: raw1,
    code: code1,
    code2: code2,
    wasSwapped: false,
    status: 'nowms',
    label: 'NO WMS',
    sku: '-',
    product: '-',
    location: '-',
  }
}
