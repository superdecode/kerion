import api from '../../../core/services/api'
import { getInventoryList } from '../../WmsHub/services/googleSheetsService'

export const getBoxStock = () => getInventoryList()

export const getIntegratedInventory = (params) =>
  api.get('/upapex/integrated-inventory', { params }).then(r => r.data)

// Inventory sessions (batch save — sends all scans at once)
export const saveInventorySession = (body) =>
  api.post('/upapex/inventory-session', body).then(r => r.data)

export const getInventorySessions = (params) =>
  api.get('/upapex/inventory-sessions', { params }).then(r => r.data)

export const getInventorySession = (id) =>
  api.get(`/upapex/inventory-session/${id}`).then(r => r.data)

export const deleteInventorySession = (id) =>
  api.delete(`/upapex/inventory-session/${id}`).then(r => r.data)

export const createInventoryScan = (body) =>
  api.post('/upapex/inventory-scan', body).then(r => r.data)

export const checkInventoryDuplicates = (body) =>
  api.post('/upapex/inventory-duplicates/check', body).then(r => r.data)

export const updateInventoryScan = (id, body) =>
  api.put(`/upapex/inventory-scan/${id}`, body).then(r => r.data)

export const deleteInventoryScan = (id) =>
  api.delete(`/upapex/inventory-scan/${id}`).then(r => r.data)
