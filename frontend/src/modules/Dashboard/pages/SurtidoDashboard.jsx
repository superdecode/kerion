import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  ClipboardList, CheckCircle2, AlertTriangle, Users, TrendingUp, Activity,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
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

function estadoLabel(s) {
  const map = {
    complete: 'Completado', open: 'Abierto',
    with_discrepancies: 'Con discrepancias', cancelled: 'Cancelado',
  }
  return map[s] || s
}

function trendTitle(bucket) {
  const map = {
    day: 'Tendencia diaria',
    week: 'Tendencia semanal',
    month: 'Tendencia mensual',
    year: 'Tendencia anual',
  }
  return map[bucket] || 'Tendencia'
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
    .map(item => ({ ...item, periodo: item.periodo || item.semana }))
  const tendenciaBucket = graficas.tendencia_bucket || 'week'

  return (
    <div className="space-y-4 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Sesiones del día" value={kpis.sesiones_hoy} icon={ClipboardList} index={0} />
        <KpiCard label="Sesiones completadas" value={kpis.sesiones_completadas} icon={CheckCircle2} index={1} />
        <KpiCard label="Tasa de completado" value={`${kpis.tasa_completado}%`} icon={TrendingUp} index={2} />
        <KpiCard label="Cajas escaneadas" value={kpis.cajas_escaneadas} icon={Activity} index={3} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Sesiones abiertas" value={kpis.sesiones_abiertas} icon={Activity} index={4} />
        <KpiCard label="Órdenes con faltantes" value={kpis.ordenes_con_faltantes} icon={AlertTriangle} alert index={5} />
        <KpiCard label="Órdenes con anormalidades" value={kpis.ordenes_con_anormalidades} icon={AlertTriangle} alert index={6} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Sesiones por estado" icon={ClipboardList}>
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
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(val, name) => [val, estadoLabel(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {graficas.ordenes_por_estado.map((e, i) => (
                  <div key={e.status} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ESTADO_COLORS[e.status] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-warm-600 flex-1 truncate">{estadoLabel(e.status)}</span>
                    <span className="text-xs font-bold text-warm-700">{e.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title="Top operadores" icon={Users}>
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

        <ChartCard title={trendTitle(tendenciaBucket)} icon={TrendingUp} className="lg:col-span-2">
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
                <Line type="monotone" dataKey="completadas" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Completadas" />
                <Line type="monotone" dataKey="total" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} name="Total" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>
      </div>
    </div>
  )
}
