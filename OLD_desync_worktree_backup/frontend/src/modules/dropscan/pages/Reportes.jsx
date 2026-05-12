import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as ds from '../services/dropscanService'
import { getFolios } from '../../fep/services/fepService'
import {
  BarChart3, Download, TrendingUp, Package, CheckCircle, Building2,
  Radio, Clock, User, ChevronDown, FileText, LayoutDashboard, Table2
} from 'lucide-react'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import * as XLSX from 'xlsx'
import {
  fmtDate, fmtDateTime, fmtDateString, fmtDateStringShort, getToday, subtractDays
} from '../../../core/utils/dateFormat'

const PIE_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16']

const CHART_KEYS = ['dailyGuides', 'avgTime', 'hourlyProd', 'byEmpresa', 'byCanal', 'byEscaneador', 'fepFolios']
const CHART_DEFAULTS = {
  dailyGuides: true, avgTime: true, hourlyProd: true,
  byEmpresa: true, byCanal: true, byEscaneador: true, fepFolios: true,
}

export default function Reportes() {
  const { t } = useI18nStore()
  const { hasPermission } = useAuthStore()
  const today = getToday()

  const CHART_OPTIONS = [
    { key: 'dailyGuides',  label: t('reports.chart.dailyGuides') },
    { key: 'avgTime',      label: t('reports.chart.avgTime') },
    { key: 'hourlyProd',   label: t('reports.chart.hourlyProd') },
    { key: 'byEmpresa',    label: t('reports.chart.byEmpresa') },
    { key: 'byCanal',      label: t('reports.chart.byCanal') },
    { key: 'byEscaneador', label: t('reports.chart.byEscaneador') },
    { key: 'fepFolios',    label: t('reports.chart.fepFolios') },
  ]

  const TABS = [
    { id: 'resumen', label: t('reports.tab.resumen'), icon: LayoutDashboard },
    { id: 'tablas',  label: t('reports.tab.detalle'), icon: Table2 },
  ]
  const weekAgo = subtractDays(today, 7)

  const [fechaInicio, setFechaInicio] = useState(weekAgo)
  const [fechaFin, setFechaFin] = useState(today)
  const [empresaFilter, setEmpresaFilter] = useState([])
  const [canalFilter, setCanalFilter] = useState([])
  const [escaneadorFilter, setEscaneadorFilter] = useState([])
  const [reportTab, setReportTab] = useState('resumen')
  const [isExporting, setIsExporting] = useState(false)

  const [visibleCharts, setVisibleCharts] = useState(() => {
    try {
      const saved = localStorage.getItem('dropscan-visible-charts')
      return saved ? { ...CHART_DEFAULTS, ...JSON.parse(saved) } : CHART_DEFAULTS
    } catch { return CHART_DEFAULTS }
  })
  const toggleChart = (key) => setVisibleCharts(v => {
    const next = { ...v, [key]: !v[key] }
    try { localStorage.setItem('dropscan-visible-charts', JSON.stringify(next)) } catch {}
    return next
  })

  const { data: empresasData } = useQuery({ queryKey: ['dropscan-empresas'], queryFn: ds.getEmpresas })
  const { data: canalesData } = useQuery({ queryKey: ['dropscan-canales'], queryFn: ds.getCanales })
  const empresas = (Array.isArray(empresasData) ? empresasData : empresasData?.items || empresasData?.empresas || []).filter(e => e.activo !== false)
  const canales = (Array.isArray(canalesData) ? canalesData : canalesData?.items || canalesData?.canales || []).filter(c => c.activo !== false)

  const { data, isLoading } = useQuery({
    queryKey: ['dropscan-metrics', fechaInicio, fechaFin, empresaFilter, canalFilter, escaneadorFilter],
    queryFn: () => ds.getMetrics(fechaInicio, fechaFin,
      empresaFilter.length ? empresaFilter : undefined,
      canalFilter.length ? canalFilter : undefined,
      escaneadorFilter.length ? escaneadorFilter : undefined),
    enabled: !!fechaInicio && !!fechaFin,
  })

  const { data: escaneadoresData } = useQuery({
    queryKey: ['dropscan-escaneadores-opts', fechaInicio, fechaFin, empresaFilter, canalFilter],
    queryFn: () => ds.getMetrics(fechaInicio, fechaFin,
      empresaFilter.length ? empresaFilter : undefined,
      canalFilter.length ? canalFilter : undefined),
    enabled: !!fechaInicio && !!fechaFin,
  })
  const escaneadoresOpts = (escaneadoresData?.por_escaneador || []).map(e => ({ value: e.escaneador, label: e.escaneador }))

  const { data: foliosData } = useQuery({
    queryKey: ['fep-folios-reportes', fechaInicio, fechaFin],
    queryFn: () => getFolios({ fecha_desde: fechaInicio, fecha_hasta: fechaFin, limit: 500 }),
    enabled: !!fechaInicio && !!fechaFin,
  })
  const foliosPorDia = useMemo(() => {
    const folios = foliosData?.folios || []
    const map = {}
    folios.forEach(f => {
      const day = f.created_at ? f.created_at.slice(0, 10) : null
      if (!day) return
      map[day] = (map[day] || 0) + 1
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, cantidad]) => ({ fecha, cantidad }))
  }, [foliosData])
  const foliosByDay = useMemo(() => Object.fromEntries(foliosPorDia.map(f => [f.fecha, f.cantidad])), [foliosPorDia])
  const totalFoliosPeriodo = foliosData?.pagination?.total ?? (foliosData?.folios?.length ?? 0)

  const totales = data?.totales || {}
  const porDia = data?.por_dia || []
  const porEmpresa = data?.por_empresa || []
  const porCanal = data?.por_canal || []
  const porEscaneador = data?.por_escaneador || []
  const rawPorHora = data?.por_hora || []
  const porHora = Array.from({ length: 24 }, (_, h) => ({
    hora: h,
    cantidad: rawPorHora.find(d => parseInt(d.hora) === h)?.cantidad || 0,
  }))

  // Dynamic 6-col chart grid span
  const activeCharts = CHART_OPTIONS.filter(c => visibleCharts[c.key])
  const chartIndexMap = Object.fromEntries(activeCharts.map((c, i) => [c.key, i]))
  const getColSpan = (key) => {
    const index = chartIndexMap[key]
    const n = activeCharts.length
    if (n === 1) return 'xl:col-span-6 sm:col-span-2'
    const rem = n % 3
    if (rem === 1 && index === n - 1) return 'xl:col-span-6 sm:col-span-2'
    if (rem === 2 && index >= n - 2) return 'xl:col-span-3'
    return 'xl:col-span-2'
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const exportData = await ds.getExportData(
        fechaInicio, fechaFin,
        empresaFilter.length ? empresaFilter : undefined,
        canalFilter.length ? canalFilter : undefined
      )
      const registros = exportData?.registros || []
      const wb = XLSX.utils.book_new()
      const detalleData = [
        ['Tarima', 'Empresa', 'Canal', 'Operador', 'Estado', 'Guías', 'Inicio', 'Cierre', 'Duración (min)', 'Código Guía', 'Posición', 'Fecha Escaneo', 'Operador Escaneo'],
        ...registros.map(r => [
          r.tarima_codigo, r.empresa, r.canal, r.operador, r.estado, r.cantidad_guias,
          r.fecha_inicio ? fmtDateTime(r.fecha_inicio) : '',
          r.fecha_cierre ? fmtDateTime(r.fecha_cierre) : '',
          r.duracion_min || '', r.codigo_guia || '', r.posicion || '',
          r.timestamp_escaneo ? fmtDateTime(r.timestamp_escaneo) : '', r.operador_guia || ''
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(detalleData)
      ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Detalle Guías')
      XLSX.writeFile(wb, `reporte-dropscan-${fechaInicio}-${fechaFin}.xlsx`)
    } catch { /* silent */ }
    finally { setIsExporting(false) }
  }

  const statCards = [
    { icon: Package, value: totales.guias || 0, label: t('dashboard.totalGuides'), gradient: 'from-primary-100 to-primary-50', iconColor: 'text-primary-600' },
    { icon: CheckCircle, value: totales.completadas || 0, label: t('dashboard.completedPallets'), gradient: 'from-success-100 to-success-50', iconColor: 'text-success-600' },
    { icon: TrendingUp, value: totales.tarimas || 0, label: t('reports.totalPallets'), gradient: 'from-warning-100 to-warning-50', iconColor: 'text-warning-600' },
    { icon: FileText, value: totalFoliosPeriodo, label: t('reports.folios'), gradient: 'from-indigo-100 to-indigo-50', iconColor: 'text-indigo-600' },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-full mx-auto space-y-4">
          {/* Filter bar */}
          <motion.div className="card p-4"
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-2 shrink-0">
                <Clock className="w-3.5 h-3.5 text-warm-400" />
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  className="text-xs outline-none bg-transparent text-warm-700 w-[108px]" />
                <span className="text-warm-300 text-xs">→</span>
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                  className="text-xs outline-none bg-transparent text-warm-700 w-[108px]" />
              </div>
              {[
                { label: t('shortcut.today'), f: () => { setFechaInicio(today); setFechaFin(today) } },
                { label: t('shortcut.7days'), f: () => { setFechaInicio(weekAgo); setFechaFin(today) } },
                { label: t('shortcut.30days'), f: () => { setFechaInicio(subtractDays(today, 30)); setFechaFin(today) } },
              ].map(({ label, f }) => (
                <button key={label} onClick={f}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 rounded-lg transition-colors">{label}</button>
              ))}
              <MultiSelect icon={Building2} placeholder={t('history.company')}
                options={empresas.map(e => ({ value: e.id, label: e.nombre, color: e.color }))}
                selected={empresaFilter} onChange={setEmpresaFilter} />
              <MultiSelect icon={Radio} placeholder={t('history.channel')}
                options={canales.map(c => ({ value: c.id, label: c.nombre }))}
                selected={canalFilter} onChange={setCanalFilter} />
              <MultiSelect icon={User} placeholder={t('reports.scanner')}
                options={escaneadoresOpts}
                selected={escaneadorFilter} onChange={setEscaneadorFilter} />
              <div className="ml-auto flex items-center gap-2">
                {/* Chart selector — only relevant on Resumen tab */}
                {reportTab === 'resumen' && (
                  <div className="relative group">
                    <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-warm-100 text-warm-700 hover:bg-warm-200 rounded-xl transition-colors border border-warm-200">
                      <BarChart3 className="w-3.5 h-3.5" /> {t('reports.chartSelector')} <ChevronDown className="w-3 h-3" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-depth border border-warm-100 min-w-[200px] overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
                      {CHART_OPTIONS.map(opt => (
                        <button key={opt.key} onClick={() => toggleChart(opt.key)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                            visibleCharts[opt.key] ? 'text-primary-700 bg-primary-50/60' : 'text-warm-500 hover:bg-warm-50'
                          }`}>
                          <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${
                            visibleCharts[opt.key] ? 'border-primary-500 bg-primary-500' : 'border-warm-300'
                          }`}>
                            {visibleCharts[opt.key] && <span className="text-white text-[8px] font-bold">✓</span>}
                          </div>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {hasPermission('dropscan.reportes', 'exportar') && (
                  <button onClick={handleExport} disabled={!porDia.length || isExporting}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-success-50 text-success-700 hover:bg-success-100 rounded-xl transition-colors border border-success-200 disabled:opacity-50">
                    {isExporting ? <div className="w-3.5 h-3.5 border-2 border-success-600 border-t-transparent rounded-full animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {t('common.export')}
                  </button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-warm-100">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setReportTab(tab.id)}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  reportTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-warm-400 hover:text-warm-600'
                }`}>
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <LoadingSpinner text={t('common.loading')} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={reportTab}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-5"
              >
                {/* ── TAB: Resumen ── */}
                {reportTab === 'resumen' && (
                  <>
                    {/* Stat cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {statCards.map((stat, i) => (
                        <motion.div key={stat.label}
                          className="card-interactive p-5 flex items-center gap-4 group"
                          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06, duration: 0.35 }}>
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
                    {activeCharts.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
                        {visibleCharts.dailyGuides && porDia.length > 0 && (
                          <div className={`card p-4 ${getColSpan('dailyGuides')}`}>
                            <h3 className="text-xs font-semibold text-warm-600 mb-2">{t('reports.dailyTrend')}</h3>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={porDia} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="fecha" tick={{ fontSize: 9 }} tickFormatter={fmtDateString} />
                                <YAxis tick={{ fontSize: 9 }} />
                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} labelFormatter={fmtDate} />
                                <Bar dataKey="guias" fill="#8b5cf6" radius={[3, 3, 0, 0]} name={t('dashboard.guides')} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {visibleCharts.avgTime && porDia.some(d => d.tiempo_promedio_min > 0) && (
                          <div className={`card p-4 ${getColSpan('avgTime')}`}>
                            <h3 className="text-xs font-semibold text-warm-600 mb-2">{t('reports.avgTime')}</h3>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={porDia.filter(d => d.tiempo_promedio_min > 0)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="fecha" tick={{ fontSize: 9 }} tickFormatter={fmtDateString} />
                                <YAxis tick={{ fontSize: 9 }} unit="m" />
                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                  labelFormatter={fmtDate} formatter={v => [`${v} min`, t('reports.avgTime')]} />
                                <Bar dataKey="tiempo_promedio_min" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Tiempo (min)" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {visibleCharts.hourlyProd && (
                          <div className={`card p-4 ${getColSpan('hourlyProd')}`}>
                            <h3 className="text-xs font-semibold text-warm-600 mb-1">{t('reports.hourlyProductivity')}</h3>
                            <p className="text-[10px] text-warm-400 mb-2">{t('reports.hourlyProductivityDesc')}</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <AreaChart data={porHora} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="horaGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="hora" tick={{ fontSize: 9 }} tickFormatter={h => `${String(h).padStart(2, '0')}:00`} interval={1} />
                                <YAxis tick={{ fontSize: 9 }} />
                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                  labelFormatter={h => `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00 hrs`}
                                  formatter={v => [v, t('dashboard.guides')]} />
                                <Area type="monotone" dataKey="cantidad" stroke="#8b5cf6" strokeWidth={2} fill="url(#horaGrad)" dot={false} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {visibleCharts.byEmpresa && porEmpresa.length > 0 && (
                          <div className={`card p-4 ${getColSpan('byEmpresa')}`}>
                            <h3 className="text-xs font-semibold text-warm-600 mb-2">{t('reports.byCompany')}</h3>
                            <ResponsiveContainer width="100%" height={200}>
                              <PieChart>
                                <Pie data={porEmpresa} dataKey="guias" nameKey="empresa" cx="50%" cy="45%" innerRadius={48} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                                  {porEmpresa.map((e, i) => <Cell key={e.empresa} fill={e.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={(v, n) => [`${v} guías`, n]} />
                                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ fontSize: 10, color: '#64748b' }}>{v}</span>} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {visibleCharts.byCanal && porCanal.length > 0 && (
                          <div className={`card p-4 ${getColSpan('byCanal')}`}>
                            <h3 className="text-xs font-semibold text-warm-600 mb-2">{t('reports.byChannel')}</h3>
                            <ResponsiveContainer width="100%" height={200}>
                              <PieChart>
                                <Pie data={porCanal} dataKey="guias" nameKey="canal" cx="50%" cy="45%" innerRadius={48} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                                  {porCanal.map((c, i) => <Cell key={c.canal} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={(v, n) => [`${v} guías`, n]} />
                                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ fontSize: 10, color: '#64748b' }}>{v}</span>} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {visibleCharts.byEscaneador && porEscaneador.length > 0 && (
                          <div className={`card p-4 ${getColSpan('byEscaneador')}`}>
                            <h3 className="text-xs font-semibold text-warm-600 mb-2">{t('reports.byScanner')}</h3>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={porEscaneador} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 9 }} />
                                <YAxis type="category" dataKey="escaneador" tick={{ fontSize: 9 }} width={90} />
                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={v => [`${v} guías`, 'Guías']} />
                                <Bar dataKey="guias" fill="#10b981" radius={[0, 3, 3, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {visibleCharts.fepFolios && foliosPorDia.length > 0 && (
                          <div className={`card p-4 ${getColSpan('fepFolios')}`}>
                            <h3 className="text-xs font-semibold text-warm-600 mb-2">Folios por día</h3>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={foliosPorDia} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="fecha" tick={{ fontSize: 9 }} tickFormatter={fmtDateString} />
                                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} labelFormatter={fmtDate} formatter={v => [v, 'Folios']} />
                                <Bar dataKey="cantidad" fill="#6366f1" radius={[3, 3, 0, 0]} name="Folios" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB: Detalle ── */}
                {reportTab === 'tablas' && (
                  <div className="space-y-5">
                    {/* Per-escaneador */}
                    {porEscaneador.length > 0 && (
                      <div className="card overflow-hidden">
                        <div className="px-5 py-3 border-b border-warm-100/60 bg-gradient-to-r from-warm-50 to-primary-50/40">
                          <h3 className="text-sm font-semibold text-warm-700 flex items-center gap-2">
                            <User className="w-4 h-4 text-warm-400" /> {t('reports.byScanner')}
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gradient-to-r from-warm-50 to-primary-50/40 border-b border-warm-200">
                                <th className="text-left px-4 py-3 font-bold text-warm-600">{t('reports.scanner')}</th>
                                <th className="text-center px-4 py-3 font-bold text-warm-600">{t('dashboard.pallets')}</th>
                                <th className="text-center px-4 py-3 font-bold text-warm-600">{t('dashboard.guides')}</th>
                                <th className="px-4 py-3 font-bold text-warm-600 w-40">{t('reports.performance')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {porEscaneador.map((e, i) => {
                                const maxGuias = porEscaneador[0]?.guias || 1
                                return (
                                  <tr key={e.escaneador || i} className="hover:bg-primary-50/20 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-warm-700">{e.escaneador}</td>
                                    <td className="px-4 py-3 text-center text-warm-600">{e.tarimas}</td>
                                    <td className="px-4 py-3 text-center font-bold text-warm-700">{e.guias}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-success-400 rounded-full" style={{ width: `${(e.guias / maxGuias) * 100}%` }} />
                                        </div>
                                        <span className="text-[10px] text-warm-400 w-8 text-right">{Math.round((e.guias / maxGuias) * 100)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Daily detail */}
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
                                <th className="text-center px-4 py-3 font-bold text-warm-600">{t('reports.folios')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {porDia.map(d => (
                                <tr key={d.fecha} className="hover:bg-primary-50/20 transition-colors">
                                  <td className="px-4 py-3 text-warm-700">{fmtDateStringShort(d.fecha)}</td>
                                  <td className="px-4 py-3 text-center text-warm-600">{d.tarimas}</td>
                                  <td className="px-4 py-3 text-center text-success-600 font-semibold">{d.completadas}</td>
                                  <td className="px-4 py-3 text-center font-bold text-warm-700">{d.guias}</td>
                                  <td className="px-4 py-3 text-center text-warm-500">{d.tiempo_promedio_min > 0 ? `${d.tiempo_promedio_min} min` : '—'}</td>
                                  <td className="px-4 py-3 text-center font-semibold text-indigo-600">{foliosByDay[d.fecha] || '—'}</td>
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
                                <td className="px-4 py-3 text-center text-indigo-600">{totalFoliosPeriodo || '—'}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  )
}
