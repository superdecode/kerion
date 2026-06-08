import api from '../../../core/services/api'

export const getConfig = () =>
  api.get('/wmshub/config').then(r => r.data)

export const getUbicaciones = (modulo) =>
  api.get('/wmshub/ubicaciones', { params: { modulo } }).then(r => ({
    success: true,
    data: r.data?.data ?? r.data?.ubicaciones ?? [],
  }))

export const getUbicacionesAdmin = (modulo) =>
  api.get('/wmshub/ubicaciones', { params: { modulo, full: 1 } }).then(r => ({
    success: true,
    data: r.data?.data ?? r.data?.ubicaciones ?? [],
  }))

export const saveSheetConfig = ({ sheet_inventory_url, sheet_outbound_url }) =>
  api.post('/wmshub/config/sheets', { sheet_inventory_url, sheet_outbound_url }).then(r => r.data)

export const createUbicacion = ({ codigo, nombre, descripcion = '' }) =>
  api.post('/wmshub/ubicaciones', { codigo, nombre, descripcion }).then(r => r.data)

export const updateUbicacion = (id, payload) =>
  api.put(`/wmshub/ubicaciones/${id}`, payload).then(r => r.data)

export const deleteUbicacion = (id) =>
  api.delete(`/wmshub/ubicaciones/${id}`).then(r => r.data)
