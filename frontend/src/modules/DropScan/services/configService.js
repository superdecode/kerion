import api from '../../../core/services/api'

// ==================== CANALES DE ESCANEO ====================

export const getCanales = async (params = {}) => {
  const { data } = await api.get('/DropScan/config/canales', { params })
  return data
}

export const getCanal = async (id) => {
  const { data } = await api.get(`/DropScan/config/canales/${id}`)
  return data
}

export const createCanal = async (canalData) => {
  const { data } = await api.post('/DropScan/config/canales', canalData)
  return data
}

export const updateCanal = async (id, canalData) => {
  const { data } = await api.put(`/DropScan/config/canales/${id}`, canalData)
  return data
}

export const deleteCanal = async (id) => {
  const { data } = await api.delete(`/DropScan/config/canales/${id}`)
  return data
}

// ==================== EMPRESAS DE PAQUETERÍA ====================

export const getEmpresas = async (params = {}) => {
  const { data } = await api.get('/DropScan/config/empresas', { params })
  return data
}

export const getEmpresa = async (id) => {
  const { data } = await api.get(`/DropScan/config/empresas/${id}`)
  return data
}

export const createEmpresa = async (empresaData) => {
  const { data } = await api.post('/DropScan/config/empresas', empresaData)
  return data
}

export const updateEmpresa = async (id, empresaData) => {
  const { data } = await api.put(`/DropScan/config/empresas/${id}`, empresaData)
  return data
}

export const deleteEmpresa = async (id) => {
  const { data } = await api.delete(`/DropScan/config/empresas/${id}`)
  return data
}
