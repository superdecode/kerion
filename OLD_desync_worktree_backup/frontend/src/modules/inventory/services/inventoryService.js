import api from '../../../core/services/api.js'

// Sessions
export const startSession = async ({ origin_location } = {}) => {
  const { data } = await api.post('/inventory/sessions/start', { origin_location })
  return data
}

export const closeSession = async (sessionId) => {
  const { data } = await api.post(`/inventory/sessions/${sessionId}/close`)
  return data
}

export const getActiveSession = async () => {
  const { data } = await api.get('/inventory/sessions/active')
  return data
}

// Scans
export const scanBarcode = async ({ session_id, barcode }) => {
  const { data } = await api.post('/inventory/scans', { session_id, barcode })
  return data
}

export const getSessionScans = async (sessionId) => {
  const { data } = await api.get(`/inventory/scans/${sessionId}`)
  return data
}

// History
export const getHistory = async (params = {}) => {
  const { data } = await api.get('/inventory/history', { params })
  return data
}

// Reports
export const getReports = async (params = {}) => {
  const { data } = await api.get('/inventory/reports', { params })
  return data
}
