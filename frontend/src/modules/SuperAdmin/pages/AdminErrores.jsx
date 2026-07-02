import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertOctagon, AlertTriangle, CheckCircle2, Clock, Copy, Eye, Filter,
  RefreshCw, Search, ServerCrash, ShieldAlert, X,
} from 'lucide-react'
import adminApi from '../services/adminApi'
import { fmtDateTimeMini } from '../../../core/utils/dateFormat'

const PAGE_SIZE = 50

const SEVERITY_CFG = {
  critical: { label: 'Critico', bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/30', icon: AlertOctagon },
  error:    { label: 'Error',   bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30', icon: AlertTriangle },
  warning:  { label: 'Aviso',   bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', icon: AlertTriangle },
  info:     { label: 'Info',    bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30', icon: Clock },
}

const STATUS_CFG = {
  open:      { label: 'Abierto',    bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/30' },
  reviewing: { label: 'Revisando',  bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30' },
  resolved:  { label: 'Resuelto',   bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  ignored:   { label: 'Ignorado',   bg: 'bg-gray-500/15', text: 'text-gray-300', border: 'border-gray-600' },
}

const SOURCE_LABELS = {
  frontend: 'Frontend',
  react: 'React',
  global: 'Global',
  api: 'API',
  backend: 'Backend',
}

function Badge({ cfg, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {children}
    </span>
  )
}

function SeverityBadge({ severity }) {
  const cfg = SEVERITY_CFG[severity] || SEVERITY_CFG.error
  const Icon = cfg.icon
  return <Badge cfg={cfg}><Icon className="h-3 w-3" /> {cfg.label}</Badge>
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.open
  return <Badge cfg={cfg}>{cfg.label}</Badge>
}

function StatTile({ icon: Icon, label, value, tone = 'blue', sub }) {
  const tones = {
    red: 'border-red-500/25 bg-red-950/20 text-red-300',
    orange: 'border-orange-500/25 bg-orange-950/20 text-orange-300',
    blue: 'border-blue-500/25 bg-blue-950/20 text-blue-300',
    emerald: 'border-emerald-500/25 bg-emerald-950/20 text-emerald-300',
  }
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{Number(value || 0).toLocaleString('es-MX')}</p>
          {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tones[tone] || tones.blue}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400 transition-colors hover:border-blue-500/40 hover:text-blue-300"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

function DetailModal({ event, onClose, onSaved }) {
  const [status, setStatus] = useState(event.status)
  const [notes, setNotes] = useState(event.admin_notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const technicalPayload = useMemo(() => JSON.stringify({
    id: event.id,
    tenant: event.tenant_name || event.tenant_slug || event.tenant_id,
    user: event.user_email,
    source: event.source,
    severity: event.severity,
    status: event.status,
    message: event.message,
    page_url: event.page_url,
    api_url: event.api_url,
    http_method: event.http_method,
    http_status: event.http_status,
    fingerprint: event.fingerprint,
    occurrences: event.occurrences,
    first_seen_at: event.first_seen_at,
    last_seen_at: event.last_seen_at,
    stack: event.stack,
    component_stack: event.component_stack,
    metadata: event.metadata,
  }, null, 2), [event])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await adminApi.patch(`/error-events/${event.id}`, { status, admin_notes: notes })
      onSaved(res.data.event)
      onClose()
    } catch {
      setError('No se pudo actualizar el evento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-800 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={event.severity} />
              <StatusBadge status={status} />
              <span className="rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-400">
                {SOURCE_LABELS[event.source] || event.source}
              </span>
            </div>
            <h3 className="truncate text-base font-semibold text-white">{event.message}</h3>
            <p className="mt-1 text-xs text-gray-500">
              {event.tenant_name || event.tenant_slug || 'Sin tenant'} · {event.occurrences || 1} ocurrencia(s) · ultima vez {fmtDateTimeMini(event.last_seen_at)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_340px]">
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Stack / evidencia</p>
                <CopyButton value={technicalPayload} />
              </div>
              <pre className="max-h-80 overflow-auto rounded-xl border border-gray-800 bg-black/35 p-4 text-xs leading-relaxed text-gray-300">
                {event.stack || event.component_stack || 'Sin stack capturado'}
              </pre>
            </div>

            {event.component_stack && event.stack && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Component stack</p>
                <pre className="max-h-52 overflow-auto rounded-xl border border-gray-800 bg-gray-900 p-4 text-xs leading-relaxed text-gray-400">
                  {event.component_stack}
                </pre>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Metadata</p>
              <pre className="max-h-52 overflow-auto rounded-xl border border-gray-800 bg-gray-900 p-4 text-xs leading-relaxed text-gray-400">
                {JSON.stringify(event.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>

          <aside className="border-t border-gray-800 bg-gray-900/60 p-5 lg:border-l lg:border-t-0">
            <div className="space-y-3 text-xs">
              {[
                ['Tenant', event.tenant_name || event.tenant_slug || event.tenant_id || '—'],
                ['Usuario', event.user_email || '—'],
                ['Ruta', event.page_url || event.route || '—'],
                ['API', event.api_url || '—'],
                ['HTTP', [event.http_method, event.http_status].filter(Boolean).join(' ') || '—'],
                ['Fingerprint', event.fingerprint || '—'],
                ['Primera vez', fmtDateTimeMini(event.first_seen_at)],
                ['Ultima vez', fmtDateTimeMini(event.last_seen_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="mb-0.5 text-gray-500">{label}</p>
                  <p className="break-words font-mono text-gray-300">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setStatus(key)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      status === key ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">Notas internas</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={5}
                className="w-full resize-none rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500"
                placeholder="Hipotesis, ticket, solucion aplicada..."
              />
            </div>
            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
            <button
              onClick={save}
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar revision'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function AdminErrores() {
  const [events, setEvents] = useState([])
  const [tenants, setTenants] = useState([])
  const [summary, setSummary] = useState({})
  const [topTenants, setTopTenants] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ tenant_id: '', status: '', severity: '', source: '', q: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE })
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      const [eventsRes, tenantsRes] = await Promise.all([
        adminApi.get(`/error-events?${params}`),
        tenants.length ? Promise.resolve(null) : adminApi.get('/tenants'),
      ])
      setEvents(eventsRes.data.events || [])
      setSummary(eventsRes.data.summary || {})
      setTopTenants(eventsRes.data.top_tenants || [])
      setTotal(eventsRes.data.total || 0)
      if (tenantsRes) setTenants(tenantsRes.data.data || [])
    } finally {
      setLoading(false)
    }
  }, [filters, page, tenants.length])

  useEffect(() => { load() }, [load])

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function handleSaved(updated) {
    setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev))
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      {selected && <DetailModal event={selected} onClose={() => setSelected(null)} onSaved={handleSaved} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Supervision de errores</h1>
          <p className="mt-0.5 text-sm text-gray-500">Eventos tecnicos bloqueantes, trazas y contexto por tenant.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile icon={ShieldAlert} label="Activos" value={summary.active} tone="red" />
        <StatTile icon={AlertOctagon} label="Criticos" value={summary.critical} tone="red" />
        <StatTile icon={AlertTriangle} label="Errores" value={summary.errors} tone="orange" />
        <StatTile icon={ServerCrash} label="Ocurrencias 24h" value={summary.occurrences_24h} tone="blue" />
        <StatTile icon={Clock} label="En revision" value={summary.reviewing} tone="emerald" sub={summary.latest_at ? `Ultimo ${fmtDateTimeMini(summary.latest_at)}` : 'Sin actividad'} />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-blue-400" />
          <p className="text-sm font-semibold text-white">Filtros de diagnostico</p>
          <span className="ml-auto text-xs text-gray-500">{total.toLocaleString('es-MX')} evento(s)</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              value={filters.q}
              onChange={e => updateFilter('q', e.target.value)}
              placeholder="Buscar mensaje, ruta, usuario..."
              className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500"
            />
          </div>
          <select value={filters.tenant_id} onChange={e => updateFilter('tenant_id', e.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500">
            <option value="">Todos los tenants</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.legal_name || t.slug}</option>)}
          </select>
          <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CFG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>
          <select value={filters.severity} onChange={e => updateFilter('severity', e.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500">
            <option value="">Todas las severidades</option>
            {Object.entries(SEVERITY_CFG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>
          <select value={filters.source} onChange={e => updateFilter('source', e.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500">
            <option value="">Todos los origenes</option>
            {Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>

      {topTenants.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-4">
          {topTenants.slice(0, 4).map(t => (
            <button
              key={t.tenant_id || t.tenant_name}
              onClick={() => updateFilter('tenant_id', t.tenant_id || '')}
              className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-left transition-colors hover:border-blue-500/40"
            >
              <p className="truncate text-sm font-semibold text-gray-200">{t.tenant_name}</p>
              <p className="mt-1 text-xs text-gray-500">{t.active_events} abiertos · {t.occurrences} ocurrencias</p>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-950/40">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Evento</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tenant / usuario</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Contexto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ultima vez</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-14 text-center text-sm text-gray-500">Cargando eventos...</td></tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-emerald-500/70" />
                  <p className="text-sm font-medium text-gray-300">Sin errores con estos filtros</p>
                  <p className="mt-1 text-xs text-gray-600">Los eventos criticos apareceran aqui automaticamente.</p>
                </td>
              </tr>
            ) : events.map(ev => (
              <tr key={ev.id} className="border-b border-gray-800/60 transition-colors hover:bg-gray-800/35">
                <td className="max-w-md px-4 py-3">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={ev.severity} />
                    <span className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                      {SOURCE_LABELS[ev.source] || ev.source}
                    </span>
                    {(ev.occurrences || 1) > 1 && (
                      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                        x{ev.occurrences}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs font-medium leading-relaxed text-gray-200">{ev.message}</p>
                  {ev.fingerprint && <p className="mt-1 truncate font-mono text-[11px] text-gray-600">{ev.fingerprint}</p>}
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-44 truncate text-xs font-semibold text-gray-200">{ev.tenant_name || ev.tenant_slug || 'Sin tenant'}</p>
                  <p className="max-w-44 truncate text-[11px] text-gray-500">{ev.user_email || 'Sin usuario'}</p>
                </td>
                <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                <td className="max-w-xs px-4 py-3">
                  <p className="truncate font-mono text-[11px] text-gray-400">{ev.api_url || ev.page_url || ev.route || '—'}</p>
                  {ev.http_status && <p className="mt-1 text-[11px] text-gray-600">{ev.http_method || 'HTTP'} {ev.http_status}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTimeMini(ev.last_seen_at)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelected(ev)}
                    className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
                    title="Ver diagnostico"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:text-white disabled:opacity-40">
            Anterior
          </button>
          <span className="text-xs text-gray-500">Pagina {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:text-white disabled:opacity-40">
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}

