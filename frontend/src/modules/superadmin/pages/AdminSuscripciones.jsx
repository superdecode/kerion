import { useState, useEffect } from 'react'
import {
  RefreshCw, Plus, Edit2, Trash2, X, AlertCircle, Check,
  CreditCard, Package, Eye, EyeOff, Save, ChevronUp, ChevronDown, Search, Calendar
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
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Plan</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Precio</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Limite guias</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Orden</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Estado</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Acciones</th>
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

const SUB_PAGE_SIZES = [10, 20, 50, 100]
const DEFAULT_SUB_PAGE_SIZE = 20

function SortTh({ col, label, sortKey, sortDir, onSort, cls = '' }) {
  const active = sortKey === col
  return (
    <th
      onClick={() => onSort(col)}
      className={`text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors ${cls}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {active ? (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-400" /> : <ChevronDown className="w-3 h-3 text-blue-400" />
        ) : (
          <span className="w-3 h-3 opacity-30 text-gray-500 inline-flex items-center justify-center text-[10px]">⇅</span>
        )}
      </div>
    </th>
  )
}

function SubscriptionsTab() {
  const [subscriptions, setSubscriptions] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', plan: '', dateFrom: '', dateTo: '' })
  const [sortKey, setSortKey] = useState('started_at')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_SUB_PAGE_SIZE)
  const [selectedIds, setSelectedIds] = useState(new Set())

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.status) params.append('status', filters.status)
    if (filters.plan) params.append('plan_id', filters.plan)
    if (filters.dateFrom) params.append('date_from', filters.dateFrom)
    if (filters.dateTo) params.append('date_to', filters.dateTo)

    Promise.all([
      adminApi.get(`/subscriptions?${params.toString()}`),
      adminApi.get('/plans'),
    ])
      .then(([subRes, planRes]) => {
        setSubscriptions(subRes.data.data || [])
        setPlans(planRes.data.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filters])
  useEffect(() => { setPage(1) }, [search, filters, sortKey, sortDir, pageSize])
  useEffect(() => { setSelectedIds(new Set()) }, [search, filters, sortKey, sortDir, pageSize, page])

  function toggleSort(col) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('desc') }
  }

  function getSortVal(s, key) {
    if (key === 'started_at') return new Date(s.started_at || s.created_at).getTime()
    if (key === 'expires_at') return new Date(s.expires_at || 0).getTime()
    if (key === 'legal_name') return (s.legal_name || '').toLowerCase()
    if (key === 'plan_name') return (s.plan_name || '').toLowerCase()
    if (key === 'status') return s.status || ''
    if (key === 'price') return Number(s.subscription_price_amount ?? s.price_amount ?? 0)
    return ''
  }

  const filtered = subscriptions
    .filter(s => {
      if (search) {
        const q = search.toLowerCase()
        if (!s.legal_name?.toLowerCase().includes(q) && !s.slug?.toLowerCase().includes(q)) return false
      }
      return true
    })
    .slice()
    .sort((a, b) => {
      const av = getSortVal(a, sortKey)
      const bv = getSortVal(b, sortKey)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const allSelected = paginated.length > 0 && paginated.every(s => selectedIds.has(s.id))
  const someSelected = paginated.some(s => selectedIds.has(s.id))

  function toggleAll() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        paginated.forEach(s => next.delete(s.id))
      } else {
        paginated.forEach(s => next.add(s.id))
      }
      return next
    })
  }

  function toggleRow(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Eliminar ${selectedIds.size} suscripcion${selectedIds.size !== 1 ? 'es' : ''}? Esta accion no se puede deshacer.`)) return
    try {
      await Promise.all([...selectedIds].map(id => adminApi.delete(`/subscriptions/${id}`)))
      setSelectedIds(new Set())
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar suscripciones')
    }
  }

  function statusColor(status) {
    if (status === 'active') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
    if (status === 'expired') return 'bg-red-500/15 text-red-300 border-red-500/25'
    if (status === 'cancelled') return 'bg-gray-700/50 text-gray-400 border-gray-600/50'
    return 'bg-blue-500/15 text-blue-300 border-blue-500/25'
  }

  function getTypeLabel(type) {
    return ['annual', 'anual'].includes(type) ? 'Anual' : 'Mensual'
  }

  function isAnnual(type) {
    return ['annual', 'anual'].includes(type)
  }

  const SUB_STATUS_FILTERS = ['', 'active', 'expired', 'cancelled']
  const SUB_STATUS_LABELS = { '': 'Todas', active: 'Activa', expired: 'Vencida', cancelled: 'Cancelada' }

  return (
    <div className="space-y-4">
      {/* Filters: search + date card + plan dropdown + status pills on right */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresa..."
              className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              className="text-xs outline-none bg-transparent text-gray-300 w-[108px]"
            />
            <span className="text-gray-600 text-xs">→</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              className="text-xs outline-none bg-transparent text-gray-300 w-[108px]"
            />
          </div>
          <select
            value={filters.plan}
            onChange={e => setFilters(f => ({ ...f, plan: e.target.value }))}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">Plan</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {(filters.dateFrom || filters.dateTo || filters.plan) && (
            <button
              onClick={() => setFilters(f => ({ ...f, dateFrom: '', dateTo: '', plan: '' }))}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-0.5 w-fit">
          {SUB_STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setFilters(f => ({ ...f, status: s }))}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filters.status === s ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {SUB_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-950/40 border border-blue-800/40 rounded-xl">
              <span className="text-blue-300 text-sm font-medium">
                {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Deseleccionar todo
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-colors font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar seleccionadas
              </button>
            </div>
          )}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                No hay suscripciones que coincidan con los filtros
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/40">
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                        className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">ID</th>
                    <SortTh col="legal_name" label="Empresa" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh col="plan_name" label="Plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Tipo</th>
                    <SortTh col="started_at" label="Inicio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh col="expires_at" label="Vencimiento" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh col="status" label="Estado" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh col="price" label="Precio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {paginated.map(s => {
                    const price = isAnnual(s.subscription_type)
                      ? (s.subscription_price_amount ?? s.price_annual ?? s.price_amount)
                      : (s.subscription_price_amount ?? s.price_amount)
                    return (
                      <tr key={s.id} className={`hover:bg-gray-800/20 transition-colors ${selectedIds.has(s.id) ? 'bg-blue-950/20' : ''}`}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleRow(s.id)}
                            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.id.slice(0, 8)}</td>
                        <td className="px-4 py-3">
                          <p className="text-white font-medium text-sm">{s.legal_name}</p>
                          <p className="text-gray-500 text-xs">{s.slug}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm">{s.plan_name}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{getTypeLabel(s.subscription_type)}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.started_at).toLocaleDateString('es-MX')}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.expires_at).toLocaleDateString('es-MX')}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(s.status)}`}>
                            {s.status === 'active' ? 'Activa' : s.status === 'expired' ? 'Vencida' : 'Cancelada'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white">
                          {price ? `$${Number(price).toFixed(2)} ${s.price_currency || 'USD'}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {filtered.length === 0 ? '0' : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)}`} de {filtered.length} suscripciones
            </p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500 transition-colors"
              >
                {SUB_PAGE_SIZES.map(s => <option key={s} value={s}>{s} / pág</option>)}
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
