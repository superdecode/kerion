import api from '../../../core/services/api.js'

export const listOrders = (params = {}) => api.get('/recepcion/orders', { params }).then(r => r.data)
export const listClientes = () => api.get('/recepcion/orders/clientes').then(r => r.data)
export const createOrder = (payload, options = {}) => api.post('/recepcion/orders', payload, options).then(r => r.data)
export const getOrder = (id, params = {}) => api.get(`/recepcion/orders/${id}`, { params }).then(r => r.data)
export const getOrderExportData = (id, scope = 'all') =>
  api.get(`/recepcion/orders/${id}/export-data`, { params: { scope }, timeout: 120000 }).then(r => r.data)
export const updateOrder = (id, payload) => api.patch(`/recepcion/orders/${id}`, payload).then(r => r.data)
export const deleteOrder = (id) => api.delete(`/recepcion/orders/${id}`).then(r => r.data)
export const updateLine = (lineId, payload) => api.patch(`/recepcion/lines/${lineId}`, payload).then(r => r.data)
export const deleteLine = (lineId) => api.delete(`/recepcion/lines/${lineId}`).then(r => r.data)
export const createSession = (orderId, payload) => api.post(`/recepcion/orders/${orderId}/sessions`, payload).then(r => r.data)
export const updateSession = (orderId, sessionId, payload) => api.patch(`/recepcion/orders/${orderId}/sessions/${sessionId}`, payload).then(r => r.data)
export const scanCode = (orderId, payload) => api.post(`/recepcion/orders/${orderId}/scan`, payload).then(r => r.data)
export const getScanEvents = (orderId, params = {}) => api.get(`/recepcion/orders/${orderId}/scan-events`, { params }).then(r => r.data)
export const deleteLastValidationRecord = (orderId) => api.delete(`/recepcion/orders/${orderId}/scan-events/last-validation`).then(r => r.data)
export const deleteScanEvent = (orderId, eventId) => api.delete(`/recepcion/orders/${orderId}/scan-events/${eventId}`).then(r => r.data)
export const deleteLocationScans = (orderId, ubicacion) =>
  api.delete(`/recepcion/orders/${orderId}/scan-events/location/${encodeURIComponent(ubicacion)}`).then(r => r.data)
export const markScanEventAsNovedad = (orderId, eventId, payload) =>
  api.post(`/recepcion/orders/${orderId}/scan-events/${eventId}/anormalidad`, payload).then(r => r.data)
export const markScanEventsAsNovedadBulk = (orderId, payload) =>
  api.post(`/recepcion/orders/${orderId}/scan-events/anormalidad/bulk`, payload).then(r => r.data)
export const relocateScanEvents = (orderId, from_ubicacion, to_ubicacion) =>
  api.patch(`/recepcion/orders/${orderId}/scan-events/relocate`, { from_ubicacion, to_ubicacion }).then(r => r.data)
export const getListaRecepcion = (orderId) => api.get(`/recepcion/orders/${orderId}/lista-recepcion`).then(r => r.data)
export const searchByCode = (code) => api.get('/recepcion/orders/search-by-code', { params: { code } }).then(r => r.data)
export const quickSearchBoxes = (q, limit = 30) => api.get('/recepcion/orders/quick-box-search', { params: { q, limit } }).then(r => r.data)
export const getNovedades = (orderId) => api.get(`/recepcion/orders/${orderId}/novedades`).then(r => r.data)
export const createNovedad = (orderId, payload) => api.post(`/recepcion/orders/${orderId}/novedades`, payload).then(r => r.data)
export const deleteNovedad = (orderId, novedadId) => api.delete(`/recepcion/orders/${orderId}/novedades/${novedadId}`).then(r => r.data)
export const getNovedadTipos = () => api.get('/recepcion/novedad-tipos').then(r => r.data)
export const createNovedadTipo = (payload) => api.post('/recepcion/novedad-tipos', payload).then(r => r.data)
export const updateNovedadTipo = (id, payload) => api.put(`/recepcion/novedad-tipos/${id}`, payload).then(r => r.data)
export const deleteNovedadTipo = (id) => api.delete(`/recepcion/novedad-tipos/${id}`).then(r => r.data)
