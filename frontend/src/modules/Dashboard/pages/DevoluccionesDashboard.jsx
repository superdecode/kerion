import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  PackagePlus, PackageMinus, Boxes, TrendingUp, Clock,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getDevoluccionesDashboard } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'
import { fmtDate } from '../../../core/utils/dateFormat'

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#06b6d4']

function estadoInventarioLabel(e) {
  const map = { disponible: 'Disponible', sin_stock: 'Sin stock', bloqueado: 'Bloqueado', reservado: 'Reservado', procesando: 'Procesando' }
  return map[e] || e
}

export default function DevoluccionesDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-devoluciones', dateRange],
    queryFn: () => getDevoluccionesDashboard({ fecha_inicio: dateRange.from, fecha_fin: dateRange.to }),
    enabled: backendOnline,
  })

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>

  const d = data?.data
  if (!d) return <NoData height={200} />

  const { kpis, graficas } = d

  return (
    <div className="space-y-4 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Entradas totales" value={kpis.entradas_total} icon={PackagePlus} index={0} />
        <KpiCard label="Entradas confirmadas" value={kpis.entradas_confirmadas} icon={PackagePlus} index={1} />
        <KpiCard label="Salidas totales" value={kpis.salidas_total} icon={PackageMinus} index={2} />
        <KpiCard label="Salidas completadas" value={kpis.salidas_completadas} icon={PackageMinus} index={3} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Inventario activo" value={kpis.inventario_activo} icon={Boxes} index={4} />
        <KpiCard label="Peso total registrado" value={`${kpis.peso_total_kg} kg`} icon={Boxes} index={5} />
        <KpiCard label="Tiempo prom. entrada→salida" value={`${kpis.tiempo_promedio_horas}h`} icon={Clock} index={6} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Inventario activo por estado" icon={Boxes}>
          {graficas.inventario_por_estado.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={graficas.inventario_por_estado} dataKey="cantidad" nameKey="estado"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={45} strokeWidth={0}>
                    {graficas.inventario_por_estado.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(val, name) => [val, estadoInventarioLabel(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {graficas.inventario_por_estado.map((e, i) => (
                  <div key={e.estado} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-warm-600 flex-1">{estadoInventarioLabel(e.estado)}</span>
                    <span className="text-xs font-bold text-warm-700">{e.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title="Top SKUs con más devoluciones" icon={PackagePlus}>
          {graficas.top_skus.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={graficas.top_skus} layout="vertical" margin={{ left: 4, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="sku2" width={80} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="cantidad" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title="Tendencia semanal de entradas" icon={TrendingUp}>
          {graficas.tendencia_semanal.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={graficas.tendencia_semanal} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} tickFormatter={v => fmtDate(v)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={v => fmtDate(v)} />
                <Line type="monotone" dataKey="entradas" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Entradas" />
              </LineChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title="Salidas por estado" icon={PackageMinus}>
          {graficas.salidas_por_estado.some(e => e.cantidad > 0) ? (
            <div className="space-y-3 mt-2">
              {graficas.salidas_por_estado.map((item, i) => {
                const max = Math.max(...graficas.salidas_por_estado.map(x => x.cantidad), 1)
                return (
                  <div key={item.estado}>
                    <div className="flex items-center justify-between text-xs text-warm-600 mb-1">
                      <span className="capitalize">{item.estado}</span>
                      <span className="font-semibold">{item.cantidad}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-warm-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max((item.cantidad / max) * 100, item.cantidad > 0 ? 8 : 0)}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <NoData height={120} />}
        </ChartCard>
      </div>
    </div>
  )
}
