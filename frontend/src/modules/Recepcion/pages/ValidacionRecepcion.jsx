import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ScanBarcode, CheckCircle2, XCircle, AlertCircle,
  Layers, PackageCheck, X, Square, ArrowUp, ArrowDown, ArrowUpDown, Trash2,
  ChevronDown, PanelRightClose, PanelRightOpen, Search, LayoutList, MapPin, Check,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { getOrder, createSession, updateSession, scanCode, deleteLastValidationRecord } from '../services/recepcionService'
import { extractBaseCode } from '../../Shared/Wms/extractBaseCode'

function buildTarimaMap(lines) {
  const map = new Map()
  let next = 1
  for (const line of lines) {
    const base = extractBaseCode(line.custom_box_barcode)
    if (base && !map.has(base)) map.set(base, next++)
  }
  return map
}

const TARIMA_PALETTE = [
  { bg: 'bg-sky-600',     ring: 'ring-sky-700',     text: 'text-white', pill: 'bg-sky-100 text-sky-800',         bar: 'bg-sky-500' },
  { bg: 'bg-violet-600',  ring: 'ring-violet-700',  text: 'text-white', pill: 'bg-violet-100 text-violet-800',   bar: 'bg-violet-500' },
  { bg: 'bg-amber-500',   ring: 'ring-amber-600',   text: 'text-white', pill: 'bg-amber-100 text-amber-800',     bar: 'bg-amber-400' },
  { bg: 'bg-emerald-600', ring: 'ring-emerald-700', text: 'text-white', pill: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
  { bg: 'bg-rose-600',    ring: 'ring-rose-700',    text: 'text-white', pill: 'bg-rose-100 text-rose-800',       bar: 'bg-rose-500' },
  { bg: 'bg-indigo-600',  ring: 'ring-indigo-700',  text: 'text-white', pill: 'bg-indigo-100 text-indigo-800',   bar: 'bg-indigo-500' },
  { bg: 'bg-orange-500',  ring: 'ring-orange-600',  text: 'text-white', pill: 'bg-orange-100 text-orange-800',   bar: 'bg-orange-400' },
  { bg: 'bg-teal-600',    ring: 'ring-teal-700',    text: 'text-white', pill: 'bg-teal-100 text-teal-800',       bar: 'bg-teal-500' },
]
function getTarimaColor(num) { return TARIMA_PALETTE[(num - 1) % TARIMA_PALETTE.length] }

const RESULT_CFG_BASE = {
  correcto:      { bg: 'bg-success-50/90 border-success-200', icon: CheckCircle2, iconCls: 'text-success-500', label: 'text-success-600', labelKey: 'rec.val.result.correcto' },
  duplicado:     { bg: 'bg-warning-50/90 border-warning-200', icon: AlertCircle,  iconCls: 'text-warning-500', label: 'text-warning-600', labelKey: 'rec.val.result.duplicado' },
  no_encontrado: { bg: 'bg-danger-50/90  border-danger-200',  icon: XCircle,      iconCls: 'text-danger-500',  label: 'text-danger-600',  labelKey: 'rec.val.result.no_encontrado' },
}

export default function ValidacionRecepcion() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18nStore()
  const toast = useToastStore()
  const qc = useQueryClient()

  const scanRefDesktop = useRef(null)
  const scanRefMobile  = useRef(null)
  const locationRef    = useRef(null)

  const [sessionId, setSessionId] = useState(null)
  const [withTarimas, setWithTarimas] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [expandedTarimas, setExpandedTarimas] = useState(new Set())
  const [lastResult, setLastResult] = useState(null)
  const [history, setHistory] = useState([])
  const [scanning, setScanning] = useState(true)
  const [bootingSession, setBootingSession] = useState(true)
  const [historySortKey, setHistorySortKey] = useState('scannedAt')
  const [historySortDir, setHistorySortDir] = useState('desc')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [dupModal, setDupModal] = useState({ open: false, code: null, entry: null })
  const [rejectModal, setRejectModal] = useState({ open: false, code: null })
  const [showTarimaConfirm, setShowTarimaConfirm] = useState(false)
  const [tarimaSearch, setTarimaSearch] = useState('')
  const [tarimaFilter, setTarimaFilter] = useState(null)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)

  // Ubicacion mode (when withTarimas is false)
  const [selectedUbicacion, setSelectedUbicacion] = useState(null)
  const [ubicacionConfirmed, setUbicacionConfirmed] = useState(false)
  const [locationInputValue, setLocationInputValue] = useState('')
  const [locationBatches, setLocationBatches] = useState([])
  const [ubicacionSearch, setUbicacionSearch] = useState('')
  const [mobileUbicacionPanelOpen, setMobileUbicacionPanelOpen] = useState(false)

  const { data: orderData, isLoading } = useQuery({
    queryKey: ['recepcion-order', id],
    queryFn: () => getOrder(id),
    refetchInterval: scanning ? 4000 : false,
  })

  const order    = orderData?.order ?? null
  const lines    = orderData?.lines ?? []
  const total    = Math.max(Number(order?.total_cajas || 0), lines.length)
  const validadas  = Math.max(lines.filter(l => l.estado_validacion === 'validada').length, Number(order?.cajas_validadas || 0))
  const faltantes  = lines.filter(l => l.estado_validacion === 'faltante').length
  const pendientes = Math.max(total - validadas - faltantes, 0)
  const progressPct = total > 0 ? Math.min(100, Math.round((validadas / total) * 100)) : 0

  const tarimaMap    = useMemo(() => buildTarimaMap(lines), [lines])
  const totalTarimas = tarimaMap.size

  const lastTarimaNum = useMemo(() => {
    if (!withTarimas || !lastResult?.code) return null
    const base = extractBaseCode(lastResult.code)
    return base ? (tarimaMap.get(base) ?? null) : null
  }, [withTarimas, lastResult, tarimaMap])

  const lastTarimaBase  = lastResult?.code ? extractBaseCode(lastResult.code) : null
  const lastTarimaColor = lastTarimaNum ? getTarimaColor(lastTarimaNum) : null

  const tarimaStats = useMemo(() => {
    if (!withTarimas) return []
    const stats = []
    for (const [base, num] of tarimaMap.entries()) {
      const tarLines = lines.filter(l => extractBaseCode(l.custom_box_barcode) === base)
      const validated = tarLines.filter(l => l.estado_validacion === 'validada').length
      stats.push({ num, base, total: tarLines.length, validated, color: getTarimaColor(num), tarLines })
    }
    return stats.sort((a, b) => a.num - b.num)
  }, [withTarimas, tarimaMap, lines])

  const tarimaCounts = useMemo(() => ({
    completo:   tarimaStats.filter(ts => ts.validated === ts.total && ts.total > 0).length,
    pendiente:  tarimaStats.filter(ts => ts.validated === 0).length,
    en_proceso: tarimaStats.filter(ts => ts.validated > 0 && ts.validated < ts.total).length,
  }), [tarimaStats])

  const filteredTarimaStats = useMemo(() => {
    let result = tarimaStats
    const q = tarimaSearch.trim().toLowerCase()
    if (q) result = result.filter(ts => ts.base.toLowerCase().includes(q))
    if (tarimaFilter === 'completo')   result = result.filter(ts => ts.validated === ts.total && ts.total > 0)
    if (tarimaFilter === 'pendiente')  result = result.filter(ts => ts.validated === 0)
    if (tarimaFilter === 'en_proceso') result = result.filter(ts => ts.validated > 0 && ts.validated < ts.total)
    return result
  }, [tarimaStats, tarimaSearch, tarimaFilter])

  const toggleTarima = useCallback((num) => {
    setExpandedTarimas(prev => {
      const next = new Set(prev)
      next.has(num) ? next.delete(num) : next.add(num)
      return next
    })
  }, [])

  // Ubicacion groups: combine completed batches + current active batch
  const allUbicacionGroups = useMemo(() => {
    const activeCodes = history.filter(h => h.result === 'correcto')
    const allBatches = [
      ...locationBatches,
      ...(activeCodes.length > 0 ? [{ ubicacion: selectedUbicacion, codes: activeCodes }] : []),
    ]
    const map = new Map()
    for (const batch of allBatches) {
      const key = batch.ubicacion ?? ''
      const existing = map.get(key) ?? { ubicacion: batch.ubicacion, codes: [] }
      existing.codes = [...existing.codes, ...batch.codes]
      map.set(key, existing)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.ubicacion) return 1
      if (!b.ubicacion) return -1
      return a.ubicacion.localeCompare(b.ubicacion)
    })
  }, [locationBatches, history, selectedUbicacion])

  const filteredUbicacionGroups = useMemo(() => {
    const q = ubicacionSearch.trim().toLowerCase()
    if (!q) return allUbicacionGroups
    return allUbicacionGroups
      .map(g => ({
        ...g,
        codes: g.codes.filter(c =>
          c.code.toLowerCase().includes(q) ||
          (g.ubicacion ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.codes.length > 0 || (g.ubicacion ?? '').toLowerCase().includes(q))
  }, [allUbicacionGroups, ubicacionSearch])

  const totalUbicacionCodes = allUbicacionGroups.reduce((s, g) => s + g.codes.length, 0)

  const refocus = useCallback(() => {
    setTimeout(() => {
      if (!withTarimas && !ubicacionConfirmed) {
        locationRef.current?.focus()
        return
      }
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
      const ref = isMobile ? scanRefMobile : scanRefDesktop
      ref.current?.focus()
    }, 50)
  }, [withTarimas, ubicacionConfirmed])

  useEffect(() => { if (scanning) refocus() }, [scanning, refocus])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const res = await createSession(id)
        if (cancelled) return
        setSessionId(res.session?.id ?? 'local')
        setScanning(true)
        refocus()
      } catch {
        if (!cancelled) toast.error('Error al iniciar sesión de validación')
      } finally {
        if (!cancelled) setBootingSession(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [id, refocus, toast])

  const endSession = async () => {
    if (sessionId && sessionId !== 'local') {
      try { await updateSession(id, sessionId, { ubicacion_nota: selectedUbicacion || null }) } catch { /* best-effort */ }
    }
    setSessionId(null)
    setScanning(false)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] }),
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] }),
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] }),
    ])
    navigate(`/recepcion/recibir/${id}`)
  }

  const scanMut = useMutation({
    mutationFn: ({ codigo, ubicacion }) => scanCode(id, { codigo_escaneado: codigo, session_id: sessionId, tarimas_enabled: withTarimas, ubicacion: ubicacion || null }),
    onSuccess: (data, variables) => {
      const ev = data.event
      setLastResult({ result: ev.resultado, code: ev.codigo_escaneado, sku: ev.sku_asociado })
      if (ev.resultado === 'no_encontrado') {
        setRejectModal({ open: true, code: ev.codigo_escaneado })
      }
      if (ev.resultado === 'correcto') {
        setHistory(prev => [{
          id: ev.id, result: ev.resultado, code: ev.codigo_escaneado,
          sku: ev.sku_asociado, scannedAt: ev.scanned_at, scannedBy: ev.scanned_by_nombre || '—',
          ubicacion: variables.ubicacion || null,
        }, ...prev.slice(0, 49)])
        if (data.line) {
          qc.setQueryData(['recepcion-order', id], (cur) => {
            if (!cur) return cur
            return {
              ...cur,
              order: { ...cur.order, cajas_validadas: data.cajas_validadas ?? cur.order?.cajas_validadas ?? 0, estado: data.estado || cur.order?.estado },
              lines: (cur.lines || []).map(l => l.id === data.line.id
                ? { ...l, estado_validacion: 'validada', validated_at: ev.scanned_at, validated_by_nombre: ev.scanned_by_nombre || l.validated_by_nombre }
                : l),
            }
          })
        }
      }
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = ev.resultado === 'correcto' ? 880 : ev.resultado === 'duplicado' ? 440 : 220
        gain.gain.value = ev.resultado === 'no_encontrado' ? 0.2 : 0.15
        osc.start(); osc.stop(ctx.currentTime + 0.12)
      } catch { /* audio not available */ }
    },
    onError: () => toast.error('Error al procesar escaneo'),
    onSettled: () => refocus(),
  })

  const deleteLastMut = useMutation({
    mutationFn: () => deleteLastValidationRecord(id),
    onSuccess: (data) => {
      setHistory(prev => prev.filter(item => item.id !== data.removedEvent?.id))
      qc.setQueryData(['recepcion-order', id], (cur) => {
        if (!cur) return cur
        return {
          ...cur,
          order: { ...cur.order, cajas_validadas: data.cajas_validadas ?? cur.order?.cajas_validadas ?? 0, estado: data.estado || cur.order?.estado },
          lines: (cur.lines || []).map(l => l.id === data.lineId
            ? { ...l, estado_validacion: 'pendiente', validated_at: null, validated_by_nombre: null }
            : l),
        }
      })
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      toast.success('Último registro eliminado')
      setConfirmDeleteOpen(false)
      refocus()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  })

  const playDupAudio = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 330
      gain.gain.value = 0.2
      osc.start(); osc.stop(ctx.currentTime + 0.25)
    } catch { /* audio not available */ }
  }, [])

  const handleKeyDown = (e) => {
    if (!withTarimas && !ubicacionConfirmed) return
    if (e.key === 'Enter' && e.target.value.trim()) {
      const code = e.target.value.trim()
      e.target.value = ''
      const existing = history.find(h => h.code === code)
      if (existing) {
        playDupAudio()
        setDupModal({ open: true, code, entry: existing })
        refocus()
        return
      }
      scanMut.mutate({ codigo: code, ubicacion: selectedUbicacion })
    }
  }

  const tryConfirmUbicacion = useCallback((value) => {
    const ub = value.trim() || null
    setSelectedUbicacion(ub)
    setUbicacionConfirmed(true)
    setTimeout(() => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
      const ref = isMobile ? scanRefMobile : scanRefDesktop
      ref.current?.focus()
    }, 80)
  }, [])

  const completarUbicacion = useCallback(() => {
    const batchCodes = history.filter(h => h.result === 'correcto').map(h => ({
      id: h.id, code: h.code, scannedAt: h.scannedAt,
    }))
    if (batchCodes.length > 0 || selectedUbicacion) {
      setLocationBatches(prev => [...prev, { ubicacion: selectedUbicacion, codes: batchCodes }])
    }
    setHistory([])
    setLastResult(null)
    setUbicacionConfirmed(false)
    setLocationInputValue('')
    setSelectedUbicacion(null)
    setTimeout(() => locationRef.current?.focus(), 80)
  }, [history, selectedUbicacion])

  const handleHistorySort = (key) => {
    if (historySortKey === key) setHistorySortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setHistorySortKey(key); setHistorySortDir(key === 'scannedAt' ? 'desc' : 'asc') }
  }

  const sortedHistory = useMemo(() => [...history].sort((a, b) => {
    const av = a?.[historySortKey] ?? ''; const bv = b?.[historySortKey] ?? ''
    let cmp = historySortKey === 'scannedAt' ? new Date(av).getTime() - new Date(bv).getTime() : String(av).localeCompare(String(bv), 'es')
    return historySortDir === 'asc' ? cmp : -cmp
  }), [history, historySortKey, historySortDir])

  const RESULT_CFG = Object.fromEntries(
    Object.entries(RESULT_CFG_BASE).map(([k, v]) => [k, { ...v, labelText: t(v.labelKey) }])
  )

  const CHIPS = [
    { key: null,         label: t('common.all'),                  count: tarimaStats.length },
    { key: 'completo',   label: t('rec.status.completo'),         count: tarimaCounts.completo },
    { key: 'en_proceso', label: t('rec.status.parcial'),          count: tarimaCounts.en_proceso },
    { key: 'pendiente',  label: t('rec.line.status.pendiente'),   count: tarimaCounts.pendiente },
  ]

  // Ubicacion panel body — shown when withTarimas is false
  const renderUbicacionPanelBody = () => (
    <>
      <div className="px-4 py-3.5 border-b border-warm-100 bg-warm-50/50 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-warm-700">{t('rec.val.ubicacion.panel.title')} · {allUbicacionGroups.length}</h4>
          <span className="text-[10px] font-semibold text-warm-400 tabular-nums">{totalUbicacionCodes} {t('rec.scan.historial').toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl border border-accent-100/80 bg-gradient-to-r from-white via-accent-50/55 to-white px-3 h-10 shadow-sm transition-all focus-within:border-accent-300 focus-within:ring-2 focus-within:ring-accent-100">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100/80 shadow-inner shrink-0">
            <Search className="w-3 h-3 text-accent-500" />
          </div>
          <input
            type="text"
            value={ubicacionSearch}
            onChange={e => setUbicacionSearch(e.target.value)}
            placeholder={t('rec.val.ubicacion.panel.search')}
            className="flex-1 min-w-0 bg-transparent text-xs text-warm-700 outline-none placeholder:text-warm-400 font-mono"
          />
          {ubicacionSearch && (
            <button type="button" onClick={() => setUbicacionSearch('')} className="text-warm-300 hover:text-warm-500 shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {ubicacionSearch && (
          <p className="text-[10px] text-warm-400 text-right leading-none">
            {filteredUbicacionGroups.length} de {allUbicacionGroups.length}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-warm-50/55 p-3 space-y-2.5">
        {filteredUbicacionGroups.length === 0 ? (
          <div className="py-8 text-center text-xs text-warm-400">
            {ubicacionSearch ? t('rec.val.ubicacion.panel.no_results') : t('rec.val.ubicacion.panel.sin_registros')}
          </div>
        ) : filteredUbicacionGroups.map((g, gi) => {
          const isActive = g.ubicacion === selectedUbicacion && ubicacionConfirmed
          return (
            <div key={g.ubicacion ?? '__sin__'} className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
              isActive
                ? 'bg-accent-600 border-transparent ring-2 ring-accent-700 ring-offset-1'
                : 'border-warm-200/90 bg-white hover:border-accent-100 hover:bg-gradient-to-br hover:from-white hover:to-accent-50/30'
            }`}>
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-white/25' : 'bg-accent-50'
                }`}>
                  <MapPin className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-accent-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-warm-800'}`}>
                    {g.ubicacion || t('rec.val.ubicacion.panel.sin_ub')}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/70' : 'text-warm-400'}`}>
                    {g.codes.length} {t('rec.scan.historial').toLowerCase()}
                  </p>
                </div>
                {isActive && (
                  <span className="badge text-[9px] bg-white/25 text-white border-0 shrink-0">ACTIVA</span>
                )}
              </div>
              {g.codes.length > 0 && (
                <div className={`border-t divide-y max-h-36 overflow-y-auto ${
                  isActive ? 'border-white/20 divide-white/10' : 'border-warm-100 divide-warm-50'
                }`}>
                  {g.codes.map((c, ci) => (
                    <div key={c.id || ci} className={`flex items-center gap-2 px-3 py-1.5 ${
                      isActive ? 'hover:bg-white/10' : 'hover:bg-warm-50/50'
                    }`}>
                      <Check className={`w-3 h-3 shrink-0 ${isActive ? 'text-white/60' : 'text-success-400'}`} />
                      <span className={`font-mono text-[11px] truncate flex-1 ${isActive ? 'text-white/80' : 'text-warm-600'}`}>
                        {c.code}
                      </span>
                      {c.scannedAt && (
                        <span className={`text-[10px] tabular-nums shrink-0 ${isActive ? 'text-white/40' : 'text-warm-300'}`}>
                          {new Date(c.scannedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )

  // Shared tarima panel body — design aligned with Dropscan panel
  const renderPanelBody = () => (
    <>
      {/* Header: title + search + chips (mirrors Dropscan's px-4 py-3.5 bg-warm-50/50 pattern) */}
      <div className="px-4 py-3.5 border-b border-warm-100 bg-warm-50/50 space-y-2.5 shrink-0">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-warm-700">{t('rec.tarimas.label')} · {totalTarimas}</h4>
          {lastTarimaNum && lastTarimaColor && (
            <span className={`badge text-[9px] font-bold ${lastTarimaColor.pill}`}>T{lastTarimaNum} {t('rec.tarimas.panel.activa')}</span>
          )}
        </div>

        {/* Search — mirrors Dropscan's gradient pill with circular icon */}
        <div className="flex items-center gap-1.5 rounded-2xl border border-sky-100/80 bg-gradient-to-r from-white via-sky-50/55 to-white px-3 h-10 shadow-[0_12px_26px_-24px_rgba(14,165,233,0.6)] transition-all focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100/80 shadow-inner shrink-0">
            <Search className="w-3 h-3 text-sky-500" />
          </div>
          <input
            type="text"
            value={tarimaSearch}
            onChange={e => setTarimaSearch(e.target.value)}
            placeholder={t('rec.tarimas.panel.search')}
            className="flex-1 min-w-0 bg-transparent text-xs text-warm-700 outline-none focus-visible:ring-0 placeholder:text-warm-400 font-mono"
          />
          {tarimaSearch && (
            <button type="button" onClick={() => setTarimaSearch('')} className="text-warm-300 hover:text-warm-500 transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filter chips — segmented control (mirrors Surtido's grid pattern, sky theme) */}
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-sky-100/70 bg-gradient-to-br from-sky-50/85 via-white to-white p-1.5 shadow-[0_12px_26px_-24px_rgba(14,165,233,0.55)]">
          {CHIPS.map(chip => {
            const isActive = tarimaFilter === chip.key
            return (
              <button
                key={String(chip.key)}
                type="button"
                onClick={() => setTarimaFilter(chip.key)}
                className={`w-full min-w-0 px-1 py-1.5 h-9 rounded-xl text-[10px] font-semibold border transition-all flex items-center justify-center gap-0.5 overflow-hidden ${
                  isActive
                    ? 'bg-white text-sky-700 border-sky-200 shadow-sm ring-1 ring-sky-100'
                    : 'bg-white/75 text-warm-500 border-transparent hover:border-warm-200 hover:bg-warm-50'
                }`}
              >
                <span className="truncate">{chip.label}</span>
                <span className={`text-[9px] font-bold tabular-nums shrink-0 ${isActive ? 'text-sky-400' : 'text-warm-400'}`}>{chip.count}</span>
              </button>
            )
          })}
        </div>

        {(tarimaSearch || tarimaFilter) && (
          <p className="text-[10px] text-warm-400 text-right leading-none">{filteredTarimaStats.length} de {tarimaStats.length}</p>
        )}
      </div>

      {/* Cards list — mirrors Dropscan's scrollbar-thin bg-warm-50/55 p-3 space-y-2.5 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-warm-50/55 p-3 space-y-2.5">
        {filteredTarimaStats.length === 0 ? (
          <div className="py-8 text-center text-xs text-warm-400">{tarimaSearch ? t('rec.tarimas.panel.no_results') : t('rec.tarimas.panel.sin_tarimas')}</div>
        ) : filteredTarimaStats.map(ts => {
          const isActive = ts.num === lastTarimaNum
          const isExpanded = expandedTarimas.has(ts.num)
          const pct = ts.total > 0 ? Math.round((ts.validated / ts.total) * 100) : 0
          return (
            <div
              key={ts.num}
              className={`rounded-2xl border overflow-hidden transition-all duration-200 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.32)] ${
                isActive
                  ? `${ts.color.bg} border-transparent ring-2 ${ts.color.ring} ring-offset-1 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.5)]`
                  : 'border-warm-200/90 bg-white hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:to-sky-50/30 hover:shadow-[0_20px_38px_-26px_rgba(14,165,233,0.35)]'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleTarima(ts.num)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                  isActive ? 'bg-white/25 text-white' : ts.color.pill
                }`}>{ts.num}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-mono text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-warm-800'}`}>{ts.base}</p>
                  <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/70' : 'text-warm-400'}`}>{ts.validated}/{ts.total}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  <span className={`text-xs font-bold tabular-nums ${isActive ? 'text-white' : 'text-warm-600'}`}>{pct}%</span>
                  {isActive && (
                    <span className="badge text-[9px] bg-white/25 text-white border-0">ACTIVA</span>
                  )}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isExpanded ? '-rotate-180' : ''} ${isActive ? 'text-white/60' : 'text-warm-300'}`} />
              </button>

              {!isActive && (
                <div className="px-3 pb-2.5">
                  <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                    <div className={`h-full ${ts.color.bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}

              {isExpanded && (
                <div className={`border-t divide-y ${isActive ? 'border-white/20 divide-white/10' : 'border-warm-100 divide-warm-50'}`}>
                  {ts.tarLines.map(l => (
                    <div key={l.id} className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${isActive ? 'hover:bg-white/10' : 'hover:bg-warm-50/50'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        l.estado_validacion === 'validada' ? 'bg-success-400' :
                        l.estado_validacion === 'faltante' ? 'bg-danger-400' : 'bg-warm-300'
                      }`} />
                      <span className={`font-mono text-[11px] truncate flex-1 ${isActive ? 'text-white/80' : 'text-warm-600'}`}>
                        {l.custom_box_barcode || '—'}
                      </span>
                      <span className={`text-[10px] font-bold shrink-0 ${
                        l.estado_validacion === 'validada'
                          ? (isActive ? 'text-white/70' : 'text-success-600')
                          : l.estado_validacion === 'faltante'
                            ? (isActive ? 'text-white/60' : 'text-danger-500')
                            : (isActive ? 'text-white/40' : 'text-warm-300')
                      }`}>
                        {l.estado_validacion === 'validada' ? '✓' : l.estado_validacion === 'faltante' ? '✗' : '·'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )

  if (isLoading || bootingSession || !order) return (
    <div className="flex flex-col h-full">
      <Header title={t('rec.scan.title')} icon={PackageCheck} />
      <div className="flex-1 flex items-center justify-center text-warm-400 text-sm">{t('common.loading')}</div>
    </div>
  )

  const scanInputProps = {
    type: 'text',
    className: 'w-full pl-12 pr-4 py-3.5 text-lg bg-white border-2 border-warm-200 rounded-2xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide',
    placeholder: t('rec.scan.placeholder') || 'Escanear código...',
    onKeyDown: handleKeyDown,
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    inputMode: 'none',
  }

  return (
    <div className="flex flex-col bg-warm-50 overflow-hidden" style={{ height: '100dvh' }}>

      {/* ── Header ── */}
      <Header
        title={
          <div className="flex items-center gap-2">
            <button onClick={endSession} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <span className="font-mono font-black text-sm sm:text-base text-warm-900 leading-none truncate">{order.folio}</span>
            </div>
          </div>
        }
        icon={PackageCheck}
        actions={
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Hub navigation — go back to main scan list */}
            <button
              type="button"
              onClick={() => navigate('/recepcion/recibir')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-warm-200 text-warm-500 hover:bg-warm-50 hover:text-sky-600 transition-colors"
              title="Lista de órdenes"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            {/* Tarimas toggle — on mobile when active: opens panel; on desktop: toggles off */}
            <button
              type="button"
              onClick={() => {
                if (withTarimas) {
                  if (window.innerWidth < 1024) setMobilePanelOpen(true)
                  else setWithTarimas(false)
                } else {
                  if (totalTarimas > 0) setShowTarimaConfirm(true)
                  else setWithTarimas(true)
                }
              }}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                withTarimas ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-warm-200 text-warm-500 hover:bg-warm-50'
              }`}
            >
              <Layers className={`w-3.5 h-3.5 ${withTarimas ? 'text-sky-600' : 'text-warm-400'}`} />
              <span className="hidden sm:inline">{withTarimas ? t('rec.tarimas.n_tarimas').replace('{n}', totalTarimas) : t('rec.tarimas.toggle')}</span>
              {withTarimas && <span className="sm:hidden">{totalTarimas}T</span>}
            </button>
            {/* Ubicacion panel button (when not in tarimas mode) */}
            {!withTarimas && allUbicacionGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileUbicacionPanelOpen(true)}
                className="lg:hidden flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-accent-200 bg-accent-50 text-xs font-semibold text-accent-700 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{allUbicacionGroups.length}</span>
              </button>
            )}
            {/* Completar ubicacion (when confirmed and has scans) */}
            {!withTarimas && ubicacionConfirmed && history.filter(h => h.result === 'correcto').length > 0 && (
              <button
                type="button"
                onClick={completarUbicacion}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-accent-300 bg-accent-600 text-xs font-semibold text-white hover:bg-accent-700 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('rec.val.btn.completar')}</span>
                <span className="sm:hidden">OK</span>
              </button>
            )}
            {/* Terminar */}
            <button
              onClick={endSession}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-danger-200 text-xs font-semibold text-danger-600 hover:bg-danger-50 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              <span>{t('rec.val.btn.terminar')}</span>
            </button>
          </div>
        }
      />

      {/* ── Body: flex row (main content + sidebar) ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── Main scroll area ── */}
        <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
          <div className="p-3 sm:p-5 space-y-3 max-w-2xl mx-auto lg:max-w-none">

            {/* Progress + counters card */}
            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                  <PackageCheck className="w-4.5 h-4.5 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-warm-900 font-mono text-base leading-none truncate">{order.folio}</p>
                  {order.cliente && <p className="text-xs text-warm-500 mt-0.5 truncate">{order.cliente}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-3xl font-black text-warm-900 tabular-nums leading-none">{validadas}</p>
                  <p className="text-xs text-warm-400">/{total}</p>
                </div>
              </div>
              <div className="relative w-full h-2 bg-warm-100 rounded-full overflow-hidden mb-2.5">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                    progressPct >= 100 ? 'bg-gradient-to-r from-success-400 to-success-500' :
                    progressPct >= 80  ? 'bg-gradient-to-r from-primary-400 to-sky-500' :
                    'bg-gradient-to-r from-sky-500 to-primary-400'
                  } ${progressPct > 0 ? 'min-w-[6px]' : ''}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center rounded-xl border border-success-100 bg-success-50 py-2">
                  <p className="text-2xl sm:text-3xl font-black text-success-700 tabular-nums">{validadas}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-success-600 mt-0.5">{t('rec.cajas_validadas')}</p>
                </div>
                <div className="text-center rounded-xl border border-warm-100 bg-warm-50 py-2">
                  <p className="text-2xl sm:text-3xl font-black text-warm-600 tabular-nums">{pendientes}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-warm-400 mt-0.5">{t('rec.cajas_pendientes')}</p>
                </div>
                <div className="text-center rounded-xl border border-danger-100 bg-danger-50 py-2">
                  <p className="text-2xl sm:text-3xl font-black text-danger-700 tabular-nums">{faltantes}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-danger-500 mt-0.5">{t('rec.cajas_faltantes')}</p>
                </div>
              </div>
              {progressPct >= 100 && (
                <div className="mt-2.5 flex items-center gap-2 bg-success-50 border border-success-200 text-success-700 rounded-xl px-3 py-2 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {t('rec.status.completo')} {t('rec.val.allValidated')}
                </div>
              )}
            </div>

            {/* ── Ubicacion input (desktop, when not in tarimas mode) ── */}
            {!withTarimas && (
              <div className="hidden sm:block card p-3 sm:p-4 sticky top-0 z-[10] bg-white/95 backdrop-blur-sm">
                {!ubicacionConfirmed ? (
                  <>
                    <p className="text-xs font-semibold text-accent-700 mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {t('rec.val.ubicacion.label')}
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-300 pointer-events-none" />
                        <input
                          ref={locationRef}
                          type="text"
                          value={locationInputValue}
                          onChange={e => setLocationInputValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') tryConfirmUbicacion(locationInputValue) }}
                          placeholder={t('rec.val.ubicacion.placeholder')}
                          className="w-full pl-12 pr-4 py-3.5 text-lg bg-white border-2 border-accent-200 rounded-2xl focus:border-accent-500 focus:ring-2 focus:ring-accent-100 transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          inputMode="none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => tryConfirmUbicacion(locationInputValue)}
                        disabled={!locationInputValue.trim()}
                        className="px-5 py-2 rounded-2xl bg-accent-600 text-white text-sm font-semibold hover:bg-accent-700 disabled:opacity-40 transition-colors"
                      >
                        {t('rec.val.ubicacion.confirm')}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => tryConfirmUbicacion('')}
                      className="mt-1.5 text-[11px] text-warm-400 hover:text-warm-600 transition-colors"
                    >
                      {t('rec.val.ubicacion.skip')}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${
                      selectedUbicacion ? 'bg-accent-50 border-accent-200' : 'bg-warm-50 border-warm-200'
                    }`}>
                      <MapPin className={`w-4 h-4 shrink-0 ${selectedUbicacion ? 'text-accent-600' : 'text-warm-400'}`} />
                      <span className={`text-sm font-mono font-semibold ${selectedUbicacion ? 'text-accent-700' : 'text-warm-500'}`}>
                        {selectedUbicacion || t('rec.val.ubicacion.panel.sin_ub')}
                      </span>
                      <span className="text-[11px] text-accent-500 ml-1">{t('rec.val.ubicacion.active')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUbicacionConfirmed(false); setLocationInputValue(selectedUbicacion || ''); setTimeout(() => locationRef.current?.focus(), 80) }}
                      className="text-xs text-warm-400 hover:text-warm-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-warm-100"
                    >
                      {t('rec.val.ubicacion.edit')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Desktop scan input ── */}
            <div className={`hidden sm:block card p-3 sm:p-4 sticky top-0 z-[10] bg-white/95 backdrop-blur-sm ${!withTarimas && !ubicacionConfirmed ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="relative">
                <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-300 pointer-events-none" />
                <input ref={scanRefDesktop} {...scanInputProps} />
              </div>
              <p className="text-center text-[10px] text-warm-400 mt-1.5">{t('rec.scan.enter_hint')}</p>
            </div>

            {/* ── Scan result feedback ── */}
            <AnimatePresence mode="wait">
              {lastResult && (() => {
                const cfg = RESULT_CFG[lastResult.result] || RESULT_CFG.no_encontrado
                const Icon = cfg.icon
                return (
                  <motion.div
                    key={lastResult.code + lastResult.result}
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.18 }}
                  >
                    {withTarimas && lastTarimaNum && lastTarimaColor && (
                      <div className={`${sidebarVisible ? 'sm:hidden' : ''} rounded-2xl flex flex-col items-center justify-center py-6 mb-3 ${lastTarimaColor.bg} ring-4 ${lastTarimaColor.ring} ring-offset-2`}>
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">{t('rec.tarimas.label')}</p>
                        <p className="text-[80px] sm:text-[96px] font-black text-white leading-none tabular-nums">{lastTarimaNum}</p>
                        <p className="text-xs font-mono text-white/60 mt-1">{lastTarimaBase}</p>
                      </div>
                    )}

                    <div className={`p-4 rounded-2xl flex items-center gap-3 border backdrop-blur-sm ${cfg.bg}`}>
                      <Icon className={`w-5 h-5 shrink-0 ${cfg.iconCls}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-warm-400">{t('rec.scan.ultimo')}</p>
                        <p className="font-mono font-bold text-warm-800 truncate text-sm sm:text-base">{lastResult.code}</p>
                        {lastResult.sku && <p className="text-xs text-warm-500 font-mono">SKU: {lastResult.sku}</p>}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <span className={`text-sm font-bold ${cfg.label}`}>{cfg.labelText}</span>
                        {withTarimas && lastTarimaNum && lastTarimaColor && sidebarVisible && (
                          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${lastTarimaColor.pill}`}>
                            T{lastTarimaNum}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })()}
            </AnimatePresence>

            {/* ── Scan history ── */}
            {history.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-warm-100 bg-warm-50 flex items-center justify-between">
                  <p className="text-xs font-bold text-warm-600 uppercase tracking-wide">
                    {t('rec.scan.historial')} ({history.length})
                  </p>
                  <button onClick={() => setHistory([])} className="text-[11px] text-warm-400 hover:text-warm-600 flex items-center gap-1">
                    <X className="w-3 h-3" /> {t('common.clear')}
                  </button>
                </div>
                <div className="overflow-x-auto max-h-52">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead className="bg-warm-50 sticky top-0 border-b border-warm-100">
                      <tr>
                        <th className="table-header w-8">#</th>
                        {[['code', t('rec.scan.col.codigo')], ['sku', 'SKU'], ['scannedAt', t('rec.scan.col.hora')]].map(([key, lbl]) => (
                          <th key={key} className="table-header">
                            <button type="button" onClick={() => handleHistorySort(key)} className="inline-flex items-center gap-1 hover:text-primary-700 transition-colors">
                              {lbl}
                              {historySortKey === key
                                ? (historySortDir === 'asc' ? <ArrowUp size={9} /> : <ArrowDown size={9} />)
                                : <ArrowUpDown size={9} className="opacity-30" />}
                            </button>
                          </th>
                        ))}
                        {!withTarimas && <th className="table-header">{t('rec.scan.col.ubicacion')}</th>}
                        {withTarimas && <th className="table-header">{t('rec.tarimas.label')}</th>}
                        <th className="table-header text-right">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {sortedHistory.map((h, i) => {
                        const base = withTarimas ? extractBaseCode(h.code) : null
                        const tarimaNum = withTarimas && base ? (tarimaMap.get(base) ?? null) : null
                        const tc = tarimaNum ? getTarimaColor(tarimaNum) : null
                        return (
                          <tr key={h.id || i} className="hover:bg-warm-50/50">
                            <td className="px-3 py-2 text-warm-400 tabular-nums">{sortedHistory.length - i}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-warm-800 max-w-[180px] truncate">{h.code}</td>
                            <td className="px-3 py-2 text-warm-500 font-mono">{h.sku || '—'}</td>
                            <td className="px-3 py-2 text-warm-500 whitespace-nowrap">
                              {h.scannedAt ? new Date(h.scannedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                            </td>
                            {!withTarimas && (
                              <td className="px-3 py-2">
                                {h.ubicacion
                                  ? <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-accent-700 bg-accent-50 border border-accent-100 px-2 py-0.5 rounded-full">
                                      <MapPin size={9} className="shrink-0" />{h.ubicacion}
                                    </span>
                                  : <span className="text-warm-300">—</span>
                                }
                              </td>
                            )}
                            {withTarimas && (
                              <td className="px-3 py-2">
                                {tarimaNum && tc ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${tc.pill}`}>T{tarimaNum}</span>
                                ) : '—'}
                              </td>
                            )}
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOpen(true)}
                                disabled={i !== 0 || deleteLastMut.isPending}
                                className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={t('rec.val.delete.tooltip')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── Panel toggle button (desktop) ── */}
        {(withTarimas || (!withTarimas && allUbicacionGroups.length > 0)) && (
          <div className="hidden lg:flex shrink-0 items-start pt-4 pr-1">
            <button
              type="button"
              onClick={() => setSidebarVisible(p => !p)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-500 shadow-sm transition-all hover:bg-warm-50 hover:text-sky-600"
              title={sidebarVisible ? 'Ocultar panel' : 'Mostrar panel'}
            >
              {sidebarVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        )}

        {/* ── Side panel (desktop lg+) ── */}
        {sidebarVisible && (withTarimas || (!withTarimas && allUbicacionGroups.length > 0)) && (
          <div className="hidden lg:flex w-80 flex-col border-l border-warm-100 bg-gradient-to-b from-white via-white to-sky-50/20 backdrop-blur-2xl shrink-0 animate-fade-in shadow-[-16px_0_34px_-28px_rgba(14,165,233,0.38)]">
            {withTarimas ? renderPanelBody() : renderUbicacionPanelBody()}
          </div>
        )}

      </div>

      {/* ── Mobile scan input ── */}
      <div className="sm:hidden shrink-0 bg-white border-t border-warm-100 px-3 py-2.5" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
        {/* Location input — shown when not in tarimas mode and ubicacion not yet confirmed */}
        {!withTarimas && !ubicacionConfirmed && (
          <div className="mb-2">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-400 pointer-events-none" />
              <input
                ref={locationRef}
                type="text"
                value={locationInputValue}
                onChange={e => setLocationInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); tryConfirmUbicacion(locationInputValue) } }}
                placeholder={t('rec.val.ubicacion.placeholder')}
                className="w-full pl-9 pr-16 py-2.5 text-sm border border-accent-300 rounded-xl bg-accent-50 focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder:text-accent-300"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() => tryConfirmUbicacion(locationInputValue)}
                  className="px-2 py-1 text-[11px] font-semibold bg-accent-600 text-white rounded-lg"
                >
                  {t('rec.val.ubicacion.confirm')}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => tryConfirmUbicacion('')}
              className="mt-1 text-[10px] text-warm-400 hover:text-warm-600 w-full text-center"
            >
              {t('rec.val.ubicacion.skip')}
            </button>
          </div>
        )}

        {/* Active ubicacion badge on mobile */}
        {!withTarimas && ubicacionConfirmed && (
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-accent-700 bg-accent-50 border border-accent-200 px-2 py-1 rounded-full">
              <MapPin size={10} />{selectedUbicacion || t('rec.val.ubicacion.skip')}
            </span>
            <button type="button" onClick={completarUbicacion} className="text-[10px] text-accent-600 hover:text-accent-800 font-medium">
              {t('rec.val.btn.completar')}
            </button>
          </div>
        )}

        <div className={`relative ${!withTarimas && !ubicacionConfirmed ? 'opacity-40 pointer-events-none' : ''}`}>
          <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-300 pointer-events-none" />
          <input ref={scanRefMobile} {...scanInputProps} />
        </div>
        <p className="text-center text-[10px] text-warm-400 mt-1.5">{t('rec.scan.enter_hint')}</p>
      </div>

      {/* ── Mobile tarimas bottom sheet ── */}
      <AnimatePresence>
        {withTarimas && mobilePanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobilePanelOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: '82dvh' }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-warm-200 rounded-full" />
              </div>

              {/* Close button row */}
              <div className="flex justify-end px-3 pb-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobilePanelOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {renderPanelBody()}

              {/* Safe area bottom padding */}
              <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} className="shrink-0" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Mobile ubicacion bottom sheet ── */}
      <AnimatePresence>
        {!withTarimas && mobileUbicacionPanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileUbicacionPanelOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: '82dvh' }}
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-warm-200 rounded-full" />
              </div>
              <div className="flex justify-end px-3 pb-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileUbicacionPanelOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {renderUbicacionPanelBody()}
              <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} className="shrink-0" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Tarima confirm modal ── */}
      <Modal
        isOpen={showTarimaConfirm}
        onClose={() => setShowTarimaConfirm(false)}
        title={t('rec.tarimas.toggle')}
        icon={Layers}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button onClick={() => setShowTarimaConfirm(false)} className="btn-ghost">{t('common.cancel')}</button>
            <button onClick={() => { setWithTarimas(true); setShowTarimaConfirm(false); refocus() }} className="btn-primary">
              {t('rec.tarimas.activar')} ({totalTarimas})
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-warm-700">
          <p>{t('rec.tarimas.confirm.desc1').replace('{n}', totalTarimas)}</p>
          <p>{t('rec.tarimas.confirm.desc2').replace('{n}', totalTarimas)}</p>
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {Array.from(tarimaMap.entries()).slice(0, 8).map(([base, num]) => {
              const tc = getTarimaColor(num)
              return (
                <div key={base} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${tc.pill}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${tc.bg} text-white`}>{num}</span>
                  <span className="font-mono text-xs truncate">{base}</span>
                </div>
              )
            })}
          </div>
          {tarimaMap.size > 8 && <p className="text-xs text-warm-400 text-center">+{tarimaMap.size - 8} más...</p>}
        </div>
      </Modal>

      {/* ── Duplicate scan block modal ── */}
      <Modal
        isOpen={dupModal.open}
        onClose={() => { setDupModal({ open: false, code: null, entry: null }); refocus() }}
        title={t('rec.val.dup.title')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex justify-end w-full">
            <button onClick={() => { setDupModal({ open: false, code: null, entry: null }); refocus() }} className="btn-primary">
              {t('rec.val.dup.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.val.dup.body')}</p>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 space-y-1.5">
            <p className="font-mono font-bold text-warning-800 text-base break-all">{dupModal.code}</p>
            {dupModal.entry?.scannedAt && (
              <p className="text-xs text-warning-700">
                <span className="font-semibold">{t('rec.val.dup.time')}:</span>{' '}
                {new Date(dupModal.entry.scannedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            )}
            {dupModal.entry?.scannedBy && dupModal.entry.scannedBy !== '—' && (
              <p className="text-xs text-warning-700">
                <span className="font-semibold">{t('rec.val.dup.user')}:</span>{' '}
                {dupModal.entry.scannedBy}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm modal ── */}
      <Modal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={t('rec.val.delete.title')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button onClick={() => setConfirmDeleteOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
            <button onClick={() => deleteLastMut.mutate()} disabled={deleteLastMut.isPending} className="btn-danger disabled:opacity-50">
              {deleteLastMut.isPending ? t('common.loading') : t('rec.val.delete.btn')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">{t('rec.val.delete.desc')}</p>
      </Modal>

      {/* ── Rejection blocking modal ── */}
      <Modal
        isOpen={rejectModal.open}
        onClose={() => { setRejectModal({ open: false, code: null }); refocus() }}
        title={t('rec.val.reject.title')}
        icon={XCircle}
        size="sm"
        footer={
          <div className="flex justify-end w-full">
            <button onClick={() => { setRejectModal({ open: false, code: null }); refocus() }} className="btn-danger">
              {t('rec.val.reject.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.val.reject.body')}</p>
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-3">
            <p className="font-mono font-bold text-danger-800 text-base break-all">{rejectModal.code}</p>
          </div>
          <p className="text-xs text-warm-500 leading-relaxed">{t('rec.val.reject.hint')}</p>
        </div>
      </Modal>

    </div>
  )
}
