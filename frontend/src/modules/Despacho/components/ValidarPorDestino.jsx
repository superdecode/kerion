import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScanLine, Loader2, X, Check, CheckCircle2, XCircle, AlertCircle,
  Layers, MapPin, Trash2, Radio, Clock3, Search,
  PanelRightClose, PanelRightOpen, PartyPopper, ExternalLink, Plus, Copy,
} from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { generateCodeVariations, normalizeCodeFast, normalizeScanCode } from '../../Shared/Wms/normalizeCode'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'
import {
  getFolio, getFolioScans, addFolioScan, deleteFolioScan,
  cerrarFolio, cancelarFolio,
} from '../services/despachoService'

function genTarimaRef(num) {
  return 'T' + String(num).padStart(2, '0')
}

function isOrderComplete(order, validatedCount) {
  const expected = order.bultos_esperados ?? 0
  return expected > 0 && validatedCount >= expected
}

function isOrderPending(order, validatedCount) {
  return validatedCount < (order.bultos_esperados ?? 1)
}

function buildLookupCodeSet(rawCodes = []) {
  const codes = new Set()
  rawCodes.filter(Boolean).forEach((rawCode) => {
    const normalized = normalizeCodeFast(rawCode)
    if (!normalized) return
    generateCodeVariations(normalized, false).forEach((variant) => codes.add(variant))
  })
  return codes
}

function CopyMetaPill({ label, value, tone = 'primary' }) {
  const [copied, setCopied] = useState(false)

  if (!value) return null

  const handleCopy = async (event) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  const toneClass = tone === 'warm'
    ? 'bg-warm-100 text-warm-600 border-warm-200 hover:border-warm-300'
    : 'bg-primary-50 text-primary-600 border-primary-100 hover:border-primary-200'

  return (
    <span className={`group inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap ${toneClass}`}>
      {label ? <span className="shrink-0 font-semibold not-italic">{label}</span> : null}
      <span className="min-w-0 truncate">{value}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded p-0.5 text-current opacity-0 transition-opacity hover:bg-white/70 group-hover:opacity-100"
        title="Copiar"
      >
        {copied ? <Check className="h-2.5 w-2.5 text-success-500" /> : <Copy className="h-2.5 w-2.5" />}
      </button>
    </span>
  )
}

export default function ValidarPorDestino({ folioId }) {
  const navigate = useNavigate()
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const { canWrite } = useAuthStore()
  const canUpdate = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.folios')
    return lvl === 'actualizar' || lvl === 'eliminar'
  })
  const qc = useQueryClient()

  const scanRef = useRef(null)
  const [scanInput, setScanInput] = useState('')
  const [currentTarimaNum, setCurrentTarimaNum] = useState(1)
  const [errorModal, setErrorModal] = useState(null)
  const [showConfirmCancel, setShowConfirmCancel] = useState(false)
  const [showConfirmCerrar, setShowConfirmCerrar] = useState(false)
  const [folioCerradoNum, setFolioCerradoNum] = useState(null)
  const [showPanel, setShowPanel] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orderEnrichment, setOrderEnrichment] = useState({})
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

  const { data: folioData, isLoading: loadingFolio } = useQuery({
    queryKey: ['despacho-folio', folioId],
    queryFn: () => getFolio(folioId),
    enabled: !!folioId,
    staleTime: 30_000,
  })

  const { data: scansData, isLoading: loadingScans } = useQuery({
    queryKey: ['despacho-folio-scans', folioId],
    queryFn: () => getFolioScans(folioId),
    enabled: !!folioId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })

  const folio = folioData?.folio
  const orders = folioData?.orders ?? []
  const scans = scansData?.scans ?? []

  const isActive = folio && ['borrador', 'en_proceso'].includes(folio.estado)
  const editable = !!isActive && canWrite('despacho.folios')
  const currentTarimaRef = genTarimaRef(currentTarimaNum)

  // Enrich orders with WMS trucking + reference data
  const orderIdsKey = orders.map(o => o.outbound_order_no).join(',')
  useEffect(() => {
    if (!orders.length) return
    setEnrichmentLoading(true)
    let cancelled = false
    Promise.allSettled(
      orders.map(o =>
        getOutboundDetail(o.outbound_order_no)
          .then(r => ({ orderNo: o.outbound_order_no, data: r?.data ?? null }))
          .catch(() => ({ orderNo: o.outbound_order_no, data: null }))
      )
    ).then(results => {
      if (cancelled) return
      const map = {}
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          const { orderNo, data } = r.value
          map[orderNo] = {
            logisticsTrackNo: data?.logisticsTrackNo || null,
            thirdOrderNo: data?.thirdOrderNo || null,
          }
        }
      })
      setOrderEnrichment(map)
      setEnrichmentLoading(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdsKey, folioId])

  useEffect(() => {
    if (editable) setTimeout(() => scanRef.current?.focus(), 100)
  }, [editable, folioId])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folio-scans', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folios'] })
  }

  const handleNextTarima = useCallback(() => {
    setCurrentTarimaNum(prev => {
      const next = prev + 1
      addToast(`Tarima ${genTarimaRef(next)} lista para escaneo`, 'success')
      setTimeout(() => scanRef.current?.focus(), 60)
      return next
    })
  }, [addToast])

  const { mutate: doCerrar, isPending: cerrando } = useMutation({
    mutationFn: () => cerrarFolio(folioId),
    onSuccess: () => {
      invalidate()
      setShowConfirmCerrar(false)
      setFolioCerradoNum(folio?.folio_numero ?? folio?.folio ?? folioId)
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error cerrando folio', 'error'),
  })

  const { mutate: doCancelar, isPending: cancelando } = useMutation({
    mutationFn: () => cancelarFolio(folioId),
    onSuccess: () => { invalidate(); setShowConfirmCancel(false); addToast('Folio cancelado', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error cancelando folio', 'error'),
  })

  const { mutate: doAddScan, isPending: scanning } = useMutation({
    mutationFn: (body) => addFolioScan(folioId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-folio-scans', folioId] })
      qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
      setScanInput('')
      setTimeout(() => scanRef.current?.focus(), 50)
    },
    onError: (err) => {
      const code = err?.response?.data?.code
      const msg = err?.response?.data?.error || 'Error registrando escaneo'
      if (code === 'DUPLICATE_IN_FOLIO') {
        setErrorModal({ type: 'duplicate', message: msg })
      } else if (code === 'DUPLICATE_CROSS_FOLIO') {
        setErrorModal({ type: 'cross_folio', message: msg, folio_numero: err?.response?.data?.folio_numero })
      } else {
        addToast(msg, 'error')
      }
      setScanInput('')
      setTimeout(() => scanRef.current?.focus(), 50)
    },
  })

  const { mutate: doDeleteScan } = useMutation({
    mutationFn: (scanId) => deleteFolioScan(folioId, scanId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-folio-scans', folioId] })
      qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
      addToast('Escaneo eliminado', 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error eliminando escaneo', 'error'),
  })

  const handleScan = useCallback(() => {
    const raw = scanInput.trim()
    if (!raw) return
    const code = normalizeScanCode(raw)
    if (!code) return

    // Duplicate check
    const scannedCodes = new Set()
    scans.forEach((scan) => {
      const normalized = normalizeCodeFast(scan.codigo_caja)
      if (!normalized) return
      generateCodeVariations(normalized, false).forEach((variant) => scannedCodes.add(variant))
    })
    if (scannedCodes.has(code)) {
      setErrorModal({ type: 'duplicate', code })
      setScanInput('')
      setTimeout(() => scanRef.current?.focus(), 100)
      return
    }

    // Match by outbound_order_no, logisticsTrackNo or thirdOrderNo
    let matchedOrderNo = null
    for (const order of orders) {
      const lookupCodes = buildLookupCodeSet([
        order.outbound_order_no,
        orderEnrichment[order.outbound_order_no]?.logisticsTrackNo,
        orderEnrichment[order.outbound_order_no]?.thirdOrderNo,
      ])
      if (lookupCodes.has(code)) {
        matchedOrderNo = order.outbound_order_no
        break
      }
    }

    if (!matchedOrderNo) {
      setErrorModal({ type: 'nomatch', code })
      setScanInput('')
      setTimeout(() => scanRef.current?.focus(), 100)
      return
    }

    doAddScan({ codigo_caja: code, tarima_ref: currentTarimaRef, matched_order_no: matchedOrderNo })
  }, [scanInput, scans, orders, orderEnrichment, currentTarimaRef, doAddScan])

  // KPI counts
  const totalEsperadas = orders.reduce((s, o) => s + (o.bultos_esperados || 0), 0)
  const totalScaneadas = scans.length
  const pendientes = Math.max(0, totalEsperadas - totalScaneadas)

  // Group scans by tarima
  const scansByTarima = useMemo(() => (
    scans.reduce((acc, s) => {
      const key = s.tarima_ref || 'Sin tarima'
      if (!acc[key]) acc[key] = []
      acc[key].push(s)
      return acc
    }, {})
  ), [scans])
  const tarimaKeys = Object.keys(scansByTarima).sort()

  const validatedCountByOrderNo = useMemo(() => (
    scans.reduce((acc, scan) => {
      if (!scan.matched_order_no) return acc
      acc[scan.matched_order_no] = (acc[scan.matched_order_no] || 0) + 1
      return acc
    }, {})
  ), [scans])

  const searchedOrders = useMemo(() => {
    let filtered = [...orders]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(o => {
        if (o.outbound_order_no.toLowerCase().includes(q)) return true
        if (o.destinatario?.toLowerCase().includes(q)) return true
        const enrich = orderEnrichment[o.outbound_order_no]
        if (enrich?.logisticsTrackNo?.toLowerCase().includes(q)) return true
        if (enrich?.thirdOrderNo?.toLowerCase().includes(q)) return true
        return false
      })
    }
    return filtered
  }, [orders, searchQuery, orderEnrichment])

  const statusCounts = useMemo(() => ({
    all: searchedOrders.length,
    pending: searchedOrders.filter(order => isOrderPending(order, validatedCountByOrderNo[order.outbound_order_no] || 0)).length,
    complete: searchedOrders.filter(order => isOrderComplete(order, validatedCountByOrderNo[order.outbound_order_no] || 0)).length,
  }), [searchedOrders, validatedCountByOrderNo])

  // Filtered orders for panel
  const filteredOrders = useMemo(() => {
    if (statusFilter === 'complete') {
      return searchedOrders.filter(order => isOrderComplete(order, validatedCountByOrderNo[order.outbound_order_no] || 0))
    }
    if (statusFilter === 'pending') {
      return searchedOrders.filter(order => isOrderPending(order, validatedCountByOrderNo[order.outbound_order_no] || 0))
    }
    return searchedOrders
  }, [searchedOrders, statusFilter, validatedCountByOrderNo])

  if (loadingFolio) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  }

  if (folioCerradoNum) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-6 bg-warm-50/40 px-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-success-100 text-success-600">
          <PartyPopper className="w-10 h-10" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-warm-800 mb-1">{t('desp.validar.folioCerrado.title')}</p>
          <p className="text-sm text-warm-500">
            El folio <span className="font-mono font-semibold text-warm-700">{folioCerradoNum}</span> ha sido cerrado y registrado.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/despacho/validar')}
            className="btn-primary flex items-center gap-2 px-6 py-2.5">
            <Plus className="w-4 h-4" />
            {t('desp.validar.folioCerrado.nuevaValidacion')}
          </button>
          <button
            onClick={() => navigate(`/despacho/folios/${folioId}`)}
            className="btn-secondary flex items-center gap-2 px-6 py-2.5">
            <ExternalLink className="w-4 h-4" />
            {t('desp.validar.folioCerrado.verFolio')}
          </button>
        </div>
      </div>
    )
  }

  const closeErrorModal = () => {
    setErrorModal(null)
    setTimeout(() => scanRef.current?.focus(), 100)
  }

  return (
    <div className="flex h-full overflow-hidden relative">

      {/* ── LEFT COLUMN (header + scan stream) ───────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-warm-100 px-5 pt-4 pb-3 space-y-3">

        {/* Row 1: folio identity + action buttons */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100 text-primary-600 shrink-0">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400 leading-none mb-0.5">
                {t('desp.validar.destino.subtitulo')}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-warm-900 text-sm">
                  {folio?.folio_numero || folio?.folio || '—'}
                </span>
                {folio?.destino && (
                  <span className="text-[11px] text-warm-500 font-medium truncate max-w-[200px]">
                    {folio.destino}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full border border-accent-200 bg-accent-50 px-2 py-0.5 text-[10px] font-bold text-accent-700 shrink-0">
                  <Radio className="w-2.5 h-2.5" />{currentTarimaRef}
                </span>
                {enrichmentLoading && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-warm-400">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />WMS
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons — right side of row 1 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {editable && (
              <button
                type="button"
                onClick={handleNextTarima}
                className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-xl border border-accent-300 bg-accent-50 text-accent-700 text-xs font-semibold hover:bg-accent-100 transition-colors"
              >
                <Layers className="w-3 h-3" />
                {t('desp.validar.destino.sigTarima')} ({genTarimaRef(currentTarimaNum + 1)})
              </button>
            )}
            {folio?.estado === 'en_proceso' && canWrite('despacho.folios') && (
              <button onClick={() => setShowConfirmCerrar(true)} disabled={cerrando}
                className="btn-success text-xs flex items-center gap-1 h-8 px-3">
                {cerrando ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                {t('desp.validar.destino.cerrarFolio')}
              </button>
            )}
            {canUpdate && isActive && (
              <button onClick={() => setShowConfirmCancel(true)}
                className="btn-danger text-xs flex items-center gap-1 h-8 px-3">
                <XCircle className="w-3 h-3" />{t('desp.validar.orden.cancelar')}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: KPI metrics strip */}
        <div className="flex gap-2">
          {[
            { label: t('desp.validar.destino.ordenes'), value: orders.length, accent: 'bg-primary-500', tone: 'text-warm-900' },
            { label: t('desp.validar.destino.esperadas'), value: totalEsperadas || '—', accent: 'bg-warm-400', tone: 'text-warm-900' },
            { label: t('desp.validar.destino.escaneadas'), value: totalScaneadas, accent: 'bg-success-500', tone: totalScaneadas > 0 ? 'text-success-600' : 'text-warm-400' },
            { label: t('desp.validar.destino.pendientes'), value: pendientes, accent: pendientes > 0 ? 'bg-danger-500' : 'bg-success-500', tone: pendientes > 0 ? 'text-danger-500' : 'text-success-600' },
          ].map(({ label, value, accent, tone }) => (
            <div key={label} className="flex-1 min-w-0 rounded-xl border border-warm-200 bg-warm-50 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${accent}`} />
                <span className="text-[10px] font-semibold text-warm-400 uppercase tracking-wider leading-none truncate">{label}</span>
              </div>
              <span className={`font-mono font-black tabular-nums text-2xl leading-none ${tone}`}>{value}</span>
            </div>
          ))}
          {loadingScans && <Loader2 className="w-3.5 h-3.5 animate-spin text-warm-400 self-center" />}
        </div>

        {/* Row 3: scan input */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 bg-white border-2 rounded-2xl px-4 h-11 flex-1 transition-colors ${
            scanning ? 'border-primary-300' : 'border-primary-200 focus-within:border-primary-400'
          }`}>
            <ScanLine className="w-3.5 h-3.5 text-primary-400 shrink-0" />
            <input
              ref={scanRef}
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleScan() }}
              placeholder={t('desp.validar.orden.scanPlaceholder')}
              className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-400"
              autoComplete="off"
              disabled={!editable || scanning}
            />
            {scanInput && (
              <button onClick={() => { setScanInput(''); scanRef.current?.focus() }} className="text-warm-400 hover:text-warm-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={handleScan}
            disabled={!scanInput.trim() || scanning || !editable}
            className="btn-primary text-sm flex items-center gap-1.5 h-11 px-4 rounded-2xl disabled:opacity-50"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
            {t('desp.validar.orden.validarBtn')}
          </button>
        </div>

        {/* Row 4: scan hint */}
        <p className="text-[11px] text-warm-400 flex items-center gap-1.5">
          <Clock3 className="w-3 h-3" />
          {t('desp.validar.destino.scanHint')}
          <span className="mx-1 text-warm-300">·</span>
          {editable ? `${t('desp.validar.destino.tarimaActiva')}: ${currentTarimaRef}` : `Folio ${folio?.estado || ''}`}
        </p>
      </div>

      {/* ── SCAN STREAM ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-warm-100 bg-warm-50/70 shrink-0 flex items-center justify-between">
            <span className="text-xs font-semibold text-warm-700">{t('desp.validar.destino.flujo')}</span>
            <span className="text-[11px] text-warm-400 tabular-nums">{scans.length} total</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {scans.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-warm-300">
                <ScanLine className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs">{t('desp.validar.destino.sinEscaneos')}</p>
              </div>
            ) : (
              <div className="divide-y divide-warm-50">
                {tarimaKeys.slice().reverse().map(tarima => (
                  <div key={tarima}>
                    <div className="flex items-center gap-2 px-4 py-2 bg-warm-50/80 sticky top-0 z-[2] border-b border-warm-100">
                      <Layers className="w-3 h-3 text-accent-500 shrink-0" />
                      <span className="text-[11px] font-bold text-accent-700">{tarima}</span>
                      <span className="ml-auto text-[10px] text-warm-400">
                        {scansByTarima[tarima].length} {t('desp.validar.destino.cajasTotal')}
                      </span>
                    </div>
                    {[...scansByTarima[tarima]].reverse().map((s, i) => (
                      <div key={s.id} className={`flex items-center gap-2.5 px-4 py-2.5 group hover:bg-warm-50 transition-colors ${
                        i === 0 ? 'bg-primary-50/30' : ''
                      }`}>
                        <span className="w-5 text-right text-[10px] text-warm-400 tabular-nums shrink-0">
                          {scansByTarima[tarima].length - i}
                        </span>
                        <Check className="w-3 h-3 text-success-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-warm-800">{s.codigo_caja}</span>
                            {!s.matched_order_no ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning-100 border border-warning-200 text-[9px] font-bold text-warning-700">
                                <AlertCircle className="w-2.5 h-2.5" />{t('desp.validar.destino.sinOrden')}
                              </span>
                            ) : (
                              <span className="text-[10px] text-accent-600 font-mono">{s.matched_order_no}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-warm-400">{fmtDateTime(s.validated_at)}</span>
                        </div>
                        {editable && (
                          <button
                            onClick={() => doDeleteScan(s.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-warm-300 hover:text-danger-500 hover:bg-danger-50 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
      </div>{/* ── SCAN STREAM end ── */}

      </div>{/* ── LEFT COLUMN end ── */}

      {/* Right: orders side panel — wrapper always rendered so toggle button stays at the panel edge */}
      <div className={`shrink-0 relative ${showPanel ? 'w-[26rem] xl:w-[28rem] 2xl:w-[30rem]' : 'w-0'}`}>
        {!showPanel && (
          <button
            type="button"
            onClick={() => setShowPanel(true)}
            title={t('desp.validar.destino.mostrarPanel')}
            className="hidden lg:flex absolute -left-5 top-4 z-20 h-10 w-10 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-500 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600"
          >
            <PanelRightOpen size={16} />
          </button>
        )}
        {showPanel && (
        <div className="w-full h-full flex flex-col border-l border-warm-100 bg-gradient-to-b from-white via-white to-primary-50/20 shadow-[-16px_0_34px_-28px_rgba(37,99,235,0.38)] overflow-hidden">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-warm-100 bg-warm-50/50 shrink-0">
              <div className="flex items-center gap-2 mb-2.5 min-w-0">
                <h4 className="min-w-0 flex-1 truncate text-sm font-bold text-warm-700">{t('desp.validar.destino.ordenesDestino')}</h4>
                <span className="badge shrink-0 bg-primary-100 text-primary-700 text-[11px] font-semibold">{orders.length}</span>
                <button
                  type="button"
                  onClick={() => setShowPanel(false)}
                  title={t('desp.validar.destino.ocultarPanel')}
                  className="hidden lg:flex shrink-0 h-8 w-8 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-500 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600"
                >
                  <PanelRightClose size={15} />
                </button>
              </div>

              {/* Search */}
              <div className="flex items-center gap-1.5 rounded-2xl border border-primary-100/80 bg-gradient-to-r from-white via-primary-50/55 to-white px-2.5 h-8 shadow-[0_8px_18px_-14px_rgba(37,99,235,0.45)] focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-100 mb-2 transition-all">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100/80 shrink-0">
                  <Search className="w-2.5 h-2.5 text-primary-500" />
                </div>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('desp.validar.destino.searchPlaceholder')}
                  className="flex-1 min-w-0 bg-transparent text-xs text-warm-700 outline-none placeholder:text-warm-400 focus-visible:outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-warm-400 hover:text-warm-600 shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Status filters */}
              <div className="flex gap-1">
                {[
                  { k: 'all', l: t('desp.validar.destino.filtroTodas') },
                  { k: 'pending', l: t('desp.validar.destino.filtroPend') },
                  { k: 'complete', l: t('desp.validar.destino.filtroListas') },
                ].map(({ k, l }) => (
                  <button key={k} onClick={() => setStatusFilter(k)}
                    className={`flex-1 h-7 px-2 text-[11px] font-semibold rounded-lg border transition-all ${
                      statusFilter === k
                        ? k === 'complete'
                          ? 'bg-success-100 text-success-700 border-success-200'
                          : k === 'pending'
                          ? 'bg-danger-100 text-danger-700 border-danger-200'
                          : 'bg-primary-100 text-primary-700 border-primary-200'
                        : 'bg-white text-warm-500 border-warm-200 hover:border-warm-300 hover:text-warm-700'
                    }`}>
                    <span className="flex items-center justify-between gap-2">
                      <span>{l}</span>
                      <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        statusFilter === k
                          ? 'bg-white/70'
                          : 'bg-warm-100 text-warm-600'
                      }`}>
                        {statusCounts[k]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Panel body: order cards */}
            <div className="flex-1 overflow-y-auto p-2.5 bg-warm-50/55">
              {filteredOrders.length === 0 ? (
                <div className="py-8 text-center text-xs text-warm-400">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Sin resultados'
                    : t('desp.validar.destino.sinOrdenes')}
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-2.5">
              {filteredOrders.map(order => {
                const validadas = validatedCountByOrderNo[order.outbound_order_no] || 0
                const esperadas = order.bultos_esperados ?? 0
                const pct = esperadas > 0 ? Math.min(100, Math.round((validadas / esperadas) * 100)) : null
                const complete = isOrderComplete(order, validadas)
                const enrich = orderEnrichment[order.outbound_order_no]
                const enrichDone = order.outbound_order_no in orderEnrichment

                return (
                  <div key={order.id} className={`p-3 rounded-2xl border transition-all shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)] ${
                    complete
                      ? 'border-success-200 bg-gradient-to-br from-success-50/60 via-white to-white'
                      : 'border-warm-200/90 bg-white hover:border-primary-100 hover:shadow-[0_14px_28px_-18px_rgba(37,99,235,0.3)]'
                  }`}>
                    {/* Order header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <button
                        type="button"
                        onClick={async (event) => {
                          event.stopPropagation()
                          try {
                            await navigator.clipboard.writeText(String(order.outbound_order_no))
                            addToast('Orden copiada', 'success')
                          } catch {}
                        }}
                        title="Copiar orden"
                        className="group inline-flex min-w-0 items-start gap-1.5 text-left"
                      >
                        <span className="min-w-0 font-mono text-[11px] font-black leading-snug text-primary-700 break-all">
                          {order.outbound_order_no}
                        </span>
                        <span className="shrink-0 rounded p-0.5 text-warm-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-warm-100 hover:text-primary-600">
                          <Copy className="h-2.5 w-2.5" />
                        </span>
                      </button>
                      {complete ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0 text-success-600" />
                      ) : (
                        <span className="text-[10px] font-bold text-warm-600 tabular-nums shrink-0">
                          {validadas}/{esperadas || '?'}
                        </span>
                      )}
                    </div>

                    {/* Destinatario */}
                    {order.destinatario && (
                      <p className="text-[10px] leading-4 text-warm-500 font-medium break-words min-h-[2rem] mb-1.5">
                        {order.destinatario}
                      </p>
                    )}

                    {/* Trucking + Reference */}
                    <div className="flex min-h-[1.5rem] flex-nowrap items-start gap-1 mb-2 overflow-hidden">
                      {enrichmentLoading && !enrichDone ? (
                        <span className="text-[9px] text-warm-400 flex items-center gap-0.5">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />cargando WMS...
                        </span>
                      ) : (
                        <>
                          {enrich?.logisticsTrackNo ? (
                            <CopyMetaPill value={enrich.logisticsTrackNo} tone="primary" />
                          ) : enrichDone ? (
                            <span className="shrink-0 text-[9px] text-warm-300 italic">{t('desp.validar.destino.sinTracking')}</span>
                          ) : null}
                          {enrich?.thirdOrderNo && (
                            <CopyMetaPill label="Ref:" value={enrich.thirdOrderNo} tone="warm" />
                          )}
                        </>
                      )}
                    </div>

                    {/* Progress bar */}
                    {pct !== null && (
                      <>
                        <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${complete ? 'bg-success-500' : 'bg-primary-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {!complete && (
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[9px] text-warm-400">{pct}%</span>
                            <span className="text-[9px] text-danger-500">{Math.max(0, esperadas - validadas)} pend.</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              </div>
              )}
            </div>
        </div>
        )}
      </div>

      {/* ── Blocking error modal ── */}
      <Modal
        isOpen={!!errorModal}
        onClose={closeErrorModal}
        title={
          errorModal?.type === 'duplicate' ? t('desp.validar.destino.codDuplicado')
          : errorModal?.type === 'cross_folio' ? t('desp.validar.destino.codOtroFolio')
          : t('desp.validar.destino.codNoReconocido')
        }
        icon={errorModal?.type === 'nomatch' ? XCircle : AlertCircle}
        size="sm"
        footer={
          <div className="flex justify-end">
            <button onClick={closeErrorModal} className="btn-primary text-sm">
              {t('desp.validar.destino.entendido')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          {errorModal?.type === 'nomatch'
            ? <>{t('desp.validar.destino.codNoMatchPre')}<span className="font-mono font-semibold">{errorModal.code}</span>{t('desp.validar.destino.codNoMatchPost')}</>
            : errorModal?.type === 'duplicate' && errorModal?.code
            ? <>{t('desp.validar.destino.codDupLocalPre')}<span className="font-mono font-semibold">{errorModal.code}</span>{t('desp.validar.destino.codDupLocalPost')}</>
            : errorModal?.message}
        </p>
        {errorModal?.type === 'cross_folio' && (
          <p className="text-xs text-warm-500 mt-2">
            {t('desp.validar.destino.folioLabel')}: <span className="font-mono font-semibold">{errorModal?.folio_numero}</span>
          </p>
        )}
      </Modal>

      {/* ── Cerrar folio confirm modal ── */}
      <Modal
        isOpen={showConfirmCerrar}
        onClose={() => setShowConfirmCerrar(false)}
        title={t('desp.validar.cerrarFolioTitle')}
        icon={CheckCircle2}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowConfirmCerrar(false)} className="btn-secondary text-sm">
              {t('common.back')}
            </button>
            <button onClick={() => doCerrar()} disabled={cerrando}
              className="btn-success text-sm flex items-center gap-1.5">
              {cerrando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('desp.validar.confirmarCierre')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          {t('desp.validar.cerrarConfirmPre')} <span className="font-mono font-semibold">{folio?.folio_numero ?? folio?.folio}</span>{t('desp.validar.cerrarConfirmPost')}
        </p>
      </Modal>

      {/* ── Cancel confirm modal ── */}
      <Modal
        isOpen={showConfirmCancel}
        onClose={() => setShowConfirmCancel(false)}
        title={t('desp.validar.cancelarFolioTitle')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowConfirmCancel(false)} className="btn-secondary text-sm">
              {t('common.back')}
            </button>
            <button onClick={() => doCancelar()} disabled={cancelando}
              className="btn-danger text-sm flex items-center gap-1.5">
              {cancelando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('desp.validar.confirmarCancelacion')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">{t('desp.validar.destino.cancelConfirm')}</p>
      </Modal>
    </div>
  )
}
