import { useEffect, useState } from 'react'
import { RefreshCw, Bell, CheckCircle2, XCircle, Clock, AlertCircle, RotateCcw, Search } from 'lucide-react'
import adminApi from '../services/adminApi'

const STATUS_CFG = {
  pending: { label: 'Pendiente', bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25',   icon: Clock },
  sent:    { label: 'Enviado',   bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25', icon: CheckCircle2 },
  failed:  { label: 'Fallido',   bg: 'bg-red-500/15',     text: 'text-red-300',     border: 'border-red-500/25',     icon: XCircle },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

const TEMPLATE_LABELS = {
  trial_started:       'Inicio de trial',
  trial_expiring_soon: 'Trial por vencer',
  trial_expired:       'Trial vencido',
  subscription_active: 'Suscripcion activa',
  request_approved:    'Solicitud aprobada',
  request_rejected:    'Solicitud rechazada',
  payment_reminder:    'Recordatorio de pago',
  welcome:             'Bienvenida',
}

const FILTERS = ['', 'pending', 'sent', 'failed']
const FILTER_LABELS = { '': 'Todas', pending: 'Pendientes', sent: 'Enviadas', failed: 'Fallidas' }

export default function AdminNotificaciones() {
  const [notifs, setNotifs] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const url = statusFilter ? `/notifications?status=${statusFilter}` : '/notifications'
      const res = await adminApi.get(url)
      setNotifs(res.data.data)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  async function retry(id) {
    setRetryingId(id)
    try {
      await adminApi.post(`/notifications/${id}/retry`)
      load()
    } finally {
      setRetryingId(null)
    }
  }

  const filtered = notifs.filter(n => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      n.recipient_email?.toLowerCase().includes(q) ||
      n.template_code?.toLowerCase().includes(q)
    )
  })

  const failedCount = notifs.filter(n => n.status === 'failed').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Notificaciones</h1>
          <p className="text-gray-500 text-sm mt-0.5">Log de emails del sistema</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700">
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Enviadas', count: notifs.filter(n => n.status === 'sent').length, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: 'Pendientes', count: notifs.filter(n => n.status === 'pending').length, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
          { label: 'Fallidas', count: failedCount, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
        ].map(({ label, count, color, bg, border }) => (
          <div key={label} className={`rounded-xl border p-4 ${bg} ${border}`}>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por email o plantilla..."
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-0.5">
          {FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {FILTER_LABELS[s]}
              {s === 'failed' && statusFilter !== 'failed' && failedCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {failedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Sin notificaciones</p>
          <p className="text-gray-600 text-sm mt-1">No hay registros con ese filtro</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Destinatario</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Plantilla</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Estado</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Fecha</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden xl:table-cell">Intentos</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filtered.map(n => (
                <tr key={n.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-white text-sm">{n.recipient_email}</p>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <span className="text-gray-400 text-xs bg-gray-800 px-2 py-1 rounded-md">
                      {TEMPLATE_LABELS[n.template_code] || n.template_code}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={n.status} />
                  </td>
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <span className="text-gray-500 text-xs">
                      {n.sent_at
                        ? new Date(n.sent_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : new Date(n.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 hidden xl:table-cell">
                    <span className="text-gray-500 text-xs">{n.attempts ?? 0}</span>
                    {n.last_error && (
                      <p className="text-red-400 text-xs truncate max-w-[180px] mt-0.5">{n.last_error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {n.status === 'failed' && (
                      <button
                        onClick={() => retry(n.id)}
                        disabled={retryingId === n.id}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/25 text-amber-300 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className={`w-3 h-3 ${retryingId === n.id ? 'animate-spin' : ''}`} />
                        Reintentar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
