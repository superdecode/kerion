import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './core/stores/authStore'

// Layout
import MainLayout from './core/components/layout/MainLayout'
import ErrorBoundary from './core/components/common/ErrorBoundary'

// Auth
import Login from './core/components/auth/Login'
import ProtectedRoute, { PermissionRoute } from './core/components/auth/ProtectedRoute'

// Super Admin panel
import AdminLogin from './modules/superadmin/pages/AdminLogin'
import AdminLayout from './modules/superadmin/components/AdminLayout'
import AdminDashboard from './modules/superadmin/pages/AdminDashboard'
import AdminSolicitudes from './modules/superadmin/pages/AdminSolicitudes'
import AdminTenants from './modules/superadmin/pages/AdminTenants'
import AdminTenantDetalle from './modules/superadmin/pages/AdminTenantDetalle'
import AdminNotificaciones from './modules/superadmin/pages/AdminNotificaciones'
import AdminAnalytics from './modules/superadmin/pages/AdminAnalytics'
import AdminSuscripciones from './modules/superadmin/pages/AdminSuscripciones'
import { useAdminAuthStore } from './modules/superadmin/stores/adminAuthStore'

// Landing page
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'

// Pages
import GlobalDashboard from './pages/GlobalDashboard'
import Administracion from './pages/Administracion'

// DropScan Module
import DropScanDashboard from './modules/dropscan/pages/Dashboard'
import Escaneo from './modules/dropscan/pages/Escaneo'
import Tarimas from './modules/dropscan/pages/Tarimas'
import Reportes from './modules/dropscan/pages/Reportes'
import Configuracion from './modules/dropscan/pages/Configuracion'

// Inventory Module
import InvEscaneo from './modules/inventory/pages/Escaneo'
import InvTarimas from './modules/inventory/pages/Tarimas'
import InvReportes from './modules/inventory/pages/Reportes'

// WMS Hub
import WmsHub from './pages/WmsHub'

// FEP Module
import Folios from './modules/fep/pages/Folios'
import FolioDetalle from './modules/fep/pages/FolioDetalle'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
})

// Smart redirect: if user can't view global dashboard, redirect to first allowed module
const MODULE_ROUTES = [
  { module: 'global.inicio', path: '/' },
  { module: 'dropscan.dashboard', path: '/dropscan' },
  { module: 'dropscan.escaneo', path: '/dropscan/escaneo' },
  { module: 'dropscan.tarimas', path: '/dropscan/tarimas' },
  { module: 'dropscan.reportes', path: '/dropscan/reportes' },
  { module: 'dropscan.configuracion', path: '/dropscan/configuracion' },
  { module: 'inventory.escaneo', path: '/inventory/escaneo' },
  { module: 'inventory.tarimas', path: '/inventory/tarimas' },
  { module: 'inventory.reportes', path: '/inventory/reportes' },
  { module: 'fep.folios', path: '/dropscan/folios' },
  { module: 'global.wms', path: '/wms' },
  { module: 'global.administracion', path: '/admin' },
]

function SmartRedirect() {
  const { canView } = useAuthStore()
  if (canView('global.inicio')) return <GlobalDashboard />
  const first = MODULE_ROUTES.find(r => r.path !== '/' && canView(r.module))
  if (first) return <Navigate to={first.path} replace />
  return <GlobalDashboard />
}

function AdminProtectedRoute({ children }) {
  const { isAuthenticated: isAdminAuth } = useAdminAuthStore()
  const { isAuthenticated: isTenantAuth } = useAuthStore()
  // Tenant user trying to access admin panel → back to tenant app
  if (!isAdminAuth && isTenantAuth) return <Navigate to="/" replace />
  if (!isAdminAuth) return <Navigate to="/super-admin/login" replace />
  return children
}

function AppRoutes() {
  const { isAuthenticated, setTokenFromUrl } = useAuthStore()

  // Bootstrap auth from ?token= URL param (from subdomain SSO redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken && !isAuthenticated) {
      setTokenFromUrl(urlToken)
    }
  }, [isAuthenticated, setTokenFromUrl])

  return (
    <Routes>
      {/* PUBLIC ROUTES — No auth required, outside all protected layouts */}

      {/* Landing page */}
      <Route path="/landing" element={<Landing />} />

      {/* Super Admin Login — Completely public, no auth required */}
      <Route path="/super-admin/login" element={<AdminLogin />} />

      {/* Tenant Login — Redirects to dashboard if already authenticated as normal user */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />

      {/* SUPER ADMIN PANEL — Requires super_admin auth */}
      <Route
        path="/super-admin"
        element={<AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>}
      >
        <Route index element={<AdminDashboard />} />
        <Route path="solicitudes" element={<AdminSolicitudes />} />
        <Route path="tenants" element={<AdminTenants />} />
        <Route path="tenants/:id" element={<AdminTenantDetalle />} />
        <Route path="notificaciones" element={<AdminNotificaciones />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="suscripciones" element={<AdminSuscripciones />} />
      </Route>

      {/* TENANT APP — path="/" so this layout only activates for its own child routes,
          never for public routes like /landing or /super-admin/* */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ErrorBoundary><SmartRedirect /></ErrorBoundary>} />

        {/* DropScan Module */}
        <Route path="dropscan" element={
          <PermissionRoute module="dropscan.dashboard"><ErrorBoundary><DropScanDashboard /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/escaneo" element={
          <PermissionRoute module="dropscan.escaneo"><ErrorBoundary><Escaneo /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/tarimas" element={
          <PermissionRoute module="dropscan.tarimas"><ErrorBoundary><Tarimas /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/reportes" element={
          <PermissionRoute module="dropscan.reportes"><ErrorBoundary><Reportes /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/configuracion" element={
          <PermissionRoute module="dropscan.configuracion"><ErrorBoundary><Configuracion /></ErrorBoundary></PermissionRoute>
        } />

        {/* Inventory Module */}
        <Route path="inventory/escaneo" element={
          <PermissionRoute module="inventory.escaneo"><ErrorBoundary><InvEscaneo /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="inventory/tarimas" element={
          <PermissionRoute module="inventory.tarimas"><ErrorBoundary><InvTarimas /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="inventory/historial" element={
          <Navigate to="/inventory/tarimas" replace />
        } />
        <Route path="inventory/reportes" element={
          <PermissionRoute module="inventory.reportes"><ErrorBoundary><InvReportes /></ErrorBoundary></PermissionRoute>
        } />

        {/* FEP — embedded inside DropScan */}
        <Route path="dropscan/folios" element={
          <PermissionRoute module="fep.folios"><ErrorBoundary><Folios /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/folios/:id" element={
          <PermissionRoute module="fep.folios"><ErrorBoundary><FolioDetalle /></ErrorBoundary></PermissionRoute>
        } />

        {/* WMS Hub */}
        <Route path="wms" element={
          <PermissionRoute module="global.wms"><ErrorBoundary><WmsHub /></ErrorBoundary></PermissionRoute>
        } />

        {/* Administration */}
        <Route path="admin" element={
          <PermissionRoute module="global.administracion"><ErrorBoundary><Administracion /></ErrorBoundary></PermissionRoute>
        } />
      </Route>

      {/* 404 — shown for any unmatched route, completely public */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
