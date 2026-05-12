import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as ds from '../services/dropscanService'
import { getToday, subtractDays } from '../../../core/utils/dateFormat'
import {
  Package, CheckCircle, Clock, AlertTriangle, Activity,
  Users, BarChart3, Calendar, ChevronDown, XCircle
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'

const COLORS = ['#ec4899', '#ef4444', '#f59e0b', '#a855f7', '#f472b6', '#db2777']

const getDatePresets = (t) => [
  { key: 'today', label: t('common.today') },
  { key: 'yesterday', label: t('common.yesterday') },
  { key: 'thisWeek', label: t('common.thisWeek') },
  { key: 'lastWeek', label: t('common.lastWeek') },
  { key: 'thisMonth', label: t('common.thisMonth') },
  { key: 'lastMonth', label: t('common.lastMonth') },
  { key: 'last7', label: t('common.last7Days') },
  { key: 'last30', label: t('common.last30Days') },
]

function getDateRange(preset) {
  const today = getToday()
  const sub = (days) => subtractDays(today, days)

  switch (preset) {
    case 'today': return { from: today, to: today }
    case 'yesterday': { const y = sub(1); return { from: y, to: y } }
    case 'thisWeek': {
      // Parse today in user TZ, get day of week, subtract back to Sunday
      const d = new Date(`${today}T18:00:00Z`)
      const dow = d.getUTCDay()
      return { from: sub(dow), to: today }
    }
    case 'lastWeek': {
      const d = new Date(`${today}T18:00:00Z`)
      const dow = d.getUTCDay()
      const startLast = sub(dow + 7)
      const endLast = sub(dow + 1)
      return { from: startLast, to: endLast }
    }
    case 'thisMonth': {
      const [y, m] = today.split('-')
      return { from: `${y}-${m}-01`, to: today }
    }
    case 'lastMonth': {
      const d = new Date(`${today}T18:00:00Z`)
      const year = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear()
      const month = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth()
      const mm = String(month).padStart(2, '0')
      const lastDay = new Date(year, month, 0).getDate()
      return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
    }
    case 'last7': return { from: sub(6), to: today }
    case 'last30': return { from: sub(29), to: today }
    default: return { from: today, to: today }
  }
}

export default function DropScanDashboard() {
  const { t } = useI18nStore()
  const DATE_PRESETS = getDatePresets(t)
  const [activePreset, setActivePreset] = useState('today')
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const dateRange = useMemo(() => {
    if (activePreset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
    return getDateRange(activePreset)
  }, [activePreset, customFrom, customTo])

  const activeLabel = activePreset === 'custom'
    ? `${customFrom} — ${customTo}`
    : DATE_PRESETS.find(p => p.key === activePreset)?.label || t('common.today')

  const { data, isLoading, error } = useQuery({
    queryKey: ['dropscan-dashboard', dateRange],
    queryFn: () => ds.getDashboard(dateRange.from, dateRange.to),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('dashboard.title')} subtitle="DropScan" />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  const r = data?.resumen || {}
  // Fill all 24 hours so the chart always shows a complete day axis
  const rawHourly = data?.guias_por_hora || []
  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hora: h,
    cantidad: rawHourly.find(d => parseInt(d.hora) === h)?.cantidad || 0,
  }))
  const operatorData = data?.por_operador || []
  const empresaData = data?.por_empresa || []
  const activeSessions = data?.sesiones_activas || []

  return (
    <div className="flex flex-col h-full">
      <Header title={t('dashboard.title')} subtitle={`DropScan · ${activeLabel}`} />

      <div className="flex-1 overflow-y-auto">
        {/* Date filter bar */}
        <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-lg border-b border-warm-100 px-6 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-warm-400 shrink-0" />
            {DATE_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => { setActivePreset(p.key); setShowCustom(false) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                  ${activePreset === p.key
                    ? 'bg-primary-600 text-white shadow-glow'
                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200 hover:text-warm-700'
                  }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => { setShowCustom(!showCustom); if (!showCustom) setActivePreset('custom') }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 inline-flex items-center gap-1
                ${activePreset === 'custom'
                  ? 'bg-primary-600 text-white shadow-glow'
                  : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                }`}
            >
              {t('common.customRange')} <ChevronDown className={`w-3 h-3 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
            </button>
            {showCustom && (
              <div className="flex items-center gap-2 ml-2 animate-fade-in">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs outline-none focus:border-primary-400" />
                <span className="text-xs text-warm-400">—</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs outline-none focus:border-primary-400" />
              </div>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="max-w-full mx-auto space-y-4">
            {/* KPI Cards - Clickable, navigate to historial with filter */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KPICard icon={Package} label={t('dashboard.totalGuides')} value={r.total_guias} gradient="from-primary-500 to-primary-700" iconBg="bg-primary-400/20" index={0} href="/dropscan/historial" />
              <KPICard icon={Clock} label={t('dashboard.inProcess')} value={r.tarimas_en_proceso} gradient="from-warning-400 to-warning-600" iconBg="bg-warning-400/20" index={1} href="/dropscan/historial?estado=EN_PROCESO" />
              <KPICard icon={AlertTriangle} label={t('dashboard.duplicates')} value={r.alertas_duplicados} gradient="from-danger-400 to-danger-600" iconBg="bg-danger-400/20" index={2} href="/dropscan/historial?search=duplicado" />
              <KPICard icon={CheckCircle} label={t('dashboard.completedPallets')} value={r.tarimas_completadas} gradient="from-success-500 to-accent-600" iconBg="bg-success-400/20" index={3} href="/dropscan/historial?estado=FINALIZADA" />
              <KPICard icon={XCircle} label={t('status.CANCELADA')} value={r.tarimas_canceladas} gradient="from-warm-400 to-warm-600" iconBg="bg-warm-400/20" index={4} href="/dropscan/historial?estado=CANCELADA" />
            </div>

            {/* Charts Row - Larger and better use of space */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Hourly Chart - Bigger */}
              <div className="card p-5">
                <h3 className="text-sm font-bold text-warm-700 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
                    <BarChart3 className="w-3 h-3" />
                  </div>
                  {t('dashboard.guidesPerHour')}
                </h3>
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={hourlyData}>
                      <defs>
                        <linearGradient id="guiasGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ec4899" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="hora" tick={{ fontSize: 12, fill: '#78716c' }} tickFormatter={(h) => `${h}h`} />
                      <YAxis tick={{ fontSize: 12, fill: '#78716c' }} />
                      <Tooltip
                        contentStyle={{ fontSize: 13, borderRadius: 12, border: '1px solid #e7e5e4', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                        labelFormatter={(h) => `${h}:00 hrs`}
                      />
                      <Area type="monotone" dataKey="cantidad" stroke="#ec4899" strokeWidth={3} fill="url(#guiasGrad)" name="Guías" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-72 flex items-center justify-center text-sm text-warm-400">{t('common.noData')}</div>
                )}
              </div>

              {/* By Company - Optimized layout */}
              <div className="card p-5">
                <h3 className="text-sm font-bold text-warm-700 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-accent-100 text-accent-600 flex items-center justify-center">
                    <Activity className="w-3 h-3" />
                  </div>
                  {t('dashboard.byCompany')}
                </h3>
                {empresaData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="45%" height={220}>
                      <PieChart>
                        <Pie data={empresaData} dataKey="guias" nameKey="empresa" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2} strokeWidth={0}>
                          {empresaData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 13, borderRadius: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {empresaData.map((e, i) => (
                        <div key={e.codigo} className="flex items-center gap-2 group">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-warm-600 flex-1 truncate group-hover:text-warm-800 transition-colors">{e.empresa}</span>
                          <span className="text-xs font-bold text-warm-700 bg-warm-50 px-2 py-0.5 rounded-md">{e.guias}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-56 flex items-center justify-center text-sm text-warm-400">Sin datos</div>
                )}
              </div>
            </div>

            {/* Active Sessions & Top Operators - Larger */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-5">
                <h3 className="text-sm font-bold text-warm-700 mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-success-100 text-success-600 flex items-center justify-center">
                    <Activity className="w-3 h-3" />
                  </div>
                  {t('dashboard.activeSessions')}
                  <span className="ml-auto badge bg-success-100 text-success-700">{activeSessions.length}</span>
                </h3>
                {activeSessions.length > 0 ? (
                  <div className="space-y-2">
                    {activeSessions.map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-warm-50/70 hover:bg-warm-100 transition-colors">
                        <div className="w-3 h-3 rounded-full bg-success-500 animate-pulse shadow-glow-success" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-warm-700 truncate">{s.operador}</p>
                          <p className="text-[10px] text-warm-400 font-medium">{s.empresa} · {s.canal}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-warm-700">{s.total_guias}</p>
                          <p className="text-[10px] text-warm-400">{t('dashboard.guides')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-warm-400">{t('common.noData')}</div>
                )}
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-bold text-warm-700 mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
                    <Users className="w-3 h-3" />
                  </div>
                  {t('dashboard.topOperators')}
                </h3>
                {operatorData.length > 0 ? (
                  <div className="space-y-2">
                    {operatorData.map((op, i) => (
                      <div key={op.codigo} className="flex items-center gap-3 p-3 rounded-xl hover:bg-warm-50 transition-colors">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold
                          ${i === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-yellow-900 shadow-sm' :
                            i === 1 ? 'bg-gradient-to-br from-warm-200 to-warm-300 text-warm-700' :
                            i === 2 ? 'bg-gradient-to-br from-orange-200 to-orange-300 text-orange-800' :
                            'bg-warm-100 text-warm-500'}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-warm-700 truncate">{op.operador}</p>
                          <p className="text-[10px] text-warm-400 font-medium">{op.tarimas} {t('dashboard.pallets')}</p>
                        </div>
                        <p className="text-sm font-bold text-primary-600">{op.guias} <span className="text-warm-400 font-normal text-xs">{t('dashboard.guides')}</span></p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-warm-400">Sin datos</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({ icon: Icon, label, value, gradient, iconBg, index = 0, href }) {
  const navigate = useNavigate()
  return (
    <motion.div
      className="card-interactive p-5 group overflow-hidden relative cursor-pointer"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => href && navigate(href)}
    >
      <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] group-hover:opacity-[0.15] group-hover:scale-125 transition-all duration-500`} />
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-warm-600" />
      </div>
      <p className="text-2xl font-extrabold text-warm-800 tracking-tight">{value ?? 0}</p>
      <p className="text-[10px] text-warm-400 uppercase tracking-wider mt-1 font-bold">{label}</p>
    </motion.div>
  )
}
