// frontend/src/modules/Despacho/components/IniciarDespachoModal.jsx
import { useState, useEffect } from 'react'
import { CalendarDays, Truck } from 'lucide-react'
import { setDespachoDates } from '../utils/despachoSession'
import { useToastStore } from '../../../core/stores/toastStore'

const MAX_DAYS = 7

function today() { return new Date().toISOString().slice(0, 10) }

function daysDiff(from, to) {
  return Math.round(
    (new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 86400000
  )
}

export default function IniciarDespachoModal({ isOpen, onConfirm, initialFrom, initialTo }) {
  const { warning } = useToastStore()
  const [from, setFrom] = useState(() => initialFrom || today())
  const [to,   setTo]   = useState(() => initialTo   || today())

  useEffect(() => {
    if (isOpen) {
      setFrom(initialFrom || today())
      setTo(initialTo   || today())
    }
  }, [isOpen, initialFrom, initialTo])

  if (!isOpen) return null

  const diff = from && to ? daysDiff(from, to) : 0
  const rangeExceeded = diff > MAX_DAYS

  function handleFromChange(val) {
    setFrom(val)
    if (!to || val > to) setTo(val)
    if (to && val <= to && daysDiff(val, to) > MAX_DAYS) {
      warning('El rango máximo permitido es de 7 días')
    }
  }

  function handleToChange(val) {
    setTo(val)
    if (from && val && daysDiff(from, val) > MAX_DAYS) {
      warning('El rango máximo permitido es de 7 días')
    }
  }

  function handleConfirm() {
    if (!from || !to) return
    if (rangeExceeded) {
      warning('El rango máximo permitido es de 7 días')
      return
    }
    setDespachoDates(from, to)
    onConfirm(from, to)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-warm-950/35 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-depth border border-warm-100 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-primary-100/60 bg-gradient-to-r from-primary-50/80 via-primary-100/50 to-accent-50/40">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center shadow-glow">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-warm-800 font-bold text-base">Iniciar Despacho</h2>
            <p className="text-warm-500 text-xs">Selecciona el rango de fechas de envío esperado</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-warm-600 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-primary-500" />
              Fecha inicio
            </label>
            <input
              type="date"
              value={from}
              onChange={e => handleFromChange(e.target.value)}
              className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:bg-white transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-warm-600 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-primary-500" />
              Fecha fin
            </label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={e => handleToChange(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-warm-800 outline-none focus:ring-2 focus:bg-white transition-colors ${
                rangeExceeded
                  ? 'border-danger-300 bg-danger-50 focus:border-danger-400 focus:ring-danger-100'
                  : 'border-warm-200 bg-warm-50 focus:border-primary-400 focus:ring-primary-100'
              }`}
            />
          </div>
          {from && to && (
            <p className={`text-xs font-medium rounded-lg px-3 py-2 border ${
              rangeExceeded
                ? 'text-danger-700 bg-danger-50 border-danger-200'
                : 'text-primary-700 bg-gradient-to-r from-primary-50 to-accent-50 border-primary-100'
            }`}>
              {rangeExceeded
                ? `Rango de ${diff} días supera el máximo de ${MAX_DAYS} días permitidos`
                : `Cargará órdenes con fecha de envío esperada del ${from} al ${to}`
              }
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-1 bg-warm-50/40 border-t border-warm-100/70">
          <button
            onClick={handleConfirm}
            disabled={!from || !to || rangeExceeded}
            className="w-full btn-primary py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Iniciar Despacho
          </button>
        </div>
      </div>
    </div>
  )
}
