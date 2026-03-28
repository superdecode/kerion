import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as ds from '../services/dropscanService'
import { BarChart3, Download, Calendar, TrendingUp, Package, CheckCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import * as XLSX from 'xlsx'

export default function Reportes() {
  const { t } = useI18nStore()
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  const [fechaInicio, setFechaInicio] = useState(weekAgo)
  const [fechaFin, setFechaFin] = useState(today)

  const { data, isLoading } = useQuery({
    queryKey: ['dropscan-metrics', fechaInicio, fechaFin],
    queryFn: () => ds.getMetrics(fechaInicio, fechaFin),
    enabled: !!fechaInicio && !!fechaFin,
  })

  const totales = data?.totales || {}
  const porDia = data?.por_dia || []

  const handleExport = () => {
    if (!porDia.length) return

    const wsData = [
      [t('history.date'), t('dashboard.pallets'), t('dashboard.completedPallets'), t('dashboard.guides'), t('reports.avgTime')],
      ...porDia.map(d => [
        new Date(d.fecha).toLocaleDateString('zh-CN'),
        d.tarimas,
        d.completadas,
        d.guias,
        d.tiempo_promedio_min
      ]),
      [],
      ['TOTALES', totales.tarimas, totales.completadas, totales.guias, '']
    ]

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte DropScan')

    // Column widths
    ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 18 }]

    XLSX.writeFile(wb, `reporte-dropscan-${fechaInicio}-${fechaFin}.xlsx`)
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-full mx-auto space-y-6">
          {/* Date selector */}
          <motion.div
            className="card p-4 flex items-end gap-4 flex-wrap"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('history.startDate')}</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('history.endDate')}</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setFechaInicio(today); setFechaFin(today) }}
                className="px-3 py-2 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {t('common.today')}
              </button>
              <button
                onClick={() => { setFechaInicio(weekAgo); setFechaFin(today) }}
                className="px-3 py-2 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {t('common.last7Days')}
              </button>
              <button
                onClick={() => {
                  const m = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
                  setFechaInicio(m); setFechaFin(today)
                }}
                className="px-3 py-2 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {t('common.last30Days')}
              </button>
            </div>
            <div className="flex-1" />
            <button
              onClick={handleExport}
              disabled={!porDia.length}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-success-600 text-white rounded-lg text-sm font-medium
                         hover:bg-success-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              {t('reports.exportExcel')}
            </button>
          </motion.div>

          {isLoading ? (
            <LoadingSpinner text={t('common.loading')} />
          ) : (
            <>
              {/* Totals */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[
                  { icon: Package, value: totales.guias || 0, label: t('dashboard.totalGuides'), gradient: 'from-primary-100 to-primary-50', iconColor: 'text-primary-600' },
                  { icon: CheckCircle, value: totales.completadas || 0, label: t('dashboard.completedPallets'), gradient: 'from-success-100 to-success-50', iconColor: 'text-success-600' },
                  { icon: TrendingUp, value: totales.tarimas || 0, label: t('reports.totalPallets'), gradient: 'from-warning-100 to-warning-50', iconColor: 'text-warning-600' },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    className="card-interactive p-5 flex items-center gap-4 group"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                      <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-warm-800">{stat.value}</p>
                      <p className="text-xs text-warm-400">{stat.label}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Charts */}
              {porDia.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {/* Daily guides */}
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-warm-700 mb-4">{t('reports.dailyTrend')}</h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={porDia}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="fecha"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d) => new Date(d).toLocaleDateString('zh-CN', { day: '2-digit', month: '2-digit' })}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          labelFormatter={(d) => new Date(d).toLocaleDateString('zh-CN')}
                        />
                        <Bar dataKey="guias" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Guías" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Avg time trend */}
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-warm-700 mb-4">{t('reports.avgTime')}</h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={porDia}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="fecha"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d) => new Date(d).toLocaleDateString('zh-CN', { day: '2-digit', month: '2-digit' })}
                        />
                        <YAxis tick={{ fontSize: 10 }} unit=" min" />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          labelFormatter={(d) => new Date(d).toLocaleDateString('zh-CN')}
                        />
                        <Line
                          type="monotone"
                          dataKey="tiempo_promedio_min"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="Tiempo (min)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Data table */}
              {porDia.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-3 border-b border-warm-100/60 bg-gradient-to-r from-warm-50 to-primary-50/40">
                    <h3 className="text-sm font-semibold text-warm-700">{t('reports.dailyDetail')}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-warm-50 to-primary-50/40 border-b border-warm-200">
                          <th className="text-left px-4 py-3 font-bold text-warm-600">{t('history.date')}</th>
                          <th className="text-center px-4 py-3 font-bold text-warm-600">{t('dashboard.pallets')}</th>
                          <th className="text-center px-4 py-3 font-bold text-warm-600">{t('dashboard.completedPallets')}</th>
                          <th className="text-center px-4 py-3 font-bold text-warm-600">{t('dashboard.guides')}</th>
                          <th className="text-center px-4 py-3 font-bold text-warm-600">{t('reports.avgTime')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {porDia.map(d => (
                          <tr key={d.fecha} className="hover:bg-primary-50/20 transition-colors">
                            <td className="px-4 py-3 text-warm-700">
                              {new Date(d.fecha).toLocaleDateString('zh-CN', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </td>
                            <td className="px-4 py-3 text-center text-warm-600">{d.tarimas}</td>
                            <td className="px-4 py-3 text-center text-success-600 font-semibold">{d.completadas}</td>
                            <td className="px-4 py-3 text-center font-bold text-warm-700">{d.guias}</td>
                            <td className="px-4 py-3 text-center text-warm-500">{d.tiempo_promedio_min} min</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gradient-to-r from-warm-50 to-primary-50/40 font-bold">
                          <td className="px-4 py-3 text-warm-700">{t('common.total')}</td>
                          <td className="px-4 py-3 text-center text-warm-700">{totales.tarimas}</td>
                          <td className="px-4 py-3 text-center text-success-600">{totales.completadas}</td>
                          <td className="px-4 py-3 text-center text-warm-700">{totales.guias}</td>
                          <td className="px-4 py-3 text-center text-warm-400">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
