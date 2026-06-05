import api from '../../../core/services/api.js'

// Sessions
export const startSession = async ({ origin_location } = {}) => {
  const { data } = await api.post('/Inventory/sessions/start', { origin_location })
  return data
}

export const closeSession = async (sessionId) => {
  const { data } = await api.post(`/Inventory/sessions/${sessionId}/close`)
  return data
}

export const getActiveSession = async () => {
  const { data } = await api.get('/Inventory/sessions/active')
  return data
}

// Scans
export const scanBarcode = async ({ session_id, barcode }) => {
  const { data } = await api.post('/Inventory/scans', { session_id, barcode })
  return data
}

export const getSessionScans = async (sessionId) => {
  const { data } = await api.get(`/Inventory/scans/${sessionId}`)
  return data
}

// History
export const getHistory = async (params = {}) => {
  const { data } = await api.get('/Inventory/history', { params })
  return data
}

// Reports
export const getReports = async (params = {}) => {
  const { data } = await api.get('/Inventory/reports', { params })
  return data
}
