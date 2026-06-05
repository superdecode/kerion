import api from '../../../core/services/api'

export const getFolios = (params) =>
  api.get('/Fep/folios', { params }).then(r => r.data)

export const getFolioStats = () =>
  api.get('/Fep/folios/stats/hoy').then(r => r.data)

export const previewTarimas = (params) =>
  api.get('/Fep/folios/preview-tarimas', { params }).then(r => r.data)

export const getFolio = (id) =>
  api.get(`/Fep/folios/${id}`).then(r => r.data)

export const createFolio = (data) =>
  api.post('/Fep/folios', data).then(r => r.data)

export const editFolio = (id, data) =>
  api.patch(`/Fep/folios/${id}`, data).then(r => r.data)

export const cancelarFolio = (id, motivo) =>
  api.post(`/Fep/folios/${id}/cancelar`, { motivo }).then(r => r.data)

export const eliminarFolio = (id) =>
  api.delete(`/Fep/folios/${id}`).then(r => r.data)

export const getFolioLog = (id) =>
  api.get(`/Fep/folios/${id}/log`).then(r => r.data)

export const downloadPdf = async (id) => {
  const response = await api.get(`/Fep/folios/${id}/pdf`, { responseType: 'blob' })
  return response.data
}
