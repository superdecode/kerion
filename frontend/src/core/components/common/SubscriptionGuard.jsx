import { useState, useEffect } from 'react'
import { AlertTriangle, Clock, X, RefreshCw, CheckCircle2, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'

const BANNER_DISMISS_KEY = 'sb_banner_dismiss'
const RENEWAL_TODAY_KEY = 'sb_renewal_sent'

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
}

function getRenewalSentToday() {
  try {
    const raw = localStorage.getItem(RENEWAL_TODAY_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.date !== getTodayKey()) return null
    return data
  } catch { return null }
}

function saveRenewalSent(form, tenantName) {
  try {
    localStorage.setItem(RENEWAL_TODAY_KEY, JSON.stringify({
      date: getTodayKey(),
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      tenant_name: tenantName || '',
      sent_at: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    }))
  } catch {}
}

function getBannerDismissed(expiresAt) {
  try {
    const raw = localStorage.getItem(BANNER_DISMISS_KEY)
    if (!raw) return false
    const { ts, key } = JSON.parse(raw)
    if (key !== expiresAt) return false
    return Date.now() - ts < 24 * 60 * 60 * 1000
  } catch { return false }
}

function setBannerDismissed(expiresAt) {
  try {
    localStorage.setItem(BANNER_DISMISS_KEY, JSON.stringify({ ts: Date.now(), key: expiresAt }))
  } catch {}
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - Date.now()) / 86400000)
}

function getSubscriptionState(user) {
  if (!user) return null

  const status = user.tenant_status
  if (status === 'suspended') return { blocked: true, reason: 'suspended' }

  // Subscription takes priority over trial
  if (user.subscription_expires_at) {
    const days = daysUntil(user.subscription_expires_at)
    if (days !== null && days <= 0) return { blocked: true, reason: 'expired', days }
    if (days !== null && days <= 30) return { blocked: false, warning: true, days, mode: 'subscription', expiresAt: user.subscription_expires_at }
    return null
  }

  if (user.trial_expires_at) {
    const days = daysUntil(user.trial_expires_at)
    if (days !== null && days <= 0) return { blocked: true, reason: 'trial_expired', days }
    if (days !== null && days <= 2) return { blocked: false, warning: true, days, mode: 'trial', expiresAt: user.trial_expires_at }
    return null
  }

  if (status === 'expired' || status === 'trial_expired') return { blocked: true, reason: status }

  return null
}

function RenewalModal({ user, state, onClose, onSent }) {
  const { t } = useI18nStore()
  const previousRequest = getRenewalSentToday()
  const [form, setForm] = useState({
    contact_name: user?.nombre_completo || '',
    contact_email: user?.tenant_contact_email || user?.email || '',
    message: '',
  })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/public/renewal-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_name: user?.tenant_name || '',
          contact_name: form.contact_name,
          contact_email: form.contact_email,
          current_plan: state?.mode || 'trial',
          message: form.message,
        }),
      })
      saveRenewalSent(form, user?.tenant_name)
      setSent(true)
      onSent?.()
    } catch {
      saveRenewalSent(form, user?.tenant_name)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"

  if (previousRequest && !sent) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h2 className="text-white font-bold text-base">{t('sub.requestSentToday')}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-emerald-300 text-sm font-medium">{t('sub.requestSent')}. {t('sub.oncePerDay')}</p>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 space-y-2">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">{t('sub.requestSentLabel')}</p>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">{t('sub.contactLabel')}</span>
                <span className="text-white text-sm font-semibold">{previousRequest.contact_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">{t('sub.emailLabel')}</span>
                <span className="text-white text-sm">{previousRequest.contact_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">{t('sub.sentAtLabel')}</span>
                <span className="text-white text-sm">{previousRequest.sent_at}</span>
              </div>
            </div>
            <p className="text-gray-500 text-xs text-center">{t('sub.teamContact24')}</p>
            <button onClick={onClose} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
              {t('sub.understood')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-white font-bold text-base">{t('sub.renewTitle')}</h2>
          {!sent && (
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">{t('sub.requestSent')}</h3>
            <p className="text-gray-400 text-sm mb-6">{t('sub.teamContact24')}</p>
            <button onClick={onClose} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
              {t('sub.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-gray-400 text-sm">{t('sub.renewDesc')}</p>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">{t('sub.contactName')}</label>
              <input
                required
                value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                placeholder={t('sub.contactName')}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">{t('sub.contactEmail')}</label>
              <input
                required
                type="email"
                value={form.contact_email}
                onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                placeholder="you@company.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">{t('sub.messageLabel')}</label>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3}
                placeholder={t('sub.messagePlaceholder')}
                className={`${inputCls} resize-none`}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loading ? t('sub.sendingLabel') : t('sub.sendRenewal')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function BlockedPage({ user, state, onRenew }) {
  const { t } = useI18nStore()
  const reasons = {
    expired: t('sub.expired'),
    trial_expired: t('sub.trialExpired'),
    suspended: t('sub.suspended'),
  }
  const isRenewable = state.reason !== 'suspended'

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(239,68,68,0.08),transparent)]" />
      <div className="relative text-center max-w-md mx-auto">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-black text-white mb-3">{t('sub.accessSuspended')}</h1>
        <p className="text-gray-400 text-base mb-2">{reasons[state.reason] || t('sub.accessSuspended2')}</p>
        {user?.tenant_name && (
          <p className="text-gray-600 text-sm mb-8">{user.tenant_name}</p>
        )}
        {isRenewable ? (
          <div className="space-y-3">
            <button
              onClick={onRenew}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/25 text-base"
            >
              {t('sub.renew')}
            </button>
            <p className="text-gray-600 text-xs">{t('sub.contactSupport')} <a href="mailto:contacto@kirion.app" className="text-blue-400 hover:text-blue-300">contacto@kirion.app</a></p>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">{t('sub.contactSupport')} <a href="mailto:contacto@kirion.app" className="text-blue-400">contacto@kirion.app</a> {t('sub.resolveIssue')}</p>
        )}
      </div>
    </div>
  )
}

function CountdownBanner({ state, onRenew, onDismiss }) {
  const { t } = useI18nStore()
  const isUrgent = state.days <= 7
  const isTrial = state.mode === 'trial'

  const colors = isUrgent
    ? { bg: 'bg-red-950/60', border: 'border-red-800/50', text: 'text-red-300', badge: 'bg-red-500/20 border-red-500/30 text-red-300', icon: 'text-red-400' }
    : state.days <= 14
    ? { bg: 'bg-amber-950/60', border: 'border-amber-800/50', text: 'text-amber-300', badge: 'bg-amber-500/20 border-amber-500/30 text-amber-300', icon: 'text-amber-400' }
    : { bg: 'bg-blue-950/50', border: 'border-blue-800/40', text: 'text-blue-300', badge: 'bg-blue-500/15 border-blue-500/25 text-blue-300', icon: 'text-blue-400' }

  return (
    <div className={`w-full ${colors.bg} border-b ${colors.border} px-4 py-2.5 flex items-center justify-between gap-4 backdrop-blur-sm`}>
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${colors.icon} ${isUrgent ? 'animate-pulse' : ''}`} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${colors.text}`}>
            {isTrial ? t('sub.trialLabel') : t('sub.subscriptionLabel')}{t('sub.expiresIn')}
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-sm font-black border ${colors.badge}`}>
            <Clock className="w-3 h-3" />
            {state.days === 1 ? `1 ${t('sub.day')}` : `${state.days} ${t('sub.days')}`}
          </span>
          <span className={`text-xs ${colors.text} opacity-70`}>
            ({new Date(state.expiresAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' })})
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onRenew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {t('sub.renewBtn')}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDismiss} className="text-gray-600 hover:text-gray-400 transition-colors p-1" title="Ocultar por 24 horas">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function SubscriptionGuard({ children }) {
  const { user } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [state, setState] = useState(null)

  useEffect(() => {
    const s = getSubscriptionState(user)
    setState(s)
    if (s?.warning && s.expiresAt) {
      setDismissed(getBannerDismissed(s.expiresAt))
    } else {
      setDismissed(false)
    }
  }, [user?.subscription_expires_at, user?.trial_expires_at, user?.tenant_status])

  function handleDismiss() {
    if (state?.expiresAt) setBannerDismissed(state.expiresAt)
    setDismissed(true)
  }

  if (!state) return children

  if (state.blocked) {
    return (
      <>
        <BlockedPage user={user} state={state} onRenew={() => setShowModal(true)} />
        {showModal && (
          <RenewalModal
            user={user}
            state={state}
            onClose={() => setShowModal(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
      {state.warning && !dismissed && (
        <CountdownBanner
          state={state}
          onRenew={() => setShowModal(true)}
          onDismiss={handleDismiss}
        />
      )}
      {children}
      {showModal && (
        <RenewalModal
          user={user}
          state={state}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
