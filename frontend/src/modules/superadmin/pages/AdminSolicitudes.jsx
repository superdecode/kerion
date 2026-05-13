import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Search, Clock, Phone, Mail, Globe, Building2, RotateCcw, Calendar, X } from 'lucide-react'
import adminApi from '../services/adminApi'

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

function fmtDateTimeFull(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZoneName: 'short',
  }).format(new Date(iso))
}

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

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-gray-500 text-xs">{label}</p>
        <p className="text-white text-sm break-all">{value}</p>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
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

function RenewalRejectModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!reason.trim()) return setError('El motivo es requerido')
    setLoading(true)
    try {
      await adminApi.patch(`/signup-requests/${request.id}/status`, { status: 'rejected', reason })
      onDone()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-white font-semibold mb-1">Rechazar renovacion</h3>
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium"
          >
            {loading ? 'Guardando...' : 'Rechazar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RequestDetailModal({ r, onClose, onRefresh }) {
  const [modal, setModal] = useState(null)
  const [renewalLoading, setRenewalLoading] = useState(false)
  const isRenewal = r.request_type === 'renewal'

  async function markRenewalApproved() {
    setRenewalLoading(true)
    try {
      await adminApi.patch(`/signup-requests/${r.id}/status`, { status: 'approved' })
      onRefresh()
      onClose()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al aprobar renovacion')
    } finally {
      setRenewalLoading(false)
    }
  }

  return (
    <>
      {modal === 'approve' && (
        <ApproveModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); onClose() }} />
      )}
      {modal === 'reject' && (
        <RejectModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); onClose() }} />
      )}
      {modal === 'renewalReject' && (
        <RenewalRejectModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); onClose() }} />
      )}

      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                isRenewal
                  ? 'bg-purple-500/15 border border-purple-500/25 text-purple-400'
                  : 'bg-amber-500/15 border border-amber-500/25 text-amber-400'
              }`}>
                {r.organization_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-base">{r.organization_name}</h3>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <TypeBadge requestType={r.request_type} />
                  <StatusBadge status={r.status} />
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors ml-4 flex-shrink-0 p-1 rounded-lg hover:bg-gray-800">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Contact info */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Informacion de contacto</p>
              <div className="grid grid-cols-2 gap-3">
                {r.contact_name && <Field icon={Building2} label="Contacto" value={r.contact_name} />}
                <Field icon={Mail} label="Email" value={r.contact_email} />
                <Field icon={Phone} label="Telefono" value={r.contact_phone || '—'} />
                <Field icon={Globe} label="Pais" value={r.country || '—'} />
              </div>
            </div>

            {/* Request details */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Detalles de solicitud</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field icon={Clock} label="Fecha y hora (con zona horaria)" value={fmtDateTimeFull(r.created_at)} />
                </div>
                {r.volume && <Field icon={Clock} label="Volumen estimado" value={r.volume} />}
                {isRenewal && r.reviewed_by && <Field icon={Building2} label="Atendido por" value={r.reviewed_by} />}
                {r.reviewed_at && (
                  <div className="col-span-2">
                    <Field icon={Clock} label="Revisado el" value={fmtDateTimeFull(r.reviewed_at)} />
                  </div>
                )}
              </div>
            </div>

            {/* Message */}
            {r.message && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Mensaje del solicitante</p>
                <div className="bg-gray-800/50 rounded-xl p-3 text-sm text-gray-300 border border-gray-700/40 leading-relaxed">
                  {r.message}
                </div>
              </div>
            )}

            {/* Renewal note */}
            {isRenewal && r.status === 'pending' && (
              <div className="flex items-center gap-2 p-3 bg-purple-950/30 border border-purple-800/30 rounded-xl text-sm text-purple-300">
                <RotateCcw className="w-4 h-4 flex-shrink-0" />
                Solicitud de renovacion — contactar al cliente para procesar el pago antes de aprobar.
              </div>
            )}

            {/* Rejection reason */}
            {r.rejected_reason && (
              <div className="p-3 bg-red-950/20 border border-red-800/30 rounded-xl text-sm text-red-300">
                <p className="text-red-400 text-xs font-medium mb-1">Motivo de rechazo</p>
                {r.rejected_reason}
              </div>
            )}
          </div>

          {/* Footer actions — only for pending */}
          {r.status === 'pending' && (
            <div className="flex gap-3 p-6 pt-0 border-t border-gray-800 flex-shrink-0">
              {!isRenewal ? (
                <>
                  <button
                    onClick={() => setModal('reject')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-950/40 hover:bg-red-950/70 border border-red-800/40 text-red-300 text-sm rounded-lg transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Rechazar
                  </button>
                  <button
                    onClick={() => setModal('approve')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors font-medium ml-auto"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Aprobar y provisionar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setModal('renewalReject')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-950/40 hover:bg-red-950/70 border border-red-800/40 text-red-300 text-sm rounded-lg transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Rechazar
                  </button>
                  <button
                    onClick={markRenewalApproved}
                    disabled={renewalLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium ml-auto"
                  >
                    {renewalLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Atender renovacion
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function RequestRow({ r, onRefresh }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const [renewalLoading, setRenewalLoading] = useState(false)
  const isRenewal = r.request_type === 'renewal'

  async function markRenewalApproved() {
    setRenewalLoading(true)
    try {
      await adminApi.patch(`/signup-requests/${r.id}/status`, { status: 'approved' })
      onRefresh()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al aprobar renovacion')
    } finally {
      setRenewalLoading(false)
    }
  }

  return (
    <>
      {detailOpen && (
        <RequestDetailModal r={r} onClose={() => setDetailOpen(false)} onRefresh={onRefresh} />
      )}
      {modal === 'approve' && (
        <ApproveModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh() }} />
      )}
      {modal === 'reject' && (
        <RejectModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh() }} />
      )}
      {modal === 'renewalReject' && (
        <RenewalRejectModal request={r} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh() }} />
      )}

      <tr className={`border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${isRenewal ? 'border-l-2 border-l-purple-600' : ''}`}>
        <td className="py-3.5 px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs ${
              isRenewal
                ? 'bg-purple-500/15 border border-purple-500/25 text-purple-400'
                : 'bg-amber-500/15 border border-amber-500/25 text-amber-400'
            }`}>
              {r.organization_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-white font-medium text-sm truncate">{r.organization_name}</p>
              <TypeBadge requestType={r.request_type} />
            </div>
          </div>
        </td>
        <td className="py-3.5 px-4">
          <p className="text-gray-300 text-sm">{r.contact_email}</p>
          {r.contact_phone && <p className="text-gray-500 text-xs mt-0.5">{r.contact_phone}</p>}
        </td>
        <td className="py-3.5 px-4 whitespace-nowrap">
          <p className="text-gray-300 text-sm">{fmtDateTime(r.created_at)}</p>
        </td>
        <td className="py-3.5 px-4">
          <StatusBadge status={r.status} />
        </td>
        <td className="py-3.5 px-4">
          <div className="flex items-center gap-2">
            {r.status === 'pending' && !isRenewal && (
              <>
                <button
                  onClick={() => setModal('approve')}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors font-medium"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar
                </button>
                <button
                  onClick={() => setModal('reject')}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-950/40 hover:bg-red-950/70 border border-red-800/40 text-red-300 text-xs rounded-lg transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Rechazar
                </button>
              </>
            )}
            {r.status === 'pending' && isRenewal && (
              <>
                <button
                  onClick={markRenewalApproved}
                  disabled={renewalLoading}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs rounded-lg transition-colors font-medium"
                >
                  {renewalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Atender
                </button>
                <button
                  onClick={() => setModal('renewalReject')}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-950/40 hover:bg-red-950/70 border border-red-800/40 text-red-300 text-xs rounded-lg transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Rechazar
                </button>
              </>
            )}
          </div>
        </td>
        <td className="py-3.5 px-3 text-right">
          <button
            onClick={() => setDetailOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-xs rounded-lg transition-colors whitespace-nowrap"
          >
            Ver detalle
          </button>
        </td>
      </tr>
    </>
  )
}

const STATUS_FILTERS = ['', 'pending', 'approved', 'rejected']
const STATUS_LABELS = { '': 'Todas', pending: 'Pendientes', approved: 'Aprobadas', rejected: 'Rechazadas' }
const PAGE_SIZES = [10, 15, 25, 50]
const DEFAULT_PAGE_SIZE = 15

export default function AdminSolicitudes() {
  const [requests, setRequests] = useState([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    const url = statusFilter ? `/signup-requests?status=${statusFilter}` : '/signup-requests'
    adminApi.get(url)
      .then(r => setRequests(r.data.data))
      .catch(() => setError('Error cargando solicitudes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])
  useEffect(() => { setPage(1) }, [search, statusFilter, typeFilter, dateFrom, dateTo, pageSize])

  const filtered = requests.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      if (!r.organization_name?.toLowerCase().includes(q) && !r.contact_email?.toLowerCase().includes(q)) return false
    }
    if (typeFilter === 'new' && r.request_type !== 'new' && r.request_type !== null && r.request_type !== undefined) return false
    if (typeFilter === 'renewal' && r.request_type !== 'renewal') return false
    if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false
    if (dateTo && new Date(r.created_at) > new Date(dateTo + 'T23:59:59')) return false
    return true
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o email..."
              className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-xs outline-none bg-transparent text-gray-300 w-[108px]"
            />
            <span className="text-gray-600 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-xs outline-none bg-transparent text-gray-300 w-[108px]"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">Todos los tipos</option>
            <option value="new">Nuevos</option>
            <option value="renewal">Renovaciones</option>
          </select>
          {(typeFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setTypeFilter(''); setDateFrom(''); setDateTo('') }}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-0.5 w-fit">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {STATUS_LABELS[s]}
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
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-800 bg-gray-900/80">
                <tr>
                  <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Organizacion</th>
                  <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">Hora de solicitud</th>
                  <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Acciones</th>
                  <th className="py-3 px-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => <RequestRow key={r.id} r={r} onRefresh={load} />)}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              {filtered.length === 0 ? '0' : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)}`} de {filtered.length} solicitudes
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
        </>
      )}
    </div>
  )
}
