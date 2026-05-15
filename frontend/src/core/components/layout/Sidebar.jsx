import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import {
  LayoutDashboard,
  ScanBarcode,
  History,
  Settings2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileText,
  Settings,
} from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'

const getNavItems = (t) => [
  {
    id: 'dropscan',
    label: 'DropScan',
    items: [
      { path: '/dropscan',              tourId: 'nav-dashboard',      label: t('nav.dashboard'),     icon: LayoutDashboard, permission: 'dropscan.dashboard' },
      { path: '/dropscan/escaneo',      tourId: 'nav-escaneo',        label: t('nav.scanning'),      icon: ScanBarcode,     permission: 'dropscan.escaneo' },
      { path: '/dropscan/historial',    tourId: 'nav-historial',      label: t('nav.history'),       icon: History,         permission: 'dropscan.historial' },
      { path: '/dropscan/folios',       tourId: 'nav-folios',         label: t('nav.fep'),           icon: FileText,        permission: 'fep.folios' },
      { path: '/dropscan/reportes',     tourId: 'nav-reportes',       label: t('nav.reports'),       icon: BarChart3,       permission: 'dropscan.reportes' },
      { path: '/dropscan/configuracion',tourId: 'nav-configuracion',  label: t('nav.configuration'), icon: Settings,        permission: 'dropscan.configuracion' },
    ],
  },
]

const getAdminNav = (t) => [
  { path: '/admin', tourId: 'nav-admin', label: t('nav.administration'), icon: Settings2, permission: 'global.administracion' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, canView } = useAuthStore()
  const { t } = useI18nStore()
  const tourActive = useTourStore((s) => s.active)
  const highlightedSidebarItem = useTourStore((s) => s.highlightedSidebarItem)
  const navigate = useNavigate()

  const navItems = getNavItems(t)
  const adminNav = getAdminNav(t)

  const handleLogout = async () => {
    await useAuthStore.getState().logout()
    navigate('/login', { replace: true })
  }

  const initials = user?.nombre_completo
    ? user.nombre_completo.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const roleName = user?.rol_nombre || user?.rol || ''

  const renderLink = (item) => {
    if (!canView(item.permission)) return null
    const Icon = item.icon
    const isTourHighlighted = tourActive && highlightedSidebarItem === item.tourId
    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === '/dropscan'}
        data-tour={item.tourId}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isActive
              ? 'bg-blue-600/25 text-blue-300 border border-blue-500/30'
              : 'text-blue-200/70 hover:text-white hover:bg-white/10'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
            {!collapsed && <span className="truncate flex-1">{item.label}</span>}
            {isTourHighlighted && (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white flex-shrink-0 tour-nav-arrow" aria-hidden="true">
                <path d="M8 5l8 7-8 7V5z" />
              </svg>
            )}
          </>
        )}
      </NavLink>
    )
  }

  return (
    <aside
      className={`relative ${collapsed ? 'w-16' : 'w-60'} bg-[#0b1437] border-r border-blue-900/40 flex flex-col transition-all duration-200 flex-shrink-0 ${tourActive ? 'z-[100001]' : ''}`}
    >
      {/* Collapse toggle — attached to sidebar right edge */}
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
      <div className={`h-16 flex items-center border-b border-blue-900/40 flex-shrink-0 ${collapsed ? 'justify-center px-3' : 'px-4 gap-3'}`}>
        <img src="/logo.png" alt="Kirion" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none">Kirion</p>
            <p className="text-blue-400 text-[10px] font-semibold uppercase tracking-widest mt-0.5">WMS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav data-tour="sidebar" className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((group) => {
          const visibleItems = group.items.filter(item => canView(item.permission))
          if (visibleItems.length === 0) return null
          return (
            <div key={group.id} className="mb-3">
              {!collapsed && (
                <p className="px-3 text-[10px] font-semibold text-blue-400/60 uppercase tracking-widest mb-1.5">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(renderLink)}
              </div>
            </div>
          )
        })}

        {/* Admin section */}
        {adminNav.some(item => canView(item.permission)) && (
          <div className="mt-3 pt-3 border-t border-blue-900/30">
            {!collapsed && (
              <p className="px-3 text-[10px] font-semibold text-blue-400/60 uppercase tracking-widest mb-1.5">
                {t('nav.administration')}
              </p>
            )}
            <div className="space-y-0.5">
              {adminNav.map(renderLink)}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom — user info + logout */}
      <div className="p-2 border-t border-blue-900/40 space-y-0.5">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.nombre_completo}</p>
              <p className="text-blue-400/60 text-[10px] truncate">{roleName}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-200/60 hover:text-red-400 hover:bg-red-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && t('auth.logout')}
        </button>
      </div>
    </aside>
  )
}
