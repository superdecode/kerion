import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Search, ChevronDown, ChevronUp, Clock, Phone, Mail, Globe, Building2, RotateCcw } from 'lucide-react'
import adminApi from '../services/adminApi'

const STATUS_CFG = {
  pending:  { label: 'Pendiente', bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25' },
  approved: { label: 'Aprobada',  bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
  rejected: { label: 'Rechazada', bg: 'bg-red-500/15',     text: 'text-red-300',     border: 'border-red-500/25' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function RejectModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleReject() {
    if (!reason.trim()) return setError('El motivo es requerido')
    setLoading(true)
    try {
      await adminApi.post(`/signup-requests/${request.id}/reject`, { reason })
      onDone()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al rechazar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-white font-semibold mb-1">Rechazar solicitud</h3>
        <p className="text-gray-400 text-sm mb-4">{request.organization_name} — {request.contact_email}</p>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Motivo del rechazo..."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-red-500 mb-4 transition-colors"
          autoFocus
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium"
          >
            {loading ? 'Rechazando...' : 'Rechazar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ApproveModal({ request, onClose, onDone }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handleApprove() {
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.post(`/signup-requests/${request.id}/approve`)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error en provisioning')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {!result ? (
          <>
            <h3 className="text-white font-semibold mb-1">Aprobar solicitud</h3>
            <p className="text-gray-400 text-sm mb-2">{request.organization_name}</p>
            <p className="text-gray-500 text-xs mb-5">
              Se creara el tenant, la base de datos y el usuario administrador. Se enviara el email de bienvenida a {request.contact_email}.
            </p>
            {error && (
              <div className="flex items-start gap-2 bg-red-950/30 border border-red-800/40 rounded-lg p-3 mb-4 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium"
              >
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {loading ? 'Provisionando...' : 'Aprobar y provisionar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-white font-semibold">Tenant provisionado</h3>
              <p className="text-gray-400 text-sm mt-1">El acceso fue enviado al cliente</p>
            </div>
            {result.admin_email && (
              <div className="bg-gray-800 rounded-xl p-3 mb-5 text-sm space-y-1">
                <p className="text-gray-400">Email admin: <span className="text-white">{result.admin_email}</span></p>
                {result.tenant_id && <p className="text-gray-400">Tenant ID: <span className="text-white font-mono text-xs">{result.tenant_id}</span></p>}
              </div>
            )}
            <button onClick={onDone} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors font-medium">
              Listo
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function TypeBadge({ requestType }) {
  if (requestType === 'renewal') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-500/15 text-purple-300 border-purple-500/25">
        <RotateCcw className="w-3 h-3" />
        Renovacion
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-500/10 text-blue-400 border-blue-500/20">
      Nuevo
    </span>
  )
}

function RequestCard({ r, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState(null)
  const age = Math.floor((Date.now() - new Date(r.created_at)) / 86400000)
  const isRenewal = r.request_type === 'renewal'

  return (
    <>
      {modal === 'approve' && (
        <ApproveModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh() }} />
      )}
      {modal === 'reject' && (
        <RejectModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh() }} />
      )}

      <div className={`bg-gray-900 border rounded-xl overflow-hidden transition-all ${isRenewal ? 'border-purple-800/40' : 'border-gray-800'}`}>
        <div
          className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-800/30 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
              isRenewal
                ? 'bg-purple-500/15 border border-purple-500/25 text-purple-400'
                : 'bg-amber-500/15 border border-amber-500/25 text-amber-400'
            }`}>
              {r.organization_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-medium truncate">{r.organization_name}</p>
                <TypeBadge requestType={r.request_type} />
              </div>
              <p className="text-gray-400 text-xs truncate">{r.contact_email} · {age === 0 ? 'hoy' : `hace ${age}d`}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <StatusBadge status={r.status} />
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </div>
        </div>

        {expanded && (
          <div className="px-5 pb-5 border-t border-gray-800">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 mb-4">
              {[
                { icon: Building2, label: 'Organizacion', value: r.organization_name },
                { icon: Mail,      label: 'Email',        value: r.contact_email },
                { icon: Phone,     label: 'Telefono',     value: r.contact_phone || '—' },
                { icon: Globe,     label: 'Pais',         value: r.country || '—' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2">
                  <Icon className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs">{label}</p>
                    <p className="text-white text-sm">{value}</p>
                  </div>
                </div>
              ))}
            </div>
            {r.volume && (
              <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-500">Volumen:</span>
                <span className="text-gray-200">{r.volume}</span>
              </div>
            )}
            {r.message && (
              <div className="bg-gray-800/50 rounded-lg p-3 mb-4 text-sm text-gray-300 border border-gray-700/40">
                <p className="text-gray-500 text-xs mb-1">Mensaje del solicitante</p>
                {r.message}
              </div>
            )}

            {isRenewal ? (
              <div className="flex items-center gap-2 p-3 bg-purple-950/30 border border-purple-800/30 rounded-lg text-sm text-purple-300">
                <RotateCcw className="w-4 h-4 flex-shrink-0" />
                Solicitud de renovacion — contactar al cliente para procesar el pago.
              </div>
            ) : r.status === 'pending' ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setModal('approve')}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors font-medium"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Aprobar
                </button>
                <button
                  onClick={() => setModal('reject')}
                  className="flex items-center gap-2 px-4 py-2 bg-red-950/40 hover:bg-red-950/70 border border-red-800/40 text-red-300 text-sm rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Rechazar
                </button>
              </div>
            ) : null}

            {r.rejected_reason && (
              <div className="mt-3 p-3 bg-red-950/20 border border-red-800/30 rounded-lg text-sm text-red-300">
                <p className="text-red-400 text-xs font-medium mb-1">Motivo de rechazo</p>
                {r.rejected_reason}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

const FILTERS = ['', 'pending', 'approved', 'rejected']
const FILTER_LABELS = { '': 'Todas', pending: 'Pendientes', approved: 'Aprobadas', rejected: 'Rechazadas' }

export default function AdminSolicitudes() {
  const [requests, setRequests] = useState([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    const url = statusFilter ? `/signup-requests?status=${statusFilter}` : '/signup-requests?status=pending'
    adminApi.get(url)
      .then(r => setRequests(r.data.data))
      .catch(() => setError('Error cargando solicitudes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const filtered = requests.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.organization_name?.toLowerCase().includes(q) || r.contact_email?.toLowerCase().includes(q)
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Solicitudes</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} solicitudes encontradas</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700">
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
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
              {s === 'pending' && statusFilter !== 'pending' && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-800/40 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando solicitudes...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Sin solicitudes</p>
          <p className="text-gray-600 text-sm mt-1">No hay solicitudes con ese filtro</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => <RequestCard key={r.id} r={r} onRefresh={load} />)}
        </div>
      )}
    </div>
  )
}
