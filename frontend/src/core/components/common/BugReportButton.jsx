import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import api from '../../services/api'

const DAILY_LIMIT = 3
const SUCCESS_MSG =
  'Gracias por tu reporte. Estamos trabajando en revisarlo lo antes posible. Si tienes urgencia, por favor contacta a tu administrador para darle prioridad.'

function storageKey(userId) {
  return `kirion_bugrep_${userId}_${new Date().toISOString().slice(0, 10)}`
}

function getLocalCount(userId) {
  const raw = localStorage.getItem(storageKey(userId))
  return raw ? parseInt(raw, 10) : 0
}

function setLocalCount(userId, count) {
  localStorage.setItem(storageKey(userId), String(count))
}

export default function BugReportButton() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [usedToday, setUsedToday] = useState(0)
  const panelRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (user?.id) setUsedToday(getLocalCount(user.id))
  }, [user?.id])

  useEffect(() => {
    if (open && textareaRef.current && usedToday < DAILY_LIMIT) {
      textareaRef.current.focus()
    }
  }, [open, usedToday])

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        handleClose()
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleClose() {
    setOpen(false)
    setError('')
    if (sent) {
      setSent(false)
      setDescription('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim() || usedToday >= DAILY_LIMIT) return
    setSending(true)
    setError('')
    try {
      const res = await api.post('/support/bug-report', {
        description: description.trim(),
        page_url: window.location.pathname,
      })
      const newCount = usedToday + 1
      setUsedToday(newCount)
      if (user?.id) setLocalCount(user.id, newCount)
      setSent(true)
    } catch (err) {
      if (err.response?.status === 429) {
        const newCount = DAILY_LIMIT
        setUsedToday(newCount)
        if (user?.id) setLocalCount(user.id, newCount)
        setError(err.response.data?.error || 'Limite diario alcanzado')
      } else {
        setError(err.response?.data?.error || 'Error al enviar el reporte')
      }
    } finally {
      setSending(false)
    }
  }

  if (!user) return null

  const remaining = DAILY_LIMIT - usedToday
  const exhausted = remaining <= 0
  const isLast = remaining === 1 && !sent

  return (
    <div ref={panelRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-purple-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
            <div>
              <p className="text-sm font-semibold text-purple-900">Reportar problema</p>
              {(exhausted || usedToday > 0) && (
                <p className="text-xs text-purple-500 mt-0.5">
                  {exhausted
                    ? 'Limite diario alcanzado'
                    : `${remaining} de ${DAILY_LIMIT} reportes disponibles hoy`}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="text-purple-400 hover:text-purple-700 transition-colors p-0.5 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {sent ? (
            <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
              <p className="text-sm text-gray-600 leading-relaxed">{SUCCESS_MSG}</p>
              {usedToday >= DAILY_LIMIT && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Has usado todos tus reportes de hoy. Podras enviar mas manana.
                </p>
              )}
              <button
                onClick={handleClose}
                className="mt-1 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          ) : exhausted ? (
            <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Limite diario alcanzado</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Ya enviaste {DAILY_LIMIT} reportes hoy. Podras enviar mas manana.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors font-medium"
              >
                Entendido
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
              {isLast && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Este es tu ultimo reporte disponible del dia. Usalo para el problema mas urgente.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Describe el problema
                </label>
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Que ocurrio? En que pagina? Que esperabas que pasara?"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent placeholder:text-gray-400"
                />
                <p className="text-[10px] text-gray-400 text-right mt-0.5">
                  {description.length}/2000
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-gray-400 leading-tight">
                  Se captura tu correo y la pagina actual automaticamente.
                </p>
                <button
                  type="submit"
                  disabled={sending || !description.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors font-medium flex-shrink-0 ml-2"
                >
                  {sending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Enviar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        title={exhausted ? 'Limite diario de reportes alcanzado' : 'Reportar un problema'}
        className={`w-6 h-6 rounded-full shadow-lg flex items-center justify-center text-white text-xs font-bold transition-all duration-200 select-none ${
          exhausted
            ? 'bg-gray-400/70 cursor-not-allowed'
            : open
            ? 'bg-purple-700 scale-95'
            : 'bg-purple-500/80 hover:bg-purple-600 hover:scale-105'
        }`}
      >
        ?
      </button>
    </div>
  )
}
