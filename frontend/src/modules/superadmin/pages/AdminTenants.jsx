import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Search, RefreshCw, Building2, ChevronRight, AlertCircle, CheckCircle2, Clock, XCircle, PauseCircle, Users, Calendar, Database, Zap, Plus, Eye, EyeOff, X, Save } from 'lucide-react'
import adminApi from '../services/adminApi'

const STATUS_CFG = {
  trial:         { label: 'Trial',          bg: 'bg-blue-500/15',    text: 'text-blue-300',   border: 'border-blue-500/25',    dot: 'bg-blue-400' },
  active:        { label: 'Activo',         bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25', dot: 'bg-emerald-400' },
  trial_expired: { label: 'Trial vencido',  bg: 'bg-amber-500/15',   text: 'text-amber-300',  border: 'border-amber-500/25',   dot: 'bg-amber-400' },
  expired:       { label: 'Vencido',        bg: 'bg-orange-500/15',  text: 'text-orange-300', border: 'border-orange-500/25',  dot: 'bg-orange-400' },
  suspended:     { label: 'Suspendido',     bg: 'bg-red-500/15',     text: 'text-red-300',    border: 'border-red-500/25',     dot: 'bg-red-400' },
  pending:       { label: 'Pendiente',      bg: 'bg-gray-700/50',    text: 'text-gray-300',   border: 'border-gray-600/50',    dot: 'bg-gray-400' },
  rejected:      { label: 'Rechazado',      bg: 'bg-gray-800/50',    text: 'text-gray-500',   border: 'border-gray-700/50',    dot: 'bg-gray-600' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

const STATUSES = ['', 'trial', 'active', 'trial_expired', 'expired', 'suspended']
const STATUS_LABELS = { '': 'Todos', trial: 'Trial', active: 'Activo', trial_expired: 'Trial vencido', expired: 'Vencido', suspended: 'Suspendido' }

export default function AdminTenants() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tenants, setTenants] = useState([])
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dbSize, setDbSize] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  function load() {
    setLoading(true)
    setError('')
    const url = statusFilter ? `/tenants?status=${statusFilter}` : '/tenants'
    adminApi.get(url)
      .then(r => setTenants(r.data.data))
      .catch(() => setError('Error cargando tenants'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    adminApi.get('/usage-stats')
      .then(r => setDbSize(r.data.data?.db_size ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [statusFilter])

  const filtered = tenants.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.legal_name?.toLowerCase().includes(q) ||
      t.slug?.toLowerCase().includes(q) ||
      t.contact_email?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Tenants</h1>
          <p className="text-gray-500 text-sm mt-0.5">{tenants.length} organizaciones registradas</p>
        </div>
        <div className="flex items-center gap-3">
          {dbSize && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-gray-400 text-xs">DB</span>
              <span className="text-white text-xs font-semibold">{dbSize}</span>
            </div>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors border border-emerald-500"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Tenant
          </button>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700">
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, slug o email..."
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-0.5 flex-wrap">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-800/40 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando tenants...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Sin resultados</p>
          <p className="text-gray-600 text-sm mt-1">Prueba cambiando los filtros de busqueda</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Organizacion</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Estado</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Plan</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Usuarios</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden xl:table-cell">Guias</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 hidden xl:table-cell">Vencimiento</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filtered.map(t => {
                const expAt = t.active_sub_expires_at || t.subscription_expires_at || t.trial_expires_at
                const isTrial = !t.active_sub_expires_at && !t.subscription_expires_at && !!t.trial_expires_at
                const exp = expAt ? new Date(expAt) : null
                const daysLeft = exp ? Math.ceil((exp - Date.now()) / 86400000) : null
                const planLabel = t.active_plan_name || t.plan_name
                return (
                  <tr key={t.id} className="hover:bg-gray-800/30 transition-colors group cursor-pointer" onClick={() => navigate(`/super-admin/tenants/${t.id}`)}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0 font-bold text-gray-400 text-sm">
                          {t.legal_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate">{t.legal_name}</p>
                          <p className="text-gray-500 text-xs truncate">{t.slug} · {t.contact_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className="text-gray-300 text-sm">{planLabel || '—'}</span>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Users className="w-3.5 h-3.5" />
                        <span>{t.user_count ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden xl:table-cell">
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Zap className="w-3.5 h-3.5" />
                        <span>{Number(t.guias_count ?? 0).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden xl:table-cell">
                      {exp ? (
                        <div>
                          <span className={`text-xs font-medium ${daysLeft !== null && daysLeft < 7 ? 'text-red-400' : daysLeft !== null && daysLeft < 30 ? 'text-amber-400' : 'text-gray-300'}`}>
                            {daysLeft !== null && daysLeft > 0 ? `${daysLeft}d restantes` : 'Vencido'}
                          </span>
                          <p className="text-gray-600 text-xs mt-0.5">
                            {exp.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {isTrial && <span className="ml-1 text-blue-500">(trial)</span>}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-800 group-hover:bg-blue-600 border border-gray-700 group-hover:border-blue-500 text-gray-400 group-hover:text-white transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); load() }}
        />
      )}
    </div>
  )
}

function CreateTenantModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    legal_name: '',
    contact_name: '',
    contact_email: '',
    admin_password: '',
    slug: '',
    plan_id: '',
    subscription_type: 'monthly',
    zona_horaria: 'America/Mexico_City',
  })
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    adminApi.get('/plans')
      .then(r => setPlans(r.data.data || []))
      .catch(() => {})
  }, [])

  function makeSlug(name) {
    return (name || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function autoSlug() {
    setForm(f => ({ ...f, slug: makeSlug(f.legal_name) }))
  }

  function generatePassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$'
    let pwd = ''
    for (let i = 0; i < 16; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    setForm(f => ({ ...f, admin_password: pwd }))
  }

  async function submit() {
    if (!form.legal_name || !form.contact_name || !form.contact_email || !form.admin_password) {
      setError('legal_name, contact_name, contact_email y admin_password son requeridos')
      return
    }
    setLoading(true)
    setError('')
    try {
      await adminApi.post('/tenants', form)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear tenant')
    } finally {
      setLoading(false)
    }
  }

  const LATAM_TIMEZONES = [
    { value: 'America/Mexico_City', label: 'America/Mexico_City (México)' },
    { value: 'America/Bogota', label: 'America/Bogota (Colombia)' },
    { value: 'America/Lima', label: 'America/Lima (Perú)' },
    { value: 'America/Santiago', label: 'America/Santiago (Chile)' },
    { value: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos_Aires (Argentina)' },
    { value: 'America/Caracas', label: 'America/Caracas (Venezuela)' },
    { value: 'America/Guayaquil', label: 'America/Guayaquil (Ecuador)' },
    { value: 'America/La_Paz', label: 'America/La_Paz (Bolivia)' },
    { value: 'America/Montevideo', label: 'America/Montevideo (Uruguay)' },
    { value: 'America/Asuncion', label: 'America/Asuncion (Paraguay)' },
    { value: 'America/Panama', label: 'America/Panama (Panamá)' },
    { value: 'America/Costa_Rica', label: 'America/Costa_Rica (Costa Rica)' },
    { value: 'America/El_Salvador', label: 'America/El_Salvador (El Salvador)' },
    { value: 'America/Guatemala', label: 'America/Guatemala (Guatemala)' },
    { value: 'America/Honduras', label: 'America/Honduras (Honduras)' },
    { value: 'America/Managua', label: 'America/Managua (Nicaragua)' },
    { value: 'America/Havana', label: 'America/Havana (Cuba)' },
    { value: 'America/Puerto_Rico', label: 'America/Puerto_Rico (Puerto Rico)' },
    { value: 'America/Dominican', label: 'America/Dominican (República Dominicana)' },
  ]

  const inputCls = 'w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold">Crear nuevo Tenant</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-950/30 border border-red-800/40 rounded-lg p-3 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nombre legal de la empresa *</label>
            <input value={form.legal_name} onChange={set('legal_name')} onBlur={autoSlug} placeholder="ACME Inc" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nombre de contacto *</label>
            <input value={form.contact_name} onChange={set('contact_name')} placeholder="Juan Pérez" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email del administrador *</label>
            <input type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="admin@example.com" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña temporal *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.admin_password}
                onChange={set('admin_password')}
                placeholder="••••••••"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={generatePassword}
              className="text-xs text-blue-400 hover:text-blue-300 mt-1"
            >
              Generar contraseña aleatoria
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Slug (subdominio)</label>
            <input value={form.slug} onChange={set('slug')} placeholder="acme" pattern="[a-z0-9-]+" className={inputCls} />
            <p className="text-xs text-gray-500 mt-1">Se genera automáticamente del nombre si está vacío</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Plan</label>
            <select value={form.plan_id} onChange={set('plan_id')} className={inputCls}>
              <option value="">Sin plan (configurar después)</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.price_amount && `($${p.price_amount})`}</option>
              ))}
            </select>
          </div>

          {form.plan_id && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de suscripción</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="subscription_type"
                    value="monthly"
                    checked={form.subscription_type === 'monthly'}
                    onChange={set('subscription_type')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-300">Mensual</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="subscription_type"
                    value="annual"
                    checked={form.subscription_type === 'annual'}
                    onChange={set('subscription_type')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-300">Anual</span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Zona horaria</label>
            <select value={form.zona_horaria} onChange={set('zona_horaria')} className={inputCls}>
              {LATAM_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-800 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
          >
            <Save className="w-3.5 h-3.5" />
            {loading ? 'Creando...' : 'Crear Tenant'}
          </button>
        </div>
      </div>
    </div>
  )
}
