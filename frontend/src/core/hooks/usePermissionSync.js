import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { PERM_TO_MODULE } from '../components/auth/ProtectedRoute'

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
  { module: 'anormalidades.registro', path: '/Anormalidades/registro' },
  { module: 'anormalidades.dashboard', path: '/Anormalidades/dashboard' },
  { module: 'anormalidades.mejoras', path: '/Anormalidades/mejoras' },
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
  const backendOnline = useAuthStore((s) => s.backendOnline)

  useEffect(() => {
    if (!isAuthenticated) return

    // Refresh permissions every 45 seconds — skip if backend is unreachable
    const interval = setInterval(() => {
      if (!useAuthStore.getState().backendOnline) return
      refreshUser().catch(() => {})
    }, 45000)

    // Refresh on window focus — skip if backend is unreachable
    const handleFocus = () => {
      if (!useAuthStore.getState().backendOnline) return
      refreshUser().catch(() => {})
    }

    // When browser reports connectivity restored, try once to reconnect
    const handleOnline = () => {
      useAuthStore.setState({ backendOnline: true })
      refreshUser().catch(() => {})
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, [isAuthenticated, refreshUser])

  // Check if user still has access to current page (permission + module enablement)
  useEffect(() => {
    if (!isAuthenticated) return

    const { isModuleEnabled } = useAuthStore.getState()

    // Find the module for current path
    const currentRoute = MODULE_ROUTES.find(r => location.pathname === r.path ||
                                               (r.path !== '/' && location.pathname.startsWith(r.path)))

    if (!currentRoute) return

    // Resolve permission prefix → actual module code (fep → dropscan, etc.)
    const permPrefix = currentRoute.module.split('.')[0]
    const moduleCode = PERM_TO_MODULE[permPrefix] ?? permPrefix
    const hasPermission = canView(currentRoute.module)
    const isModuleActive = ['admin', 'super-admin', 'global', 'sistema'].includes(permPrefix) || isModuleEnabled(moduleCode)

    if (!hasPermission || !isModuleActive) {
      // User lost access/module disabled, redirect to allowed route
      const allowedPath = findAllowedRoute(canView)
      navigate(allowedPath, { replace: true })
    }
  }, [location.pathname, canView, navigate, isAuthenticated])
}
