import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAdminAuthStore } from '../stores/adminAuthStore'
import {
  LayoutDashboard, Building2, FileText, Bell, LogOut,
  ChevronLeft, ChevronRight, Settings, Shield, BarChart3, CreditCard
} from 'lucide-react'

const NAV = [
  { to: '/super-admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/super-admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/super-admin/solicitudes', label: 'Solicitudes', icon: FileText },
  { to: '/super-admin/suscripciones', label: 'Suscripciones', icon: CreditCard },
  { to: '/super-admin/notificaciones', label: 'Notificaciones', icon: Bell },
  { to: '/super-admin/analytics', label: 'Analiticas', icon: BarChart3 },
]

export default function AdminLayout() {
  const { admin, logout } = useAdminAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  function handleLogout() {
    logout()
    navigate('/super-admin/login', { replace: true })
  }

  const initials = admin?.name
    ? admin.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'SA'

  return (
    <div className="min-h-screen bg-gray-950 flex relative">
      {/* Collapse toggle — floating between sidebar and content */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="absolute left-auto right-auto top-24 z-50 w-8 h-8 rounded-full bg-white border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-50 flex items-center justify-center transition-all duration-300 hover:shadow-lg shadow-md"
        style={{ left: collapsed ? 'calc(4rem - 16px)' : 'calc(15rem - 16px)' }}
        title={collapsed ? 'Expandir' : 'Colapsar'}
      >
        <div className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}>
          <ChevronRight className="w-4 h-4 text-blue-600" />
        </div>
      </button>

      {/* Sidebar */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-gray-800 ${collapsed ? 'justify-center px-3' : 'px-5 gap-3'}`}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-none">Kirion</p>
              <p className="text-blue-400 text-[10px] font-semibold uppercase tracking-widest mt-0.5">Super Admin</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-2 border-t border-gray-800 space-y-0.5">
          {/* Admin info */}
          {!collapsed && (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-medium truncate">{admin?.name}</p>
                <p className="text-gray-500 text-[10px] truncate">{admin?.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && 'Cerrar sesion'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
          <div>
            <p className="text-white font-semibold text-sm">Panel de Administracion</p>
            <p className="text-gray-500 text-xs">Sistema Kirion</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-gray-400 text-xs">Sistema operativo</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
