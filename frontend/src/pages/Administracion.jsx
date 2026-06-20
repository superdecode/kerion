import { useState, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../core/components/layout/Header'
import Modal from '../core/components/common/Modal'
import LoadingSpinner from '../core/components/common/LoadingSpinner'
import { useAuthStore } from '../core/stores/authStore'
import { useToastStore } from '../core/stores/toastStore'
import { useI18nStore } from '../core/stores/i18nStore'
import { getToday, fmtDate } from '../core/utils/dateFormat'
import api from '../core/services/api'
import {
  Users, Shield, Plus, Search, Edit3, Trash2, ToggleLeft, ToggleRight,
  Key, Copy, ChevronDown, CheckCircle, XCircle, Settings2, Check,
  CreditCard, Clock, AlertTriangle, RefreshCw, ChevronRight, Zap
} from 'lucide-react'

// Module definitions for scalable permission system
const MODULE_GROUPS = [
  {
    group: 'DropScan',
    groupKey: 'admin.group.dropscan',
    modules: [
      { key: 'dropscan.dashboard',    label: 'Dashboard',     labelKey: 'perm.sub.dashboard' },
      { key: 'dropscan.escaneo',      label: 'Escaneo',       labelKey: 'perm.sub.escaneo' },
      { key: 'dropscan.tarimas',       label: 'Tarimas',       labelKey: 'perm.sub.tarimas' },
      { key: 'fep.folios',            label: 'Folios',        labelKey: 'perm.sub.folios' },
      { key: 'dropscan.reportes',     label: 'Reportes',      labelKey: 'perm.sub.reportes' },
      { key: 'dropscan.configuracion',label: 'Configuración', labelKey: 'perm.sub.configuracion' },
    ]
  },
  {
    group: 'Devoluciones',
    groupKey: 'perm.group.devoluciones',
    modules: [
      { key: 'devoluciones.dashboard',  label: 'Dashboard',  labelKey: 'perm.sub.dashboard' },
      { key: 'devoluciones.entradas',   label: 'Entradas',   labelKey: 'perm.sub.dev.entradas' },
      { key: 'devoluciones.inventario', label: 'Inventario', labelKey: 'perm.sub.dev.inventario' },
      { key: 'devoluciones.salidas',    label: 'Salidas',    labelKey: 'perm.sub.dev.salidas' },
    ]
  },
  {
    group: 'Recepción',
    groupKey: 'perm.group.recepcion',
    modules: [
      { key: 'recepcion.dashboard', label: 'Dashboard', labelKey: 'perm.sub.dashboard' },
      { key: 'recepcion.recibir',   label: 'Recibir',   labelKey: 'perm.sub.recepcion.recibir' },
      { key: 'recepcion.validacion', label: 'Validación', labelKey: 'perm.sub.recepcion.validar' },
    ]
  },
  {
    group: 'Inventario',
    groupKey: 'perm.group.inventario',
    modules: [
      { key: 'inventario.dashboard', label: 'Dashboard', labelKey: 'perm.sub.dashboard' },
      { key: 'inventario.escaneo',   label: 'Escaneo',   labelKey: 'perm.sub.inventario.escaneo' },
      { key: 'inventario.registros', label: 'Registros', labelKey: 'perm.sub.inventario.registros' },
      { key: 'inventario.rastreo',   label: 'Rastreo',   labelKey: 'perm.sub.inventario.rastreo' },
    ]
  },
  {
    group: 'Surtido',
    groupKey: 'perm.group.surtido',
    modules: [
      { key: 'surtido.dashboard',  label: 'Dashboard', labelKey: 'perm.sub.dashboard' },
      { key: 'surtido.validacion', label: 'Validar',   labelKey: 'perm.sub.surtido.validar' },
      { key: 'surtido.ordenes',    label: 'Órdenes',   labelKey: 'perm.sub.surtido.ordenes' },
      { key: 'surtido.registros',  label: 'Registros', labelKey: 'perm.sub.surtido.registros' },
    ]
  },
  {
    group: 'Despacho',
    groupKey: 'perm.group.despacho',
    modules: [
      { key: 'despacho.dashboard', label: 'Dashboard', labelKey: 'perm.sub.dashboard' },
      { key: 'despacho.validar',   label: 'Validar',   labelKey: 'perm.sub.despacho.validar' },
      { key: 'despacho.ordenes',   label: 'Órdenes',   labelKey: 'perm.sub.despacho.ordenes' },
      { key: 'despacho.folios',    label: 'Folios',    labelKey: 'perm.sub.despacho.folios' },
    ]
  },
  {
    group: 'Anormalidades',
    groupKey: 'perm.group.anormalidades',
    modules: [
      { key: 'anormalidades.dashboard',     label: 'Dashboard',     labelKey: 'perm.sub.anorm.dashboard' },
      { key: 'anormalidades.registro',      label: 'Anormalidades', labelKey: 'perm.sub.anorm.registro' },
      { key: 'anormalidades.mejoras',       label: 'Mejoras',       labelKey: 'perm.sub.anorm.mejoras' },
      { key: 'anormalidades.configuracion', label: 'Configuración', labelKey: 'perm.sub.anorm.config' },
    ]
  },
  {
    group: 'Sistema',
    groupKey: 'admin.group.sistema',
    modules: [
      { key: 'global.administracion',label: 'Administración', labelKey: 'perm.sub.administracion' },
      { key: 'sistema.wms',          label: 'Conexión WMS',   labelKey: 'perm.sub.sistema.wms' },
    ]
  },
]

const PERM_LEVELS = [
  { value: 'sin_acceso', label: 'Sin acceso', color: 'bg-warm-100 text-warm-500' },
  { value: 'ver', label: 'Ver', color: 'bg-warning-100 text-warning-700' },
  { value: 'crear', label: 'Crear', color: 'bg-success-100 text-success-700' },
  { value: 'actualizar', label: 'Actualizar', color: 'bg-accent-100 text-accent-700' },
  { value: 'eliminar', label: 'Eliminar', color: 'bg-primary-100 text-primary-700' },
]

const LEVEL_ORDER = ['sin_acceso', 'ver', 'crear', 'actualizar', 'eliminar']

function CopyHoverText({ value, className = '' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (event) => {
    event.stopPropagation()
    if (!value) return
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch { /* ignore */ }
  }

  return (
    <div className={`group inline-flex max-w-full items-center gap-1.5 ${className}`}>
      <span className="truncate">{value || '—'}</span>
      {value ? (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-0.5 text-warm-300 opacity-0 transition-all hover:bg-warm-100 hover:text-primary-600 group-hover:opacity-100"
          title="Copiar"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  )
}

// Legacy level mapping (for data that wasn't fully migrated)
const LEGACY_MAP = { total: 'eliminar', gestion: 'actualizar', escritura: 'crear', lectura: 'ver' }
function normalizeLevel(level) {
  if (!level) return 'sin_acceso'
  const lvl = String(level).toLowerCase()
  return LEGACY_MAP[lvl] || lvl
}

// Deep-normalize all permission values in a permissions object
function deepNormalize(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    result[key] = typeof val === 'string' ? normalizeLevel(val) : deepNormalize(val)
  }
  return result
}

// API helpers
const getUsers = async () => { const { data } = await api.get('/users'); return data }
const getRoles = async () => { const { data } = await api.get('/roles'); return data }

const isActive = (u) => u.estado !== 'INACTIVO' && u.activo !== false

// ═══════════ PLAN TAB ═══════════
const RENEWAL_LS_KEY = 'kirion_renewal_last_sent'

function PlanTab() {
  const { user } = useAuthStore()
  const { t } = useI18nStore()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showRenew, setShowRenew] = useState(false)
  const [renewSent, setRenewSent] = useState(false)
  const [renewLoading, setRenewLoading] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [previousRequest, setPreviousRequest] = useState(null)

  useEffect(() => {
    api.get('/auth/plan-info')
      .then(r => setInfo(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function daysLeft(dateStr) {
    if (!dateStr) return null
    return Math.ceil((new Date(dateStr) - Date.now()) / 86400000)
  }

  const expiresAt = info?.expires_at || info?.trial_expires_at
  const days = daysLeft(expiresAt)
  const daysColor = days === null ? 'text-gray-400' : days < 0 ? 'text-red-500' : days <= 7 ? 'text-red-400' : days <= 30 ? 'text-amber-400' : 'text-emerald-500'

  const guideLimit = info?.guide_limit
  const guidesUsed = info?.guides_this_month ?? 0
  const guidePercent = guideLimit ? Math.min((guidesUsed / guideLimit) * 100, 100) : 0
  const guideBarColor = guidePercent > 90 ? 'bg-red-500' : guidePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'

  function getTodayStr() {
    return getToday()
  }

  async function handleRenewSubmit(e) {
    if (e && e.preventDefault) e.preventDefault()
    const stored = localStorage.getItem(RENEWAL_LS_KEY)
    if (stored) {
      try {
        const { date, data } = JSON.parse(stored)
        if (date === getTodayStr()) {
          setPreviousRequest(data)
          setShowDuplicateModal(true)
          return
        }
      } catch {}
    }
    setRenewLoading(true)
    const requestData = {
      tenant_name: user?.tenant_name || '',
      contact_name: user?.nombre_completo || '',
      contact_email: user?.tenant_contact_email || user?.email || '',
      current_plan: info?.plan_code || 'unknown',
      message: '',
    }
    try {
      await fetch('/api/public/renewal-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      })
      localStorage.setItem(RENEWAL_LS_KEY, JSON.stringify({ date: getTodayStr(), data: requestData }))
      setRenewSent(true)
    } catch {
      setRenewSent(true)
    } finally {
      setRenewLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="pt-2 w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: plan info */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-warm-400 font-medium uppercase tracking-wider">{t('plan.current_plan')}</p>
              <p className="text-warm-800 font-bold text-lg leading-none mt-0.5 truncate">
                {info?.plan_name || (info?.tenant_status === 'trial' ? t('plan.trial') : t('plan.no_plan'))}
              </p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${
              info?.tenant_status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
              info?.tenant_status === 'trial' ? 'bg-blue-100 text-blue-700 border-blue-200' :
              'bg-orange-100 text-orange-700 border-orange-200'
            }`}>
              {info?.tenant_status === 'active' ? t('plan.status_active') : info?.tenant_status === 'trial' ? t('plan.status_trial') : t('plan.status_expired')}
            </span>
          </div>

          <div className="border-t border-warm-100 pt-4 space-y-2.5">
            {guideLimit != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-600 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-warm-400" />
                  {t('plan.guides_this_month')}
                </span>
                <span className="font-semibold text-warm-800">
                  {guideLimit.toLocaleString()}
                </span>
              </div>
            )}
            {info?.plan_name && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-600">{t('plan.current_plan')}</span>
                <span className="font-semibold text-warm-800">{info.plan_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right column: dates, usage, renewal */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            {/* Expiry */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-warm-600 text-sm">
                <Clock className="w-4 h-4 text-warm-400" />
                {t('plan.expiry')}
              </div>
              <div className="text-right">
                {expiresAt ? (
                  <>
                    <p className="text-warm-800 text-sm font-medium">
                      {fmtDate(expiresAt)}
                    </p>
                    <p className={`text-xs font-bold ${daysColor}`}>
                      {days === null ? '' : days < 0 ? t('plan.expired') : days === 0 ? t('plan.expires_today') : `${days} ${t('plan.days_remaining')}`}
                    </p>
                  </>
                ) : (
                  <p className="text-warm-400 text-sm">{t('plan.no_expiry')}</p>
                )}
              </div>
            </div>

            {/* Guide usage bar */}
            {guideLimit != null && (
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-warm-600">{t('plan.guides_this_month')}</span>
                  <span className="font-semibold text-warm-800">
                    {guidesUsed.toLocaleString()} / {guideLimit.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2 bg-warm-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${guideBarColor}`}
                    style={{ width: `${guidePercent}%` }}
                  />
                </div>
                {guidePercent > 90 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t('plan.near_guide_limit')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Renewal card */}
          <div className="card p-5">
            <h3 className="text-warm-800 font-semibold text-sm mb-2">{t('plan.renew_title')}</h3>
            <p className="text-warm-500 text-sm mb-4">
              {t('plan.renew_description')}
            </p>
            {renewSent ? (
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <CheckCircle className="w-4 h-4" />
                {t('plan.request_sent')}
              </div>
            ) : (
              <button
                onClick={handleRenewSubmit}
                disabled={renewLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {renewLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {t('plan.request_renewal')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Duplicate renewal request modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-depth w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-warning-600" />
              </div>
              <h3 className="text-warm-800 font-bold">{t('plan.renew_title')}</h3>
            </div>
            <p className="text-sm text-warm-600">
              Ya enviaste una solicitud de renovacion hoy. Te contactaremos pronto.
            </p>
            {previousRequest && (
              <div className="text-xs bg-warm-50 rounded-xl p-3 space-y-1 text-warm-500">
                <p><span className="font-semibold text-warm-700">Empresa:</span> {previousRequest.tenant_name}</p>
                <p><span className="font-semibold text-warm-700">Contacto:</span> {previousRequest.contact_email}</p>
                <p><span className="font-semibold text-warm-700">Plan:</span> {previousRequest.current_plan}</p>
              </div>
            )}
            <button
              onClick={() => setShowDuplicateModal(false)}
              className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Administracion() {
  const { t } = useI18nStore()
  const [tab, setTab] = useState('usuarios')
  const { canWrite, canDelete } = useAuthStore()
  const canEditAdmin = canWrite('global.administracion')
  const canDeleteAdmin = canDelete('global.administracion')

  return (
    <div className="flex flex-col h-full">
      <Header title={t('admin.title')} subtitle={t('admin.subtitle')} />

      <div className="flex-1 overflow-y-auto">
        {/* Tab bar */}
        <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6">
          <div className="flex gap-1">
            {[
              { key: 'usuarios', label: t('admin.users'), icon: Users },
              { key: 'roles', label: t('admin.roles'), icon: Shield },
              { key: 'plan', label: t('admin.tab.plan'), icon: CreditCard },
            ].map(item => (
              <button key={item.key} onClick={() => setTab(item.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-200
                  ${tab === item.key
                    ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                    : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                  }`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="max-w-full mx-auto">
            {tab === 'usuarios' ? (
              <UsersTab canEdit={canEditAdmin} canDel={canDeleteAdmin} />
            ) : tab === 'roles' ? (
              <RolesTab canEdit={canEditAdmin} canDel={canDeleteAdmin} />
            ) : (
              <PlanTab />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════ PASSWORD RESET MODAL ═══════════
function PasswordResetModal({ isOpen, onClose, user }) {
  const [password, setPassword] = useState('')
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { t } = useI18nStore()

  useEffect(() => {
    if (isOpen) setPassword('')
  }, [isOpen])

  const mutation = useMutation({
    mutationFn: (data) => api.post(`/users/${user.id}/reset-password`, data),
    onSuccess: () => { toast.success(t('admin.passwordReset')); qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose() },
    onError: (e) => toast.error(e.response?.data?.error || t('toast.error'))
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!password.trim()) { toast.warning(t('admin.passwordCreate')); return }
    mutation.mutate({ password })
  }

  if (!user) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t('admin.resetPasswordTitle')}: ${user.nombre_completo}`} icon={Key} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
        <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary">
          {mutation.isPending ? t('admin.saving') : t('admin.resetPasswordTitle')}
        </button>
      </>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('admin.newPassword')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="input-field" required autoFocus />
        </div>
      </form>
    </Modal>
  )
}

// ═══════════ USERS TAB ═══════════
function UsersTab({ canEdit, canDel }) {
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [resetUser, setResetUser] = useState(null)
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { t } = useI18nStore()
  const backendOnline = useAuthStore((s) => s.backendOnline)

  const { data, isLoading, isError: usersError } = useQuery({ queryKey: ['admin-users'], queryFn: getUsers, retry: 0, enabled: backendOnline })
  const { data: rolesData } = useQuery({ queryKey: ['admin-roles'], queryFn: getRoles, retry: 0, enabled: backendOnline })
  const users = data?.usuarios || data?.users || []
  const roles = rolesData?.roles || []

  const filtered = search
    ? users.filter(u => u.nombre_completo?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()) || u.codigo?.toLowerCase().includes(search.toLowerCase()))
    : users

  const toggleMutation = useMutation({
    mutationFn: (user) => api.put(`/users/${user.id}`, {
      nombre_completo: user.nombre_completo,
      email: user.email,
      rol_id: user.rol_id,
      estado: isActive(user) ? 'INACTIVO' : 'ACTIVO',
    }),
    onSuccess: () => { toast.success(t('common.status')); qc.invalidateQueries({ queryKey: ['admin-users'] }) },
    onError: () => toast.error(t('toast.error'))
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => { toast.success(t('admin.userDeleted')); qc.invalidateQueries({ queryKey: ['admin-users'] }) },
    onError: (e) => toast.error(e.response?.data?.error || t('toast.error'))
  })

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin.searchUsers')}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-warm-200 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100" />
        </div>
        <span className="badge bg-warm-100 text-warm-500">{filtered.length} {t('admin.users')}</span>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 ml-auto">
            <Plus className="w-4 h-4" /> {t('admin.newUser')}
          </button>
        )}
      </div>

      {/* Users table */}
      {isLoading ? <LoadingSpinner text={t('admin.loadingUsers')} /> : usersError ? (
        <div className="card p-6 text-center text-warm-500">{t('admin.errorUsers')}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-warm-50 to-purple-50 border-b border-warm-200">
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.userName')}</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.email')}</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.userCode')}</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.role')}</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('common.status')}</th>
                  {canEdit && <th className="text-right px-4 py-3 font-bold text-warm-600">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {filtered.map(u => {
                  const initials = u.nombre_completo?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
                  const role = roles.find(r => r.id === u.rol_id)
                  return (
                    <tr key={u.id} className="hover:bg-purple-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
                            {initials}
                          </div>
                          <span className="font-semibold text-warm-800">{u.nombre_completo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-warm-600">
                        <CopyHoverText value={u.email} />
                      </td>
                      <td className="px-4 py-3 font-mono text-warm-500">{u.codigo}</td>
                      <td className="px-4 py-3">
                        <span className="badge bg-primary-100 text-primary-700">{role?.nombre || u.rol_nombre || t('admin.sinRol')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${isActive(u) ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700'}`}>
                          {isActive(u) ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditUser(u)} className="p-2 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all" title={t('common.edit')}>
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => toggleMutation.mutate(u)}
                              className="p-2 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all" title={isActive(u) ? t('admin.deactivate') : t('admin.activate')}>
                              {isActive(u) ? <ToggleRight className="w-4 h-4 text-success-500" /> : <ToggleLeft className="w-4 h-4 text-warm-400" />}
                            </button>
                            <button onClick={() => setResetUser(u)} className="p-2 rounded-lg hover:bg-warning-50 text-warm-400 hover:text-warning-600 transition-all" title={t('admin.resetPassword')}>
                              <Key className="w-4 h-4" />
                            </button>
                            {canDel && !u.is_default && (
                              <button onClick={() => { if (confirm(`${t('admin.confirmDeleteUser')}`)) deleteMutation.mutate(u.id) }}
                                className="p-2 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all" title={t('common.delete')}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit User Modal */}
      <UserFormModal isOpen={showCreate || !!editUser} onClose={() => { setShowCreate(false); setEditUser(null) }}
        user={editUser} roles={roles} />

      {/* Password Reset Modal */}
      <PasswordResetModal isOpen={!!resetUser} onClose={() => setResetUser(null)} user={resetUser} />
    </div>
  )
}

function UserFormModal({ isOpen, onClose, user, roles }) {
  const [form, setForm] = useState({ nombre_completo: '', email: '', codigo: '', password: '', rol_id: '', estado: 'ACTIVO' })
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { t } = useI18nStore()

  useEffect(() => {
    if (user) {
      setForm({
        nombre_completo: user.nombre_completo || '',
        email: user.email || '',
        codigo: user.codigo || '',
        password: '',
        rol_id: user.rol_id || '',
        estado: user.estado || (isActive(user) ? 'ACTIVO' : 'INACTIVO'),
      })
    } else {
      setForm({ nombre_completo: '', email: '', codigo: '', password: '', rol_id: '', estado: 'ACTIVO' })
    }
  }, [user])

  const mutation = useMutation({
    mutationFn: (data) => user ? api.put(`/users/${user.id}`, data) : api.post('/users', data),
    onSuccess: () => { toast.success(user ? t('admin.userUpdated') : t('admin.userCreated')); qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose() },
    onError: (e) => toast.error(e.response?.data?.error || t('toast.error'))
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = { ...form, rol_id: parseInt(form.rol_id) || undefined }
    if (!user && !payload.password) { toast.warning(t('admin.passwordCreate')); return }
    if (user && !payload.password) delete payload.password
    mutation.mutate(payload)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={user ? t('admin.editUser') : t('admin.newUser')} icon={Users} size="md"
      footer={<>
        <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
        <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary">
          {mutation.isPending ? t('admin.saving') : user ? t('admin.update') : t('admin.newUser')}
        </button>
      </>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('admin.fullName')}</label>
          <input value={form.nombre_completo} onChange={e => setForm(f => ({ ...f, nombre_completo: e.target.value }))}
            className="input-field" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('admin.email')}</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('admin.userCode')}</label>
            <input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              className="input-field" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">
            {user ? t('admin.passwordNew') : t('admin.passwordCreate')}
          </label>
          <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            className="input-field" {...(!user ? { required: true } : {})} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('admin.role')}</label>
          <select value={form.rol_id} onChange={e => setForm(f => ({ ...f, rol_id: e.target.value }))} className="select-field" required>
            <option value="">{t('admin.selectRole')}</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}{r.descripcion ? ` — ${r.descripcion}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('common.status')}</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, estado: f.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO' }))}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                form.estado === 'ACTIVO'
                  ? 'bg-success-100 text-success-700 ring-1 ring-success-200'
                  : 'bg-danger-100 text-danger-700 ring-1 ring-danger-200'
              }`}>
              {form.estado === 'ACTIVO' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {form.estado === 'ACTIVO' ? t('common.active') : t('common.inactive')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ═══════════ ROLES TAB ═══════════
function RolesTab({ canEdit, canDel }) {
  const [editRole, setEditRole] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { t } = useI18nStore()
  const backendOnline = useAuthStore((s) => s.backendOnline)

  const { data, isLoading, isError: rolesError } = useQuery({ queryKey: ['admin-roles'], queryFn: getRoles, retry: 0, enabled: backendOnline })
  const { data: usersData } = useQuery({ queryKey: ['admin-users'], queryFn: getUsers, retry: 0, enabled: backendOnline })
  const roles = data?.roles || data || []
  const users = usersData?.usuarios || usersData?.users || []

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/roles/${id}`),
    onSuccess: () => { toast.success('Rol eliminado'); qc.invalidateQueries({ queryKey: ['admin-roles'] }) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error eliminando rol')
  })

  const duplicateMutation = useMutation({
    mutationFn: (role) => api.post(`/roles/${role.id}/duplicate`),
    onSuccess: () => { toast.success('Rol duplicado'); qc.invalidateQueries({ queryKey: ['admin-roles'] }) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error duplicando')
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="badge bg-warm-100 text-warm-500">{roles.length} {t('admin.rolesLabel')}</span>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 ml-auto">
            <Plus className="w-4 h-4" /> {t('admin.newRole')}
          </button>
        )}
      </div>

      {isLoading ? <LoadingSpinner text={t('admin.loadingRoles')} /> : rolesError ? (
        <div className="card p-6 text-center text-warm-500">{t('admin.errorRoles')}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-warm-50 to-purple-50 border-b border-warm-200">
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.roles')}</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.description')}</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.users')}</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">{t('admin.permissions')}</th>
                  {canEdit && <th className="text-right px-4 py-3 font-bold text-warm-600">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {roles.map(r => {
                  const userCount = users.filter(u => u.rol_id === r.id).length
                  return (
                    <tr key={r.id} className="hover:bg-purple-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 text-white flex items-center justify-center shadow-sm shrink-0">
                            <Shield className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-warm-800">{r.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-warm-600">{r.descripcion || t('admin.sinDescripcion')}</td>
                      <td className="px-4 py-3">
                        <span className="badge bg-warm-100 text-warm-500">{userCount}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-sm">
                          {(() => {
                            const accessible = []
                            if (r.permisos && typeof r.permisos === 'object') {
                              MODULE_GROUPS.forEach(g => {
                                g.modules.forEach(m => {
                                  const parts = m.key.split('.')
                                  const level = parts.length === 2
                                    ? r.permisos[parts[0]]?.[parts[1]]
                                    : r.permisos[parts[0]]
                                  if (level && level !== 'sin_acceso') accessible.push(t(m.labelKey) || m.label)
                                })
                              })
                            }
                            if (accessible.length === 0) {
                              return <span className="text-[11px] text-warm-400">{t('admin.noAccess')}</span>
                            }
                            return (
                              <>
                                {accessible.slice(0, 6).map((label, i) => (
                                  <span key={i} className="badge bg-primary-100 text-primary-700 text-[10px]">{label}</span>
                                ))}
                                {accessible.length > 6 && (
                                  <span className="badge bg-warm-100 text-warm-400 text-[10px]">+{accessible.length - 6}</span>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditRole(r)} className="p-2 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all" title={t('admin.editPerms')}>
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => duplicateMutation.mutate(r)} className="p-2 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all" title={t('admin.duplicateRole')}>
                              <Copy className="w-4 h-4" />
                            </button>
                            {canDel && !r.is_default && userCount === 0 && (
                              <button onClick={() => { if (confirm(`${t('admin.confirmDeleteRole')}`)) deleteMutation.mutate(r.id) }}
                                className="p-2 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all" title={t('common.delete')}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RoleFormModal isOpen={showCreate || !!editRole} onClose={() => { setShowCreate(false); setEditRole(null) }} role={editRole} />
    </div>
  )
}

function PermCheckbox({ checked, onChange, variant = 'perm' }) {
  const isModule = variant === 'module'
  return (
    <button
      type="button"
      onClick={onChange}
      className={`rounded-full flex items-center justify-center border-2 transition-all duration-150 shrink-0
        ${isModule ? 'w-5 h-5' : 'w-[17px] h-[17px] mx-auto'}
        ${checked
          ? isModule
            ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
            : 'bg-primary-300 border-primary-300 text-white'
          : 'bg-white border-warm-300 hover:border-primary-400 hover:bg-primary-50'
        }`}
    >
      {checked && <Check className={isModule ? 'w-2.5 h-2.5' : 'w-2 h-2'} strokeWidth={3} />}
    </button>
  )
}

function RoleFormModal({ isOpen, onClose, role }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [permisos, setPermisos] = useState({})
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { t } = useI18nStore()
  const colLabels = [
    { key: 'ver', label: t('admin.view'), level: 'ver' },
    { key: 'crear', label: t('admin.create'), level: 'crear' },
    { key: 'actualizar', label: t('admin.update'), level: 'actualizar' },
    { key: 'eliminar', label: t('admin.delete'), level: 'eliminar' },
  ]

  // Populate
  useEffect(() => {
    if (role) {
      setNombre(role.nombre || '')
      setDescripcion(role.descripcion || '')
      setPermisos(role.permisos && typeof role.permisos === 'object' ? deepNormalize(role.permisos) : {})
    } else {
      setNombre('')
      setDescripcion('')
      setPermisos({})
    }
  }, [role])

  const mutation = useMutation({
    mutationFn: (data) => role ? api.put(`/roles/${role.id}`, data) : api.post('/roles', data),
    onSuccess: () => { toast.success(role ? 'Rol actualizado' : 'Rol creado'); qc.invalidateQueries({ queryKey: ['admin-roles'] }); onClose() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error guardando rol')
  })

  const setPermLevel = (moduleKey, level) => {
    const parts = moduleKey.split('.')
    setPermisos(prev => {
      const next = { ...prev }
      if (parts.length === 2) {
        if (!next[parts[0]]) next[parts[0]] = {}
        next[parts[0]] = { ...next[parts[0]], [parts[1]]: level }
      } else {
        next[parts[0]] = level
      }
      return next
    })
  }

  const getPermLevel = (moduleKey) => {
    const parts = moduleKey.split('.')
    if (parts.length === 2) return normalizeLevel(permisos[parts[0]]?.[parts[1]])
    return normalizeLevel(permisos[parts[0]])
  }

  const handleSubmit = () => {
    if (!nombre.trim()) { toast.warning('El nombre es requerido'); return }
    mutation.mutate({ nombre, descripcion, permisos })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={role ? `Editar: ${role.nombre}` : 'Nuevo Rol'} icon={Shield} size="xl"
      footer={<>
        <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
        <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary">
          {mutation.isPending ? t('admin.saving') : role ? t('admin.editRole') : t('admin.addRole')}
        </button>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('admin.roleName')}</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('admin.description')}</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} className="input-field" />
          </div>
        </div>

        {/* Permission matrix */}
        <div>
          <h4 className="text-xs font-bold text-warm-400 uppercase tracking-wider mb-3">{t('admin.permsByModule')}</h4>
          <div className="rounded-xl border border-warm-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-primary-600 to-primary-700">
                  <th className="text-left px-4 py-3 text-white font-semibold text-xs uppercase tracking-wide w-[42%]">{t('admin.module')}</th>
                  {colLabels.map(col => (
                    <th key={col.key} className="text-center px-3 py-3 text-white font-semibold text-xs uppercase tracking-wide">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULE_GROUPS.map(g => (
                  <Fragment key={g.groupKey}>
                    <tr className="bg-primary-50 border-y border-primary-100">
                      <td colSpan={5} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-primary-600">
                        {t(g.groupKey) || g.group}
                      </td>
                    </tr>
                    {g.modules.map((m, i) => {
                      const current = getPermLevel(m.key)
                      const enabled = current !== 'sin_acceso'
                      return (
                        <tr key={m.key} className={`border-b border-warm-100 transition-colors hover:bg-primary-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-warm-50/30'}`}>
                          <td className="px-4 py-2.5">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none w-full">
                              <PermCheckbox
                                checked={enabled}
                                onChange={() => setPermLevel(m.key, enabled ? 'sin_acceso' : 'eliminar')}
                                variant="module"
                              />
                              <span className={`text-sm font-medium leading-snug ${enabled ? 'text-warm-800' : 'text-warm-400'}`}>{t(m.labelKey) || m.label}</span>
                            </label>
                          </td>
                          {colLabels.map(col => {
                            const colIdx = LEVEL_ORDER.indexOf(col.level)
                            const curIdx = LEVEL_ORDER.indexOf(current)
                            const checked = curIdx >= colIdx
                            return (
                              <td key={col.key} className="text-center px-3 py-2.5">
                                <PermCheckbox
                                  checked={checked}
                                  onChange={() => {
                                    if (curIdx >= colIdx) {
                                      setPermLevel(m.key, LEVEL_ORDER[colIdx - 1])
                                    } else {
                                      setPermLevel(m.key, col.level)
                                    }
                                  }}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
