import { describe, expect, it, vi } from 'vitest'
import { generateRastreoFolio, generateRastreoFolioForClient } from './folioService.js'

describe('rastreo folio generation', () => {
  it('continues after the highest sequence instead of reusing a deleted folio', async () => {
    const tQuery = vi.fn().mockResolvedValue({ rows: [{ seq: 18 }] })

    const folio = await generateRastreoFolio(tQuery, 'tenant-id')

    expect(folio).toMatch(/^TK-\d{8}-0019$/)
    expect(tQuery.mock.calls[0][0]).toContain('MAX')
    expect(tQuery.mock.calls[0][0]).not.toContain('COUNT(*)')
    expect(tQuery.mock.calls[0][0]).toContain('folio LIKE $2')
    expect(tQuery.mock.calls[0][0]).not.toContain('created_at')
    expect(tQuery.mock.calls[0][1][1]).toMatch(/^TK-\d{8}-%$/)
  })

  it('serializes and calculates the next sequence inside the transaction', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ seq: 9 }] })

    const folio = await generateRastreoFolioForClient({ query }, 'tenant-id')

    expect(folio).toMatch(/^TK-\d{8}-0010$/)
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('pg_advisory_xact_lock'), expect.any(Array))
    expect(query.mock.calls[1][0]).toContain('MAX')
    expect(query.mock.calls[1][0]).toContain('folio LIKE $2')
  })
})
