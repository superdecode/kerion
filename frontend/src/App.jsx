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
import AdminSoporte from './modules/SuperAdmin/pages/AdminSoporte'
import { useAdminAuthStore } from './modules/SuperAdmin/stores/adminAuthStore'

// Landing page
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'

// Pages
import GlobalDashboard from './pages/GlobalDashboard'
import Administracion from './pages/Administracion'

// Dashboard Module (consolidated)
import DashboardPage from './modules/Dashboard/pages/DashboardPage'

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
import GlobalPreloader from './core/components/common/GlobalPreloader'

// Anormalidades Module
import AnormRegistro from './modules/Anormalidades/pages/Registro'
import AnormDashboard from './modules/Anormalidades/pages/Dashboard'
import AnormMejoras from './modules/Anormalidades/pages/Mejoras'
import AnormConfiguracion from './modules/Anormalidades/pages/Configuracion'

// Despacho Module
import DespachoOrdenes from './modules/Despacho/pages/Ordenes'
import DespachoFolios from './modules/Despacho/pages/Folios'
import DespachoFolioDetalle from './modules/Despacho/pages/FolioDetalle'
import DespachoValidar from './modules/Despacho/pages/Validar'

// Recepcion Module
import RecepcionRecibir from './modules/Recepcion/pages/Recibir'
import RecepcionDetalle from './modules/Recepcion/pages/RecepcionDetalle'
import RecepcionEscanear from './modules/Recepcion/pages/Escanear'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry 429 (rate-limit) or 4xx client errors — they won't resolve on retry.
      retry: (failureCount, error) => {
        const status = error?.response?.status
        if (status === 429 || (status >= 400 && status < 500)) return false
        return failureCount < 1
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 35 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})


function SmartRedirect() {
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
        <Route path="soporte" element={<AdminSoporte />} />
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

        {/* Main Dashboard (consolidated) */}
        <Route path="dashboard" element={
          <ErrorBoundary><DashboardPage /></ErrorBoundary>
        } />

        {/* DropScan Module — dashboard moved to /dashboard?module=dropscan */}
        <Route path="dropscan" element={<Navigate to="/dashboard?module=dropscan" replace />} />
        <Route path="dropscan/escaneo" element={
          <PermissionRoute module="dropscan.escaneo"><ErrorBoundary><Escaneo /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/tarimas" element={
          <PermissionRoute module="dropscan.tarimas"><ErrorBoundary><Tarimas /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="dropscan/historial" element={
          <Navigate to="/dropscan/tarimas" replace />
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
        <Route path="sistema/conexion" element={
          <PermissionRoute module="sistema.wms"><ErrorBoundary><WMSHubConfiguracion /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="wmshub" element={<Navigate to="/sistema/conexion" replace />} />

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
        <Route path="inventario" element={<Navigate to="/inventario/registros" replace />} />
        <Route path="inventario/registros" element={
          <PermissionRoute module="inventario.registros"><ErrorBoundary><InventarioRegistros /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="inventario/escaneo" element={
          <PermissionRoute module="inventario.escaneo"><ErrorBoundary><InventarioEscaneo /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="inventario/stock" element={<Navigate to="/inventario/registros" replace />} />
        <Route path="inventario/historial" element={<Navigate to="/inventario/registros" replace />} />
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
        <Route path="surtido/escaneo" element={<Navigate to="/surtido/validacion" replace />} />
        <Route path="surtido/historial" element={<Navigate to="/surtido/registros" replace />} />

        {/* Anormalidades Module */}
        <Route path="anormalidades/registro" element={
          <PermissionRoute module="anormalidades.registro"><ErrorBoundary><AnormRegistro /></ErrorBoundary></PermissionRoute>
        } />
        {/* Anormalidades dashboard moved to /dashboard?module=anormalidades */}
        <Route path="anormalidades/dashboard" element={<Navigate to="/dashboard?module=anormalidades" replace />} />
        <Route path="anormalidades/mejoras" element={
          <PermissionRoute module="anormalidades.mejoras"><ErrorBoundary><AnormMejoras /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="anormalidades/configuracion" element={
          <PermissionRoute module="anormalidades.configuracion"><ErrorBoundary><AnormConfiguracion /></ErrorBoundary></PermissionRoute>
        } />

        {/* Despacho Module */}
        <Route path="despacho/validar" element={
          <PermissionRoute module="despacho.validar"><ErrorBoundary><DespachoValidar /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="despacho/ordenes" element={
          <PermissionRoute module="despacho.ordenes"><ErrorBoundary><DespachoOrdenes /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="despacho/folios" element={
          <PermissionRoute module="despacho.folios"><ErrorBoundary><DespachoFolios /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="despacho/folios/:id" element={
          <PermissionRoute module="despacho.folios"><ErrorBoundary><DespachoFolioDetalle /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="despacho" element={<Navigate to="/despacho/validar" replace />} />

        {/* Recepcion Module */}
        <Route path="recepcion/recibir" element={
          <PermissionRoute module="recepcion.recibir"><ErrorBoundary><RecepcionRecibir /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="recepcion/recibir/:id" element={
          <PermissionRoute module="recepcion.recibir"><ErrorBoundary><RecepcionDetalle /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="recepcion/recibir/:id/validar" element={<Navigate to="/recepcion/escanear" replace />} />
        <Route path="recepcion/escanear" element={
          <PermissionRoute module="recepcion.recibir"><ErrorBoundary><RecepcionEscanear /></ErrorBoundary></PermissionRoute>
        } />
        <Route path="recepcion" element={<Navigate to="/recepcion/recibir" replace />} />

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
        <GlobalPreloader />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
