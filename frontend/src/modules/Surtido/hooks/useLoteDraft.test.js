import { describe, it, expect, beforeEach } from 'vitest'
import { LOTE_DRAFT_KEY, loadDraft, saveDraft, clearDraft } from './useLoteDraft'
import { createDraft, scanDraft } from '../utils/loteDraft'
import { buildLotePool } from '../utils/lotePool'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const pool = buildLotePool([{
  outboundOrderNo: 'OBC-1', outboundTime: '2026-08-17 10:00:00',
  packageList: [{ customizeCode: 'AAA-1', quantity: 1 }],
}], '2026-08-17')

beforeEach(() => store.clear())

describe('LOTE_DRAFT_KEY', () => {
  it('aisla el borrador por pestana', () => {
    expect(LOTE_DRAFT_KEY('abc')).toBe('kirion_surtido_lote_abc')
    expect(LOTE_DRAFT_KEY('abc')).not.toBe(LOTE_DRAFT_KEY('def'))
  })
})

describe('persistencia del borrador', () => {
  it('sobrevive un round trip completo', () => {
    const { draft } = scanDraft(createDraft({ dateKey: '2026-08-17', operatorId: 7 }), pool, 'AAA-1')
    saveDraft('t1', draft)
    const recuperado = loadDraft('t1')
    expect(recuperado.scans).toHaveLength(1)
    expect(recuperado.scans[0].orderNo).toBe('OBC-1')
    expect(recuperado.activeTarimaRef).toBe('T01')
  })

  it('devuelve null cuando no hay nada guardado', () => {
    expect(loadDraft('vacio')).toBeNull()
  })

  it('devuelve null ante un borrador corrupto en vez de reventar', () => {
    localStorage.setItem(LOTE_DRAFT_KEY('roto'), '{no es json')
    expect(loadDraft('roto')).toBeNull()
  })

  it('descarta un objeto sin la forma esperada', () => {
    localStorage.setItem(LOTE_DRAFT_KEY('raro'), JSON.stringify({ hola: 1 }))
    expect(loadDraft('raro')).toBeNull()
  })

  it('clearDraft borra la entrada', () => {
    saveDraft('t2', createDraft({ dateKey: '2026-08-17', operatorId: 1 }))
    clearDraft('t2')
    expect(loadDraft('t2')).toBeNull()
  })

  it('no revienta si localStorage esta lleno', () => {
    const original = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = () => { throw new Error('QuotaExceeded') }
    expect(() => saveDraft('t3', createDraft({ dateKey: '2026-08-17', operatorId: 1 }))).not.toThrow()
    globalThis.localStorage.setItem = original
  })
})
