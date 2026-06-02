import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, Wifi, WifiOff, ArrowLeft } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useSurtidoStore } from '../stores/surtidoStore'
import { useValidationSync } from '../hooks/useValidationSync'
import { createDedup } from '../utils/dedup'
import { processScanCode } from '../utils/processScan'
import { playSound, initAudio } from '../../_shared/wms/playSound'
import {
  getOutboundDetail,
  createScanSession,
  addScanEvent,
} from '../services/surtidoService'

const SCANNER_THRESHOLD_MS = 500

const dedup = createDedup()

function HistoryPanel({ history }) {
  const { t } = useI18nStore()
  return (
    <div className="hidden lg:flex flex-col w-72 shrink-0 border-l border-warm-100 bg-warm-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-warm-100 bg-white">
        <h3 className="text-xs font-semibold text-warm-600 uppercase tracking-wide">{t('surtido.validacion.history')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {history.length === 0 ? (
          <p className="text-xs text-warm-400 text-center mt-6">{t('common.noData')}</p>
        ) : (
          history.map((e, i) => (
            <div
              key={i}
              className={`px-3 py-2 rounded-xl text-xs border ${
                e.result === 'ok'
                  ? 'bg-success-50 border-success-200 text-success-800'
                  : 'bg-danger-50 border-danger-200 text-danger-800'
              }`}
            >
              <div className="font-mono font-semibold">{e.code}</div>
              <div className="text-[10px] opacity-70 flex justify-between mt-0.5">
                <span>{e.result === 'ok' ? '✓ OK' : '✗ ' + (e.reason || 'RECHAZADO')}</span>
                <span>{new Date(e.ts).toLocaleTimeString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function Validacion() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const obc = searchParams.get('obc') || ''
  const qc = useQueryClient()

  const scanRef = useRef(null)
  const lastKeyTimeRef = useRef(0)

  const {
    activeOBC, sessionId, history, bdCodes,
    setActiveOBC, clearSession, addHistoryEntry,
    incrementScanned, enqueueSync, getBdCodesSet,
  } = useSurtidoStore()

  const { isPending: isSyncing, pendingCount } = useValidationSync()

  // Load outbound detail to build BD_CODES set
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['upapex-outbound', obc],
    queryFn: () => getOutboundDetail(obc),
    enabled: !!obc,
    staleTime: 30000,
  })

  // Create session on first load
  const createSessionMut = useMutation({
    mutationFn: () => createScanSession({
      outbound_order_no: obc,
      third_order_no: detailData?.data?.thirdOrderNo || null,
      total_expected: detailData?.data?.totalQty || 0,
    }),
    onSuccess: (data) => {
      const detail = detailData?.data
      const items = detail?.details ?? detail?.items ?? []

      // Build bdCodes Set: each item code normalized, concatenated with obc.toLowerCase()
      const codes = []
      items.forEach(item => {
        const code = (item.boxCode || item.sku || '').toUpperCase().replace(/[^A-Z0-9\-\/]/g, '')
        const variants = [code]
        if (code.includes('-')) variants.push(code.replace(/-/g, '/'))
        if (code.includes('/')) variants.push(code.replace(/\//g, '-'))
        variants.forEach(v => v && codes.push(v + obc.toLowerCase()))
      })

      const totals = {}
      totals[obc] = { expected: detail?.totalQty || 0, scanned: 0 }

      setActiveOBC(obc, data.data.id, codes, totals)
    },
    onError: () => toast.error(t('toast.error')),
  })

  useEffect(() => {
    if (detailData && !sessionId && !createSessionMut.isPending) {
      createSessionMut.mutate()
    }
  }, [detailData]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => initAudio()
    document.addEventListener('click', handler, { once: true })
    return () => document.removeEventListener('click', handler)
  }, [])

  // Auto-focus scan input
  useEffect(() => {
    setTimeout(() => scanRef.current?.focus(), 80)
  }, [activeOBC])

  const addEventMut = useMutation({
    mutationFn: addScanEvent,
    onError: (_, vars) => enqueueSync({ key: vars._dedupeKey, payload: vars }),
  })

  const handleScan = useCallback((rawCode) => {
    if (!rawCode.trim() || !activeOBC) return

    const bdSet = getBdCodesSet()
    const { code, found } = processScanCode(rawCode, activeOBC, bdSet)

    if (!found) {
      addHistoryEntry({ code, result: 'rejected', reason: 'NO_BD', obc: activeOBC })
      playSound('error')
      toast.error(t('surtido.validacion.not_in_bd') + ': ' + code)
      return
    }

    // Dedup check
    const location = ''
    if (dedup.isSynced(code, activeOBC, location)) {
      addHistoryEntry({ code, result: 'rejected', reason: 'DUPLICATE', obc: activeOBC })
      playSound('warning')
      toast.warning(t('surtido.validacion.duplicate') + ': ' + code)
      return
    }

    dedup.markSynced(code, activeOBC, location)
    addHistoryEntry({ code, result: 'ok', obc: activeOBC })
    incrementScanned(activeOBC)
    playSound('success')

    if (sessionId) {
      const ts = Date.now()
      const payload = {
        session_id: sessionId,
        scanned_code: rawCode,
        normalized_code: code,
        scan_result: 'ok',
        quantity: 1,
        _dedupeKey: `VAL_${activeOBC}_${code}_${ts}`,
      }
      addEventMut.mutate(payload)
    }
  }, [activeOBC, sessionId, getBdCodesSet, addHistoryEntry, incrementScanned, enqueueSync, t])

  // Scanner detector via keydown — 500ms threshold
  function handleKeyDown(e) {
    const now = Date.now()
    const delta = now - lastKeyTimeRef.current
    lastKeyTimeRef.current = now

    if (e.key === 'Enter') {
      const val = e.target.value.trim()
      if (!val) return
      handleScan(val)
      e.target.value = ''
      return
    }

    // Manual typing detected — reject
    if (delta > SCANNER_THRESHOLD_MS && e.target.value.length > 0) {
      e.preventDefault()
      toast.warning(t('surtido.validacion.manual_blocked'))
      e.target.value = ''
    }
  }

  const totals = useSurtidoStore(s => s.obcTotals)
  const obcTotals = totals[obc] || { expected: 0, scanned: 0 }
  const progress = obcTotals.expected > 0
    ? Math.min(100, Math.round((obcTotals.scanned / obcTotals.expected) * 100))
    : 0

  if (isLoading || createSessionMut.isPending) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.validacion.title')} subtitle="Surtido WMS" />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('surtido.validacion.title')}
        subtitle={`Surtido · ${obc}`}
      />

      {/* Main content + history panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Scan bar */}
          <div className="sticky top-0 z-10 bg-white border-b border-warm-200 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 max-w-2xl">
              <button className="btn-ghost p-2" onClick={() => navigate('/surtido')} title={t('common.back')}>
                <ArrowLeft size={16} />
              </button>
              <input
                ref={scanRef}
                type="text"
                className="input-field flex-1 font-mono text-sm"
                placeholder={t('surtido.validacion.scan_placeholder')}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              <div className="flex items-center gap-2 shrink-0 text-sm">
                <span className="font-semibold text-success-600">{obcTotals.scanned}</span>
                <span className="text-warm-400">/</span>
                <span className="text-warm-500">{obcTotals.expected}</span>
              </div>
              {pendingCount > 0 ? (
                <span className="text-xs text-warning-600 flex items-center gap-1 shrink-0">
                  {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <WifiOff size={12} />}
                  {pendingCount}
                </span>
              ) : (
                <Wifi size={14} className="text-success-500 shrink-0" />
              )}
            </div>

            {/* Progress bar */}
            {obcTotals.expected > 0 && (
              <div className="mt-2 max-w-2xl ml-10">
                <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-warm-400 mt-0.5 text-right">{progress}%</p>
              </div>
            )}
          </div>

          {/* OBC info card */}
          <div className="p-4 space-y-3">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-warm-500 uppercase tracking-wide">{t('surtido.validacion.order')}</p>
                  <p className="font-mono font-bold text-warm-900 text-lg">{obc}</p>
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-success-600">{obcTotals.scanned}</p>
                    <p className="text-xs text-warm-500">{t('surtido.validacion.validated')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-warm-700">{obcTotals.expected}</p>
                    <p className="text-xs text-warm-500">{t('surtido.validacion.expected')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent history (mobile — show last 5) */}
            <div className="lg:hidden space-y-1">
              {history.slice(0, 5).map((e, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
                    e.result === 'ok'
                      ? 'bg-success-50 border-success-200 text-success-800'
                      : 'bg-danger-50 border-danger-200 text-danger-800'
                  }`}
                >
                  {e.result === 'ok'
                    ? <CheckCircle2 size={12} className="shrink-0" />
                    : <XCircle size={12} className="shrink-0" />
                  }
                  <span className="font-mono font-semibold">{e.code}</span>
                  <span className="ml-auto opacity-60">{new Date(e.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop history panel */}
        <HistoryPanel history={history} />
      </div>
    </div>
  )
}
