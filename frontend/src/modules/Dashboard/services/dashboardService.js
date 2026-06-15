import api from '../../../core/services/api'

export const getSurtidoDashboard = ({ fecha_inicio, fecha_fin }) =>
  api.get('/wmshub/dashboard', { params: { fecha_inicio, fecha_fin } }).then(r => r.data)

export const getInventarioDashboard = ({ fecha_inicio, fecha_fin }) =>
  api.get('/inventory/dashboard', { params: { fecha_inicio, fecha_fin } }).then(r => r.data)

export const getDevoluccionesDashboard = ({ fecha_inicio, fecha_fin }) =>
  api.get('/devoluciones/dashboard', { params: { fecha_inicio, fecha_fin } }).then(r => r.data)

export const getDespachoDashboard = ({ fecha_inicio, fecha_fin }) =>
  api.get('/despacho/dashboard', { params: { fecha_inicio, fecha_fin } }).then(r => r.data)
