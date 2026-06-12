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
import AdminLogin from './modules/SuperAdmin/pages/AdminLogin'
import AdminLayout from './modules/SuperAdmin/components/AdminLayout'
import AdminDashboard from './modules/SuperAdmin/pages/AdminDashboard'
import AdminSolicitudes from './modules/SuperAdmin/pages/AdminSolicitudes'
import AdminTenants from './modules/SuperAdmin/pages/AdminTenants'
import AdminTenantDetalle from './modules/SuperAdmin/pages/AdminTenantDetalle'
import AdminNotificaciones from './modules/SuperAdmin/pages/AdminNotificaciones'
import AdminAnalytics from './modules/SuperAdmin/pages/AdminAnalytics'
import AdminSuscripciones from './modules/SuperAdmin/pages/AdminSuscripciones'
import { useAdminAuthStore } from './modules/SuperAdmin/stores/adminAuthStore'

// Landing page
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'

// Pages
import GlobalDashboard from './pages/GlobalDashboard'
import Administracion from './pages/Administracion'

// DropScan Module
import DropScanDashboard from './modules/DropScan/pages/Dashboard'
import Escaneo from './modules/DropScan/pages/Escaneo'
import Tarimas from './modules/DropScan/pages/Tarimas'
import Reportes from './modules/DropScan/pages/Reportes'
import Configuracion from './modules/DropScan/pages/Configuracion'

// FEP Module
import Folios from './modules/Fep/pages/Folios'
import FolioDetalle from './modules/Fep/pages/FolioDetalle'
import Entradas from './modules/Devoluciones/pages/Entradas'
import EntradaDetalle from './modules/Devoluciones/pages/EntradaDetalle'
import InventarioDevoluciones from './modules/Devoluciones/pages/Inventario'
import Salidas from './modules/Devoluciones/pages/Salidas'
import SalidaDetalle from './modules/Devoluciones/pages/SalidaDetalle'

// Inventario Module
import InventarioRegistros from './modules/Inventario/pages/Registros'
import InventarioEscaneo from './modules/Inventario/pages/Escaneo'
import InventarioRastreo from './modules/Inventario/pages/Rastreo'
import InventarioRastreoDetalle from './modules/Inventario/pages/RastreoDetalle'

// Surtido Module
import SurtidoOrdenes from './modules/Surtido/pages/Ordenes'
import SurtidoOrdenDetalle from './modules/Surtido/pages/OrdenDetalle'
import SurtidoValidacion from './modules/Surtido/pages/Validacion'
import SurtidoRegistros from './modules/Surtido/pages/Registros'

// WMS Hub Module
import WMSHubConfiguracion from './modules/WmsHub/pages/Configuracion'

// Anormalidades Module
import AnormRegistro from './modules/Anormalidades/pages/Registro'
import AnormDashboard from './modules/Anormalidades/pages/Dashboard'
import AnormMejoras from './modules/Anormalidades/pages/Mejoras'
import AnormConfiguracion from './modules/Anormalidades/pages/Configuracion'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

// Smart redirect: if user can't view global dashboard, redirect to first allowed module
const MODULE_ROUTES = [
  { module: 'global.inicio', path: '/' },
  { module: 'dropscan.dashboard', path: '/dropscan' },
  { module: 'dropscan.escaneo', path: '/DropScan/escaneo' },
  { module: 'dropscan.tarimas', path: '/DropScan/tarimas' },
  { module: 'dropscan.reportes', path: '/DropScan/reportes' },
  { module: 'dropscan.configuracion', path: '/DropScan/configuracion' },
  { module: 'fep.folios', path: '/DropScan/folios' },
  { module: 'devoluciones.entradas', path: '/Devoluciones/entradas' },
  { module: 'devoluciones.inventario', path: '/Devoluciones/inventario' },
  { module: 'devoluciones.salidas', path: '/Devoluciones/salidas' },
  { module: 'global.administracion', path: '/admin' },
  { module: 'inventario.escaneo', path: '/Inventario/escaneo' },
  { module: 'inventario.registros', path: '/Inventario/registros' },
  { module: 'surtido.ordenes', path: '/surtido' },
  { module: 'surtido.validacion', path: '/Surtido/validacion' },
  { module: 'surtido.registros', path: '/Surtido/registros' },
  { module: 'sistema.wms', path: '/wmshub' },
  { module: 'anormalidades.registro', path: '/Anormalidades/registro' },
  { module: 'anormalidades.dashboard', path: '/Anormalidades/dashboard' },
  { module: 'anormalidades.mejoras', path: '/Anormalidades/mejoras' },
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
        <Route path="dropscan/historial" element={
          <Navigate to="/DropScan/tarimas" replace />
        } />
        <Route path="dropscan/reportes" element={
          <PermissionRoute module="dropscan.reportes"><ErrorBoundary><Reportes /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/configuracion" element={
          <PermissionRoute module="dropscan.configuracion"><ErrorBoundary><Configuracion /></ErrorBoundary></PermissionRoute>
        } />

        {/* Inventory — future module, redirect to main for now */}
        <Route path="inventory/*" element={<Navigate to="/dropscan" replace />} />

        {/* FEP — embedded inside DropScan */}
        <Route path="dropscan/folios" element={
          <PermissionRoute module="fep.folios"><ErrorBoundary><Folios /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/folios/:id" element={
          <PermissionRoute module="fep.folios"><ErrorBoundary><FolioDetalle /></ErrorBoundary></PermissionRoute>
        } />

        {/* WMS Hub — Sistema section */}
        <Route path="wmshub" element={
          <PermissionRoute module="sistema.wms"><ErrorBoundary><WMSHubConfiguracion /></ErrorBoundary></PermissionRoute>
        } />

        {/* Devoluciones */}
        <Route path="devoluciones/entradas" element={
          <PermissionRoute module="devoluciones.entradas"><ErrorBoundary><Entradas /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="devoluciones/entradas/:id" element={
          <PermissionRoute module="devoluciones.entradas"><ErrorBoundary><EntradaDetalle /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="devoluciones/inventario" element={
          <PermissionRoute module="devoluciones.inventario"><ErrorBoundary><InventarioDevoluciones /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="devoluciones/salidas" element={
          <PermissionRoute module="devoluciones.salidas"><ErrorBoundary><Salidas /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="devoluciones/salidas/:id" element={
          <PermissionRoute module="devoluciones.salidas"><ErrorBoundary><SalidaDetalle /></ErrorBoundary></PermissionRoute>
        } />

        {/* Inventario Module */}
        <Route path="inventario" element={<Navigate to="/Inventario/registros" replace />} />
        <Route path="inventario/registros" element={
          <PermissionRoute module="inventario.registros"><ErrorBoundary><InventarioRegistros /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="inventario/escaneo" element={
          <PermissionRoute module="inventario.escaneo"><ErrorBoundary><InventarioEscaneo /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="inventario/stock" element={<Navigate to="/Inventario/registros" replace />} />
        <Route path="inventario/historial" element={<Navigate to="/Inventario/registros" replace />} />
        <Route path="inventario/rastreo" element={
          <PermissionRoute module="inventario.rastreo"><ErrorBoundary><InventarioRastreo /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="inventario/rastreo/:folio" element={
          <PermissionRoute module="inventario.rastreo"><ErrorBoundary><InventarioRastreoDetalle /></ErrorBoundary></PermissionRoute>
        } />

        {/* Surtido Module */}
        <Route path="surtido" element={
          <PermissionRoute module="surtido.ordenes"><ErrorBoundary><SurtidoOrdenes /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="surtido/ordenes/:obc" element={
          <PermissionRoute module="surtido.ordenes"><ErrorBoundary><SurtidoOrdenDetalle /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="surtido/validacion" element={
          <PermissionRoute module="surtido.validacion"><ErrorBoundary><SurtidoValidacion /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="surtido/registros" element={
          <PermissionRoute module="surtido.registros"><ErrorBoundary><SurtidoRegistros /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="surtido/escaneo" element={<Navigate to="/Surtido/validacion" replace />} />
        <Route path="surtido/historial" element={<Navigate to="/Surtido/registros" replace />} />

        {/* Anormalidades Module */}
        <Route path="anormalidades/registro" element={
          <PermissionRoute module="anormalidades.registro"><ErrorBoundary><AnormRegistro /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="anormalidades/dashboard" element={
          <PermissionRoute module="anormalidades.dashboard"><ErrorBoundary><AnormDashboard /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="anormalidades/mejoras" element={
          <PermissionRoute module="anormalidades.mejoras"><ErrorBoundary><AnormMejoras /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="anormalidades/configuracion" element={
          <PermissionRoute module="anormalidades.configuracion"><ErrorBoundary><AnormConfiguracion /></ErrorBoundary></PermissionRoute>
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
