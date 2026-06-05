import api from '../../../core/services/api.js'

export const listEntradas = async (params = {}) => (await api.get('/Devoluciones/entradas', { params })).data
export const createEntrada = async (payload = {}) => (await api.post('/Devoluciones/entradas', payload)).data
export const getEntrada = async (id) => (await api.get(`/Devoluciones/entradas/${id}`)).data
export const updateEntrada = async (id, payload) => (await api.put(`/Devoluciones/entradas/${id}`, payload)).data
export const confirmEntrada = async (id) => (await api.post(`/Devoluciones/entradas/${id}/confirmar`)).data
export const cancelEntrada = async (id) => (await api.post(`/Devoluciones/entradas/${id}/cancelar`)).data
export const deleteEntrada = async (id) => (await api.delete(`/Devoluciones/entradas/${id}`)).data
export const createEntradaItem = async (id, payload) => (await api.post(`/Devoluciones/entradas/${id}/items`, payload)).data
export const updateEntradaItem = async (id, itemId, payload) => (await api.put(`/Devoluciones/entradas/${id}/items/${itemId}`, payload)).data
export const deleteEntradaItem = async (id, itemId) => (await api.delete(`/Devoluciones/entradas/${id}/items/${itemId}`)).data
export const uploadEntradaFoto = async (id, itemId, payload) => (await api.post(`/Devoluciones/entradas/${id}/items/${itemId}/fotos`, payload)).data
export const deleteEntradaFoto = async (id, itemId, fotoId) => (await api.delete(`/Devoluciones/entradas/${id}/items/${itemId}/fotos/${fotoId}`)).data

export const listInventario = async (params = {}) => (await api.get('/Devoluciones/inventario', { params })).data
export const listMovimientos = async (params = {}) => (await api.get('/Devoluciones/Inventario/historial', { params })).data
export const listAjustes = async () => (await api.get('/Devoluciones/Inventario/ajustes')).data
export const createAjuste = async (payload) => (await api.post('/Devoluciones/Inventario/ajustes', payload)).data
export const updateAjuste = async (id, payload) => (await api.put(`/Devoluciones/Inventario/ajustes/${id}`, payload)).data
export const deleteAjuste = async (id) => (await api.delete(`/Devoluciones/Inventario/ajustes/${id}`)).data
export const listUbicaciones = async () => (await api.get('/Devoluciones/Inventario/ubicaciones')).data
export const createUbicacion = async (payload) => (await api.post('/Devoluciones/Inventario/ubicaciones', payload)).data
export const updateUbicacion = async (id, payload) => (await api.put(`/Devoluciones/Inventario/ubicaciones/${id}`, payload)).data
export const deleteUbicacion = async (id) => (await api.delete(`/Devoluciones/Inventario/ubicaciones/${id}`)).data
export const importUbicaciones = async (payload) => {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData
  return (await api.post('/Devoluciones/Inventario/ubicaciones/importar', payload, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {})).data
}

export const listSalidas = async (params = {}) => (await api.get('/Devoluciones/salidas', { params })).data
export const createSalida = async (payload) => (await api.post('/Devoluciones/salidas', payload)).data
export const getSalida = async (id) => (await api.get(`/Devoluciones/salidas/${id}`)).data
export const updateSalida = async (id, payload) => (await api.put(`/Devoluciones/salidas/${id}`, payload)).data
export const completarSalida = async (id, payload) => (await api.post(`/Devoluciones/salidas/${id}/completar`, payload)).data
export const cancelarSalida = async (id) => (await api.post(`/Devoluciones/salidas/${id}/cancelar`)).data
export const deleteSalida = async (id) => (await api.delete(`/Devoluciones/salidas/${id}`)).data
export const importarSalida = async (payload) => {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData
  return (await api.post('/Devoluciones/salidas/importar', payload, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {})).data
}
export const previewImportarSalida = async (rows) => (await api.post('/Devoluciones/salidas/importar-preview', { rows })).data

export const importarInventario = async (payload) =>
  (await api.post('/Devoluciones/Inventario/importar', payload)).data

export const skuAutocomplete = async (q) => (await api.get('/Devoluciones/sku-autocomplete', { params: { q } })).data

export async function downloadEntradaExcel(id) {
  const response = await api.get(`/Devoluciones/export/entradas/${id}`, { responseType: 'blob' })
  return response.data
}

export async function downloadSalidaExcel(id) {
  const response = await api.get(`/Devoluciones/export/salidas/${id}`, { responseType: 'blob' })
  return response.data
}
