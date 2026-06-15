import { useAuthStore } from '../core/stores/authStore'
import { useI18nStore } from '../core/stores/i18nStore'
import { motion } from 'framer-motion'
import Header from '../core/components/layout/Header'
import { fmtTimeShort, fmtDateShort } from '../core/utils/dateFormat'
import {
  ScanBarcode, Package, RotateCcw, ArrowUpRight,
  AlertTriangle, Settings2, Layers,
  Truck, Clock, LayoutGrid, PackageCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const ALL_MODULES = () => [
  {
    id: 'dropscan',
    permission: 'dropscan.dashboard',
    name: 'Dropscan',
    description: 'Escaneo de guías y gestión de tarimas',
    icon: ScanBarcode,
    path: '/dropscan',
    from: '#6366f1',
    to: '#4338ca',
    light: 'rgba(99,102,241,0.08)',
    ring: 'rgba(99,102,241,0.2)',
  },
  {
    id: 'surtido',
    permission: 'surtido.ordenes',
    name: 'Surtido',
    description: 'Órdenes de salida, validación y registros WMS',
    icon: Truck,
    path: '/surtido',
    from: '#8b5cf6',
    to: '#6d28d9',
    light: 'rgba(139,92,246,0.08)',
    ring: 'rgba(139,92,246,0.2)',
  },
  {
    id: 'devoluciones',
    permission: 'devoluciones.entradas',
    name: 'Devoluciones',
    description: 'Entradas, inventario temporal y salidas',
    icon: RotateCcw,
    path: '/devoluciones/entradas',
    from: '#f43f5e',
    to: '#ea580c',
    light: 'rgba(244,63,94,0.08)',
    ring: 'rgba(244,63,94,0.2)',
  },
  {
    id: 'inventario',
    permission: 'inventario.registros',
    name: 'Inventario',
    description: 'Escaneo, registros y rastreo de stock',
    icon: Package,
    path: '/inventario/registros',
    from: '#06b6d4',
    to: '#0e7490',
    light: 'rgba(6,182,212,0.08)',
    ring: 'rgba(6,182,212,0.2)',
  },
  {
    id: 'anormalidades',
    permission: 'anormalidades.registro',
    name: 'Anormalidades',
    description: 'Registro y seguimiento de incidencias',
    icon: AlertTriangle,
    path: '/anormalidades/registro',
    from: '#f59e0b',
    to: '#d97706',
    light: 'rgba(245,158,11,0.08)',
    ring: 'rgba(245,158,11,0.2)',
  },
  {
    id: 'despacho',
    permission: 'despacho.folios',
    name: 'Despacho',
    description: 'Embarques, folios de salida y gestión de conductores',
    icon: PackageCheck,
    path: '/despacho/folios',
    from: '#22c55e',
    to: '#16a34a',
    light: 'rgba(34,197,94,0.08)',
    ring: 'rgba(34,197,94,0.2)',
  },
  {
    id: 'wmshub',
    permission: 'sistema.wms',
    name: 'WMS Hub',
    description: 'Configuración de conexión con WMS externo',
    icon: Layers,
    path: '/wmshub',
    from: '#10b981',
    to: '#0f766e',
    light: 'rgba(16,185,129,0.08)',
    ring: 'rgba(16,185,129,0.2)',
  },
  {
    id: 'admin',
    permission: 'global.administracion',
    name: 'Administración',
    description: 'Usuarios, roles y configuración del sistema',
    icon: Settings2,
    path: '/admin',
    from: '#64748b',
    to: '#334155',
    light: 'rgba(100,116,139,0.08)',
    ring: 'rgba(100,116,139,0.2)',
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
  const { user, canView } = useAuthStore()
  const { t } = useI18nStore()
  const modules = ALL_MODULES().filter(m => canView(m.permission))

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
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
          <div className="pointer-events-none absolute -left-8 -bottom-12 w-48 h-48 rounded-full bg-accent-400/10 blur-2xl" />
          <div className="pointer-events-none absolute right-1/3 top-0 w-64 h-full bg-primary-400/5 blur-2xl" />

          <div className="relative flex items-center justify-between gap-6">
            {/* Left: greeting */}
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

            {/* Right: chips */}
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
                    {/* Subtle background glow on hover */}
                    <div
                      className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                      style={{ background: `radial-gradient(circle at top left, ${mod.light} 0%, transparent 70%)` }}
                    />

                    {/* Icon row */}
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

                    {/* Text */}
                    <div className="relative">
                      <p className="text-sm font-bold text-warm-800 leading-snug">{mod.name}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-warm-400 line-clamp-2">{mod.description}</p>
                    </div>

                    {/* Bottom accent line */}
                    <div
                      className="absolute bottom-0 left-0 h-0.5 w-0 rounded-full transition-all duration-500 group-hover:w-full"
                      style={{ background: `linear-gradient(90deg, ${mod.from}, ${mod.to})` }}
                    />
                  </Link>
                </motion.div>
              )
            })}

            {modules.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-warm-300 gap-3">
                <LayoutGrid size={32} className="opacity-30" />
                <p className="text-sm font-medium">Sin módulos disponibles</p>
              </div>
            )}
          </motion.div>
        </div>

      </div>
    </div>
  )
}
