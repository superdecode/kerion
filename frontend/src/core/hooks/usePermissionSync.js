import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { PERM_TO_MODULE } from '../components/auth/ProtectedRoute'
import { MODULE_ROUTES } from '../constants/moduleRoutes'

const MIN_REFRESH_INTERVAL_MS = 30_000

function findAllowedRoute(canView) {
  const allowed = MODULE_ROUTES.find(r => r.path !== '/' && canView(r.module))
  return allowed ? allowed.path : '/'
}

export function usePermissionSync() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshUser, canView, isAuthenticated } = useAuthStore()
  const lastRefreshAt = useRef(0)

  function maybeRefresh() {
    const store = useAuthStore.getState()
    if (!store.backendOnline) return
    const now = Date.now()
    if (now - lastRefreshAt.current < MIN_REFRESH_INTERVAL_MS) return
    lastRefreshAt.current = now
    refreshUser().catch(() => {})
  }

  useEffect(() => {
    if (!isAuthenticated) return

    // Refresh permissions every 60 seconds (was 45s — reduced call rate)
    const interval = setInterval(maybeRefresh, 60_000)

    // Refresh on window focus — gated by MIN_REFRESH_INTERVAL_MS cooldown
    const handleFocus = () => maybeRefresh()

    // When browser reports connectivity restored, force one refresh
    const handleOnline = () => {
      useAuthStore.setState({ backendOnline: true })
      lastRefreshAt.current = 0
      maybeRefresh()
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
