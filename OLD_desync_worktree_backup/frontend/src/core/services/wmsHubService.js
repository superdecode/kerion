import api from './api.js'

export const getWmsCredentials = async () => {
  const { data } = await api.get('/wms/credentials')
  return data
}

export const saveWmsCredentials = async ({ app_key, app_secret, base_url }) => {
  const { data } = await api.put('/wms/credentials', { app_key, app_secret, base_url })
  return data
}

export const testWmsConnection = async () => {
  const { data } = await api.post('/wms/test')
  return data
}
