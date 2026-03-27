import api from '../../../core/services/api'

// Sessions
export const startSession = (empresa_id, canal_id) =>
  api.post('/dropscan/sessions/start', { empresa_id, canal_id }).then(r => r.data)

export const getActiveSession = () =>
  api.get('/dropscan/sessions/active').then(r => r.data)

export const scanGuia = (sessionId, codigo_guia) =>
  api.post(`/dropscan/sessions/${sessionId}/scan`, { codigo_guia }).then(r => r.data)

export const endSession = (sessionId) =>
  api.post(`/dropscan/sessions/${sessionId}/end`).then(r => r.data)

export const deleteGuia = (sessionId, guiaId) =>
  api.delete(`/dropscan/sessions/${sessionId}/guia/${guiaId}`).then(r => r.data)

// Tarimas
export const getTarimas = (params) =>
  api.get('/dropscan/tarimas', { params }).then(r => r.data)

export const getTarimaDetail = (id) =>
  api.get(`/dropscan/tarimas/${id}`).then(r => r.data)

export const lockTarima = (id, razon) =>
  api.post(`/dropscan/tarimas/${id}/lock`, { razon }).then(r => r.data)

export const unlockTarima = (id) =>
  api.post(`/dropscan/tarimas/${id}/unlock`).then(r => r.data)

export const deleteTarima = (id) =>
  api.delete(`/dropscan/tarimas/${id}`).then(r => r.data)

// Dashboard & Metrics
export const getDashboard = () =>
  api.get('/dropscan/dashboard').then(r => r.data)

export const getMetrics = (fecha_inicio, fecha_fin) =>
  api.get('/dropscan/dashboard/metrics', { params: { fecha_inicio, fecha_fin } }).then(r => r.data)

export const searchGuias = (q) =>
  api.get('/dropscan/dashboard/guias/search', { params: { q } }).then(r => r.data)

// Config
export const getEmpresas = () =>
  api.get('/config/dropscan/empresa').then(r => r.data)

export const getCanales = () =>
  api.get('/config/dropscan/canal').then(r => r.data)

export const createConfig = (data) =>
  api.post('/config', data).then(r => r.data)

export const updateConfig = (id, data) =>
  api.put(`/config/${id}`, data).then(r => r.data)
