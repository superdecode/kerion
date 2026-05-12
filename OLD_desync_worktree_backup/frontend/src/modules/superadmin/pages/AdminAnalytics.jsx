import { useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, MousePointerClick, FileText, Users, BarChart3, Clock } from 'lucide-react'
import adminApi from '../services/adminApi'

const EVENT_LABELS = {
  page_visit:    'Visita',
  cta_click:     'CTA click',
  plan_select:   'Plan seleccionado',
  billing_toggle: 'Toggle facturacion',
  form_submit:   'Formulario enviado',
}

const PLAN_LABELS = { basic: 'Basico', pro: 'Profesional', custom: 'Personalizado' }

function StatCard({ icon: Icon, label, value, sub, color = 'text-blue-400' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
    </div>
  )
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await adminApi.get('/analytics/landing')
      setData(res.data.data)
    } catch { /* noop */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analiticas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Desempeno de la landing page</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700">
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando...</span>
          </div>
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-gray-500">Sin datos disponibles</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Users} label="Visitas totales" value={data.total_visits.toLocaleString()} sub={`${data.visits_7d} en 7d`} color="text-blue-400" />
            <StatCard icon={FileText} label="Solicitudes" value={data.total_submissions.toLocaleString()} sub={`${data.submissions_7d} en 7d`} color="text-emerald-400" />
            <StatCard icon={TrendingUp} label="Conversion" value={`${data.conversion_rate}%`} sub="visitas → solicitud" color="text-purple-400" />
            <StatCard icon={MousePointerClick} label="CTA clicks" value={data.total_cta_clicks.toLocaleString()} color="text-amber-400" />
            <StatCard icon={BarChart3} label="Plan seleccionado" value={data.total_plan_selects.toLocaleString()} color="text-cyan-400" />
            <StatCard icon={TrendingUp} label="Visitas 7d" value={data.visits_7d.toLocaleString()} color="text-rose-400" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Plan stats */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                Planes seleccionados
              </h2>
              {data.plan_stats.length === 0 ? (
                <p className="text-gray-500 text-sm">Sin datos de planes aun</p>
              ) : (
                <div className="space-y-3">
                  {data.plan_stats.map(p => {
                    const total = data.plan_stats.reduce((s, x) => s + Number(x.count), 0)
                    const pct = total > 0 ? Math.round((Number(p.count) / total) * 100) : 0
                    return (
                      <div key={p.plan}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-300">{PLAN_LABELS[p.plan] || p.plan}</span>
                          <span className="text-gray-400">{Number(p.count).toLocaleString()} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Daily visits */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Visitas diarias (14 dias)
              </h2>
              {data.daily_visits.length === 0 ? (
                <p className="text-gray-500 text-sm">Sin visitas registradas aun</p>
              ) : (
                <div className="space-y-1.5">
                  {data.daily_visits.map(d => {
                    const max = Math.max(...data.daily_visits.map(x => Number(x.visits)))
                    const pct = max > 0 ? Math.round((Number(d.visits) / max) * 100) : 0
                    return (
                      <div key={d.date} className="flex items-center gap-3">
                        <span className="text-gray-500 text-xs w-24 flex-shrink-0">
                          {new Date(d.date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-gray-400 text-xs w-6 text-right">{d.visits}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent events */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Eventos recientes
            </h2>
            {data.recent_events.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin eventos registrados</p>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 pr-4">Evento</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 pr-4 hidden md:table-cell">Payload</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {data.recent_events.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-800/20 transition-colors">
                        <td className="py-2.5 pr-4">
                          <span className="text-gray-300 text-xs">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                        </td>
                        <td className="py-2.5 pr-4 hidden md:table-cell">
                          {e.payload && Object.keys(e.payload).length > 0 ? (
                            <span className="text-gray-500 text-xs font-mono">
                              {Object.entries(e.payload).map(([k, v]) => `${k}=${v}`).join(' ')}
                            </span>
                          ) : (
                            <span className="text-gray-700 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span className="text-gray-500 text-xs">
                            {new Date(e.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
