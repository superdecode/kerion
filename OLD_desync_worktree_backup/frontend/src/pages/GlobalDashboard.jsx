import { useAuthStore } from '../core/stores/authStore'
import { useI18nStore } from '../core/stores/i18nStore'
import { motion } from 'framer-motion'
import Header from '../core/components/layout/Header'
import { fmtTimeShort, fmtDateShort } from '../core/utils/dateFormat'
import {
  ScanBarcode, Package, Truck, CheckSquare, ArrowRight,
  Activity, Users, Clock
} from 'lucide-react'
import { Link } from 'react-router-dom'

const getModules = (t) => [
  {
    id: 'dropscan',
    name: 'DropScan',
    description: t('globalDash.dropscanDesc'),
    icon: ScanBarcode,
    path: '/dropscan',
    color: 'from-primary-500 to-primary-700',
    glow: 'group-hover:shadow-glow',
    active: true,
  },
  {
    id: 'inventory',
    name: t('globalDash.inventory'),
    description: t('globalDash.inventoryDesc'),
    icon: Package,
    path: '/inventory',
    color: 'from-accent-500 to-accent-700',
    glow: 'group-hover:shadow-glow-cyan',
    active: false,
  },
  {
    id: 'dispatch',
    name: t('globalDash.dispatch'),
    description: t('globalDash.dispatchDesc'),
    icon: Truck,
    path: '/dispatch',
    color: 'from-warning-400 to-warning-600',
    glow: '',
    active: false,
  },
  {
    id: 'validate',
    name: t('globalDash.validate'),
    description: t('globalDash.validateDesc'),
    icon: CheckSquare,
    path: '/validate',
    color: 'from-violet-500 to-violet-700',
    glow: 'group-hover:shadow-glow',
    active: false,
  },
]

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  }),
}

export default function GlobalDashboard() {
  const { user } = useAuthStore()
  const { t } = useI18nStore()
  const modules = getModules(t)

  return (
    <div className="flex flex-col h-full">
      <Header title={t('nav.dashboard')} subtitle={t('app.subtitle')} />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Welcome */}
        <motion.div
          className="bg-gradient-to-br from-primary-600 via-primary-700 to-accent-700 rounded-3xl p-8 text-white mb-8 shadow-xl overflow-hidden relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/5 rounded-full blur-2xl animate-float" />
          <div className="absolute -left-10 -bottom-10 w-36 h-36 bg-white/5 rounded-full blur-xl animate-float-delayed" />
          <div className="absolute right-20 bottom-0 w-72 h-72 bg-accent-400/10 rounded-full blur-3xl animate-pulse-glow" />
          <div className="relative">
            <motion.h2
              className="text-2xl font-extrabold mb-1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
            >
              {t('globalDash.welcome')}, {user?.nombre_completo?.split(' ')[0] || 'Usuario'}
            </motion.h2>
            <motion.p
              className="text-primary-200 text-sm font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              Kirion · {user?.rol_nombre}
            </motion.p>

            <div className="grid grid-cols-3 gap-5 mt-8">
              {[
                { icon: Activity, value: '1', label: t('globalDash.activeModules'), delay: 0.3 },
                { icon: Users, value: '—', label: t('globalDash.onlineUsers'), delay: 0.4 },
                { icon: Clock, value: fmtTimeShort(new Date()), label: fmtDateShort(new Date()), delay: 0.5 },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:bg-white/15 transition-colors duration-300"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: stat.delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <stat.icon className="w-5 h-5 text-primary-200 mb-2" />
                  <p className="text-2xl font-extrabold">{stat.value}</p>
                  <p className="text-[11px] text-primary-200 font-medium">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Modules */}
        <motion.h3
          className="text-xs font-bold text-warm-400 uppercase tracking-wider mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {t('globalDash.systemModules')}
        </motion.h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {modules.map((mod, i) => {
            const Icon = mod.icon
            return (
              <motion.div
                key={mod.id}
                custom={i}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                className={`relative group card-interactive p-5 overflow-hidden
                            ${!mod.active ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {/* Decorative gradient blob */}
                <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${mod.color} opacity-[0.06] group-hover:opacity-[0.12] group-hover:scale-125 transition-all duration-500`} />

                {!mod.active && (
                  <span className="absolute top-3 right-3 badge bg-warm-100 text-warm-500 text-[9px]">
                    {t('globalDash.comingSoon')}
                  </span>
                )}
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${mod.color} flex items-center justify-center mb-4 shadow-sm ${mod.glow} transition-shadow duration-300`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-sm font-bold text-warm-800 mb-1">{mod.name}</h4>
                <p className="text-xs text-warm-400 mb-4 line-clamp-2 leading-relaxed">{mod.description}</p>
                {mod.active ? (
                  <Link
                    to={mod.path}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 group/link"
                  >
                    {t('globalDash.enterModule')} <ArrowRight className="w-3 h-3 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                ) : (
                  <span className="text-xs text-warm-300">{t('globalDash.unavailable')}</span>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
