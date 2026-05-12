import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import {
  LayoutDashboard, ScanBarcode, History, BarChart3,
  ChevronLeft, ChevronRight,
  Package, Settings2, Settings, Boxes, Wifi, FileText
} from 'lucide-react'
import { useState } from 'react'

const getModuleNav = (t) => [
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
      { path: '/dropscan/configuracion', label: t('nav.configuration'), icon: Settings, permission: 'dropscan.configuracion' },
    ]
  },
  {
    id: 'inventory',
    label: t('nav.inventory') || 'Inventario',
    icon: Boxes,
    items: [
      { path: '/inventory/escaneo', label: t('nav.scanning'), icon: ScanBarcode, permission: 'inventory.escaneo' },
      { path: '/inventory/historial', label: t('nav.history'), icon: History, permission: 'inventory.historial' },
      { path: '/inventory/reportes', label: t('nav.reports'), icon: BarChart3, permission: 'inventory.reportes' },
    ]
  },
]

const getAdminNav = (t) => [
  { path: '/wms', label: 'WMS Hub', icon: Wifi, permission: 'global.wms' },
  { path: '/admin', label: t('nav.administration'), icon: Settings2, permission: 'global.administracion' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, canView } = useAuthStore()
  const { t } = useI18nStore()

  const initials = user?.nombre_completo
    ? user.nombre_completo.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <motion.aside
      className="h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-800
                 flex flex-col shrink-0 relative border-r border-blue-800/30"
      style={{ zIndex: 100, position: 'relative' }}
      animate={{ width: collapsed ? 68 : 260 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Dark gradient overlay effects — clipped to aside bounds */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-800/20 via-transparent to-slate-900/40" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-700/30 rounded-full blur-3xl" />
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-slate-700/40 rounded-full blur-2xl" />
      </div>

      {/* Collapse toggle — sits outside aside clip so it renders above page content */}
      <motion.button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-4 top-24 w-8 h-8 rounded-full
                   bg-white shadow-xl border-2 border-primary-200
                   flex items-center justify-center
                   text-primary-600 hover:text-primary-700
                   hover:shadow-2xl hover:border-primary-300 hover:bg-primary-50
                   transition-all duration-300"
        title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        style={{ zIndex: 9999 }}
      >
        <motion.div
          animate={{ rotate: collapsed ? 0 : 180 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ChevronRight className="w-4 h-4" />
        </motion.div>
      </motion.button>

      {/* Logo Header */}
      <div className={`flex items-center gap-3 h-16 border-b border-blue-700/40 shrink-0 relative z-10
                        ${collapsed ? 'px-3 justify-center' : 'px-5'}`}>
        <motion.img
          src="/logo.png"
          alt="Kirion"
          className="w-9 h-9 rounded-xl shrink-0 object-contain"
          whileHover={{ scale: 1.08, rotate: 3 }}
          transition={{ type: 'spring', stiffness: 400 }}
        />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="flex-1 min-w-0"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <h1 className="text-sm font-bold text-white tracking-tight">Kirion</h1>
              <p className="text-[10px] text-blue-200 font-medium">WMS</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-2.5 relative z-10">
        {/* Global Dashboard - Inicio */}
        {canView('global.inicio') && (
          <NavItem to="/" icon={LayoutDashboard} label={t('nav.home')} collapsed={collapsed} end />
        )}

        {/* Module sections */}
        {getModuleNav(t).map((mod) => {
          const visibleItems = mod.items.filter(item => canView(item.permission))
          if (visibleItems.length === 0) return null

          return (
            <div key={mod.id} className="mt-5">
              <AnimatePresence>
                {!collapsed ? (
                  <motion.p
                    className="px-3 mb-2 text-[10px] font-bold text-blue-300 uppercase tracking-[0.08em]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {mod.label}
                  </motion.p>
                ) : (
                  <div className="flex justify-center mb-2">
                    <div className="w-5 h-[2px] rounded-full bg-blue-600" />
                  </div>
                )}
              </AnimatePresence>
              {visibleItems.map((item, i) => (
                <NavItem
                  key={item.path}
                  to={item.path}
                  icon={item.icon}
                  label={item.label}
                  collapsed={collapsed}
                  end={item.path === '/dropscan'}
                  index={i}
                />
              ))}
            </div>
          )
        })}

        {/* Admin */}
        {getAdminNav(t).some(item => canView(item.permission)) && (
          <div className="mt-5">
            <AnimatePresence>
              {!collapsed ? (
                <motion.p
                  className="px-3 mb-2 text-[10px] font-bold text-warm-400 uppercase tracking-[0.08em]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {t('nav.system')}
                </motion.p>
              ) : (
                <div className="flex justify-center mb-2">
                  <div className="w-5 h-[2px] rounded-full bg-warm-200" />
                </div>
              )}
            </AnimatePresence>
            {getAdminNav(t).filter(item => canView(item.permission)).map((item) => (
              <NavItem key={item.path} to={item.path} icon={item.icon} label={item.label} collapsed={collapsed} />
            ))}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-blue-700/40 p-3 relative z-10">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <motion.div
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500
                        text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm"
            whileHover={{ scale: 1.08 }}
          >
            {initials}
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                className="flex-1 min-w-0"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-sm font-semibold text-white truncate">{user?.nombre_completo}</p>
                <p className="text-[10px] text-blue-200 font-medium truncate">{user?.rol_nombre}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}

function NavItem({ to, icon: Icon, label, collapsed, end = false }) {
  const location = useLocation()
  const isActive = end ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive: active }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 mb-0.5
         ${active
          ? 'text-white'
          : 'text-blue-200 hover:text-white'
        }
         ${collapsed ? 'justify-center px-0' : ''}`
      }
      title={collapsed ? label : undefined}
    >
      {/* Active background with glow */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl border border-blue-400/40 shadow-lg shadow-blue-500/20"
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />
      )}
      {/* Hover background */}
      {!isActive && (
        <div className="absolute inset-0 rounded-xl bg-transparent group-hover:bg-blue-800/30 transition-colors duration-200" />
      )}
      <div className="relative z-10 flex items-center gap-3">
        <Icon className={`w-[18px] h-[18px] shrink-0 transition-all duration-200
                         group-hover:scale-110 ${isActive ? 'text-white' : ''}`} />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              className="truncate"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </NavLink>
  )
}
