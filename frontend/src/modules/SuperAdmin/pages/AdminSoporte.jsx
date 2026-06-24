import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Clock, Search, ChevronLeft, ChevronRight, MessageSquare, CheckCircle2, Eye, X } from 'lucide-react'
import adminApi from '../services/adminApi'
import { fmtDateTimeMini } from '../../../core/utils/dateFormat'

const STATUS_CFG = {
  pending:   { label: 'Pendiente',  bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25' },
  reviewing: { label: 'Revisando',  bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/25' },
  resolved:  { label: 'Resuelto',   bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function DetailModal({ report, onClose, onSave }) {
  const [status, setStatus] = useState(report.status)
  const [notes, setNotes] = useState(report.admin_notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await adminApi.patch(`/bug-reports/${report.id}`, { status, admin_notes: notes })
      onSave(res.data.report)
      onClose()
    } catch {
      setError('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-semibold text-sm">Reporte de problema</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500 mb-0.5">Tenant</p>
              <p className="text-gray-200 font-medium">{report.tenant_name || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Usuario</p>
              <p className="text-gray-200 font-medium">{report.user_name || '-'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500 mb-0.5">Correo</p>
              <p className="text-gray-200">{report.user_email || '-'}</p>
            </div>
            {report.page_url && (
              <div className="col-span-2">
                <p className="text-gray-500 mb-0.5">Pagina</p>
                <p className="text-gray-400 font-mono text-[11px]">{report.page_url}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500 mb-0.5">Fecha</p>
              <p className="text-gray-300">{fmtDateTimeMini(report.created_at)}</p>
            </div>
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1.5">Descripcion</p>
            <div className="bg-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {report.description}
            </div>
          </div>

          <div>
            <label className="block text-gray-500 text-xs mb-1.5">Estado</label>
            <div className="flex gap-2">
              {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setStatus(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    status === key
                      ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                      : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-500 text-xs mb-1.5">Notas internas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Notas del equipo de soporte (no visibles al usuario)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const PAGE_SIZE = 50

export default function AdminSoporte() {
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE })
      if (filterStatus) params.set('status', filterStatus)
      const res = await adminApi.get(`/bug-reports?${params}`)
      setReports(res.data.reports)
      setTotal(res.data.total)
    } catch {
      // no-op
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus])

  useEffect(() => { load() }, [load])

  function handleSave(updated) {
    setReports(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  const filtered = search
    ? reports.filter(r =>
        r.description?.toLowerCase().includes(search.toLowerCase()) ||
        r.user_email?.toLowerCase().includes(search.toLowerCase()) ||
        r.tenant_name?.toLowerCase().includes(search.toLowerCase())
      )
    : reports

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      {selected && (
        <DetailModal
          report={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-bold">Soporte</h1>
          <p className="text-gray-400 text-sm mt-0.5">Reportes de problemas enviados por usuarios</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors border border-gray-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por descripcion, correo, tenant..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 w-64 transition-colors"
          />
        </div>

        <div className="flex gap-1.5">
          {[['', 'Todos'], ['pending', 'Pendiente'], ['reviewing', 'Revisando'], ['resolved', 'Resuelto']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => { setFilterStatus(val); setPage(1) }}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
                filterStatus === val
                  ? 'bg-blue-600/25 text-blue-300 border-blue-500/30'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <span className="text-gray-500 text-xs ml-auto">{total} reporte{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Tenant</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Usuario</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Descripcion</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Estado</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">Fecha</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-500 text-sm">
                  Cargando...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No hay reportes</p>
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr
                  key={r.id}
                  className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-300 text-xs font-medium">{r.tenant_name || '-'}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-200 text-xs font-medium">{r.user_name || '-'}</p>
                    <p className="text-gray-500 text-[11px]">{r.user_email || ''}</p>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-gray-300 text-xs line-clamp-2 leading-relaxed">{r.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {fmtDateTimeMini(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(r)}
                      className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded-lg hover:bg-blue-500/10"
                      title="Ver detalle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-gray-400 text-xs">
            Pagina {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
