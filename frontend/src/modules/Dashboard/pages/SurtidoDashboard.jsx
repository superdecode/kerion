import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  ClipboardList, CheckCircle2, AlertTriangle, Users, TrendingUp, Activity,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getSurtidoDashboard } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'
import { fmtDateString } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  complete: '#22c55e',
  open: '#3b82f6',
  with_discrepancies: '#f59e0b',
  cancelled: '#ef4444',
}
const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']

function estadoLabel(s, t) {
  const map = {
    complete: t('dashboard.status.complete'), open: t('dashboard.status.open'),
    with_discrepancies: t('dashboard.status.withDiscrepancies'), cancelled: t('dashboard.status.cancelled'),
  }
  return map[s] || s
}

function trendTitle(bucket, t) {
  const map = {
    day: t('dashboard.trend.daily'),
    week: t('dashboard.trend.weekly'),
    month: t('dashboard.trend.monthly'),
    year: t('dashboard.trend.yearly'),
  }
  return map[bucket] || t('dashboard.trend.title')
}

function trendLabel(value, bucket) {
  if (!value) return ''
  const [year, month] = String(value).split('T')[0].split('-')

  if (bucket === 'year') return year
  if (bucket === 'month') {
    const monthName = new Date(`${year}-${month}-15T12:00:00Z`)
      .toLocaleDateString('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    return monthName.replace('.', '')
  }
  if (bucket === 'week') return `Sem. ${fmtDateString(value)}`
  return fmtDateString(value)
}

export default function SurtidoDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-surtido', dateRange],
    queryFn: () => getSurtidoDashboard({ fecha_inicio: dateRange.from, fecha_fin: dateRange.to }),
    enabled: backendOnline,
  })

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>

  const d = data?.data
  if (!d) return <NoData height={200} />

  const { kpis, graficas } = d
  const tendencia = (graficas.tendencia || graficas.tendencia_semanal || [])
    .map(item => ({
      ...item,
      periodo: item.periodo || item.semana,
      cajas: item.cajas ?? item.total ?? 0,
      ordenes: item.ordenes ?? item.completadas ?? 0,
    }))
  const tendenciaBucket = graficas.tendencia_bucket || 'week'

  return (
    <div className="space-y-4 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('dashboard.surtido.kpi.ordenesPeriodo')} value={kpis.ordenes_total ?? kpis.sesiones_hoy} icon={ClipboardList} index={0} />
        <KpiCard label={t('dashboard.surtido.kpi.ordenesCompletadas')} value={kpis.ordenes_completadas ?? kpis.sesiones_completadas} icon={CheckCircle2} index={1} />
        <KpiCard label={t('dashboard.surtido.kpi.tasaCompletado')} value={`${kpis.tasa_completado}%`} icon={TrendingUp} index={2} />
        <KpiCard label={t('dashboard.surtido.kpi.cajasEscaneadas')} value={kpis.cajas_escaneadas} icon={Activity} index={3} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={t('dashboard.surtido.kpi.ordenesAbiertas')} value={kpis.ordenes_abiertas ?? kpis.sesiones_abiertas} icon={Activity} index={4} />
        <KpiCard label={t('dashboard.surtido.kpi.ordenesFaltantes')} value={kpis.ordenes_con_faltantes} icon={AlertTriangle} alert index={5} />
        <KpiCard label={t('dashboard.surtido.kpi.ordenesAnormalidades')} value={kpis.ordenes_con_anormalidades} icon={AlertTriangle} alert index={6} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('dashboard.surtido.chart.ordenesEstado')} icon={ClipboardList}>
          {graficas.ordenes_por_estado.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={graficas.ordenes_por_estado} dataKey="cantidad" nameKey="status"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={45} strokeWidth={0}>
                    {graficas.ordenes_por_estado.map((entry, i) => (
                      <Cell key={i} fill={ESTADO_COLORS[entry.status] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(val, name) => [val, estadoLabel(name, t)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {graficas.ordenes_por_estado.map((e, i) => (
                  <div key={e.status} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ESTADO_COLORS[e.status] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-warm-600 flex-1 truncate">{estadoLabel(e.status, t)}</span>
                    <span className="text-xs font-bold text-warm-700">{e.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title={t('dashboard.surtido.chart.topOperadores')} icon={Users}>
          {graficas.top_operadores.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={graficas.top_operadores} layout="vertical" margin={{ left: 4, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="operador" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="cajas" fill="#8b5cf6" radius={[0, 4, 4, 0]} name={t('dashboard.metric.cajas')} />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title={trendTitle(tendenciaBucket, t)} icon={TrendingUp} className="lg:col-span-2">
          {tendencia.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={tendencia} margin={{ left: 0, right: 20, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} tickFormatter={v => trendLabel(v, tendenciaBucket)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelFormatter={v => trendLabel(v, tendenciaBucket)}
                />
                <Line type="monotone" dataKey="cajas" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name={t('dashboard.metric.cajas')} />
                <Line type="monotone" dataKey="ordenes" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name={t('dashboard.metric.ordenes')} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>
      </div>
    </div>
  )
}
