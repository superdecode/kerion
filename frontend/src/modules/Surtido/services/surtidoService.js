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
  api.get('/upapex/scan-sessions', { params }).then(r => r.data)

export const createScanSession = (body) =>
  api.post('/upapex/scan-session', body).then(r => r.data)

export const updateScanSession = (id, body) =>
  api.put(`/upapex/scan-session/${id}`, body).then(r => r.data)

export const deleteScanSession = (id) =>
  api.delete(`/upapex/scan-session/${id}`).then(r => r.data)

export const addScanEvent = (body) =>
  api.post('/upapex/scan-event', body).then(r => r.data)

export const addManualScanEvent = (body) =>
  api.post('/upapex/scan-event/manual', body).then(r => r.data)

export const updateScanEvent = (id, body) =>
  api.put(`/upapex/scan-event/${id}`, body).then(r => r.data)

export const deleteScanEvent = (id) =>
  api.delete(`/upapex/scan-event/${id}`).then(r => r.data)

export const getScanSession = (id) =>
  api.get(`/upapex/scan-session/${id}`).then(r => r.data)

export const clearSessionEvents = (id) =>
  api.delete(`/upapex/scan-session/${id}/events`).then(r => r.data)

// Surtidores
export const getSurtidores = () =>
  api.get('/upapex/surtidores').then(r => r.data)

export const createSurtidor = (body) =>
  api.post('/upapex/surtidores', body).then(r => r.data)

export const deleteSurtidor = (id) =>
  api.delete(`/upapex/surtidores/${id}`).then(r => r.data)

export const getManualEntryReasons = () =>
  api.get('/upapex/manual-entry-reasons').then(r => r.data)

export const createManualEntryReason = (body) =>
  api.post('/upapex/manual-entry-reasons', body).then(r => r.data)

export const updateManualEntryReason = (id, body) =>
  api.put(`/upapex/manual-entry-reasons/${id}`, body).then(r => r.data)

export const deleteManualEntryReason = (id) =>
  api.delete(`/upapex/manual-entry-reasons/${id}`).then(r => r.data)

// Order tracking
export const getOrderTracking = () =>
  api.get('/upapex/order-tracking').then(r => r.data)

export const getOrderTrackingByOBC = (obc) =>
  api.get(`/upapex/order-tracking/${encodeURIComponent(obc)}`).then(r => r.data)

export const upsertOrderTracking = (obc, body) =>
  api.put(`/upapex/order-tracking/${encodeURIComponent(obc)}`, body).then(r => r.data)
