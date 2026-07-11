import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { STALE } from '../../../core/constants/queryConfig'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, CheckCircle2, XCircle, AlertCircle, Loader2, Wifi, WifiOff,
  ArrowLeft, RotateCcw, List, Package, Clock, Play, RefreshCw,
  ScanBarcode, ScanLine, Square, Timer, Zap, ChevronRight, BadgeCheck, ShieldCheck,
  MapPin, XOctagon, Plus, Edit3, X, AlertTriangle, Copy, Check,
  PanelRightClose, PanelRightOpen, Save, PartyPopper, Layers, Database,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import BarcodeScannerModal from '../../../core/components/common/BarcodeScannerModal'
import Modal from '../../../core/components/common/Modal'
import CatalogEmptyHint from '../../../core/components/common/CatalogEmptyHint'
import DataSyncStatus from '../../../core/components/common/DataSyncStatus'
import StatusPill from '../../../core/components/common/StatusPill'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { generateCodeVariations, normalizeCodeFast, normalizeScanCode } from '../../Shared/Wms/normalizeCode'
import { playSound, initAudio } from '../../Shared/Wms/playSound'
import {
  getOutboundList, getOutboundDetail,
  createScanSession, updateScanSession, addScanEvent, addManualScanEvent, clearSessionEvents,
  getManualEntryReasons,
  upsertOrderTracking, getScanSession, getRecords, getBoxStatusDetail, getOrderTracking,
} from '../services/surtidoService'
import { refreshSheet, getCacheTimestamp, getCacheStatus } from '../../WmsHub/services/googleSheetsService'
import { captureErrorEvent } from '../../../core/services/errorTelemetry'
import { fmtDate, fmtDateTime as formatDateTimeTz, fmtTimeShort } from '../../../core/utils/dateFormat'
import { useSurtidoStore } from '../stores/surtidoStore'
import { useOfflineStore } from '../../../core/stores/offlineStore'
import OfflineBlockedModal from '../../../core/components/common/OfflineBlockedModal'

const SCANNER_THRESHOLD_MS = 100   // per-character inter-key gap (ScanRecount)
const SCANNER_TOTAL_MS = 2000       // base budget first-char→Enter for scanner barcodes
// Codes past this length (QR/2D payloads, e.g. the JSON blobs some WMS scanners emit)
// get extra time on top of SCANNER_TOTAL_MS — a fixed budget was long enough for a
// short 10-20 char code but too tight for a 100+ char payload transmitted at the same
// keystroke rate, which occasionally tipped a genuine scan over the limit and got it
// discarded as "manual typing" with zero trace anywhere (not even a rejected/duplicate
// pick_event) — the box looked scanned to the operator but the system never saw it.
const SCANNER_BASE_CHARS = 40
const SCANNER_EXTRA_MS_PER_CHAR = 15
function scannerTimeBudgetMs(length) {
  if (length <= SCANNER_BASE_CHARS) return SCANNER_TOTAL_MS
  return SCANNER_TOTAL_MS + (length - SCANNER_BASE_CHARS) * SCANNER_EXTRA_MS_PER_CHAR
}
const TABS_KEY = 'kirion_surtido_tabs'
const ACTIVE_TAB_KEY = 'kirion_surtido_active_tab'
const SESSION_KEY = (tabId) => `kirion_surtido_session_${tabId}`
const LOCATION_MAX_LENGTH = 16

function genId() { return Math.random().toString(36).slice(2, 9) }
function safeParseJson(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeLocationValue(raw) {
  if (!raw) return ''
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[／⁄]/g, '/')
    // ES/EN keyboards produce different glyphs on the same key when toggling
    // layouts (straight ", curly “ ” „ ‟, prime ″, acute/backtick used as a
    // quote). Location codes use one as a separator — normalize them all to a
    // single canonical " so it's recognized regardless of which layout typed it.
    .replace(/[""„‟´`ˮ″]/g, '"')
    .replace(/\s+/g, '')
}

function validateLocationValue(raw) {
  const trimmed = String(raw || '').trim()
  const normalized = normalizeLocationValue(trimmed)
  const quoteCount = (normalized.match(/"/g) || []).length
  // A single " is a legitimate location separator (see normalizeLocationValue).
  // Only treat it as a scanned JSON payload once there are 2+ — that's what an
  // actual "key":"value" structure looks like — plus the unambiguous JSON
  // structure characters and known payload field names.
  const looksStructuredPayload =
    /[{}[\]]/u.test(trimmed)
    || quoteCount > 1
    || /(?:reference_id|ops_data|container_type|source|seller)/i.test(trimmed)

  if (!normalized) {
    return { ok: false, reason: 'empty', summary: 'La ubicacion esta vacia.', normalized: '' }
  }
  if (looksStructuredPayload) {
    return {
      ok: false,
      reason: 'payload',
      summary: 'Se detecto un payload de escaner y no una ubicacion valida.',
      normalized,
    }
  }
  if (!/^[A-Z0-9/"-]+$/.test(normalized)) {
    return {
      ok: false,
      reason: 'charset',
      summary: 'La ubicacion solo permite letras, numeros, "-", "/" y una " de separacion.',
      normalized,
    }
  }
  if (normalized.length > LOCATION_MAX_LENGTH) {
    return {
      ok: false,
      reason: 'length',
      summary: `La ubicacion excede el maximo permitido de ${LOCATION_MAX_LENGTH} caracteres.`,
      normalized,
    }
  }
  return { ok: true, normalized }
}

function buildDefaultTab(label) {
  return { id: genId(), label }
}

function hasStoredSessionForTab(tabId) {
  const stored = safeParseJson(sessionStorage.getItem(SESSION_KEY(tabId)))
  return !!(stored?.obc && stored?.sessionId)
}

function normalizeStoredTabs(value, fallbackLabel) {
  if (!Array.isArray(value)) return []

  const tabs = value
    .map((tab) => {
      if (!tab || typeof tab !== 'object') return null
      const id = typeof tab.id === 'string' && tab.id.trim() ? tab.id : genId()
      const label = typeof tab.label === 'string' && tab.label.trim() ? tab.label : fallbackLabel
      return { id, label }
    })
    .filter(Boolean)

  const deduped = []
  const seen = new Set()
  tabs.forEach((tab) => {
    if (seen.has(tab.id)) return
    seen.add(tab.id)
    deduped.push(tab)
  })
  return deduped
}

function buildItemMaps(detailData) {
  const detail = detailData?.data ?? detailData
  if (!detail) return { packageMap: new Map(), productMap: new Map() }
  const packageList = detail.packageList ?? detail.details ?? detail.items ?? []
  const productList = detail.productList ?? []
  const packageMap = new Map()
  packageList.forEach(p => {
    const codes = [p.customizeCode, p.boxType, p.boxCode].filter(Boolean)
    const expectedQty = p.quantity ?? p.totalPackageQty ?? p.qty ?? 1
    let primaryNorm = null
    for (const c of codes) {
      const n = normalizeCodeFast(c)
      if (n) { primaryNorm = n; break }
    }
    if (!primaryNorm) return
    const entry = { ...p, expectedQty, scannedQty: 0, type: 'box', displayCode: primaryNorm }
    codes.forEach(c => {
      const norm = normalizeCodeFast(c)
      if (!norm) return
      for (const variant of generateCodeVariations(norm, false)) {
        packageMap.set(variant, entry)
      }
    })
  })
  const productMap = new Map()
  productList.forEach(p => {
    const norm = normalizeCodeFast(p.sku || '')
    const expectedQty = p.quantity ?? p.qty ?? p.totalProductQty ?? 1
    if (!norm) return
    const entry = { ...p, expectedQty, scannedQty: 0, type: 'sku', displayCode: norm }
    for (const variant of generateCodeVariations(norm, false)) {
      productMap.set(variant, entry)
    }
  })
  return { packageMap, productMap }
}

function findMatchedItem(code, packageMap, productMap) {
  for (const variant of generateCodeVariations(code, false)) {
    const matched = packageMap.get(variant) || productMap.get(variant)
    if (matched) return matched
  }
  return null
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

const fmtDateTime = (value) => {
  if (!value) return '—'
  return formatDateTimeTz(value)
}

function getHistoryTimeBounds(history) {
  const timestamps = (history || []).map((item) => item?.ts).filter(Boolean)
  if (timestamps.length === 0) return { first: null, last: null }
  return {
    first: timestamps.reduce((min, value) => (value < min ? value : min), timestamps[0]),
    last: timestamps.reduce((max, value) => (value > max ? value : max), timestamps[0]),
  }
}

function getValidationCodeKey({ normalized_code, scanned_code, matched_box_type, code }) {
  return normalizeCodeFast(matched_box_type || normalized_code || scanned_code || code || '')
}

function buildCompletedSnapshot({
  source,
  reason = 'already_validated',
  obc,
  destino,
  validatedBy,
  scanned = 0,
  expected = 0,
  rejected = 0,
  startedAt = null,
  completedAt = null,
}) {
  const elapsed = startedAt && completedAt
    ? Math.max(0, Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : 0
  return {
    source,
    reason,
    obc,
    destino: destino || null,
    validatedBy: validatedBy || null,
    scanned: Number(scanned || 0),
    expected: Number(expected || 0),
    rejected: Number(rejected || 0),
    missing: Math.max(0, Number(expected || 0) - Number(scanned || 0)),
    progress: Number(expected || 0) > 0 ? Math.min(100, Math.round((Number(scanned || 0) / Number(expected || 0)) * 100)) : 0,
    sessionStart: startedAt,
    elapsed,
    startedAt,
    completedAt,
  }
}

/* ─── Search step ─────────────────────────────────────────── */
function SearchStep({ onFound }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const [input, setInput] = useState('')
  const [results, setResults] = useState(null)
  const inputRef = useRef(null)
  const { data: outboundData, isLoading: loading } = useQuery({
    queryKey: ['outbound-list-validacion-search'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
  })
  const allOrders = useMemo(() => getRecords(outboundData), [outboundData])

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  function doSearch(q) {
    if (!q.trim()) return
    if (allOrders.length === 0) return
    const normQ = normalizeCodeFast(q.trim())
    const lowerQ = q.trim().toLowerCase()
    const filtered = allOrders.filter(r => {
      if ((r.outboundOrderNo || '').toLowerCase().includes(lowerQ)) return true
      if ((r.thirdOrderNo || '').toLowerCase().includes(lowerQ)) return true
      if ((r.logisticsTrackNo || '').toLowerCase().includes(lowerQ)) return true
      if (normQ && normalizeCodeFast(r.customizeCode || '').includes(normQ)) return true
      if (normQ && (r.allCustomizeCodes || []).some(c => normalizeCodeFast(c).includes(normQ))) return true
      return false
    })
    if (filtered.length === 0) { toast.error(t('surtido.escaneo.order_not_found') + ': ' + q); setResults([]); return }
    if (filtered.length === 1) { onFound(filtered[0].outboundOrderNo); return }
    setResults(filtered)
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-6">
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
                    <p className="text-[11px] text-warm-400">{r.totalQty ?? '?'} {t('surtido.validacion.units')} · {r.createTime ? fmtDate(r.createTime) : '—'}</p>
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
    <div className="flex-1 overflow-y-auto p-3 md:p-6">
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
            <th className="text-right px-3 py-2.5 font-bold text-warm-500 hidden sm:table-cell">{t('surtido.escaneo.pending')}</th>
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
                <td className={`px-3 py-2 text-right font-semibold hidden sm:table-cell ${pending > 0 ? 'text-warning-700' : 'text-success-600'}`}>{pending}</td>
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
              <th className="table-header w-10 hidden sm:table-cell">#</th>
              <th className="table-header">{t('surtido.validacion.code_header')}</th>
              <th className="table-header">{t('common.status')}</th>
              <th className="table-header text-right hidden sm:table-cell">{t('surtido.validacion.created_at')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {items.map((e, i) => (
              <tr key={i} className="table-row">
                <td className="px-3 py-2.5 hidden sm:table-cell">
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
                <td className="px-3 py-2.5 text-right text-warm-400 tabular-nums hidden sm:table-cell">{fmtDateTime(e.ts)}</td>
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
              <th className="table-header w-10 hidden sm:table-cell">#</th>
              <th className="table-header w-8" />
              <th className="table-header">{t('surtido.validacion.code_header')}</th>
              <th className="table-header text-right hidden sm:table-cell">{t('surtido.validacion.created_at')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {[...items].sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0)).map((e, i) => (
              <tr key={i} className="hover:bg-primary-100 transition-colors">
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <span className="w-6 h-6 rounded-lg bg-success-100 text-success-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                </td>
                <td className="px-1 py-2.5"><CheckCircle2 size={12} className="text-success-500" /></td>
                <td className="px-3 py-2.5 font-mono font-semibold text-success-700">
                  <span className="inline-flex items-center gap-1.5 flex-wrap">
                    {e.code}
                    {e.isManual && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-warning-100 text-warning-700 border border-warning-200 leading-none normal-case tracking-normal">
                        {t('surtido.validacion.manual_chip')}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-warm-400 tabular-nums hidden sm:table-cell">{fmtDateTime(e.ts)}</td>
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
    const norm = normalizeScanCode(raw.trim())
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
  const [searchError, setSearchError] = useState(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const inputRef = useRef(null)
  const pendingQueryRef = useRef(null)

  // Pre-fetch when modal opens so doSearch is instant (no network block on search)
  const { data: outboundData, isLoading: isLoadingSheet, error: sheetFetchError } = useQuery({
    queryKey: ['outbound-list-quick'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
    enabled: isOpen,
  })

  // Single source of truth for "is this order already validated": the same unpaginated
  // pick_order_tracking + pick_sessions-stats view Validacion.jsx itself relies on. This used
  // to call getScanSessions({ pageSize: 100 }) — capped at the 100 most-recently-updated
  // sessions — so an order validated a while ago could silently fall out of the page and show
  // as "sin validar" here while Validacion.jsx (which checks per-order, uncapped) correctly
  // showed it as already validated.
  const { data: trackingData } = useQuery({
    queryKey: ['wms-order-tracking-quick'],
    queryFn: getOrderTracking,
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

  // Surface sheet-level errors once (not on every search)
  useEffect(() => {
    if (!sheetFetchError) return
    const code = sheetFetchError?.code
    if (code === 'SHEET_NOT_CONFIGURED') {
      setSearchError('La hoja de salidas no esta configurada. Ve a WmsHub -> Configuracion y guarda la URL de salidas.')
    } else if (code === 'SHEET_EMPTY') {
      setSearchError('La hoja de Google Sheets esta vacia o tiene menos de 2 filas. Verifica el contenido.')
    } else if (code === 'SHEET_PROXY_UNAVAILABLE') {
      setSearchError('El proxy de Google Sheets esta temporalmente no disponible. Intenta de nuevo en unos segundos.')
    } else if (code === 'BACKEND_UNAVAILABLE') {
      setSearchError('El backend de Kirion no esta disponible temporalmente. Espera un momento e intenta de nuevo.')
    } else if (code === 'SHEET_TIMEOUT') {
      setSearchError('La consulta a Google Sheets tardo demasiado. Intenta nuevamente.')
    } else {
      setSearchError(`Error de conexion: ${sheetFetchError?.message ?? 'desconocido'}.`)
    }
  }, [sheetFetchError])

  const trackingMap = useMemo(() => {
    const raw = getRecords(trackingData)
    const map = new Map()
    raw.forEach(s => { if (s.outbound_order_no) map.set(s.outbound_order_no, s) })
    return map
  }, [trackingData])

  const searchableOutbound = useMemo(() => (
    getRecords(outboundData).map((row) => ({
      ...row,
      _receiverName: String(row.receiverName || '').toLowerCase(),
      _customizeCode: String(row.customizeCode || '').toLowerCase(),
      _boxType: String(row.boxType || '').toLowerCase(),
      _allCustomizeCodes: (row.allCustomizeCodes || []).map(code => String(code || '').toLowerCase()),
      _orderTokens: [
        String(row.outboundOrderNo || '').toLowerCase(),
        String(row.thirdOrderNo || '').toLowerCase(),
        String(row.logisticsTrackNo || '').toLowerCase(),
      ],
    }))
  ), [outboundData])

  // Synchronous — filters already-loaded in-memory data, no network call
  function doSearch(q) {
    if (!q.trim()) return
    setSearchError(null)
    // Sheet still loading (e.g. Enter pressed right after opening) — queue the
    // search instead of reporting a false "no records" error.
    if (isLoadingSheet) {
      pendingQueryRef.current = q
      return
    }
    if (searchableOutbound.length === 0) {
      setSearchError('La hoja de salidas no contiene registros. Verifica la configuracion en WmsHub.')
      setResults([])
      return
    }
    const resolvedQuery = normalizeScanCode(q.trim()) || q.trim()
    const norm = resolvedQuery.toLowerCase()
    const variations = generateCodeVariations(resolvedQuery).map(v => v.toLowerCase())
    const matchesCode = (field) => {
      const f = (field || '').toLowerCase()
      return f.length > 0 && variations.some(v => f.includes(v))
    }
    const filtered = searchableOutbound
      .filter(r =>
        r._orderTokens.some(token => token && variations.some(v => token.includes(v))) ||
        r._receiverName.includes(norm) ||
        matchesCode(r._customizeCode) ||
        matchesCode(r._boxType) ||
        r._allCustomizeCodes.some(c => matchesCode(c))
      )
      .map(r => ({
        ...r,
        matchedBoxCode: (r.allCustomizeCodes || []).find(c => matchesCode(c))
          || (matchesCode(r.customizeCode) ? r.customizeCode : null),
      }))
    setResults(filtered.slice(0, 20))
  }

  // Run a search that was queued while the sheet was still loading.
  useEffect(() => {
    if (!isLoadingSheet && pendingQueryRef.current) {
      const q = pendingQueryRef.current
      pendingQueryRef.current = null
      doSearch(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingSheet])

  // Fetch box-level status only for orders where the search matched a specific
  // box code. Fetching this for every result (up to 20) fans out too many
  // parallel requests against the DB pool and stalls the whole modal — scope
  // it to the case that actually needs it.
  const boxMatchedObcs = useMemo(() => (
    [...new Set((results || []).filter(r => r.matchedBoxCode).map(r => r.outboundOrderNo))]
  ), [results])

  const { data: boxDetailByObc } = useQuery({
    queryKey: ['wms-box-status-detail-quick', boxMatchedObcs.slice().sort().join('|')],
    queryFn: async () => {
      const perObc = await Promise.all(
        boxMatchedObcs.map(obc => getBoxStatusDetail(obc).then(r => r?.data ?? []).catch(() => []))
      )
      const map = new Map()
      boxMatchedObcs.forEach((obc, i) => map.set(obc, perObc[i]))
      return map
    },
    enabled: boxMatchedObcs.length > 0,
    staleTime: 15000,
  })

  function getValidatedInfo(result) {
    if (!result.matchedBoxCode) return null
    const rows = boxDetailByObc?.get(result.outboundOrderNo) || []
    const variations = generateCodeVariations(result.matchedBoxCode).map(v => v.toLowerCase())
    const row = rows.find(r => variations.includes((r.box_code || '').toLowerCase()))
    if (!row || row.estado !== 'validada') return null
    return row
  }

  function getValidatedBoxCount(outboundOrderNo) {
    const rows = boxDetailByObc?.get(outboundOrderNo) || []
    return rows.filter(r => r.estado === 'validada').length
  }

  function handleScanResult(text) {
    setScannerOpen(false)
    setQuery(text)
    doSearch(text)
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.validacion.quick_search_title')} icon={Search} size="lg">
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex flex-1 min-w-0 items-center gap-1 h-12 bg-warm-50 border-2 border-warm-200 rounded-2xl pl-4 pr-2 transition-all focus-within:border-primary-400 focus-within:shadow-sm overflow-hidden">
              <ScanBarcode className="hidden w-4 h-4 text-warm-300 shrink-0 sm:block" />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="sm:hidden shrink-0 -ml-0.5 p-0.5 text-primary-600 hover:text-primary-700 transition-colors"
                aria-label="Escanear codigo con camara"
                title="Escanear codigo"
              >
                <ScanLine size={18} />
              </button>
              <input
                ref={inputRef}
                type="text"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck="false"
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
              disabled={!query.trim() || isLoadingSheet}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              {isLoadingSheet ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </motion.button>
          </div>

          {isLoadingSheet && !searchError && results === null && (
            <div className="text-center py-6 text-sm text-warm-400 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              <span>Cargando datos de salidas...</span>
            </div>
          )}

          {searchError && (
            <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 flex items-start gap-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
              <p className="text-danger-700 leading-snug">{searchError}</p>
            </div>
          )}

          {!isLoadingSheet && !searchError && results === null && (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map(r => {
              const tracking = trackingMap.get(r.outboundOrderNo)
              const validatedBoxCount = getValidatedBoxCount(r.outboundOrderNo)
              const totalExpected = tracking?.total_expected ?? r.outboundBoxCount ?? null
              const scannedCount = tracking?.total_scanned ?? validatedBoxCount
              const pct = (totalExpected ?? 0) > 0
                ? Math.min(100, Math.round((scannedCount / totalExpected) * 100))
                : null
              const isComplete = totalExpected != null && totalExpected > 0 && scannedCount >= totalExpected
              const isValidating = !isComplete && (tracking?.status === 'validating' || validatedBoxCount > 0)

              let statusBadge = null
              if (isComplete) {
                statusBadge = <StatusPill size="xs" className="shrink-0 bg-success-100 text-success-700">Completa</StatusPill>
              } else if (isValidating) {
                statusBadge = <StatusPill size="xs" className="shrink-0 bg-primary-100 text-primary-700">Validando</StatusPill>
              } else if (tracking) {
                statusBadge = <StatusPill size="xs" className="shrink-0 bg-warm-100 text-warm-600">{tracking.status}</StatusPill>
              } else {
                statusBadge = <StatusPill size="xs" className="shrink-0 bg-warm-100 text-warm-500">{t('surtido.validacion.card_not_validated')}</StatusPill>
              }

              const validatedInfo = getValidatedInfo(r)

              return (
                <div key={r.outboundOrderNo} className="rounded-2xl border border-warm-200 bg-white shadow-sm hover:shadow-md hover:border-primary-200 transition-all overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-gradient-to-r from-primary-50 to-accent-50/40 border-b border-warm-100 flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sm text-warm-900 truncate">{r.outboundOrderNo}</span>
                    {statusBadge}
                  </div>

                  {r.matchedBoxCode && (
                    <div className="px-4 py-2.5 border-b border-warm-100 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-warm-700 text-xs truncate">{r.matchedBoxCode}</span>
                        {!validatedInfo && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-warm-100 text-warm-500 shrink-0">
                            {t('surtido.validacion.card_not_validated')}
                          </span>
                        )}
                      </div>
                      {validatedInfo && (
                        <div className="flex items-start gap-2 rounded-xl bg-success-50 border border-success-100 px-2.5 py-2">
                          <ShieldCheck size={16} className="text-success-600 shrink-0 mt-0.5" />
                          <div className="min-w-0 leading-snug">
                            <p className="text-xs font-semibold text-success-700">{formatDateTimeTz(validatedInfo.updated_at)}</p>
                            <p className="text-[11px] text-success-600 break-all">{validatedInfo.updated_by_nombre || validatedInfo.updated_by || '—'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs flex-1">
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_delivery')}</p>
                      <p className="font-medium text-warm-700 mt-0.5 truncate">{r.outboundTime ? fmtDate(r.outboundTime) : '—'}</p>
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
                          {scannedCount}/{totalExpected ?? '?'} · {pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isComplete ? 'bg-success-400' : 'bg-primary-400'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="px-4 pb-3 pt-1">
                    {isComplete ? (
                      <button
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-warm-100 text-warm-700 text-xs font-semibold hover:bg-warm-200 transition-colors shadow-sm"
                        onClick={() => { onClose(); window.location.href = `/Surtido/ordenes/${encodeURIComponent(r.outboundOrderNo)}` }}>
                        <Database size={11} /> Ver Registros
                      </button>
                    ) : (
                      <button
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm"
                        onClick={() => { onValidate(r.outboundOrderNo); onClose() }}>
                        <ScanBarcode size={11} /> {t('surtido.validacion.card_validate')}
                      </button>
                    )}
                  </div>
                </div>
              )
              })}
            </div>
          )}
        </div>
      </Modal>
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
      />
    </>
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
          className="flex-1 min-w-0 text-sm bg-transparent outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 text-warm-700 placeholder:text-warm-300"
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
function TabSession({ tabId, isActive, initialObc, initialAutoStart, onSessionChange, onUpdateTab, onNewOrder, onOpenObc, canCreate, canUpdate, canDelete, checkDuplicateObc }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const scanRef = useRef(null)
  const copyTimeoutRef = useRef(null)
  const lastKeyTimeRef = useRef(0)
  const inputStartTimeRef = useRef(0)

  const [step, setStep] = useState('search')
  const [obc, setObc] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionStart, setSessionStart] = useState(null)
  const [selectedUbicacion, setSelectedUbicacion] = useState(null)
  const [lastScan, setLastScan] = useState(null)
  const [history, setHistory] = useState([])
  const [counts, setCounts] = useState({ ok: 0, rejected: 0 })
  const [itemCounts, setItemCounts] = useState(new Map())
  const surtidoPendingCount = useSurtidoStore((s) => s.pendingSync.length)
  const isOffline = useOfflineStore((s) => s.status === 'offline')
  const [isSyncing, setIsSyncing] = useState(false)
  const [retryingConnection, setRetryingConnection] = useState(false)
  const [showRecount, setShowRecount] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [showFinalize, setShowFinalize] = useState(false)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [completionSnapshot, setCompletionSnapshot] = useState(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [autoStartPending, setAutoStartPending] = useState(initialAutoStart ?? false)
  const [finalNotes, setFinalNotes] = useState('')
  const [activeTab, setActiveTab] = useState('registros')
  const [sessionSearch, setSessionSearch] = useState('')
  const [sessionStatusFilter, setSessionStatusFilter] = useState('')
  const [ubicacionConfirmed, setUbicacionConfirmed] = useState(false)
  const [locationInputValue, setLocationInputValue] = useState('')
  const [locationFlash, setLocationFlash] = useState(false)
  const [obcCopied, setObcCopied] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualEntry, setManualEntry] = useState({ code: '', reasonId: '', notes: '' })
  const [invalidLocationModal, setInvalidLocationModal] = useState({ open: false, raw: '', normalized: '', summary: '' })
  const locationRef = useRef(null)
  const autoFinalizeLockRef = useRef(false)
  const sessionCreateFiredRef = useRef(false)
  const scannedOkCodesRef = useRef(new Set())
  const isSyncingRef = useRef(false)
  const sidebarStorageKey = `kirion_surtido_validation_sidebar_${user?.id || 'guest'}`
  const sessionCompleteLocked = showCompletionModal || !!completionSnapshot

  const historyTimeBounds = useMemo(() => getHistoryTimeBounds(history), [history])
  const firstScanTs = historyTimeBounds.first

  const sessionElapsed = useSessionTimer(firstScanTs || sessionStart)
  const storageKey = SESSION_KEY(tabId)

  useEffect(() => {
    try {
      const savedVisibility = localStorage.getItem(sidebarStorageKey)
      if (savedVisibility === 'hidden') setSidebarVisible(false)
    } catch {}
  }, [sidebarStorageKey])

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.obc && s.sessionId) {
          const restoreLocally = () => {
            setObc(s.obc); setSessionId(s.sessionId); setSessionStart(new Date(s.sessionStart))
            setCounts(s.counts || { ok: 0, rejected: 0 })
            setItemCounts(new Map(s.itemCountsArr || []))
            setSelectedUbicacion(s.ubicacion || null)
            setUbicacionConfirmed(s.ubicacionConfirmed || !!s.ubicacion)
            setStep('session')
            onUpdateTab({ obc: s.obc, step: 'session' })
          }
          const discardAndRestart = () => {
            sessionStorage.removeItem(storageKey)
            setObc(s.obc); setStep('session'); setAutoStartPending(true)
            onUpdateTab({ obc: s.obc, step: 'session' })
          }

          // Offline at mount: no way to verify against the server, and there's
          // nothing worse we can do than trust local state — restore it so
          // scanning can resume and queue instead of getting stuck forever
          // waiting on a network call that can't succeed.
          if (useOfflineStore.getState().status === 'offline') {
            restoreLocally()
            return
          }

          // Verify the stored session is still open before trusting it
          getScanSession(s.sessionId)
            .then(res => {
              const session = res?.data?.session ?? res?.data ?? res
              if (session?.status === 'open') {
                restoreLocally()
              } else {
                // Session closed/completed — clear storage and restart
                discardAndRestart()
              }
            })
            .catch((err) => {
              // No server response (offline/connection dropped mid-check) — we can't
              // confirm the session is gone, so don't discard in-progress work.
              if (!err.response) {
                restoreLocally()
                return
              }
              // Definitive response from the server (e.g. 404) — safe to discard.
              discardAndRestart()
            })
          return
        }
      } catch {}
    }
    if (initialObc) { setObc(initialObc); setStep('session'); setAutoStartPending(true); onUpdateTab({ obc: initialObc, step: 'session' }) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['wms-outbound-detail', obc],
    queryFn: () => getOutboundDetail(obc),
    enabled: !!obc && step !== 'search',
    staleTime: 60000,
  })
const { data: reasonsData } = useQuery({
    queryKey: ['wms-manual-entry-reasons'],
    queryFn: getManualEntryReasons,
    staleTime: STALE.CATALOG,
  })
  // Single source of truth for "is this order already validated": the unpaginated
  // pick_order_tracking + pick_sessions-stats view (see QuickSearchModal above for why the old
  // getScanSessions({ pageSize: 100 }) call here was unreliable for orders outside the page).
  const { data: trackingData, status: trackingStatus } = useQuery({
    queryKey: ['wms-sessions-list'],
    queryFn: getOrderTracking,
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

  const [conflictDetails, setConflictDetails] = useState(null)
  const [rejectedBoxModal, setRejectedBoxModal] = useState({ open: false, code: '' })
  
  // Rebuild local scan state (history/counts/itemCounts/dedupe set) from the session's
  // authoritative pick_events on the server. Needed whenever we resume a session that
  // already has progress but whose events never reached this browser's local storage
  // (different device/tab, or storage was cleared when the session went non-'open') —
  // without this the UI shows an empty session even though the backend correctly kept
  // the single existing record instead of creating a new one.
  const hydrateFromServerEvents = useCallback((events) => {
    if (!events || events.length === 0) return
    const sorted = [...events].sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at))
    const nextHistory = []
    const nextItemCounts = new Map()
    const okCodes = new Set()
    const seenValidated = new Set()
    let okCount = 0
    let rejectedCount = 0
    for (const e of sorted) {
      const norm = e.normalized_code || e.scanned_code
      const eventKey = getValidationCodeKey(e)
      let result = e.scan_result === 'not_found' ? 'rejected' : e.scan_result
      if (e.scan_result === 'ok' && eventKey && seenValidated.has(eventKey)) {
        result = 'duplicate'
      }
      nextHistory.unshift({ code: norm, result, ts: new Date(e.scanned_at).getTime() })
      if (result === 'ok') {
        okCount += 1
        if (eventKey) seenValidated.add(eventKey)
        okCodes.add(eventKey || norm)
        const matched = findMatchedItem(norm, packageMap, productMap)
        if (matched) nextItemCounts.set(matched.displayCode, (nextItemCounts.get(matched.displayCode) || 0) + 1)
      } else if (result === 'rejected' || result === 'duplicate') {
        rejectedCount += 1
      }
    }
    setHistory(nextHistory.slice(0, 500))
    setItemCounts(nextItemCounts)
    setCounts({ ok: okCount, rejected: rejectedCount })
    scannedOkCodesRef.current = okCodes
  }, [packageMap, productMap])

  const createSessionMut = useMutation({
    mutationFn: (force = false) => {
      const detail = detailData?.data ?? detailData
      const packageList = detail?.packageList ?? detail?.details ?? detail?.items ?? []
      return createScanSession({
        outbound_order_no: obc,
        third_order_no: detail?.thirdOrderNo || null,
        total_expected: packageList.reduce((s, p) => s + (p.quantity ?? p.totalPackageQty ?? p.qty ?? 1), 0),
        ubicacion_id: null,
        // Snapshot destino/tracking/canal/fecha at session-creation time so Registros
        // shows stable historical data instead of a live join against the WMS sheet
        // cache, which can change or drop the row later.
        receiver_name: detail?.receiverName || null,
        logistics_track_no: detail?.logisticsTrackNo || null,
        logistics_channel: detail?.logisticsChannel || null,
        outbound_delivery_at: detail?.expectedTime || detail?.outboundTime || null,
        force,
      })
    },
    onSuccess: (data) => {
      const s = data.data
      // Firm lock: the backend only ever returns a non-'open' session here when it's genuinely
      // finished (see the genuinelyComplete guard in POST /scan-session) — that order can never
      // be reopened for scanning again, regardless of what any local/cached tracking state says.
      const genuinelyComplete = s.status !== 'open' &&
        Number(s.total_expected) > 0 && Number(s.total_scanned) >= Number(s.total_expected)
      if (genuinelyComplete) {
        setAutoStartPending(false)
        sessionCreateFiredRef.current = false
        setConflictDetails(null)
        getScanSession(s.id)
          .then((res) => {
            const completedSession = res?.data?.session ?? res?.data ?? s
            setCompletionSnapshot(buildCompletedSnapshot({
              source: 'locked',
              obc,
              destino: (detailData?.data ?? detailData)?.receiverName || null,
              validatedBy: completedSession.operator_nombre || s.operator_nombre || null,
              scanned: completedSession.total_scanned ?? s.total_scanned,
              expected: completedSession.total_expected ?? s.total_expected,
              rejected: completedSession.total_rejected ?? 0,
              startedAt: completedSession.first_scan_at || completedSession.started_at || s.started_at || null,
              completedAt: completedSession.last_scan_at || completedSession.completed_at || completedSession.updated_at || s.completed_at || s.updated_at || null,
            }))
            setShowCompletionModal(true)
          })
          .catch(() => {
            setCompletionSnapshot(buildCompletedSnapshot({
              source: 'locked',
              obc,
              destino: (detailData?.data ?? detailData)?.receiverName || null,
              validatedBy: s.operator_nombre || null,
              scanned: s.total_scanned,
              expected: s.total_expected,
              rejected: 0,
              startedAt: s.started_at || null,
              completedAt: s.completed_at || s.updated_at || null,
            }))
            setShowCompletionModal(true)
          })
        return
      }
      setConflictDetails(null)
      const sid = s.id; const now = new Date()
      setSessionId(sid); setSessionStart(now); setStep('session')
      setSelectedUbicacion(null); setUbicacionConfirmed(false)
      autoFinalizeLockRef.current = false
      persistSession(obc, sid, now, null)
      upsertOrderTracking(obc, { status: 'validating' }).catch(() => {})
      onUpdateTab({ obc, step: 'session' })
      if (data.reused) {
        getScanSession(sid).then(res => hydrateFromServerEvents(res?.data?.events)).catch(() => {})
      } else {
        setHistory([]); setCounts({ ok: 0, rejected: 0 }); setItemCounts(new Map())
        scannedOkCodesRef.current = new Set()
      }
    },
    onError: (err) => {
      autoFinalizeLockRef.current = false
      if (err.response?.status === 409) {
        const details = err.response.data?.details
        const existingSid = details?.session_id
        // Same operator reconnect: reuse the existing open session
        const sameOperator = details?.operator_id != null
          ? Number(details.operator_id) === Number(user?.id)
          : details?.operator === user?.nombre_completo
        if (existingSid && sameOperator) {
          const now = new Date()
          setConflictDetails(null)
          setSessionId(existingSid); setSessionStart(now); setStep('session')
          setSelectedUbicacion(null); setUbicacionConfirmed(false)
          persistSession(obc, existingSid, now, null)
          onUpdateTab({ obc, step: 'session' })
          getScanSession(existingSid).then(res => hydrateFromServerEvents(res?.data?.events)).catch(() => {})
        } else {
          setConflictDetails(details)
        }
      } else {
        toast.error(t('toast.error'))
      }
    },
  })

  // Add render logic for the conflict modal
  // (Note: This component would need to be added to the JSX return as well)

  // Derived synchronously at render time (not inside an effect) so both effects below see the
  // same answer in the same commit — computing this independently inside each effect let them
  // race: on the render where trackingData first arrives, the early-guard effect below would
  // decide "already complete" and queue setAutoStartPending(false), but the session-create effect
  // that follows it in this file still ran with the OLD autoStartPending value (state updates
  // from an earlier effect aren't visible to a later effect in the same commit), so it fired
  // createSessionMut anyway — briefly starting a live scan session behind the completion modal.
  const existingTrackingForObc = useMemo(
    () => getRecords(trackingData).find(s => s.outbound_order_no === obc),
    [trackingData, obc]
  )
  const trackingAlreadyComplete = useMemo(() => {
    if (!existingTrackingForObc) return false
    const prevScanned = Number(existingTrackingForObc.total_scanned ?? 0)
    const prevExpected = Number(existingTrackingForObc.total_expected ?? 0)
    // Only a genuinely full count means there's nothing left to validate. A 'partial' tracking
    // status means a prior session was force-closed with boxes still missing — that's still an
    // incomplete order and must fall through to resuming the real session below, not get stuck
    // showing a read-only "already validated" snapshot forever.
    return prevExpected > 0 && prevScanned >= prevExpected
  }, [existingTrackingForObc])

  // Early guard: fire as soon as tracking data is ready, no need to wait for detailData
  useEffect(() => {
    if (!autoStartPending || step !== 'session' || trackingStatus === 'pending' || sessionId) return
    const existingTracking = existingTrackingForObc
    if (!existingTracking || !trackingAlreadyComplete) return
    const prevScanned = Number(existingTracking.total_scanned ?? 0)
    const prevExpected = Number(existingTracking.total_expected ?? 0)
    setAutoStartPending(false)
    setCounts({ ok: prevScanned, rejected: 0 })
    setCompletionSnapshot(buildCompletedSnapshot({
      source: 'history',
      obc,
      destino: (detailData?.data ?? detailData)?.receiverName || null,
      validatedBy: existingTracking.validated_by || null,
      scanned: prevScanned,
      expected: prevExpected,
      rejected: existingTracking.total_rejected ?? 0,
      startedAt: existingTracking.first_session_at || existingTracking.validation_started_at || null,
      completedAt: existingTracking.last_session_at || existingTracking.validation_completed_at || existingTracking.updated_at || null,
    }))
    setShowCompletionModal(true)
  }, [autoStartPending, step, trackingStatus, existingTrackingForObc, trackingAlreadyComplete, obc, sessionId, detailData]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoStartPending || step !== 'session' || detailLoading || !detailData || sessionId || createSessionMut.isPending) return
    // Wait for tracking data before deciding — prevents creating duplicate sessions for already-validated orders
    if (trackingStatus === 'pending') return
    // Already-complete orders are handled entirely by the early-guard effect above — never let
    // this effect race it into starting a live session for an order that's genuinely finished.
    if (trackingAlreadyComplete) return
    const validation = validateOrderBoxData(detailData)
    if (!validation.ok) {
      setAutoStartPending(false)
      toast.error(
        validation.reason === 'no_boxes'
          ? t('surtido.validacion.error_no_boxes')
          : validation.reason === 'no_codes'
          ? t('surtido.validacion.error_no_codes')
          : t('surtido.validacion.error_no_data')
      )
      clearSession()
      return
    }
    if (!canCreate) {
      setAutoStartPending(false)
      toast.error(t('toast.error'))
      clearSession()
      return
    }
    if (sessionCreateFiredRef.current) return
    sessionCreateFiredRef.current = true
    setAutoStartPending(false)
    createSessionMut.mutate()
  }, [autoStartPending, step, detailLoading, detailData, sessionId, createSessionMut.isPending, canCreate, t, trackingStatus, trackingAlreadyComplete, obc]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onSessionChange) return
    // Wait for sessionId — otherwise these toolbar actions (Faltante/Cancelar/Finalizar) show up
    // while the order is still being verified (pending overlay / already-validated check), before
    // there's an actual session to act on.
    if (step !== 'session' || !isActive || !sessionId) { onSessionChange(null); return }
    onSessionChange({
      pendingCount: surtidoPendingCount,
      isSyncing,
      onRecount:  canDelete && !sessionCompleteLocked ? () => setShowRecount(true) : null,
      onMissing:  () => setShowMissing(true),
      onCancel:   canDelete && !sessionCompleteLocked ? handleCancel : null,
      onFinalize: canUpdate && !sessionCompleteLocked && totalExpected > 0 && counts.ok < totalExpected ? () => setShowFinalize(true) : null,
    })
  }, [step, isActive, sessionId, surtidoPendingCount, isSyncing, sessionCompleteLocked, totalExpected, counts.ok, counts.rejected, canDelete, canUpdate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { isSyncingRef.current = isSyncing }, [isSyncing])

  useEffect(() => {
    const interval = setInterval(async () => {
      const { pendingSync: queue } = useSurtidoStore.getState()
      if (queue.length === 0 || isSyncingRef.current) return
      isSyncingRef.current = true
      setIsSyncing(true)
      const batch = [...queue]
      try {
        const results = await Promise.allSettled(batch.map(e => addScanEvent(e.payload)))
        const synced = batch.filter((_, i) => results[i].status === 'fulfilled').map(e => e.key)
        useSurtidoStore.getState().markSynced(synced)
      } finally {
        isSyncingRef.current = false
        setIsSyncing(false)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, []) // stable — never recreated

  // Keep the sessionStorage snapshot current as scans come in — otherwise a reload
  // mid-session (common on handheld devices with unstable connectivity) restores
  // stale counts from session creation time, making completed scans look lost.
  useEffect(() => {
    if (!sessionId || !obc || !sessionStart) return
    sessionStorage.setItem(storageKey, JSON.stringify({
      obc, sessionId, sessionStart: sessionStart.toISOString(),
      counts, itemCountsArr: [...itemCounts.entries()],
      ubicacion: selectedUbicacion, ubicacionConfirmed,
    }))
  }, [sessionId, obc, sessionStart, counts, itemCounts, selectedUbicacion, ubicacionConfirmed, storageKey])

  const persistSession = (newObc, newSessionId, newStart, ubicacion) => {
    sessionStorage.setItem(storageKey, JSON.stringify({
      obc: newObc, sessionId: newSessionId, sessionStart: newStart.toISOString(),
      counts: { ok: 0, rejected: 0 }, itemCountsArr: [], ubicacion: ubicacion || null,
    }))
  }

  const clearSession = () => {
    sessionStorage.removeItem(storageKey)
    scannedOkCodesRef.current = new Set()
    setStep('search'); setObc(null); setSessionId(null); setSessionStart(null)
    setLastScan(null); setHistory([]); setCounts({ ok: 0, rejected: 0 })
    setItemCounts(new Map()); setSelectedUbicacion(null)
    setUbicacionConfirmed(false); setLocationInputValue('')
    setShowFinalize(false)
    setShowCompletionModal(false)
    setCompletionSnapshot(null)
    setAutoStartPending(false)
    autoFinalizeLockRef.current = false
    sessionCreateFiredRef.current = false
    onUpdateTab({ obc: null, step: 'search' })
  }

  const copyObc = () => {
    if (!obc) return
    navigator.clipboard.writeText(obc).then(() => {
      setObcCopied(true)
      window.clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = window.setTimeout(() => setObcCopied(false), 1400)
    }).catch(() => toast.error(t('toast.error')))
  }

  useEffect(() => () => window.clearTimeout(copyTimeoutRef.current), [])

  const updateUbicacionMut = useMutation({
    mutationFn: (texto) => updateScanSession(sessionId, { ubicacion_nota: texto || null }),
    onSuccess: (_, texto) => confirmUbicacionLocally(texto),
    onError: (err, texto) => {
      confirmUbicacionLocally(texto)
      if (err.response?.status === 404) return // session gone server-side; nothing to sync
      // This used to only update local state on failure — the ubicacion looked confirmed
      // in the UI but the PUT that actually persists it to pick_sessions was simply
      // dropped, so it never made it to the server once the connection came back. Queue
      // it like scans/manual entries do. Only the latest value per session matters, so
      // drop any earlier queued ubicacion update for this session first — otherwise a
      // flush would fire both PUTs in parallel with no ordering guarantee.
      useSurtidoStore.setState(s => ({
        pendingSync: [
          ...s.pendingSync.filter(e => !(e.kind === 'ubicacion' && e.payload?.id === sessionId)),
          { key: `UBI_${sessionId}_${Date.now()}`, kind: 'ubicacion', payload: { id: sessionId, body: { ubicacion_nota: texto || null } } },
        ],
      }))
    },
  })

  function confirmUbicacionLocally(texto) {
    setSelectedUbicacion(texto || null)
    setUbicacionConfirmed(true)
    setLocationInputValue('')
    setLocationFlash(true)
    setTimeout(() => setLocationFlash(false), 1200)
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      try {
        const s = JSON.parse(saved)
        sessionStorage.setItem(storageKey, JSON.stringify({ ...s, ubicacion: texto || null, ubicacionConfirmed: true }))
      } catch {}
    }
    setTimeout(() => scanRef.current?.focus(), 80)
  }

  function tryConfirmUbicacion(raw) {
    const validation = validateLocationValue(raw)
    if (!validation.ok) {
      setInvalidLocationModal({
        open: true,
        raw: String(raw || '').trim(),
        normalized: validation.normalized || '',
        summary: validation.summary,
      })
      return
    }
    updateUbicacionMut.mutate(validation.normalized)
  }

  const addEventMut = useMutation({
    mutationFn: addScanEvent,
    onSuccess: () => {
      // A scan can be the one that completes the order (refreshPickSessionTotals flips
      // pick_order_tracking server-side) — invalidate so Ordenes reflects it immediately
      // instead of serving its cached pre-completion status for up to 5 minutes.
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
    },
    onError: (err, vars) => {
      if (err.response?.status === 404) {
        clearSession()
        useToastStore.getState().error(t('surtido.validacion.session_expired') || 'Sesión expirada. Inicia una nueva sesión.')
        return
      }
      useSurtidoStore.getState().enqueueSync({ key: vars._dedupeKey, payload: vars })
    },
  })

  const addManualEventMut = useMutation({
    mutationFn: (vars) => addManualScanEvent(vars),
    onSuccess: () => {
      // Same reasoning as addEventMut: a manual entry can complete the order too.
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
    },
    onError: (err, vars) => {
      if (err.response?.status === 404) {
        clearSession()
        toast.error(t('surtido.validacion.session_expired') || 'Sesión expirada. Inicia una nueva sesión.')
        return
      }
      // Local state (counts/history) was already applied optimistically before this
      // mutation fired — mirror addEventMut and queue for background sync instead of
      // showing a generic error that makes it look like the manual entry was lost.
      useSurtidoStore.getState().enqueueSync({ key: vars._dedupeKey, kind: 'manual', payload: vars })
    },
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
    const norm = normalizeScanCode(rawCode)
    if (!norm) return
    const matched = findMatchedItem(norm, packageMap, productMap)
    if (!matched) {
      playSound('error')
      setLastScan({ code: norm, result: 'rejected' })
      setHistory(h => [{ code: norm, result: 'rejected', ts: Date.now() }, ...h].slice(0, 500))
      setCounts(c => ({ ...c, rejected: c.rejected + 1 }))
      setRejectedBoxModal({ open: true, code: norm })
      addEventMut.mutate({ session_id: sessionId, scanned_code: rawCode, normalized_code: norm, scan_result: 'not_found', quantity: 1, ubicacion_nota: selectedUbicacion || null, _dedupeKey: `NF_${norm}_${Date.now()}` })
      return
    }
    const eventKey = getValidationCodeKey({ normalized_code: norm, matched_box_type: matched.type === 'box' ? (matched.boxType || matched.boxCode) : null })
    const isDup = scannedOkCodesRef.current.has(eventKey || norm)
    if (isDup) {
      playSound('duplicate')
      setLastScan({ code: norm, result: 'duplicate' })
      setHistory(h => [{ code: norm, result: 'duplicate', ts: Date.now() }, ...h].slice(0, 500))
      toast.warning(t('surtido.validacion.duplicate') + ': ' + norm)
      addEventMut.mutate({ session_id: sessionId, scanned_code: rawCode, normalized_code: norm, scan_result: 'duplicate', quantity: 1, ubicacion_nota: selectedUbicacion || null, _dedupeKey: `DUP_${norm}_${Date.now()}` })
      return
    }
    playSound('success')
    scannedOkCodesRef.current.add(eventKey || norm)
    setLastScan({ code: norm, result: 'ok' })
    setHistory(h => [{ code: norm, result: 'ok', ts: Date.now() }, ...h].slice(0, 500))
    setCounts(c => ({ ...c, ok: c.ok + 1 }))
    setItemCounts(m => { const next = new Map(m); next.set(matched.displayCode, (m.get(matched.displayCode) || 0) + 1); return next })
    const ts = Date.now()
    addEventMut.mutate({
      session_id: sessionId, scanned_code: rawCode, normalized_code: norm,
      matched_box_type: matched.type === 'box' ? (matched.boxType || matched.boxCode) : null,
      matched_sku: matched.type === 'sku' ? matched.sku : null,
      scan_result: 'ok', quantity: 1, ubicacion_nota: selectedUbicacion || null, _dedupeKey: `OK_${norm}_${ts}`,
    })
  }, [sessionId, packageMap, productMap, addEventMut, selectedUbicacion, t])

  function addCodeToSession(code) {
    const norm = normalizeScanCode(code)
    const matched = findMatchedItem(norm, packageMap, productMap)
    if (!matched) {
      playSound('error')
      toast.error(t('surtido.validacion.not_in_bd') + ': ' + norm)
      return
    }
    const eventKey = getValidationCodeKey({ normalized_code: norm, matched_box_type: matched.type === 'box' ? (matched.boxType || matched.boxCode) : null })
    if (scannedOkCodesRef.current.has(eventKey || norm)) {
      playSound('duplicate')
      setLastScan({ code: norm, result: 'duplicate' })
      setHistory(h => [{ code: norm, result: 'duplicate', ts: Date.now() }, ...h].slice(0, 500))
      setCounts(c => ({ ...c, rejected: c.rejected + 1 }))
      toast.warning(t('surtido.validacion.duplicate') + ': ' + norm)
      return
    }
    playSound('success')
    scannedOkCodesRef.current.add(eventKey || norm)
    setLastScan({ code: norm, result: 'ok' })
    setHistory(h => [{ code: norm, result: 'ok', ts: Date.now() }, ...h].slice(0, 500))
    setCounts(c => ({ ...c, ok: c.ok + 1 }))
    setItemCounts(m => { const next = new Map(m); next.set(matched.displayCode, (m.get(matched.displayCode) || 0) + 1); return next })
    if (sessionId) {
      const ts = Date.now()
      addEventMut.mutate({ session_id: sessionId, scanned_code: code, normalized_code: norm, scan_result: 'ok', quantity: 1, ubicacion_nota: selectedUbicacion || null, _dedupeKey: `RC_${norm}_${ts}` })
    }
    toast.success(t('surtido.escaneo.recount_add_btn') + ': ' + norm)
  }

  function handleKeyDown(e) {
    if (sessionCompleteLocked) return
    const now = Date.now()
    // Track when input starts (field goes from empty to first char)
    if (e.target.value.length === 0 && e.key !== 'Enter') {
      inputStartTimeRef.current = now
    }
    lastKeyTimeRef.current = now
    if (e.key === 'Enter') {
      const val = e.target.value.trim()
      if (!val) return
      // Manual typing: total elapsed from first char to Enter exceeds threshold,
      // scaled by code length (see scannerTimeBudgetMs).
      const elapsed = now - inputStartTimeRef.current
      if (elapsed > scannerTimeBudgetMs(val.length)) {
        // This silently discards the code with no server-side trace at all — unlike
        // every other outcome (ok/duplicate/rejected), which all still play a sound.
        // A blocked scan with only a toast is the easiest failure mode to miss in a
        // noisy warehouse, so it gets its own distinct audible cue too.
        playSound('suspicious')
        toast.warning(t('surtido.validacion.manual_blocked'))
        // Previously invisible — the code was discarded with nothing to show it ever
        // happened. Surface it in the error-events dashboard so a recurring pattern
        // (same operator/order/code length) is diagnosable instead of only detectable
        // by manually reconciling scanned counts against pick_events after the fact.
        captureErrorEvent({
          // captureErrorEvent dedupes repeats of the same fingerprint for the rest of
          // the page session — without a unique one here, only the first blocked scan
          // per page load would ever get reported.
          fingerprint: `scan_blocked_${sessionId}_${now}`,
          source: 'surtido_scan_blocked_as_manual',
          severity: 'warning',
          message: 'Scan discarded: elapsed time exceeded scanner budget',
          metadata: { obc, session_id: sessionId, code_length: val.length, elapsed_ms: elapsed, budget_ms: scannerTimeBudgetMs(val.length) },
        })
        e.target.value = ''
        inputStartTimeRef.current = 0
        return
      }
      doScan(val); e.target.value = ''; inputStartTimeRef.current = 0; return
    }
  }

  const finalizeMut = useMutation({
    mutationFn: ({ source = 'manual' } = {}) => {
      const sessionStatus = counts.ok < totalExpected ? 'with_discrepancies' : 'complete'
      return updateScanSession(sessionId, { status: sessionStatus, notes: finalNotes, total_scanned: counts.ok, ubicacion_nota: selectedUbicacion || null })
    },
    onSuccess: (_, vars) => {
      const orderStatus = totalExpected > 0 && counts.ok >= totalExpected ? 'complete' : 'partial'
      upsertOrderTracking(obc, { status: orderStatus }).catch(() => {})
      playSound('complete')
      toast.success(t('surtido.escaneo.session_saved'))
      qc.invalidateQueries({ queryKey: ['wms-scan-sessions'] })
      qc.invalidateQueries({ queryKey: ['surtido-sessions'] })
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      qc.invalidateQueries({ queryKey: ['wms-sessions-list'] })
      autoFinalizeLockRef.current = true
      const lastTs = historyTimeBounds.last || Date.now()
      const startTs = historyTimeBounds.first || sessionStart?.getTime() || lastTs
      const startedAtIso = startTs ? new Date(startTs).toISOString() : null
      const completedAtIso = new Date(lastTs).toISOString()
      const elapsedSecs = Math.max(0, Math.floor((lastTs - startTs) / 1000))
      setCompletionSnapshot({
        source: vars?.source || 'manual',
        obc,
        scanned: counts.ok,
        expected: totalExpected,
        rejected: counts.rejected,
        missing: Math.max(0, totalExpected - counts.ok),
        progress,
        sessionStart: startedAtIso,
        elapsed: elapsedSecs,
        startedAt: startedAtIso,
        completedAt: completedAtIso,
      })
      setShowFinalize(false)
      setShowCompletionModal(true)
    },
    onError: () => toast.error(t('toast.error')),
  })

  useEffect(() => {
    if (step !== 'session' || !sessionId || totalExpected <= 0) return
    if (counts.ok < totalExpected) return
    if (showCompletionModal || finalizeMut.isPending || autoFinalizeLockRef.current) return
    autoFinalizeLockRef.current = true
    finalizeMut.mutate({ source: 'auto' })
  }, [step, sessionId, totalExpected, counts.ok, showCompletionModal, finalizeMut.isPending]) // eslint-disable-line react-hooks/exhaustive-deps

  const missingItems = allItems.filter(item => {
    const normBoxType = normalizeCodeFast(item.boxType || '')
    if (normBoxType && normBoxType === item.displayCode) return false
    return (itemCounts.get(item.displayCode) || 0) < (item.expectedQty || 1)
  })

  const sessionList = useMemo(() => {
    return getRecords(trackingData)
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

  // navigator.onLine / the browser's online-offline events (which drive isOffline)
  // can lag or miss a connection that's actually back — this lets the operator
  // force one real attempt instead of only waiting for automatic detection.
  async function handleRetryConnection() {
    if (retryingConnection) return
    setRetryingConnection(true)
    try {
      // fetchQuery is a plain fetch with no offline stale-fallback (unlike refreshSheet/
      // loadSheet, which deliberately swallow failures to serve cached rows) — it's the
      // real connectivity probe, and populates the reasons cache in the same round trip.
      // Only flip to "online" once this genuinely succeeds.
      await qc.fetchQuery({ queryKey: ['wms-manual-entry-reasons'], queryFn: getManualEntryReasons })
      useOfflineStore.getState().setOnline()
      qc.invalidateQueries({ queryKey: ['wms-outbound-detail', obc] })
      refreshSheet('outbound').catch(() => {})
      toast.success('Conexión restablecida')
    } catch {
      toast.warning('Sigue sin conexión')
    } finally {
      setRetryingConnection(false)
    }
  }

  /* ─── OFFLINE BLOCK: no session loaded and device is offline ── */
  if (isOffline && step === 'search') {
    return (
      <>
        <SearchStep onFound={() => {}} />
        <OfflineBlockedModal
          isBlocked
          message="No hay conexión. Restablece Internet para buscar y cargar una orden de surtido."
          onRetry={handleRetryConnection}
          retrying={retryingConnection}
        />
      </>
    )
  }

  /* ─── SEARCH / PREVIEW STEPS ────────────────────────────── */
  if (step === 'search') {
    return <SearchStep onFound={foundObc => {
      if (checkDuplicateObc?.(foundObc)) {
        toast.warning(`La orden ${foundObc} ya tiene una pestaña abierta`)
        return
      }
      setObc(foundObc); setStep('session'); setAutoStartPending(true); onUpdateTab({ obc: foundObc, step: 'session' })
    }} />
  }

  /* ─── ACTIVE SESSION ─────────────────────────────────── */
  return (
    <div className="flex-1 flex overflow-hidden relative">
      {isOffline && (
        <div className="absolute top-0 inset-x-0 z-50 flex items-center gap-2 px-4 py-2 bg-amber-100 border-b border-amber-300 text-amber-800 text-xs font-semibold">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Sin conexión — escaneos en cola. <span className="font-normal">Solo un operador por sesión en offline; sin red no hay sincronización entre usuarios.</span></span>
          {surtidoPendingCount > 0 && <span className="shrink-0 bg-amber-200 px-1.5 py-0.5 rounded-full">{surtidoPendingCount} pendientes</span>}
          <button
            type="button"
            onClick={handleRetryConnection}
            disabled={retryingConnection}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200 hover:bg-amber-300 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${retryingConnection ? 'animate-spin' : ''}`} />
            Reintentar
          </button>
        </div>
      )}
      {/* Pending overlay: blocks content until sessionId is established */}
      {!sessionId && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-white">
          <Loader2 className="w-10 h-10 animate-spin text-primary-400" />
          <p className="font-mono text-sm font-semibold text-warm-700">{obc}</p>
          <p className="text-xs text-warm-400">Verificando sesión de validación...</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-3 md:p-6">
          <div className="max-w-3xl mx-auto space-y-3 md:space-y-4">

            {/* Session info card */}
            <motion.div className="card p-4 shadow-sm overflow-hidden relative"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Package className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 group">
                    <p className="font-black text-warm-900 truncate leading-none font-mono text-xl tracking-tight">{obc}</p>
                    <button
                      type="button"
                      onClick={copyObc}
                      className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200"
                      title={obcCopied ? 'Copiado' : 'Copiar OBC'}
                      aria-label={obcCopied ? 'Copiado' : 'Copiar número de orden'}
                    >
                      {obcCopied ? <Check size={14} className="text-success-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                  {(() => {
                    const d = detailData?.data ?? detailData
                    const delivery = d?.outboundTime ? fmtDateTime(d.outboundTime) : null
                    const destination = d?.receiverName || null
                    const ref = d?.thirdOrderNo || null
                    const track = d?.logisticsTrackNo || null
                    return (delivery || destination || ref || track) ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                        {(delivery || destination) && (
                          <div className="flex items-center gap-3">
                            {delivery && (
                              <div>
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">{t('surtido.ordenes.fecha_entrega')}</p>
                                <p className="text-xs font-semibold text-warm-700">{delivery}</p>
                              </div>
                            )}
                            {destination && (
                              <div className="border-l border-warm-200 pl-3">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">{t('surtido.ordenes.detail.destination')}</p>
                                <p className="text-xs font-semibold text-warm-700 max-w-[14rem] truncate">{destination}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {(ref || track) && (
                          <div className="flex items-center gap-3">
                            {ref && (
                              <div>
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">{t('surtido.ordenes.referencia')}</p>
                                <p className="text-xs font-mono text-warm-600 truncate max-w-[10rem]">{ref}</p>
                              </div>
                            )}
                            {track && (
                              <div className="border-l border-warm-200 pl-3">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-warm-400 font-semibold">{t('surtido.ordenes.detail.tracking')}</p>
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
                  <span className={`font-mono text-xs font-semibold ${locationFlash ? 'text-success-700' : 'text-accent-700'}`}>{selectedUbicacion}</span>
                  <button
                    className="ml-auto p-1 rounded-lg hover:bg-accent-200 text-accent-400 hover:text-accent-700 transition-colors"
                    title={t('surtido.validacion.ubicacion_edit')}
                    onClick={() => {
                      setUbicacionConfirmed(false)
                      setLocationInputValue(selectedUbicacion || '')
                      setTimeout(() => locationRef.current?.focus(), 80)
                    }}>
                    <Edit3 size={10} />
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
              </motion.div>
            )}

            <div className="relative pt-8">
              <button
                type="button"
                className="absolute right-4 top-0 z-10 inline-flex items-center gap-1.5 rounded-t-xl rounded-b-none border border-warm-200 border-b-0 bg-white px-3 py-1.5 text-[11px] font-semibold text-warm-600 shadow-sm transition-all hover:-translate-y-[1px] hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 whitespace-nowrap"
                onClick={() => setShowManualEntry(true)}
              >
                <Edit3 size={12} /> {t('surtido.validacion.manual_entry')}
              </button>

              {/* Scan input */}
              <div className="relative -mt-px">
                <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
                <input
                  ref={scanRef}
                  type="text"
                  inputMode="none"
                  className="w-full pl-14 pr-5 py-4 text-xl bg-white border-2 border-warm-200 rounded-2xl
                    focus:border-primary-500 focus:shadow-glow
                    transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder={t('surtido.validacion.scan_placeholder')}
                  onKeyDown={handleKeyDown}
                  disabled={sessionCompleteLocked || !sessionId}
                  autoComplete="off"
                />
              </div>
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
              <ScanFeedTable items={history.filter(h => h.result === 'ok').slice(0, 200)} t={t} />
            )}
            {activeTab === 'rechazados' && (
              <RejectedTable items={rejectedHistory.slice(0, 200)} t={t} />
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar — wrapper always rendered so toggle stays at panel edge */}
      <div className={`hidden lg:flex shrink-0 relative ${sidebarVisible ? 'w-80' : 'w-0'}`}>
        <button
          type="button"
          onClick={() => {
            setSidebarVisible(v => {
              const next = !v
              localStorage.setItem(sidebarStorageKey, next ? 'visible' : 'hidden')
              return next
            })
          }}
          title={sidebarVisible ? 'Ocultar panel' : 'Mostrar panel'}
          className="hidden lg:flex absolute -left-5 top-4 z-20 h-10 w-10 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-500 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600"
        >
          {sidebarVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
        {sidebarVisible && (
        <div className="w-full h-full hidden lg:flex border-l border-warm-100 bg-gradient-to-b from-white via-white to-primary-50/20 backdrop-blur-2xl flex-col shadow-[-16px_0_34px_-28px_rgba(37,99,235,0.38)] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-warm-100 bg-warm-50/50">
          <h3 className="text-sm font-bold text-warm-700 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary-500" /> {t('surtido.validacion.sidebar_title')}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin bg-warm-50/55 p-3 space-y-2.5">
          {obc && (
            <div className="p-3 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-white to-accent-50/60 shadow-[0_14px_30px_-22px_rgba(37,99,235,0.45)] ring-1 ring-primary-100/80">
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
            <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-primary-100/70 bg-gradient-to-br from-primary-50/85 via-white to-white p-1.5 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.55)]">
              {['', 'complete', 'with_discrepancies', 'cancelled'].map(key => (
                <button
                  key={key || 'all'}
                  onClick={() => setSessionStatusFilter(key)}
                  className={`w-full min-w-0 px-2 py-1.5 h-9 rounded-full text-[10px] font-semibold border transition-all truncate ${
                    sessionStatusFilter === key
                      ? 'bg-white text-primary-700 border-primary-200 shadow-sm ring-1 ring-primary-100'
                      : 'bg-white/75 text-warm-600 border-transparent hover:border-warm-200 hover:bg-warm-50'
                  }`}
                >
                  {key ? t(`surtido.registros.status.${key}`) : t('common.all')}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-primary-100/80 bg-gradient-to-r from-white via-primary-50/55 to-white px-3 h-11 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.6)] transition-all focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100/80 shadow-inner">
                <Search className="w-3.5 h-3.5 text-primary-500 shrink-0" />
              </div>
              <input
                type="text"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                placeholder={t('common.search')}
                className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
                <div key={s.id || i} className="p-3 rounded-2xl border border-warm-200/90 bg-white shadow-[0_14px_30px_-24px_rgba(15,23,42,0.32)] hover:border-primary-100 hover:bg-gradient-to-br hover:from-white hover:to-primary-50/30 hover:shadow-[0_20px_38px_-26px_rgba(37,99,235,0.45)] transition-all">
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
                  {!isComplete && onOpenObc && (
                    <button
                      type="button"
                      onClick={() => onOpenObc(s.outbound_order_no)}
                      className="mt-2 w-full btn-primary text-[10px] py-1 h-7"
                    >
                      Validar
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
      )}
      </div>

      {/* Rejected box modal */}
      <Modal
        isOpen={rejectedBoxModal.open}
        onClose={() => setRejectedBoxModal({ open: false, code: '' })}
        title={t('surtido.escaneo.match_rejected')}
        icon={XCircle}
        footer={
          <button
            className="btn-danger w-full inline-flex items-center justify-center gap-2"
            onClick={() => { setRejectedBoxModal({ open: false, code: '' }); setTimeout(() => scanRef.current?.focus(), 80) }}
          >
            <X size={14} /> {t('common.close')}
          </button>
        }
      >
        <div className="text-center space-y-4 py-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-danger-100 flex items-center justify-center">
            <XCircle className="w-9 h-9 text-danger-600" />
          </div>
          <p className="text-sm font-medium text-warm-600">{t('surtido.validacion.not_in_bd')}</p>
          <div className="bg-danger-50 border border-danger-200 rounded-2xl px-4 py-3">
            <p className="font-mono font-bold text-danger-700 text-lg break-all">{rejectedBoxModal.code}</p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={invalidLocationModal.open}
        onClose={() => {
          setInvalidLocationModal({ open: false, raw: '', normalized: '', summary: '' })
          setLocationInputValue('')
          setTimeout(() => locationRef.current?.focus(), 80)
        }}
        title="Ubicacion invalida"
        icon={AlertTriangle}
        footer={
          <button
            className="btn-danger w-full inline-flex items-center justify-center gap-2"
            onClick={() => {
              setInvalidLocationModal({ open: false, raw: '', normalized: '', summary: '' })
              setLocationInputValue('')
              setTimeout(() => locationRef.current?.focus(), 80)
            }}
          >
            <X size={14} /> {t('common.close')}
          </button>
        }
      >
        <div className="space-y-4 py-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger-100">
            <AlertTriangle className="h-9 w-9 text-danger-600" />
          </div>
          <div className="space-y-2 text-center">
            <p className="text-sm font-semibold text-danger-700">{invalidLocationModal.summary}</p>
            <p className="text-xs text-warm-500">Regla unica: la ubicacion debe tener maximo 16 caracteres validos.</p>
          </div>
          <div className="space-y-2 rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-danger-500">Entrada recibida</p>
              <p className="break-all font-mono text-sm font-bold text-danger-700">{invalidLocationModal.raw || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-danger-500">Valor detectado</p>
              <p className="break-all font-mono text-sm text-danger-700">{invalidLocationModal.normalized || '—'}</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Recount modal */}
      <RecountModal
        isOpen={showRecount}
        onClose={() => setShowRecount(false)}
        sessionHistory={history}
        onAddToSession={addCodeToSession}
        t={t}
      />

      <Modal
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        title={t('surtido.validacion.manual_entry')}
        icon={Edit3}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setShowManualEntry(false)}>Cancelar</button>
            <button
              className="btn-primary"
              disabled={!manualEntry.code.trim() || !manualEntry.reasonId || addManualEventMut.isPending}
              onClick={() => {
                if (!sessionId) { toast.error('Sesión no encontrada'); return }
                const norm = normalizeCodeFast(manualEntry.code.trim())
                const matched = findMatchedItem(norm, packageMap, productMap)
                if (!matched) {
                  toast.error(t('surtido.validacion.not_in_bd') + ': ' + norm)
                  return
                }
                const selectedReason = (getRecords(reasonsData)).find((reason) => String(reason.id) === manualEntry.reasonId)
                // Apply local state immediately, same as doScan — a dropped connection
                // must not make a manual entry look lost. addManualEventMut.onError
                // queues the request itself for background sync.
                playSound('success')
                scannedOkCodesRef.current.add(norm)
                setLastScan({ code: norm, result: 'ok' })
                setHistory(h => [{ code: norm, result: 'ok', ts: Date.now(), isManual: true }, ...h].slice(0, 500))
                setCounts(c => ({ ...c, ok: c.ok + 1 }))
                setItemCounts(m => {
                  const next = new Map(m)
                  next.set(matched.displayCode, (m.get(matched.displayCode) || 0) + 1)
                  return next
                })
                setManualEntry({ code: '', reasonId: '', notes: '' })
                setShowManualEntry(false)
                toast.success(t('surtido.validacion.manual_entry_saved'))
                addManualEventMut.mutate({
                  session_id: sessionId,
                  scanned_code: manualEntry.code.trim(),
                  normalized_code: norm,
                  matched_sku: matched.type === 'sku' ? matched.sku : null,
                  matched_box_type: matched.type === 'box' ? (matched.boxType || matched.boxCode) : null,
                  scan_result: 'ok',
                  quantity: 1,
                  manual_reason_id: Number(manualEntry.reasonId),
                  manual_reason_label: selectedReason?.nombre || null,
                  manual_notes: manualEntry.notes.trim() || null,
                  ubicacion_nota: selectedUbicacion || null,
                  _dedupeKey: `MAN_${norm}_${Date.now()}`,
                })
              }}
            >
              {addManualEventMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Registrar
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <input
            className="input-field w-full text-sm font-mono"
            placeholder="Codigo"
            value={manualEntry.code}
            onChange={(e) => setManualEntry((prev) => ({ ...prev, code: e.target.value }))}
          />
          <select
            className="input-field w-full text-sm"
            value={manualEntry.reasonId}
            onChange={(e) => setManualEntry((prev) => ({ ...prev, reasonId: e.target.value }))}
          >
            <option value="">Selecciona un motivo</option>
            {getRecords(reasonsData).map((reason) => (
              <option key={reason.id} value={String(reason.id)}>{reason.nombre}</option>
            ))}
          </select>
          {getRecords(reasonsData).length === 0 && (
            <CatalogEmptyHint
              item={t('rastreo.causas.col.causa').toLowerCase()}
              section={t('rastreo.causas.title')}
              action={t('rastreo.causas.btnGestion')}
            />
          )}
          <textarea
            className="input-field min-h-24 w-full resize-none text-sm"
            placeholder="Ej: Registro manual por código ilegible..."
            value={manualEntry.notes}
            onChange={(e) => setManualEntry((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </div>
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
              <span className="font-mono font-semibold text-accent-700">{selectedUbicacion}</span>
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

      <Modal
        isOpen={!!conflictDetails}
        onClose={() => { setConflictDetails(null); setStep('search'); setObc(null) }}
        title={t('surtido.validacion.conflict_title')}
        icon={AlertCircle}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => { setConflictDetails(null); setStep('search'); setObc(null) }}>{t('common.cancel')}</button>
            <button
              className="btn-danger inline-flex items-center gap-1.5"
              onClick={() => createSessionMut.mutate(true)}
              disabled={createSessionMut.isPending}
            >
              {createSessionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {t('surtido.validacion.conflict_takeover')}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-warm-700">
          <p>{t('surtido.validacion.conflict_body_operator')} <strong>{conflictDetails?.operator || '—'}</strong>.</p>
          <p>{t('surtido.validacion.conflict_body_started')} <strong>{conflictDetails?.started_at ? formatDateTimeTz(conflictDetails.started_at) : '—'}</strong>.</p>
          <p className="font-semibold text-danger-600">{t('surtido.validacion.conflict_body_confirm')}</p>
        </div>
      </Modal>

      {/* Completion / already-validated lock modal */}
      {(() => {
        const isLocked = completionSnapshot?.reason === 'already_validated'
        return (
          <Modal
            isOpen={showCompletionModal}
            onClose={() => {
              setShowCompletionModal(false)
              clearSession()
            }}
            title={isLocked ? t('surtido.validacion.already_validated_title') : t('surtido.validacion.complete_title')}
            icon={isLocked ? CheckCircle2 : PartyPopper}
            size="md"
            footer={
              <div className="flex flex-col sm:flex-row gap-3 justify-end w-full">
                <button
                  className="btn-ghost h-10"
                  onClick={() => {
                    setShowCompletionModal(false)
                    clearSession()
                  }}
                >
                  {isLocked ? t('surtido.validacion.close_only') : t('surtido.validacion.complete_save_close')}
                </button>
                {!isLocked && (
                  <button
                    className="btn-primary inline-flex h-10 items-center gap-2"
                    onClick={() => {
                      setShowCompletionModal(false)
                      clearSession()
                      onNewOrder?.()
                    }}
                  >
                    <ScanBarcode size={14} />
                    {t('surtido.validacion.complete_new_order')}
                  </button>
                )}
              </div>
            }
          >
            <div className="space-y-3">
              <div className="rounded-2xl border border-success-200 bg-success-50/80 px-4 py-4 text-center">
                <motion.div
                  className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center"
                  initial={{ y: 0, scale: 1 }}
                  animate={isLocked
                    ? { y: [0, -5, 0], scale: [1, 1.04, 1] }
                    : { y: [0, -8, 0, -3, 0], scale: [1, 1.06, 1, 1.02, 1] }}
                  transition={{
                    duration: isLocked ? 1.6 : 1.1,
                    ease: [0.22, 1, 0.36, 1],
                    repeat: Infinity,
                    repeatDelay: isLocked ? 1.6 : 2.2,
                  }}
                >
                  <motion.span
                    className="absolute inset-[-10px] rounded-full bg-success-300/40 blur-xl"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={isLocked
                      ? { opacity: [0, 0.12, 0.28, 0], scale: [0.9, 0.95, 1.18, 1.28] }
                      : { opacity: [0, 0.1, 0.14, 0.34, 0], scale: [0.88, 0.94, 1, 1.22, 1.3] }}
                    transition={{
                      duration: isLocked ? 1.6 : 1.1,
                      ease: [0.22, 1, 0.36, 1],
                      repeat: Infinity,
                      repeatDelay: isLocked ? 1.6 : 2.2,
                      times: isLocked ? [0, 0.3, 0.58, 1] : [0, 0.28, 0.5, 0.72, 1],
                    }}
                  />
                  {isLocked && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-success-300"
                      initial={{ opacity: 0.55, scale: 0.85 }}
                      animate={{ opacity: 0, scale: 1.55 }}
                      transition={{ duration: 1.1, ease: 'easeOut' }}
                    />
                  )}
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-4 ring-success-100">
                    <CheckCircle2 className="h-7 w-7 text-success-600" />
                  </div>
                </motion.div>
                <p className="text-base font-bold leading-snug text-success-700 sm:text-lg">
                  {isLocked ? t('surtido.validacion.already_validated_message') : t('surtido.validacion.complete_message')}
                </p>
                {!isLocked && (
                  <p className="mt-1 text-sm leading-snug text-success-600">{t('surtido.validacion.complete_hint')}</p>
                )}
              </div>

              <div className="rounded-2xl border border-warm-200 bg-gradient-to-br from-warm-50 to-white px-4 py-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-warm-400 font-semibold">{t('surtido.validacion.order_label')}</p>
                    <p className="mt-0.5 font-mono text-[15px] font-bold leading-tight text-primary-700 break-all">{completionSnapshot?.obc ?? obc}</p>
                  </div>
                  <span className={`badge text-[9px] shrink-0 ${(completionSnapshot?.progress ?? progress) >= 100 ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}>
                    {(completionSnapshot?.progress ?? progress) >= 100
                      ? t('surtido.ordenes.session_status.complete')
                      : t('surtido.ordenes.session_status.with_discrepancies')}
                  </span>
                </div>

                {completionSnapshot?.destino && (
                  <div className="flex items-center gap-2 rounded-xl bg-white border border-warm-100 px-3 py-2 text-sm min-w-0">
                    <MapPin size={12} className="text-accent-600 shrink-0" />
                    <span className="text-warm-400 uppercase tracking-wide text-[9px] font-semibold shrink-0">{t('surtido.validacion.destino_label')}</span>
                    <span className="font-semibold text-warm-700 truncate min-w-0 flex-1">{completionSnapshot.destino}</span>
                  </div>
                )}

                {selectedUbicacion && (
                  <div className="flex items-center gap-2 rounded-xl bg-white border border-warm-100 px-3 py-2 text-sm">
                    <MapPin size={12} className="text-accent-600 shrink-0" />
                    <span className="font-mono font-semibold text-accent-700">{selectedUbicacion}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 border-t border-warm-100 pt-3">
                  <div className="text-center">
                    <p className="text-lg font-extrabold text-success-600 tabular-nums sm:text-xl">{completionSnapshot?.scanned ?? counts.ok}</p>
                    <p className="mt-0.5 text-[10px] text-warm-400 uppercase tracking-wide">{t('surtido.escaneo.scanned')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-extrabold text-warm-600 tabular-nums sm:text-xl">{completionSnapshot?.expected ?? totalExpected}</p>
                    <p className="mt-0.5 text-[10px] text-warm-400 uppercase tracking-wide">{t('surtido.escaneo.expected')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-extrabold text-danger-500 tabular-nums sm:text-xl">{completionSnapshot?.rejected ?? counts.rejected}</p>
                    <p className="mt-0.5 text-[10px] text-warm-400 uppercase tracking-wide">{t('surtido.validacion.rejected_abbr')}</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-warm-100 pt-3 text-sm">
                  {completionSnapshot?.startedAt && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-warm-400 shrink-0">{t('surtido.validacion.start_label')}</span>
                      <span className="font-mono text-warm-600 truncate min-w-0 text-right text-[13px]">{fmtDateTime(completionSnapshot.startedAt)}</span>
                    </div>
                  )}
                  {completionSnapshot?.completedAt && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-warm-400 shrink-0">{t('surtido.validacion.end_label')}</span>
                      <span className="font-mono text-warm-600 truncate min-w-0 text-right text-[13px]">{fmtDateTime(completionSnapshot.completedAt)}</span>
                    </div>
                  )}
                  {completionSnapshot?.validatedBy && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-warm-400 shrink-0">{t('surtido.validacion.validated_by_label')}</span>
                      <span className="font-semibold text-warm-800 truncate min-w-0 text-right">{completionSnapshot.validatedBy}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-warm-400 shrink-0">{t('surtido.validacion.time_label')}</span>
                    <span className="font-mono font-bold text-warm-800 text-[15px]">{fmtElapsed(completionSnapshot?.elapsed ?? sessionElapsed)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}

/* ─── Tab bar ─────────────────────────────────────────────── */
function TabBar({ tabs, activeTabId, onSelect, onAdd, onClose, canAdd, t }) {
  return (
    <div className="flex items-center px-4 pt-3 pb-0 border-b border-warm-100 bg-white shrink-0 min-w-0">
      <div className="flex items-center gap-1.5 flex-1 min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
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
        {canAdd && tabs.length < 5 && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-semibold border-2 border-transparent text-success-600 bg-success-50 hover:bg-success-100 transition-all shrink-0"
            title={t('surtido.validacion.new_tab')}>
            <Plus size={14} />
            <span className="hidden sm:inline">{t('surtido.validacion.new_tab')}</span>
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Mobile session picker ────────────────────────────────── */
function MobileSessionPicker({ tabs, activeTabId, onSelect, onClose, onCloseTab, newTabLabel, t }) {
  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/50 md:hidden"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl md:hidden"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        <div className="w-10 h-1 bg-warm-300 rounded-full mx-auto mt-3 mb-1" />
        <div className="px-4 pb-2 pt-1 flex items-center justify-between">
          <span className="text-sm font-bold text-warm-800">Sesiones activas</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400"><X size={16} /></button>
        </div>
        <div className="px-3 pb-6 space-y-2 max-h-64 overflow-y-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { onSelect(tab.id); onClose() }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                tab.id === activeTabId
                  ? 'border-violet-300 bg-violet-50'
                  : 'border-warm-200 bg-warm-50 hover:bg-warm-100'
              }`}
            >
              <ScanBarcode size={16} className={tab.id === activeTabId ? 'text-violet-500' : 'text-warm-400'} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate font-mono ${tab.id === activeTabId ? 'text-violet-700' : 'text-warm-700'}`}>
                  {tab.label === newTabLabel ? t('surtido.validacion.new_tab') : tab.label}
                </p>
              </div>
              {tab.id === activeTabId && (
                <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded shrink-0">Activa</span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); onCloseTab(tab.id) }}
                  className="p-1.5 hover:bg-danger-100 rounded-lg text-warm-300 hover:text-danger-500 transition-colors shrink-0"
                >
                  <X size={13} />
                </button>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  )
}

/* ─── Main export ─────────────────────────────────────────── */
export default function SurtidoValidacion() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const { hasPermission } = useAuthStore()
  const newTabLabel = t('surtido.validacion.new_tab')
  const canCreateValidation = hasPermission('surtido.validacion', 'crear')
  const canUpdateValidation = hasPermission('surtido.validacion', 'actualizar')
  const canDeleteValidation = hasPermission('surtido.validacion', 'eliminar')
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [sheetTs, setSheetTs] = useState(() => getCacheTimestamp('outbound'))
  const [refreshingSheet, setRefreshingSheet] = useState(false)
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false)

  const [tabs, setTabs] = useState(() => {
    const saved = safeParseJson(localStorage.getItem(TABS_KEY))
    const normalized = normalizeStoredTabs(saved, newTabLabel)
    if (normalized.length > 0) return normalized
    return [buildDefaultTab(newTabLabel)]
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY)
    if (saved) return saved
    return tabs[0]?.id
  })

  const obcParam = searchParams.get('obc')
  const autoStartParam = searchParams.get('autostart') === 'true'
  const [initialObcConsumed, setInitialObcConsumed] = useState(false)

  useEffect(() => {
    if (!obcParam || initialObcConsumed) return
    setInitialObcConsumed(true)
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab?.label === newTabLabel || !activeTab?.label) {
      setTabs(prev => prev.map(tab => tab.id === activeTabId ? { ...tab, label: obcParam } : tab))
    }
  }, [obcParam]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tabs.length === 0) {
      const fallback = buildDefaultTab(newTabLabel)
      setTabs([fallback])
      setActiveTabId(fallback.id)
      return
    }

    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id)
    }
  }, [activeTabId, newTabLabel, tabs])

  useEffect(() => {
    setTabs((prev) => {
      const cleanTabs = prev.filter((tab) => tab.label === newTabLabel || hasStoredSessionForTab(tab.id))
      if (cleanTabs.length > 0) return cleanTabs
      return [buildDefaultTab(newTabLabel)]
    })
  }, [newTabLabel])

  useEffect(() => {
    try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)) } catch {}
  }, [tabs])

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_TAB_KEY, activeTabId) } catch {}
  }, [activeTabId])

  function addTab() {
    const newId = genId()
    const newTab = { id: newId, label: newTabLabel }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newId)
  }

  function closeTab(tabId) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      if (next.length === 0) {
        const fresh = buildDefaultTab(newTabLabel)
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
    if (!obc || step === 'search') {
      setTabs(prev => {
        if (prev.length === 1) {
          return prev.map(tab => tab.id === tabId ? { ...tab, label: newTabLabel } : tab)
        }
        const next = prev.filter(tab => tab.id !== tabId)
        const fallback = next[next.length - 1] || buildDefaultTab(newTabLabel)
        setActiveTabId(fallback.id)
        return next.length > 0 ? next : [fallback]
      })
    } else {
      setTabs(prev => prev.map(tab => {
        if (tab.id !== tabId) return tab
        return { ...tab, label: obc }
      }))
    }
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
  const { data: outboundSummaryData } = useQuery({
    queryKey: ['wms-outbound-summary'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
  })
  const outboundSummaryRecords = getRecords(outboundSummaryData).length
  const outboundSummaryPartial = outboundSummaryData?.data?.partial ?? getCacheStatus('outbound').partial

  function addTabWithObc(obc) {
    const existingTab = tabs.find(t => t.label === obc || pendingTabObcs[t.id] === obc)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      toast.warning(`La orden ${obc} ya tiene una pestaña abierta`)
      return
    }
    const newId = genId()
    setTabs(prev => [...prev, { id: newId, label: obc }])
    setActiveTabId(newId)
    setPendingTabObcs(prev => ({ ...prev, [newId]: obc }))
  }

  async function handleSheetRefresh() {
    setRefreshingSheet(true)
    try {
      await refreshSheet('outbound')
      setSheetTs(getCacheTimestamp('outbound'))
      qc.invalidateQueries({ queryKey: ['wms-outbound-summary'] })
    } finally {
      setRefreshingSheet(false)
    }
  }

  const headerActions = (
    <div className="flex items-center gap-1 md:gap-1.5 flex-nowrap">
      {/* Compact on mobile, full on desktop */}
      <span className="md:hidden">
        <DataSyncStatus
          records={outboundSummaryRecords}
          updatedAt={sheetTs}
          partial={outboundSummaryPartial}
          onRefresh={handleSheetRefresh}
          refreshing={refreshingSheet}
          compact
        />
      </span>
      <span className="hidden md:inline-flex">
        <DataSyncStatus
          records={outboundSummaryRecords}
          updatedAt={sheetTs}
          partial={outboundSummaryPartial}
          onRefresh={handleSheetRefresh}
          refreshing={refreshingSheet}
        />
      </span>
      {activeSession && (
        <>
          {activeSession.pendingCount > 0 && (
            <span className="px-2 py-1.5 rounded-lg text-xs font-semibold text-warning-600 bg-warning-50 flex items-center gap-1">
              {activeSession.isSyncing ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={11} />}
              <span className="text-[10px]">{activeSession.pendingCount}</span>
            </span>
          )}
          {activeSession.onRecount && (
            <button className="h-8 px-2 rounded-lg text-warm-500 bg-warm-100 hover:bg-warm-200 transition-all inline-flex items-center gap-1.5 text-xs font-semibold"
              onClick={activeSession.onRecount} title={t('surtido.escaneo.recount')}>
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('surtido.escaneo.recount')}</span>
            </button>
          )}
          <button className="h-8 px-2 rounded-lg text-primary-600 bg-primary-50 hover:bg-primary-100 transition-all inline-flex items-center gap-1.5 text-xs font-semibold"
            onClick={activeSession.onMissing} title={t('surtido.escaneo.missing')}>
            <List className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('surtido.escaneo.missing')}</span>
          </button>
          {activeSession.onCancel && (
            <button className="h-8 px-2 rounded-lg text-warning-600 bg-warning-50 hover:bg-warning-100 transition-all inline-flex items-center gap-1.5 text-xs font-semibold"
              onClick={activeSession.onCancel} title={t('surtido.escaneo.cancel')}>
              <XOctagon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('surtido.escaneo.cancel')}</span>
            </button>
          )}
          {activeSession.onFinalize && (
            <button className="h-8 px-2.5 md:px-4 rounded-lg bg-danger-600 text-white hover:bg-danger-700 transition-all inline-flex items-center gap-1.5 text-xs font-semibold"
              onClick={activeSession.onFinalize} title={t('surtido.escaneo.finalize')}>
              <Square className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('surtido.escaneo.finalize')}</span>
            </button>
          )}
        </>
      )}
      <button
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-warm-200 bg-warm-100 text-warm-400 transition-all hover:bg-primary-50 hover:text-primary-600"
        onClick={() => setShowQuickSearch(true)}
        title={t('surtido.validacion.quick_search_title')}
        aria-label={t('surtido.validacion.quick_search_title')}>
        <Search className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <Header hideUserOnMobile title={t('surtido.validacion.title')} subtitle={t('nav.surtido_wms')} actions={headerActions} />

      {/* Desktop tab bar */}
      <div className="hidden md:block">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
          onAdd={addTab}
          onClose={closeTab}
          canAdd={canCreateValidation}
          t={t}
        />
      </div>

      {/* Mobile session bar */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2.5 border-b border-warm-100 bg-white shrink-0">
        <ScanBarcode size={14} className="text-violet-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-warm-800 font-mono truncate block">
            {tabs.find(t => t.id === activeTabId)?.label ?? newTabLabel}
          </span>
        </div>
        {tabs.length > 1 && (
          <button
            onClick={() => setMobilePickerOpen(true)}
            className="flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1.5 rounded-lg font-semibold shrink-0 active:scale-95"
          >
            <Layers size={12} /> {tabs.length}
          </button>
        )}
        {canCreateValidation && tabs.length < 5 && (
          <button
            onClick={addTab}
            className="flex items-center gap-1 text-xs text-success-600 bg-success-50 border border-success-200 px-2 py-1.5 rounded-lg font-semibold shrink-0 active:scale-95"
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {mobilePickerOpen && (
          <MobileSessionPicker
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTabId}
            onClose={() => setMobilePickerOpen(false)}
            onCloseTab={closeTab}
            newTabLabel={newTabLabel}
            t={t}
          />
        )}
      </AnimatePresence>
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
              onNewOrder={() => setShowQuickSearch(true)}
              canCreate={canCreateValidation}
              canUpdate={canUpdateValidation}
              canDelete={canDeleteValidation}
              onOpenObc={addTabWithObc}
              checkDuplicateObc={(obc) => tabs.some((t) => t.id !== tab.id && t.label === obc)}
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
