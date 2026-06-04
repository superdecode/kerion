import api from '../../../core/services/api'

export const getConfig = () =>
  api.get('/upapex/config').then(r => r.data)

export const saveConfig = ({ app_key, app_secret }) =>
  api.post('/upapex/config', { app_key, app_secret }).then(r => r.data)

export const testConnection = () =>
  api.post('/upapex/test-connection').then(r => r.data)

export const getUbicaciones = (modulo) =>
  api.get('/upapex/ubicaciones', { params: { modulo } }).then(r => r.data)

export const saveSheetConfig = ({ sheet_inventory_url, sheet_outbound_url }) =>
  api.put('/upapex/config/sheets', { sheet_inventory_url, sheet_outbound_url }).then(r => r.data)
