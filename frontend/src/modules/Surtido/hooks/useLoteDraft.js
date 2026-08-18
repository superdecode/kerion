import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createDraft, scanDraft, setTarimaUbicacion, advanceTarima, removeScan, removeTarima,
  canRemoveScan, canRemoveTarima, draftSummary, orderProgress, buildCommitPayload, rejectedScans,
} from '../utils/loteDraft'

/**
 * Estado del borrador de un lote, con persistencia local.
 *
 * El borrador vive en localStorage por pestaña, así que un refresh o un corte
 * de energía no pierden lo escaneado. Nada de esto toca la red: el lote solo
 * llega al servidor cuando el operador confirma.
 */

export const LOTE_DRAFT_KEY = (tabId) => `kirion_surtido_lote_${tabId}`

function isDraftShape(value) {
  return Boolean(
    value && typeof value === 'object' &&
    typeof value.dateKey === 'string' &&
    Array.isArray(value.tarimas) &&
    Array.isArray(value.scans) &&
    typeof value.activeTarimaRef === 'string'
  )
}

export function loadDraft(tabId) {
  try {
    const raw = localStorage.getItem(LOTE_DRAFT_KEY(tabId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isDraftShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveDraft(tabId, draft) {
  try {
    localStorage.setItem(LOTE_DRAFT_KEY(tabId), JSON.stringify(draft))
  } catch {
    // Cuota llena o almacenamiento bloqueado: el escaneo sigue en memoria.
  }
}

export function clearDraft(tabId) {
  try { localStorage.removeItem(LOTE_DRAFT_KEY(tabId)) } catch {}
}

export function useLoteDraft({ tabId, dateKey, pool, operatorId, permission, validatedOrders = null }) {
  const [draft, setDraft] = useState(() => {
    const guardado = loadDraft(tabId)
    if (guardado && guardado.dateKey === dateKey) return guardado
    return createDraft({ dateKey, operatorId })
  })

  // Espejo síncrono del borrador: dos lecturas del escáner pueden llegar en el
  // mismo tick, antes de cualquier re-render, y leer `draft` de la clausura
  // anterior perdería el primer escaneo. Toda escritura pasa por commitDraft,
  // que actualiza el ref antes que el estado.
  const draftRef = useRef(draft)

  const commitDraft = useCallback((next) => {
    draftRef.current = next
    setDraft(next)
  }, [])

  useEffect(() => { saveDraft(tabId, draft) }, [tabId, draft])

  // scan, forceScan, setUbicacion y nextTarima devuelven su resultado de forma
  // síncrona: de eso dependen el sonido, el toast y el modal de forzado. Por
  // eso leen draftRef.current en vez del estado de la clausura.
  const scan = useCallback((rawCode) => {
    const salida = scanDraft(draftRef.current, pool, rawCode, { validatedOrders })
    if (salida.outcome.result !== 'needs_force') commitDraft(salida.draft)
    return salida.outcome
  }, [pool, commitDraft, validatedOrders])

  const forceScan = useCallback((rawCode) => {
    const salida = scanDraft(draftRef.current, pool, rawCode, { force: true, validatedOrders })
    commitDraft(salida.draft)
    return salida.outcome
  }, [pool, commitDraft, validatedOrders])

  const setUbicacion = useCallback((ubicacion) => {
    const salida = setTarimaUbicacion(draftRef.current, ubicacion)
    if (!salida.error) commitDraft(salida.draft)
    return salida.error ? { reason: salida.error, summary: salida.summary } : null
  }, [commitDraft])

  const nextTarima = useCallback(() => {
    const salida = advanceTarima(draftRef.current)
    if (!salida.error) commitDraft(salida.draft)
    return salida.error ?? null
  }, [commitDraft])

  const removeScanById = useCallback(
    (id) => commitDraft(removeScan(draftRef.current, id)), [commitDraft]
  )
  const removeTarimaByRef = useCallback(
    (ref) => commitDraft(removeTarima(draftRef.current, ref)), [commitDraft]
  )

  const cancelDraft = useCallback(() => {
    clearDraft(tabId)
    commitDraft(createDraft({ dateKey, operatorId }))
  }, [tabId, dateKey, operatorId, commitDraft])

  const summary = useMemo(() => draftSummary(draft, pool), [draft, pool])
  const progress = useMemo(() => orderProgress(draft, pool), [draft, pool])
  const rejected = useMemo(() => rejectedScans(draft), [draft])
  const activeTarima = draft.tarimas.find(tar => tar.ref === draft.activeTarimaRef) ?? null

  return {
    draft,
    summary,
    progress,
    rejected,
    activeTarimaHasUbicacion: Boolean(activeTarima?.ubicacionNota),
    scan,
    forceScan,
    setUbicacion,
    nextTarima,
    removeScanById,
    removeTarimaByRef,
    canRemoveScanById: (id) => canRemoveScan(draft, id, permission),
    canRemoveTarimaByRef: (ref) => canRemoveTarima(draft, ref, permission),
    cancelDraft,
    commitPayload: (notes) => buildCommitPayload(draft, pool, notes),
  }
}
