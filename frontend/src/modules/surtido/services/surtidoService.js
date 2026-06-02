import api from '../../../core/services/api'

export const getOutboundList = (params) =>
  api.get('/upapex/outbound-list', { params }).then(r => r.data)

export const getOutboundDetail = (orderNo) =>
  api.get(`/upapex/outbound-detail/${encodeURIComponent(orderNo)}`).then(r => r.data)

export const getScanSessions = (params) =>
  api.get('/upapex/scan-sessions', { params }).then(r => r.data)

export const createScanSession = (body) =>
  api.post('/upapex/scan-session', body).then(r => r.data)

export const updateScanSession = (id, body) =>
  api.put(`/upapex/scan-session/${id}`, body).then(r => r.data)

export const addScanEvent = (body) =>
  api.post('/upapex/scan-event', body).then(r => r.data)

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

// Order tracking
export const getOrderTracking = () =>
  api.get('/upapex/order-tracking').then(r => r.data)

export const getOrderTrackingByOBC = (obc) =>
  api.get(`/upapex/order-tracking/${encodeURIComponent(obc)}`).then(r => r.data)

export const upsertOrderTracking = (obc, body) =>
  api.put(`/upapex/order-tracking/${encodeURIComponent(obc)}`, body).then(r => r.data)
