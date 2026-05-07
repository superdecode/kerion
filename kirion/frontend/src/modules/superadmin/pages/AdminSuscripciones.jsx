import { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, Plus, Edit2, Trash2, X, AlertCircle, Check,
  CreditCard, Package, Eye, EyeOff, Save
} from 'lucide-react'
import adminApi from '../services/adminApi'

// ── Plans CRUD ────────────────────────────────────────────────────────────────

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', code: '', description: '',
    price_amount: '', price_currency: 'USD',
    guide_limit: '', warehouse_count: '1',
    is_visible: true, display_order: '0',
    price_annual: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name || '',
        code: plan.code || '',
        description: plan.description || '',
        price_amount: plan.price_amount ?? '',
        price_currency: plan.price_currency || 'USD',
        guide_limit: plan.guide_limit ?? '',
        warehouse_count: plan.warehouse_count ?? '1',
        is_visible: plan.is_visible !== false,
        display_order: plan.display_order ?? '0',
        price_annual: plan.price_annual ?? '',
      })
    }
  }, [plan])

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.code) return setError('Nombre y codigo son requeridos')
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        price_amount: form.price_amount !== '' ? parseFloat(form.price_amount) : null,
        price_annual: form.price_annual !== '' ? parseFloat(form.price_annual) : null,
        guide_limit: form.guide_limit !== '' ? parseInt(form.guide_limit) : null,
        warehouse_count: form.warehouse_count !== '' ? parseInt(form.warehouse_count) : null,
        display_order: parseInt(form.display_order) || 0,
      }
      if (plan) {
        await adminApi.put(`/plans/${plan.id}`, payload)
      } else {
        await adminApi.post('/plans', payload)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
  const labelCls = "block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-white font-bold">{plan ? 'Editar plan' : 'Nuevo plan'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/40 rounded-lg p-3 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input required value={form.name} onChange={set('name')} className={inputCls} placeholder="Basico" />
            </div>
            <div>
              <label className={labelCls}>Codigo *</label>
              <input required value={form.code} onChange={set('code')} className={inputCls} placeholder="basic" />
            </div>
            <div>
              <label className={labelCls}>Precio mensual (USD)</label>
              <input type="number" step="0.01" value={form.price_amount} onChange={set('price_amount')} className={inputCls} placeholder="97.00" />
            </div>
            <div>
              <label className={labelCls}>Precio anual (USD)</label>
              <input type="number" step="0.01" value={form.price_annual} onChange={set('price_annual')} className={inputCls} placeholder="932.00" />
            </div>
            <div>
              <label className={labelCls}>Limite de guias/mes</label>
              <input type="number" value={form.guide_limit} onChange={set('guide_limit')} className={inputCls} placeholder="10000" />
            </div>
            <div>
              <label className={labelCls}>Bodegas</label>
              <input type="number" value={form.warehouse_count} onChange={set('warehouse_count')} className={inputCls} placeholder="1" />
            </div>
            <div>
              <label className={labelCls}>Orden de display</label>
              <input type="number" value={form.display_order} onChange={set('display_order')} className={inputCls} placeholder="0" />
            </div>
            <div className="flex flex-col justify-end">
              <label className={labelCls}>Visible en landing</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_visible: !f.is_visible }))}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                  form.is_visible
                    ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400'
                }`}
              >
                {form.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {form.is_visible ? 'Visible' : 'Oculto'}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Descripcion</label>
            <textarea value={form.description} onChange={set('description')} rows={2} className={`${inputCls} resize-none`} placeholder="Descripcion breve del plan..." />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Guardando...' : plan ? 'Actualizar' : 'Crear plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PlansTab() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    adminApi.get('/plans')
      .then(r => setPlans(r.data.data || []))
      .catch(() => setError('Error cargando planes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleDelete(plan) {
    try {
      await adminApi.delete(`/plans/${plan.id}`)
      setDeleting(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Error eliminando plan')
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      {modal && (
        <PlanModal
          plan={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Eliminar plan</h3>
            <p className="text-gray-400 text-sm mb-5">
              Eliminar &ldquo;{deleting.name}&rdquo;. Solo se puede eliminar si no tiene suscripciones activas.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleting)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{plans.length} planes configurados</p>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo plan
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-950/30 border border-red-800/40 rounded-xl p-3 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-10">
          <Package className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">Sin planes configurados</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Precio</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Limite guias</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Orden</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Estado</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {plans.map(p => (
                <tr key={p.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{p.name}</p>
                    <p className="text-gray-500 text-xs font-mono">{p.code}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {p.price_amount != null ? `$${p.price_amount} ${p.price_currency}/mes` : '—'}
                    {p.price_annual != null && (
                      <p className="text-gray-500 text-xs">${p.price_annual}/año</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {p.guide_limit != null ? p.guide_limit.toLocaleString() : 'Ilimitado'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{p.display_order ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                      p.is_visible !== false
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                        : 'bg-gray-700/50 text-gray-500 border-gray-600/50'
                    }`}>
                      {p.is_visible !== false ? 'Visible' : 'Oculto'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(p)}
                        className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(p)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

// ── Subscriptions records ─────────────────────────────────────────────────────

function SubscriptionsTab() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    adminApi.get('/tenants')
      .then(r => setTenants(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = tenants.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.legal_name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q)
  })

  function daysLabel(dateStr) {
    if (!dateStr) return null
    const d = Math.ceil((new Date(dateStr) - Date.now()) / 86400000)
    return d
  }

  function statusColor(status) {
    if (status === 'active') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
    if (status === 'trial') return 'bg-blue-500/15 text-blue-300 border-blue-500/25'
    if (status === 'expired' || status === 'trial_expired') return 'bg-orange-500/15 text-orange-300 border-orange-500/25'
    if (status === 'suspended') return 'bg-red-500/15 text-red-300 border-red-500/25'
    return 'bg-gray-700/50 text-gray-400 border-gray-600/50'
  }

  const STATUS_LABELS = {
    active: 'Activo', trial: 'Trial', expired: 'Vencido',
    trial_expired: 'Trial vencido', suspended: 'Suspendido', pending: 'Pendiente',
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tenant..."
          className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-4 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Tenant</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Plan activo</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Vencimiento</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase">Dias rest.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map(t => {
                const expiresAt = t.subscription_expires_at || t.trial_expires_at
                const days = daysLabel(expiresAt)
                const dayColor = days === null ? '' : days < 0 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : days <= 30 ? 'text-yellow-300' : 'text-emerald-400'
                return (
                  <tr key={t.id} className="hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{t.legal_name}</p>
                      <p className="text-gray-500 text-xs font-mono">{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(t.status)}`}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {t.current_plan_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {expiresAt ? new Date(expiresAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className={`px-4 py-3 font-bold text-sm ${dayColor}`}>
                      {days === null ? '—' : days < 0 ? 'Vencido' : `${days}d`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AdminSuscripciones() {
  const [tab, setTab] = useState('registros')

  const TABS = [
    { key: 'registros', label: 'Registros' },
    { key: 'planes', label: 'Planes' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Suscripciones</h1>
        <p className="text-gray-500 text-sm mt-0.5">Gestion de planes y suscripciones de tenants</p>
      </div>

      <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-0.5 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'registros' ? <SubscriptionsTab /> : <PlansTab />}
    </div>
  )
}
