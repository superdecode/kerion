import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, PauseCircle, PlayCircle,
  Edit2, Save, X, Plus, Calendar, Users, CreditCard, Activity,
  AlertCircle, Check, Clock, Building2, FileText, Package, Zap,
  Trash2, KeyRound, Copy
} from 'lucide-react'
import adminApi from '../services/adminApi'

const STATUS_CFG = {
  trial:         { label: 'Trial activo',   bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/25' },
  active:        { label: 'Activo',         bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
  trial_expired: { label: 'Trial vencido',  bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25' },
  expired:       { label: 'Vencido',        bg: 'bg-orange-500/15',  text: 'text-orange-300',  border: 'border-orange-500/25' },
  suspended:     { label: 'Suspendido',     bg: 'bg-red-500/15',     text: 'text-red-300',     border: 'border-red-500/25' },
}

function Toast({ msg }) {
  if (!msg) return null
  return (
    <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-gray-800 border border-gray-600 text-white text-sm px-4 py-3 rounded-xl shadow-2xl">
      <Check className="w-4 h-4 text-emerald-400" />
      {msg}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
const disabledCls = "w-full bg-gray-800/40 border border-gray-700/50 rounded-lg px-3 py-2.5 text-gray-400 text-sm"

function EditInfoCard({ tenant, activeSub, onSaved }) {
  const [editing, setEditing] = useState(false)

  function makeSlug(name) {
    return (name || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  const [form, setForm] = useState({
    legal_name: tenant.legal_name || '',
    slug: tenant.slug || makeSlug(tenant.legal_name),
    contact_email: tenant.contact_email || '',
    contact_phone: tenant.contact_phone || '',
    country: tenant.country || '',
    zona_horaria: tenant.zona_horaria || 'America/Mexico_City',
    notes: tenant.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await adminApi.patch(`/tenants/${tenant.id}`, form)
      onSaved('Informacion actualizada')
      setEditing(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-400" />
          Informacion del tenant
        </h2>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg border border-gray-700 transition-colors"
          >
            <Edit2 className="w-3 h-3" />
            Editar
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setError('') }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg border border-gray-700 transition-colors"
            >
              <X className="w-3 h-3" />
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              <Save className="w-3 h-3" />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-950/30 border border-red-800/40 rounded-lg p-3 mb-4 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nombre legal">
          {editing
            ? <input value={form.legal_name} onChange={set('legal_name')} className={inputCls} />
            : <p className={disabledCls}>{tenant.legal_name || '—'}</p>}
        </Field>
        <Field label="Slug (subdominio)">
          {editing
            ? <input value={form.slug} onChange={set('slug')} className={inputCls} placeholder="acme" pattern="[a-z0-9-]+" title="Solo letras minusculas, numeros y guiones" />
            : <p className={disabledCls}>{tenant.slug}</p>}
        </Field>
        <Field label="Email de contacto">
          {editing
            ? <input type="email" value={form.contact_email} onChange={set('contact_email')} className={inputCls} />
            : <p className={disabledCls}>{tenant.contact_email || '—'}</p>}
        </Field>
        <Field label="Telefono">
          {editing
            ? <input value={form.contact_phone} onChange={set('contact_phone')} className={inputCls} />
            : <p className={disabledCls}>{tenant.contact_phone || '—'}</p>}
        </Field>
        <Field label="Pais">
          {editing
            ? <input value={form.country} onChange={set('country')} className={inputCls} />
            : <p className={disabledCls}>{tenant.country || '—'}</p>}
        </Field>
        <Field label="Zona horaria">
          {editing
            ? <select value={form.zona_horaria} onChange={set('zona_horaria')} className={inputCls}>
                <optgroup label="Latinoamérica">
                  <option value="America/Mexico_City">America/Mexico_City (México)</option>
                  <option value="America/Bogota">America/Bogota (Colombia)</option>
                  <option value="America/Lima">America/Lima (Perú)</option>
                  <option value="America/Santiago">America/Santiago (Chile)</option>
                  <option value="America/Argentina/Buenos_Aires">America/Argentina/Buenos_Aires (Argentina)</option>
                  <option value="America/Caracas">America/Caracas (Venezuela)</option>
                  <option value="America/Guayaquil">America/Guayaquil (Ecuador)</option>
                  <option value="America/La_Paz">America/La_Paz (Bolivia)</option>
                  <option value="America/Montevideo">America/Montevideo (Uruguay)</option>
                  <option value="America/Asuncion">America/Asuncion (Paraguay)</option>
                  <option value="America/Panama">America/Panama (Panamá)</option>
                  <option value="America/Costa_Rica">America/Costa_Rica (Costa Rica)</option>
                  <option value="America/El_Salvador">America/El_Salvador (El Salvador)</option>
                  <option value="America/Guatemala">America/Guatemala (Guatemala)</option>
                  <option value="America/Honduras">America/Honduras (Honduras)</option>
                  <option value="America/Managua">America/Managua (Nicaragua)</option>
                  <option value="America/Havana">America/Havana (Cuba)</option>
                  <option value="America/Puerto_Rico">America/Puerto_Rico (Puerto Rico)</option>
                  <option value="America/Dominican">America/Dominican (República Dominicana)</option>
                </optgroup>
              </select>
            : <p className={disabledCls}>{form.zona_horaria}</p>}
        </Field>
        <Field label="Creado el">
          <p className={disabledCls}>{new Date(tenant.created_at).toLocaleString('es-MX')}</p>
        </Field>
        <Field label="Trial vence">
          {(() => {
            if (!tenant.trial_expires_at) return <p className={disabledCls}>—</p>
            const d = new Date(tenant.trial_expires_at)
            const days = Math.ceil((d - Date.now()) / 86400000)
            const color = days < 0 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-emerald-400'
            return (
              <p className={`${disabledCls} ${color}`}>
                {d.toLocaleDateString('es-MX')}{' '}
                <span className="text-xs">({days < 0 ? 'vencido' : `${days}d restantes`})</span>
              </p>
            )
          })()}
        </Field>
        <Field label="Suscripcion vigente">
          {(() => {
            const expiresAt = activeSub?.expires_at || tenant.subscription_expires_at
            if (!expiresAt) return <p className={disabledCls}>Sin suscripcion activa</p>
            const d = new Date(expiresAt)
            const days = Math.ceil((d - Date.now()) / 86400000)
            const color = days < 0 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-emerald-400'
            const tz = form.zona_horaria || 'America/Mexico_City'
            const formatter = new Intl.DateTimeFormat('es-MX', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: tz
            })
            const formattedDate = formatter.format(d)
            return (
              <div className={`${disabledCls} ${color} space-y-0.5`}>
                <div className="flex items-center gap-2">
                  {activeSub?.plan_name && (
                    <span className="text-xs bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                      {activeSub.plan_name}
                    </span>
                  )}
                  <span className="text-xs">({days < 0 ? 'vencido' : `${days}d restantes`})</span>
                </div>
                <p className="text-xs text-gray-500">Vence el {formattedDate} ({tz})</p>
              </div>
            )
          })()}
        </Field>
      </div>

      <Field label="Notas / Observaciones">
        {editing
          ? <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Observaciones importantes sobre este tenant..." className={`${inputCls} resize-none`} />
          : <p className={`${disabledCls} min-h-[3.5rem] py-2 whitespace-pre-wrap`}>{form.notes || '—'}</p>}
      </Field>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, loading = false }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${color} bg-opacity-10 flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
          <p className="text-white font-bold text-lg leading-none mt-0.5">
            {loading ? '...' : value}
          </p>
        </div>
      </div>
    </div>
  )
}

function SubscriptionCard({ tenantId, subscriptions, plans, onSaved }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ plan_id: '', expires_at: '', payment_reference: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.plan_id || !form.expires_at) return setError('Plan y fecha requeridos')
    setSaving(true)
    setError('')
    try {
      await adminApi.post(`/tenants/${tenantId}/subscriptions`, form)
      onSaved('Suscripcion activada')
      setShowForm(false)
      setForm({ plan_id: '', expires_at: '', payment_reference: '', notes: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-emerald-400" />
          Suscripciones
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          Nueva
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-5 p-4 bg-gray-800/60 rounded-xl border border-gray-700/50 space-y-3">
          <p className="text-white text-sm font-medium">Agregar suscripcion</p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <select value={form.plan_id} onChange={set('plan_id')} className={inputCls}>
                <option value="">Seleccionar...</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — ${p.price_amount} {p.price_currency}/mes</option>
                ))}
              </select>
            </Field>
            <Field label="Vence el">
              <input type="date" value={form.expires_at} onChange={set('expires_at')} className={inputCls} />
            </Field>
            <Field label="Referencia de pago">
              <input value={form.payment_reference} onChange={set('payment_reference')} placeholder="Transferencia, recibo..." className={inputCls} />
            </Field>
            <Field label="Notas">
              <input value={form.notes} onChange={set('notes')} className={inputCls} />
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs rounded-lg transition-colors font-medium">
              {saving ? 'Guardando...' : 'Activar suscripcion'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-400 hover:text-white text-xs transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {subscriptions.length === 0 ? (
        <div className="flex items-center gap-2 text-gray-500 py-4">
          <CreditCard className="w-4 h-4" />
          <span className="text-sm">Sin suscripciones registradas</span>
        </div>
      ) : (
        <div className="space-y-2">
          {subscriptions.map(s => {
            const exp = s.expires_at ? new Date(s.expires_at) : null
            const days = exp ? Math.ceil((exp - Date.now()) / 86400000) : null
            return (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-800/40 rounded-lg border border-gray-700/40">
                <div>
                  <p className="text-white text-sm font-medium">{s.plan_name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{s.payment_reference || 'Sin referencia'}{s.notes ? ` · ${s.notes}` : ''}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                      : 'bg-gray-700/50 text-gray-400 border border-gray-600/50'
                  }`}>{s.status}</span>
                  {exp && (
                    <p className={`text-xs mt-1 ${days !== null && days < 7 ? 'text-red-400' : 'text-gray-500'}`}>
                      {days !== null && days > 0 ? `${days}d restantes` : 'Vencido'} · {exp.toLocaleDateString('es-MX')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DeleteTenantModal({ tenant, onClose, onDeleted }) {
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const matches = confirmName === tenant.legal_name

  async function handleDelete() {
    if (!matches) return
    setDeleting(true)
    setError('')
    try {
      await adminApi.delete(`/tenants/${tenant.id}`, { data: { confirm_name: confirmName } })
      onDeleted()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al eliminar')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-red-800/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Eliminar tenant permanentemente</h3>
            <p className="text-gray-400 text-sm mt-0.5">Esta accion es irreversible. Se eliminaran todos los datos.</p>
          </div>
        </div>

        <div className="p-3 bg-red-950/30 border border-red-800/30 rounded-lg mb-4 text-sm text-red-300">
          Se eliminaran: usuarios, guias, tarimas, folios, suscripciones, roles y el tenant.
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Escribe <span className="text-white font-mono">{tenant.legal_name}</span> para confirmar
          </label>
          <input
            value={confirmName}
            onChange={e => setConfirmName(e.target.value)}
            placeholder={tenant.legal_name}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
            autoFocus
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors font-medium"
          >
            {deleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {deleting ? 'Eliminando...' : 'Eliminar permanentemente'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({ tenant, onClose }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleReset() {
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.post(`/tenants/${tenant.id}/reset-password`)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al resetear contrasena')
    } finally {
      setLoading(false)
    }
  }

  function copyPassword() {
    if (result?.temp_password) {
      navigator.clipboard.writeText(result.temp_password).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" />
            Resetear contrasena admin
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!result ? (
          <>
            <p className="text-gray-400 text-sm mb-5">
              Se generara una contrasena temporal para el administrador de <span className="text-white">{tenant.legal_name}</span>.
              El usuario debera cambiarla al iniciar sesion.
            </p>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium"
              >
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {loading ? 'Generando...' : 'Generar nueva contrasena'}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Contrasena temporal generada
            </div>
            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
              <p className="text-gray-400 text-xs mb-1">Email admin</p>
              <p className="text-white text-sm">{result.admin_email}</p>
            </div>
            <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl">
              <p className="text-amber-300 text-xs mb-2">Contrasena temporal (copiar y compartir)</p>
              <div className="flex items-center gap-2">
                <p className="text-white font-mono text-lg flex-1 select-all">{result.temp_password}</p>
                <button
                  onClick={copyPassword}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Copiar"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-gray-500 text-xs">El usuario debera cambiar esta contrasena al iniciar sesion.</p>
            <button onClick={onClose} className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminTenantDetalle() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [showDelete, setShowDelete] = useState(false)
  const [showResetPwd, setShowResetPwd] = useState(false)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function load() {
    try {
      const [detailRes, plansRes] = await Promise.all([
        adminApi.get(`/tenants/${id}`),
        adminApi.get('/plans'),
      ])
      setData(detailRes.data)
      setPlans(plansRes.data.data)
    } catch (err) {
      console.error('[admin/tenants/:id load error]', err)
    } finally {
      setLoading(false)
    }

    // Load stats separately
    setStatsLoading(true)
    try {
      const statsRes = await adminApi.get(`/tenants/${id}/stats`)
      const statsData = statsRes.data.data
      console.log('[stats loaded]', statsData)
      setStats(statsData)
    } catch (err) {
      console.error('[stats load error]', err.response?.data || err.message)
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleAction(action) {
    try {
      await adminApi.post(`/tenants/${id}/${action}`)
      showToast(action === 'suspend' ? 'Tenant suspendido' : 'Tenant reactivado')
      setConfirming(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Error al ejecutar accion')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    </div>
  )

  if (!data) return (
    <div className="flex items-center gap-3 text-red-400 p-4">
      <AlertCircle className="w-5 h-5" />
      <span>Tenant no encontrado</span>
    </div>
  )

  const { tenant, provisioning_log, subscriptions, active_subscription } = data
  const statusCfg = STATUS_CFG[tenant.status] || { label: tenant.status, bg: 'bg-gray-700', text: 'text-gray-300', border: 'border-gray-600' }

  return (
    <div className="space-y-5">
      <Toast msg={toast} />

      {showDelete && (
        <DeleteTenantModal
          tenant={tenant}
          onClose={() => setShowDelete(false)}
          onDeleted={() => window.history.back()}
        />
      )}

      {showResetPwd && (
        <ResetPasswordModal
          tenant={tenant}
          onClose={() => setShowResetPwd(false)}
        />
      )}

      {/* Confirm modal */}
      {confirming && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-semibold mb-2">
              {confirming === 'suspend' ? 'Suspender tenant' : 'Reactivar tenant'}
            </h3>
            <p className="text-gray-400 text-sm mb-5">
              {confirming === 'suspend'
                ? `¿Confirmas suspender "${tenant.legal_name}"? Los usuarios no podran acceder.`
                : `¿Confirmas reactivar "${tenant.legal_name}"?`}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirming(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => handleAction(confirming)}
                className={`px-4 py-2 text-sm text-white rounded-lg transition-colors ${confirming === 'suspend' ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
              >
                {confirming === 'suspend' ? 'Suspender' : 'Reactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/super-admin/tenants" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Tenants
          </Link>
          <span className="text-gray-700">/</span>
          <h1 className="text-xl font-bold text-white truncate">{tenant.legal_name}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
            {statusCfg.label}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowResetPwd(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-950/40 hover:bg-amber-950/70 border border-amber-800/40 text-amber-300 text-xs rounded-lg transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Reset contrasena
          </button>
          {tenant.status !== 'suspended' ? (
            <button
              onClick={() => setConfirming('suspend')}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-950/40 hover:bg-red-950/70 border border-red-800/40 text-red-300 text-xs rounded-lg transition-colors"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              Suspender
            </button>
          ) : (
            <button
              onClick={() => setConfirming('reactivate')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/40 text-emerald-300 text-xs rounded-lg transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Reactivar
            </button>
          )}
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-950/60 hover:bg-red-950/90 border border-red-700/60 text-red-400 text-xs rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white text-xs rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Zap} label="Guias totales" value={stats?.total_guias.toLocaleString() ?? '—'} color="text-blue-400" loading={statsLoading} />
        <StatCard icon={Package} label="Tarimas" value={stats?.total_tarimas.toLocaleString() ?? '—'} color="text-purple-400" loading={statsLoading} />
        <StatCard icon={FileText} label="Folios" value={stats?.total_folios.toLocaleString() ?? '—'} color="text-cyan-400" loading={statsLoading} />
        <StatCard icon={Users} label="Escaneadores activos" value={stats?.active_scanners.toLocaleString() ?? '—'} color="text-amber-400" loading={statsLoading} />
      </div>
      {!statsLoading && stats ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 -mt-2">
          <Activity className="w-3.5 h-3.5" />
          <span>{stats.guias_last_30d.toLocaleString()} guias en los ultimos 30 dias</span>
          <span className="text-gray-700">·</span>
          <span>{stats.total_users} usuarios registrados</span>
        </div>
      ) : !statsLoading && !stats ? (
        <p className="text-xs text-gray-600 -mt-2">Abre consola (F12) → pestaña Console para ver errores. Verifica que las migraciones se hayan ejecutado.</p>
      ) : null}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <EditInfoCard tenant={tenant} activeSub={active_subscription} onSaved={(msg) => { showToast(msg); load() }} />
        <SubscriptionCard tenantId={id} subscriptions={subscriptions} plans={plans} onSaved={(msg) => { showToast(msg); load() }} />
      </div>

      {/* Provisioning log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400" />
          Log de provisioning
        </h2>
        {provisioning_log.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin registros de provisioning</p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {provisioning_log.map(l => (
              <div key={l.id} className="flex items-center gap-3 py-2 border-b border-gray-800/60 last:border-0 text-xs">
                <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full ${
                  l.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' :
                  l.status === 'skipped' ? 'bg-gray-700 text-gray-500' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {l.status === 'ok' ? '✓' : l.status === 'skipped' ? '–' : '✗'}
                </span>
                <span className="text-gray-300 font-mono flex-1 truncate">{l.step}</span>
                {l.error_message && <span className="text-red-400 truncate max-w-xs">{l.error_message}</span>}
                <span className="text-gray-600 flex-shrink-0">{new Date(l.created_at).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
