import api from '../../../core/services/api'

// Sessions
export const startSession = (empresa_id, canal_id, operadorPayload = {}) =>
  api.post('/dropscan/sessions/start', { empresa_id, canal_id, ...operadorPayload }).then(r => r.data)

export const getActiveSession = () =>
  api.get('/dropscan/sessions/active').then(r => r.data)

export const getAllActiveSessions = () =>
  api.get('/dropscan/sessions/all-active').then(r => r.data)

export const scanGuia = (sessionId, codigo_guia, tarima_id = null) =>
  api.post(`/dropscan/sessions/${sessionId}/scan`, { codigo_guia, tarima_id }).then(r => r.data)

export const endSession = (sessionId) =>
  api.post(`/dropscan/sessions/${sessionId}/end`).then(r => r.data)

// Multi-tarima support
export const addTarima = (sessionId) =>
  api.post(`/dropscan/sessions/${sessionId}/add-tarima`).then(r => r.data)

export const switchTarima = (sessionId, tarima_id) =>
  api.post(`/dropscan/sessions/${sessionId}/switch-tarima`, { tarima_id }).then(r => r.data)

export const deleteGuia = (sessionId, guiaId) =>
  api.delete(`/dropscan/sessions/${sessionId}/guia/${guiaId}`).then(r => r.data)

// Tarimas
export const getTarimas = (params) => {
  const p = { ...params }
  if (Array.isArray(p.empresa_id)) p.empresa_id = p.empresa_id.join(',')
  if (Array.isArray(p.canal_id)) p.canal_id = p.canal_id.join(',')
  if (Array.isArray(p.estado)) p.estado = p.estado.join(',')
  if (Array.isArray(p.escaneador)) p.escaneador = p.escaneador.join(',')
  return api.get('/dropscan/tarimas', { params: p }).then(r => r.data)
}

export const getTarimaDetail = (id) =>
  api.get(`/dropscan/tarimas/${id}`).then(r => r.data)

export const getTarimaDuplicados = (id) =>
  api.get(`/dropscan/tarimas/${id}/duplicados`).then(r => r.data)

export const finalizeTarima = (id) =>
  api.post(`/dropscan/tarimas/${id}/finalize`).then(r => r.data)

export const cancelTarima = (id, razon) =>
  api.post(`/dropscan/tarimas/${id}/cancel`, { razon }).then(r => r.data)

export const reopenTarima = (id) =>
  api.post(`/dropscan/tarimas/${id}/reopen`).then(r => r.data)

export const adoptTarima = (id) =>
  api.post(`/dropscan/tarimas/${id}/adopt`).then(r => r.data)

export const deleteTarima = (id) =>
  api.delete(`/dropscan/tarimas/${id}`).then(r => r.data)

export const addGuiaToTarima = (tarimaId, codigo_guia) =>
  api.post(`/dropscan/tarimas/${tarimaId}/guias`, { codigo_guia }).then(r => r.data)

export const deleteGuiaFromTarima = (tarimaId, guiaId) =>
  api.delete(`/dropscan/tarimas/${tarimaId}/guias/${guiaId}`).then(r => r.data)

// Dashboard & Metrics
export const getDashboard = (fecha_inicio, fecha_fin) => {
  const params = {}
  if (fecha_inicio) params.fecha_inicio = fecha_inicio
  if (fecha_fin) params.fecha_fin = fecha_fin
  return api.get('/dropscan/dashboard', { params }).then(r => r.data)
}

export const getMetrics = (fecha_inicio, fecha_fin, empresa_id, canal_id, escaneador) => {
  const params = { fecha_inicio, fecha_fin }
  if (empresa_id) params.empresa_id = Array.isArray(empresa_id) ? empresa_id.join(',') : empresa_id
  if (canal_id) params.canal_id = Array.isArray(canal_id) ? canal_id.join(',') : canal_id
  if (escaneador && (Array.isArray(escaneador) ? escaneador.length : escaneador)) {
    params.escaneador = Array.isArray(escaneador) ? escaneador.join(',') : escaneador
  }
  return api.get('/dropscan/dashboard/metrics', { params }).then(r => r.data)
}

export const getExportData = (fecha_inicio, fecha_fin, empresa_id, canal_id) => {
  const params = { fecha_inicio, fecha_fin }
  if (empresa_id) params.empresa_id = Array.isArray(empresa_id) ? empresa_id.join(',') : empresa_id
  if (canal_id) params.canal_id = Array.isArray(canal_id) ? canal_id.join(',') : canal_id
  return api.get('/dropscan/dashboard/export', { params }).then(r => r.data)
}

export const searchGuias = (q) =>
  api.get('/dropscan/dashboard/guias/search', { params: { q } }).then(r => r.data)

export const getEscaneadoresList = (fecha_inicio, fecha_fin, empresa_id, canal_id) => {
  const params = { fecha_inicio, fecha_fin }
  if (empresa_id) params.empresa_id = Array.isArray(empresa_id) ? empresa_id.join(',') : empresa_id
  if (canal_id) params.canal_id = Array.isArray(canal_id) ? canal_id.join(',') : canal_id
  return api.get('/dropscan/dashboard/escaneadores', { params }).then(r => r.data)
}

// Config (used by Escaneo for session start dropdowns)
// Use the full dropscan config endpoint which returns empresas[] on each canal
export const getEmpresas = () =>
  api.get('/dropscan/config/empresas').then(r => r.data)

export const getCanales = () =>
  api.get('/dropscan/config/canales').then(r => r.data)

export const getParametros = () =>
  api.get('/dropscan/config/parametros').then(r => r.data)
