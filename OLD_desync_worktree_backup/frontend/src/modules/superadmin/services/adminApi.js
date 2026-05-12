import axios from 'axios'
import { useAdminAuthStore } from '../stores/adminAuthStore'

const adminApi = axios.create({
  baseURL: '/api/admin',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

adminApi.interceptors.request.use((config) => {
  const token = useAdminAuthStore.getState().getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAdminAuthStore.getState().logout()
      if (window.location.pathname !== '/super-admin/login') {
        window.location.href = '/super-admin/login'
      }
    }
    return Promise.reject(err)
  }
)

export default adminApi
