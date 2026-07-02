import { useState, useMemo, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useNavStore } from '../../stores/navStore'
import {
  LayoutDashboard,
  ScanBarcode,
  BadgeCheck,
  History,
  Settings2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileText,
  Settings,
  Boxes,
  PackagePlus,
  PackageMinus,
  Package,
  Wifi,
  AlertTriangle,
  Target,
  Crosshair,
  Truck,
  ClipboardList,
  RotateCcw,
  LayoutGrid,
  Download,
  ScanLine,
} from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'

const GROUP_STYLES = {
  dashboard:    { iconBg: 'bg-indigo-500/25',  iconColor: 'text-indigo-400',  activeBg: 'bg-indigo-600/20',  activeBorder: 'border-indigo-500/40'  },
  dropscan:     { iconBg: 'bg-blue-500/25',    iconColor: 'text-blue-400',    activeBg: 'bg-blue-600/20',    activeBorder: 'border-blue-500/40'    },
  devoluciones: { iconBg: 'bg-amber-500/25',   iconColor: 'text-amber-400',   activeBg: 'bg-amber-600/20',   activeBorder: 'border-amber-500/40'   },
  recepcion:    { iconBg: 'bg-sky-500/25',     iconColor: 'text-sky-400',     activeBg: 'bg-sky-600/20',     activeBorder: 'border-sky-500/40'     },
  inventario:   { iconBg: 'bg-teal-500/25',    iconColor: 'text-teal-400',    activeBg: 'bg-teal-600/20',    activeBorder: 'border-teal-500/40'    },
  surtido:      { iconBg: 'bg-violet-500/25',  iconColor: 'text-violet-400',  activeBg: 'bg-violet-600/20',  activeBorder: 'border-violet-500/40'  },
  despacho:     { iconBg: 'bg-emerald-500/25', iconColor: 'text-emerald-400', activeBg: 'bg-emerald-600/20', activeBorder: 'border-emerald-500/40' },
  anormalidades:{ iconBg: 'bg-rose-500/25',    iconColor: 'text-rose-400',    activeBg: 'bg-rose-600/20',    activeBorder: 'border-rose-500/40'    },
  sistema:      { iconBg: 'bg-slate-500/25',   iconColor: 'text-slate-400',   activeBg: 'bg-slate-600/20',   activeBorder: 'border-slate-500/40'   },
}

const getNavItems = (t) => [
  {
    id: 'dropscan',
    label: 'DropScan',
    icon: ScanBarcode,
    items: [
      { path: '/DropScan/escaneo',       tourId: 'nav-escaneo',       label: t('nav.scanning'),      icon: ScanBarcode,     permission: 'dropscan.escaneo' },
      { path: '/DropScan/tarimas',       tourId: 'nav-tarimas',       label: t('nav.tarimas'),       icon: History,         permission: 'dropscan.tarimas' },
      { path: '/DropScan/folios',        tourId: 'nav-folios',        label: t('nav.fep'),           icon: FileText,        permission: 'fep.folios' },
      { path: '/DropScan/reportes',      tourId: 'nav-reportes',      label: t('nav.reports'),       icon: BarChart3,       permission: 'dropscan.reportes' },
      { path: '/DropScan/configuracion', tourId: 'nav-configuracion', label: t('nav.configuration'), icon: Settings,        permission: 'dropscan.configuracion' },
    ],
  },
  {
    id: 'devoluciones',
    label: t('nav.devoluciones'),
    icon: RotateCcw,
    items: [
      { path: '/Devoluciones/entradas',   tourId: 'nav-dev-entradas',   label: t('nav.dev.entradas'),   icon: PackagePlus,  permission: 'devoluciones.entradas' },
      { path: '/Devoluciones/inventario', tourId: 'nav-dev-inventario', label: t('nav.dev.inventario'), icon: Boxes,        permission: 'devoluciones.inventario' },
      { path: '/Devoluciones/salidas',    tourId: 'nav-dev-salidas',    label: t('nav.dev.salidas'),    icon: PackageMinus, permission: 'devoluciones.salidas' },
    ],
  },
  {
    id: 'recepcion',
    label: t('nav.recepcion'),
    icon: Download,
    items: [
      { path: '/recepcion/recibir',   tourId: 'nav-rec-recibir',   label: t('nav.rec.recibir'),   icon: PackagePlus, permission: 'recepcion.recibir' },
      { path: '/recepcion/escanear',  tourId: 'nav-rec-escanear',  label: t('nav.rec.escanear'),  icon: ScanBarcode, permission: 'recepcion.recibir' },
    ],
  },
  {
    id: 'inventario',
    label: t('nav.inventario'),
    icon: Boxes,
    items: [
      { path: '/Inventario/escaneo',   tourId: 'nav-inv-escaneo',   label: t('nav.inv.escaneo'),   icon: ScanBarcode, permission: 'inventario.escaneo' },
      { path: '/Inventario/registros', tourId: 'nav-inv-registros', label: t('nav.inv.registros'), icon: Package,     permission: 'inventario.registros' },
      { path: '/Inventario/rastreo',   tourId: 'nav-inv-rastreo',   label: t('nav.inv.rastreo'),   icon: Crosshair,   permission: 'inventario.rastreo' },
    ],
  },
  {
    id: 'surtido',
    label: t('nav.surtido'),
    icon: BadgeCheck,
    items: [
      { path: '/Surtido/validacion', tourId: 'nav-sur-validacion', label: t('nav.sur.validacion'), icon: BadgeCheck,    permission: 'surtido.validacion' },
      { path: '/surtido',            tourId: 'nav-sur-ordenes',    label: t('nav.sur.ordenes'),    icon: ClipboardList, permission: 'surtido.ordenes' },
      { path: '/Surtido/registros',  tourId: 'nav-sur-registros',  label: t('nav.sur.registros'),  icon: History,       permission: 'surtido.registros' },
    ],
  },
  {
    id: 'despacho',
    label: t('nav.despacho'),
    icon: Truck,
    items: [
      { path: '/despacho/validar',  tourId: 'nav-desp-validar',  label: t('nav.desp.validar'),  icon: ScanLine,      permission: 'despacho.validar' },
      { path: '/despacho/ordenes',  tourId: 'nav-desp-ordenes',  label: t('nav.desp.ordenes'),  icon: ClipboardList, permission: 'despacho.ordenes' },
      { path: '/despacho/folios',   tourId: 'nav-desp-folios',   label: t('nav.desp.folios'),   icon: Truck,         permission: 'despacho.folios' },
    ],
  },
  {
    id: 'anormalidades',
    label: t('nav.anormalidades'),
    icon: AlertTriangle,
    items: [
      { path: '/Anormalidades/registro',      tourId: 'nav-anorm-registro',  label: t('nav.anorm.registro'),  icon: AlertTriangle, permission: 'anormalidades.registro' },
      { path: '/Anormalidades/mejoras',       tourId: 'nav-anorm-mejoras',   label: t('nav.anorm.mejoras'),   icon: Target,        permission: 'anormalidades.mejoras' },
      { path: '/Anormalidades/configuracion', tourId: 'nav-anorm-config',    label: t('nav.configuration'),   icon: Settings,      permission: 'anormalidades.configuracion' },
    ],
  },
]

const getAdminNav = (t) => [
  { path: '/sistema/conexion', tourId: 'nav-wmshub', label: t('nav.wms.config'),     icon: Wifi,      permission: 'sistema.wms' },
  { path: '/admin',            tourId: 'nav-admin',  label: t('nav.administration'), icon: Settings2, permission: 'global.administracion' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [isMobile, setIsMobile] = useState(false)

  const { mobileOpen, closeNav } = useNavStore()

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const { user, canView, isModuleEnabled, hasPermission } = useAuthStore()
  const { t } = useI18nStore()
  const tourActive = useTourStore((s) => s.active)
  const highlightedSidebarItem = useTourStore((s) => s.highlightedSidebarItem)
  const requestExpandGroup = useTourStore((s) => s.requestExpandGroup)
  const clearExpandGroup = useTourStore((s) => s.clearExpandGroup)

  useEffect(() => {
    if (!requestExpandGroup) return
    const { id, collapseOthers } = requestExpandGroup
    setExpandedGroups(prev => {
      const next = collapseOthers ? new Set([id]) : new Set([...prev, id])
      return next
    })
    clearExpandGroup()
  }, [requestExpandGroup, clearExpandGroup])

  const navigate = useNavigate()
  const { pathname } = useLocation()

  const navItems = getNavItems(t)
  const adminNav = getAdminNav(t)

  const visibleGroups = useMemo(() =>
    navItems.filter(group =>
      isModuleEnabled(group.id) &&
      group.items.some(item => canView(item.permission))
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, navItems]
  )

  const DASHBOARD_PERMISSIONS = [
    'dropscan.dashboard', 'devoluciones.entradas', 'inventario.registros',
    'surtido.ordenes', 'despacho.folios', 'anormalidades.dashboard',
  ]
  const canSeeDashboard = useMemo(() =>
    DASHBOARD_PERMISSIONS.some(p => hasPermission(p, 'actualizar')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  )

  const collapsibleMode = visibleGroups.length > 3

  const toggleGroup = (id) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleLogout = async () => {
    await useAuthStore.getState().logout()
    navigate('/login', { replace: true })
  }

  const initials = user?.nombre_completo
    ? user.nombre_completo.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const roleName = user?.rol_nombre || user?.rol || ''

  // On mobile, always show full content regardless of collapsed state
  const showFull = !collapsed || isMobile

  const isChildActive = (item) => {
    const lp = pathname.toLowerCase()
    const ip = item.path.toLowerCase()
    if (item.path === '/surtido') return lp === '/surtido' || lp.startsWith('/surtido/ordenes')
    if (item.path === '/dropscan') return lp === '/dropscan'
    return lp === ip || lp.startsWith(ip + '/')
  }

  const handleNavClick = () => {
    if (isMobile) closeNav()
  }

  const renderLink = (item) => {
    if (!canView(item.permission)) return null
    const Icon = item.icon
    const isTourHighlighted = tourActive && highlightedSidebarItem === item.tourId
    const lp = pathname.toLowerCase()
    const forceActive = item.path === '/surtido'
      ? (lp === '/surtido' || lp.startsWith('/surtido/ordenes'))
      : null
    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === '/dropscan' || item.path === '/surtido'}
        data-tour={item.tourId}
        onClick={handleNavClick}
        className={({ isActive }) => {
          const active = forceActive !== null ? forceActive : isActive
          return `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            active
              ? 'bg-blue-600/25 text-white border border-blue-500/40'
              : 'text-blue-100/80 hover:text-white hover:bg-white/10 border border-transparent'
          }`
        }}
      >
        {({ isActive }) => {
          const active = forceActive !== null ? forceActive : isActive
          return (
            <>
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-300' : 'text-blue-300/70'}`} />
              {showFull && <span className="truncate flex-1">{item.label}</span>}
              {isTourHighlighted && (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white flex-shrink-0 tour-nav-arrow" aria-hidden="true">
                  <path d="M8 5l8 7-8 7V5z" />
                </svg>
              )}
            </>
          )
        }}
      </NavLink>
    )
  }

  const renderGroup = (group) => {
    if (!isModuleEnabled(group.id)) return null
    const visibleItems = group.items.filter(item => canView(item.permission))
    if (visibleItems.length === 0) return null

    if (collapsibleMode && showFull) {
      const isOpen = expandedGroups.has(group.id)
      const styles = GROUP_STYLES[group.id] || {
        iconBg: 'bg-white/10', iconColor: 'text-blue-400',
        activeBg: 'bg-blue-600/20', activeBorder: 'border-blue-500/40',
      }
      const GroupIcon = group.icon
      const hasActive = visibleItems.some(isChildActive)

      return (
        <div key={group.id} className="mb-1">
          <button
            onClick={() => toggleGroup(group.id)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border ${
              isOpen || hasActive
                ? `${styles.activeBg} ${styles.activeBorder} text-white`
                : 'border-transparent text-blue-100/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
              isOpen || hasActive ? 'bg-white/20' : styles.iconBg
            }`}>
              <GroupIcon className={`w-3.5 h-3.5 ${isOpen || hasActive ? 'text-white' : styles.iconColor}`} />
            </div>
            <span className="flex-1 text-left truncate">{group.label}</span>
            {hasActive && !isOpen && (
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.iconColor} bg-current`} />
            )}
            <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
          </button>
          {isOpen && (
            <div className="mt-0.5 ml-2 pl-2.5 border-l border-blue-900/40 pb-0.5 space-y-0.5">
              {visibleItems.map(renderLink)}
            </div>
          )}
        </div>
      )
    }

    // Non-collapsible (≤3 groups) or icon-only desktop sidebar
    return (
      <div key={group.id} className="mb-3">
        {showFull && (
          <p className="px-3 text-[10px] font-semibold text-blue-300/70 uppercase tracking-widest mb-1.5">
            {group.label}
          </p>
        )}
        <div className="space-y-0.5">
          {visibleItems.map(renderLink)}
        </div>
      </div>
    )
  }

  // Sidebar z-index: tour overrides everything; mobile z-[500] to clear all module content (max z-[220] seen in modules)
  const zClass = tourActive ? 'z-[100001]' : 'z-[500] md:z-auto'

  return (
    <aside
      className={[
        // Mobile: fixed drawer below header (top-14 = 56px), slides from left
        'fixed top-14 left-0 h-[calc(100dvh-3.5rem)] w-[280px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'transition-transform duration-300 ease-in-out',
        // Desktop: relative sidebar in flex layout, full height
        'md:relative md:top-auto md:left-auto md:h-auto md:flex-shrink-0',
        'md:translate-x-0 md:transition-all md:duration-200',
        collapsed ? 'md:w-16' : 'md:w-60',
        // Common
        'bg-[#0b1437] border-r border-blue-900/50 flex flex-col',
        zClass,
      ].join(' ')}
    >
      {/* Desktop collapse toggle — hidden on mobile */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="hidden md:flex absolute -right-3.5 top-[4.5rem] z-[90] w-7 h-7 rounded-full bg-white border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-50 items-center justify-center transition-colors shadow-md"
        title={collapsed ? t('nav.expand') : t('nav.collapse')}
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
          : <ChevronLeft className="w-3.5 h-3.5 text-blue-600" />}
      </button>

      {/* Logo — hidden on mobile (already in header) */}
      <div className={`hidden md:flex h-16 items-center border-b border-blue-900/50 flex-shrink-0 ${!showFull ? 'justify-center px-3' : 'px-4 gap-3'}`}>
        <img src="/logo.png" alt="Kirion" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
        {showFull && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none">Kirion</p>
            <p className="text-blue-300/80 text-[10px] font-semibold uppercase tracking-widest mt-0.5">WMS Auxiliar</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav data-tour="sidebar" className="flex-1 p-2 overflow-y-auto scrollbar-thin sidebar-scrollbar">
        <div className="space-y-0.5">
          {/* Dashboard */}
          {canSeeDashboard && (() => {
            const lp = pathname.toLowerCase()
            const isActive = lp === '/dashboard' || lp.startsWith('/dashboard?') || lp.startsWith('/dashboard/')
            const styles = GROUP_STYLES.dashboard
            return (
              <NavLink
                to="/dashboard"
                onClick={handleNavClick}
                className={() => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1 border ${
                  isActive
                    ? `${styles.activeBg} ${styles.activeBorder} text-white`
                    : 'border-transparent text-blue-100/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-white/20' : styles.iconBg}`}>
                  <LayoutGrid className={`w-3.5 h-3.5 ${isActive ? 'text-white' : styles.iconColor}`} />
                </div>
                {showFull && <span className="truncate flex-1">{t('nav.mainDashboard') || 'Dashboard'}</span>}
              </NavLink>
            )
          })()}
          {navItems.map(renderGroup)}
        </div>

        {/* Sistema */}
        {(() => {
          const visibleAdminItems = adminNav.filter(item => canView(item.permission))
          if (visibleAdminItems.length === 0) return null
          const styles = GROUP_STYLES.sistema
          const isOpen = expandedGroups.has('sistema')
          const hasActive = visibleAdminItems.some(isChildActive)
          return (
            <div className="mt-3 pt-3 border-t border-blue-900/30">
              {showFull ? (
                <>
                  <button
                    onClick={() => toggleGroup('sistema')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border ${
                      isOpen || hasActive
                        ? `${styles.activeBg} ${styles.activeBorder} text-white`
                        : 'border-transparent text-blue-100/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                      isOpen || hasActive ? 'bg-white/20' : styles.iconBg
                    }`}>
                      <Settings2 className={`w-3.5 h-3.5 ${isOpen || hasActive ? 'text-white' : styles.iconColor}`} />
                    </div>
                    <span className="flex-1 text-left truncate">{t('nav.system')}</span>
                    {hasActive && !isOpen && (
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.iconColor} bg-current`} />
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 ml-2 pl-2.5 border-l border-blue-900/40 pb-0.5 space-y-0.5">
                      {visibleAdminItems.map(renderLink)}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-0.5">
                  {visibleAdminItems.map(renderLink)}
                </div>
              )}
            </div>
          )
        })()}
      </nav>

      {/* Bottom — user info + logout */}
      <div className="p-2 border-t border-blue-900/50 space-y-0.5">
        {showFull && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg bg-white/5">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.nombre_completo}</p>
              <p className="text-blue-300/70 text-[10px] truncate">{roleName}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-blue-200/70 hover:text-red-400 hover:bg-red-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {showFull && t('auth.logout')}
        </button>
      </div>
    </aside>
  )
}
