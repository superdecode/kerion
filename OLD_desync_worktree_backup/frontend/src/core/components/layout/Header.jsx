import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import SearchBar from '../common/SearchBar'
import Modal from '../common/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import api from '../../services/api'
import { useToastStore } from '../../stores/toastStore'
import {
  Search, X, User, LogOut, Key, Settings, Globe, ChevronDown,
  Shield, Clock, Activity
} from 'lucide-react'

export default function Header({ title, subtitle, actions, showSearch = false }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [changePassOpen, setChangePassOpen] = useState(false)
  const [changePassData, setChangePassData] = useState({ current: '', nuevo: '', confirmar: '' })
  const [changePassError, setChangePassError] = useState('')
  const [changePassLoading, setChangePassLoading] = useState(false)
  const [changePassSuccess, setChangePassSuccess] = useState(false)
  const { user, logout, updateTimezone } = useAuthStore()
  const { locale, setLocale, t } = useI18nStore()
  const [savingTz, setSavingTz] = useState(false)
  const navigate = useNavigate()
  const menuRef = useRef(null)

  const initials = user?.nombre_completo
    ? user.nombre_completo.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') { setSearchOpen(false); setUserMenuOpen(false) } }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const resetChangePass = () => {
    setChangePassData({ current: '', nuevo: '', confirmar: '' })
    setChangePassError('')
    setChangePassSuccess(false)
  }

  const handleChangePassword = async () => {
    const { current, nuevo, confirmar } = changePassData
    if (!current || !nuevo || !confirmar) { setChangePassError('Todos los campos son requeridos'); return }
    if (nuevo.length < 6) { setChangePassError('La nueva contraseña debe tener al menos 6 caracteres'); return }
    if (nuevo !== confirmar) { setChangePassError('Las contraseñas no coinciden'); return }
    setChangePassLoading(true)
    setChangePassError('')
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: nuevo })
      setChangePassSuccess(true)
      setTimeout(() => { setChangePassOpen(false); resetChangePass() }, 1500)
    } catch (err) {
      setChangePassError(err.response?.data?.error || 'Error al cambiar contraseña')
    } finally {
      setChangePassLoading(false)
    }
  }

  return (
    <>
      <header className="h-16 bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6 flex items-center gap-3 shrink-0 sticky top-0 z-10">
        {/* Title */}
        <div className="flex-1 min-w-0">
          {title && (
            <div>
              <h1 className="text-lg font-bold text-warm-800 truncate">{title}</h1>
              {subtitle && <p className="text-[11px] text-warm-400 truncate font-medium">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Actions from page */}
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}

        {/* Collapsible search - only shown on historial/escaneo */}
        {showSearch && (
          <div className="relative">
            {searchOpen ? (
              <div className="flex items-center gap-2 animate-scale-in">
                <SearchBar />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-2 rounded-xl text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2.5 rounded-xl text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200"
                title={t('common.search')}
              >
                <Search className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>
        )}

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl
                       hover:bg-warm-100 transition-all duration-200 group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600
                            text-white flex items-center justify-center text-[11px] font-bold shadow-sm">
              {initials}
            </div>
            {user && (
              <div className="hidden md:block text-left">
                <p className="text-[13px] font-semibold text-warm-700 leading-tight">{user.nombre_completo?.split(' ')[0]}</p>
                <p className="text-[10px] text-warm-400 leading-tight">{user.rol_nombre}</p>
              </div>
            )}
            <ChevronDown className={`w-3.5 h-3.5 text-warm-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          <AnimatePresence>
          {userMenuOpen && (
            <motion.div
              className="absolute right-0 top-full mt-2 w-72 bg-white/95 backdrop-blur-xl rounded-2xl shadow-depth border border-white/60 overflow-hidden z-50"
              initial={{ opacity: 0, scale: 0.95, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -5 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* User info header */}
              <div className="px-4 py-4 bg-gradient-to-br from-primary-50 to-accent-50 border-b border-warm-100">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600
                                  text-white flex items-center justify-center text-sm font-bold shadow-sm">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-warm-800 truncate">{user?.nombre_completo}</p>
                    <p className="text-xs text-warm-500 truncate">{user?.email}</p>
                    <span className="badge bg-primary-100 text-primary-700 mt-1">{user?.rol_nombre}</span>
                  </div>
                </div>
              </div>

              {/* Quick settings */}
              <div className="p-2">
                <button
                  onClick={() => { setProfileOpen(true); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-warm-600
                             hover:bg-warm-50 hover:text-warm-800 transition-all"
                >
                  <User className="w-4 h-4" />
                  {t('auth.profile')}
                </button>
                <button
                  onClick={() => { setChangePassOpen(true); setUserMenuOpen(false); resetChangePass() }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-warm-600
                             hover:bg-warm-50 hover:text-warm-800 transition-all"
                >
                  <Key className="w-4 h-4" />
                  {t('auth.changePassword')}
                </button>
                <button
                  onClick={() => setLocale(locale === 'es' ? 'zh' : 'es')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-warm-600
                             hover:bg-warm-50 hover:text-warm-800 transition-all"
                >
                  <Globe className="w-4 h-4" />
                  <span className="flex-1 text-left">{locale === 'es' ? 'Idioma: Español' : '语言：中文'}</span>
                  <span className="text-[10px] text-warm-400 font-medium">{locale === 'es' ? 'ES' : 'ZH'}</span>
                </button>
              </div>

              {/* Logout */}
              <div className="p-2 border-t border-warm-100">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-danger-600
                             hover:bg-danger-50 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  {t('auth.logout')}
                </button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </header>

      {/* Change Password Modal */}
      <Modal
        isOpen={changePassOpen}
        onClose={() => { setChangePassOpen(false); resetChangePass() }}
        title={t('auth.changePassword')}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setChangePassOpen(false); resetChangePass() }} className="btn-ghost">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleChangePassword}
              disabled={changePassLoading || changePassSuccess}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {changePassLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Key className="w-4 h-4" />
              )}
              {changePassSuccess ? '¡Contraseña actualizada!' : t('auth.changePassword')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {changePassSuccess && (
            <div className="bg-success-50 border border-success-200 text-success-700 text-sm px-4 py-3 rounded-xl font-medium">
              ✓ Contraseña actualizada correctamente
            </div>
          )}
          {changePassError && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm px-4 py-3 rounded-xl">
              {changePassError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5">Contraseña actual</label>
            <input
              type="password"
              value={changePassData.current}
              onChange={e => setChangePassData(p => ({ ...p, current: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-warm-200 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5">Nueva contraseña</label>
            <input
              type="password"
              value={changePassData.nuevo}
              onChange={e => setChangePassData(p => ({ ...p, nuevo: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-warm-200 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={changePassData.confirmar}
              onChange={e => setChangePassData(p => ({ ...p, confirmar: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
              className="w-full px-3 py-2.5 rounded-xl border border-warm-200 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>
      </Modal>

      {/* Profile Modal */}
      <Modal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={t('auth.profile')}
        size="md"
      >
        <div className="space-y-6">
          {/* Profile header */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600
                            text-white flex items-center justify-center text-xl font-bold shadow-lg">
              {initials}
            </div>
            <div>
              <h3 className="text-lg font-bold text-warm-800">{user?.nombre_completo}</h3>
              <p className="text-sm text-warm-500">{user?.email}</p>
              <span className="badge bg-primary-100 text-primary-700 mt-1">{user?.rol_nombre}</span>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-warm-50">
              <div className="flex items-center gap-2 text-warm-400 mb-1">
                <Shield className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-bold">{t('profile.code')}</span>
              </div>
              <p className="text-sm font-semibold text-warm-700">{user?.codigo || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-warm-50">
              <div className="flex items-center gap-2 text-warm-400 mb-1">
                <Activity className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-bold">{t('profile.status')}</span>
              </div>
              <p className="text-sm font-semibold text-success-600">{t('common.active')}</p>
            </div>
            <div className="p-3 rounded-xl bg-warm-50">
              <div className="flex items-center gap-2 text-warm-400 mb-1">
                <Globe className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-bold">{t('profile.language')}</span>
              </div>
              <p className="text-sm font-semibold text-warm-700">{locale === 'es' ? 'Español' : '中文'}</p>
            </div>
            <div className="p-3 rounded-xl bg-warm-50 col-span-2">
              <div className="flex items-center gap-2 text-warm-400 mb-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-bold">{t('profile.timezone')}</span>
              </div>
              <select
                value={user?.zona_horaria || 'America/Mexico_City'}
                disabled={savingTz}
                onChange={async (e) => {
                  setSavingTz(true)
                  try {
                    await updateTimezone(e.target.value)
                    useToastStore.getState().success(t('profile.timezoneUpdated'))
                  } catch (err) {
                    useToastStore.getState().error(err?.response?.data?.error || t('profile.timezoneUpdateError'))
                  }
                  setSavingTz(false)
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-warm-200 text-sm font-semibold text-warm-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 bg-white disabled:opacity-50 cursor-pointer"
              >
                {[
                  { tz: 'America/Vancouver', key: 'timezone.vancouver' },
                  { tz: 'America/Mexico_City', key: 'timezone.mexicoCity' },
                  { tz: 'America/Cancun', key: 'timezone.cancun' },
                  { tz: 'America/Tijuana', key: 'timezone.tijuana' },
                  { tz: 'America/New_York', key: 'timezone.newYork' },
                  { tz: 'America/Los_Angeles', key: 'timezone.losAngeles' },
                  { tz: 'America/Bogota', key: 'timezone.bogota' },
                  { tz: 'America/Lima', key: 'timezone.lima' },
                  { tz: 'America/Sao_Paulo', key: 'timezone.saoPaulo' },
                  { tz: 'America/Argentina/Buenos_Aires', key: 'timezone.buenosAires' },
                  { tz: 'America/Santiago', key: 'timezone.santiago' },
                  { tz: 'Europe/London', key: 'timezone.london' },
                  { tz: 'Europe/Paris', key: 'timezone.paris' },
                  { tz: 'Europe/Berlin', key: 'timezone.berlin' },
                  { tz: 'Europe/Rome', key: 'timezone.rome' },
                  { tz: 'Europe/Madrid', key: 'timezone.madrid' },
                  { tz: 'Europe/Amsterdam', key: 'timezone.amsterdam' },
                  { tz: 'Europe/Istanbul', key: 'timezone.istanbul' },
                  { tz: 'Europe/Moscow', key: 'timezone.moscow' },
                  { tz: 'Africa/Cairo', key: 'timezone.cairo' },
                  { tz: 'Africa/Lagos', key: 'timezone.lagos' },
                  { tz: 'Africa/Johannesburg', key: 'timezone.johannesburg' },
                  { tz: 'Asia/Dubai', key: 'timezone.dubai' },
                  { tz: 'Asia/Karachi', key: 'timezone.karachi' },
                  { tz: 'Asia/Kolkata', key: 'timezone.kolkata' },
                  { tz: 'Asia/Dhaka', key: 'timezone.dhaka' },
                  { tz: 'Asia/Bangkok', key: 'timezone.bangkok' },
                  { tz: 'Asia/Singapore', key: 'timezone.singapore' },
                  { tz: 'Asia/Jakarta', key: 'timezone.jakarta' },
                  { tz: 'Asia/Kuala_Lumpur', key: 'timezone.kualaLumpur' },
                  { tz: 'Asia/Ho_Chi_Minh', key: 'timezone.hoChiMinh' },
                  { tz: 'Asia/Manila', key: 'timezone.manila' },
                  { tz: 'Asia/Shanghai', key: 'timezone.shanghai' },
                  { tz: 'Asia/Hong_Kong', key: 'timezone.hongKong' },
                  { tz: 'Asia/Taipei', key: 'timezone.taipei' },
                  { tz: 'Asia/Tokyo', key: 'timezone.tokyo' },
                  { tz: 'Asia/Seoul', key: 'timezone.seoul' },
                  { tz: 'Australia/Sydney', key: 'timezone.sydney' },
                  { tz: 'Pacific/Auckland', key: 'timezone.auckland' },
                  { tz: 'UTC', key: 'timezone.utc' },
                ].map(item => (
                  <option key={item.tz} value={item.tz}>{t(item.key)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Permissions */}
          {user?.permisos && (
            <div>
              <h4 className="text-xs font-bold text-warm-400 uppercase tracking-wider mb-3">{t('profile.assignedPermissions')}</h4>
              <div className="space-y-2">
                {Object.entries(user.permisos).map(([mod, perms]) => (
                  <div key={mod} className="p-3 rounded-xl border border-warm-100 bg-white">
                    <p className="text-xs font-bold text-warm-600 uppercase mb-2">{t(`perm.mod.${mod}`)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {typeof perms === 'object' ? Object.entries(perms).map(([sub, level]) => (
                        <span key={sub} className={`badge text-[10px] ${
                          level === 'eliminar' ? 'bg-primary-100 text-primary-700' :
                          level === 'actualizar' ? 'bg-accent-100 text-accent-700' :
                          level === 'crear' ? 'bg-success-100 text-success-700' :
                          level === 'ver' ? 'bg-warning-100 text-warning-700' :
                          'bg-warm-100 text-warm-500'
                        }`}>
                          {t(`perm.sub.${sub}`)}: {t(`perm.${level}`)}
                        </span>
                      )) : (
                        <span className="badge bg-primary-100 text-primary-700 text-[10px]">{t(`perm.${perms}`)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
