import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ScanBarcode, RotateCcw, Boxes, BadgeCheck, Truck,
  AlertTriangle, RefreshCw, PackageCheck, Settings2,
} from 'lucide-react'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { DateRangePicker } from '../components/DateRangePicker'
import { getToday } from '../../../core/utils/dateFormat'

import DropScanDashboard from './DropScanDashboard'
import DevoluccionesDashboard from './DevoluccionesDashboard'
import RecepcionDashboard from './RecepcionDashboard'
import InventarioDashboard from './InventarioDashboard'
import SurtidoDashboard from './SurtidoDashboard'
import DespachoDashboard from './DespachoDashboard'
import AnormDashboard from './AnormDashboard'
import AdminDashboard from './AdminDashboard'

// Fila 1: DropScan · Devoluciones · Recepción · Inventario
// Fila 2: Surtido  · Despacho     · Anorm      · Administración
const ALL_MODULES = [
  {
    id: 'dropscan',
    label: 'DropScan',
    icon: ScanBarcode,
    color: 'blue',
    permission: 'dropscan.dashboard',
    module: 'dropscan',
    component: DropScanDashboard,
  },
  {
    id: 'devoluciones',
    label: 'Devoluciones',
    icon: RotateCcw,
    color: 'amber',
    permission: 'devoluciones.dashboard',
    module: 'devoluciones',
    component: DevoluccionesDashboard,
  },
  {
    id: 'recepcion',
    label: 'Recepción',
    icon: PackageCheck,
    color: 'sky',
    permission: 'recepcion.dashboard',
    module: 'recepcion',
    component: RecepcionDashboard,
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: Boxes,
    color: 'teal',
    permission: 'inventario.dashboard',
    module: 'inventario',
    component: InventarioDashboard,
  },
  {
    id: 'surtido',
    label: 'Surtido',
    icon: BadgeCheck,
    color: 'violet',
    permission: 'surtido.dashboard',
    module: 'surtido',
    component: SurtidoDashboard,
  },
  {
    id: 'despacho',
    label: 'Despacho',
    icon: Truck,
    color: 'emerald',
    permission: 'despacho.dashboard',
    module: 'despacho',
    component: DespachoDashboard,
  },
  {
    id: 'anormalidades',
    label: 'Anormalidades',
    icon: AlertTriangle,
    color: 'rose',
    permission: 'anormalidades.dashboard',
    module: 'anormalidades',
    component: AnormDashboard,
  },
  {
    id: 'administracion',
    label: 'Administración',
    icon: Settings2,
    color: 'slate',
    permission: 'usuarios',
    module: 'administracion',
    component: AdminDashboard,
  },
]

const COLOR_STYLES = {
  blue:    { iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    activeBg: 'bg-blue-50',    activeText: 'text-blue-700',   activeDot: 'bg-blue-500',   activeBar: 'bg-blue-500'   },
  amber:   { iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   activeBg: 'bg-amber-50',   activeText: 'text-amber-700',  activeDot: 'bg-amber-500',  activeBar: 'bg-amber-500'  },
  sky:     { iconBg: 'bg-sky-50',     iconColor: 'text-sky-600',     activeBg: 'bg-sky-50',     activeText: 'text-sky-700',    activeDot: 'bg-sky-500',    activeBar: 'bg-sky-500'    },
  teal:    { iconBg: 'bg-teal-50',    iconColor: 'text-teal-600',    activeBg: 'bg-teal-50',    activeText: 'text-teal-700',   activeDot: 'bg-teal-500',   activeBar: 'bg-teal-500'   },
  violet:  { iconBg: 'bg-violet-50',  iconColor: 'text-violet-600',  activeBg: 'bg-violet-50',  activeText: 'text-violet-700', activeDot: 'bg-violet-500', activeBar: 'bg-violet-500' },
  emerald: { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', activeBg: 'bg-emerald-50', activeText: 'text-emerald-700',activeDot: 'bg-emerald-500',activeBar: 'bg-emerald-500'},
  rose:    { iconBg: 'bg-rose-50',    iconColor: 'text-rose-600',    activeBg: 'bg-rose-50',    activeText: 'text-rose-700',   activeDot: 'bg-rose-500',   activeBar: 'bg-rose-500'   },
  slate:   { iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   activeBg: 'bg-slate-50',   activeText: 'text-slate-700',  activeDot: 'bg-slate-500',  activeBar: 'bg-slate-500'  },
}

const DEFAULT_RANGE = { from: getToday(), to: getToday() }
const sessionRanges = {}

export default function DashboardPage() {
  const { hasPermission, isModuleEnabled, user } = useAuthStore()
  const { t } = useI18nStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef(null)

  const visibleModules = useMemo(() =>
    ALL_MODULES.filter(m =>
      isModuleEnabled(m.module) &&
      hasPermission(m.permission, 'actualizar')
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const activeId = searchParams.get('module') || visibleModules[0]?.id || ''
  const activeModule = visibleModules.find(m => m.id === activeId) || visibleModules[0]

  const [dateRange, setDateRange] = useState(() =>
    sessionRanges[activeId] || DEFAULT_RANGE
  )

  useEffect(() => {
    setDateRange(sessionRanges[activeId] || DEFAULT_RANGE)
  }, [activeId])

  const handleModuleSelect = (id) => {
    setSearchParams({ module: id }, { replace: true })
    setCollapsed(true)
    setHovered(false)
  }

  const handleRangeChange = (range) => {
    sessionRanges[activeId] = range
    setDateRange(range)
  }

  const handleMouseEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setHovered(true)
  }

  const handleMouseLeave = () => {
    leaveTimer.current = setTimeout(() => setHovered(false), 120)
  }

  const showFull = !collapsed || hovered

  if (visibleModules.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-warm-300">
        <AlertTriangle className="w-10 h-10 opacity-30" />
        <p className="text-sm">Sin acceso a dashboards</p>
        <p className="text-xs text-warm-400">Se requiere permiso de actualizar en al menos un módulo</p>
      </div>
    )
  }

  const ActiveDashboard = activeModule?.component

  return (
    <div className="flex h-full overflow-hidden">
      {/* Module rail */}
      <aside
        className={`relative flex-shrink-0 bg-white border-r border-warm-100 flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out ${showFull ? 'w-44' : 'w-14'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div className={`flex-shrink-0 h-11 flex items-center border-b border-warm-100 transition-all duration-200 ${showFull ? 'px-4' : 'px-0 justify-center'}`}>
          {showFull
            ? <p className="text-[10px] font-bold uppercase tracking-widest text-warm-400 whitespace-nowrap">Módulos</p>
            : <div className="w-1.5 h-6 rounded-full bg-warm-200" />
          }
        </div>

        {/* Module list */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {visibleModules.map(mod => {
            const isActive = mod.id === activeModule?.id
            const styles = COLOR_STYLES[mod.color]
            const Icon = mod.icon
            return (
              <button
                key={mod.id}
                onClick={() => handleModuleSelect(mod.id)}
                title={!showFull ? mod.label : undefined}
                className={`w-full flex items-center transition-all duration-150 relative
                  ${showFull ? 'gap-2.5 px-3 py-2.5 mx-0' : 'justify-center py-3 px-0'}
                  ${isActive
                    ? `${styles.activeBg}`
                    : 'hover:bg-warm-50'
                  }`}
              >
                {/* Active bar */}
                {isActive && (
                  <span className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r ${styles.activeBar}`} />
                )}

                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                  ${isActive ? styles.iconBg : 'bg-warm-50 group-hover:bg-warm-100'}`}>
                  <Icon className={`w-4 h-4 ${isActive ? styles.iconColor : 'text-warm-400'}`} />
                </div>

                {showFull && (
                  <span className={`flex-1 truncate text-left text-sm font-medium whitespace-nowrap
                    ${isActive ? `${styles.activeText}` : 'text-warm-600'}`}>
                    {mod.label}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Module header */}
        <div className="flex-shrink-0 bg-white border-b border-warm-100 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            {activeModule && (() => {
              const Icon = activeModule.icon
              const styles = COLOR_STYLES[activeModule.color]
              return (
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${styles.iconBg}`}>
                    <Icon className={`w-4 h-4 ${styles.iconColor}`} />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold text-warm-800">{activeModule.label}</h1>
                    <p className="text-[11px] text-warm-400">Dashboard</p>
                  </div>
                </div>
              )
            })()}
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="p-1.5 rounded-lg border border-warm-200 bg-white hover:bg-warm-50 text-warm-400 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-warm-100 ml-1">
                <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-primary-700">
                    {user.nombre_completo?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-[11px] font-semibold text-warm-700 leading-tight">{user.nombre_completo?.split(' ')[0]}</p>
                  <p className="text-[10px] text-warm-400 leading-tight">{user.rol_nombre}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Date filter bar */}
        <div className="flex-shrink-0 sticky top-0 z-[5] bg-white/90 backdrop-blur-lg border-b border-warm-100 px-5 py-2.5">
          <DateRangePicker onChange={handleRangeChange} />
        </div>

        {/* Dashboard content */}
        <div className="flex-1 overflow-y-auto">
          {ActiveDashboard && (
            <ActiveDashboard key={`${activeId}-${refreshKey}`} dateRange={dateRange} />
          )}
        </div>
      </div>
    </div>
  )
}
