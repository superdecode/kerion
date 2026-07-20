import api from '../../../core/services/api'

// Sessions
export const startSession = (empresa_id, canal_id, operadorPayload = {}) =>
  api.post('/DropScan/sessions/start', { empresa_id, canal_id, ...operadorPayload }).then(r => r.data)

export const getActiveSession = () =>
  api.get('/DropScan/sessions/active').then(r => r.data)

export const getAllActiveSessions = () =>
  api.get('/DropScan/sessions/all-active').then(r => r.data)

export const scanGuia = (sessionId, codigo_guia, tarima_id = null) =>
  api.post(`/DropScan/sessions/${sessionId}/scan`, { codigo_guia, tarima_id }).then(r => r.data)

export const endSession = (sessionId) =>
  api.post(`/DropScan/sessions/${sessionId}/end`).then(r => r.data)

// Multi-tarima support
export const addTarima = (sessionId) =>
  api.post(`/DropScan/sessions/${sessionId}/add-tarima`).then(r => r.data)

export const switchTarima = (sessionId, tarima_id) =>
  api.post(`/DropScan/sessions/${sessionId}/switch-tarima`, { tarima_id }).then(r => r.data)

export const deleteGuia = (sessionId, guiaId) =>
  api.delete(`/DropScan/sessions/${sessionId}/guia/${guiaId}`).then(r => r.data)

export const updateGuiaPeso = (sessionId, guiaId, peso_kg) =>
  api.patch(`/DropScan/sessions/${sessionId}/guia/${guiaId}/peso`, { peso_kg }).then(r => r.data)

// Tarimas
export const getTarimas = (params) => {
  const p = { ...params }
  if (Array.isArray(p.empresa_id)) p.empresa_id = p.empresa_id.join(',')
  if (Array.isArray(p.canal_id)) p.canal_id = p.canal_id.join(',')
  if (Array.isArray(p.estado)) p.estado = p.estado.join(',')
  if (Array.isArray(p.escaneador)) p.escaneador = p.escaneador.join(',')
  return api.get('/DropScan/tarimas', { params: p }).then(r => r.data)
}

export const getTarimaDetail = (id) =>
  api.get(`/DropScan/tarimas/${id}`).then(r => r.data)

// Batched tarima+guias detail for bulk export — one request instead of one
// getTarimaDetail call per selected row.
export const getTarimasExportDetail = (ids) =>
  api.post('/DropScan/tarimas/export-detail', { ids }, { timeout: 120000 }).then(r => r.data)

export const getTarimaDuplicados = (id) =>
  api.get(`/DropScan/tarimas/${id}/duplicados`).then(r => r.data)

export const getTarimaLog = (id) =>
  api.get(`/DropScan/tarimas/${id}/log`).then(r => r.data)

export const finalizeTarima = (id) =>
  api.post(`/DropScan/tarimas/${id}/finalize`).then(r => r.data)

export const cancelTarima = (id, razon) =>
  api.post(`/DropScan/tarimas/${id}/cancel`, { razon }).then(r => r.data)

export const reopenTarima = (id) =>
  api.post(`/DropScan/tarimas/${id}/reopen`).then(r => r.data)

export const adoptTarima = (id) =>
  api.post(`/DropScan/tarimas/${id}/adopt`).then(r => r.data)

export const deleteTarima = (id) =>
  api.delete(`/DropScan/tarimas/${id}`).then(r => r.data)

export const addGuiaToTarima = (tarimaId, codigo_guia, peso_kg = null) =>
  api.post(`/DropScan/tarimas/${tarimaId}/guias`, { codigo_guia, ...(peso_kg != null ? { peso_kg } : {}) }).then(r => r.data)

export const deleteGuiaFromTarima = (tarimaId, guiaId) =>
  api.delete(`/DropScan/tarimas/${tarimaId}/guias/${guiaId}`).then(r => r.data)

// Dashboard & Metrics
export const getDashboard = (fecha_inicio, fecha_fin) => {
  const params = {}
  if (fecha_inicio) params.fecha_inicio = fecha_inicio
  if (fecha_fin) params.fecha_fin = fecha_fin
  return api.get('/DropScan/dashboard', { params }).then(r => r.data)
}

export const getMetrics = (fecha_inicio, fecha_fin, empresa_id, canal_id, escaneador) => {
  const params = { fecha_inicio, fecha_fin }
  if (empresa_id) params.empresa_id = Array.isArray(empresa_id) ? empresa_id.join(',') : empresa_id
  if (canal_id) params.canal_id = Array.isArray(canal_id) ? canal_id.join(',') : canal_id
  if (escaneador && (Array.isArray(escaneador) ? escaneador.length : escaneador)) {
    params.escaneador = Array.isArray(escaneador) ? escaneador.join(',') : escaneador
  }
  return api.get('/DropScan/dashboard/metrics', { params }).then(r => r.data)
}

export const getExportData = (fecha_inicio, fecha_fin, empresa_id, canal_id) => {
  const params = { fecha_inicio, fecha_fin }
  if (empresa_id) params.empresa_id = Array.isArray(empresa_id) ? empresa_id.join(',') : empresa_id
  if (canal_id) params.canal_id = Array.isArray(canal_id) ? canal_id.join(',') : canal_id
  return api.get('/DropScan/dashboard/export', { params }).then(r => r.data)
}

export const searchGuias = (q) =>
  api.get('/DropScan/dashboard/guias/search', { params: { q } }).then(r => r.data)

export const getEscaneadoresList = (fecha_inicio, fecha_fin, empresa_id, canal_id) => {
  const params = { fecha_inicio, fecha_fin }
  if (empresa_id) params.empresa_id = Array.isArray(empresa_id) ? empresa_id.join(',') : empresa_id
  if (canal_id) params.canal_id = Array.isArray(canal_id) ? canal_id.join(',') : canal_id
  return api.get('/DropScan/dashboard/escaneadores', { params }).then(r => r.data)
}

// Config (used by Escaneo for session start dropdowns)
// Use the full dropscan config endpoint which returns empresas[] on each canal
export const getEmpresas = () =>
  api.get('/DropScan/config/empresas').then(r => r.data)

export const getCanales = () =>
  api.get('/DropScan/config/canales').then(r => r.data)

export const getParametros = () =>
  api.get('/DropScan/config/parametros').then(r => r.data)

export const getGuideUsage = () =>
  api.get('/DropScan/guide-usage').then(r => r.data)
