import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PackageCheck, PackagePlus, Clock, CheckCircle2, AlertCircle, Layers } from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getRecepcionOrders } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'

const ESTADO_COLORS = {
  pendiente_validacion: '#f59e0b',
  en_validacion:        '#3b82f6',
  completo:             '#22c55e',
  parcial:              '#a855f7',
  cancelado:            '#ef4444',
}

export default function RecepcionDashboard({ dateRange }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-recepcion', dateRange],
    queryFn: () => getRecepcionOrders({ fecha_inicio: dateRange.from, fecha_fin: dateRange.to }),
    enabled: backendOnline,
  })

  const orders = data?.orders ?? []

  const kpis = useMemo(() => {
    const total = orders.length
    const completo = orders.filter(o => o.estado === 'completo').length
    const en_validacion = orders.filter(o => o.estado === 'en_validacion').length
    const pendiente = orders.filter(o => o.estado === 'pendiente_validacion').length
    const parcial = orders.filter(o => o.estado === 'parcial').length
    const cancelado = orders.filter(o => o.estado === 'cancelado').length
    const total_cajas = orders.reduce((s, o) => s + Number(o.total_cajas || 0), 0)
    const cajas_validadas = orders.reduce((s, o) => s + Number(o.cajas_validadas || 0), 0)
    return { total, completo, en_validacion, pendiente, parcial, cancelado, total_cajas, cajas_validadas }
  }, [orders])

  const pieData = useMemo(() =>
    Object.entries({
      pendiente_validacion: t('dashboard.status.pending'),
      en_validacion: t('dashboard.status.inValidation'),
      completo: t('dashboard.status.complete'),
      parcial: t('dashboard.status.partial'),
      cancelado: t('dashboard.status.cancelled'),
    })
      .map(([key, label]) => ({ name: label, value: kpis[key === 'pendiente_validacion' ? 'pendiente' : key] ?? 0, color: ESTADO_COLORS[key] }))
      .filter(d => d.value > 0),
    [kpis, t]
  )

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  if (orders.length === 0) return <NoData height={200} />

  return (
    <div className="space-y-4 p-4">
      {/* KPIs row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('dashboard.recepcion.kpi.ordenesTotales')} value={kpis.total} icon={PackagePlus} index={0} iconBg="bg-sky-50 border border-sky-100" />
        <KpiCard label={t('dashboard.recepcion.kpi.completas')} value={kpis.completo} icon={CheckCircle2} index={1} iconBg="bg-success-50 border border-success-100" />
        <KpiCard label={t('dashboard.recepcion.kpi.enValidacion')} value={kpis.en_validacion} icon={Clock} index={2} iconBg="bg-blue-50 border border-blue-100" />
        <KpiCard label={t('dashboard.recepcion.kpi.pendientes')} value={kpis.pendiente} icon={PackageCheck} index={3} iconBg="bg-amber-50 border border-amber-100" />
      </div>

      {/* KPIs row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('dashboard.recepcion.kpi.totalCajas')} value={kpis.total_cajas} icon={Layers} index={4} />
        <KpiCard label={t('dashboard.recepcion.kpi.cajasValidadas')} value={kpis.cajas_validadas} icon={CheckCircle2} index={5} />
        <KpiCard label={t('dashboard.recepcion.kpi.parciales')} value={kpis.parcial} icon={AlertCircle} index={6} />
        <KpiCard label={t('dashboard.recepcion.kpi.canceladas')} value={kpis.cancelado} icon={AlertCircle} index={7} alert />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status pie */}
        <ChartCard title={t('dashboard.recepcion.chart.ordenesEstado')} icon={PackageCheck}>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={60} stroke="none">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {pieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span className="text-xs text-warm-600 flex-1">{entry.name}</span>
                    <span className="text-xs font-bold text-warm-800">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={160} />}
        </ChartCard>

        {/* Cajas progress */}
        <ChartCard title={t('dashboard.recepcion.chart.avanceValidacion')} icon={Layers}>
          <div className="space-y-4 pt-2">
            {(() => {
              const pct = kpis.total_cajas > 0 ? Math.round((kpis.cajas_validadas / kpis.total_cajas) * 100) : 0
              return (
                <>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-black text-warm-900 tabular-nums">{pct}%</span>
                    <span className="text-sm text-warm-400 pb-1">{t('dashboard.recepcion.validado')}</span>
                  </div>
                  <div className="w-full h-3 bg-warm-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-warm-500">
                    <span>{kpis.cajas_validadas} {t('dashboard.recepcion.validadas')}</span>
                    <span>{kpis.total_cajas} {t('common.total').toLowerCase()}</span>
                  </div>
                </>
              )
            })()}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
