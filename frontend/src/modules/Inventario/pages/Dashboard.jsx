import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Package, CheckCircle2, AlertTriangle, Ban, Layers, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useInventarioStore } from '../stores/inventarioStore'
import { getScanSessions } from '../services/inventarioService'
import { fmtDate, toDateKey } from '../../../core/utils/dateFormat'

function KPICard({ icon: Icon, label, value, gradient, iconBg, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={`card relative overflow-hidden bg-gradient-to-br ${gradient} text-white p-5`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium opacity-80 mb-1">{label}</p>
          <p className="text-3xl font-bold">{value ?? 0}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon className="w-5 h-5 opacity-90" />
        </div>
      </div>
    </motion.div>
  )
}

export default function InventarioDashboard() {
  const { t } = useI18nStore()
  const tabs = useInventarioStore(s => s.tabs)

  const { data, isLoading } = useQuery({
    queryKey: ['upapex-scan-sessions', { pageSize: 50 }],
    queryFn: () => getScanSessions({ pageSize: 50 }),
    staleTime: 30000,
  })

  const sessions = data?.data?.records ?? []

  const kpis = useMemo(() => {
    const totalItems = sessions.reduce((acc, s) => acc + (s.total_scanned || 0), 0)
    const openCount = sessions.filter(s => s.status === 'open').length
    return { totalItems, openCount }
  }, [sessions])

  const localSummary = useMemo(() => {
    return tabs.reduce(
      (acc, t) => {
        t.items.forEach(i => { acc[i.status] = (acc[i.status] || 0) + 1 })
        return acc
      },
      { ok: 0, blocked: 0, nowms: 0 }
    )
  }, [tabs])

  // Build daily scan chart from sessions (last 7 by date)
  const chartData = useMemo(() => {
    const dayMap = {}
    sessions.forEach(s => {
      const day = s.started_at ? toDateKey(s.started_at) : ''
      if (!day) return
      dayMap[day] = (dayMap[day] || 0) + (s.total_scanned || 0)
    })
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, count]) => ({ date: date.slice(5), count }))
  }, [sessions])

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('inventario.dashboard.title')} subtitle={t('nav.inventario')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('inventario.dashboard.title')} subtitle={t('nav.inventario')} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard icon={Package} label={t('inventario.dashboard.total_scanned')} value={kpis.totalItems} gradient="from-primary-500 to-primary-700" iconBg="bg-white/20" index={0} />
          <KPICard icon={Layers} label={t('inventario.dashboard.open_tabs')} value={tabs.length} gradient="from-accent-400 to-accent-600" iconBg="bg-white/20" index={1} />
          <KPICard icon={CheckCircle2} label={t('inventario.dashboard.ok')} value={localSummary.ok} gradient="from-success-500 to-success-700" iconBg="bg-white/20" index={2} />
          <KPICard icon={AlertTriangle} label={t('inventario.dashboard.blocked')} value={localSummary.blocked} gradient="from-warning-400 to-warning-600" iconBg="bg-white/20" index={3} />
          <KPICard icon={Ban} label={t('inventario.dashboard.nowms')} value={localSummary.nowms} gradient="from-danger-400 to-danger-600" iconBg="bg-white/20" index={4} />
        </div>

        {/* Chart */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-warm-700 mb-4 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
              <BarChart3 className="w-3 h-3" />
            </div>
            {t('inventario.dashboard.chart_title')}
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#78716c' }} />
                <YAxis tick={{ fontSize: 12, fill: '#78716c' }} />
                <Tooltip contentStyle={{ fontSize: 13, borderRadius: 12, border: '1px solid #e7e5e4' }} />
                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3} fill="url(#invGrad)" name={t('inventario.dashboard.scanned')} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-sm text-warm-400">{t('common.noData')}</div>
          )}
        </div>

        {/* Recent sessions */}
        <div className="card">
          <h3 className="text-sm font-bold text-warm-700 mb-4">{t('inventario.dashboard.recent_sessions')}</h3>
          {sessions.length === 0 ? (
            <p className="text-sm text-warm-400 py-4 text-center">{t('common.noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">{t('common.date')}</th>
                    <th className="table-header">{t('inventario.historial.order_no')}</th>
                    <th className="table-header">{t('inventario.historial.status')}</th>
                    <th className="table-header text-right">{t('inventario.historial.scanned')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 10).map(s => (
                    <tr key={s.id} className="table-row">
                      <td className="table-cell text-warm-500">{s.started_at ? fmtDate(s.started_at) : '—'}</td>
                      <td className="table-cell code-main">{s.outbound_order_no || '—'}</td>
                      <td className="table-cell">
                        <span className={`badge ${s.status === 'open' ? 'bg-warning-100 text-warning-700' : 'bg-success-100 text-success-700'}`}>
                          {t(`inventario.historial.status.${s.status}`) || s.status}
                        </span>
                      </td>
                      <td className="table-cell text-right font-semibold">{s.total_scanned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
