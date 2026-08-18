import api from '../../../core/services/api'
import {
  getOutboundList as getOutboundListFromSheets,
  getOutboundDetail as getOutboundDetailFromSheets,
} from '../../WmsHub/services/googleSheetsService'

export const getRecords = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.records)) return payload.data.records
  return []
}

export const getOutboundList = () => getOutboundListFromSheets()

export const getOutboundDetail = (orderNo) => getOutboundDetailFromSheets(orderNo)

export const getScanSessions = (params) =>
  api.get('/wmshub/scan-sessions', { params }).then(r => r.data)

export const createScanSession = (body) =>
  api.post('/wmshub/scan-session', body).then(r => r.data)

export const updateScanSession = (id, body) =>
  api.put(`/wmshub/scan-session/${id}`, body).then(r => r.data)

export const deleteScanSession = (id) =>
  api.delete(`/wmshub/scan-session/${id}`).then(r => r.data)

export const addScanEvent = (body) =>
  api.post('/wmshub/scan-event', body).then(r => r.data)

export const addManualScanEvent = (body) =>
  api.post('/wmshub/scan-event/manual', body).then(r => r.data)

export const updateScanEvent = (id, body) =>
  api.put(`/wmshub/scan-event/${id}`, body).then(r => r.data)

export const deleteScanEvent = (id) =>
  api.delete(`/wmshub/scan-event/${id}`).then(r => r.data)

// Guards against callers passing a JS null/undefined sessionId through a template
// literal, which silently becomes the literal string "null"/"undefined" in the URL
// and turns into a 500 server-side (malformed UUID) instead of failing locally.
export const getScanSession = (id) => {
  if (!id || id === 'null' || id === 'undefined') {
    return Promise.reject(new Error(`getScanSession: invalid session id "${id}"`))
  }
  return api.get(`/wmshub/scan-session/${id}`).then(r => r.data)
}

export const clearSessionEvents = (id) =>
  api.delete(`/wmshub/scan-session/${id}/events`).then(r => r.data)

// Batched session+event detail for bulk exports in Registros — one request instead of
// one getScanSession call per selected row (see export-detail route for why).
export const getScanSessionsExportDetail = (ids) =>
  api.post('/wmshub/scan-sessions/export-detail', { ids }, { timeout: 120000 }).then(r => r.data)

// Surtidores
export const getSurtidores = () =>
  api.get('/wmshub/surtidores').then(r => r.data)

export const createSurtidor = (body) =>
  api.post('/wmshub/surtidores', body).then(r => r.data)

export const updateSurtidor = (id, body) =>
  api.put(`/wmshub/surtidores/${id}`, body).then(r => r.data)

export const deleteSurtidor = (id) =>
  api.delete(`/wmshub/surtidores/${id}`).then(r => r.data)

export const getManualEntryReasons = () =>
  api.get('/wmshub/manual-entry-reasons').then(r => r.data)

export const createManualEntryReason = (body) =>
  api.post('/wmshub/manual-entry-reasons', body).then(r => r.data)

export const updateManualEntryReason = (id, body) =>
  api.put(`/wmshub/manual-entry-reasons/${id}`, body).then(r => r.data)

export const deleteManualEntryReason = (id) =>
  api.delete(`/wmshub/manual-entry-reasons/${id}`).then(r => r.data)

// Order tracking
const ORDER_TRACKING_CACHE_KEY = 'kirion_surtido_order_tracking_v1'
export const getOrderTracking = async () => {
  try {
    const data = await api.get('/wmshub/order-tracking').then(r => r.data)
    try { localStorage.setItem(ORDER_TRACKING_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch {}
    return data
  } catch (error) {
    try {
      const cached = JSON.parse(localStorage.getItem(ORDER_TRACKING_CACHE_KEY) || 'null')
      if (cached?.data?.data && Array.isArray(cached.data.data)) return { ...cached.data, offline: true }
    } catch {}
    throw error
  }
}

export const getOrderTrackingByOBC = (obc) =>
  api.get(`/wmshub/order-tracking/${encodeURIComponent(obc)}`).then(r => r.data)

export const upsertOrderTracking = (obc, body) =>
  api.put(`/wmshub/order-tracking/${encodeURIComponent(obc)}`, body).then(r => r.data)

export const bulkUpsertOrderTracking = (body) =>
  api.post('/wmshub/order-tracking/bulk', body).then(r => r.data)

export const forceValidateOrder = (obc, body) =>
  api.post(`/wmshub/force-validate/${encodeURIComponent(obc)}`, body).then(r => r.data)

export const bulkForceValidateOrders = (body) =>
  api.post('/wmshub/force-validate/bulk', body).then(r => r.data)

// Box status per caja
export const getBoxStatus = (obc) =>
  api.get(`/wmshub/box-status/${encodeURIComponent(obc)}`).then(r => r.data)

export const updateBoxStatus = (obc, code, estado, notas) =>
  api.patch(`/wmshub/box-status/${encodeURIComponent(obc)}/${encodeURIComponent(code)}`, { estado, notas }).then(r => r.data)

export const getBoxIncidents = (obc) =>
  api.get(`/wmshub/box-status-incidents/${encodeURIComponent(obc)}`).then(r => r.data)

export const getBoxStatusDetail = (obc) =>
  api.get(`/wmshub/box-status-detail/${encodeURIComponent(obc)}`).then(r => r.data)

export const getOrderLogs = (obc) =>
  api.get(`/wmshub/order-logs/${encodeURIComponent(obc)}`).then(r => r.data)

export const getScanOperators = () =>
  api.get('/wmshub/scan-operators').then(r => r.data)
