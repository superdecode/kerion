import api from '../../../core/services/api'
import {
  getOutboundList as getOutboundListFromSheets,
  findOrderByBarcode as findOrderByBarcodeFromSheets,
  findAllOrdersByBarcode as findAllOrdersByBarcodeFromSheets,
} from '../../WmsHub/services/googleSheetsService'

export const getOutboundList = () => getOutboundListFromSheets()
export const findOrderByBarcode = (barcode) => findOrderByBarcodeFromSheets(barcode)
export const findAllOrdersByBarcode = (barcode) => findAllOrdersByBarcodeFromSheets(barcode)

export const getOrdenesDispatch = () =>
  api.get('/despacho/folios/ordenes-dispatch').then(r => r.data)

export const getFolios = (params) =>
  api.get('/despacho/folios', { params }).then(r => r.data)

export const createFolio = (body) =>
  api.post('/despacho/folios', body).then(r => r.data)

export const getFolio = (id) =>
  api.get(`/despacho/folios/${id}`).then(r => r.data)

export const updateFolio = (id, body) =>
  api.put(`/despacho/folios/${id}`, body).then(r => r.data)

export const addOrder = (id, body) =>
  api.post(`/despacho/folios/${id}/orders`, body).then(r => r.data)

export const updateOrder = (id, orderId, body) =>
  api.put(`/despacho/folios/${id}/orders/${orderId}`, body).then(r => r.data)

export const removeOrder = (id, orderId) =>
  api.delete(`/despacho/folios/${id}/orders/${orderId}`).then(r => r.data)

export const addOrderScan = (id, orderId, body) =>
  api.post(`/despacho/folios/${id}/orders/${orderId}/scans`, body).then(r => r.data)

export const deleteLastOrderScan = (id, orderId) =>
  api.delete(`/despacho/folios/${id}/orders/${orderId}/scans/last`).then(r => r.data)

export const cerrarFolio = (id) =>
  api.post(`/despacho/folios/${id}/cerrar`).then(r => r.data)

export const cancelarFolio = (id) =>
  api.post(`/despacho/folios/${id}/cancelar`).then(r => r.data)

export const getConductores = () =>
  api.get('/despacho/catalogs/conductores').then(r => r.data)

export const createConductor = (body) =>
  api.post('/despacho/catalogs/conductores', body).then(r => r.data)

export const updateConductor = (id, body) =>
  api.put(`/despacho/catalogs/conductores/${id}`, body).then(r => r.data)

export const deleteConductor = (id) =>
  api.delete(`/despacho/catalogs/conductores/${id}`).then(r => r.data)

export const getUnidades = () =>
  api.get('/despacho/catalogs/unidades').then(r => r.data)

export const createUnidad = (body) =>
  api.post('/despacho/catalogs/unidades', body).then(r => r.data)

export const updateUnidad = (id, body) =>
  api.put(`/despacho/catalogs/unidades/${id}`, body).then(r => r.data)

export const deleteUnidad = (id) =>
  api.delete(`/despacho/catalogs/unidades/${id}`).then(r => r.data)
