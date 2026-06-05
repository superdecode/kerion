import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, CheckCircle2, XCircle, AlertCircle, Loader2, Wifi, WifiOff,
  ArrowLeft, RotateCcw, List, Package, Clock, Play, RefreshCw,
  ScanBarcode, Square, Timer, Zap, ChevronRight, BadgeCheck,
  MapPin, XOctagon, Plus, Pencil, X, AlertTriangle,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { normalizeCode } from '../../Shared/Wms/normalizeCode'
import { playSound, initAudio } from '../../Shared/Wms/playSound'
import {
  getOutboundList, getOutboundDetail,
  createScanSession, updateScanSession, addScanEvent, clearSessionEvents,
  upsertOrderTracking, getScanSessions,
} from '../services/surtidoService'
import { getUbicaciones } from '../../WmsHub/services/wmsHubService'

const SCANNER_THRESHOLD_MS = 500
const TABS_KEY = 'kirion_surtido_tabs'
const ACTIVE_TAB_KEY = 'kirion_surtido_active_tab'
const SESSION_KEY = (tabId) => `kirion_surtido_session_${tabId}`

function genId() { return Math.random().toString(36).slice(2, 9) }

function buildItemMaps(detailData) {
  const detail = detailData?.data ?? detailData
  if (!detail) return { packageMap: new Map(), productMap: new Map() }
  const packageList = detail.packageList ?? detail.details ?? detail.items ?? []
  const productList = detail.productList ?? []
  const packageMap = new Map()
  packageList.forEach(p => {
    const codes = [p.customizeCode, p.boxType, p.boxCode].filter(Boolean)
    const expectedQty = p.quantity ?? p.totalPackageQty ?? p.qty ?? 1
    codes.forEach(c => {
      const norm = normalizeCode(c)
      if (norm) packageMap.set(norm, { ...p, expectedQty, scannedQty: 0, type: 'box', displayCode: norm })
      if (norm.includes('/')) packageMap.set(norm.replace(/\//g, '-'), packageMap.get(norm))
      if (norm.includes('-')) packageMap.set(norm.replace(/-/g, '/'), packageMap.get(norm))
    })
  })
  const productMap = new Map()
  productList.forEach(p => {
    const norm = normalizeCode(p.sku || '')
    const expectedQty = p.quantity ?? p.qty ?? p.totalProductQty ?? 1
    if (norm) productMap.set(norm, { ...p, expectedQty, scannedQty: 0, type: 'sku', displayCode: norm })
  })
  return { packageMap, productMap }
}

function validateOrderBoxData(detailData) {
  const detail = detailData?.data ?? detailData
  if (!detail) return { ok: false, reason: 'no_data' }
  const packageList = detail.packageList ?? detail.details ?? detail.items ?? []
  if (packageList.length === 0) return { ok: false, reason: 'no_boxes' }
  const noCode = packageList.filter(p => !p.customizeCode && !p.boxType && !p.boxCode)
  if (noCode.length === packageList.length) return { ok: false, reason: 'no_codes' }
  const noQty = packageList.filter(p => !p.quantity && !p.totalPackageQty && !p.qty)
  return { ok: true, warnings: noQty.length > 0 ? ['missing_qty'] : [], packageList }
}

function useSessionTimer(startTime) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) { setElapsed(0); return }
    const start = new Date(startTime).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime])
  return elapsed
}

const fmtElapsed = (secs) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

/* ─── Search step ─────────────────────────────────────────── */
function SearchStep({ onFound }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const [input, setInput] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  async function doSearch(q) {
    if (!q.trim()) return
    setLoading(true)
    try {
      const data = await getOutboundList()
      const all = data?.data?.records ?? data?.data ?? []
      const norm = q.trim().toLowerCase()
      const filtered = all.filter(r => (r.outboundOrderNo || '').toLowerCase().includes(norm))
      if (filtered.length === 0) { toast.error(t('surtido.escaneo.order_not_found') + ': ' + q); setResults([]); return }
      if (filtered.length === 1) { onFound(filtered[0].outboundOrderNo); return }
      setResults(filtered)
    } catch {
      toast.error(t('toast.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <motion.div className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <motion.div
            className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow-lg"
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.05, rotate: 3 }}>
            <BadgeCheck className="w-12 h-12 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-warm-800 mb-2">{t('surtido.escaneo.search_title')}</h2>
          <p className="text-sm text-warm-500 mb-8 leading-relaxed">{t('surtido.escaneo.search_placeholder')}</p>

          <div className="flex gap-2 max-w-md mx-auto">
            <div className="flex-1 flex items-center gap-1.5 h-12 bg-warm-50 border border-warm-200 rounded-2xl px-4 transition-all focus-within:border-primary-400 focus-within:shadow-sm">
              <Search className="w-5 h-5 text-warm-300 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                className="flex-1 min-w-0 h-full text-base bg-transparent outline-none placeholder:text-warm-300 font-mono tracking-wide focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="OB-XXXXXXXX"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && input.trim()) doSearch(input.trim()) }}
              />
            </div>
            <motion.button
              className="btn-primary px-6 py-4 text-base shadow-glow"
              onClick={() => doSearch(input.trim())}
              disabled={!input.trim() || loading}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            </motion.button>
          </div>
        </motion.div>

        {results && results.length > 1 && (
          <motion.div className="card overflow-hidden"
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}>
            <div className="px-5 py-3.5 border-b border-warm-100 bg-warm-50/50">
              <h4 className="text-sm font-bold text-warm-700">{t('surtido.escaneo.select_order')}</h4>
            </div>
            <div className="divide-y divide-warm-50">
              {results.map(r => (
                <button key={r.outboundOrderNo} onClick={() => onFound(r.outboundOrderNo)}
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-primary-50/30 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-mono font-semibold text-sm text-warm-800">{r.outboundOrderNo}</p>
                    <p className="text-[11px] text-warm-400">{r.totalQty ?? '?'} {t('surtido.validacion.units')} · {(r.createTime || '').slice(0, 10)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-warm-400 shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {results && results.length === 0 && (
          <motion.div className="card p-10 text-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="text-sm text-warm-400">{t('surtido.escaneo.order_not_found')}</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

/* ─── Preview step ────────────────────────────────────────── */
function PreviewStep({ obc, detailData, isLoadingDetail, onStart, onBack, isStarting, canCreate }) {
  const { t } = useI18nStore()
  const detail = detailData?.data ?? detailData
  const packageList = detail?.packageList ?? detail?.details ?? detail?.items ?? []
  const productList = detail?.productList ?? []

  const validation = detailData ? validateOrderBoxData(detailData) : null
  const canStart = !isLoadingDetail && validation?.ok === true

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <button className="btn-ghost text-sm inline-flex items-center gap-1.5" onClick={onBack}>
          <ArrowLeft size={14} /> {t('surtido.escaneo.search_other')}
        </button>

        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-100 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-warm-500 uppercase tracking-wide">{t('surtido.validacion.order_label')}</p>
              <p className="font-mono font-bold text-warm-900 text-lg">{obc}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-warm-100">
            {detail?.whCode && (
              <div className="bg-warm-50 rounded-xl px-3 py-2">
                <p className="text-xs text-warm-500">{t('surtido.validacion.warehouse')}</p>
                <p className="font-semibold text-warm-800 truncate">{detail.whCode}</p>
              </div>
            )}
            {detail?.logisticsChannel && (
              <div className="bg-warm-50 rounded-xl px-3 py-2">
                <p className="text-xs text-warm-500">{t('surtido.validacion.channel')}</p>
                <p className="font-semibold text-warm-800 truncate">{detail.logisticsChannel}</p>
              </div>
            )}
            <div className={`rounded-xl px-3 py-2 ${canStart ? 'bg-primary-50' : 'bg-danger-50'}`}>
              <p className={`text-xs ${canStart ? 'text-primary-600' : 'text-danger-600'}`}>{t('surtido.validacion.expected_boxes')}</p>
              <p className={`font-bold text-lg ${canStart ? 'text-primary-700' : 'text-danger-700'}`}>{packageList.length || detail?.totalQty || '?'}</p>
            </div>
            {productList.length > 0 && (
              <div className="bg-accent-50 rounded-xl px-3 py-2">
                <p className="text-xs text-accent-600">{t('surtido.validacion.products')}</p>
                <p className="font-bold text-accent-700 text-lg">{productList.length}</p>
              </div>
            )}
          </div>
        </div>

        {/* Validation errors — block start */}
        {!isLoadingDetail && validation && !validation.ok && (
          <div className="rounded-2xl border-2 border-danger-200 bg-danger-50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-danger-700 mb-1">{t('surtido.validacion.box_validation_error')}</p>
              <p className="text-xs text-danger-600">
                {validation.reason === 'no_boxes'  && t('surtido.validacion.error_no_boxes')}
                {validation.reason === 'no_codes'  && t('surtido.validacion.error_no_codes')}
                {validation.reason === 'no_data'   && t('surtido.validacion.error_no_data')}
              </p>
            </div>
          </div>
        )}

        {/* Warnings (missing qty) — allow start */}
        {!isLoadingDetail && validation?.ok && validation.warnings?.length > 0 && (
          <div className="rounded-2xl border border-warning-200 bg-warning-50 p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
            <p className="text-xs text-warning-700">{t('surtido.validacion.warn_missing_qty')}</p>
          </div>
        )}

        {packageList.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-warm-100 flex items-center gap-2 bg-warm-50/50">
              <Package size={14} className="text-warm-500" />
              <span className="text-xs font-bold text-warm-700 uppercase tracking-wide">{t('surtido.escaneo.tab_cajas')} ({packageList.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-warm-50/60">
                    <th className="table-header">{t('surtido.validacion.preview.type')}</th>
                    <th className="table-header">{t('surtido.validacion.preview.ref')}</th>
                    <th className="table-header text-right">{t('surtido.validacion.preview.qty')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {packageList.map((p, i) => {
                    const code = p.customizeCode || p.boxType || p.boxCode
                    const qty = p.quantity ?? p.totalPackageQty ?? p.qty
                    const missingCode = !code
                    const missingQty = !qty
                    return (
                      <tr key={i} className={`table-row ${missingCode ? 'bg-danger-50/30' : ''}`}>
                        <td className="table-cell font-mono font-semibold">
                          {code || <span className="text-danger-500 italic">sin código</span>}
                        </td>
                        <td className="table-cell text-warm-500">{p.boxType || '—'}</td>
                        <td className="table-cell text-right font-semibold">
                          {missingQty ? <span className="text-warning-600 italic">—</span> : qty}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <motion.button
          className="btn-primary w-full inline-flex items-center justify-center gap-2.5 py-3.5 text-base shadow-glow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          onClick={onStart}
          disabled={isStarting || !canStart || !canCreate}
          whileHover={canStart && canCreate ? { scale: 1.01 } : {}} whileTap={canStart && canCreate ? { scale: 0.98 } : {}}>
          {isStarting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          {t('surtido.escaneo.start_validation')}
        </motion.button>
      </div>
    </div>
  )
}

/* ─── Items table ─────────────────────────────────────────── */
function ItemsTable({ items, itemCounts, t, onManualAdjust }) {
  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-warm-400 gap-2">
      <Package size={36} className="opacity-20" />
      <p className="text-sm">{t('common.noData')}</p>
    </div>
  )
  return (
    <div className="max-h-80 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
      <table className="w-full text-xs">
        <thead className="bg-warm-50 sticky top-0 z-10 border-b border-warm-100">
          <tr>
            <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('surtido.validacion.code_header')}</th>
            <th className="text-right px-3 py-2.5 font-bold text-warm-500">{t('surtido.escaneo.expected')}</th>
            <th className="text-right px-3 py-2.5 font-bold text-warm-500">{t('surtido.escaneo.scanned')}</th>
            <th className="text-right px-3 py-2.5 font-bold text-warm-500">{t('surtido.escaneo.pending')}</th>
            <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('common.status')}</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {items.map((item, i) => {
            const scanned = itemCounts.get(item.displayCode) || 0
            const expected = item.expectedQty || 1
            const pending = Math.max(0, expected - scanned)
            const rowBg = scanned === 0 ? '' : scanned >= expected ? 'bg-success-50/40' : 'bg-warning-50/30'
            return (
              <tr key={i} className={`${rowBg} table-row`}>
                <td className="px-3 py-2 font-mono font-semibold text-warm-700">{item.displayCode}</td>
                <td className="px-3 py-2 text-right text-warm-500">{expected}</td>
                <td className="px-3 py-2 text-right font-semibold text-success-700">{scanned}</td>
                <td className={`px-3 py-2 text-right font-semibold ${pending > 0 ? 'text-warning-700' : 'text-success-600'}`}>{pending}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${
                    scanned === 0 ? 'bg-warm-100 text-warm-500' :
                    scanned >= expected ? 'bg-success-100 text-success-700' :
                    'bg-warning-100 text-warning-700'
                  }`}>
                    {scanned === 0 ? '—' : scanned >= expected ? t('surtido.escaneo.match_complete') : `${Math.round((scanned/expected)*100)}%`}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    <button className="w-6 h-6 rounded-lg text-xs bg-warm-100 hover:bg-warm-200 font-bold flex items-center justify-center transition-colors"
                      onClick={() => onManualAdjust(item.displayCode, -1)}>−</button>
                    <button className="w-6 h-6 rounded-lg text-xs bg-primary-100 hover:bg-primary-200 font-bold flex items-center justify-center text-primary-700 transition-colors"
                      onClick={() => onManualAdjust(item.displayCode, 1)}>+</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Rejected items table ────────────────────────────────── */
function RejectedTable({ items, t }) {
  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-warm-400 gap-2">
      <CheckCircle2 size={36} className="opacity-30 text-success-500" />
      <p className="text-sm text-success-600">{t('surtido.validacion.all_complete')}</p>
    </div>
  )
  return (
    <div className="card overflow-hidden shadow-sm">
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        <table className="w-full text-xs">
          <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
            <tr>
              <th className="table-header w-10">#</th>
              <th className="table-header">{t('surtido.validacion.code_header')}</th>
              <th className="table-header">{t('common.status')}</th>
              <th className="table-header text-right">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {items.map((e, i) => (
              <tr key={i} className="table-row">
                <td className="px-3 py-2.5">
                  <span className="w-6 h-6 rounded-lg bg-danger-100 text-danger-600 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                </td>
                <td className="px-3 py-2.5 font-mono font-semibold text-danger-700">{e.code}</td>
                <td className="px-3 py-2.5">
                  <span className={`badge ${
                    e.result === 'duplicate' ? 'bg-warning-100 text-warning-700' : 'bg-danger-100 text-danger-700'
                  }`}>
                    {e.result === 'duplicate' ? t('surtido.escaneo.match_duplicate') : t('surtido.escaneo.match_rejected')}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-warm-400 tabular-nums">{new Date(e.ts).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── Scan feed table ────────────────────────────────────── */
function ScanFeedTable({ items, t }) {
  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-warm-400 gap-3">
      <ScanBarcode size={36} className="opacity-20" />
      <p className="text-sm">{t('surtido.validacion.scan_to_start')}</p>
    </div>
  )
  return (
    <div className="card overflow-hidden shadow-sm">
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        <table className="w-full text-xs">
          <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
            <tr>
              <th className="table-header w-10">#</th>
              <th className="table-header">{t('surtido.validacion.code_header')}</th>
              <th className="table-header text-right">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {items.map((e, i) => (
              <tr key={i} className="hover:bg-success-50/30 transition-colors">
                <td className="px-3 py-2.5">
                  <span className="w-6 h-6 rounded-lg bg-success-100 text-success-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                </td>
                <td className="px-3 py-2.5 font-mono font-semibold text-success-700">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 size={10} className="text-success-500 shrink-0" />
                    {e.code}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-warm-400 tabular-nums">{new Date(e.ts).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── Recount modal ───────────────────────────────────────── */
function RecountModal({ isOpen, onClose, sessionHistory, onAddToSession, t }) {
  const [recountInput, setRecountInput] = useState('')
  const [recountItems, setRecountItems] = useState([])
  const recountRef = useRef(null)
  const lastKeyRef = useRef(0)

  useEffect(() => {
    if (isOpen) { setRecountItems([]); setTimeout(() => recountRef.current?.focus(), 80) }
  }, [isOpen])

  function doRecount(raw) {
    const norm = normalizeCode(raw.trim())
    if (!norm) return
    const alreadyInRecount = recountItems.some(r => r.code === norm)
    const alreadyInSession = sessionHistory.some(h => h.code === norm && h.result === 'ok')
    let status
    if (alreadyInRecount) {
      status = 'duplicado'
    } else if (alreadyInSession) {
      status = 'ya_registrado'
    } else {
      status = 'nuevo'
    }
    setRecountItems(prev => [{ code: norm, status, ts: Date.now() }, ...prev])
    recountRef.current.value = ''
  }

  function handleKeyDown(e) {
    const now = Date.now()
    const delta = now - lastKeyRef.current
    lastKeyRef.current = now
    if (e.key === 'Enter') {
      const val = e.target.value.trim()
      if (!val) return
      doRecount(val); return
    }
    if (delta > SCANNER_THRESHOLD_MS && e.target.value.length > 0) {
      e.preventDefault()
      e.target.value = ''
    }
  }

  const statusCls = {
    ya_registrado: 'bg-success-50 text-success-700 border-success-200',
    duplicado:     'bg-warning-50 text-warning-700 border-warning-200',
    nuevo:         'bg-primary-50 text-primary-700 border-primary-200',
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { setRecountItems([]); onClose() }}
      title={t('surtido.escaneo.recount')} icon={RotateCcw}
      size="lg"
      footer={<button className="btn-secondary" onClick={() => { setRecountItems([]); onClose() }}>{t('common.close')}</button>}>
      <div className="space-y-3">
        <div className="relative">
          <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-300" />
          <input
            ref={recountRef}
            type="text"
            className="w-full pl-12 pr-5 py-3.5 text-base bg-white border-2 border-warm-200 rounded-2xl
              focus:border-primary-500 focus:ring-4 focus:ring-primary-100
              transition-all outline-none placeholder:text-warm-300 font-mono"
            placeholder={t('surtido.validacion.scan_placeholder')}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {recountItems.length === 0 ? (
            <p className="text-xs text-warm-400 text-center py-4">{t('surtido.validacion.history_empty')}</p>
          ) : recountItems.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${statusCls[item.status]}`}>
              <span className="font-mono font-semibold flex-1 truncate">{item.code}</span>
              <span className="font-semibold shrink-0">
                {t(`surtido.escaneo.recount_${item.status}`)}
              </span>
              {item.status === 'nuevo' && (
                <button
                  className="btn-primary text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1 shrink-0"
                  onClick={() => onAddToSession(item.code)}>
                  <Plus size={11} /> {t('surtido.escaneo.recount_add_btn')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

/* ─── Quick Search Modal ──────────────────────────────────── */
function QuickSearchModal({ isOpen, onClose, onValidate }) {
  const { t } = useI18nStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const inputRef = useRef(null)

  const { data: trackingData } = useQuery({
    queryKey: ['upapex-scan-sessions-quick'],
    queryFn: () => getScanSessions({ pageSize: 500 }),
    staleTime: 60000,
    enabled: isOpen,
  })

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults(null)
      setSearchError(null)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  const trackingMap = useMemo(() => {
    const raw = trackingData?.data?.records ?? trackingData?.data ?? []
    const map = new Map()
    raw.forEach(s => { if (s.outbound_order_no) map.set(s.outbound_order_no, s) })
    return map
  }, [trackingData])

  async function doSearch(q) {
    if (!q.trim()) return
    setIsSearching(true)
    setSearchError(null)
    try {
      const data = await getOutboundList()
      const all = data?.data?.records ?? data?.data ?? []
      if (all.length === 0) {
        setSearchError('La hoja de salidas no contiene registros. Verifica la configuracion en WmsHub.')
        setResults([])
        return
      }
      const norm = q.trim().toLowerCase()
      const filtered = all.filter(r =>
        (r.outboundOrderNo || '').toLowerCase().includes(norm) ||
        (r.thirdOrderNo || '').toLowerCase().includes(norm) ||
        (r.logisticsTrackNo || '').toLowerCase().includes(norm) ||
        (r.receiverName || '').toLowerCase().includes(norm) ||
        (r.customizeCode || '').toLowerCase().includes(norm) ||
        (r.boxType || '').toLowerCase().includes(norm)
      )
      setResults(filtered.slice(0, 20))
    } catch (err) {
      const code = err?.code
      if (code === 'SHEET_NOT_CONFIGURED') {
        setSearchError('La hoja de salidas no esta configurada. Ve a WmsHub -> Configuracion y guarda la URL de salidas.')
      } else if (code === 'SHEET_EMPTY') {
        setSearchError('La hoja de Google Sheets esta vacia o tiene menos de 2 filas. Verifica el contenido.')
      } else if (err?.message?.includes('HTTP')) {
        setSearchError(`Error al obtener la hoja: ${err.message}. Verifica la URL y los permisos de acceso.`)
      } else {
        setSearchError(`Error de conexion: ${err?.message ?? 'desconocido'}. Verifica tu red y la URL configurada en WmsHub.`)
      }
      setResults(null)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.validacion.quick_search_title')} icon={Search} size="lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 h-12 bg-warm-50 border-2 border-warm-200 rounded-2xl px-4 transition-all focus-within:border-primary-400 focus-within:shadow-sm overflow-hidden">
            <ScanBarcode className="w-4 h-4 text-warm-300 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 min-w-0 h-full text-base bg-transparent outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-warm-300 font-mono tracking-wide"
              placeholder={t('surtido.validacion.quick_search_placeholder')}
              value={query}
              onChange={e => { setQuery(e.target.value); setSearchError(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && query.trim()) doSearch(query.trim()) }}
            />
          </div>
          <motion.button
            className="btn-primary px-5 h-12 shadow-glow"
            onClick={() => doSearch(query.trim())}
            disabled={!query.trim() || isSearching}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </motion.button>
        </div>

        {searchError && (
          <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 flex items-start gap-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
            <p className="text-danger-700 leading-snug">{searchError}</p>
          </div>
        )}

        {!searchError && results === null && (
          <div className="text-center py-10 text-sm text-warm-400">
            {t('surtido.validacion.quick_search_hint')}
          </div>
        )}

        {!searchError && results && results.length === 0 && (
          <div className="text-center py-10 text-sm text-warm-400">
            {t('surtido.validacion.quick_search_empty')}
          </div>
        )}

        {results && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[58vh] overflow-y-auto scrollbar-thin pr-1">
            {results.map(r => {
              const tracking = trackingMap.get(r.outboundOrderNo)
              const pct = tracking && (tracking.total_expected ?? 0) > 0
                ? Math.min(100, Math.round(((tracking.total_scanned ?? 0) / tracking.total_expected) * 100))
                : null
              const isComplete = tracking?.status === 'complete'
              const isValidating = tracking?.status === 'validating'

              let statusBadge = null
              if (tracking) {
                statusBadge = isComplete
                  ? <span className="badge text-[10px] bg-success-100 text-success-700 shrink-0">Completa</span>
                  : isValidating
                  ? <span className="badge text-[10px] bg-primary-100 text-primary-700 shrink-0">Validando</span>
                  : <span className="badge text-[10px] bg-warm-100 text-warm-600 shrink-0">{tracking.status}</span>
              } else {
                statusBadge = <span className="badge text-[10px] bg-warm-100 text-warm-500 shrink-0">{t('surtido.validacion.card_not_validated')}</span>
              }

              return (
                <div key={r.outboundOrderNo} className="rounded-2xl border border-warm-200 bg-white shadow-sm hover:shadow-md hover:border-primary-200 transition-all overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-gradient-to-r from-primary-50 to-accent-50/40 border-b border-warm-100 flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sm text-warm-900 truncate">{r.outboundOrderNo}</span>
                    {statusBadge}
                  </div>

                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs flex-1">
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_delivery')}</p>
                      <p className="font-medium text-warm-700 mt-0.5 truncate">{r.outboundTime?.slice(0, 10) || '—'}</p>
                    </div>
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_destination')}</p>
                      <p className="font-medium text-warm-700 mt-0.5 truncate">{r.receiverName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_channel')}</p>
                      <p className="font-medium text-warm-700 mt-0.5 truncate">{r.logisticsChannel || '—'}</p>
                    </div>
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_boxes')}</p>
                      <p className="font-bold text-warm-800 mt-0.5">{r.outboundBoxCount || '—'}</p>
                    </div>
                  </div>

                  {pct !== null && (
                    <div className="px-4 pb-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-warm-400 uppercase tracking-wide">{t('surtido.validacion.card_progress')}</span>
                        <span className={`font-bold ${isComplete ? 'text-success-600' : 'text-primary-600'}`}>
                          {tracking.total_scanned ?? 0}/{tracking.total_expected ?? '?'} · {pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isComplete ? 'bg-success-400' : 'bg-primary-400'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="px-4 pb-3 pt-1">
                    <button
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm"
                      onClick={() => { onValidate(r.outboundOrderNo); onClose() }}>
                      <Play size={11} /> {t('surtido.validacion.card_validate')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

function MissingList({ items, itemCounts, t }) {
  const [q, setQ] = useState('')
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <CheckCircle2 size={28} className="text-success-500" />
        <p className="text-sm text-success-600 font-medium">{t('surtido.validacion.all_complete')}</p>
      </div>
    )
  }
  const filtered = q.trim() ? items.filter(i => i.displayCode.toLowerCase().includes(q.toLowerCase())) : items
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 focus-within:border-primary-400 focus-within:shadow-sm transition-all">
        <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar codigo..."
          className="flex-1 min-w-0 text-xs bg-transparent outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 text-warm-700 placeholder:text-warm-300"
        />
        {q && <button onClick={() => setQ('')} className="text-warm-400 hover:text-warm-600"><X size={12} /></button>}
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-warm-400 py-6">{t('common.noData')}</p>
        ) : filtered.map((item, i) => {
          const scanned = itemCounts.get(item.displayCode) || 0
          const pct = item.expectedQty > 0 ? Math.round((scanned / item.expectedQty) * 100) : 0
          return (
            <div key={item.displayCode} className="flex items-center gap-3 px-3 py-2.5 bg-warm-50 rounded-xl border border-warm-100">
              <span className="w-6 text-center text-[10px] font-bold text-warm-400 shrink-0 tabular-nums">{i + 1}</span>
              <span className="font-mono text-xs font-semibold text-warm-800 flex-1 min-w-0 truncate">{item.displayCode}</span>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-16 h-1.5 bg-warm-200 rounded-full overflow-hidden">
                  <div className="h-full bg-warning-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-warning-700 font-semibold tabular-nums text-xs">{scanned}/{item.expectedQty}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════ */
/* ─── TabSession ─────────────────────────────────────────── */
function TabSession({ tabId, isActive, initialObc, initialAutoStart, onSessionChange, onUpdateTab, canCreate, canUpdate, canDelete }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const scanRef = useRef(null)
  const lastKeyTimeRef = useRef(0)

  const [step, setStep] = useState('search')
  const [obc, setObc] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionStart, setSessionStart] = useState(null)
  const [selectedUbicacion, setSelectedUbicacion] = useState(null)
  const [lastScan, setLastScan] = useState(null)
  const [history, setHistory] = useState([])
  const [counts, setCounts] = useState({ ok: 0, rejected: 0 })
  const [itemCounts, setItemCounts] = useState(new Map())
  const [pendingSync, setPendingSync] = useState([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [showRecount, setShowRecount] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [showFinalize, setShowFinalize] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [autoStartPending, setAutoStartPending] = useState(initialAutoStart ?? false)
  const [finalNotes, setFinalNotes] = useState('')
  const [activeTab, setActiveTab] = useState('registros')
  const [sessionSearch, setSessionSearch] = useState('')
  const [sessionStatusFilter, setSessionStatusFilter] = useState('')
  const [ubicacionConfirmed, setUbicacionConfirmed] = useState(false)
  const [locationInputValue, setLocationInputValue] = useState('')
  const [showLocationNotFound, setShowLocationNotFound] = useState(false)
  const [locationNotFoundCode, setLocationNotFoundCode] = useState('')
  const [locationFlash, setLocationFlash] = useState(false)
  const locationRef = useRef(null)

  const sessionElapsed = useSessionTimer(sessionStart)
  const storageKey = SESSION_KEY(tabId)

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.obc && s.sessionId) {
          setObc(s.obc); setSessionId(s.sessionId); setSessionStart(new Date(s.sessionStart))
          setCounts(s.counts || { ok: 0, rejected: 0 })
          setItemCounts(new Map(s.itemCountsArr || []))
          setSelectedUbicacion(s.ubicacion || null)
          setUbicacionConfirmed(s.ubicacionConfirmed || !!s.ubicacion)
          setStep('session')
          onUpdateTab({ obc: s.obc, step: 'session' })
          return
        }
      } catch {}
    }
    if (initialObc) { setObc(initialObc); setStep('preview'); onUpdateTab({ obc: initialObc, step: 'preview' }) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['upapex-outbound-detail', obc],
    queryFn: () => getOutboundDetail(obc),
    enabled: !!obc && step !== 'search',
    staleTime: 60000,
  })
  const { data: ubicacionesData } = useQuery({
    queryKey: ['upapex-ubicaciones', 'surtido'],
    queryFn: () => getUbicaciones('surtido'),
    staleTime: 120000,
  })
  const { data: trackingData } = useQuery({
    queryKey: ['upapex-order-tracking'],
    queryFn: () => getScanSessions({ pageSize: 100 }),
    staleTime: 60000,
    enabled: step === 'session',
  })

  const { packageMap, productMap } = useMemo(() => {
    if (!detailData) return { packageMap: new Map(), productMap: new Map() }
    return buildItemMaps(detailData)
  }, [detailData])

  const allItems = useMemo(() => {
    const items = []
    packageMap.forEach(v => { if (v && !items.some(i => i.displayCode === v.displayCode)) items.push(v) })
    productMap.forEach(v => { if (v && !items.some(i => i.displayCode === v.displayCode)) items.push(v) })
    return items
  }, [packageMap, productMap])

  const totalExpected = allItems.reduce((s, i) => s + (i.expectedQty || 1), 0)
  const totalScanned = counts.ok
  const progress = totalExpected > 0 ? Math.min(100, Math.round((totalScanned / totalExpected) * 100)) : 0
  const scanRate = useMemo(() => {
    const mins = sessionElapsed / 60
    if (mins < 0.5) return 0
    return (totalScanned / mins).toFixed(1)
  }, [sessionElapsed, totalScanned])

  const rejectedHistory = useMemo(
    () => history.filter(e => e.result === 'rejected' || e.result === 'duplicate'),
    [history]
  )

  useEffect(() => {
    const handler = () => initAudio()
    document.addEventListener('click', handler, { once: true })
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    if (step !== 'session' || !isActive) return
    if (!ubicacionConfirmed) {
      setTimeout(() => locationRef.current?.focus(), 80)
    } else {
      setTimeout(() => scanRef.current?.focus(), 80)
    }
  }, [step, ubicacionConfirmed, isActive])

  useEffect(() => {
    if (!autoStartPending || step !== 'preview' || detailLoading || !detailData) return
    const validation = validateOrderBoxData(detailData)
    if (!validation.ok) return
    setAutoStartPending(false)
    if (canCreate) createSessionMut.mutate()
  }, [autoStartPending, step, detailLoading, detailData]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onSessionChange) return
    if (step !== 'session' || !isActive) { onSessionChange(null); return }
    onSessionChange({
      pendingCount: pendingSync.length,
      isSyncing,
      onRecount:  canDelete ? () => setShowRecount(true) : null,
      onMissing:  () => setShowMissing(true),
      onCancel:   canDelete ? handleCancel : null,
      onFinalize: canUpdate ? () => setShowFinalize(true) : null,
    })
  }, [step, isActive, pendingSync.length, isSyncing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(async () => {
      if (pendingSync.length === 0 || isSyncing) return
      setIsSyncing(true)
      try {
        const results = await Promise.allSettled(pendingSync.map(e => addScanEvent(e.payload)))
        const synced = pendingSync.filter((_, i) => results[i].status === 'fulfilled').map(e => e.key)
        setPendingSync(p => p.filter(e => !synced.includes(e.key)))
      } finally { setIsSyncing(false) }
    }, 30000)
    return () => clearInterval(interval)
  }, [pendingSync, isSyncing])

  const persistSession = (newObc, newSessionId, newStart, ubicacion) => {
    sessionStorage.setItem(storageKey, JSON.stringify({
      obc: newObc, sessionId: newSessionId, sessionStart: newStart.toISOString(),
      counts: { ok: 0, rejected: 0 }, itemCountsArr: [], ubicacion: ubicacion || null,
    }))
  }

  const clearSession = () => {
    sessionStorage.removeItem(storageKey)
    setStep('search'); setObc(null); setSessionId(null); setSessionStart(null)
    setLastScan(null); setHistory([]); setCounts({ ok: 0, rejected: 0 })
    setItemCounts(new Map()); setPendingSync([]); setSelectedUbicacion(null)
    setUbicacionConfirmed(false); setLocationInputValue('')
    onUpdateTab({ obc: null, step: 'search' })
  }

  const createSessionMut = useMutation({
    mutationFn: () => {
      const packageList = (detailData?.data ?? detailData)?.packageList ?? (detailData?.data ?? detailData)?.details ?? (detailData?.data ?? detailData)?.items ?? []
      return createScanSession({
        outbound_order_no: obc,
        third_order_no: (detailData?.data ?? detailData)?.thirdOrderNo || null,
        total_expected: packageList.reduce((s, p) => s + (p.quantity ?? p.totalPackageQty ?? p.qty ?? 1), 0),
        ubicacion_id: null,
      })
    },
    onSuccess: (data) => {
      const sid = data.data.id; const now = new Date()
      setSessionId(sid); setSessionStart(now); setStep('session')
      setSelectedUbicacion(null); setUbicacionConfirmed(false)
      persistSession(obc, sid, now, null)
      upsertOrderTracking(obc, { status: 'validating' }).catch(() => {})
      onUpdateTab({ obc, step: 'session' })
    },
    onError: () => toast.error(t('toast.error')),
  })

  const updateUbicacionMut = useMutation({
    mutationFn: (ubicacion) => updateScanSession(sessionId, { ubicacion_id: ubicacion?.id || null }),
    onSuccess: (_, ubicacion) => confirmUbicacionLocally(ubicacion),
    onError:   (_, ubicacion) => confirmUbicacionLocally(ubicacion),
  })

  function confirmUbicacionLocally(ubicacion) {
    setSelectedUbicacion(ubicacion)
    setUbicacionConfirmed(true)
    setLocationInputValue('')
    setLocationFlash(true)
    setTimeout(() => setLocationFlash(false), 1200)
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      try {
        const s = JSON.parse(saved)
        sessionStorage.setItem(storageKey, JSON.stringify({ ...s, ubicacion, ubicacionConfirmed: true }))
      } catch {}
    }
    setTimeout(() => scanRef.current?.focus(), 80)
  }

  function tryConfirmUbicacion(raw) {
    const val = raw.trim()
    if (!val) return
    const ubicaciones = ubicacionesData?.data ?? []
    if (ubicaciones.length === 0) {
      setUbicacionConfirmed(true)
      setTimeout(() => scanRef.current?.focus(), 80)
      return
    }
    const norm = val.toLowerCase()
    const found = ubicaciones.find(u =>
      (u.codigo || '').toLowerCase() === norm || (u.nombre || '').toLowerCase() === norm
    )
    if (found) {
      updateUbicacionMut.mutate({ id: found.id, codigo: found.codigo, nombre: found.nombre })
    } else {
      setLocationNotFoundCode(val)
      setShowLocationNotFound(true)
    }
  }

  const addEventMut = useMutation({
    mutationFn: addScanEvent,
    onError: (_, vars) => setPendingSync(p => [...p, { key: vars._dedupeKey, payload: vars }]),
  })

  const cancelMut = useMutation({
    mutationFn: () => clearSessionEvents(sessionId),
    onSuccess: () => {
      toast.success(t('common.cancel') + ' OK')
      clearSession(); setShowCancelConfirm(false)
    },
    onError: () => toast.error(t('toast.error')),
  })

  function handleCancel() {
    if (counts.ok === 0 && counts.rejected === 0) {
      clearSession()
    } else {
      setShowCancelConfirm(true)
    }
  }

  const doScan = useCallback((rawCode) => {
    if (!canCreate || !rawCode.trim() || !sessionId) return
    const norm = normalizeCode(rawCode)
    const isDup = history.some(h => h.code === norm && h.result === 'ok')
    if (isDup) {
      playSound('warning')
      setLastScan({ code: norm, result: 'duplicate' })
      setHistory(h => [{ code: norm, result: 'duplicate', ts: Date.now() }, ...h])
      toast.warning(t('surtido.validacion.duplicate') + ': ' + norm)
      addEventMut.mutate({ session_id: sessionId, scanned_code: rawCode, normalized_code: norm, scan_result: 'duplicate', quantity: 1, _dedupeKey: `DUP_${norm}_${Date.now()}` })
      return
    }
    const matched = packageMap.get(norm) || productMap.get(norm)
    if (!matched) {
      playSound('error')
      setLastScan({ code: norm, result: 'rejected' })
      setHistory(h => [{ code: norm, result: 'rejected', ts: Date.now() }, ...h])
      setCounts(c => ({ ...c, rejected: c.rejected + 1 }))
      toast.error(t('surtido.validacion.not_in_bd') + ': ' + norm)
      addEventMut.mutate({ session_id: sessionId, scanned_code: rawCode, normalized_code: norm, scan_result: 'not_found', quantity: 1, _dedupeKey: `NF_${norm}_${Date.now()}` })
      return
    }
    playSound('success')
    setLastScan({ code: norm, result: 'ok' })
    setHistory(h => [{ code: norm, result: 'ok', ts: Date.now() }, ...h])
    setCounts(c => ({ ...c, ok: c.ok + 1 }))
    setItemCounts(m => { const next = new Map(m); next.set(matched.displayCode, (m.get(matched.displayCode) || 0) + 1); return next })
    const ts = Date.now()
    addEventMut.mutate({
      session_id: sessionId, scanned_code: rawCode, normalized_code: norm,
      matched_box_type: matched.type === 'box' ? (matched.boxType || matched.boxCode) : null,
      matched_sku: matched.type === 'sku' ? matched.sku : null,
      scan_result: 'ok', quantity: 1, _dedupeKey: `OK_${norm}_${ts}`,
    })
  }, [sessionId, history, packageMap, productMap, addEventMut, t])

  function addCodeToSession(code) {
    const norm = normalizeCode(code)
    const matched = packageMap.get(norm) || productMap.get(norm)
    playSound('success')
    setLastScan({ code: norm, result: 'ok' })
    setHistory(h => [{ code: norm, result: 'ok', ts: Date.now() }, ...h])
    setCounts(c => ({ ...c, ok: c.ok + 1 }))
    if (matched) {
      setItemCounts(m => { const next = new Map(m); next.set(matched.displayCode, (m.get(matched.displayCode) || 0) + 1); return next })
    }
    if (sessionId) {
      const ts = Date.now()
      addEventMut.mutate({ session_id: sessionId, scanned_code: code, normalized_code: norm, scan_result: 'ok', quantity: 1, _dedupeKey: `RC_${norm}_${ts}` })
    }
    toast.success(t('surtido.escaneo.recount_add_btn') + ': ' + norm)
  }

  function handleKeyDown(e) {
    const now = Date.now()
    const delta = now - lastKeyTimeRef.current
    lastKeyTimeRef.current = now
    if (e.key === 'Enter') {
      const val = e.target.value.trim()
      if (!val) return
      doScan(val); e.target.value = ''; return
    }
    if (delta > SCANNER_THRESHOLD_MS && e.target.value.length > 0) {
      e.preventDefault()
      toast.warning(t('surtido.validacion.manual_blocked'))
      e.target.value = ''
    }
  }

  const finalizeMut = useMutation({
    mutationFn: () => {
      const sessionStatus = counts.ok < totalExpected ? 'with_discrepancies' : 'complete'
      return updateScanSession(sessionId, { status: sessionStatus, notes: finalNotes, total_scanned: counts.ok, ubicacion_id: selectedUbicacion?.id || null })
    },
    onSuccess: () => {
      const orderStatus = totalExpected > 0 && counts.ok >= totalExpected ? 'complete' : 'partial'
      upsertOrderTracking(obc, { status: orderStatus }).catch(() => {})
      toast.success(t('surtido.escaneo.session_saved'))
      qc.invalidateQueries({ queryKey: ['upapex-scan-sessions'] })
      clearSession(); setShowFinalize(false)
    },
    onError: () => toast.error(t('toast.error')),
  })

  const missingItems = allItems.filter(item => {
    const normBoxType = normalizeCode(item.boxType || '')
    if (normBoxType && normBoxType === item.displayCode) return false
    return (itemCounts.get(item.displayCode) || 0) < (item.expectedQty || 1)
  })

  const sessionList = useMemo(() => {
    const raw = trackingData?.data?.records ?? trackingData?.data ?? []
    return raw
  }, [trackingData])

  const sessionListFiltered = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase()
    return sessionList
      .filter(s => s.outbound_order_no !== obc)
      .filter(s => {
        if (sessionStatusFilter && s.status !== sessionStatusFilter) return false
        if (!q) return true
        return String(s.outbound_order_no || '').toLowerCase().includes(q)
          || String(s.status || '').toLowerCase().includes(q)
          || String(s.operator_nombre || s.operator || '').toLowerCase().includes(q)
      })
  }, [sessionList, obc, sessionSearch, sessionStatusFilter])

  if (detailLoading && step !== 'search') {
    return <div className="flex-1 flex items-center justify-center"><LoadingSpinner text={t('common.loading')} /></div>
  }

  /* ─── SEARCH / PREVIEW STEPS ────────────────────────────── */
  if (step === 'search') {
    return <SearchStep onFound={foundObc => { setObc(foundObc); setStep('preview'); onUpdateTab({ obc: foundObc, step: 'preview' }) }} />
  }

  if (step === 'preview') {
    return (
      <PreviewStep
        obc={obc} detailData={detailData} isLoadingDetail={detailLoading}
        onBack={() => { setObc(null); setStep('search'); onUpdateTab({ obc: null, step: 'search' }) }}
        onStart={() => createSessionMut.mutate()}
        isStarting={createSessionMut.isPending}
        canCreate={canCreate}
      />
    )
  }

  /* ─── ACTIVE SESSION ─────────────────────────────────── */
  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-6">
          <div className="max-w-3xl mx-auto space-y-4">

            {/* Session info card */}
            <motion.div className="card p-4 shadow-sm overflow-hidden relative"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Package className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-warm-900 truncate leading-none font-mono text-xl tracking-tight">{obc}</p>
                  {(() => {
                    const d = detailData?.data ?? detailData
                    const delivery = d?.outboundTime?.slice(0, 10) || null
                    const destination = d?.receiverName || null
                    const ref = d?.thirdOrderNo || null
                    const track = d?.logisticsTrackNo || null
                    return (delivery || destination || ref || track) ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                        {(delivery || destination) && (
                          <div className="flex items-center gap-3">
                            {delivery && (
                              <div>
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">Entrega</p>
                                <p className="text-xs font-semibold text-warm-700">{delivery}</p>
                              </div>
                            )}
                            {destination && (
                              <div className="border-l border-warm-200 pl-3">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">Destino</p>
                                <p className="text-xs font-semibold text-warm-700 max-w-[14rem] truncate">{destination}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {(ref || track) && (
                          <div className="flex items-center gap-3">
                            {ref && (
                              <div>
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">Referencia</p>
                                <p className="text-xs font-mono text-warm-600 truncate max-w-[10rem]">{ref}</p>
                              </div>
                            )}
                            {track && (
                              <div className="border-l border-warm-200 pl-3">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">Tracking</p>
                                <p className="text-xs font-mono text-warm-600 truncate max-w-[12rem]">{track}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-4xl font-black text-warm-900 tracking-tighter leading-none">
                    {totalScanned}
                  </p>
                  <p className="text-xs font-medium text-warm-400 leading-tight">/{totalExpected}</p>
                </div>
              </div>

              <div className="relative w-full h-3 bg-warm-100 rounded-full overflow-hidden shadow-inner mb-1">
                <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out shadow-sm ${
                  progress >= 100 ? 'bg-gradient-to-r from-success-400 to-success-500 shadow-success-200' :
                  progress >= 80  ? 'bg-gradient-to-r from-primary-400 to-accent-500 shadow-primary-200' :
                  'bg-gradient-to-r from-primary-500 to-primary-400 shadow-primary-200'
                } ${progress > 0 ? 'min-w-[8px]' : ''}`}
                  style={{ width: `${progress}%` }}>
                  {progress > 5 && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent" />
                  )}
                </div>
              </div>

              {/* Location separator — shown when confirmed */}
              {selectedUbicacion && ubicacionConfirmed && (
                <motion.div
                  className={`flex items-center gap-2 px-2.5 py-1.5 mb-2 rounded-xl border transition-colors duration-700 ${
                    locationFlash ? 'bg-success-100 border-success-300' : 'bg-accent-50 border-accent-100'
                  }`}
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  <MapPin size={11} className={`shrink-0 ${locationFlash ? 'text-success-600' : 'text-accent-600'}`} />
                  <span className={`font-mono text-xs font-semibold ${locationFlash ? 'text-success-700' : 'text-accent-700'}`}>{selectedUbicacion.codigo}</span>
                  {selectedUbicacion.nombre && selectedUbicacion.nombre !== selectedUbicacion.codigo && (
                    <span className={`text-[11px] truncate ${locationFlash ? 'text-success-500' : 'text-accent-500'}`}>{selectedUbicacion.nombre}</span>
                  )}
                  <button
                    className="ml-auto p-1 rounded-lg hover:bg-accent-200 text-accent-400 hover:text-accent-700 transition-colors"
                    title={t('surtido.validacion.ubicacion_edit')}
                    onClick={() => {
                      setUbicacionConfirmed(false)
                      setLocationInputValue(selectedUbicacion?.codigo || '')
                      setTimeout(() => locationRef.current?.focus(), 80)
                    }}>
                    <Pencil size={10} />
                  </button>
                </motion.div>
              )}

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-warm-100">
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-success-50 border border-success-100">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success-500 shrink-0" />
                  <div>
                    <p className="text-lg font-extrabold text-success-600 leading-none">{counts.ok}</p>
                    <p className="text-[8px] text-success-600 uppercase tracking-wider font-bold">{t('surtido.validacion.valid_abbr')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-warning-50 border border-warning-100">
                  <Clock className="w-3.5 h-3.5 text-warning-500 shrink-0" />
                  <div>
                    <p className="text-lg font-extrabold text-warning-600 leading-none">{Math.max(0, totalExpected - counts.ok)}</p>
                    <p className="text-[8px] text-warning-600 uppercase tracking-wider font-bold">{t('surtido.validacion.pending_abbr')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-danger-50 border border-danger-100">
                  <XCircle className="w-3.5 h-3.5 text-danger-500 shrink-0" />
                  <div>
                    <p className="text-lg font-extrabold text-danger-600 leading-none">{counts.rejected}</p>
                    <p className="text-[8px] text-danger-600 uppercase tracking-wider font-bold">{t('surtido.validacion.rejected_abbr')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-warm-100">
                  <Timer className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-warm-700 font-mono leading-none">{fmtElapsed(sessionElapsed)}</p>
                    <p className="text-[8px] text-warm-400 uppercase tracking-wider font-bold">{t('surtido.validacion.time_label')}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Location scan card — shown until confirmed */}
            {!ubicacionConfirmed && (
              <motion.div
                className="card p-4 border-2 border-accent-300 bg-accent-50/40 space-y-3"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent-100 flex items-center justify-center">
                      <MapPin className="w-3.5 h-3.5 text-accent-600" />
                    </div>
                    <span className="text-sm font-bold text-accent-700">{t('surtido.validacion.ubicacion_scan_label')}</span>
                  </div>
                  <button
                    className="text-xs text-warm-400 hover:text-warm-600 transition-colors"
                    onClick={() => { setUbicacionConfirmed(true); setTimeout(() => scanRef.current?.focus(), 80) }}>
                    {t('surtido.validacion.ubicacion_skip')}
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-300" />
                    <input
                      ref={locationRef}
                      type="text"
                      className="w-full pl-10 pr-4 py-3 text-base bg-white border-2 border-accent-200 rounded-2xl
                        focus:border-accent-500 focus:shadow-md
                        transition-all outline-none placeholder:text-warm-300 font-mono"
                      placeholder="UB-XXX"
                      value={locationInputValue}
                      onChange={e => setLocationInputValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') tryConfirmUbicacion(e.target.value) }}
                      autoComplete="off"
                    />
                  </div>
                  <button
                    className="btn-primary px-4 py-3 rounded-2xl"
                    onClick={() => tryConfirmUbicacion(locationInputValue)}
                    disabled={!locationInputValue.trim() || updateUbicacionMut.isPending}>
                    {updateUbicacionMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  </button>
                </div>
                {ubicacionesData?.data?.length > 0 && locationInputValue.trim() && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(ubicacionesData.data).filter(u =>
                      (u.codigo || '').toLowerCase().includes(locationInputValue.toLowerCase()) ||
                      (u.nombre || '').toLowerCase().includes(locationInputValue.toLowerCase())
                    ).slice(0, 6).map(u => (
                      <button key={u.id}
                        className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-accent-100 transition-colors text-xs flex items-center gap-2"
                        onClick={() => updateUbicacionMut.mutate({ id: u.id, codigo: u.codigo, nombre: u.nombre })}>
                        <MapPin size={10} className="text-accent-500 shrink-0" />
                        <span className="code-main">{u.codigo}</span>
                        <span className="text-warm-500">{u.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Scan input */}
            <div className="relative">
              <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
              <input
                ref={scanRef}
                type="text"
                className="w-full pl-14 pr-5 py-5 text-xl bg-white border-2 border-warm-200 rounded-2xl
                  focus:border-primary-500 focus:shadow-glow
                  transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                placeholder={t('surtido.validacion.scan_placeholder')}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
            </div>

            {/* Last scan feedback */}
            <AnimatePresence mode="wait">
              {lastScan && (
                <motion.div
                  key={lastScan.code + lastScan.result}
                  initial={{ opacity: 0, y: -10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className={`p-4 rounded-2xl flex items-center gap-3 border backdrop-blur-sm ${
                    lastScan.result === 'ok'        ? 'bg-success-50/90 border-success-200 shadow-sm' :
                    lastScan.result === 'duplicate' ? 'bg-warning-50/90 border-warning-200 shadow-sm' :
                    'bg-danger-50/90 border-danger-200 shadow-sm'
                  }`}>
                  {lastScan.result === 'ok'
                    ? <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" />
                    : lastScan.result === 'duplicate'
                    ? <AlertCircle className="w-5 h-5 text-warning-500 shrink-0" />
                    : <XCircle className="w-5 h-5 text-danger-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium opacity-70">{t('surtido.escaneo.last_scan')}</p>
                    <p className="font-mono font-bold text-warm-800 truncate">{lastScan.code}</p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${
                    lastScan.result === 'ok'        ? 'text-success-600' :
                    lastScan.result === 'duplicate' ? 'text-warning-600' :
                    'text-danger-600'
                  }`}>
                    {lastScan.result === 'ok' ? t('surtido.escaneo.match_ok') :
                     lastScan.result === 'duplicate' ? t('surtido.escaneo.match_duplicate') :
                     t('surtido.escaneo.match_rejected')}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tabs */}
            <div className="bg-white/70 backdrop-blur-2xl border-b border-warm-100/60">
              <div className="flex gap-1">
                {[
                  { key: 'registros',  icon: CheckCircle2, count: null },
                  { key: 'rechazados', icon: XCircle,      count: rejectedHistory.length > 0 ? rejectedHistory.length : null },
                ].map(({ key, icon: Icon, count }) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 ${
                      activeTab === key
                        ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                        : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                    }`}>
                    <Icon className="w-4 h-4" />
                    {t(`surtido.escaneo.tab_${key}`)}
                    {count !== null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        activeTab === key ? 'bg-danger-100 text-danger-700' : 'bg-warm-200 text-warm-600'
                      }`}>{count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'registros' && (
              <ScanFeedTable items={history.filter(h => h.result === 'ok')} t={t} />
            )}
            {activeTab === 'rechazados' && (
              <RejectedTable items={rejectedHistory} t={t} />
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar: orders with progress */}
      <div className="hidden lg:flex w-80 border-l border-warm-100 bg-white/80 backdrop-blur-2xl flex-col shrink-0">
        <div className="px-4 py-3 border-b border-warm-100 bg-warm-50/50">
          <h3 className="text-sm font-bold text-warm-700 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary-500" /> {t('surtido.validacion.sidebar_title')}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
          {obc && (
            <div className="p-3 rounded-xl border border-primary-200 bg-primary-50/50 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-warm-700 font-mono truncate mr-2">{obc}</span>
                <span className="badge bg-primary-100 text-primary-700 text-[9px] shrink-0">ACTIVA</span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-warm-500 font-medium">{totalScanned}/{totalExpected} cajas</span>
                <span className="text-[10px] font-bold text-primary-600">{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-primary-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary-400 to-accent-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <div className="space-y-2 pb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {['', 'complete', 'with_discrepancies', 'cancelled'].map(key => (
                <button
                  key={key || 'all'}
                  onClick={() => setSessionStatusFilter(key)}
                  className={`px-2.5 py-1.5 h-9 rounded-full text-[10px] font-semibold border transition-colors ${
                    sessionStatusFilter === key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-warm-500 border-warm-200 hover:border-primary-300 hover:text-primary-700'
                  }`}
                >
                  {key ? t(`surtido.registros.status.${key}`) : t('common.all')}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 transition-all focus-within:border-primary-400 focus-within:shadow-sm">
              <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input
                type="text"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                placeholder={t('common.search')}
                className="flex-1 min-w-0 text-xs outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {(sessionSearch || sessionStatusFilter) && (
                <button
                  type="button"
                  onClick={() => { setSessionSearch(''); setSessionStatusFilter('') }}
                  className="text-warm-400 hover:text-warm-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {sessionListFiltered.length === 0 ? (
            <div className="py-8 text-center text-xs text-warm-400">{t('surtido.validacion.history_empty')}</div>
          ) : (
            sessionListFiltered.map((s, i) => {
              const pct = s.total_expected > 0 ? Math.min(100, Math.round(((s.total_scanned ?? 0) / s.total_expected) * 100)) : 0
              const isComplete = s.status === 'complete'
              return (
                <div key={s.id || i} className="p-3 rounded-xl border border-warm-100 hover:border-warm-200 hover:bg-warm-50 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-warm-700 font-mono truncate mr-2">{s.outbound_order_no}</span>
                    <span className={`badge text-[9px] ${isComplete ? 'bg-success-100 text-success-700' : 'bg-warm-100 text-warm-600'}`}>
                      {isComplete ? '100%' : `${pct}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-warm-400 font-medium">{s.total_scanned ?? 0}/{s.total_expected ?? '?'} cajas</span>
                    {isComplete && (
                      <span className="text-[10px] text-success-600 flex items-center gap-1">
                        <CheckCircle2 size={9} /> Completa
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${isComplete ? 'bg-success-400' : 'bg-primary-400'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Recount modal */}
      <RecountModal
        isOpen={showRecount}
        onClose={() => setShowRecount(false)}
        sessionHistory={history}
        onAddToSession={addCodeToSession}
        t={t}
      />

      {/* Location not found modal */}
      <Modal isOpen={showLocationNotFound} onClose={() => setShowLocationNotFound(false)}
        title={t('surtido.validacion.ubicacion_not_found_title')} icon={MapPin}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setShowLocationNotFound(false)}>{t('common.cancel')}</button>
            <button className="btn-primary" onClick={() => {
              setShowLocationNotFound(false)
              updateUbicacionMut.mutate({ id: null, codigo: locationNotFoundCode, nombre: locationNotFoundCode })
            }}>
              {t('surtido.validacion.ubicacion_create_btn')}
            </button>
          </div>
        }>
        <p className="text-sm text-warm-600">
          <strong className="font-mono text-warm-800">{locationNotFoundCode}</strong> — {t('surtido.validacion.ubicacion_not_found_body')}
        </p>
      </Modal>

      {/* Cancel confirm modal */}
      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)}
        title={t('surtido.escaneo.cancel_confirm_title')} icon={XOctagon}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setShowCancelConfirm(false)}>{t('common.cancel')}</button>
            <button className="btn-danger inline-flex items-center gap-2" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
              {cancelMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <XOctagon size={14} />}
              {t('surtido.escaneo.cancel')}
            </button>
          </div>
        }>
        <p className="text-sm text-warm-600">{t('surtido.escaneo.cancel_confirm_body')}</p>
      </Modal>

      {/* Missing items modal */}
      <Modal isOpen={showMissing} onClose={() => setShowMissing(false)} title={t('surtido.escaneo.missing_title')} icon={List}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-warm-400">{missingItems.length} {t('surtido.escaneo.pending').toLowerCase()}</span>
            <button className="btn-secondary" onClick={() => setShowMissing(false)}>{t('common.close')}</button>
          </div>
        }>
        <MissingList items={missingItems} itemCounts={itemCounts} t={t} />
      </Modal>

      {/* Finalize modal */}
      <Modal isOpen={showFinalize} onClose={() => setShowFinalize(false)} title={t('surtido.escaneo.finalize')} icon={CheckCircle2}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setShowFinalize(false)}>{t('common.cancel')}</button>
            <button className="btn-primary inline-flex items-center gap-2" onClick={() => finalizeMut.mutate()} disabled={finalizeMut.isPending}>
              {finalizeMut.isPending && <Loader2 size={14} className="animate-spin" />}
              {t('surtido.escaneo.save_session')}
            </button>
          </div>
        }>
        <div className="space-y-3">
          {missingItems.length > 0 && (
            <div className="bg-warning-50 border border-warning-200 rounded-xl px-3 py-2 text-sm text-warning-700">
              {t('surtido.escaneo.finalize_confirm')} ({missingItems.length} {t('surtido.escaneo.pending').toLowerCase()})
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-success-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-success-600 leading-none">{counts.ok}</p>
              <p className="text-xs text-success-600 mt-1">{t('surtido.escaneo.scanned')}</p>
            </div>
            <div className="bg-warm-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-warm-700 leading-none">{totalExpected}</p>
              <p className="text-xs text-warm-500 mt-1">{t('surtido.escaneo.expected')}</p>
            </div>
            {counts.rejected > 0 && (
              <div className="col-span-2 bg-danger-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-danger-600 leading-none">{counts.rejected}</p>
                <p className="text-xs text-danger-600 mt-1">{t('surtido.validacion.rejected_abbr')}</p>
              </div>
            )}
          </div>
          {selectedUbicacion && (
            <div className="bg-accent-50 rounded-xl px-3 py-2 text-xs flex items-center gap-2">
              <MapPin size={12} className="text-accent-600 shrink-0" />
              <span className="font-mono font-semibold text-accent-700">{selectedUbicacion.codigo}</span>
              <span className="text-accent-600">{selectedUbicacion.nombre}</span>
            </div>
          )}
          <textarea
            className="input-field text-sm w-full h-20 resize-none"
            placeholder={t('surtido.escaneo.notes')}
            value={finalNotes}
            onChange={e => setFinalNotes(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}

/* ─── Tab bar ─────────────────────────────────────────────── */
function TabBar({ tabs, activeTabId, onSelect, onAdd, onClose, canAdd }) {
  return (
    <div className="flex items-center px-4 pt-3 pb-0 border-b border-warm-100 bg-white shrink-0 min-w-0">
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group relative flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 border-2 border-b-0 ${
              tab.id === activeTabId
                ? 'bg-white border-warm-200 text-warm-800 shadow-sm -mb-px z-10'
                : 'bg-warm-50 border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-100'
            }`}>
            <ScanBarcode size={12} className={tab.id === activeTabId ? 'text-primary-500' : 'text-warm-400'} />
            <span className="max-w-[120px] truncate">{tab.label}</span>
            {tabs.length > 1 && (
              <span
                role="button"
                tabIndex={-1}
                onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-warm-200 text-warm-400 hover:text-warm-700 transition-all ml-0.5">
                <X size={10} />
              </span>
            )}
          </button>
        ))}
      </div>
      {canAdd && (
        <button
          onClick={onAdd}
          className="flex items-center justify-center w-8 h-8 ml-1 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors shrink-0"
          title="Nueva sesión">
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}

/* ─── Main export ─────────────────────────────────────────── */
export default function SurtidoValidacion() {
  const { t } = useI18nStore()
  const { hasPermission } = useAuthStore()
  const canCreateValidation = hasPermission('surtido.validacion', 'crear')
  const canUpdateValidation = hasPermission('surtido.validacion', 'actualizar')
  const canDeleteValidation = hasPermission('surtido.validacion', 'eliminar')
  const [searchParams] = useSearchParams()

  const [tabs, setTabs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TABS_KEY) || 'null')
      if (Array.isArray(saved) && saved.length > 0) return saved
    } catch {}
    return [{ id: genId(), label: t('surtido.validacion.new_tab') }]
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY)
      if (saved) return saved
    } catch {}
    return tabs[0]?.id
  })

  const obcParam = searchParams.get('obc')
  const autoStartParam = searchParams.get('autostart') === 'true'
  const [initialObcConsumed, setInitialObcConsumed] = useState(false)

  useEffect(() => {
    if (!obcParam || initialObcConsumed) return
    setInitialObcConsumed(true)
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab?.label === t('surtido.validacion.new_tab') || !activeTab?.label) {
      setTabs(prev => prev.map(tab => tab.id === activeTabId ? { ...tab, label: obcParam } : tab))
    }
  }, [obcParam]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)) } catch {}
  }, [tabs])

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_TAB_KEY, activeTabId) } catch {}
  }, [activeTabId])

  function addTab() {
    const newId = genId()
    const newTab = { id: newId, label: t('surtido.validacion.new_tab') }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newId)
  }

  function closeTab(tabId) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      if (next.length === 0) {
        const fresh = { id: genId(), label: t('surtido.validacion.new_tab') }
        setActiveTabId(fresh.id)
        return [fresh]
      }
      if (tabId === activeTabId) {
        setActiveTabId(next[next.length - 1].id)
      }
      return next
    })
    try { sessionStorage.removeItem(SESSION_KEY(tabId)) } catch {}
  }

  function handleUpdateTab(tabId, { obc, step }) {
    setTabs(prev => prev.map(tab => {
      if (tab.id !== tabId) return tab
      const label = obc || t('surtido.validacion.new_tab')
      return { ...tab, label }
    }))
    if (obc && pendingTabObcs[tabId]) {
      setPendingTabObcs(prev => {
        const next = { ...prev }
        delete next[tabId]
        return next
      })
    }
  }

  const [activeSession, setActiveSession] = useState(null)
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [pendingTabObcs, setPendingTabObcs] = useState({})

  function addTabWithObc(obc) {
    const newId = genId()
    setTabs(prev => [...prev, { id: newId, label: obc }])
    setActiveTabId(newId)
    setPendingTabObcs(prev => ({ ...prev, [newId]: obc }))
  }

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <button
        className="px-3 py-2 rounded-xl text-warm-500 bg-warm-100 hover:bg-warm-200 transition-all inline-flex items-center gap-2 text-sm font-semibold"
        onClick={() => setShowQuickSearch(true)}
        title={t('surtido.validacion.quick_search_title')}>
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">{t('surtido.validacion.quick_search_title')}</span>
      </button>
      {activeSession && (
        <>
          {activeSession.pendingCount > 0 && (
            <span className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-warning-600 bg-warning-50 flex items-center gap-1.5">
              {activeSession.isSyncing ? <Loader2 size={12} className="animate-spin" /> : <WifiOff size={12} />}
              {activeSession.pendingCount}
            </span>
          )}
          {activeSession.onRecount && (
            <button className="px-3 py-2 rounded-xl text-warm-500 bg-warm-100 hover:bg-warm-200 transition-all inline-flex items-center gap-2 text-sm font-semibold"
              onClick={activeSession.onRecount}>
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">{t('surtido.escaneo.recount')}</span>
            </button>
          )}
          <button className="px-3 py-2 rounded-xl text-primary-600 bg-primary-50 hover:bg-primary-100 transition-all inline-flex items-center gap-2 text-sm font-semibold"
            onClick={activeSession.onMissing}>
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">{t('surtido.escaneo.missing')}</span>
          </button>
          {activeSession.onCancel && (
            <button className="px-3 py-2 rounded-xl text-warning-600 bg-warning-50 hover:bg-warning-100 transition-all inline-flex items-center gap-2 text-sm font-semibold"
              onClick={activeSession.onCancel}>
              <XOctagon className="w-4 h-4" />
              <span className="hidden sm:inline">{t('surtido.escaneo.cancel')}</span>
            </button>
          )}
          {activeSession.onFinalize && (
            <button className="btn-danger inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
              onClick={activeSession.onFinalize}>
              <Square className="w-4 h-4" /> {t('surtido.escaneo.finalize')}
            </button>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <Header title={t('surtido.validacion.title')} subtitle={t('nav.surtido_wms')} actions={headerActions} />
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onAdd={addTab}
        onClose={closeTab}
        canAdd={canCreateValidation}
      />
      <div className="flex-1 flex overflow-hidden relative">
        {tabs.map(tab => (
          <div key={tab.id} className={`absolute inset-0 flex ${tab.id === activeTabId ? '' : 'hidden'}`}>
            <TabSession
              tabId={tab.id}
              isActive={tab.id === activeTabId}
              initialObc={
                pendingTabObcs[tab.id] ??
                (tab.id === activeTabId && !initialObcConsumed ? obcParam : null)
              }
              initialAutoStart={
                pendingTabObcs[tab.id] != null
                  ? false
                  : (tab.id === activeTabId && !initialObcConsumed ? autoStartParam : false)
              }
              onSessionChange={tab.id === activeTabId ? setActiveSession : undefined}
              onUpdateTab={(data) => handleUpdateTab(tab.id, data)}
              canCreate={canCreateValidation}
              canUpdate={canUpdateValidation}
              canDelete={canDeleteValidation}
            />
          </div>
        ))}
      </div>
      <QuickSearchModal
        isOpen={showQuickSearch}
        onClose={() => setShowQuickSearch(false)}
        onValidate={addTabWithObc}
      />
    </div>
  )
}
