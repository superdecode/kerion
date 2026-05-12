import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getReports } from '../services/inventoryService'
import { BarChart3, CheckCircle, AlertTriangle, XCircle, Users, ScanBarcode } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const COLORS = { OK: '#10b981', Bloqueado: '#f59e0b', NoWMS: '#ef4444' }

function KpiCard({ icon: Icon, label, value, color = 'text-primary-700', bg = 'bg-primary-50' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-5 shadow-sm"
    >
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-xs font-medium text-warm-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
    </motion.div>
  )
}

const getToday = () => new Date().toISOString().split('T')[0]
const subtractDays = (d, n) => {
  const dt = new Date(d)
  dt.setDate(dt.getDate() - n)
  return dt.toISOString().split('T')[0]
}

export default function InvReportes() {
  const { t } = useI18nStore()
  const today = getToday()
  const [dateFrom, setDateFrom] = useState(subtractDays(today, 7))
  const [dateTo, setDateTo] = useState(today)
  const [applied, setApplied] = useState({ date_from: subtractDays(today, 7), date_to: today })

  const { data, isLoading } = useQuery({
    queryKey: ['inv-reports', applied],
    queryFn: () => getReports(applied),
  })

  const kpi = data?.kpi || {}
  const byStatus = data?.by_status || []
  const byDay = data?.by_day || []
  const topScanned = data?.top_scanned || []

  // Pivot by_day for stacked bar
  const dayMap = {}
  for (const r of byDay) {
    if (!dayMap[r.day]) dayMap[r.day] = { day: r.day, OK: 0, Bloqueado: 0, NoWMS: 0 }
    dayMap[r.day][r.status] = parseInt(r.count)
  }
  const dayData = Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day))

  const pieData = byStatus.map(r => ({ name: r.status, value: parseInt(r.count) }))

  const handleApply = (e) => {
    e.preventDefault()
    setApplied({ date_from: dateFrom, date_to: dateTo })
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('inventory.reportes.title') || 'Reportes de Inventario'}
        subtitle={t('inventory.reportes.subtitle') || 'KPIs y gráficas'}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Date filter */}
        <form onSubmit={handleApply} className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-5 shadow-sm flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-warm-600 mb-1.5">Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border border-warm-200 text-sm bg-white
                focus:outline-none focus:ring-2 focus:ring-primary-300" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-600 mb-1.5">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl border border-warm-200 text-sm bg-white
                focus:outline-none focus:ring-2 focus:ring-primary-300" />
          </div>
          <button type="submit"
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700
              text-white text-sm font-semibold transition">
            <BarChart3 className="w-4 h-4" />
            Aplicar
          </button>
        </form>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard icon={ScanBarcode} label="Total escaneos" value={kpi.total_scans} />
          <KpiCard icon={CheckCircle} label="OK" value={kpi.ok_count} color="text-emerald-700" bg="bg-emerald-50" />
          <KpiCard icon={AlertTriangle} label="Bloqueado" value={kpi.bloqueado_count} color="text-amber-700" bg="bg-amber-50" />
          <KpiCard icon={XCircle} label="No en WMS" value={kpi.no_wms_count} color="text-red-600" bg="bg-red-50" />
          <KpiCard icon={ScanBarcode} label="Sesiones" value={kpi.total_sessions} color="text-indigo-700" bg="bg-indigo-50" />
          <KpiCard icon={Users} label="Usuarios" value={kpi.total_users} color="text-violet-700" bg="bg-violet-50" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Stacked bar by day */}
          <div className="lg:col-span-2 bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-5 shadow-sm">
            <p className="text-sm font-semibold text-warm-700 mb-4">Escaneos por día</p>
            {isLoading ? <p className="text-warm-400 text-sm">Cargando...</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dayData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="OK" stackId="a" fill={COLORS.OK} radius={[0,0,0,0]} />
                  <Bar dataKey="Bloqueado" stackId="a" fill={COLORS.Bloqueado} />
                  <Bar dataKey="NoWMS" stackId="a" fill={COLORS.NoWMS} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pie by status */}
          <div className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-5 shadow-sm">
            <p className="text-sm font-semibold text-warm-700 mb-4">Distribución por estado</p>
            {isLoading ? <p className="text-warm-400 text-sm">Cargando...</p> : pieData.length === 0 ? (
              <p className="text-warm-400 text-sm text-center py-10">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top scanned */}
        {topScanned.length > 0 && (
          <div className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-warm-100">
              <p className="text-sm font-semibold text-warm-700">Top 20 códigos más escaneados</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-100 text-xs text-warm-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">#</th>
                    <th className="px-5 py-3 text-left">Código</th>
                    <th className="px-5 py-3 text-left">SKU</th>
                    <th className="px-5 py-3 text-left">Producto</th>
                    <th className="px-5 py-3 text-left">Escaneos</th>
                    <th className="px-5 py-3 text-left">Último estado</th>
                  </tr>
                </thead>
                <tbody>
                  {topScanned.map((row, i) => (
                    <tr key={row.barcode} className="border-b border-warm-50 hover:bg-warm-50/50 transition">
                      <td className="px-5 py-3 text-warm-400 text-xs">{i + 1}</td>
                      <td className="px-5 py-3 font-mono text-xs">{row.barcode}</td>
                      <td className="px-5 py-3 text-warm-600">{row.sku || '—'}</td>
                      <td className="px-5 py-3 text-warm-700">{row.product_name || '—'}</td>
                      <td className="px-5 py-3 font-semibold text-primary-700">{row.scan_count}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border
                          ${row.last_status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            row.last_status === 'Bloqueado' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-red-50 text-red-600 border-red-200'}`}>
                          {row.last_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
