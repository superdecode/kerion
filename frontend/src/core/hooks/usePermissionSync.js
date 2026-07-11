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

    // Periodic permission refresh. This is a background poll hit by every open
    // tab/device tenant-wide, and each call runs several DB queries server-side,
    // so it's the app's biggest idle cost driver. 4 min is safe: window-focus and
    // reconnect handlers below still refresh immediately when the user actually
    // interacts (30s cooldown), and the backend force-invalidates stale tokens on
    // permission change via permisos_changed_at (migration 097). Override with
    // VITE_PERM_SYNC_INTERVAL_MS if a tenant needs tighter propagation.
    const intervalMs = Number(import.meta.env.VITE_PERM_SYNC_INTERVAL_MS) || 240_000
    const interval = setInterval(maybeRefresh, intervalMs)

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

    const { isModuleEnabled, enabledModules } = useAuthStore.getState()

    // Find the module for current path
    const currentRoute = MODULE_ROUTES.find(r => location.pathname === r.path ||
                                               (r.path !== '/' && location.pathname.startsWith(r.path)))

    if (!currentRoute) return

    // Resolve permission prefix → actual module code (fep → dropscan, etc.)
    const permPrefix = currentRoute.module.split('.')[0]
    const moduleCode = PERM_TO_MODULE[permPrefix] ?? permPrefix
    const hasPermission = canView(currentRoute.module)
    // An empty enabledModules array can mean "tenant genuinely has none enabled"
    // OR "not hydrated yet" — e.g. right after a fresh mobile load, before the
    // persisted store finishes rehydrating or /auth/me has responded (slower on
    // mobile networks). Treating that transient empty state as a hard denial was
    // kicking users back to the dashboard a few seconds after entering any module.
    // Only enforce the entitlement check once we actually have module data.
    const isModuleActive = ['admin', 'super-admin', 'global', 'sistema'].includes(permPrefix) ||
      enabledModules.length === 0 ||
      isModuleEnabled(moduleCode)

    if (!hasPermission || !isModuleActive) {
      // User lost access/module disabled, redirect to allowed route
      const allowedPath = findAllowedRoute(canView)
      navigate(allowedPath, { replace: true })
    }
  }, [location.pathname, canView, navigate, isAuthenticated])
}
