import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  Package, CheckCircle2, AlertTriangle, Crosshair, TrendingUp, Users,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getInventarioDashboard } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'

const ESTADO_COLORS = {
  disponible: '#22c55e',
  bloqueada: '#f59e0b',
  no_wms: '#ef4444',
  localizada: '#22c55e',
  no_encontrada: '#ef4444',
  en_proceso: '#3b82f6',
  pendiente: '#f59e0b',
}
const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7']

export default function InventarioDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-inventario', dateRange],
    queryFn: () => getInventarioDashboard({ fecha_inicio: dateRange.from, fecha_fin: dateRange.to }),
    enabled: backendOnline,
  })

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>

  const d = data?.data
  if (!d) return <NoData height={200} />

  const { kpis, graficas } = d

  return (
    <div className="space-y-4 p-4">
      {/* KPIs - Inventario */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-warm-400 mb-2 px-1">Inventario</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Cajas disponibles" value={kpis.cajas_disponibles} icon={Package} index={0} />
          <KpiCard label="Cajas bloqueadas" value={kpis.cajas_bloqueadas} icon={AlertTriangle} alert={kpis.cajas_bloqueadas > 0} index={1} />
          <KpiCard label="Cajas sin WMS" value={kpis.cajas_no_wms} icon={AlertTriangle} alert={kpis.cajas_no_wms > 0} index={2} />
        </div>
      </div>

      {/* KPIs - Rastreo */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-warm-400 mb-2 px-1">Rastreo</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Rastreos activos" value={kpis.rastreos_activos} icon={Crosshair} index={3} />
          <KpiCard label="Creados (período)" value={kpis.creados_semana} icon={TrendingUp} index={4} />
          <KpiCard label="Cerrados (período)" value={kpis.cerrados_semana} icon={CheckCircle2} index={5} />
          <KpiCard label="Tasa de éxito" value={`${kpis.tasa_exito_rastreo}%`} icon={TrendingUp} index={6} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mt-3">
          <KpiCard label="Cajas escaneadas (mes)" value={kpis.cajas_mes} icon={Package} index={7} />
          <KpiCard label="Tiempo prom. resolución" value={`${kpis.tiempo_promedio_horas}h`} icon={TrendingUp} index={8} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Cajas por estado en sistema" icon={Package}>
          {graficas.cajas_por_estado.some(e => e.cantidad > 0) ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={graficas.cajas_por_estado.filter(e => e.cantidad > 0)}
                    dataKey="cantidad" nameKey="estado"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={45} strokeWidth={0}>
                    {graficas.cajas_por_estado.map((e, i) => (
                      <Cell key={i} fill={ESTADO_COLORS[e.estado] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {graficas.cajas_por_estado.map((e, i) => (
                  <div key={e.estado} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ESTADO_COLORS[e.estado] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-warm-600 flex-1 capitalize">{e.estado.replace('_', ' ')}</span>
                    <span className="text-xs font-bold text-warm-700">{e.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title="Cajas en rastreo por estado" icon={Crosshair}>
          {graficas.rastreo_por_estado_cajas.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={graficas.rastreo_por_estado_cajas} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0ece8" />
                <XAxis dataKey="estado_caja" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                  {graficas.rastreo_por_estado_cajas.map((entry, i) => (
                    <Cell key={i} fill={ESTADO_COLORS[entry.estado_caja] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>

        <ChartCard title="Top responsables de rastreo" icon={Users}>
          {graficas.top_responsables.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={graficas.top_responsables} layout="vertical" margin={{ left: 4, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="responsable" width={100} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="cantidad" fill="#06b6d4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData height={200} />}
        </ChartCard>
      </div>
    </div>
  )
}
