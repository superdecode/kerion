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

const CHART_COLORS = ['#2e57fe', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4']

const ESTADO_META = {
  nuevo:      { labelKey: 'anorm.estado.nuevo',      cls: 'bg-primary-100 text-primary-700 border-primary-200' },
  en_proceso: { labelKey: 'anorm.estado.en_proceso', cls: 'bg-accent-100 text-accent-700 border-accent-200' },
  cerrado:    { labelKey: 'anorm.estado.cerrado',    cls: 'bg-success-100 text-success-700 border-success-200' },
  vencido:    { labelKey: 'anorm.estado.vencido',    cls: 'bg-danger-100 text-danger-700 border-danger-200' },
}

function NivelChip({ nivel }) {
  const colors = { L1: 'bg-success-100 text-success-700 border-success-200', L2: 'bg-warning-100 text-warning-700 border-warning-200', L3: 'bg-danger-100 text-danger-700 border-danger-200' }
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors[nivel] || ''}`}>{nivel}</span>
}

function EstadoChip({ estado }) {
  const { t } = useI18nStore()
  const m = ESTADO_META[estado] || ESTADO_META.nuevo
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{t(m.labelKey)}</span>
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

      <div className="sticky top-[3.5rem] z-[20] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5">
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
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : !d ? null : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label={t('anorm.kpi.hoy')} value={d.kpis.hoy} icon={AlertTriangle} />
              <KpiCard label={t('anorm.kpi.pendientes')} value={d.kpis.pendientes} icon={Clock} />
              <KpiCard label={t('anorm.kpi.l3Abiertas')} value={d.kpis.l3_abiertas} icon={AlertCircle} />
              <KpiCard label={t('anorm.kpi.vencidas')} value={d.kpis.vencidas} icon={Clock} />
              <KpiCard label={t('anorm.kpi.totalRango')} value={d.kpis.total_rango} icon={TrendingUp} />
              <KpiCard label={t('anorm.kpi.tasaCierre')} value={`${d.kpis.tasa_cierre}%`} icon={CheckCircle2} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-4">
              <div className="card p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-warm-400">{t('anorm.dashboard.reading')}</p>
                    <h3 className="mt-2 text-xl font-semibold text-warm-800">{t('anorm.dashboard.riskTitle')}</h3>
                    <p className="mt-2 text-sm text-warm-500">
                      {d.kpis.vencidas > 0
                        ? t('anorm.dashboard.overdueAlert').replace('{n}', d.kpis.vencidas)
                        : t('anorm.dashboard.overdueClear')}
                    </p>
                  </div>
                  <div className="min-w-[180px] rounded-xl border border-warm-100 bg-warm-50 p-4">
                    <p className="text-xs text-warm-400">{t('anorm.dashboard.avgResolution')}</p>
                    <p className="mt-2 text-3xl font-bold text-warm-800">{d.kpis.horas_promedio_resolucion || 0}h</p>
                    <p className="mt-1 text-xs text-warm-500">{t('anorm.dashboard.avgResolutionHint')}</p>
                  </div>
                </div>
              </div>

              <ChartCard title={t('anorm.dashboard.estadoOperativo')}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={d.graficas.por_estado} margin={{ left: 0, right: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0ece8" />
                    <XAxis dataKey="estado" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                      {d.graficas.por_estado.map((entry, i) => (
                        <Cell
                          key={`${entry.estado}-${i}`}
                          fill={entry.estado === 'vencido' ? '#ef4444' : entry.estado === 'cerrado' ? '#22c55e' : entry.estado === 'en_proceso' ? '#8b5cf6' : '#2e57fe'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
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
                  <LineChart data={d.graficas.top_codigos} margin={{ left: 0, right: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0ece8" />
                    <XAxis dataKey="codigo" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="cantidad" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-warm-800 mb-3">{t('anorm.dashboard.slaTitle')}</h3>
                <div className="space-y-3">
                  {d.detalle_sla.map((row) => (
                    <div key={row.nivel} className="rounded-xl border border-warm-100 bg-warm-50 px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <NivelChip nivel={row.nivel} />
                          <span className="text-sm font-semibold text-warm-800">{t('anorm.dashboard.slaWithin').replace('{n}', row.cumplimiento)}</span>
                        </div>
                        <span className="text-xs text-warm-500">{t('anorm.dashboard.avgHoursShort').replace('{n}', row.horas_promedio || 0)}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-warm-200 overflow-hidden">
                        <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(row.cumplimiento || 0, 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-warm-500">{t('anorm.dashboard.closedOnTime').replace('{done}', row.dentro_sla).replace('{total}', row.cerradas)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-4">
                <h3 className="text-sm font-semibold text-warm-800 mb-3">{t('anorm.dashboard.loadTitle')}</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-warm-400 mb-2">{t('anorm.dashboard.openAgeTitle')}</p>
                    <div className="space-y-2">
                      {d.graficas.aging_abiertas.map((item) => {
                        const max = Math.max(...d.graficas.aging_abiertas.map(x => Number(x.cantidad || 0)), 1)
                        const width = `${Math.max((Number(item.cantidad || 0) / max) * 100, 8)}%`
                        return (
                          <div key={item.bucket}>
                            <div className="flex items-center justify-between text-xs text-warm-600 mb-1">
                              <span>{item.bucket}</span>
                              <span>{item.cantidad}</span>
                            </div>
                            <div className="h-2 rounded-full bg-warm-100 overflow-hidden">
                              <div className="h-full rounded-full bg-warning-400" style={{ width }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-warm-400 mb-2">{t('anorm.dashboard.responsableLoadTitle')}</p>
                    <div className="space-y-2">
                      {d.graficas.top_responsables.map((item) => (
                        <div key={item.responsable} className="flex items-center justify-between rounded-xl border border-warm-100 bg-warm-50 px-3 py-2">
                          <span className="text-sm text-warm-700 truncate pr-3">{item.responsable}</span>
                          <span className="text-sm font-semibold text-warm-800">{item.cantidad}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tables row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Últimas 10 abiertas */}
              <div className="card overflow-hidden">
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
              <div className="card overflow-hidden">
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

              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-warm-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success-500" />
                  <h3 className="text-sm font-semibold text-warm-800">{t('anorm.dashboard.recentClosures')}</h3>
                </div>
                <div className="divide-y divide-warm-50">
                  {d.tablas.cierres_recientes.length === 0 ? (
                    <p className="text-sm text-warm-400 text-center py-6">{t('common.noData')}</p>
                  ) : d.tablas.cierres_recientes.map(row => (
                    <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                      <NivelChip nivel={row.nivel} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono font-semibold text-primary-700">{row.folio}</p>
                        <p className="text-[10px] text-warm-400 truncate">{row.proceso} {row.cliente ? `· ${row.cliente}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-success-700">{Math.round(row.horas_resolucion || 0)}h</p>
                        <p className="text-[10px] text-warm-400">{fmtDate(row.fecha_cierre)}</p>
                      </div>
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

function KpiCard({ label, value, icon: Icon }) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-warm-500">{label}</span>
        <div className="w-8 h-8 rounded-xl bg-warm-50 border border-warm-100 flex items-center justify-center">
          <Icon className="w-4 h-4 text-warm-500" />
        </div>
      </div>
      <span className="text-2xl font-bold text-warm-800">{value}</span>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-warm-800 mb-3">{title}</h3>
      {children}
    </div>
  )
}
