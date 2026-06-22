import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  Package, CheckCircle2, AlertTriangle, Crosshair, TrendingUp, Users, ScanLine, Layers,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { getInventarioDashboard } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'
import { fmtDate } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  disponible: '#22c55e',
  bloqueada:  '#f59e0b',
  no_wms:     '#ef4444',
  localizada:   '#22c55e',
  no_encontrada: '#ef4444',
  en_proceso: '#3b82f6',
  pendiente:  '#f59e0b',
}
const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7']

function SectionHeader({ label }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-warm-400 mb-2 px-1">
      {label}
    </p>
  )
}

export default function InventarioDashboard({ dateRange }) {
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dash-inventario', dateRange],
    queryFn: () => getInventarioDashboard({ fecha_inicio: dateRange.from, fecha_fin: dateRange.to }),
    enabled: backendOnline,
  })

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  if (isError) return (
    <div className="flex flex-col items-center gap-2 py-16 text-warm-400">
      <AlertTriangle className="w-8 h-8 opacity-40" />
      <p className="text-sm">No se pudieron cargar las métricas de inventario</p>
    </div>
  )

  const d = data?.data
  if (!d) return <NoData height={200} />

  const { kpis, graficas } = d

  return (
    <div className="space-y-5 p-4">

      {/* ── ESCANEO ──────────────────────────────────────── */}
      <div>
        <SectionHeader label="Escaneo" />

        {/* Escaneo KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KpiCard label="Cajas disponibles" value={kpis.cajas_disponibles} icon={Package} index={0} />
          <KpiCard label="Cajas bloqueadas"  value={kpis.cajas_bloqueadas}  icon={AlertTriangle} alert={kpis.cajas_bloqueadas > 0} index={1} />
          <KpiCard label="Cajas sin WMS"     value={kpis.cajas_no_wms}      icon={AlertTriangle} alert={kpis.cajas_no_wms > 0}      index={2} />
          <KpiCard label="Escaneos (período)" value={kpis.escaneos_periodo ?? kpis.cajas_mes} icon={ScanLine} index={3} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <KpiCard label="Sesiones (período)" value={kpis.sesiones_periodo ?? '—'} icon={Layers} index={4} />
          <KpiCard label="OK"          value={kpis.escaneos_ok_periodo ?? '—'}        icon={CheckCircle2} index={5} />
          <KpiCard label="Sin match"   value={(kpis.escaneos_bloqueados_periodo ?? 0) + (kpis.escaneos_nowms_periodo ?? 0)} icon={AlertTriangle} alert index={6} />
        </div>

        {/* Escaneo charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Cajas en sistema por estado" icon={Package}>
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

          <ChartCard title="Escaneos por día (período)" icon={ScanLine}>
            {graficas.escaneo_diario?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={graficas.escaneo_diario} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0ece8" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => fmtDate(v)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={v => fmtDate(v)} />
                  <Bar dataKey="escaneos" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Escaneos" />
                </BarChart>
              </ResponsiveContainer>
            ) : <NoData height={200} />}
          </ChartCard>
        </div>
      </div>

      {/* ── RASTREO ──────────────────────────────────────── */}
      <div>
        <SectionHeader label="Rastreo" />

        {/* Rastreo KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard label="Rastreos activos"   value={kpis.rastreos_activos}      icon={Crosshair} index={7} />
          <KpiCard label="Creados (período)"  value={kpis.creados_semana}         icon={TrendingUp} index={8} />
          <KpiCard label="Cerrados (período)" value={kpis.cerrados_semana}        icon={CheckCircle2} index={9} />
          <KpiCard label="Tasa de éxito"      value={`${kpis.tasa_exito_rastreo}%`} icon={TrendingUp} index={10} />
        </div>

        {/* Rastreo charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

    </div>
  )
}
