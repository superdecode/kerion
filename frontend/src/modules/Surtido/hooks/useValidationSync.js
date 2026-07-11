import { useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSurtidoStore } from '../stores/surtidoStore'
import { addScanEvent, addManualScanEvent, updateScanSession } from '../services/surtidoService'

const SYNC_INTERVAL_MS = 30_000 // matches legacy dispatch app sync interval

function replayEvent(evt) {
  if (evt.kind === 'manual') return addManualScanEvent(evt.payload)
  if (evt.kind === 'ubicacion') return updateScanSession(evt.payload.id, evt.payload.body)
  return addScanEvent(evt.payload)
}

export function useValidationSync() {
  const { pendingSync, markSynced } = useSurtidoStore()
  const pendingRef = useRef(pendingSync)
  pendingRef.current = pendingSync

  const flushMut = useMutation({
    mutationFn: async (events) => {
      const results = await Promise.allSettled(events.map(replayEvent))
      return events
        .filter((_, i) => results[i].status === 'fulfilled')
        .map(e => e.key)
    },
    onSuccess: (syncedKeys) => {
      if (syncedKeys.length > 0) markSynced(syncedKeys)
    },
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const pending = pendingRef.current
      if (pending.length > 0 && !flushMut.isPending) {
        flushMut.mutate(pending)
      }
    }, SYNC_INTERVAL_MS)

    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { isPending: flushMut.isPending, pendingCount: pendingSync.length }
}
