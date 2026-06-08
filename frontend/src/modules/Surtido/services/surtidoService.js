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

export const getScanSession = (id) =>
  api.get(`/wmshub/scan-session/${id}`).then(r => r.data)

export const clearSessionEvents = (id) =>
  api.delete(`/wmshub/scan-session/${id}/events`).then(r => r.data)

// Surtidores
export const getSurtidores = () =>
  api.get('/wmshub/surtidores').then(r => r.data)

export const createSurtidor = (body) =>
  api.post('/wmshub/surtidores', body).then(r => r.data)

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
export const getOrderTracking = () =>
  api.get('/wmshub/order-tracking').then(r => r.data)

export const getOrderTrackingByOBC = (obc) =>
  api.get(`/wmshub/order-tracking/${encodeURIComponent(obc)}`).then(r => r.data)

export const upsertOrderTracking = (obc, body) =>
  api.put(`/wmshub/order-tracking/${encodeURIComponent(obc)}`, body).then(r => r.data)

export const bulkUpsertOrderTracking = (body) =>
  api.post('/wmshub/order-tracking/bulk', body).then(r => r.data)
