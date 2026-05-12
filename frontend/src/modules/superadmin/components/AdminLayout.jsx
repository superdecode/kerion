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
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside
        className={`relative ${collapsed ? 'w-16' : 'w-60'} bg-[#0b1437] border-r border-blue-900/40 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        {/* Collapse toggle — mounted on sidebar right edge */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="absolute -right-3.5 top-[4.5rem] z-20 w-7 h-7 rounded-full bg-white border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-50 flex items-center justify-center transition-colors shadow-md"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
            : <ChevronLeft className="w-3.5 h-3.5 text-blue-600" />}
        </button>
        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-blue-900/40 ${collapsed ? 'justify-center px-3' : 'px-5 gap-3'}`}>
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
                    ? 'bg-blue-600/25 text-blue-300 border border-blue-500/30'
                    : 'text-blue-200/70 hover:text-white hover:bg-white/10'
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
        <div className="p-2 border-t border-blue-900/40 space-y-0.5">
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
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-200/60 hover:text-red-400 hover:bg-red-950/30 transition-colors"
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
