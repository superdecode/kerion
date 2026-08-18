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

// A session's scan list can run into the tens of thousands of rows — give it real headroom
// instead of the default 15s client timeout (the backend query itself has no timeout either,
// see req.tExportTransaction in wms.routes.js).
export const getInventorySession = (id) =>
  api.get(`/wmshub/inventory-session/${id}`, { timeout: 120000 }).then(r => r.data)

// Bulk detail export payload (sessions + all their scans) for the Registros multi-select export
export const getInventorySessionsExportDetail = (ids) =>
  api.post('/wmshub/inventory-sessions/export-detail', { ids }, { timeout: 120000 }).then(r => r.data)

export const updateInventorySession = (id, body) =>
  api.patch(`/wmshub/inventory-session/${id}`, body).then(r => r.data)

// Tarimas already registered today at a given ubicacion — drives the "agregar a la
// tarima anterior" prompt instead of silently creating a second tarima for the same spot.
export const getUbicacionActivity = (params) =>
  api.get('/wmshub/inventory-ubicacion-activity', { params }).then(r => r.data)

export const appendInventorySession = (id, body) =>
  api.post(`/wmshub/inventory-session/${id}/append`, body).then(r => r.data)

export const getInventoryCodeSearch = (q) =>
  api.get('/wmshub/inventory-code-search', { params: { q } }).then(r => r.data)

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
