import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from '../../../core/components/common/Modal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useOperadorStore } from '../stores/operadorStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as operadoresService from '../services/operadoresService'
import {
  UserCheck, Shield, ChevronDown, Lock, AlertTriangle, Loader2, CheckCircle
} from 'lucide-react'

const HIGH_LEVEL_ROLES = ['Administrador', 'Supervisor', 'Jefe', 'Gestión', 'Gestion']

export default function OperadorAuthModal({ isOpen, onClose, onAuthenticated }) {
  const { user, getPermissionLevel } = useAuthStore()
  const { setOperador } = useOperadorStore()
  const { t } = useI18nStore()

  // High-level: matches role name OR has eliminar permission on dropscan.escaneo
  const permLevel = getPermissionLevel('dropscan.escaneo')
  const isHighLevel = HIGH_LEVEL_ROLES.includes(user?.rol_nombre) || ['actualizar', 'eliminar'].includes(permLevel)

  if (!isOpen) return null

  return isHighLevel
    ? <HighLevelModal onClose={onClose} onAuthenticated={onAuthenticated} user={user} setOperador={setOperador} t={t} />
    : <LowLevelModal onClose={onClose} onAuthenticated={onAuthenticated} user={user} setOperador={setOperador} t={t} />
}

/* ─── HIGH LEVEL: Simple confirmation modal ─── */
function HighLevelModal({ onClose, onAuthenticated, user, setOperador, t }) {
  const handleContinue = () => {
    setOperador({
      operador: { nombre: user.nombre_completo },
      nivelUsuario: user.rol_nombre,
      usuarioInternoId: null,
    })
    onAuthenticated()
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={t('operador.selectUser')} icon={UserCheck} size="sm" preventBackdropClose>
      <div className="text-center py-4">
        <motion.div
          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center mx-auto mb-5"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <Shield className="w-10 h-10 text-primary-600" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <p className="text-sm text-warm-500 mb-3">{t('operador.enteringAs')}</p>

          <div className="inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-primary-50 to-accent-50 border border-primary-100 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-sm font-bold">
              {user?.nombre_completo?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-warm-800">{user?.nombre_completo}</p>
              <p className="text-xs text-primary-600 font-semibold">{user?.rol_nombre}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-success-600 mb-2">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">{t('operador.autoAccess')}</span>
          </div>
        </motion.div>
      </div>

      <div className="flex justify-center pt-2">
        <motion.button
          onClick={handleContinue}
          className="btn-primary px-10 py-3 text-base font-semibold shadow-glow"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          {t('operador.continue')}
        </motion.button>
      </div>
    </Modal>
  )
}

/* ─── LOW LEVEL: Operator selection + PIN validation ─── */
function LowLevelModal({ onClose, onAuthenticated, user, setOperador, t }) {
  const [selectedId, setSelectedId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState(null)
  const [isLocked, setIsLocked] = useState(false)
  const [lockoutMinutes, setLockoutMinutes] = useState(0)
  const pinRef = useRef(null)

  const { data: operadores, isLoading } = useQuery({
    queryKey: ['dropscan-operadores-activos'],
    queryFn: operadoresService.getOperadoresActivos,
    enabled: true,
  })

  // Focus PIN when operator is selected
  useEffect(() => {
    if (selectedId && pinRef.current) {
      setTimeout(() => pinRef.current?.focus(), 100)
    }
  }, [selectedId])

  const handlePinChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(val)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedId || pin.length !== 4) return

    setIsValidating(true)
    setError('')

    try {
      const result = await operadoresService.validarPin(parseInt(selectedId), pin)
      if (result.success) {
        setOperador({
          operador: result.operador,
          nivelUsuario: user.rol_nombre,
          usuarioInternoId: result.operador.id,
        })
        onAuthenticated()
      }
    } catch (err) {
      const data = err.response?.data
      if (data?.error === 'BLOQUEADO') {
        setIsLocked(true)
        setLockoutMinutes(data.lockout_minutes || 5)
        setError('')
      } else if (data?.error === 'INACTIVO') {
        setError(data.message || t('operador.userInactive'))
      } else if (data?.error === 'PIN_INCORRECTO') {
        setError(data.message || t('operador.wrongPin'))
        setAttemptsRemaining(data.intentos_restantes)
        setPin('')
      } else {
        setError(data?.error || t('toast.error'))
      }
    } finally {
      setIsValidating(false)
    }
  }

  const operadoresList = Array.isArray(operadores) ? operadores : []

  return (
    <Modal isOpen={true} onClose={onClose} title={t('operador.selectOperator')} icon={Lock} size="sm" preventBackdropClose>
      {isLocked ? (
        <motion.div
          className="text-center py-6"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-danger-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-danger-500" />
          </div>
          <h3 className="text-lg font-bold text-warm-800 mb-2">{t('operador.locked')}</h3>
          <p className="text-sm text-warm-500">
            {t('operador.lockedMessage').replace('{minutes}', lockoutMinutes)}
          </p>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2.5 rounded-xl border border-warm-200 text-warm-700 font-medium hover:bg-warm-50 transition-colors"
          >
            {t('common.close')}
          </button>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Operator dropdown */}
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-2">
              {t('operador.selectYourName')}
            </label>
            {isLoading ? (
              <div className="flex items-center gap-2 p-3 text-sm text-warm-400">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
              </div>
            ) : operadoresList.length === 0 ? (
              <div className="p-4 rounded-xl bg-warning-50 border border-warning-200 text-sm text-warning-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('operador.noOperators')}</span>
                </div>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedId}
                  onChange={(e) => { setSelectedId(e.target.value); setPin(''); setError(''); setAttemptsRemaining(null) }}
                  className="select-field text-base py-3"
                >
                  <option value="">{t('operador.selectPlaceholder')}</option>
                  {operadoresList.map(op => (
                    <option key={op.id} value={op.id}>{op.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* PIN input */}
          <AnimatePresence>
            {selectedId && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <label className="block text-sm font-semibold text-warm-700 mb-2">
                  {t('operador.enterPin')}
                </label>
                <div className="flex justify-center">
                  <input
                    ref={pinRef}
                    type="password"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    value={pin}
                    onChange={handlePinChange}
                    placeholder="••••"
                    autoComplete="off"
                    className="w-40 text-center text-3xl tracking-[0.5em] font-mono py-3 px-4
                      bg-white border-2 border-warm-200 rounded-2xl
                      focus:border-primary-500 focus:ring-4 focus:ring-primary-100
                      transition-all outline-none placeholder:text-warm-200 placeholder:tracking-[0.3em]"
                  />
                </div>
                <p className="text-xs text-warm-400 text-center mt-2">{t('operador.pinHint')}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span>{error}</span>
                  {attemptsRemaining !== null && attemptsRemaining >= 0 && (
                    <p className="text-xs text-danger-500 mt-1">
                      {t('operador.attemptsRemaining').replace('{n}', attemptsRemaining)}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-warm-200 text-warm-700 font-semibold hover:bg-warm-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <motion.button
              type="submit"
              disabled={!selectedId || pin.length !== 4 || isValidating}
              className="flex-1 btn-primary py-3 text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={selectedId && pin.length === 4 ? { scale: 1.02 } : {}}
              whileTap={selectedId && pin.length === 4 ? { scale: 0.97 } : {}}
            >
              {isValidating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t('common.loading')}</>
              ) : (
                <>{t('operador.startScan')}</>
              )}
            </motion.button>
          </div>
        </form>
      )}
    </Modal>
  )
}
