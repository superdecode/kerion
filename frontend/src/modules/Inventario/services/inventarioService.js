import api from '../../../core/services/api'
import { getInventoryList } from '../../WmsHub/services/googleSheetsService'

export const getBoxStock = () => getInventoryList()

export const getIntegratedInventory = (params) =>
  api.get('/wmshub/integrated-inventory', { params }).then(r => r.data)

// Inventory sessions (batch save — sends all scans at once)
export const saveInventorySession = (body) =>
  api.post('/wmshub/inventory-session', body).then(r => r.data)

export const getInventorySessions = (params) =>
  api.get('/wmshub/inventory-sessions', { params }).then(r => r.data)

export const getInventorySession = (id) =>
  api.get(`/wmshub/inventory-session/${id}`).then(r => r.data)

export const deleteInventorySession = (id) =>
  api.delete(`/wmshub/inventory-session/${id}`).then(r => r.data)

export const createInventoryScan = (body) =>
  api.post('/wmshub/inventory-scan', body).then(r => r.data)

export const checkInventoryDuplicates = (body) =>
  api.post('/wmshub/inventory-duplicates/check', body).then(r => r.data)

export const updateInventoryScan = (id, body) =>
  api.put(`/wmshub/inventory-scan/${id}`, body).then(r => r.data)

export const deleteInventoryScan = (id) =>
  api.delete(`/wmshub/inventory-scan/${id}`).then(r => r.data)
