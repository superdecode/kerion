import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScanLine, Loader2, X, Check, CheckCircle2, XCircle, AlertCircle,
  Layers, MapPin, Trash2, Radio, Clock3, Search,
  PanelRightClose, PanelRightOpen,
} from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'
import {
  getFolio, getFolioScans, addFolioScan, deleteFolioScan,
  cerrarFolio, cancelarFolio,
} from '../services/despachoService'

function genTarimaRef(num) {
  return 'T' + String(num).padStart(2, '0')
}

export default function ValidarPorDestino({ folioId }) {
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
    onSuccess: () => { invalidate(); addToast('Folio cerrado', 'success') },
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
    const code = normalizeCodeFast(raw)
    if (!code) return

    // Duplicate check
    if (scans.some(s => normalizeCodeFast(s.codigo_caja) === code)) {
      setErrorModal({ type: 'duplicate', message: `El código "${code}" ya fue registrado en este folio.` })
      setScanInput('')
      setTimeout(() => scanRef.current?.focus(), 100)
      return
    }

    // Match by outbound_order_no, logisticsTrackNo or thirdOrderNo
    let matchedOrderNo = null
    for (const order of orders) {
      if (normalizeCodeFast(order.outbound_order_no) === code) {
        matchedOrderNo = order.outbound_order_no
        break
      }
      const enrich = orderEnrichment[order.outbound_order_no]
      if (enrich?.logisticsTrackNo && normalizeCodeFast(enrich.logisticsTrackNo) === code) {
        matchedOrderNo = order.outbound_order_no
        break
      }
      if (enrich?.thirdOrderNo && normalizeCodeFast(enrich.thirdOrderNo) === code) {
        matchedOrderNo = order.outbound_order_no
        break
      }
    }

    if (!matchedOrderNo) {
      setErrorModal({
        type: 'nomatch',
        message: `El código "${code}" no corresponde a ninguna orden de este destino. Verifica que la caja pertenezca a este folio.`,
      })
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

  // Filtered orders for panel
  const filteredOrders = useMemo(() => {
    let filtered = [...orders]
    if (statusFilter === 'complete') {
      filtered = filtered.filter(o => {
        const count = scans.filter(s => s.matched_order_no === o.outbound_order_no).length
        return (o.bultos_esperados ?? 0) > 0 && count >= (o.bultos_esperados ?? 0)
      })
    } else if (statusFilter === 'pending') {
      filtered = filtered.filter(o => {
        const count = scans.filter(s => s.matched_order_no === o.outbound_order_no).length
        return count < (o.bultos_esperados ?? 1)
      })
    }
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
  }, [orders, scans, statusFilter, searchQuery, orderEnrichment])

  if (loadingFolio) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  }

  const closeErrorModal = () => {
    setErrorModal(null)
    setTimeout(() => scanRef.current?.focus(), 100)
  }

  return (
    <div className="flex h-full overflow-hidden">

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
                Validación por destino
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
              <button onClick={() => doCerrar()} disabled={cerrando}
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
          Enter para registrar rápido
          <span className="mx-1 text-warm-300">·</span>
          {editable ? `Tarima activa: ${currentTarimaRef}` : `Folio ${folio?.estado || ''}`}
        </p>
      </div>

      {/* ── SCAN STREAM ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-warm-100 bg-warm-50/70 shrink-0 flex items-center justify-between">
            <span className="text-xs font-semibold text-warm-700">{t('desp.validar.destino.flujo')}</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-warm-400 tabular-nums">{scans.length} total</span>
              <button
                type="button"
                onClick={() => setShowPanel(v => !v)}
                title={showPanel ? 'Ocultar panel de órdenes' : 'Mostrar panel de órdenes'}
                className="h-6 w-6 inline-flex items-center justify-center rounded-lg border border-warm-200 bg-white text-warm-500 shadow-sm hover:bg-warm-50 hover:text-primary-600 transition-all"
              >
                {showPanel ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
              </button>
            </div>
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

      {/* Right: orders side panel (collapsible) */}
      {showPanel && (
        <div className="w-80 shrink-0 flex flex-col border-l border-warm-100 bg-gradient-to-b from-white via-white to-primary-50/20 shadow-[-16px_0_34px_-28px_rgba(37,99,235,0.38)]">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-warm-100 bg-warm-50/50 shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-sm font-bold text-warm-700">{t('desp.validar.destino.ordenesDestino')}</h4>
                <span className="badge bg-primary-100 text-primary-700 text-[11px] font-semibold">{orders.length}</span>
              </div>

              {/* Search */}
              <div className="flex items-center gap-1.5 rounded-2xl border border-primary-100/80 bg-gradient-to-r from-white via-primary-50/55 to-white px-2.5 h-8 shadow-[0_8px_18px_-14px_rgba(37,99,235,0.45)] focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-100 mb-2 transition-all">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100/80 shrink-0">
                  <Search className="w-2.5 h-2.5 text-primary-500" />
                </div>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Orden, tracking, referencia..."
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
                  { k: 'all', l: 'Todas' },
                  { k: 'pending', l: 'Pend.' },
                  { k: 'complete', l: 'Listas' },
                ].map(({ k, l }) => (
                  <button key={k} onClick={() => setStatusFilter(k)}
                    className={`flex-1 h-6 text-[11px] font-semibold rounded-lg border transition-all ${
                      statusFilter === k
                        ? k === 'complete'
                          ? 'bg-success-100 text-success-700 border-success-200'
                          : k === 'pending'
                          ? 'bg-danger-100 text-danger-700 border-danger-200'
                          : 'bg-primary-100 text-primary-700 border-primary-200'
                        : 'bg-white text-warm-500 border-warm-200 hover:border-warm-300 hover:text-warm-700'
                    }`}>
                    {l}
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
              <div className="grid grid-cols-2 gap-2">
              {filteredOrders.map(order => {
                const orderScans = scans.filter(s => s.matched_order_no === order.outbound_order_no)
                const validadas = orderScans.length
                const esperadas = order.bultos_esperados ?? 0
                const pct = esperadas > 0 ? Math.min(100, Math.round((validadas / esperadas) * 100)) : null
                const complete = esperadas > 0 && validadas >= esperadas
                const enrich = orderEnrichment[order.outbound_order_no]
                const enrichDone = order.outbound_order_no in orderEnrichment

                return (
                  <div key={order.id} className={`p-2.5 rounded-2xl border transition-all shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)] ${
                    complete
                      ? 'border-success-200 bg-gradient-to-br from-success-50/60 via-white to-white'
                      : 'border-warm-200/90 bg-white hover:border-primary-100 hover:shadow-[0_14px_28px_-18px_rgba(37,99,235,0.3)]'
                  }`}>
                    {/* Order header */}
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="font-mono font-bold text-primary-700 text-[10px] leading-snug truncate min-w-0">
                        {order.outbound_order_no}
                      </span>
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
                      <p className="text-[9px] text-warm-500 font-medium truncate mb-1">
                        {order.destinatario}
                      </p>
                    )}

                    {/* Trucking + Reference */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {enrichmentLoading && !enrichDone ? (
                        <span className="text-[9px] text-warm-400 flex items-center gap-0.5">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />cargando WMS...
                        </span>
                      ) : (
                        <>
                          {enrich?.logisticsTrackNo ? (
                            <span className="inline-block text-[9px] bg-primary-50 text-primary-600 border border-primary-100 px-1.5 py-0.5 rounded font-mono">
                              {enrich.logisticsTrackNo}
                            </span>
                          ) : enrichDone ? (
                            <span className="text-[9px] text-warm-300 italic">sin tracking</span>
                          ) : null}
                          {enrich?.thirdOrderNo && (
                            <span className="inline-block text-[9px] bg-warm-100 text-warm-600 border border-warm-200 px-1.5 py-0.5 rounded font-mono">
                              Ref: {enrich.thirdOrderNo}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Progress bar */}
                    {pct !== null && (
                      <>
                        <div className="w-full h-1 bg-warm-100 rounded-full overflow-hidden">
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

      {/* ── Blocking error modal ── */}
      <Modal
        isOpen={!!errorModal}
        onClose={closeErrorModal}
        title={
          errorModal?.type === 'duplicate' ? t('desp.validar.destino.codDuplicado')
          : errorModal?.type === 'cross_folio' ? 'Código en otro folio'
          : 'Código no reconocido'
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
        <p className="text-sm text-warm-700">{errorModal?.message}</p>
        {errorModal?.type === 'cross_folio' && (
          <p className="text-xs text-warm-500 mt-2">
            Folio: <span className="font-mono font-semibold">{errorModal?.folio_numero}</span>
          </p>
        )}
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
