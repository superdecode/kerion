import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  ClipboardList, CheckCircle2, AlertTriangle, Users, TrendingUp, Activity,
  ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getSurtidoDashboard } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'
import { fmtDateString, getToday, subtractDays, toDateKey } from '../../../core/utils/dateFormat'
import { getOutboundList } from '../../WmsHub/services/googleSheetsService'

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

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
function shortDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${String(dateStr).split('T')[0]}T12:00:00Z`)
  return `${DAY_LABELS[d.getUTCDay()]} ${d.getUTCDate()}`
}

export default function SurtidoDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const [centerDate, setCenterDate] = useState(() => getToday())

  const fiveDayFrom = subtractDays(centerDate, 2)
  const fiveDayTo = subtractDays(centerDate, -2)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-surtido', dateRange],
    queryFn: () => getSurtidoDashboard({ fecha_inicio: dateRange.from, fecha_fin: dateRange.to }),
    enabled: backendOnline,
  })

  const { data: fiveDayData } = useQuery({
    queryKey: ['dash-surtido-5day', fiveDayFrom, fiveDayTo],
    queryFn: () => getSurtidoDashboard({ fecha_inicio: fiveDayFrom, fecha_fin: fiveDayTo }),
    enabled: backendOnline,
    staleTime: 60_000,
  })

  const { data: outboundListData } = useQuery({
    queryKey: ['wms-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60_000,
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
  const fiveDates = Array.from({ length: 5 }, (_, i) => subtractDays(centerDate, 2 - i))
  const today = getToday()

  const validatedByDay = {}
  for (const item of (fiveDayData?.data?.graficas?.tendencia || [])) {
    const key = String(item.periodo || '').split('T')[0]
    if (key) validatedByDay[key] = { ordenes: Number(item.ordenes ?? 0), cajas: Number(item.cajas ?? 0) }
  }

  const expectedByDay = {}
  for (const r of (outboundListData?.data?.records || [])) {
    if (!r.outboundTime) continue
    const key = toDateKey(r.outboundTime)
    if (!key) continue
    if (!expectedByDay[key]) expectedByDay[key] = { ordenes: 0, cajas: 0 }
    expectedByDay[key].ordenes += 1
    expectedByDay[key].cajas += Number(r.outboundBoxCount || r.quantity || 0)
  }

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

        <ChartCard title={trendTitle(tendenciaBucket, t)} icon={TrendingUp}>
          {tendencia.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tendencia} margin={{ left: 0, right: 20, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
                <XAxis dataKey="periodo" tick={{ fontSize: 10 }} tickFormatter={v => trendLabel(v, tendenciaBucket)} />
                <YAxis tick={{ fontSize: 10 }} />
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

      {/* Surtidor Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top surtidores — cajas" icon={Users}>
          {graficas.top_operadores.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={graficas.top_operadores} layout="vertical" margin={{ left: 4, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="operador" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="cajas" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Cajas" />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title="Top surtidores — órdenes" icon={Users}>
          {graficas.top_operadores.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[...graficas.top_operadores].sort((a, b) => b.ordenes - a.ordenes)} layout="vertical" margin={{ left: 4, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="operador" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="ordenes" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Ordenes" />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>
      </div>

      {/* 5-Day Window Table */}
      <div className="rounded-2xl border border-warm-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-warm-100">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-warm-400" />
            <span className="text-sm font-semibold text-warm-800">Ventana de 5 dias</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCenterDate(d => subtractDays(d, 1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-warm-500 hover:bg-warm-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCenterDate(getToday())}
              className="text-xs px-2.5 py-1 rounded-lg border border-warm-200 text-warm-600 hover:bg-warm-50 transition-colors font-medium"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setCenterDate(d => subtractDays(d, -1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-warm-500 hover:bg-warm-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-warm-50 border-b border-warm-100">
                <th className="table-header w-32 text-left">Métrica</th>
                {fiveDates.map(day => {
                  const isToday = day === today
                  const isCenterDate = day === centerDate
                  return (
                    <th key={day} className={`table-header text-center ${isCenterDate ? 'bg-primary-50' : ''}`}>
                      <span className={isToday ? 'text-primary-600 font-bold' : ''}>{shortDay(day)}</span>
                      {isToday && <span className="ml-1 text-[9px] bg-primary-100 text-primary-600 rounded px-1 py-0.5 font-bold">HOY</span>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-50">
              <tr>
                <td className="px-3 py-2 text-xs font-medium text-warm-500">Órd. esperadas</td>
                {fiveDates.map(day => {
                  const val = expectedByDay[day]?.ordenes
                  return (
                    <td key={day} className={`px-3 py-2 text-center text-sm font-semibold ${day === centerDate ? 'bg-primary-50/50' : ''} ${val > 0 ? 'text-warm-800' : 'text-warm-300'}`}>
                      {val || '—'}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <td className="px-3 py-2 text-xs font-medium text-warm-500">Cajas esperadas</td>
                {fiveDates.map(day => {
                  const val = expectedByDay[day]?.cajas
                  return (
                    <td key={day} className={`px-3 py-2 text-center text-sm font-semibold ${day === centerDate ? 'bg-primary-50/50' : ''} ${val > 0 ? 'text-warm-800' : 'text-warm-300'}`}>
                      {val || '—'}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <td className="px-3 py-2 text-xs font-medium text-warm-500">Órd. validadas</td>
                {fiveDates.map(day => {
                  if (day > today) return <td key={day} className={`px-3 py-2 text-center text-sm text-warm-300 ${day === centerDate ? 'bg-primary-50/50' : ''}`}>—</td>
                  const val = validatedByDay[day]?.ordenes
                  return (
                    <td key={day} className={`px-3 py-2 text-center text-sm font-semibold ${day === centerDate ? 'bg-primary-50/50' : ''} ${val > 0 ? 'text-green-700' : 'text-warm-300'}`}>
                      {val || '—'}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <td className="px-3 py-2 text-xs font-medium text-warm-500">Cajas validadas</td>
                {fiveDates.map(day => {
                  if (day > today) return <td key={day} className={`px-3 py-2 text-center text-sm text-warm-300 ${day === centerDate ? 'bg-primary-50/50' : ''}`}>—</td>
                  const val = validatedByDay[day]?.cajas
                  return (
                    <td key={day} className={`px-3 py-2 text-center text-sm font-semibold ${day === centerDate ? 'bg-primary-50/50' : ''} ${val > 0 ? 'text-green-700' : 'text-warm-300'}`}>
                      {val || '—'}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
