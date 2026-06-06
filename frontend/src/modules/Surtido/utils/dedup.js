/**
 * Validation deduplication manager.
 * Key format: CODE|OBC|LOCATION  (matches vanilla ValidationDeduplicationManager)
 * Ported from legacy vanilla WMS validation flow::ValidationDeduplicationManager
 */

const STORAGE_KEY = 'kirion_surtido_dedup'

export function createDedup() {
  const synced = new Set(loadFromStorage())

  function key(code, obc, location) {
    return [
      String(code || '').toUpperCase(),
      String(obc || '').toUpperCase(),
      String(location || '').toUpperCase(),
    ].join('|')
  }

  function isSynced(code, obc, location) {
    return synced.has(key(code, obc, location))
  }

  function markSynced(code, obc, location) {
    synced.add(key(code, obc, location))
    saveToStorage(synced)
  }

  function clear() {
    synced.clear()
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  return { isSynced, markSynced, clear }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch { /* ignore */ }
}
