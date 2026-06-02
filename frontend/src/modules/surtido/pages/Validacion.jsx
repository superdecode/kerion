import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, CheckCircle2, XCircle, AlertCircle, Loader2, Wifi, WifiOff,
  ArrowLeft, RotateCcw, List, Package, Clock, Play, RefreshCw,
  ScanBarcode, Square, Timer, Zap, ChevronRight, BadgeCheck,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { normalizeCode } from '../../_shared/wms/normalizeCode'
import { playSound, initAudio } from '../../_shared/wms/playSound'
import {
  getOutboundList, getOutboundDetail,
  createScanSession, updateScanSession, addScanEvent, clearSessionEvents,
  upsertOrderTracking,
} from '../services/surtidoService'

const SCANNER_THRESHOLD_MS = 500

function buildItemMaps(detailData) {
  const detail = detailData?.data ?? detailData
  if (!detail) return { packageMap: new Map(), productMap: new Map() }
  const packageList = detail.packageList ?? detail.details ?? detail.items ?? []
  const productList = detail.productList ?? []
  const packageMap = new Map()
  packageList.forEach(p => {
    const codes = [p.boxType, p.customizeCode, p.boxCode].filter(Boolean)
    const expectedQty = p.totalPackageQty ?? p.qty ?? 1
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
    const expectedQty = p.qty ?? p.totalProductQty ?? 1
    if (norm) productMap.set(norm, { ...p, expectedQty, scannedQty: 0, type: 'sku', displayCode: norm })
  })
  return { packageMap, productMap }
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
  const m = Math.floor(secs / 60); const s = secs % 60
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

/* ─── Search step ─────────────────────────────────────────── */
function SearchStep({ onFound }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const [input, setInput] = useState('')
  const [results, setResults] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  const searchMut = useMutation({
    mutationFn: (q) => getOutboundList({ page: 1, pageSize: 10, outboundOrderNos: q }),
    onSuccess: (data) => {
      const records = data?.data?.records ?? data?.data ?? []
      if (records.length === 0) { toast.error(t('surtido.escaneo.order_not_found') + ': ' + input); setResults([]); return }
      if (records.length === 1) { onFound(records[0].outboundOrderNo); return }
      setResults(records)
    },
    onError: () => toast.error(t('toast.error')),
  })

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
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-300" />
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-12 pr-5 py-4 text-base bg-white border-2 border-warm-200 rounded-2xl
                  focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:shadow-glow
                  transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                placeholder="OB-XXXXXXXX"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && input.trim()) searchMut.mutate(input.trim()) }}
              />
            </div>
            <motion.button
              className="btn-primary px-6 py-4 text-base shadow-glow"
              onClick={() => searchMut.mutate(input.trim())}
              disabled={!input.trim() || searchMut.isPending}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              {searchMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
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
                    <p className="text-[11px] text-warm-400">{r.totalQty ?? '?'} unidades · {(r.createTime || '').slice(0, 10)}</p>
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
function PreviewStep({ obc, detailData, onStart, onBack, isStarting }) {
  const { t } = useI18nStore()
  const detail = detailData?.data ?? detailData
  const packageList = detail?.packageList ?? detail?.details ?? detail?.items ?? []
  const productList = detail?.productList ?? []

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
              <p className="text-xs text-warm-500 uppercase tracking-wide">Orden de salida</p>
              <p className="font-mono font-bold text-warm-900 text-lg">{obc}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-warm-100">
            {detail?.warehouseCode && (
              <div className="bg-warm-50 rounded-xl px-3 py-2">
                <p className="text-xs text-warm-500">Almacén</p>
                <p className="font-semibold text-warm-800 truncate">{detail.warehouseCode}</p>
              </div>
            )}
            {(detail?.logisticsChannelCode || detail?.logisticsChannel) && (
              <div className="bg-warm-50 rounded-xl px-3 py-2">
                <p className="text-xs text-warm-500">Canal</p>
                <p className="font-semibold text-warm-800 truncate">{detail.logisticsChannelCode || detail.logisticsChannel}</p>
              </div>
            )}
            <div className="bg-primary-50 rounded-xl px-3 py-2">
              <p className="text-xs text-primary-600">Cajas esperadas</p>
              <p className="font-bold text-primary-700 text-lg">{packageList.length || detail?.totalQty || '?'}</p>
            </div>
            {productList.length > 0 && (
              <div className="bg-accent-50 rounded-xl px-3 py-2">
                <p className="text-xs text-accent-600">Productos</p>
                <p className="font-bold text-accent-700 text-lg">{productList.length}</p>
              </div>
            )}
          </div>
        </div>

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
                    <th className="table-header">Tipo</th>
                    <th className="table-header">Ref. personalizada</th>
                    <th className="table-header text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {packageList.map((p, i) => (
                    <tr key={i} className="hover:bg-warm-50 transition-colors">
                      <td className="table-cell font-mono font-semibold">{p.boxType || p.boxCode || '—'}</td>
                      <td className="table-cell text-warm-500">{p.customizeCode || '—'}</td>
                      <td className="table-cell text-right font-semibold">{p.totalPackageQty ?? p.qty ?? '?'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <motion.button
          className="btn-primary w-full inline-flex items-center justify-center gap-2.5 py-3.5 text-base shadow-glow"
          onClick={onStart}
          disabled={isStarting}
          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
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
    <div className="card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-warm-50/60">
              <th className="table-header">Código</th>
              <th className="table-header text-right">{t('surtido.escaneo.expected')}</th>
              <th className="table-header text-right">{t('surtido.escaneo.scanned')}</th>
              <th className="table-header text-right">{t('surtido.escaneo.pending')}</th>
              <th className="table-header">{t('common.status')}</th>
              <th className="table-header" />
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {items.map((item, i) => {
              const scanned = itemCounts.get(item.displayCode) || 0
              const expected = item.expectedQty || 1
              const pending = Math.max(0, expected - scanned)
              const rowBg = scanned === 0 ? '' : scanned >= expected ? 'bg-success-50/40' : 'bg-warning-50/30'
              return (
                <tr key={i} className={`${rowBg} hover:bg-primary-50/20 transition-colors`}>
                  <td className="table-cell font-mono font-semibold text-warm-800">{item.displayCode}</td>
                  <td className="table-cell text-right text-warm-500">{expected}</td>
                  <td className="table-cell text-right font-semibold text-success-700">{scanned}</td>
                  <td className={`table-cell text-right font-semibold ${pending > 0 ? 'text-warning-700' : 'text-success-600'}`}>{pending}</td>
                  <td className="table-cell">
                    <span className={`badge ${
                      scanned === 0 ? 'bg-warm-100 text-warm-500' :
                      scanned >= expected ? 'bg-success-100 text-success-700' :
                      'bg-warning-100 text-warning-700'
                    }`}>
                      {scanned === 0 ? '—' : scanned >= expected ? t('surtido.escaneo.match_complete') : `${Math.round((scanned/expected)*100)}%`}
                    </span>
                  </td>
                  <td className="table-cell">
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
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function SurtidoValidacion() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const scanRef = useRef(null)
  const lastKeyTimeRef = useRef(0)

  const [step, setStep] = useState('search')
  const [obc, setObc] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionStart, setSessionStart] = useState(null)
  const [lastScan, setLastScan] = useState(null)
  const [history, setHistory] = useState([])
  const [counts, setCounts] = useState({ ok: 0, rejected: 0 })
  const [itemCounts, setItemCounts] = useState(new Map())
  const [pendingSync, setPendingSync] = useState([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [showRecount, setShowRecount] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [showFinalize, setShowFinalize] = useState(false)
  const [finalNotes, setFinalNotes] = useState('')
  const [activeTab, setActiveTab] = useState('cajas')

  const sessionElapsed = useSessionTimer(sessionStart)

  // Restore session from storage
  useEffect(() => {
    const saved = sessionStorage.getItem('kirion_surtido_session')
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.obc && s.sessionId) {
          setObc(s.obc); setSessionId(s.sessionId); setSessionStart(new Date(s.sessionStart))
          setCounts(s.counts || { ok: 0, rejected: 0 })
          setItemCounts(new Map(s.itemCountsArr || []))
          setStep('session')
        }
      } catch {}
    }
  }, [])

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['upapex-outbound-detail', obc],
    queryFn: () => getOutboundDetail(obc),
    enabled: !!obc && step !== 'search',
    staleTime: 60000,
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

  useEffect(() => {
    const handler = () => initAudio()
    document.addEventListener('click', handler, { once: true })
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    if (step === 'session') setTimeout(() => scanRef.current?.focus(), 80)
  }, [step])

  // Flush pending sync every 30s
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

  const persistSession = (newObc, newSessionId, newStart) => {
    sessionStorage.setItem('kirion_surtido_session', JSON.stringify({
      obc: newObc, sessionId: newSessionId, sessionStart: newStart.toISOString(),
      counts: { ok: 0, rejected: 0 }, itemCountsArr: [],
    }))
  }

  const clearSession = () => {
    sessionStorage.removeItem('kirion_surtido_session')
    setStep('search'); setObc(null); setSessionId(null); setSessionStart(null)
    setLastScan(null); setHistory([]); setCounts({ ok: 0, rejected: 0 })
    setItemCounts(new Map()); setPendingSync([])
  }

  const createSessionMut = useMutation({
    mutationFn: () => {
      const packageList = (detailData?.data ?? detailData)?.packageList ?? (detailData?.data ?? detailData)?.details ?? (detailData?.data ?? detailData)?.items ?? []
      return createScanSession({
        outbound_order_no: obc,
        third_order_no: (detailData?.data ?? detailData)?.thirdOrderNo || null,
        total_expected: packageList.reduce((s, p) => s + (p.totalPackageQty ?? p.qty ?? 1), 0),
      })
    },
    onSuccess: (data) => {
      const sid = data.data.id; const now = new Date()
      setSessionId(sid); setSessionStart(now); setStep('session')
      persistSession(obc, sid, now)
      upsertOrderTracking(obc, { status: 'validating' }).catch(() => {})
    },
    onError: () => toast.error(t('toast.error')),
  })

  const addEventMut = useMutation({
    mutationFn: addScanEvent,
    onError: (_, vars) => setPendingSync(p => [...p, { key: vars._dedupeKey, payload: vars }]),
  })

  const doScan = useCallback((rawCode) => {
    if (!rawCode.trim() || !sessionId) return
    const norm = normalizeCode(rawCode)
    const isDup = history.some(h => h.code === norm && h.result === 'ok')
    if (isDup) {
      playSound('warning')
      setLastScan({ code: norm, result: 'duplicate' })
      setHistory(h => [{ code: norm, result: 'duplicate', ts: Date.now() }, ...h].slice(0, 15))
      toast.warning(t('surtido.validacion.duplicate') + ': ' + norm)
      addEventMut.mutate({ session_id: sessionId, scanned_code: rawCode, normalized_code: norm, scan_result: 'duplicate', quantity: 1, _dedupeKey: `DUP_${norm}_${Date.now()}` })
      return
    }
    const matched = packageMap.get(norm) || productMap.get(norm)
    if (!matched) {
      playSound('error')
      setLastScan({ code: norm, result: 'rejected' })
      setHistory(h => [{ code: norm, result: 'rejected', ts: Date.now() }, ...h].slice(0, 15))
      setCounts(c => ({ ...c, rejected: c.rejected + 1 }))
      toast.error(t('surtido.validacion.not_in_bd') + ': ' + norm)
      addEventMut.mutate({ session_id: sessionId, scanned_code: rawCode, normalized_code: norm, scan_result: 'not_found', quantity: 1, _dedupeKey: `NF_${norm}_${Date.now()}` })
      return
    }
    playSound('success')
    setLastScan({ code: norm, result: 'ok' })
    setHistory(h => [{ code: norm, result: 'ok', ts: Date.now() }, ...h].slice(0, 15))
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

  const recountMut = useMutation({
    mutationFn: () => clearSessionEvents(sessionId),
    onSuccess: () => {
      setHistory([]); setCounts({ ok: 0, rejected: 0 }); setItemCounts(new Map())
      setLastScan(null); setShowRecount(false)
      toast.success('Reconteo reiniciado')
      setTimeout(() => scanRef.current?.focus(), 80)
    },
    onError: () => toast.error(t('toast.error')),
  })

  const finalizeMut = useMutation({
    mutationFn: () => {
      const total = allItems.reduce((s, i) => s + (i.expectedQty || 1), 0)
      const status = counts.ok < total ? 'with_discrepancies' : 'complete'
      return updateScanSession(sessionId, { status, notes: finalNotes, total_scanned: counts.ok })
    },
    onSuccess: () => {
      upsertOrderTracking(obc, { status: 'complete' }).catch(() => {})
      toast.success(t('surtido.escaneo.session_saved'))
      qc.invalidateQueries({ queryKey: ['upapex-scan-sessions'] })
      clearSession(); setShowFinalize(false)
    },
    onError: () => toast.error(t('toast.error')),
  })

  const missingItems = allItems.filter(item => (itemCounts.get(item.displayCode) || 0) < (item.expectedQty || 1))

  if (detailLoading && step !== 'search') {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.escaneo.title')} subtitle="Surtido WMS" />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  /* ─── SEARCH / PREVIEW STEPS ─────────────────────────── */
  if (step === 'search' || step === 'preview') {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.escaneo.title')} subtitle="Surtido WMS" />
        {step === 'search' && <SearchStep onFound={foundObc => { setObc(foundObc); setStep('preview') }} />}
        {step === 'preview' && (
          <PreviewStep
            obc={obc} detailData={detailData}
            onBack={() => { setObc(null); setStep('search') }}
            onStart={() => createSessionMut.mutate()}
            isStarting={createSessionMut.isPending}
          />
        )}
      </div>
    )
  }

  /* ─── ACTIVE SESSION ─────────────────────────────────── */
  return (
    <div className="flex flex-col h-full">
      <Header title={t('surtido.escaneo.title')} subtitle={`Surtido WMS · ${obc || ''}`}
        actions={
          <div className="flex items-center gap-1.5">
            {pendingSync.length > 0 && (
              <span className="px-3 py-2 rounded-xl text-xs font-semibold text-warning-600 bg-warning-50 flex items-center gap-1.5">
                {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <WifiOff size={13} />}
                {pendingSync.length}
              </span>
            )}
            <button
              className="px-3 py-2 rounded-xl text-warm-500 bg-warm-100 hover:bg-warm-200 transition-all inline-flex items-center gap-2 text-sm font-semibold"
              onClick={() => setShowRecount(true)} title={t('surtido.escaneo.recount')}>
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">{t('surtido.escaneo.recount')}</span>
            </button>
            <button
              className="px-3 py-2 rounded-xl text-primary-600 bg-primary-50 hover:bg-primary-100 transition-all inline-flex items-center gap-2 text-sm font-semibold"
              onClick={() => setShowMissing(true)}>
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">{t('surtido.escaneo.missing')}</span>
            </button>
            <button
              className="btn-danger inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
              onClick={() => setShowFinalize(true)}>
              <Square className="w-4 h-4" /> {t('surtido.escaneo.finalize')}
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">

            {/* Session info card */}
            <div className="card p-3 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-warm-800 truncate leading-tight font-mono">{obc}</p>
                  <p className="text-[10px] text-warm-500 leading-tight">Validación en curso</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-3xl font-black text-warm-800 tracking-tighter leading-none">
                    {totalScanned}<span className="text-xs font-medium text-warm-400">/{totalExpected}</span>
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 bg-warm-100 rounded-full overflow-hidden border border-warm-200/50 mb-1">
                <div className={`h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r ${
                  progress >= 100 ? 'from-success-400 to-success-600' :
                  progress >= 80  ? 'from-primary-400 to-accent-500' :
                  'from-primary-400 to-primary-600'
                } ${progress > 0 ? 'min-w-[6px]' : ''}`}
                  style={{ width: `${progress}%` }} />
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-warm-100">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success-50">
                  <p className="text-lg font-extrabold text-success-600 leading-none">{counts.ok}</p>
                  <p className="text-[9px] text-success-600 uppercase tracking-wider font-bold leading-tight">Valid.</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warning-50">
                  <p className="text-lg font-extrabold text-warning-600 leading-none">{Math.max(0, totalExpected - counts.ok)}</p>
                  <p className="text-[9px] text-warning-600 uppercase tracking-wider font-bold leading-tight">Pend.</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-danger-50">
                  <p className="text-lg font-extrabold text-danger-600 leading-none">{counts.rejected}</p>
                  <p className="text-[9px] text-danger-600 uppercase tracking-wider font-bold leading-tight">Rech.</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/60">
                  <Timer className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-warm-700 font-mono leading-none">{fmtElapsed(sessionElapsed)}</p>
                    <p className="text-[8px] text-warm-400 uppercase tracking-wider font-bold">Tiempo</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scan input */}
            <div className="relative">
              <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
              <input
                ref={scanRef}
                type="text"
                className="w-full pl-14 pr-5 py-5 text-xl bg-white border-2 border-warm-200 rounded-2xl
                  focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:shadow-glow
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
                  className={`p-4 rounded-2xl flex items-center gap-3 border ${
                    lastScan.result === 'ok'        ? 'bg-success-50/80 border-success-200' :
                    lastScan.result === 'duplicate' ? 'bg-warning-50/80 border-warning-200' :
                    'bg-danger-50/80 border-danger-200'
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
            <div className="flex gap-1 border-b border-warm-100">
              {['cajas', 'productos'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`pb-2.5 px-4 text-sm font-semibold transition-all border-b-2 ${
                    activeTab === tab ? 'text-primary-700 border-primary-500' : 'text-warm-500 border-transparent hover:text-warm-700'
                  }`}>
                  {t(`surtido.escaneo.tab_${tab}`)}
                </button>
              ))}
            </div>

            {activeTab === 'cajas' && (
              <ItemsTable items={allItems.filter(i => i.type === 'box')} itemCounts={itemCounts} t={t}
                onManualAdjust={(code, delta) => {
                  setItemCounts(m => { const next = new Map(m); next.set(code, Math.max(0, (m.get(code) || 0) + delta)); return next })
                  if (delta > 0 && sessionId)
                    addEventMut.mutate({ session_id: sessionId, scanned_code: code, normalized_code: code, scan_result: 'ok', quantity: 1, _dedupeKey: `MAN_${code}_${Date.now()}` })
                }} />
            )}
            {activeTab === 'productos' && (
              <ItemsTable items={allItems.filter(i => i.type === 'sku')} itemCounts={itemCounts} t={t}
                onManualAdjust={(code, delta) => {
                  setItemCounts(m => { const next = new Map(m); next.set(code, Math.max(0, (m.get(code) || 0) + delta)); return next })
                }} />
            )}
          </div>
        </div>

        {/* Right history panel */}
        <div className="hidden lg:flex flex-col w-56 shrink-0 border-l border-warm-100 bg-warm-50/60">
          <div className="px-4 py-3 border-b border-warm-100 bg-white">
            <h3 className="text-xs font-bold text-warm-600 uppercase tracking-wide flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Últimos escaneos
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {history.length === 0 ? (
              <p className="text-xs text-warm-400 text-center py-6">Sin escaneos aún</p>
            ) : (
              history.map((e, i) => (
                <div key={i} className={`px-2.5 py-2 rounded-xl text-xs flex items-center gap-2 ${
                  e.result === 'ok'        ? 'bg-success-50 text-success-800' :
                  e.result === 'duplicate' ? 'bg-warning-50 text-warning-800' :
                  'bg-danger-50 text-danger-800'
                }`}>
                  <span className="font-mono font-semibold truncate flex-1">{e.code}</span>
                  <span className="opacity-60 shrink-0 tabular-nums">{new Date(e.ts).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recount modal */}
      <Modal isOpen={showRecount} onClose={() => setShowRecount(false)} title={t('surtido.escaneo.recount')} icon={RotateCcw}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setShowRecount(false)}>{t('common.cancel')}</button>
            <button className="btn-primary inline-flex items-center gap-2" onClick={() => recountMut.mutate()} disabled={recountMut.isPending}>
              {recountMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {t('surtido.escaneo.recount')}
            </button>
          </div>
        }>
        <p className="text-sm text-warm-600">{t('surtido.escaneo.recount_confirm')}</p>
      </Modal>

      {/* Missing items modal */}
      <Modal isOpen={showMissing} onClose={() => setShowMissing(false)} title={t('surtido.escaneo.missing_title')} icon={List}
        footer={<button className="btn-ghost" onClick={() => setShowMissing(false)}>{t('common.close')}</button>}>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {missingItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 size={28} className="text-success-500" />
              <p className="text-sm text-success-600 font-medium">Todo completo</p>
            </div>
          ) : (
            missingItems.map((item, i) => {
              const scanned = itemCounts.get(item.displayCode) || 0
              return (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-warm-50 rounded-xl text-sm">
                  <span className="font-mono text-xs font-semibold">{item.displayCode}</span>
                  <span className="text-warning-700 font-medium tabular-nums">{scanned}/{item.expectedQty}</span>
                </div>
              )
            })
          )}
        </div>
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
          </div>
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
