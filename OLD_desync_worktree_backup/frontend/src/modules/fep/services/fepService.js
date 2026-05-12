import api from '../../../core/services/api'

export const getFolios = (params) =>
  api.get('/fep/folios', { params }).then(r => r.data)

export const getFolioStats = () =>
  api.get('/fep/folios/stats/hoy').then(r => r.data)

export const previewTarimas = (params) =>
  api.get('/fep/folios/preview-tarimas', { params }).then(r => r.data)

export const getFolio = (id) =>
  api.get(`/fep/folios/${id}`).then(r => r.data)

export const createFolio = (data) =>
  api.post('/fep/folios', data).then(r => r.data)

export const editFolio = (id, data) =>
  api.patch(`/fep/folios/${id}`, data).then(r => r.data)

export const cancelarFolio = (id, motivo) =>
  api.post(`/fep/folios/${id}/cancelar`, { motivo }).then(r => r.data)

export const eliminarFolio = (id) =>
  api.delete(`/fep/folios/${id}`).then(r => r.data)

export const getFolioLog = (id) =>
  api.get(`/fep/folios/${id}/log`).then(r => r.data)

export const downloadPdf = async (id) => {
  const response = await api.get(`/fep/folios/${id}/pdf`, { responseType: 'blob' })
  return response.data
}
