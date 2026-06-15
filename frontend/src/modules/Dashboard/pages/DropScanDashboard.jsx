import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import * as ds from '../../DropScan/services/dropscanService'
import {
  Package, CheckCircle, Clock, AlertTriangle, XCircle,
  Activity, BarChart3, Users,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { ChartCard, NoData } from '../components/ChartCard'

const COLORS = ['#ec4899', '#ef4444', '#f59e0b', '#a855f7', '#f472b6', '#db2777']

export default function DropScanDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['dash-dropscan', dateRange],
    queryFn: () => ds.getDashboard(dateRange.from, dateRange.to),
    refetchInterval: backendOnline ? 30000 : false,
    enabled: backendOnline,
  })

  const r = data?.resumen || {}
  const rawHourly = data?.guias_por_hora || []
  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hora: h,
    cantidad: rawHourly.find(d => parseInt(d.hora) === h)?.cantidad || 0,
  }))
  const empresaData = data?.por_empresa || []
  const operatorData = data?.por_operador || []
  const activeSessions = data?.sesiones_activas || []

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>

  return (
    <div className="space-y-4 p-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { icon: Package, label: t('dashboard.totalGuides'), value: r.total_guias, gradient: 'from-primary-500 to-primary-700', href: '/dropscan/tarimas' },
          { icon: Clock, label: t('dashboard.inProcess'), value: r.tarimas_en_proceso, gradient: 'from-warning-400 to-warning-600', href: '/dropscan/tarimas?estado=EN_PROCESO' },
          { icon: AlertTriangle, label: t('dashboard.duplicates'), value: r.alertas_duplicados, gradient: 'from-danger-400 to-danger-600', href: '/dropscan/tarimas?search=duplicado' },
          { icon: CheckCircle, label: t('dashboard.completedPallets'), value: r.tarimas_completadas, gradient: 'from-success-500 to-accent-600', href: '/dropscan/tarimas?estado=FINALIZADA' },
          { icon: XCircle, label: t('status.CANCELADA'), value: r.tarimas_canceladas, gradient: 'from-warm-400 to-warm-600', href: '/dropscan/tarimas?estado=CANCELADA' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            className="card-interactive p-5 group overflow-hidden relative cursor-pointer"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => kpi.href && navigate(kpi.href)}
          >
            <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full bg-gradient-to-br ${kpi.gradient} opacity-[0.07] group-hover:opacity-[0.15] group-hover:scale-125 transition-all duration-500`} />
            <div className="w-10 h-10 rounded-xl bg-warm-50 border border-warm-100 flex items-center justify-center mb-3">
              <kpi.icon className="w-5 h-5 text-warm-600" />
            </div>
            <p className="text-2xl font-extrabold text-warm-800 tracking-tight">{kpi.value ?? 0}</p>
            <p className="text-[10px] text-warm-400 uppercase tracking-wider mt-1 font-bold">{kpi.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('dashboard.guidesPerHour')} icon={BarChart3}>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="dsHourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#78716c' }} tickFormatter={h => `${h}h`} />
                <YAxis tick={{ fontSize: 11, fill: '#78716c' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={h => `${h}:00`} />
                <Area type="monotone" dataKey="cantidad" stroke="#ec4899" strokeWidth={2} fill="url(#dsHourGrad)" name="Guías" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <NoData height={260} />}
        </ChartCard>

        <ChartCard title={t('dashboard.byCompany')} icon={Activity}>
          {empresaData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie data={empresaData} dataKey="guias" nameKey="empresa" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2} strokeWidth={0}>
                    {empresaData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {empresaData.map((e, i) => (
                  <div key={e.empresa ?? i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-warm-600 flex-1 truncate">{e.empresa}</span>
                    <span className="text-xs font-bold text-warm-700">{e.guias}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={200} />}
        </ChartCard>
      </div>

      {/* Sessions & Operators */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('dashboard.activeSessions')} icon={Activity}>
          {activeSessions.length > 0 ? (
            <div className="space-y-2">
              {activeSessions.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-warm-50/70">
                  <div className="w-2.5 h-2.5 rounded-full bg-success-500 animate-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-warm-700 truncate">{s.operador}</p>
                    <p className="text-[10px] text-warm-400">{s.empresa} · {s.canal}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-warm-700">{s.total_guias}</p>
                    <p className="text-[10px] text-warm-400">{t('dashboard.guides')}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <NoData height={120} />}
        </ChartCard>

        <ChartCard title={t('dashboard.topOperators')} icon={Users}>
          {operatorData.length > 0 ? (
            <div className="space-y-2">
              {operatorData.map((op, i) => (
                <div key={op.operador ?? i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-warm-50 transition-colors">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                    i === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-yellow-900' :
                    i === 1 ? 'bg-gradient-to-br from-warm-200 to-warm-300 text-warm-700' :
                    i === 2 ? 'bg-gradient-to-br from-orange-200 to-orange-300 text-orange-800' :
                    'bg-warm-100 text-warm-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-warm-700 truncate">{op.operador}</p>
                    <p className="text-[10px] text-warm-400">{op.tarimas} {t('dashboard.pallets')}</p>
                  </div>
                  <p className="text-sm font-bold text-primary-600">{op.guias} <span className="text-warm-400 font-normal text-xs">{t('dashboard.guides')}</span></p>
                </div>
              ))}
            </div>
          ) : <NoData height={120} />}
        </ChartCard>
      </div>
    </div>
  )
}
