import { useEffect, useState } from 'react'
import { RefreshCw, Bell, CheckCircle2, XCircle, Clock, AlertCircle, RotateCcw, Search, Trash2, Check } from 'lucide-react'
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
  trial_started:         'Inicio de trial',
  trial_expiring_soon:   'Trial por vencer',
  trial_expired:         'Trial vencido',
  subscription_active:   'Suscripcion activa',
  subscription_activated:'Suscripcion activada',
  request_approved:      'Solicitud aprobada',
  request_rejected:      'Solicitud rechazada',
  payment_reminder:      'Recordatorio de pago',
  welcome:               'Bienvenida',
  welcome_email:         'Bienvenida',
  password_reset:        'Reset de contraseña',
  provisioning_failed:   'Error de provisioning',
}

const FILTERS = ['', 'pending', 'sent', 'failed']
const FILTER_LABELS = { '': 'Todas', pending: 'Pendientes', sent: 'Enviadas', failed: 'Fallidas' }
const PAGE_SIZES = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

export default function AdminNotificaciones() {
  const [notifs, setNotifs] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [markingId, setMarkingId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setSelected(new Set())
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
  useEffect(() => { setPage(1); setSelected(new Set()) }, [search, statusFilter, pageSize])

  async function retry(id) {
    setRetryingId(id)
    try {
      await adminApi.post(`/notifications/${id}/retry`)
      load()
    } finally {
      setRetryingId(null)
    }
  }

  async function deleteOne(id) {
    setDeletingId(id)
    try {
      await adminApi.delete(`/notifications/${id}`)
      setNotifs(prev => prev.filter(n => n.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  async function markStatus(id, status) {
    setMarkingId(id)
    try {
      await adminApi.patch(`/notifications/${id}/status`, { status })
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, status } : n))
    } finally {
      setMarkingId(null)
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBulkDeleting(true)
    try {
      await adminApi.delete('/notifications', { data: { ids } })
      setNotifs(prev => prev.filter(n => !selected.has(n.id)))
      setSelected(new Set())
    } finally {
      setBulkDeleting(false)
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
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (paginated.every(n => selected.has(n.id))) {
      setSelected(prev => {
        const next = new Set(prev)
        paginated.forEach(n => next.delete(n.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        paginated.forEach(n => next.add(n.id))
        return next
      })
    }
  }

  const allPageSelected = paginated.length > 0 && paginated.every(n => selected.has(n.id))

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
          { label: 'Enviadas',   count: notifs.filter(n => n.status === 'sent').length,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: 'Pendientes', count: notifs.filter(n => n.status === 'pending').length,  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
          { label: 'Fallidas',   count: failedCount,                                         color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
        ].map(({ label, count, color, bg, border }) => (
          <div key={label} className={`rounded-xl border p-4 ${bg} ${border}`}>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </div>

      {/* Filters: search + status pills on right */}
      <div className="flex items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por email o plantilla..."
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-0.5 w-fit">
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

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-950/30 border border-blue-700/40 rounded-xl px-4 py-3">
          <span className="text-blue-300 text-sm font-medium">{selected.size} seleccionadas</span>
          <button
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 text-red-300 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Eliminar seleccionadas
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Cancelar selección
          </button>
        </div>
      )}

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
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Destinatario</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider hidden md:table-cell">Plantilla</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider hidden lg:table-cell">Fecha</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider hidden xl:table-cell">Intentos</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {paginated.map(n => (
                <tr key={n.id} className={`hover:bg-gray-800/30 transition-colors ${selected.has(n.id) ? 'bg-blue-950/20' : ''}`}>
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
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
                    <div className="flex items-center gap-1.5 justify-end">
                      {n.status === 'failed' && (
                        <button
                          onClick={() => retry(n.id)}
                          disabled={retryingId === n.id}
                          title="Reintentar"
                          className="flex items-center gap-1 text-xs px-2 py-1.5 bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/25 text-amber-300 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className={`w-3 h-3 ${retryingId === n.id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      {n.status === 'pending' && (
                        <button
                          onClick={() => markStatus(n.id, 'sent')}
                          disabled={markingId === n.id}
                          title="Marcar como enviado"
                          className="flex items-center gap-1 text-xs px-2 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/25 text-emerald-300 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Check className={`w-3 h-3 ${markingId === n.id ? 'opacity-50' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteOne(n.id)}
                        disabled={deletingId === n.id}
                        title="Eliminar"
                        className="flex items-center gap-1 text-xs px-2 py-1.5 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === n.id
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — always visible when data exists */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-500">
            {filtered.length === 0 ? '0' : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)}`} de {filtered.length} notificaciones
          </p>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500 transition-colors"
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / pág</option>)}
            </select>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-40 text-xs transition-colors"
            >
              Anterior
            </button>
            <span className="text-gray-500 text-xs">Pág. {safePage} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-40 text-xs transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
