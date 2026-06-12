import api from './api'

export const getRastreoOrdenes = (params) =>
  api.get('/rastreo', { params }).then(r => r.data)

export const getRastreoDetalle = (folio) =>
  api.get(`/rastreo/${folio}`).then(r => r.data)

export const createRastreoOrden = (body) =>
  api.post('/rastreo', body).then(r => r.data)

export const updateRastreoOrden = (id, body) =>
  api.patch(`/rastreo/${id}`, body).then(r => r.data)

export const updateRastreaoCaja = (id, body) =>
  api.patch(`/rastreo/cajas/${id}`, body).then(r => r.data)

export const deleteRastreoOrden = (id) =>
  api.delete(`/rastreo/${id}`).then(r => r.data)

export const getRastreoUsuarios = () =>
  api.get('/rastreo/usuarios/asignables').then(r => r.data)

export const buscarCaja = (q, mode = 'flexible') =>
  api.get('/rastreo/buscar', { params: { q, mode } }).then(r => r.data)

export const bulkUpdateEstado = (ids, estado) =>
  api.post('/rastreo/bulk/estado', { ids, estado }).then(r => r.data)

export const bulkUpdateResponsable = (ids, asignado_a) =>
  api.post('/rastreo/bulk/responsable', { ids, asignado_a }).then(r => r.data)

export const addCajaToOrden = (orden_id, cajaData) =>
  api.post('/rastreo/cajas/add', { orden_id, ...cajaData }).then(r => r.data)

export const deleteCaja = (id) =>
  api.delete(`/rastreo/cajas/${id}`).then(r => r.data)
