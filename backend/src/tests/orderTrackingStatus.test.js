import { describe, expect, it } from 'vitest'
import { buildOrderTrackingStatusSql } from '../modules/wms/routes/wms.routes.js'

describe('order tracking derived status', () => {
  it('preserves an explicit complete status for force-validated orders', () => {
    const sql = buildOrderTrackingStatusSql()

    expect(sql).toContain("WHEN ot.status = 'complete' THEN 'complete'")
    expect(sql).not.toContain("WHEN ot.status = 'complete' AND COALESCE(stats.total_expected, 0) > 0 THEN 'validating'")
  })

  it('still promotes an order when its scan count reaches the expected total', () => {
    expect(buildOrderTrackingStatusSql()).toContain(
      "WHEN COALESCE(stats.total_expected, 0) > 0 AND COALESCE(stats.total_scanned, 0) >= COALESCE(stats.total_expected, 0) THEN 'complete'"
    )
  })
})
