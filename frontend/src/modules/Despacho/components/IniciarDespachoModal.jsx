// frontend/src/modules/Despacho/components/IniciarDespachoModal.jsx
import { useState } from 'react'
import { CalendarDays, Truck } from 'lucide-react'
import { setDespachoDates } from '../utils/despachoSession'

export default function IniciarDespachoModal({ isOpen, onConfirm }) {
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')

  if (!isOpen) return null

  function handleConfirm() {
    if (!from || !to) return
    setDespachoDates(from, to)
    onConfirm(from, to)
  }

  function handleFromChange(val) {
    setFrom(val)
    if (!to || val > to) setTo(val)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-primary-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Iniciar Despacho</h2>
              <p className="text-primary-200 text-xs">Selecciona el rango de fechas de entrega a despachar</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-warm-600 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              Fecha inicio
            </label>
            <input
              type="date"
              value={from}
              onChange={e => handleFromChange(e.target.value)}
              className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-warm-600 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              Fecha fin
            </label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          {from && to && (
            <p className="text-xs text-primary-600 font-medium bg-primary-50 rounded-lg px-3 py-2">
              Cargará órdenes con fecha de entrega del {from} al {to}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={handleConfirm}
            disabled={!from || !to}
            className="w-full btn-primary py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Iniciar Despacho
          </button>
        </div>
      </div>
    </div>
  )
}
