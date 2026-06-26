import { useMemo } from 'react'
import { useAuthStore } from '../core/stores/authStore'
import { useI18nStore } from '../core/stores/i18nStore'
import { motion } from 'framer-motion'
import Header from '../core/components/layout/Header'
import { fmtTimeShort, fmtDateShort } from '../core/utils/dateFormat'
import {
  ScanBarcode, Package, RotateCcw, ArrowUpRight,
  AlertTriangle, Settings2,
  Truck, Clock, LayoutGrid, PackageCheck, ShieldOff,
} from 'lucide-react'
import { Link } from 'react-router-dom'

// Each module defines its sub-routes in priority order.
// The card shows if the user has ANY sub-permission enabled.
// The card link goes to the FIRST accessible sub-route.
const MODULE_DEFS = [
  {
    id: 'dropscan',
    moduleCode: 'dropscan',
    name: 'DropScan',
    description: 'Escaneo de guías y gestión de tarimas',
    icon: ScanBarcode,
    from: '#6366f1', to: '#4338ca',
    light: 'rgba(99,102,241,0.08)', ring: 'rgba(99,102,241,0.2)',
    subRoutes: [
      { permission: 'dropscan.dashboard',      path: '/dashboard?module=dropscan' },
      { permission: 'dropscan.escaneo',         path: '/dropscan/escaneo' },
      { permission: 'dropscan.tarimas',         path: '/dropscan/tarimas' },
      { permission: 'dropscan.reportes',        path: '/dropscan/reportes' },
      { permission: 'dropscan.configuracion',   path: '/dropscan/configuracion' },
    ],
  },
  {
    id: 'devoluciones',
    moduleCode: 'devoluciones',
    name: 'Devoluciones',
    description: 'Entradas, inventario temporal y salidas',
    icon: RotateCcw,
    from: '#f43f5e', to: '#ea580c',
    light: 'rgba(244,63,94,0.08)', ring: 'rgba(244,63,94,0.2)',
    subRoutes: [
      { permission: 'devoluciones.entradas',    path: '/devoluciones/entradas' },
      { permission: 'devoluciones.inventario',  path: '/devoluciones/inventario' },
      { permission: 'devoluciones.salidas',     path: '/devoluciones/salidas' },
    ],
  },
  {
    id: 'recepcion',
    moduleCode: 'recepcion',
    name: 'Recepción',
    description: 'Recepción de mercancía e importación por Excel',
    icon: PackageCheck,
    from: '#0ea5e9', to: '#0369a1',
    light: 'rgba(14,165,233,0.08)', ring: 'rgba(14,165,233,0.2)',
    subRoutes: [
      { permission: 'recepcion.recibir',        path: '/recepcion/recibir' },
      { permission: 'recepcion.validacion',     path: '/recepcion/validacion' },
    ],
  },
  {
    id: 'inventario',
    moduleCode: 'inventario',
    name: 'Inventario',
    description: 'Escaneo, registros y rastreo de stock',
    icon: Package,
    from: '#06b6d4', to: '#0e7490',
    light: 'rgba(6,182,212,0.08)', ring: 'rgba(6,182,212,0.2)',
    subRoutes: [
      { permission: 'inventario.registros',     path: '/inventario/registros' },
      { permission: 'inventario.escaneo',       path: '/inventario/escaneo' },
      { permission: 'inventario.rastreo',       path: '/inventario/rastreo' },
    ],
  },
  {
    id: 'surtido',
    moduleCode: 'surtido',
    name: 'Surtido',
    description: 'Control de órdenes, surtidores y validación de cajas',
    icon: Truck,
    from: '#8b5cf6', to: '#6d28d9',
    light: 'rgba(139,92,246,0.08)', ring: 'rgba(139,92,246,0.2)',
    subRoutes: [
      { permission: 'surtido.ordenes',          path: '/surtido' },
      { permission: 'surtido.validacion',       path: '/surtido/validacion' },
      { permission: 'surtido.registros',        path: '/surtido/registros' },
    ],
  },
  {
    id: 'despacho',
    moduleCode: 'despacho',
    name: 'Despacho',
    description: 'Embarques, folios de salida y gestión de conductores',
    icon: Truck,
    from: '#22c55e', to: '#16a34a',
    light: 'rgba(34,197,94,0.08)', ring: 'rgba(34,197,94,0.2)',
    subRoutes: [
      { permission: 'despacho.validar',         path: '/despacho/validar' },
      { permission: 'despacho.ordenes',         path: '/despacho/ordenes' },
      { permission: 'despacho.folios',          path: '/despacho/folios' },
    ],
  },
  {
    id: 'anormalidades',
    moduleCode: 'anormalidades',
    name: 'Anormalidades',
    description: 'Registro y seguimiento de incidencias',
    icon: AlertTriangle,
    from: '#f59e0b', to: '#d97706',
    light: 'rgba(245,158,11,0.08)', ring: 'rgba(245,158,11,0.2)',
    subRoutes: [
      { permission: 'anormalidades.registro',      path: '/anormalidades/registro' },
      { permission: 'anormalidades.dashboard',     path: '/dashboard?module=anormalidades' },
      { permission: 'anormalidades.mejoras',       path: '/anormalidades/mejoras' },
      { permission: 'anormalidades.configuracion', path: '/anormalidades/configuracion' },
    ],
  },
  {
    id: 'admin',
    moduleCode: null, // global permission, no module enablement check
    name: 'Administración',
    description: 'Usuarios, roles y configuración del sistema',
    icon: Settings2,
    from: '#64748b', to: '#334155',
    light: 'rgba(100,116,139,0.08)', ring: 'rgba(100,116,139,0.2)',
    subRoutes: [
      { permission: 'global.administracion',    path: '/admin' },
    ],
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.25 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
}

const bannerVariants = {
  hidden: { opacity: 0, y: -16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

export default function GlobalDashboard() {
  const { user, canView, isModuleEnabled } = useAuthStore()
  const { t } = useI18nStore()

  const modules = useMemo(() =>
    MODULE_DEFS.map(m => {
      // Admin: only permission check, no module enablement
      if (!m.moduleCode) {
        const first = m.subRoutes.find(r => canView(r.permission))
        return first ? { ...m, path: first.path } : null
      }
      // Regular modules: must be enabled at tenant level
      if (!isModuleEnabled(m.moduleCode)) return null
      // Then find first sub-route the user can access
      const first = m.subRoutes.find(r => canView(r.permission))
      return first ? { ...m, path: first.path } : null
    }).filter(Boolean),
  [canView, isModuleEnabled])

  return (
    <div className="flex flex-col h-full">
      <Header title={t('nav.dashboard')} subtitle={t('app.subtitle')} />

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

        {/* Welcome banner */}
        <motion.div
          variants={bannerVariants}
          initial="hidden"
          animate="visible"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-accent-700 px-7 py-5 text-white shadow-xl"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 -bottom-12 w-48 h-48 rounded-full bg-accent-400/10 blur-2xl" />
          <div className="pointer-events-none absolute right-1/3 top-0 w-64 h-full bg-primary-400/5 blur-2xl" />

          <div className="relative flex items-center justify-between gap-6">
            <div>
              <motion.p
                className="text-xl font-extrabold tracking-tight"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('globalDash.welcome')}, {user?.nombre_completo?.split(' ')[0] || 'Usuario'}
              </motion.p>
              <motion.p
                className="mt-0.5 text-xs font-medium text-primary-200"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                Kirion &middot; {user?.rol_nombre}
              </motion.p>
            </div>

            <motion.div
              className="flex items-center gap-2.5"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 backdrop-blur-sm border border-white/10">
                <LayoutGrid className="w-4 h-4 text-primary-200" />
                <div>
                  <p className="text-base font-extrabold leading-none">{modules.length}</p>
                  <p className="text-[10px] text-primary-200 mt-0.5">{t('globalDash.activeModules')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 backdrop-blur-sm border border-white/10">
                <Clock className="w-4 h-4 text-primary-200" />
                <div>
                  <p className="text-base font-extrabold leading-none">{fmtTimeShort(new Date())}</p>
                  <p className="text-[10px] text-primary-200 mt-0.5">{fmtDateShort(new Date())}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Modules section */}
        <div>
          <motion.p
            className="mb-3.5 text-[11px] font-bold uppercase tracking-widest text-warm-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {t('globalDash.systemModules')}
          </motion.p>

          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {modules.map((mod) => {
              const Icon = mod.icon
              return (
                <motion.div key={mod.id} variants={cardVariants} whileHover={{ y: -3, transition: { duration: 0.2 } }}>
                  <Link
                    to={mod.path}
                    className="group relative flex flex-col gap-3.5 overflow-hidden rounded-2xl border border-warm-100 bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-lg h-full"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                      style={{ background: `radial-gradient(circle at top left, ${mod.light} 0%, transparent 70%)` }}
                    />

                    <div className="relative flex items-center justify-between">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl shadow-md transition-transform duration-300 group-hover:scale-110"
                        style={{ background: `linear-gradient(135deg, ${mod.from}, ${mod.to})` }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0 translate-x-1"
                        style={{ background: mod.light, border: `1px solid ${mod.ring}` }}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" style={{ color: mod.from }} />
                      </div>
                    </div>

                    <div className="relative">
                      <p className="text-sm font-bold text-warm-800 leading-snug">{mod.name}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-warm-400 line-clamp-2">{mod.description}</p>
                    </div>

                    <div
                      className="absolute bottom-0 left-0 h-0.5 w-0 rounded-full transition-all duration-500 group-hover:w-full"
                      style={{ background: `linear-gradient(90deg, ${mod.from}, ${mod.to})` }}
                    />
                  </Link>
                </motion.div>
              )
            })}

            {modules.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
                  <ShieldOff className="w-8 h-8 text-warm-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-warm-700">Sin acceso a módulos</p>
                  <p className="text-xs text-warm-400 max-w-xs">No tienes permisos asignados. Solicita acceso a tu administrador.</p>
                </div>
              </div>
            )}
          </motion.div>
        </div>

      </div>
    </div>
  )
}
