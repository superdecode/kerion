import api from '../../../core/services/api'
import { getInventoryList } from '../../wmshub/services/googleSheetsService'

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
