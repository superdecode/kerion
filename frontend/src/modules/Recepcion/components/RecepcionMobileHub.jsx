import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ScanBarcode, X, XCircle, PackageCheck, CheckCircle2,
} from 'lucide-react'
import { searchByCode } from '../services/recepcionService'
import { fmtDate } from '../../../core/utils/dateFormat'
import StatusPill from '../../../core/components/common/StatusPill'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { initAudio, playSound } from '../../Shared/Wms/playSound'
import { normalizeScanCode } from '../../Shared/Wms/normalizeCode'

const ESTADO_META = {
  pendiente_validacion: { cls: 'bg-warm-100 text-warm-600' },
  en_validacion:        { cls: 'bg-sky-100 text-sky-700' },
  completo:             { cls: 'bg-success-100 text-success-700' },
  parcial:              { cls: 'bg-warning-100 text-warning-700' },
  anormal:              { cls: 'bg-danger-100 text-danger-700' },
  cancelado:            { cls: 'bg-danger-100 text-danger-700' },
}

function EstadoBadge({ estado, t }) {
  const meta = ESTADO_META[estado] ?? ESTADO_META.pendiente_validacion
  return (
    <StatusPill size="xs" className={meta.cls}>
      {t(`rec.status.${estado}`) || estado}
    </StatusPill>
  )
}

function MobileOrderCard({ order, t, onValidate, highlight = false }) {
  const counted = order.cajas_registradas ?? order.cajas_validadas ?? 0
  const pct = order.total_cajas > 0 ? Math.round((counted / order.total_cajas) * 100) : 0
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
            <p className="font-mono text-[11px] text-warm-700 tabular-nums">{counted}/{order.total_cajas}</p>
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

function RecepcionMobileHub({ orders, isLoading, t, onValidateOrder }) {
  const inputRef = useRef(null)
  const scanningRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [matchSheet, setMatchSheet] = useState({ open: false, orders: [], code: '' })
  const [notFoundModal, setNotFoundModal] = useState({ open: false, code: '' })

  useEffect(() => {
    initAudio()
    const tid = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(tid)
  }, [])

  const refocus = useCallback(() => setTimeout(() => inputRef.current?.focus(), 80), [])

  const handleScan = useCallback(async () => {
    const val = inputRef.current?.value?.trim() || ''
    if (!val || scanningRef.current) return
    const resolvedQuery = normalizeScanCode(val) || val.toUpperCase()
    scanningRef.current = true
    setScanning(true)
    if (inputRef.current) inputRef.current.value = ''
    try {
      const result = await searchByCode(resolvedQuery)
      if (result.count === 0) {
        playSound('error')
        setNotFoundModal({ open: true, code: resolvedQuery })
      } else {
        playSound('success')
        setMatchSheet({ open: true, orders: result.orders, code: resolvedQuery })
      }
    } catch {
      playSound('error')
      setNotFoundModal({ open: true, code: resolvedQuery })
    } finally {
      scanningRef.current = false
      setScanning(false)
      refocus()
    }
  }, [refocus])

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

      </div>

      {/* Active orders list */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5 pb-safe">
        <p className="text-[10px] font-bold text-warm-400 uppercase tracking-widest px-1">
          {t('rec.mobile.active_orders')}{!isLoading && ` · ${orders.length}`}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="sm" text={t('common.loading')} className="py-0" />
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
            onValidate={() => onValidateOrder?.(order)}
          />
        ))}

        <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
      </div>

      {/* Not-found modal — AnimatePresence must live inside the portal so Framer Motion
          can track children within the portaled React subtree */}
      {createPortal(
        <AnimatePresence>
          {notFoundModal.open && (
            <motion.div
              key="not-found-root"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ position: 'fixed', inset: 0, zIndex: 9040 }}
            >
              <div
                style={{ position: 'absolute', inset: 0 }}
                className="bg-black/40 backdrop-blur-sm"
                onClick={() => { setNotFoundModal({ open: false, code: '' }); refocus() }}
              />
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                  style={{ width: '100%', pointerEvents: 'auto' }}
                  className="bg-white rounded-t-3xl shadow-2xl overflow-hidden"
                >
                  <div className="flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 bg-warm-200 rounded-full" />
                  </div>
                  <div className="px-5 pt-3 pb-6 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-danger-50 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-danger-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-warm-900 text-sm">{t('rec.mobile.no_order')}</p>
                      <p className="font-mono text-xs text-danger-600 mt-1.5 break-all">{notFoundModal.code}</p>
                      <p className="text-[11px] text-warm-500 mt-1">{t('rec.mobile.no_order_hint')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setNotFoundModal({ open: false, code: '' }); refocus() }}
                      className="w-full h-10 rounded-xl bg-warm-100 hover:bg-warm-200 active:scale-95 text-warm-700 text-sm font-semibold transition-all"
                    >
                      {t('common.close')}
                    </button>
                  </div>
                  <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} className="shrink-0" />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Match bottom sheet — same fix: AnimatePresence inside the portal */}
      {createPortal(
        <AnimatePresence>
          {matchSheet.open && (
            <motion.div
              key="match-root"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ position: 'fixed', inset: 0, zIndex: 9040 }}
            >
              <div
                style={{ position: 'absolute', inset: 0 }}
                className="bg-black/40 backdrop-blur-sm"
                onClick={closeSheet}
              />
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                  style={{ width: '100%', maxHeight: '82dvh', pointerEvents: 'auto' }}
                  className="bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
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
                        onValidate={() => {
                          closeSheet()
                          if (onValidateOrder) onValidateOrder(order)
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} className="shrink-0" />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

export default memo(RecepcionMobileHub)
