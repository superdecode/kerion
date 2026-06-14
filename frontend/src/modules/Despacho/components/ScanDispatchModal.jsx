// frontend/src/modules/Despacho/components/ScanDispatchModal.jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { ScanLine, X, Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { findOrderByBarcode } from '../services/despachoService'

const IDLE    = 'idle'
const LOADING = 'loading'
const FOUND   = 'found'
const NOT_FOUND = 'not_found'
const OUT_OF_RANGE = 'out_of_range'

export default function ScanDispatchModal({ isOpen, onClose, filteredOrders = [], onOrderFound }) {
  const [input, setInput]   = useState('')
  const [status, setStatus] = useState(IDLE)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setInput('')
      setStatus(IDLE)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  const search = useCallback(async (q) => {
    const raw = q.trim().toUpperCase()
    if (!raw) { setStatus(IDLE); return }

    setStatus(LOADING)

    // 1. Search in already-filtered orders by order number
    const inFilter = filteredOrders.find(
      o => (o.outboundOrderNo || o.order_no || '').toUpperCase() === raw
    )
    if (inFilter) {
      setStatus(FOUND)
      setTimeout(() => {
        setInput('')
        setStatus(IDLE)
        onOrderFound(inFilter)
      }, 300)
      return
    }

    // 2. Barcode lookup against Google Sheets (logisticsTrackNo, thirdOrderNo, customizeCode)
    try {
      const match = await findOrderByBarcode(raw)
      if (!match) { setStatus(NOT_FOUND); return }

      // Verify the found order is in the current filtered range
      const orderNo = match.outboundOrderNo || match.order_no || ''
      const inRange = filteredOrders.some(
        o => (o.outboundOrderNo || o.order_no || '') === orderNo
      )

      if (!inRange) { setStatus(OUT_OF_RANGE); return }

      setStatus(FOUND)
      setTimeout(() => {
        setInput('')
        setStatus(IDLE)
        onOrderFound(match)
      }, 300)
    } catch {
      setStatus(NOT_FOUND)
    }
  }, [filteredOrders, onOrderFound])

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current)
      search(input)
    }
  }

  function handleChange(e) {
    const val = e.target.value
    setInput(val)
    setStatus(IDLE)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 400)
  }

  const statusMeta = {
    [IDLE]:          { icon: null,          cls: '',                     text: 'Escanea o escribe y presiona Enter' },
    [LOADING]:       { icon: Loader2,       cls: 'text-warm-500',       text: 'Buscando...' },
    [FOUND]:         { icon: CheckCircle2,  cls: 'text-success-600',    text: 'Orden encontrada' },
    [NOT_FOUND]:     { icon: AlertCircle,   cls: 'text-danger-500',     text: 'No encontrada' },
    [OUT_OF_RANGE]:  { icon: AlertCircle,   cls: 'text-warning-600',    text: 'Orden fuera del rango de fechas activo' },
  }

  const sm = statusMeta[status]
  const Icon = sm.icon

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary-600" />
            <h2 className="font-bold text-warm-800 text-base">Escanear Orden</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <div className={`relative flex items-center gap-2 rounded-xl border-2 px-4 py-3 transition-all ${
            status === FOUND       ? 'border-success-400 bg-success-50' :
            status === NOT_FOUND || status === OUT_OF_RANGE ? 'border-danger-300 bg-danger-50' :
            status === LOADING     ? 'border-primary-300 bg-primary-50' :
            'border-warm-200 bg-warm-50 focus-within:border-primary-400 focus-within:bg-white'
          }`}>
            <Search className="w-4 h-4 text-warm-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Escanear codigo..."
              className="flex-1 bg-transparent font-mono text-sm text-warm-800 outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-warm-300"
            />
            {input && (
              <button onClick={() => { setInput(''); setStatus(IDLE) }} className="text-warm-400 hover:text-warm-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status line */}
          <div className={`flex items-center gap-1.5 text-xs font-medium min-h-[20px] ${sm.cls}`}>
            {Icon && <Icon className={`w-3.5 h-3.5 ${status === LOADING ? 'animate-spin' : ''}`} />}
            <span>{sm.text}</span>
          </div>

          <p className="text-[11px] text-warm-400 text-center">
            Busca por: numero de orden · codigo de rastreo · codigo de caja
          </p>
        </div>
      </div>
    </div>
  )
}
