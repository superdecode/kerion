import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  Truck, CheckCircle2, Package, TrendingUp, Clock, AlertTriangle,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getDespachoDashboard } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'
import { fmtDate } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = { borrador: '#94a3b8', en_proceso: '#3b82f6', cerrado: '#22c55e' }
const PIE_COLORS = ['#22c55e', '#3b82f6', '#94a3b8', '#f59e0b', '#a855f7']

function estadoDespachoLabel(estado, t) {
  const map = {
    borrador: t('dashboard.status.draft'),
    en_proceso: t('dashboard.status.processing'),
    cerrado: t('dashboard.status.closed'),
  }
  return map[estado] || String(estado || '').replace('_', ' ')
}

export default function DespachoDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-despacho', dateRange],
    queryFn: () => getDespachoDashboard({ fecha_inicio: dateRange.from, fecha_fin: dateRange.to }),
    enabled: backendOnline,
  })

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>

  const d = data?.data
  if (!d) return <NoData height={200} />

  const { kpis, graficas } = d
  const sinEscaneo = kpis.ordenes_sin_escaneo || 0
  const conEscaneo = kpis.ordenes_con_escaneo || 0

  return (
    <div className="space-y-4 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('dashboard.despacho.kpi.foliosHoy')} value={kpis.folios_hoy} icon={Truck} index={0} />
        <KpiCard label={t('dashboard.despacho.kpi.cerradosHoy')} value={kpis.cerrados_hoy} icon={CheckCircle2} index={1} />
        <KpiCard label={t('dashboard.despacho.kpi.enProceso')} value={kpis.en_proceso_hoy} icon={Truck} index={2} />
        <KpiCard label={t('dashboard.despacho.kpi.cajasDespachadas')} value={kpis.cajas_despachadas} icon={Package} index={3} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={t('dashboard.despacho.kpi.tasaDespacho')} value={`${kpis.tasa_despacho}%`} icon={TrendingUp} index={4} />
        <KpiCard label={t('dashboard.despacho.kpi.ordenesTrazabilidad')} value={conEscaneo} icon={CheckCircle2} index={5} />
        <KpiCard label={t('dashboard.despacho.kpi.tiempoCierre')} value={`${kpis.tiempo_promedio_horas}h`} icon={Clock} index={6} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={t('dashboard.despacho.chart.foliosEstado')} icon={Truck}>
          {graficas.por_estado.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={graficas.por_estado} dataKey="cantidad" nameKey="estado"
                    cx="50%" cy="50%" outerRadius={75} innerRadius={40} strokeWidth={0}>
                    {graficas.por_estado.map((e, i) => (
                      <Cell key={i} fill={ESTADO_COLORS[e.estado] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {graficas.por_estado.map((e, i) => (
                  <div key={e.estado} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ESTADO_COLORS[e.estado] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-warm-600 flex-1">{estadoDespachoLabel(e.estado, t)}</span>
                    <span className="text-xs font-bold text-warm-700">{e.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={180} />}
        </ChartCard>

        <ChartCard title={t('dashboard.despacho.chart.trazabilidadOrdenes')} icon={CheckCircle2}>
          <div className="space-y-4 pt-2">
            <div>
              <div className="flex items-center justify-between text-xs text-warm-600 mb-1.5">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-success-500" /><span>{t('dashboard.despacho.conEscaneo')}</span></div>
                <span className="font-semibold">{conEscaneo}</span>
              </div>
              <div className="h-3 rounded-full bg-warm-100 overflow-hidden">
                <div className="h-full rounded-full bg-success-500 transition-all"
                  style={{ width: `${(conEscaneo + sinEscaneo) > 0 ? Math.round((conEscaneo / (conEscaneo + sinEscaneo)) * 100) : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-warm-600 mb-1.5">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-warm-300" /><span>{t('dashboard.despacho.sinEscaneo')}</span></div>
                <span className="font-semibold">{sinEscaneo}</span>
              </div>
              <div className="h-3 rounded-full bg-warm-100 overflow-hidden">
                <div className="h-full rounded-full bg-warm-300 transition-all"
                  style={{ width: `${(conEscaneo + sinEscaneo) > 0 ? Math.round((sinEscaneo / (conEscaneo + sinEscaneo)) * 100) : 0}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <p className="text-3xl font-bold text-warm-800">{kpis.tasa_despacho}%</p>
                <p className="text-xs text-warm-400 mt-0.5">{t('dashboard.despacho.tasaDespachoCompletado')}</p>
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard title={t('dashboard.despacho.chart.topConductores')} icon={Truck}>
          {graficas.top_conductores.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={graficas.top_conductores} layout="vertical" margin={{ left: 4, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="conductor" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="folios" fill="#10b981" radius={[0, 4, 4, 0]} name={t('dashboard.metric.folios')} />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title={t('dashboard.trend.weekly')} icon={TrendingUp}>
          {graficas.tendencia_semanal.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={graficas.tendencia_semanal} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} tickFormatter={v => fmtDate(v)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={v => fmtDate(v)} />
                <Line type="monotone" dataKey="cantidad" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name={t('dashboard.metric.folios')} />
              </LineChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>
      </div>
    </div>
  )
}
