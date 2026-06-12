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

export const buscarCaja = (q) =>
  api.get('/rastreo/buscar', { params: { q } }).then(r => r.data)
