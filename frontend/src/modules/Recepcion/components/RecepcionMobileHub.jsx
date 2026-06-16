import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ScanBarcode, X, XCircle, PackageCheck, CheckCircle2,
} from 'lucide-react'
import { searchByCode } from '../services/recepcionService'
import { fmtDate } from '../../../core/utils/dateFormat'

const ESTADO_META = {
  pendiente_validacion: { cls: 'bg-warm-100 text-warm-600' },
  en_validacion:        { cls: 'bg-sky-100 text-sky-700' },
  completo:             { cls: 'bg-success-100 text-success-700' },
  parcial:              { cls: 'bg-warning-100 text-warning-700' },
  cancelado:            { cls: 'bg-danger-100 text-danger-700' },
}

function EstadoBadge({ estado, t }) {
  const meta = ESTADO_META[estado] ?? ESTADO_META.pendiente_validacion
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${meta.cls}`}>
      {t(`rec.status.${estado}`) || estado}
    </span>
  )
}

function MobileOrderCard({ order, t, onValidate, onView, highlight = false }) {
  const pct = order.total_cajas > 0 ? Math.round((order.cajas_validadas / order.total_cajas) * 100) : 0
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      highlight
        ? 'border-sky-200 bg-gradient-to-br from-sky-50 to-white shadow-[0_0_0_2px_rgba(14,165,233,0.12)]'
        : 'border-warm-150 bg-white shadow-sm'
    }`}>
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono font-black text-primary-700 text-sm leading-tight truncate">{order.folio}</p>
          {order.cliente && <p className="text-[11px] text-warm-600 mt-0.5 truncate">{order.cliente}</p>}
        </div>
        <EstadoBadge estado={order.estado} t={t} />
      </div>

      <div className="px-4 pb-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {order.inbound_order_no && (
          <div>
            <p className="text-[9px] text-warm-400 font-bold uppercase tracking-wider mb-0.5">IVE</p>
            <p className="font-mono text-[11px] text-warm-700 truncate leading-tight">{order.inbound_order_no}</p>
          </div>
        )}
        {order.reference_no && (
          <div>
            <p className="text-[9px] text-warm-400 font-bold uppercase tracking-wider mb-0.5">OR</p>
            <p className="font-mono text-[11px] text-warm-700 truncate leading-tight">{order.reference_no}</p>
          </div>
        )}
        {order.tracking_no && (
          <div className="col-span-2">
            <p className="text-[9px] text-warm-400 font-bold uppercase tracking-wider mb-0.5">Tracking</p>
            <p className="font-mono text-[11px] text-warm-700 truncate leading-tight">{order.tracking_no}</p>
          </div>
        )}
        {order.total_cajas > 0 && (
          <div>
            <p className="text-[9px] text-warm-400 font-bold uppercase tracking-wider mb-0.5">Cajas</p>
            <p className="font-mono text-[11px] text-warm-700 tabular-nums">{order.cajas_validadas}/{order.total_cajas}</p>
          </div>
        )}
        <div>
          <p className="text-[9px] text-warm-400 font-bold uppercase tracking-wider mb-0.5">Fecha</p>
          <p className="text-[11px] text-warm-600">{fmtDate(order.created_at)}</p>
        </div>
      </div>

      {order.total_cajas > 0 && (
        <div className="px-4 pb-2.5">
          <div className="relative h-1.5 rounded-full bg-warm-100 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-success-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="px-4 pb-3.5 flex items-center justify-end gap-1.5 border-t border-warm-50 pt-2.5">
        <button
          type="button"
          onClick={onView}
          className="h-7 px-2.5 rounded-lg text-xs font-medium text-warm-600 bg-warm-50 hover:bg-warm-100 active:scale-95 transition-all"
        >
          Ver
        </button>
        <button
          type="button"
          onClick={onValidate}
          className="h-8 px-3 rounded-xl text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-95 transition-all inline-flex items-center gap-1.5 shadow-sm"
        >
          <ScanBarcode className="w-3 h-3 shrink-0" />
          Validar
        </button>
      </div>
    </div>
  )
}

export default function RecepcionMobileHub({ orders, isLoading, t }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanState, setScanState] = useState(null) // null | 'not_found'
  const [lastCode, setLastCode] = useState('')
  const [matchSheet, setMatchSheet] = useState({ open: false, orders: [], code: '' })

  useEffect(() => {
    const tid = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(tid)
  }, [])

  const playAudio = useCallback((type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = type === 'found' ? 880 : 220
      gain.gain.value = 0.18
      osc.start()
      osc.stop(ctx.currentTime + (type === 'found' ? 0.12 : 0.22))
    } catch { /* audio not available */ }
  }, [])

  const refocus = useCallback(() => setTimeout(() => inputRef.current?.focus(), 80), [])

  const handleScan = useCallback(async () => {
    const val = code.trim()
    if (!val || scanning) return
    setScanning(true)
    setScanState(null)
    setLastCode(val)
    setCode('')
    try {
      const result = await searchByCode(val)
      if (result.count === 0) {
        setScanState('not_found')
        playAudio('error')
      } else {
        playAudio('found')
        setMatchSheet({ open: true, orders: result.orders, code: val })
      }
    } catch {
      setScanState('not_found')
      playAudio('error')
    } finally {
      setScanning(false)
      refocus()
    }
  }, [code, scanning, playAudio, refocus])

  const closeSheet = useCallback(() => {
    setMatchSheet({ open: false, orders: [], code: '' })
    refocus()
  }, [refocus])

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-warm-50">

      {/* Scan zone */}
      <div className="shrink-0 bg-white border-b border-warm-100 px-4 py-3.5 space-y-2">
        <p className="text-[10px] font-bold text-warm-400 uppercase tracking-widest">{t('rec.mobile.scan_hint')}</p>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 shrink-0 pointer-events-none">
            <ScanBarcode className="w-4 h-4 text-primary-600" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={e => { setCode(e.target.value); setScanState(null) }}
            onKeyDown={e => e.key === 'Enter' && handleScan()}
            placeholder={t('rec.mobile.scan_order_desc')}
            className="w-full pl-14 pr-10 py-3.5 text-base bg-warm-50 border-2 border-primary-200 rounded-2xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none font-mono tracking-wide transition-all"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="none"
          />
          {scanning && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {scanState === 'not_found' && (
            <motion.div
              key="not_found"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-danger-50 border border-danger-200"
            >
              <XCircle className="w-4 h-4 text-danger-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-danger-700">{t('rec.mobile.no_order')}</p>
                <p className="font-mono text-[11px] text-danger-500 truncate">{lastCode}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active orders list */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5 pb-safe">
        <p className="text-[10px] font-bold text-warm-400 uppercase tracking-widest px-1">
          {t('rec.mobile.active_orders')}{!isLoading && ` · ${orders.length}`}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-warm-400">
            <PackageCheck className="w-10 h-10 mb-3 text-warm-200" />
            <p className="text-sm font-medium">{t('rec.mobile.no_pending')}</p>
          </div>
        ) : orders.map(order => (
          <MobileOrderCard
            key={order.id}
            order={order}
            t={t}
            onView={() => navigate(`/recepcion/recibir/${order.id}`)}
            onValidate={() => navigate(`/recepcion/recibir/${order.id}/validar`)}
          />
        ))}

        <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
      </div>

      {/* Match bottom sheet */}
      <AnimatePresence>
        {matchSheet.open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={closeSheet}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: '82dvh' }}
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-warm-200 rounded-full" />
              </div>

              <div className="flex items-center justify-between px-4 pb-3 shrink-0 border-b border-warm-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0" />
                    <p className="font-semibold text-warm-900 text-sm">
                      {matchSheet.orders.length === 1
                        ? t('rec.mobile.match_title')
                        : t('rec.mobile.match_multiple')}
                    </p>
                  </div>
                  <p className="font-mono text-[11px] text-warm-500 mt-0.5 truncate pl-6">{matchSheet.code}</p>
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {matchSheet.orders.map(order => (
                  <MobileOrderCard
                    key={order.id}
                    order={order}
                    t={t}
                    highlight
                    onView={() => { closeSheet(); navigate(`/recepcion/recibir/${order.id}`) }}
                    onValidate={() => { closeSheet(); navigate(`/recepcion/recibir/${order.id}/validar`) }}
                  />
                ))}
              </div>

              <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} className="shrink-0" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
