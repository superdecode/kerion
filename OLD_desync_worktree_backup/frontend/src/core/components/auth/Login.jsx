import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

function FloatingShape({ className, delay = 0 }) {
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl opacity-30 ${className}`}
      animate={{
        y: [0, -20, 0],
        x: [0, 10, 0],
        scale: [1, 1.1, 1],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        delay,
        ease: 'easeInOut',
      }}
    />
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const { login, isLoading } = useAuthStore()
  const { t } = useI18nStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-warm-50 via-primary-50/40 to-accent-50/30 p-4 relative overflow-hidden">
      {/* Animated background shapes */}
      <FloatingShape className="w-72 h-72 bg-primary-300 -top-20 -left-20" delay={0} />
      <FloatingShape className="w-96 h-96 bg-accent-300 -bottom-32 -right-32" delay={2} />
      <FloatingShape className="w-64 h-64 bg-pink-200 top-1/3 right-10" delay={4} />
      <FloatingShape className="w-48 h-48 bg-primary-200 bottom-10 left-1/4" delay={1} />

      <motion.div
        className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-depth border border-white/60 p-8">
          {/* Logo */}
          <motion.div
            className="flex flex-col items-center mb-8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src="/logo.png" alt="Kirion" className="w-16 h-16 rounded-2xl mb-4 object-contain" />
            <h1 className="text-2xl font-extrabold text-gradient-vibrant">Kirion</h1>
            <p className="text-sm text-warm-400 mt-1">{t('app.subtitle')}</p>
          </motion.div>

          {/* Form */}
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm"
                >
                  {typeof error === 'object' ? (error.message || JSON.stringify(error)) : error}
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-sm font-semibold text-warm-700 mb-1.5">Usuario</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.enterUsername')}
                required
                autoFocus
                className="input-field py-3 bg-white/70 backdrop-blur-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-warm-700 mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="input-field py-3 pr-12 bg-white/70 backdrop-blur-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-primary-600 transition-colors duration-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 shadow-glow"
              whileTap={{ scale: 0.97 }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('auth.loggingIn')}
                </>
              ) : (
                t('auth.loginBtn')
              )}
            </motion.button>
          </motion.form>

        </div>

        <motion.p
          className="text-center text-xs text-warm-400 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          Kirion WMS v1.0.0
        </motion.p>
      </motion.div>
    </div>
  )
}
