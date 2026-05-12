import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, TrendingUp, AlertCircle, Clock, CheckCircle2, XCircle,
  ArrowRight, RefreshCw, Database, BarChart3, Package, Users, ScanLine, FileStack
} from 'lucide-react'
import adminApi from '../services/adminApi'

const STAT_CFG = {
  trial:         { label: 'Trial activo',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: Clock },
  active:        { label: 'Suscripcion',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle2 },
  trial_expired: { label: 'Trial vencido',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: XCircle },
  total:         { label: 'Total tenants',  color: 'text-white',       bg: 'bg-gray-800/60',    border: 'border-gray-700',       icon: Building2 },
}

function StatCard({ stat, value }) {
  const { label, color, bg, border, icon: Icon } = STAT_CFG[stat]
  return (
    <div className={`rounded-xl border p-5 ${bg} ${border}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${bg} border ${border} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value ?? '-'}</p>
    </div>
  )
}

function UsageCard({ icon: Icon, label, value, sub, color = 'text-blue-400', border = 'border-gray-700' }) {
  return (
    <div className={`bg-gray-900 rounded-xl border ${border} p-4 flex items-center gap-4`}>
      <div className={`w-10 h-10 rounded-xl bg-gray-800 border ${border} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-white font-bold text-xl leading-none">{value}</p>
        {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function ConversionBar({ converted, total }) {
  const pct = total > 0 ? Math.round((converted / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">Ultimos 30 dias</span>
        <span className="text-white font-bold">{pct}%</span>
      </div>
      <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-gray-500 text-xs mt-2">{converted} convertidos de {total} trials</p>
    </div>
  )
}

const STATUS_ROW_CFG = {
  trial:         { bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/25' },
  active:        { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
  trial_expired: { bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25' },
  expired:       { bg: 'bg-orange-500/15',  text: 'text-orange-300',  border: 'border-orange-500/25' },
  suspended:     { bg: 'bg-red-500/15',     text: 'text-red-300',     border: 'border-red-500/25' },
}
const STATUS_LABELS_MAP = { trial: 'Trial', active: 'Activo', trial_expired: 'Vencido', expired: 'Expirado', suspended: 'Suspendido' }

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('es-MX')
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      adminApi.get('/dashboard'),
      adminApi.get('/usage-stats').catch(() => ({ data: null })),
    ])
      .then(([dashRes, usageRes]) => {
        setData(dashRes.data)
        setUsage(usageRes.data)
      })
      .catch(() => setError('Error cargando dashboard'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center gap-3 bg-red-950/30 border border-red-800/40 rounded-xl p-4">
      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
      <span className="text-red-300 text-sm">{error}</span>
      <button onClick={load} className="ml-auto text-red-400 hover:text-red-300 text-sm underline">Reintentar</button>
    </div>
  )

  const { stats, pending_requests, last_30d_conversion } = data
  const convTotal = Number(last_30d_conversion.converted) + Number(last_30d_conversion.not_converted)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Vista general del sistema Kirion</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700">
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* Tenant status cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard stat="trial"         value={stats.trial} />
        <StatCard stat="active"        value={stats.active} />
        <StatCard stat="trial_expired" value={stats.trial_expired} />
        <StatCard stat="total"         value={stats.total} />
      </div>

      {/* Usage stats */}
      {usage && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <h2 className="text-white font-semibold text-sm">Uso del sistema</h2>
            {usage.db_size && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2.5 py-1 rounded-full">
                <Database className="w-3 h-3" />
                Base de datos: {usage.db_size}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <UsageCard icon={ScanLine}  label="Guias totales"      value={fmt(usage.total_guias)}    sub={`+${fmt(usage.guias_last_30d)} este mes`} color="text-blue-400"    border="border-blue-500/20" />
            <UsageCard icon={Package}   label="Tarimas"            value={fmt(usage.total_tarimas)}   color="text-purple-400"  border="border-purple-500/20" />
            <UsageCard icon={FileStack} label="Folios entrega"     value={fmt(usage.total_folios)}    color="text-cyan-400"    border="border-cyan-500/20" />
            <UsageCard icon={Users}     label="Escaneadores activos" value={fmt(usage.active_scanners)} color="text-amber-400" border="border-amber-500/20" />
            <UsageCard icon={TrendingUp} label="Guias este mes"   value={fmt(usage.guias_last_30d)}   color="text-emerald-400" border="border-emerald-500/20" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversion */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <h2 className="text-white font-medium text-sm">Tasa de conversion</h2>
          </div>
          <ConversionBar converted={Number(last_30d_conversion.converted)} total={convTotal} />
        </div>

        {/* Quick links */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white font-medium text-sm mb-4">Accesos rapidos</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Todos los tenants',      to: '/super-admin/tenants',                   c: 'text-blue-400' },
              { label: 'Solicitudes pendientes', to: '/super-admin/solicitudes',               c: 'text-amber-400' },
              { label: 'Notificaciones',         to: '/super-admin/notificaciones',            c: 'text-purple-400' },
              { label: 'Tenants suspendidos',    to: '/super-admin/tenants?status=suspended',  c: 'text-red-400' },
            ].map(({ label, to, c }) => (
              <Link key={to} to={to} className="flex items-center justify-between p-3 bg-gray-800/60 hover:bg-gray-800 rounded-lg border border-gray-700/50 transition-colors group">
                <span className={`text-sm font-medium ${c}`}>{label}</span>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Top tenants by usage */}
      {usage?.top_tenants?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <h2 className="text-white font-medium text-sm">Top tenants por uso</h2>
          </div>
          <div className="divide-y divide-gray-800/60">
            {usage.top_tenants.map((t, i) => {
              const cfg = STATUS_ROW_CFG[t.status] || STATUS_ROW_CFG.trial
              const maxGuias = Number(usage.top_tenants[0]?.guias_total ?? 1)
              const pct = maxGuias > 0 ? Math.round((Number(t.guias_total) / maxGuias) * 100) : 0
              return (
                <div key={t.slug} className="flex items-center gap-4 px-5 py-3">
                  <span className="text-gray-600 text-xs font-mono w-4 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white text-sm font-medium truncate">{t.legal_name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {STATUS_LABELS_MAP[t.status] ?? t.status}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-bold">{fmt(t.guias_total)}</p>
                    <p className="text-gray-500 text-xs">+{fmt(t.guias_30d)} mes</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pending requests */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-medium text-sm">Solicitudes pendientes</h2>
            {pending_requests.length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full">{pending_requests.length}</span>
            )}
          </div>
          <Link to="/super-admin/solicitudes" className="text-blue-400 hover:text-blue-300 text-xs font-medium flex items-center gap-1">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="px-5">
          {pending_requests.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-gray-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-sm">Sin solicitudes pendientes</span>
            </div>
          ) : pending_requests.map(r => {
            const age = Math.floor((Date.now() - new Date(r.created_at)) / 86400000)
            return (
              <div key={r.id} className="flex items-center justify-between py-3 border-b border-gray-800/60 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-400 text-xs font-bold">{r.organization_name?.[0]?.toUpperCase() ?? '?'}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{r.organization_name}</p>
                    <p className="text-gray-400 text-xs truncate">{r.contact_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-gray-500 text-xs">{age === 0 ? 'hoy' : `hace ${age}d`}</span>
                  <Link to="/super-admin/solicitudes" className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
                    Revisar
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
