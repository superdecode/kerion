import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '../common/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import api from '../../services/api'
import { useToastStore } from '../../stores/toastStore'
import {
  User, LogOut, Key, Globe, ChevronDown,
  Shield, Clock, Activity, HelpCircle, Edit3, Check
} from 'lucide-react'
import { useTourStore } from '../../stores/tourStore'
import { tourHelpVisible } from './OnboardingTour'

const DISPLAY_PARENT = { fep: 'dropscan' }
const PERM_MODULE_ORDER = ['dropscan', 'devoluciones', 'recepcion', 'inventario', 'surtido', 'despacho', 'anormalidades', 'sistema']
const PERM_LEVEL_ORDER = ['eliminar', 'actualizar', 'crear', 'ver']

function getHighestLevel(perms) {
  if (typeof perms !== 'object') return perms
  const levels = Object.values(perms)
  for (const lvl of PERM_LEVEL_ORDER) {
    if (levels.includes(lvl)) return lvl
  }
  return levels[0] || 'ver'
}

export default function UserMenu({ compact = false }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [changePassOpen, setChangePassOpen] = useState(false)
  const [changePassData, setChangePassData] = useState({ current: '', nuevo: '', confirmar: '' })
  const [changePassError, setChangePassError] = useState('')
  const [changePassLoading, setChangePassLoading] = useState(false)
  const [changePassSuccess, setChangePassSuccess] = useState(false)
  const [savingTz, setSavingTz] = useState(false)
  const [profileDraft, setProfileDraft] = useState({ nombre: '', apellido: '' })
  const [editingName, setEditingName] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  const { user, logout, updateTimezone, updateProfile } = useAuthStore()
  const { locale, setLocale, t } = useI18nStore()
  const triggerTour = useTourStore((s) => s.trigger)
  const showTourHelp = tourHelpVisible(user?.id)
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
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  useEffect(() => {
    if (!profileOpen || !user?.nombre_completo) return
    const parts = String(user.nombre_completo).trim().split(/\s+/)
    setProfileDraft({
      nombre: parts.shift() || '',
      apellido: parts.join(' '),
    })
    setEditingName(false)
  }, [profileOpen, user?.nombre_completo])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const resetChangePass = () => {
    setChangePassData({ current: '', nuevo: '', confirmar: '' })
    setChangePassError('')
    setChangePassSuccess(false)
  }

  const handleProfileSave = async () => {
    if (!profileDraft.nombre.trim() || !profileDraft.apellido.trim()) return
    setSavingProfile(true)
    try {
      await updateProfile(profileDraft)
      useToastStore.getState().success(t('profile.updated'))
      setEditingName(false)
    } catch (err) {
      useToastStore.getState().error(err?.response?.data?.error || t('profile.updateError'))
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    const { current, nuevo, confirmar } = changePassData
    if (!current || !nuevo || !confirmar) { setChangePassError(t('auth.allFieldsRequired')); return }
    if (nuevo.length < 6) { setChangePassError(t('auth.passwordTooShort')); return }
    if (nuevo !== confirmar) { setChangePassError(t('auth.passwordsNoMatch')); return }
    setChangePassLoading(true)
    setChangePassError('')
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: nuevo })
      setChangePassSuccess(true)
      setTimeout(() => { setChangePassOpen(false); resetChangePass() }, 1500)
    } catch (err) {
      setChangePassError(err.response?.data?.error || t('auth.changePasswordError'))
    } finally {
      setChangePassLoading(false)
    }
  }

  return (
    <>
      <div ref={menuRef} className={`relative shrink-0 ${userMenuOpen ? 'z-[10020]' : 'z-[120]'}`}>
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className={`flex items-center rounded-xl transition-all duration-200 group hover:bg-warm-100 ${
            compact ? 'gap-2 px-1.5 py-1.5' : 'gap-2.5 px-2 py-1.5'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-[11px] font-bold shadow-sm">
            {initials}
          </div>
          {user && !compact && (
            <div className="hidden md:block text-left">
              <p className="text-[13px] font-semibold text-warm-700 leading-tight">{user.nombre_completo?.split(' ')[0]}</p>
              <p className="text-[10px] text-warm-400 leading-tight">{user.rol_nombre}</p>
            </div>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-warm-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {userMenuOpen && (
            <motion.div
              className="absolute right-0 top-full mt-2 w-72 bg-white/95 backdrop-blur-xl rounded-2xl shadow-depth border border-white/60 overflow-hidden z-[10021]"
              initial={{ opacity: 0, scale: 0.95, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -5 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="px-4 py-4 bg-gradient-to-br from-primary-50 to-accent-50 border-b border-warm-100">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-warm-800 truncate">{user?.nombre_completo}</p>
                    <p className="text-xs text-warm-500 truncate">{user?.email}</p>
                    <span className="badge bg-primary-100 text-primary-700 mt-1">{user?.rol_nombre}</span>
                  </div>
                </div>
              </div>

              <div className="p-2">
                <button
                  onClick={() => { setProfileOpen(true); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-warm-600 hover:bg-warm-50 hover:text-warm-800 transition-all"
                >
                  <User className="w-4 h-4" />
                  {t('auth.profile')}
                </button>
                <button
                  onClick={() => { setChangePassOpen(true); setUserMenuOpen(false); resetChangePass() }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-warm-600 hover:bg-warm-50 hover:text-warm-800 transition-all"
                >
                  <Key className="w-4 h-4" />
                  {t('auth.changePassword')}
                </button>
                <button
                  onClick={() => setLocale(locale === 'es' ? 'zh' : 'es')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-warm-600 hover:bg-warm-50 hover:text-warm-800 transition-all"
                >
                  <Globe className="w-4 h-4" />
                  <span className="flex-1 text-left">{t('auth.languageLabel')}{locale === 'es' ? t('auth.languageEs') : t('auth.languageZh')}</span>
                  <span className="text-[10px] text-warm-400 font-medium">{locale === 'es' ? 'ES' : 'ZH'}</span>
                </button>
              </div>

              <div className="p-2 border-t border-warm-100">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-danger-600 hover:bg-danger-50 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  {t('auth.logout')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
              {changePassSuccess ? t('auth.passwordUpdated') : t('auth.changePassword')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {changePassSuccess && (
            <div className="bg-success-50 border border-success-200 text-success-700 text-sm px-4 py-3 rounded-xl font-medium">
              ✓ {t('auth.passwordUpdatedMsg')}
            </div>
          )}
          {changePassError && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm px-4 py-3 rounded-xl">
              {changePassError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5">{t('auth.currentPassword')}</label>
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
            <label className="block text-xs font-semibold text-warm-600 mb-1.5">{t('auth.newPassword2')}</label>
            <input
              type="password"
              value={changePassData.nuevo}
              onChange={e => setChangePassData(p => ({ ...p, nuevo: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-warm-200 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder={t('auth.minChars')}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5">{t('auth.confirmNewPassword')}</label>
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

      <Modal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={t('auth.profile')}
        size="md"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-xl font-bold shadow-lg">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="group flex items-start gap-2">
                {editingName ? (
                  <div className="w-full space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={profileDraft.nombre}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, nombre: e.target.value }))}
                        className="w-36 rounded-lg border border-warm-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        placeholder={t('auth.firstName')}
                      />
                      <input
                        value={profileDraft.apellido}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, apellido: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleProfileSave()}
                        className="w-44 rounded-lg border border-warm-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        placeholder={t('auth.lastName')}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleProfileSave}
                        disabled={savingProfile || !profileDraft.nombre.trim() || !profileDraft.apellido.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {savingProfile ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {t('common.save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingName(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-warm-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-warm-600 hover:bg-warm-50 whitespace-nowrap"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 min-w-0">
                    <h3 className="text-lg font-bold text-warm-800 truncate">{user?.nombre_completo}</h3>
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="mt-0.5 rounded-lg p-1.5 text-warm-300 transition-all hover:bg-primary-50 hover:text-primary-600"
                      title={t('auth.editName')}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {!editingName && (
                <>
                  <p className="text-sm text-warm-500">{user?.email}</p>
                  <span className="badge bg-primary-100 text-primary-700 mt-1">{user?.rol_nombre}</span>
                </>
              )}
            </div>
          </div>

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
              <div className="flex items-center gap-2 text-warm-400 mb-2">
                <Globe className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider font-bold">{t('profile.language')}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setLocale('es')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${locale === 'es' ? 'bg-primary-600 text-white' : 'bg-white border border-warm-200 text-warm-500 hover:border-primary-300'}`}
                >
                  ES
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('zh')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${locale === 'zh' ? 'bg-primary-600 text-white' : 'bg-white border border-warm-200 text-warm-500 hover:border-primary-300'}`}
                >
                  中文
                </button>
              </div>
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

          {showTourHelp && (
            <button
              onClick={() => {
                setProfileOpen(false)
                triggerTour()
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 transition-all"
            >
              <HelpCircle className="w-4 h-4 flex-shrink-0" />
              {t('tour.help')}
            </button>
          )}

          {user?.permisos && (() => {
            const raw = Object.entries(user.permisos).reduce((acc, [mod, perms]) => {
              const parent = DISPLAY_PARENT[mod] || mod
              if (!PERM_MODULE_ORDER.includes(parent)) return acc
              if (typeof perms === 'object') {
                return { ...acc, [parent]: { ...(acc[parent] || {}), ...perms } }
              }
              return { ...acc, [parent]: perms }
            }, {})
            const entries = PERM_MODULE_ORDER.filter(m => m in raw).map(m => [m, raw[m]])
            if (!entries.length) return null
            return (
              <div>
                <h4 className="text-xs font-bold text-warm-400 uppercase tracking-wider mb-2">{t('profile.assignedPermissions')}</h4>
                <div className="space-y-1.5">
                  {entries.map(([mod, perms]) => {
                    const level = getHighestLevel(perms)
                    return (
                      <div key={mod} className="flex items-center justify-between px-3 py-2 rounded-lg bg-warm-50 border border-warm-100">
                        <span className="text-xs font-semibold text-warm-700">{t(`perm.mod.${mod}`)}</span>
                        <span className={`badge text-[10px] ${
                          level === 'eliminar' ? 'bg-primary-100 text-primary-700' :
                          level === 'actualizar' ? 'bg-accent-100 text-accent-700' :
                          level === 'crear' ? 'bg-success-100 text-success-700' :
                          'bg-warning-100 text-warning-700'
                        }`}>{t(`perm.${level}`)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </Modal>
    </>
  )
}
