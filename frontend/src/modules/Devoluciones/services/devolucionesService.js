import api from '../../../core/services/api.js'

export const listEntradas = async (params = {}) => (await api.get('/devoluciones/entradas', { params })).data
export const createEntrada = async (payload = {}) => (await api.post('/devoluciones/entradas', payload)).data
export const getEntrada = async (id) => (await api.get(`/devoluciones/entradas/${id}`)).data
export const updateEntrada = async (id, payload) => (await api.put(`/devoluciones/entradas/${id}`, payload)).data
export const confirmEntrada = async (id) => (await api.post(`/devoluciones/entradas/${id}/confirmar`)).data
export const cancelEntrada = async (id) => (await api.post(`/devoluciones/entradas/${id}/cancelar`)).data
export const deleteEntrada = async (id) => (await api.delete(`/devoluciones/entradas/${id}`)).data
export const createEntradaItem = async (id, payload) => (await api.post(`/devoluciones/entradas/${id}/items`, payload)).data
export const updateEntradaItem = async (id, itemId, payload) => (await api.put(`/devoluciones/entradas/${id}/items/${itemId}`, payload)).data
export const deleteEntradaItem = async (id, itemId) => (await api.delete(`/devoluciones/entradas/${id}/items/${itemId}`)).data
export const uploadEntradaFoto = async (id, itemId, payload) => (await api.post(`/devoluciones/entradas/${id}/items/${itemId}/fotos`, payload)).data
export const deleteEntradaFoto = async (id, itemId, fotoId) => (await api.delete(`/devoluciones/entradas/${id}/items/${itemId}/fotos/${fotoId}`)).data

export const listInventario = async (params = {}) => (await api.get('/devoluciones/inventario', { params })).data
export const listMovimientos = async (params = {}) => (await api.get('/devoluciones/inventario/historial', { params })).data
export const listAjustes = async () => (await api.get('/devoluciones/inventario/ajustes')).data
export const createAjuste = async (payload) => (await api.post('/devoluciones/inventario/ajustes', payload)).data
export const updateAjuste = async (id, payload) => (await api.put(`/devoluciones/inventario/ajustes/${id}`, payload)).data
export const deleteAjuste = async (id) => (await api.delete(`/devoluciones/inventario/ajustes/${id}`)).data
export const listUbicaciones = async () => (await api.get('/devoluciones/inventario/ubicaciones')).data
export const createUbicacion = async (payload) => (await api.post('/devoluciones/inventario/ubicaciones', payload)).data
export const updateUbicacion = async (id, payload) => (await api.put(`/devoluciones/inventario/ubicaciones/${id}`, payload)).data
export const deleteUbicacion = async (id) => (await api.delete(`/devoluciones/inventario/ubicaciones/${id}`)).data
export const importUbicaciones = async (payload) => {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData
  return (await api.post('/devoluciones/inventario/ubicaciones/importar', payload, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {})).data
}

export const listSalidas = async (params = {}) => (await api.get('/devoluciones/salidas', { params })).data
export const createSalida = async (payload) => (await api.post('/devoluciones/salidas', payload)).data
export const getSalida = async (id) => (await api.get(`/devoluciones/salidas/${id}`)).data
export const updateSalida = async (id, payload) => (await api.put(`/devoluciones/salidas/${id}`, payload)).data
export const completarSalida = async (id, payload) => (await api.post(`/devoluciones/salidas/${id}/completar`, payload)).data
export const cancelarSalida = async (id) => (await api.post(`/devoluciones/salidas/${id}/cancelar`)).data
export const deleteSalida = async (id) => (await api.delete(`/devoluciones/salidas/${id}`)).data
export const importarSalida = async (payload) => {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData
  return (await api.post('/devoluciones/salidas/importar', payload, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {})).data
}
export const previewImportarSalida = async (rows) => (await api.post('/devoluciones/salidas/importar-preview', { rows })).data

export const importarInventario = async (payload) =>
  (await api.post('/devoluciones/inventario/importar', payload)).data

export const skuAutocomplete = async (q) => (await api.get('/devoluciones/sku-autocomplete', { params: { q } })).data

export async function downloadEntradaExcel(id) {
  const response = await api.get(`/devoluciones/export/entradas/${id}`, { responseType: 'blob' })
  return response.data
}

export async function downloadSalidaExcel(id) {
  const response = await api.get(`/devoluciones/export/salidas/${id}`, { responseType: 'blob' })
  return response.data
}
