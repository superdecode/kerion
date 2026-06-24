import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'

const LANGS = [
  { code: 'es', label: 'Español', flag: '🇲🇽' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
]

// Confetti pieces — deterministic layout so it renders the same every time
const CONFETTI = [
  { left: '8%',  delay: '0s',   dur: '1.8s', color: '#60a5fa', size: 10, shape: 'circle' },
  { left: '16%', delay: '0.2s', dur: '2.1s', color: '#f472b6', size: 8,  shape: 'rect' },
  { left: '25%', delay: '0.1s', dur: '1.6s', color: '#34d399', size: 12, shape: 'circle' },
  { left: '35%', delay: '0.4s', dur: '2.0s', color: '#fbbf24', size: 9,  shape: 'rect' },
  { left: '45%', delay: '0s',   dur: '1.9s', color: '#a78bfa', size: 11, shape: 'circle' },
  { left: '55%', delay: '0.3s', dur: '1.7s', color: '#f87171', size: 8,  shape: 'rect' },
  { left: '65%', delay: '0.1s', dur: '2.2s', color: '#38bdf8', size: 10, shape: 'circle' },
  { left: '74%', delay: '0.5s', dur: '1.8s', color: '#fb923c', size: 9,  shape: 'rect' },
  { left: '83%', delay: '0.2s', dur: '2.0s', color: '#4ade80', size: 11, shape: 'circle' },
  { left: '91%', delay: '0.4s', dur: '1.6s', color: '#e879f9', size: 8,  shape: 'rect' },
]

const WELCOME_LABELS = {
  es: {
    title: '¡Bienvenido a Kirion!',
    sub: 'Tu sistema de gestión está listo. Configura el idioma y elige cómo comenzar.',
    langLabel: 'Idioma del sistema',
    start: 'Iniciar tutorial',
    skip: 'Saltar por ahora',
    footer: 'Puedes relanzar el tutorial desde el menu de ayuda en cualquier momento.',
  },
  zh: {
    title: '欢迎使用 Kirion！',
    sub: '您的仓库管理系统已准备就绪。请选择语言并决定如何开始。',
    langLabel: '系统语言',
    start: '开始引导教程',
    skip: '暂时跳过',
    footer: '您可以随时从帮助菜单中重新启动教程。',
  },
}

function sessionKey(userId) {
  return `kirion_welcome_${userId}`
}

export default function WelcomeModal() {
  const { user, markTourComplete } = useAuthStore()
  const { locale, setLocale } = useI18nStore()
  const trigger = useTourStore((s) => s.trigger)

  const isAdmin = user?.es_admin_tenant === true ||
    ['administrador', 'admin', 'administrator'].includes(
      String(user?.rol_nombre || user?.rol || '').trim().toLowerCase()
    )

  const shouldShow =
    user &&
    isAdmin &&
    user.tour_completado === false &&
    !sessionStorage.getItem(sessionKey(user.id))

  const [visible, setVisible] = useState(shouldShow)
  const [lang, setLang] = useState(locale)

  // Keep local lang in sync with store (in case store changed externally)
  useEffect(() => { setLang(locale) }, [locale])

  if (!visible) return null

  function applyLang(code) {
    setLang(code)
    setLocale(code)
  }

  function handleSkip() {
    sessionStorage.setItem(sessionKey(user.id), '1')
    markTourComplete()
    setVisible(false)
  }

  function handleStart() {
    sessionStorage.setItem(sessionKey(user.id), '1')
    setVisible(false)
    // Slight delay so modal unmounts cleanly before driver.js attaches
    setTimeout(() => trigger(), 300)
  }

  const labels = WELCOME_LABELS[lang] || WELCOME_LABELS.es

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(90px) rotate(360deg); opacity: 0; }
        }
        .confetti-piece { animation: confettiFall linear infinite; }
      `}</style>

      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

          {/* Confetti strip at top */}
          <div className="relative h-14 bg-gradient-to-b from-gray-800 to-gray-900 overflow-hidden">
            {CONFETTI.map((c, i) => (
              <div
                key={i}
                className="confetti-piece absolute top-0"
                style={{
                  left: c.left,
                  animationDelay: c.delay,
                  animationDuration: c.dur,
                  width: c.size,
                  height: c.size,
                  backgroundColor: c.color,
                  borderRadius: c.shape === 'circle' ? '50%' : '2px',
                }}
              />
            ))}
            {/* Celebration icon centered */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl select-none">🎉</span>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="text-center space-y-1.5">
              <h2 className="text-white font-bold text-xl">{labels.title}</h2>
              <p className="text-gray-400 text-sm leading-relaxed">{labels.sub}</p>
            </div>

            {/* Language selector */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{labels.langLabel}</p>
              <div className="grid grid-cols-2 gap-2">
                {LANGS.map(({ code, label, flag }) => (
                  <button
                    key={code}
                    onClick={() => applyLang(code)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      lang === code
                        ? 'bg-blue-600/20 border-blue-500/60 text-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.4)]'
                        : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    <span className="text-xl">{flag}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                onClick={handleStart}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                {labels.start}
              </button>
              <button
                onClick={handleSkip}
                className="w-full py-2.5 text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                {labels.skip}
              </button>
            </div>

            <p className="text-center text-gray-700 text-[11px]">{labels.footer}</p>
          </div>
        </div>
      </div>
    </>
  )
}

// Separate component for non-admin users: auto-starts the tour once per session
export function AutoTourLauncher() {
  const { user } = useAuthStore()
  const trigger = useTourStore((s) => s.trigger)

  const isAdmin = user?.es_admin_tenant === true ||
    ['administrador', 'admin', 'administrator'].includes(
      String(user?.rol_nombre || user?.rol || '').trim().toLowerCase()
    )

  useEffect(() => {
    if (!user) return
    if (isAdmin) return                           // admin gets the WelcomeModal instead
    if (user.tour_completado !== false) return    // already done the tour
    const key = `kirion_autotour_${user.id}`
    if (sessionStorage.getItem(key)) return       // already launched this session
    sessionStorage.setItem(key, '1')
    const timer = setTimeout(() => trigger(), 1500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return null
}
