import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  AlertTriangle, Clock, CheckCircle2, TrendingUp, AlertCircle,
  Calendar, RefreshCw, ChevronRight,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDateTime, fmtDate } from '../../../core/utils/dateFormat'
import { getDashboard } from '../services/anormalidadesService'

const NIVEL_COLOR = { L1: '#22c55e', L2: '#f59e0b', L3: '#ef4444' }
const CHART_COLORS = ['#2e57fe', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4']

const ESTADO_META = {
  nuevo:      { label: 'Nuevo',      cls: 'bg-primary-100 text-primary-700 border-primary-200' },
  en_proceso: { label: 'En proceso', cls: 'bg-accent-100 text-accent-700 border-accent-200' },
  cerrado:    { label: 'Cerrado',    cls: 'bg-success-100 text-success-700 border-success-200' },
  vencido:    { label: 'Vencido',    cls: 'bg-danger-100 text-danger-700 border-danger-200' },
}

function NivelChip({ nivel }) {
  const colors = { L1: 'bg-success-100 text-success-700 border-success-200', L2: 'bg-warning-100 text-warning-700 border-warning-200', L3: 'bg-danger-100 text-danger-700 border-danger-200' }
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors[nivel] || ''}`}>{nivel}</span>
}

function EstadoChip({ estado }) {
  const m = ESTADO_META[estado] || ESTADO_META.nuevo
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{m.label}</span>
}

export default function AnormDashboard() {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  })
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().slice(0, 10))

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['anorm-dashboard', fechaDesde, fechaHasta],
    queryFn: () => getDashboard({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta }),
    enabled: backendOnline,
  })

  const d = data?.data

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('anorm.dashboard.title')}
        subtitle={t('anorm.dashboard.subtitle')}
        icon={<TrendingUp className="w-5 h-5 text-primary-500" />}
      />

      <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
        {/* Date range + refresh */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-warm-200 rounded-xl px-3 py-2">
            <Calendar className="w-3.5 h-3.5 text-warm-400" />
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="text-xs border-none outline-none bg-transparent text-warm-700" />
            <span className="text-warm-300 text-xs">—</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="text-xs border-none outline-none bg-transparent text-warm-700" />
          </div>
          <button onClick={() => refetch()} className="p-2 rounded-xl border border-warm-200 bg-white hover:bg-warm-50 text-warm-500 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : !d ? null : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label={t('anorm.kpi.hoy')} value={d.kpis.hoy} icon={AlertTriangle} color="primary" />
              <KpiCard label={t('anorm.kpi.pendientes')} value={d.kpis.pendientes} icon={Clock} color="warning" />
              <KpiCard label={t('anorm.kpi.l3Abiertas')} value={d.kpis.l3_abiertas} icon={AlertCircle} color={d.kpis.l3_abiertas > 0 ? 'danger' : 'success'} />
              <KpiCard label={t('anorm.kpi.vencidas')} value={d.kpis.vencidas} icon={Clock} color={d.kpis.vencidas > 0 ? 'danger' : 'success'} />
              <KpiCard label={t('anorm.kpi.totalRango')} value={d.kpis.total_rango} icon={TrendingUp} color="primary" />
              <KpiCard label={t('anorm.kpi.tasaCierre')} value={`${d.kpis.tasa_cierre}%`} icon={CheckCircle2} color="success" />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Por proceso */}
              <ChartCard title={t('anorm.chart.porProceso')}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.graficas.por_proceso} layout="vertical" margin={{ left: 8, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="proceso" width={70} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="cantidad" fill="#2e57fe" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Por origen */}
              <ChartCard title={t('anorm.chart.porOrigen')}>
                {d.graficas.por_origen.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-warm-300 text-sm">{t('common.noData')}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={d.graficas.por_origen}
                        dataKey="cantidad"
                        nameKey="origen_responsabilidad"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ origen_responsabilidad, percent }) => `${origen_responsabilidad} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {d.graficas.por_origen.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              {/* Tendencia semanal */}
              <ChartCard title={t('anorm.chart.tendencia')}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={d.graficas.tendencia_semanal} margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }}
                      tickFormatter={v => fmtDate(v)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      labelFormatter={v => fmtDate(v)} />
                    <Line type="monotone" dataKey="cantidad" stroke="#2e57fe" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Top 5 códigos */}
              <ChartCard title={t('anorm.chart.topCodigos')}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.graficas.top_codigos} margin={{ left: 0, right: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0ece8" />
                    <XAxis dataKey="codigo" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="cantidad" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Tables row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Últimas 10 abiertas */}
              <div className="bg-white rounded-2xl border border-warm-100 shadow-sm">
                <div className="px-4 py-3 border-b border-warm-100">
                  <h3 className="text-sm font-semibold text-warm-800">{t('anorm.dashboard.ultimasAbiertas')}</h3>
                </div>
                <div className="divide-y divide-warm-50">
                  {d.tablas.ultimas_abiertas.length === 0 ? (
                    <p className="text-sm text-warm-400 text-center py-6">{t('common.noData')}</p>
                  ) : d.tablas.ultimas_abiertas.map(row => (
                    <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                      <NivelChip nivel={row.nivel} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono font-semibold text-primary-700">{row.folio}</p>
                        <p className="text-[10px] text-warm-400 truncate">{row.proceso} {row.cliente ? `· ${row.cliente}` : ''}</p>
                      </div>
                      <EstadoChip estado={row.estado} />
                      <span className="text-[10px] text-warm-400">{row.dias_abierto ? `${Math.floor(row.dias_abierto)}d` : '0d'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Últimas L3 */}
              <div className="bg-white rounded-2xl border border-warm-100 shadow-sm">
                <div className="px-4 py-3 border-b border-warm-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-danger-500" />
                  <h3 className="text-sm font-semibold text-warm-800">{t('anorm.dashboard.ultimasL3')}</h3>
                </div>
                <div className="divide-y divide-warm-50">
                  {d.tablas.ultimas_l3.length === 0 ? (
                    <p className="text-sm text-warm-400 text-center py-6">{t('common.noData')}</p>
                  ) : d.tablas.ultimas_l3.map(row => (
                    <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-2 h-2 rounded-full bg-danger-500 animate-pulse flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono font-semibold text-primary-700">{row.folio}</p>
                        <p className="text-[10px] text-warm-400 truncate">{row.proceso} {row.cliente ? `· ${row.cliente}` : ''}</p>
                      </div>
                      <EstadoChip estado={row.estado} />
                      <span className="text-[10px] text-warm-400">{fmtDate(row.fecha_ocurrencia)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, color }) {
  const colorMap = {
    primary: { bg: 'bg-primary-50', border: 'border-primary-100', icon: 'text-primary-500', val: 'text-primary-700' },
    warning: { bg: 'bg-warning-50', border: 'border-warning-100', icon: 'text-warning-500', val: 'text-warning-700' },
    danger:  { bg: 'bg-danger-50',  border: 'border-danger-100',  icon: 'text-danger-500',  val: 'text-danger-700'  },
    success: { bg: 'bg-success-50', border: 'border-success-100', icon: 'text-success-500', val: 'text-success-700' },
  }
  const c = colorMap[color] || colorMap.primary
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-warm-500">{label}</span>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <span className={`text-2xl font-bold ${c.val}`}>{value}</span>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-warm-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-warm-800 mb-3">{title}</h3>
      {children}
    </div>
  )
}
