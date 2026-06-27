import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, LabelList,
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
import { getOrderTracking, getRecords } from '../../Surtido/services/surtidoService'

const ESTADO_COLORS = {
  completado:   '#22c55e',
  asignado:     '#3b82f6',
  por_asignar:  '#f59e0b',
  con_faltante: '#ef4444',
  cancelled:    '#6b7280',
  // fallback legacy keys
  complete:     '#22c55e',
  open:         '#f59e0b',
}
const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']

const ESTADO_LABEL_MAP = {
  completado:   'Completado',
  asignado:     'Asignado',
  por_asignar:  'Por asignar',
  con_faltante: 'Con faltante',
  cancelled:    'Cancelado',
  complete:     'Completado',
  open:         'Por asignar',
  with_discrepancies: 'Con discrepancias',
}

function estadoLabel(s) {
  return ESTADO_LABEL_MAP[s] || s
}

function SvgDonut({ data }) {
  const cx = 90, cy = 90, outerR = 82, innerR = 50
  const total = data.reduce((s, d) => s + Number(d.cantidad), 0)
  if (!total) return null
  let angle = -Math.PI / 2
  return (
    <svg width={180} height={180}>
      {data.map((entry, i) => {
        const frac = Number(entry.cantidad) / total
        const sweep = frac * 2 * Math.PI
        const startA = angle
        angle += sweep
        const endA = angle
        const fill = ESTADO_COLORS[entry.status] || PIE_COLORS[i % PIE_COLORS.length]
        if (frac >= 0.9999) {
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={outerR} fill={fill} />
              <circle cx={cx} cy={cy} r={innerR} fill="white" />
            </g>
          )
        }
        const large = sweep > Math.PI ? 1 : 0
        const ox1 = cx + outerR * Math.cos(startA), oy1 = cy + outerR * Math.sin(startA)
        const ox2 = cx + outerR * Math.cos(endA),   oy2 = cy + outerR * Math.sin(endA)
        const ix1 = cx + innerR * Math.cos(endA),   iy1 = cy + innerR * Math.sin(endA)
        const ix2 = cx + innerR * Math.cos(startA), iy2 = cy + innerR * Math.sin(startA)
        return (
          <path key={i}
            d={`M${ox1} ${oy1} A${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} L${ix1} ${iy1} A${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2}Z`}
            fill={fill} stroke="#fff" strokeWidth={2}
          />
        )
      })}
    </svg>
  )
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

function weekNum(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${String(dateStr).split('T')[0]}T12:00:00Z`)
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return String(Math.ceil(((d - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7))
}

function monthShort(dateStr) {
  if (!dateStr) return ''
  const [year, month] = String(dateStr).split('T')[0].split('-')
  return new Date(`${year}-${month}-15T12:00:00Z`)
    .toLocaleDateString('es-MX', { month: 'short', timeZone: 'UTC' })
    .replace('.', '')
}

export default function SurtidoDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const [centerDate, setCenterDate] = useState(() => getToday())
  const dashboardStart = dateRange?.from || getToday()
  const dashboardEnd = dateRange?.to || getToday()

  useEffect(() => {
    setCenterDate(dateRange?.to || getToday())
  }, [dateRange?.to])

  const { data, isLoading } = useQuery({
    queryKey: ['dash-surtido', dashboardStart, dashboardEnd],
    queryFn: () => getSurtidoDashboard({ fecha_inicio: dashboardStart, fecha_fin: dashboardEnd }),
    enabled: backendOnline,
  })

  const { data: outboundListData, isLoading: outboundLoading, isFetching: outboundFetching } = useQuery({
    queryKey: ['wms-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60_000,
  })

  const { data: trackingData, isLoading: trackingLoading, isFetching: trackingFetching } = useQuery({
    queryKey: ['wms-order-tracking'],
    queryFn: getOrderTracking,
    enabled: backendOnline,
    staleTime: 5 * 60_000,
  })

  const yearStart = `${dashboardEnd.slice(0, 4)}-01-01`
  const prevYearStart = `${Number(dashboardEnd.slice(0, 4)) - 1}-01-01`

  const { data: weeklyData } = useQuery({
    queryKey: ['dash-surtido-weekly', yearStart, dashboardEnd],
    queryFn: () => getSurtidoDashboard({ fecha_inicio: yearStart, fecha_fin: dashboardEnd, bucket: 'week' }),
    enabled: backendOnline,
    staleTime: 10 * 60_000,
  })

  const { data: monthlyData } = useQuery({
    queryKey: ['dash-surtido-monthly', prevYearStart, dashboardEnd],
    queryFn: () => getSurtidoDashboard({ fecha_inicio: prevYearStart, fecha_fin: dashboardEnd, bucket: 'month' }),
    enabled: backendOnline,
    staleTime: 10 * 60_000,
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
  const fiveDayLoading = outboundLoading || outboundFetching || trackingLoading || trackingFetching || !outboundListData || !trackingData

  const cajasPorSemana = (weeklyData?.data?.graficas?.tendencia || [])
    .map(r => ({ ...r, sem: weekNum(r.periodo), cajas: Number(r.cajas ?? 0) }))
    .filter(r => r.cajas > 0 || true)

  const cajasPorMes = (monthlyData?.data?.graficas?.tendencia || [])
    .map(r => ({ ...r, mes: monthShort(r.periodo), cajas: Number(r.cajas ?? 0) }))
  const today = getToday()
  const centerDateLabel = centerDate === today ? 'Hoy' : fmtDateString(centerDate)

  const expectedByDay = {}
  const validatedByDay = {}
  const trackingMap = getRecords(trackingData).reduce((map, tracking) => {
    if (tracking?.outbound_order_no) map[tracking.outbound_order_no] = tracking
    return map
  }, {})

  for (const r of (outboundListData?.data?.records || [])) {
    if (!r.outboundTime) continue
    const key = toDateKey(r.outboundTime)
    if (!key) continue
    if (!expectedByDay[key]) expectedByDay[key] = { ordenes: 0, cajas: 0 }
    expectedByDay[key].ordenes += 1
    expectedByDay[key].cajas += Number(r.outboundBoxCount || r.quantity || 0)

    const tracking = trackingMap[r.outboundOrderNo]
    const scanned = Number(tracking?.total_scanned || 0)
    if (scanned > 0) {
      if (!validatedByDay[key]) validatedByDay[key] = { ordenes: 0, cajas: 0 }
      validatedByDay[key].ordenes += 1
      validatedByDay[key].cajas += scanned
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label={t('dashboard.surtido.kpi.ordenesPeriodo')} value={kpis.ordenes_total ?? kpis.sesiones_hoy} icon={ClipboardList} index={0} />
        <KpiCard label={t('dashboard.surtido.kpi.cajasEscaneadas')} value={kpis.cajas_escaneadas} icon={Activity} index={1} />
        <KpiCard label={t('dashboard.surtido.kpi.ordenesCompletadas')} value={kpis.ordenes_completadas ?? kpis.sesiones_completadas} icon={CheckCircle2} index={2} />
        <KpiCard label={t('dashboard.surtido.kpi.tasaCompletado')} value={`${kpis.tasa_completado}%`} icon={TrendingUp} index={3} />
        <KpiCard label={t('dashboard.surtido.kpi.ordenesAbiertas')} value={kpis.ordenes_abiertas ?? kpis.sesiones_abiertas} icon={Activity} index={4} />
        <KpiCard label={t('dashboard.surtido.kpi.ordenesAnormalidades')} value={kpis.ordenes_con_anormalidades} icon={AlertTriangle} alert index={5} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('dashboard.surtido.chart.ordenesEstado')} icon={ClipboardList}>
          {graficas.ordenes_por_estado.length > 0 ? (
            <div className="flex items-center gap-6 py-2">
              <div className="shrink-0">
                <SvgDonut data={graficas.ordenes_por_estado} />
              </div>
              <div className="flex-1 space-y-2.5">
                {graficas.ordenes_por_estado.map((e, i) => (
                  <div key={e.status} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ESTADO_COLORS[e.status] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-warm-600 flex-1">{estadoLabel(e.status)}</span>
                    <span className="text-xs font-bold text-warm-800">{e.cantidad}</span>
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
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelFormatter={v => trendLabel(v, tendenciaBucket)}
                />
                <Line type="monotone" dataKey="cajas" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name={t('dashboard.metric.cajas')} connectNulls />
                <Line type="monotone" dataKey="ordenes" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name={t('dashboard.metric.ordenes')} strokeDasharray="4 2" connectNulls />
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
                <XAxis type="number" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
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
                <XAxis type="number" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                <YAxis type="category" dataKey="operador" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="ordenes" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Ordenes" />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>
      </div>

      {/* Cajas surtidas por semana — área */}
      <ChartCard title="Cajas surtidas por semana (año actual)" icon={TrendingUp}>
        {cajasPorSemana.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={cajasPorSemana} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradCajas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
              <XAxis dataKey="sem" tick={{ fontSize: 10 }} label={{ value: 'SEM', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#a8a29e' }} height={28} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={45} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={v => [v.toLocaleString(), 'Cajas']} labelFormatter={v => `Semana ${v}`} />
              <Area type="monotone" dataKey="cajas" stroke="#3b82f6" strokeWidth={2} fill="url(#gradCajas)" dot={{ r: 3, fill: '#3b82f6' }} connectNulls>
                <LabelList dataKey="cajas" position="top" style={{ fontSize: 9, fill: '#3b82f6', fontWeight: 600 }} formatter={v => v > 0 ? v.toLocaleString() : ''} />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        ) : <NoData height={220} />}
      </ChartCard>

      {/* Cajas surtidas por mes — barras */}
      <ChartCard title="Cajas surtidas por mes" icon={Activity}>
        {cajasPorMes.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cajasPorMes} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 'auto']} width={45} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={v => [v.toLocaleString(), 'Cajas']} />
              <Bar dataKey="cajas" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Cajas">
                <LabelList dataKey="cajas" position="top" style={{ fontSize: 10, fill: '#3b82f6', fontWeight: 600 }} formatter={v => v > 0 ? v.toLocaleString() : ''} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <NoData height={220} />}
      </ChartCard>

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
              {centerDateLabel}
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
          {fiveDayLoading ? (
            <div className="flex min-h-[190px] items-center justify-center">
              <LoadingSpinner size="md" text="Cargando datos..." />
            </div>
          ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-warm-50 border-b border-warm-100">
                <th className="table-header text-left w-24">Fecha</th>
                <th className="table-header text-center">Órd. esperadas</th>
                <th className="table-header text-center">Cajas esperadas</th>
                <th className="table-header text-center">Órd. validadas</th>
                <th className="table-header text-center">Cajas validadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-50">
              {fiveDates.map(day => {
                const isToday = day === today
                const isCenterDate = day === centerDate
                const exp = expectedByDay[day]
                const val = validatedByDay[day]
                const rowCls = isCenterDate ? 'bg-primary-50/40' : ''
                return (
                  <tr key={day} className={rowCls}>
                    <td className="px-3 py-2.5 text-xs font-semibold text-warm-700 whitespace-nowrap">
                      {shortDay(day)}
                      {isToday && <span className="ml-1.5 text-[9px] bg-primary-100 text-primary-600 rounded px-1 py-0.5 font-bold">HOY</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-center text-sm font-semibold ${exp?.ordenes > 0 ? 'text-warm-800' : 'text-warm-300'}`}>
                      {exp?.ordenes || '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-center text-sm font-semibold ${exp?.cajas > 0 ? 'text-warm-800' : 'text-warm-300'}`}>
                      {exp?.cajas || '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-center text-sm font-semibold ${val?.ordenes > 0 ? 'text-green-700' : 'text-warm-300'}`}>
                      {val?.ordenes || '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-center text-sm font-semibold ${val?.cajas > 0 ? 'text-green-700' : 'text-warm-300'}`}>
                      {val?.cajas || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  )
}
