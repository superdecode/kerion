import api from '../../../core/services/api'

export const getConfig = () =>
  api.get('/upapex/config').then(r => r.data)

export const saveConfig = (app_key) =>
  api.post('/upapex/config', { app_key }).then(r => r.data)

export const testConnection = () =>
  api.post('/upapex/test-connection').then(r => r.data)
