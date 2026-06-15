import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  AlertTriangle, Clock, CheckCircle2, TrendingUp, AlertCircle,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDate } from '../../../core/utils/dateFormat'
import { getDashboard } from '../../Anormalidades/services/anormalidadesService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'

const CHART_COLORS = ['#2e57fe', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4']

const ESTADO_META = {
  nuevo:      { cls: 'bg-primary-100 text-primary-700 border-primary-200' },
  en_proceso: { cls: 'bg-accent-100 text-accent-700 border-accent-200' },
  cerrado:    { cls: 'bg-success-100 text-success-700 border-success-200' },
  vencido:    { cls: 'bg-danger-100 text-danger-700 border-danger-200' },
}

function NivelChip({ nivel }) {
  const colors = { L1: 'bg-success-100 text-success-700', L2: 'bg-warning-100 text-warning-700', L3: 'bg-danger-100 text-danger-700' }
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors[nivel] || ''}`}>{nivel}</span>
}

function EstadoChip({ estado }) {
  const { t } = useI18nStore()
  const m = ESTADO_META[estado] || ESTADO_META.nuevo
  const labelMap = { nuevo: t('anorm.estado.nuevo'), en_proceso: t('anorm.estado.en_proceso'), cerrado: t('anorm.estado.cerrado'), vencido: t('anorm.estado.vencido') }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{labelMap[estado] || estado}</span>
}

export default function AnormDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-anorm', dateRange],
    queryFn: () => getDashboard({ fecha_desde: dateRange.from, fecha_hasta: dateRange.to }),
    enabled: backendOnline,
  })

  const d = data?.data

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  if (!d) return <NoData height={200} />

  return (
    <div className="space-y-4 p-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label={t('anorm.kpi.hoy')} value={d.kpis.hoy} icon={AlertTriangle} index={0} />
        <KpiCard label={t('anorm.kpi.pendientes')} value={d.kpis.pendientes} icon={Clock} index={1} />
        <KpiCard label={t('anorm.kpi.l3Abiertas')} value={d.kpis.l3_abiertas} icon={AlertCircle} alert index={2} />
        <KpiCard label={t('anorm.kpi.vencidas')} value={d.kpis.vencidas} icon={Clock} alert index={3} />
        <KpiCard label={t('anorm.kpi.totalRango')} value={d.kpis.total_rango} icon={TrendingUp} index={4} />
        <KpiCard label={t('anorm.kpi.tasaCierre')} value={`${d.kpis.tasa_cierre}%`} icon={CheckCircle2} index={5} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <ChartCard title={t('anorm.chart.porOrigen')}>
          {d.graficas.por_origen.length === 0 ? <NoData height={200} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={d.graficas.por_origen} dataKey="cantidad" nameKey="origen_responsabilidad"
                  cx="50%" cy="50%" outerRadius={80}
                  label={({ origen_responsabilidad, percent }) => `${origen_responsabilidad} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {d.graficas.por_origen.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t('anorm.chart.tendencia')}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.graficas.tendencia_semanal} margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} tickFormatter={v => fmtDate(v)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={v => fmtDate(v)} />
              <Line type="monotone" dataKey="cantidad" stroke="#2e57fe" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

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

      {/* SLA + load */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-warm-800 mb-3">{t('anorm.dashboard.slaTitle')}</h3>
          <div className="space-y-3">
            {d.detalle_sla.map(row => (
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
                <p className="mt-1 text-[11px] text-warm-500">
                  {t('anorm.dashboard.closedOnTime').replace('{done}', row.dentro_sla).replace('{total}', row.cerradas)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-warm-800 mb-3">{t('anorm.dashboard.loadTitle')}</h3>
          <div className="space-y-2">
            {d.graficas.aging_abiertas.map(item => {
              const max = Math.max(...d.graficas.aging_abiertas.map(x => Number(x.cantidad || 0)), 1)
              return (
                <div key={item.bucket}>
                  <div className="flex items-center justify-between text-xs text-warm-600 mb-1">
                    <span>{item.bucket}</span><span>{item.cantidad}</span>
                  </div>
                  <div className="h-2 rounded-full bg-warm-100 overflow-hidden">
                    <div className="h-full rounded-full bg-warning-400" style={{ width: `${Math.max((Number(item.cantidad || 0) / max) * 100, 8)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: t('anorm.dashboard.ultimasAbiertas'), rows: d.tablas.ultimas_abiertas },
          { title: t('anorm.dashboard.ultimasL3'), rows: d.tablas.ultimas_l3, icon: AlertCircle },
          { title: t('anorm.dashboard.recentClosures'), rows: d.tablas.cierres_recientes },
        ].map(({ title, rows, icon: Icon }) => (
          <div key={title} className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-warm-100 flex items-center gap-2">
              {Icon && <Icon className="w-4 h-4 text-danger-500" />}
              <h3 className="text-sm font-semibold text-warm-800">{title}</h3>
            </div>
            <div className="divide-y divide-warm-50">
              {rows.length === 0 ? (
                <p className="text-sm text-warm-400 text-center py-6">{t('common.noData')}</p>
              ) : rows.map(row => (
                <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                  <NivelChip nivel={row.nivel} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-semibold text-primary-700">{row.folio}</p>
                    <p className="text-[10px] text-warm-400 truncate">{row.proceso}</p>
                  </div>
                  {row.estado ? <EstadoChip estado={row.estado} /> : null}
                  {row.fecha_cierre ? (
                    <div className="text-right">
                      <p className="text-xs font-semibold text-success-700">{Math.round(row.horas_resolucion || 0)}h</p>
                      <p className="text-[10px] text-warm-400">{fmtDate(row.fecha_cierre)}</p>
                    </div>
                  ) : (
                    <span className="text-[10px] text-warm-400">{row.dias_abierto ? `${Math.floor(row.dias_abierto)}d` : '0d'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
