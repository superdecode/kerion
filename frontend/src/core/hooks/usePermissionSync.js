import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { PERM_TO_MODULE } from '../components/auth/ProtectedRoute'
import { MODULE_ROUTES } from '../constants/moduleRoutes'

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
