import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'

const getNavItems = (t) => [
  {
    id: 'dropscan',
    label: 'DropScan',
    icon: ScanBarcode,
    items: [
      { path: '/dropscan', label: t('nav.dashboard'), icon: LayoutDashboard, permission: 'dropscan.dashboard' },
      { path: '/dropscan/escaneo', label: t('nav.scanning'), icon: ScanBarcode, permission: 'dropscan.escaneo' },
      { path: '/dropscan/historial', label: t('nav.history'), icon: History, permission: 'dropscan.historial' },
      { path: '/dropscan/folios', label: t('nav.fep'), icon: FileText, permission: 'fep.folios' },
      { path: '/dropscan/reportes', label: t('nav.reports'), icon: BarChart3, permission: 'dropscan.reportes' },
    ]
  },
  // Inventory and WMS Hub are future modules — hidden from nav until released
]

const getAdminNav = (t) => [
  { path: '/admin', label: t('nav.administration'), icon: Settings2, permission: 'global.administracion' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, canView } = useAuthStore()
  const { t } = useI18nStore()
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = getNavItems(t)
  const adminNav = getAdminNav(t)

  const handleLogout = () => {
    useAuthStore.getState().logout()
    navigate('/login')
  }

  const renderLink = (item) => {
    if (!canView(item.permission)) return null

    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) =>
          `flex items-center px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary-50 text-primary-600'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`
        }
      >
        <Icon className={`h-5 w-5 ${collapsed ? 'mx-auto' : 'mr-3'}`} />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    )
  }

  return (
    <aside
      className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] bg-white border-r border-gray-200 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto py-4">
          {navItems.map((group) => {
            const visibleItems = group.items.filter(item => canView(item.permission))
            if (visibleItems.length === 0) return null

            return (
              <div key={group.id} className="mb-4">
                {!collapsed && (
                  <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {group.label}
                  </h3>
                )}
                <div className="space-y-1">
                  {visibleItems.map(renderLink)}
                </div>
              </div>
            )
          })}

          <div className="mt-4 pt-4 border-t border-gray-200">
            {!collapsed && (
              <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t('nav.administration')}
              </h3>
            )}
            <div className="space-y-1">
              {adminNav.map(renderLink)}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <LogOut className={`h-5 w-5 ${collapsed ? 'mx-auto' : 'mr-3'}`} />
            {!collapsed && <span>{t('auth.logout')}</span>}
          </button>
          
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="mt-4 flex items-center justify-center w-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
      </div>
    </aside>
  )
}
