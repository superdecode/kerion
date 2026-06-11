import api from '../../../core/services/api.js'

const BASE = '/anormalidades'

// Registro
export const listAnormalidades = (params = {}) => api.get(BASE, { params }).then(r => r.data)
export const getAnormalidad = (id) => api.get(`${BASE}/${id}`).then(r => r.data)
export const createAnormalidad = (payload) => api.post(BASE, payload).then(r => r.data)
export const updateAnormalidad = (id, payload) => api.put(`${BASE}/${id}`, payload).then(r => r.data)
export const deleteAnormalidad = (id) => api.delete(`${BASE}/${id}`).then(r => r.data)
export const changeEstado = (id, payload) => api.post(`${BASE}/${id}/estado`, payload).then(r => r.data)
export const getUsuarios = () => api.get(`${BASE}/meta/usuarios`).then(r => r.data)

// Dashboard
export const getDashboard = (params = {}) => api.get(`${BASE}/dashboard`, { params }).then(r => r.data)

// Mejoras
export const listMejoras = (params = {}) => api.get(`${BASE}/mejoras`, { params }).then(r => r.data)
export const getMejora = (id) => api.get(`${BASE}/mejoras/${id}`).then(r => r.data)
export const createMejora = (payload) => api.post(`${BASE}/mejoras`, payload).then(r => r.data)
export const updateMejora = (id, payload) => api.put(`${BASE}/mejoras/${id}`, payload).then(r => r.data)
export const vincularMejora = (mejora_id, anormalidad_id) =>
  api.post(`${BASE}/mejoras/${mejora_id}/vincular`, { anormalidad_id }).then(r => r.data)
export const desvincularMejora = (mejora_id, anorm_id) =>
  api.delete(`${BASE}/mejoras/${mejora_id}/vincular/${anorm_id}`).then(r => r.data)

// Config
export const getCodigos = () => api.get(`${BASE}/config/codigos`).then(r => r.data)
export const createCodigo = (payload) => api.post(`${BASE}/config/codigos`, payload).then(r => r.data)
export const updateCodigo = (id, payload) => api.put(`${BASE}/config/codigos/${id}`, payload).then(r => r.data)
export const deleteCodigo = (id) => api.delete(`${BASE}/config/codigos/${id}`).then(r => r.data)
export const getTiempos = () => api.get(`${BASE}/config/tiempos`).then(r => r.data)
export const updateTiempos = (payload) => api.put(`${BASE}/config/tiempos`, payload).then(r => r.data)
