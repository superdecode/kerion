import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const MODULE_ROUTES = [
  { module: 'global.inicio', path: '/' },
  { module: 'dropscan.dashboard', path: '/dropscan' },
  { module: 'dropscan.escaneo', path: '/DropScan/escaneo' },
  { module: 'dropscan.tarimas', path: '/DropScan/tarimas' },
  { module: 'dropscan.reportes', path: '/DropScan/reportes' },
  { module: 'dropscan.configuracion', path: '/DropScan/configuracion' },
  { module: 'fep.folios', path: '/DropScan/folios' },
  { module: 'inventario.escaneo', path: '/Inventario/escaneo' },
  { module: 'inventario.registros', path: '/Inventario/registros' },
  { module: 'devoluciones.entradas', path: '/Devoluciones/entradas' },
  { module: 'devoluciones.inventario', path: '/Devoluciones/inventario' },
  { module: 'devoluciones.salidas', path: '/Devoluciones/salidas' },
  { module: 'surtido.ordenes', path: '/surtido' },
  { module: 'surtido.validacion', path: '/Surtido/validacion' },
  { module: 'surtido.registros', path: '/Surtido/registros' },
  { module: 'sistema.wms', path: '/wmshub' },
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
