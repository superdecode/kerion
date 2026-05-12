import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const MODULE_ROUTES = [
  { module: 'global.inicio', path: '/' },
  { module: 'dropscan.dashboard', path: '/dropscan' },
  { module: 'dropscan.escaneo', path: '/dropscan/escaneo' },
  { module: 'dropscan.historial', path: '/dropscan/historial' },
  { module: 'dropscan.reportes', path: '/dropscan/reportes' },
  { module: 'dropscan.configuracion', path: '/dropscan/configuracion' },
  { module: 'dropscan.folios', path: '/dropscan/folios' },
  { module: 'inventory.escaneo', path: '/inventory/escaneo' },
  { module: 'inventory.historial', path: '/inventory/historial' },
  { module: 'inventory.reportes', path: '/inventory/reportes' },
  { module: 'global.wms', path: '/wms' },
  { module: 'global.administracion', path: '/admin' },
]

function findAllowedRoute(canView) {
  const allowed = MODULE_ROUTES.find(r => r.path !== '/' && canView(r.module))
  return allowed ? allowed.path : '/'
}

export function usePermissionSync() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshUser, canView, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) return

    // Refresh permissions every 45 seconds
    const interval = setInterval(() => {
      refreshUser().catch(() => { /* already logged out */ })
    }, 45000)

    // Also refresh when window regains focus
    const handleFocus = () => {
      refreshUser().catch(() => { /* already logged out */ })
    }

    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isAuthenticated, refreshUser])

  // Check if user still has access to current page
  useEffect(() => {
    if (!isAuthenticated) return

    // Find the module for current path
    const currentRoute = MODULE_ROUTES.find(r => location.pathname === r.path ||
                                               (r.path !== '/' && location.pathname.startsWith(r.path)))

    if (currentRoute && !canView(currentRoute.module)) {
      // User lost access to this page, redirect to allowed route
      const allowedPath = findAllowedRoute(canView)
      navigate(allowedPath, { replace: true })
    }
  }, [location.pathname, canView, navigate, isAuthenticated])
}
