import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAdminAuthStore } from '../stores/adminAuthStore'
import {
  LayoutDashboard, Building2, FileText, Bell, LogOut,
  ChevronLeft, ChevronRight, Shield, BarChart3, CreditCard, Lock, X, Eye, EyeOff
} from 'lucide-react'
import adminApi from '../services/adminApi'

const NAV = [
  { to: '/super-admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/super-admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/super-admin/solicitudes', label: 'Solicitudes', icon: FileText },
  { to: '/super-admin/suscripciones', label: 'Suscripciones', icon: CreditCard },
  { to: '/super-admin/notificaciones', label: 'Notificaciones', icon: Bell },
  { to: '/super-admin/analytics', label: 'Analiticas', icon: BarChart3 },
]

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [show, setShow] = useState({ current: false, next: false, confirm: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.current || !form.next || !form.confirm) return setError('Todos los campos son requeridos')
    if (form.next !== form.confirm) return setError('Las contraseñas nuevas no coinciden')
    if (form.next.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    setSaving(true)
    setError('')
    try {
      await adminApi.post('/auth/change-password', { current_password: form.current, new_password: form.next })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar contraseña')
    } finally {
      setSaving(false)
    }
  }

  function toggleShow(field) {
    setShow(s => ({ ...s, [field]: !s[field] }))
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors pr-10'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Cambiar contraseña</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {success ? (
          <div className="text-center py-4">
            <p className="text-emerald-400 text-sm font-medium">Contraseña actualizada</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <p className="text-red-400 text-xs">{error}</p>}
            {[
              { key: 'current', label: 'Contraseña actual' },
              { key: 'next', label: 'Nueva contraseña' },
              { key: 'confirm', label: 'Confirmar nueva contraseña' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <div className="relative">
                  <input
                    type={show[key] ? 'text' : 'password'}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow(key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm rounded-lg transition-colors font-medium"
              >
                {saving ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { admin, logout } = useAdminAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)

  function handleLogout() {
    logout()
    navigate('/super-admin/login', { replace: true })
  }

  const initials = admin?.name
    ? admin.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'SA'

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}

      {/* Sidebar */}
      <aside
        className={`relative ${collapsed ? 'w-16' : 'w-60'} bg-[#0b1437] border-r border-blue-900/40 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="absolute -right-3.5 top-[4.5rem] z-20 w-7 h-7 rounded-full bg-white border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-50 flex items-center justify-center transition-colors shadow-md"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
            : <ChevronLeft className="w-3.5 h-3.5 text-blue-600" />}
        </button>

        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-blue-900/40 ${collapsed ? 'justify-center px-3' : 'px-5 gap-3'}`}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-none">Kirion</p>
              <p className="text-blue-400 text-[10px] font-semibold uppercase tracking-widest mt-0.5">Super Admin</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                  isActive
                    ? 'bg-blue-600/25 text-blue-300 border border-blue-500/30'
                    : 'text-blue-200/70 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: user info + actions */}
        <div className="p-2 border-t border-blue-900/40 space-y-0.5">
          {/* Avatar + name */}
          <div className={`flex items-center gap-2.5 px-3 py-2 mb-1 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0 ring-2 ring-blue-600/40">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-semibold truncate">{admin?.name}</p>
                <p className="text-gray-500 text-[10px] truncate">{admin?.email}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowChangePwd(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-200/60 hover:text-blue-300 hover:bg-white/5 transition-colors"
            title="Cambiar contraseña"
          >
            <Lock className="w-4 h-4 flex-shrink-0" />
            {!collapsed && 'Cambiar contraseña'}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-200/60 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            title="Cerrar sesion"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && 'Cerrar sesion'}
          </button>
        </div>
      </aside>

      {/* Main content — no top bar */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
