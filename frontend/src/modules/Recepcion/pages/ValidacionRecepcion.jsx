import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ScanBarcode, CheckCircle2, XCircle, AlertCircle, AlertTriangle,
  Layers, PackageCheck, X, Square, ArrowUp, ArrowDown, ArrowUpDown, Trash2,
  ChevronDown, PanelRightClose, PanelRightOpen, Search, LayoutList, MapPin, Check, Edit3,
  ToggleLeft, ToggleRight, ArrowRightLeft,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getOrder, updateOrder, createSession, updateSession, scanCode, deleteLastValidationRecord, getScanEvents } from '../services/recepcionService'
import { extractBaseCode } from '../../Shared/Wms/extractBaseCode'

function buildTarimaMap(lines, groupOptions = null) {
  const basesInOrder = []
  const baseCounts = new Map()
  for (const line of lines) {
    const base = extractBaseCode(line.custom_box_barcode)
    if (!base) continue
    if (!baseCounts.has(base)) { baseCounts.set(base, 0); basesInOrder.push(base) }
    baseCounts.set(base, baseCounts.get(base) + 1)
  }
  const map = new Map()
  let tarimaNum = 1
  if (!groupOptions?.enabled) {
    for (const base of basesInOrder) map.set(base, tarimaNum++)
    return map
  }
  const { minCajas, maxCajas } = groupOptions
  // Large codes (>= minCajas) each get their own tarima first
  for (const base of basesInOrder) {
    if (baseCounts.get(base) >= minCajas) map.set(base, tarimaNum++)
  }
  // Small codes (< minCajas) get packed into group tarimas
  let groupCajas = 0
  let groupNum = tarimaNum
  for (const base of basesInOrder) {
    const count = baseCounts.get(base)
    if (count >= minCajas) continue
    // If adding this code would exceed maxCajas, start a new group tarima
    if (groupCajas > 0 && groupCajas + count > maxCajas) {
      tarimaNum++; groupNum = tarimaNum; groupCajas = 0
    }
    map.set(base, groupNum)
    groupCajas += count
    if (groupCajas >= maxCajas) {
      tarimaNum++; groupNum = tarimaNum; groupCajas = 0
    }
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
  correcto:       { bg: 'bg-success-50/90 border-success-200', icon: CheckCircle2,  iconCls: 'text-success-500', label: 'text-success-600', labelKey: 'rec.val.result.correcto' },
  duplicado:      { bg: 'bg-warning-50/90 border-warning-200', icon: AlertCircle,   iconCls: 'text-warning-500', label: 'text-warning-600', labelKey: 'rec.val.result.duplicado' },
  no_encontrado:  { bg: 'bg-danger-50/90  border-danger-200',  icon: XCircle,       iconCls: 'text-danger-500',  label: 'text-danger-600',  labelKey: 'rec.val.result.no_encontrado' },
  fuera_seccion:  { bg: 'bg-sky-50/90 border-sky-200',         icon: Layers,        iconCls: 'text-sky-500',     label: 'text-sky-600',     labelKey: 'rec.tarimas.sections.fuera_seccion' },
}

export default function ValidacionRecepcion() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18nStore()
  const toast = useToastStore()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const canDeleteScan = hasPermission('recepcion.recibir', 'actualizar')

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
  const [ubicacionFilter, setUbicacionFilter] = useState(null)
  const [expandedUbicaciones, setExpandedUbicaciones] = useState(new Set())

  // Sections mode (tarimas split by section)
  const [sectionMode, setSectionMode] = useState(false)
  const [maxTarimasPerSection, setMaxTarimasPerSection] = useState(20)
  const [heldCodes, setHeldCodes] = useState([])
  const [fueraSectionModal, setFueraSectionModal] = useState({ open: false, code: null, base: null, tarimaNum: null })
  const [prioritizedTarimas, setPrioritizedTarimas] = useState(() => new Set())

  // Grouping small codes
  const [groupSmallCodes, setGroupSmallCodes] = useState(false)
  const [minCajasParaAgrupar, setMinCajasParaAgrupar] = useState(3)
  const [maxCajasEnGrupo, setMaxCajasEnGrupo] = useState(10)

  // Tarima transfer
  const [tarimaTransferModal, setTarimaTransferModal] = useState({ open: false, fromNum: null, fromBases: [] })
  const [tarimaOverrides, setTarimaOverrides] = useState(() => new Map())
  const [transferToTarima, setTransferToTarima] = useState('')

  // Force close
  const [forceCloseOpen, setForceCloseOpen] = useState(false)

  const { data: orderData, isLoading } = useQuery({
    queryKey: ['recepcion-order', id],
    queryFn: () => getOrder(id),
    refetchInterval: scanning ? 4000 : false,
  })

  const { data: eventsData } = useQuery({
    queryKey: ['recepcion-scan-events', id],
    queryFn: () => getScanEvents(id),
    refetchInterval: scanning ? 6000 : false,
  })
  const serverEvents = eventsData?.events ?? []

  const order    = orderData?.order ?? null
  const lines    = orderData?.lines ?? []
  const total    = Math.max(Number(order?.total_cajas || 0), lines.length)
  const validadas  = Math.max(lines.filter(l => l.estado_validacion === 'validada').length, Number(order?.cajas_validadas || 0))
  const faltantes  = lines.filter(l => l.estado_validacion === 'faltante').length
  const pendientes = Math.max(total - validadas - faltantes, 0)
  const progressPct = total > 0 ? Math.min(100, Math.round((validadas / total) * 100)) : 0

  const baseTarimaMap = useMemo(
    () => buildTarimaMap(lines, groupSmallCodes ? { enabled: true, minCajas: minCajasParaAgrupar, maxCajas: maxCajasEnGrupo } : null),
    [lines, groupSmallCodes, minCajasParaAgrupar, maxCajasEnGrupo]
  )
  const effectiveTarimaMap = useMemo(() => {
    if (tarimaOverrides.size === 0) return baseTarimaMap
    const map = new Map(baseTarimaMap)
    for (const [base, num] of tarimaOverrides) map.set(base, num)
    return map
  }, [baseTarimaMap, tarimaOverrides])
  const totalTarimas = useMemo(() => new Set(effectiveTarimaMap.values()).size, [effectiveTarimaMap])

  const lastTarimaNum = useMemo(() => {
    if (!withTarimas || !lastResult?.code) return null
    const base = extractBaseCode(lastResult.code)
    return base ? (effectiveTarimaMap.get(base) ?? null) : null
  }, [withTarimas, lastResult, effectiveTarimaMap])

  const lastTarimaBase  = lastResult?.code ? extractBaseCode(lastResult.code) : null
  const lastTarimaColor = lastTarimaNum ? getTarimaColor(lastTarimaNum) : null

  const tarimaStats = useMemo(() => {
    if (!withTarimas) return []
    // Build linesByBase for O(n) lookup
    const linesByBase = new Map()
    for (const l of lines) {
      const base = extractBaseCode(l.custom_box_barcode)
      if (!base) continue
      if (!linesByBase.has(base)) linesByBase.set(base, [])
      linesByBase.get(base).push(l)
    }
    // Aggregate by tarima number (supports grouped tarimas with multiple bases)
    const byNum = new Map()
    for (const [base, num] of effectiveTarimaMap.entries()) {
      if (!byNum.has(num)) byNum.set(num, { num, bases: [], tarLines: [], color: getTarimaColor(num) })
      const entry = byNum.get(num)
      entry.bases.push(base)
      for (const l of (linesByBase.get(base) || [])) entry.tarLines.push(l)
    }
    return Array.from(byNum.values()).map(ts => ({
      ...ts,
      total: ts.tarLines.length,
      validated: ts.tarLines.filter(l => l.estado_validacion === 'validada').length,
    })).sort((a, b) => a.num - b.num)
  }, [withTarimas, effectiveTarimaMap, lines])

  const tarimaCounts = useMemo(() => ({
    completo:   tarimaStats.filter(ts => ts.validated === ts.total && ts.total > 0).length,
    pendiente:  tarimaStats.filter(ts => ts.validated === 0).length,
    en_proceso: tarimaStats.filter(ts => ts.validated > 0 && ts.validated < ts.total).length,
  }), [tarimaStats])

  // Dynamic active set: first N incomplete tarimas + any prioritized ones
  const activeTarimaSet = useMemo(() => {
    if (!sectionMode) return null
    const incomplete = tarimaStats.filter(ts => ts.validated < ts.total).map(ts => ts.num).sort((a, b) => a - b)
    const s = new Set(incomplete.slice(0, maxTarimasPerSection))
    for (const num of prioritizedTarimas) s.add(num)
    return s
  }, [sectionMode, tarimaStats, maxTarimasPerSection, prioritizedTarimas])

  const filteredTarimaStats = useMemo(() => {
    let result = tarimaStats
    const q = tarimaSearch.trim().toLowerCase()
    if (q) result = result.filter(ts => ts.bases.some(b => b.toLowerCase().includes(q)))
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

  const toggleUbicacion = useCallback((key) => {
    setExpandedUbicaciones(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  // Server events grouped by ubicacion (persists across page reloads / different computers)
  const allUbicacionGroups = useMemo(() => {
    const map = new Map()
    // Load from server events (source of truth)
    for (const ev of serverEvents) {
      if (ev.resultado !== 'correcto') continue
      const key = ev.ubicacion ?? ''
      const existing = map.get(key) ?? { ubicacion: ev.ubicacion || null, codes: [] }
      existing.codes.push({ id: ev.id, code: ev.codigo_escaneado, scannedAt: ev.scanned_at })
      map.set(key, existing)
    }
    // Merge current in-session history (optimistic — may not yet be in server events)
    const activeCodes = history.filter(h => h.result === 'correcto')
    if (activeCodes.length > 0) {
      const key = selectedUbicacion ?? ''
      const existing = map.get(key) ?? { ubicacion: selectedUbicacion, codes: [] }
      const serverIds = new Set(existing.codes.map(c => c.id))
      for (const h of activeCodes) {
        if (!serverIds.has(h.id)) existing.codes.push({ id: h.id, code: h.code, scannedAt: h.scannedAt })
      }
      map.set(key, existing)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.ubicacion) return 1
      if (!b.ubicacion) return -1
      return a.ubicacion.localeCompare(b.ubicacion)
    })
  }, [serverEvents, history, selectedUbicacion])

  const filteredUbicacionGroups = useMemo(() => {
    let result = allUbicacionGroups
    if (ubicacionFilter === 'activa') result = result.filter(g => g.ubicacion === selectedUbicacion && ubicacionConfirmed)
    if (ubicacionFilter === 'con_registros') result = result.filter(g => g.codes.length > 0)
    const q = ubicacionSearch.trim().toLowerCase()
    const sortActive = (arr) => [...arr].sort((a, b) => {
      const aA = a.ubicacion === selectedUbicacion && ubicacionConfirmed
      const bA = b.ubicacion === selectedUbicacion && ubicacionConfirmed
      return aA === bA ? 0 : aA ? -1 : 1
    })
    if (!q) return sortActive(result)
    return sortActive(result
      .map(g => ({
        ...g,
        codes: g.codes.filter(c =>
          c.code.toLowerCase().includes(q) ||
          (g.ubicacion ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.codes.length > 0 || (g.ubicacion ?? '').toLowerCase().includes(q))
    )
  }, [allUbicacionGroups, ubicacionSearch, ubicacionFilter, selectedUbicacion, ubicacionConfirmed])

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
      if (ev.resultado === 'duplicado') {
        playDupAudio()
        setDupModal({ open: true, code: ev.codigo_escaneado, entry: { scannedAt: null, scannedBy: '—' } })
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

  const forceCloseMut = useMutation({
    mutationFn: () => updateOrder(id, { estado: 'completo' }),
    onSuccess: () => {
      toast.success(t('rec.val.forceClose.success'))
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      setForceCloseOpen(false)
      navigate('/recepcion/recibir')
    },
    onError: () => toast.error(t('toast.error')),
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
      // Also check server events for cross-session / cross-computer duplicates
      const serverDup = serverEvents.find(ev => ev.resultado === 'correcto' && ev.codigo_escaneado === code)
      if (serverDup) {
        playDupAudio()
        setDupModal({ open: true, code, entry: { scannedAt: serverDup.scanned_at, scannedBy: serverDup.scanned_by_nombre || '—' } })
        refocus()
        return
      }
      if (withTarimas && sectionMode && activeTarimaSet) {
        const base = extractBaseCode(code)
        const tarimaNum = base ? effectiveTarimaMap.get(base) : null
        if (tarimaNum && !activeTarimaSet.has(tarimaNum)) {
          setFueraSectionModal({ open: true, code, base, tarimaNum })
          refocus()
          return
        }
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
    setTimeout(() => locationRef.current?.focus(), 150)
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

  // Ubicacion panel — DropScan-quality design
  const ubFilterChips = [
    { key: null,            label: t('common.all'),           count: allUbicacionGroups.length },
    { key: 'activa',        label: t('rec.val.ubicacion.filter.activa'),        count: ubicacionConfirmed ? 1 : 0 },
    { key: 'con_registros', label: t('rec.val.ubicacion.filter.con_registros'), count: allUbicacionGroups.filter(g => g.codes.length > 0).length },
  ]

  const renderUbicacionPanelBody = () => (
    <>
      {/* ── Panel header ── */}
      <div className="px-4 pt-3.5 pb-3 border-b border-primary-100/60 bg-white/95 space-y-2.5 shrink-0">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-warm-700">
            {t('rec.val.ubicacion.panel.title')}
            <span className="ml-1.5 badge bg-primary-100 text-primary-700 border-0 text-[9px]">{allUbicacionGroups.length}</span>
          </h4>
          <span className="text-[10px] font-semibold text-warm-400 tabular-nums">
            {totalUbicacionCodes} escaneos
          </span>
        </div>

        {/* Active ubicación card — above search (mirrors Surtido active order card) */}
        {ubicacionConfirmed && (
          <div className="rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-white to-accent-50/60 shadow-[0_14px_30px_-22px_rgba(37,99,235,0.45)] ring-1 ring-primary-100/80 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="w-7 h-7 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                <MapPin className="w-3.5 h-3.5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-black text-primary-800 truncate">
                  {selectedUbicacion || <span className="text-primary-400 font-semibold">{t('rec.val.ubicacion.panel.sin_ub')}</span>}
                </p>
                <p className="text-[10px] text-primary-400 mt-0.5 tabular-nums">
                  {history.filter(h => h.result === 'correcto').length} {t('rec.val.ubicacion.lote_actual')}
                </p>
              </div>
              <span className="badge bg-primary-100 text-primary-700 text-[9px] shrink-0">{t('rec.val.ubicacion.badge')}</span>
              <button
                type="button"
                onClick={() => { setUbicacionConfirmed(false); setLocationInputValue(selectedUbicacion || ''); setTimeout(() => locationRef.current?.focus(), 80) }}
                className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                title={t('rec.val.ubicacion.edit')}
              >
                <Edit3 size={12} />
              </button>
            </div>
            {history.filter(h => h.result === 'correcto').length > 0 && (
              <div className="px-3 pb-2.5">
                <button
                  type="button"
                  onClick={completarUbicacion}
                  className="w-full py-1.5 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3 h-3" />
                  {t('rec.val.btn.completar')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Filter chips — grid segmented control (mirrors Surtido's pattern) */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-primary-100/70 bg-gradient-to-br from-primary-50/85 via-white to-white p-1.5 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.45)]">
          {ubFilterChips.map(chip => {
            const isOn = ubicacionFilter === chip.key
            return (
              <button
                key={String(chip.key)}
                type="button"
                onClick={() => setUbicacionFilter(isOn ? null : chip.key)}
                className={`w-full min-w-0 px-1 py-1.5 h-8 rounded-xl text-[10px] font-semibold border transition-all flex items-center justify-center gap-0.5 overflow-hidden ${
                  isOn
                    ? 'bg-white text-primary-700 border-primary-200 shadow-sm ring-1 ring-primary-100'
                    : 'bg-white/75 text-warm-500 border-transparent hover:border-warm-200 hover:bg-warm-50'
                }`}
              >
                <span className="truncate">{chip.label}</span>
                <span className={`text-[9px] font-bold tabular-nums shrink-0 ${isOn ? 'text-primary-400' : 'text-warm-400'}`}>{chip.count}</span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 rounded-2xl border border-primary-100/80 bg-gradient-to-r from-white via-primary-50/55 to-white px-3 h-10 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.4)] transition-all focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100/80 shadow-inner shrink-0">
            <Search className="w-3 h-3 text-primary-500" />
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

        {(ubicacionSearch || ubicacionFilter) && (
          <p className="text-[10px] text-warm-400 text-right leading-none">
            {filteredUbicacionGroups.length} de {allUbicacionGroups.length}
          </p>
        )}
      </div>

      {/* ── Card list ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-warm-50/55 p-3 space-y-2.5">
        {filteredUbicacionGroups.length === 0 ? (
          <div className="py-10 text-center space-y-1.5">
            <MapPin className="w-7 h-7 text-warm-200 mx-auto" />
            <p className="text-xs text-warm-400">
              {ubicacionSearch || ubicacionFilter
                ? t('rec.val.ubicacion.panel.no_results')
                : t('rec.val.ubicacion.panel.sin_registros')}
            </p>
          </div>
        ) : filteredUbicacionGroups.map((g) => {
          const isActive = g.ubicacion === selectedUbicacion && ubicacionConfirmed
          const maxCodes = totalUbicacionCodes > 0 ? Math.max(...allUbicacionGroups.map(x => x.codes.length)) : 1
          const pct = maxCodes > 0 ? Math.round((g.codes.length / maxCodes) * 100) : 0
          const cardKey = g.ubicacion ?? '__sin__'
          const isExpanded = expandedUbicaciones.has(cardKey)
          return (
            <div
              key={cardKey}
              className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                isActive
                  ? 'border-primary-200/80 bg-gradient-to-br from-primary-50 via-white to-accent-50/60 shadow-[0_18px_34px_-18px_rgba(37,99,235,0.45)] ring-1 ring-primary-100/80'
                  : 'border-warm-200/90 bg-white hover:border-primary-100 hover:bg-gradient-to-br hover:from-white hover:to-primary-50/30 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.12)]'
              }`}
            >
              {/* Card header — clickable to expand/collapse */}
              <button
                type="button"
                onClick={() => toggleUbicacion(cardKey)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-primary-100' : 'bg-warm-100'}`}>
                  <MapPin className={`w-3 h-3 ${isActive ? 'text-primary-600' : 'text-warm-400'}`} />
                </div>
                <span className={`text-xs font-bold font-mono truncate flex-1 ${isActive ? 'text-primary-800' : 'text-warm-800'}`}>
                  {g.ubicacion || t('rec.val.ubicacion.panel.sin_ub')}
                </span>
                {isActive
                  ? <span className="badge bg-primary-100 text-primary-700 text-[9px] border-0 shrink-0">{t('rec.val.ubicacion.badge')}</span>
                  : <span className="badge bg-warm-50 text-warm-600 border border-warm-100 text-[9px] shrink-0">{g.codes.length}</span>
                }
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isExpanded ? '-rotate-180' : ''} ${isActive ? 'text-primary-400' : 'text-warm-300'}`} />
              </button>

              {/* Progress bar — always visible */}
              <div className="px-3 pb-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium ${isActive ? 'text-primary-600' : 'text-warm-400'}`}>
                    {g.codes.length} escaneos
                  </span>
                </div>
                <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isActive ? 'bg-gradient-to-r from-primary-400 to-primary-500' : 'bg-gradient-to-r from-primary-200 to-primary-300'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Expandable code list */}
              {isExpanded && g.codes.length > 0 && (
                <div className={`border-t ${isActive ? 'border-primary-100' : 'border-warm-100'} divide-y divide-warm-50 max-h-36 overflow-y-auto`}>
                  {g.codes.map((c, ci) => (
                    <div key={c.id || ci} className="flex items-center gap-2 px-3 py-1.5 hover:bg-primary-50/30 transition-colors">
                      <Check className="w-2.5 h-2.5 shrink-0 text-success-400" />
                      <span className="font-mono text-[10px] truncate flex-1 text-warm-600">{c.code}</span>
                      {c.scannedAt && (
                        <span className="text-[9px] tabular-nums shrink-0 text-warm-300">
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

        {/* Section mode status bar */}
        {sectionMode && activeTarimaSet && (
          <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-sky-700">{t('rec.tarimas.sections.activas')} ({activeTarimaSet.size})</span>
              {heldCodes.length > 0 && (
                <span className="badge bg-warning-100 text-warning-700 border-0 text-[9px]">{heldCodes.length} {t('rec.tarimas.sections.held')}</span>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {Array.from(activeTarimaSet).sort((a, b) => a - b).map(num => {
                const ts = tarimaStats.find(s => s.num === num)
                const color = getTarimaColor(num)
                const pct = ts && ts.total > 0 ? Math.round((ts.validated / ts.total) * 100) : 0
                return (
                  <span key={num} className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${color.pill}`}>
                    T{num} {ts ? `${pct}%` : ''}
                  </span>
                )
              })}
            </div>
          </div>
        )}

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
                  : sectionMode && activeTarimaSet && activeTarimaSet.has(ts.num)
                    ? 'border-sky-200/80 bg-white ring-1 ring-sky-100 shadow-[0_16px_32px_-22px_rgba(14,165,233,0.3)]'
                    : 'border-warm-200/90 bg-white hover:border-sky-100 hover:bg-gradient-to-br hover:from-white hover:to-sky-50/30 hover:shadow-[0_20px_38px_-26px_rgba(14,165,233,0.35)]'
              }`}
            >
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggleTarima(ts.num)}
                  className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left min-w-0"
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                    isActive ? 'bg-white/25 text-white' : ts.color.pill
                  }`}>{ts.num}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-mono text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-warm-800'}`}>
                      {ts.bases[0]}
                      {ts.bases.length > 1 && (
                        <span className={`ml-1 text-[9px] font-bold ${isActive ? 'text-white/60' : 'text-warm-400'}`}>+{ts.bases.length - 1}</span>
                      )}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/70' : 'text-warm-400'}`}>{ts.validated}/{ts.total}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className={`text-xs font-bold tabular-nums ${isActive ? 'text-white' : 'text-warm-600'}`}>{pct}%</span>
                    {isActive && (
                      <span className="badge text-[9px] bg-white/25 text-white border-0">ACTIVA</span>
                    )}
                    {!isActive && sectionMode && activeTarimaSet?.has(ts.num) && (
                      <span className="badge text-[9px] bg-sky-100 text-sky-700 border-0">EN SEC.</span>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isExpanded ? '-rotate-180' : ''} ${isActive ? 'text-white/60' : 'text-warm-300'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => { setTarimaTransferModal({ open: true, fromNum: ts.num, fromBases: ts.bases }); setTransferToTarima('') }}
                  className={`p-2 mr-2 rounded-lg transition-colors shrink-0 ${isActive ? 'text-white/60 hover:bg-white/20 hover:text-white' : 'text-warm-300 hover:text-primary-600 hover:bg-primary-50'}`}
                  title={t('rec.tarimas.transfer.btn')}
                >
                  <ArrowRightLeft size={11} />
                </button>
              </div>

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
              data-tour="rec-tarimas-toggle"
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
                withTarimas ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-warm-200 text-warm-500 hover:bg-warm-50'
              }`}
            >
              {withTarimas
                ? <ToggleRight className="w-4 h-4 text-primary-600 shrink-0" />
                : <ToggleLeft className="w-4 h-4 text-warm-400 shrink-0" />
              }
              <span className="hidden sm:inline">{withTarimas ? t('rec.tarimas.n_tarimas').replace('{n}', totalTarimas) : t('rec.tarimas.toggle')}</span>
              {withTarimas && <span className="sm:hidden">{totalTarimas}T</span>}
            </button>
            {/* Ubicacion panel button (when not in tarimas mode) */}
            {!withTarimas && allUbicacionGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileUbicacionPanelOpen(true)}
                className="lg:hidden flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-700 transition-colors"
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
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-primary-300 bg-primary-600 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('rec.val.btn.completar')}</span>
                <span className="sm:hidden">OK</span>
              </button>
            )}
            {/* Force close */}
            <button
              type="button"
              onClick={() => setForceCloseOpen(true)}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-warning-200 text-xs font-semibold text-warning-600 hover:bg-warning-50 transition-colors"
              title={t('rec.val.forceClose.title')}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('rec.val.forceClose.btn')}</span>
            </button>
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

            {/* ── Desktop scan input ── */}
            <div className={`hidden sm:block card p-3 sm:p-4 sticky top-0 z-[11] bg-gradient-to-br from-sky-50/40 via-white to-white border-sky-100 shadow-[0_6px_22px_-12px_rgba(14,165,233,0.22)] backdrop-blur-sm ${!withTarimas && !ubicacionConfirmed ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="relative">
                <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sky-500 pointer-events-none" />
                <input ref={scanRefDesktop} {...scanInputProps} className="w-full pl-12 pr-4 py-3.5 text-lg bg-sky-50/30 border-2 border-sky-100 rounded-2xl focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide text-warm-900" />
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
                        {lastResult.result === 'fuera_seccion' && lastResult.tarimaNum && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-700 border border-sky-200">
                            T{lastResult.tarimaNum} → S{Math.ceil(lastResult.tarimaNum / maxTarimasPerSection)}
                          </span>
                        )}
                        {withTarimas && lastResult.result !== 'fuera_seccion' && lastTarimaNum && lastTarimaColor && sidebarVisible && (
                          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${lastTarimaColor.pill}`}>
                            T{lastTarimaNum}
                          </span>
                        )}
                        {!withTarimas && selectedUbicacion && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary-100 text-primary-700 border border-primary-200">
                            <MapPin size={8} />{selectedUbicacion}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })()}
            </AnimatePresence>

            {/* ── Ubicación — unified card: input → summary in one block ── */}
            {!withTarimas && (() => {
              const batchCount = history.filter(h => h.result === 'correcto').length
              return (
                <div className="hidden sm:block card overflow-hidden border border-accent-100 z-[10] bg-white/97 backdrop-blur-sm">
                  {!ubicacionConfirmed ? (
                    /* ─── INPUT MODE ─── */
                    <div className="p-3">
                      <p className="text-[11px] font-bold text-accent-700 mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" />
                        {t('rec.val.ubicacion.label')}
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent-400 pointer-events-none" />
                          <input
                            ref={locationRef}
                            type="text"
                            value={locationInputValue}
                            onChange={e => setLocationInputValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') tryConfirmUbicacion(locationInputValue) }}
                            placeholder={t('rec.val.ubicacion.placeholder')}
                            className="w-full pl-9 pr-3 py-2.5 border border-accent-200 rounded-xl text-sm font-mono focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 transition-all bg-white"
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
                          className="px-4 py-2 rounded-xl bg-accent-600 text-white text-sm font-semibold hover:bg-accent-700 disabled:opacity-40 transition-colors"
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
                    </div>
                  ) : (
                    /* ─── SUMMARY MODE ─── */
                    <>
                      {/* Compact header: edit btn on left + location name + ACTIVA badge + confirm */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-accent-50/70 border-b border-accent-100">
                        <button
                          type="button"
                          onClick={() => { setUbicacionConfirmed(false); setLocationInputValue(selectedUbicacion || ''); setTimeout(() => locationRef.current?.focus(), 80) }}
                          className="flex items-center gap-1 text-accent-600 hover:text-accent-800 hover:bg-accent-100 transition-colors rounded-lg px-1.5 py-1 text-[10px] font-semibold shrink-0"
                          title={t('rec.val.ubicacion.edit')}
                        >
                          <Edit3 size={11} />
                          <span>{t('rec.val.ubicacion.edit')}</span>
                        </button>
                        <div className="w-px h-4 bg-accent-200 shrink-0" />
                        <div className="w-4 h-4 rounded-md bg-accent-100 flex items-center justify-center shrink-0">
                          <MapPin className="w-2.5 h-2.5 text-accent-600" />
                        </div>
                        <span className="font-mono text-sm font-black text-accent-800 leading-none truncate flex-1">
                          {selectedUbicacion || <span className="text-accent-400 font-semibold text-xs">{t('rec.val.ubicacion.panel.sin_ub')}</span>}
                        </span>
                        <span className="badge bg-accent-600 text-white text-[9px] font-bold border-0 shrink-0">{t('rec.val.ubicacion.badge')}</span>
                        {batchCount > 0 && (
                          <button
                            type="button"
                            onClick={completarUbicacion}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent-600 text-white text-[10px] font-semibold hover:bg-accent-700 transition-colors shrink-0"
                          >
                            <Check className="w-3 h-3" />
                            <span className="hidden md:inline">{t('rec.val.btn.completar')}</span>
                          </button>
                        )}
                      </div>
                      {/* Counters + history table */}
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="text-center py-1.5 rounded-xl bg-warm-50 border border-warm-100">
                            <p className="text-xl font-black text-warm-800 tabular-nums leading-none">{batchCount}</p>
                            <p className="text-[9px] text-warm-400 uppercase tracking-wide font-bold mt-0.5">{t('rec.val.ubicacion.lote_actual')}</p>
                          </div>
                          <div className="text-center py-1.5 rounded-xl bg-warm-50 border border-warm-100">
                            <p className="text-xl font-black text-warm-800 tabular-nums leading-none">{totalUbicacionCodes}</p>
                            <p className="text-[9px] text-warm-400 uppercase tracking-wide font-bold mt-0.5">{t('common.total')}</p>
                          </div>
                          <div className="text-center py-1.5 rounded-xl bg-warm-50 border border-warm-100">
                            <p className="text-xl font-black text-warm-800 tabular-nums leading-none">{allUbicacionGroups.length}</p>
                            <p className="text-[9px] text-warm-400 uppercase tracking-wide font-bold mt-0.5">{t('rec.val.ubicacion.count')}</p>
                          </div>
                        </div>
                        {sortedHistory.length > 0 && (
                          <div className="overflow-hidden rounded-xl border border-warm-100">
                            <div className="overflow-y-auto max-h-44">
                              <table className="w-full text-xs">
                                <thead className="bg-warm-50 sticky top-0 border-b border-warm-100 z-[1]">
                                  <tr>
                                    <th className="table-header py-1.5 text-[10px]">{t('rec.scan.col.hora')}</th>
                                    <th className="table-header py-1.5 text-[10px]">{t('rec.scan.col.codigo')}</th>
                                    <th className="table-header py-1.5 text-[10px]">{t('rec.scan.col.resultado')}</th>
                                    <th className="table-header py-1.5 text-[10px] text-right">{t('common.actions')}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-warm-50">
                                  {sortedHistory.map((h, i) => {
                                    const cfg = RESULT_CFG[h.result] || RESULT_CFG.no_encontrado
                                    const Icon = cfg.icon
                                    return (
                                      <tr key={h.id || i} className="hover:bg-primary-100 transition-colors">
                                        <td className="px-3 py-1.5 text-warm-400 tabular-nums whitespace-nowrap text-[10px]">
                                          {h.scannedAt ? new Date(h.scannedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono font-semibold text-warm-800 max-w-[180px] truncate text-[11px]">{h.code}</td>
                                        <td className="px-3 py-1.5">
                                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                                            h.result === 'correcto' ? 'bg-success-50 text-success-600' :
                                            h.result === 'duplicado' ? 'bg-warning-50 text-warning-600' :
                                            'bg-danger-50 text-danger-600'
                                          }`}>
                                            <Icon className="w-2.5 h-2.5 shrink-0" />
                                            {cfg.labelText}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-right">
                                          {canDeleteScan && (
                                            <button
                                              type="button"
                                              onClick={() => setConfirmDeleteOpen(true)}
                                              disabled={i !== 0 || h.result !== 'correcto' || deleteLastMut.isPending}
                                              className="p-1 rounded-md text-danger-500 hover:bg-danger-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                              title={t('rec.val.delete.tooltip')}
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
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
                    </>
                  )}
                </div>
              )
            })()}

            {/* ── Scan history (mobile only — desktop shows in ubicación card) ── */}
            {history.length > 0 && (
              <div className="sm:hidden card overflow-hidden">
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
                        const tarimaNum = withTarimas && base ? (effectiveTarimaMap.get(base) ?? null) : null
                        const tc = tarimaNum ? getTarimaColor(tarimaNum) : null
                        return (
                          <tr key={h.id || i} className="hover:bg-primary-100 transition-colors">
                            <td className="px-3 py-2 text-warm-400 tabular-nums">{sortedHistory.length - i}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-warm-800 max-w-[180px] truncate">{h.code}</td>
                            <td className="px-3 py-2 text-warm-500 font-mono">{h.sku || '—'}</td>
                            <td className="px-3 py-2 text-warm-500 whitespace-nowrap">
                              {h.scannedAt ? new Date(h.scannedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                            </td>
                            {!withTarimas && (
                              <td className="px-3 py-2">
                                {h.ubicacion
                                  ? <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
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
                              {canDeleteScan && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteOpen(true)}
                                  disabled={i !== 0 || deleteLastMut.isPending}
                                  className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={t('rec.val.delete.tooltip')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
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
        {(withTarimas || !withTarimas) && (
          <div className="hidden lg:flex shrink-0 items-start pt-4 pr-1">
            <button
              type="button"
              onClick={() => setSidebarVisible(p => !p)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-500 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600"
              title={sidebarVisible ? 'Ocultar panel' : 'Mostrar panel'}
            >
              {sidebarVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        )}

        {/* ── Side panel (desktop lg+) ── */}
        {sidebarVisible && (
          <div className={`hidden lg:flex w-[400px] flex-col border-l border-warm-100 backdrop-blur-2xl shrink-0 animate-fade-in ${
            withTarimas
              ? 'bg-gradient-to-b from-white via-white to-sky-50/20 shadow-[-16px_0_34px_-28px_rgba(14,165,233,0.38)]'
              : 'bg-gradient-to-b from-white via-white to-primary-50/20 shadow-[-16px_0_34px_-28px_rgba(37,99,235,0.38)]'
          }`}>
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
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 pointer-events-none" />
              <input
                ref={locationRef}
                type="text"
                value={locationInputValue}
                onChange={e => setLocationInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); tryConfirmUbicacion(locationInputValue) } }}
                placeholder={t('rec.val.ubicacion.placeholder')}
                className="w-full pl-9 pr-16 py-2.5 text-sm border border-primary-200 rounded-xl bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder:text-primary-300"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() => tryConfirmUbicacion(locationInputValue)}
                  className="px-2 py-1 text-[11px] font-semibold bg-primary-600 text-white rounded-lg"
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
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-2 py-1 rounded-full flex-1 min-w-0 truncate">
              <MapPin size={10} className="shrink-0" />{selectedUbicacion || t('rec.val.ubicacion.skip')}
            </span>
            <button
              type="button"
              onClick={() => { setUbicacionConfirmed(false); setLocationInputValue(selectedUbicacion || ''); setTimeout(() => locationRef.current?.focus(), 80) }}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-warm-400 hover:text-primary-600 shrink-0"
            >
              <Edit3 size={11} />
              <span>{t('rec.val.ubicacion.edit')}</span>
            </button>
            <button type="button" onClick={completarUbicacion} className="text-[10px] text-primary-600 hover:text-primary-800 font-semibold shrink-0">
              {t('rec.val.btn.completar')}
            </button>
          </div>
        )}

        <div className={`relative ${!withTarimas && !ubicacionConfirmed ? 'opacity-40 pointer-events-none' : ''}`}>
          <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sky-500 pointer-events-none" />
          <input ref={scanRefMobile} {...scanInputProps} className="w-full pl-12 pr-4 py-3.5 text-lg bg-sky-50/30 border-2 border-sky-100 rounded-2xl focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide text-warm-900" />
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
            {Array.from(baseTarimaMap.entries()).slice(0, 8).map(([base, num]) => {
              const tc = getTarimaColor(num)
              return (
                <div key={base} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${tc.pill}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${tc.bg} text-white`}>{num}</span>
                  <span className="font-mono text-xs truncate">{base}</span>
                </div>
              )
            })}
          </div>
          {baseTarimaMap.size > 8 && <p className="text-xs text-warm-400 text-center">+{baseTarimaMap.size - 8} más...</p>}
          {/* Section mode toggle */}
          <div className="mt-1 rounded-xl border border-warm-100 bg-warm-50 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-warm-800">{t('rec.tarimas.sections.enable')}</p>
                <p className="text-[11px] text-warm-500 leading-tight">{t('rec.tarimas.sections.desc')}</p>
              </div>
              <button
                type="button"
                onClick={() => setSectionMode(p => !p)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${sectionMode ? 'bg-primary-600' : 'bg-warm-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${sectionMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {sectionMode && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-warm-600 flex-1">{t('rec.tarimas.sections.max_per_section')}</label>
                <input
                  type="number"
                  min="1"
                  max={totalTarimas || 99}
                  value={maxTarimasPerSection}
                  onChange={e => setMaxTarimasPerSection(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center text-sm border border-warm-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100"
                />
              </div>
            )}
          </div>

          {/* Group small codes toggle */}
          <div className="rounded-xl border border-warm-100 bg-warm-50 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-warm-800">{t('rec.tarimas.group.enable')}</p>
                <p className="text-[11px] text-warm-500 leading-tight">{t('rec.tarimas.group.desc')}</p>
              </div>
              <button
                type="button"
                onClick={() => setGroupSmallCodes(p => !p)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${groupSmallCodes ? 'bg-primary-600' : 'bg-warm-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${groupSmallCodes ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {groupSmallCodes && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-warm-600 flex-1">{t('rec.tarimas.group.min_cajas')}</label>
                  <input
                    type="number"
                    min="1"
                    value={minCajasParaAgrupar}
                    onChange={e => setMinCajasParaAgrupar(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center text-sm border border-warm-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-warm-600 flex-1">{t('rec.tarimas.group.max_cajas')}</label>
                  <input
                    type="number"
                    min="1"
                    value={maxCajasEnGrupo}
                    onChange={e => setMaxCajasEnGrupo(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center text-sm border border-warm-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100"
                  />
                </div>
                <p className="text-[10px] text-warm-400">
                  {t('rec.tarimas.group.preview').replace('{min}', minCajasParaAgrupar).replace('{max}', maxCajasEnGrupo)}
                </p>
              </div>
            )}
          </div>
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

      {/* ── Force close modal ── */}
      <Modal
        isOpen={forceCloseOpen}
        onClose={() => setForceCloseOpen(false)}
        title={t('rec.val.forceClose.title')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button onClick={() => setForceCloseOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
            <button onClick={() => forceCloseMut.mutate()} disabled={forceCloseMut.isPending} className="btn-danger disabled:opacity-50">
              {forceCloseMut.isPending ? t('common.loading') : t('rec.val.forceClose.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.val.forceClose.desc')}</p>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3">
            <p className="text-xs font-semibold text-warning-800">{t('rec.val.forceClose.hint')}</p>
          </div>
        </div>
      </Modal>

      {/* ── Fuera de sección blocking modal ── */}
      <Modal
        isOpen={fueraSectionModal.open}
        onClose={() => { setFueraSectionModal({ open: false, code: null, base: null, tarimaNum: null }); refocus() }}
        title={t('rec.tarimas.sections.bloqueado.title')}
        icon={Layers}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button
              onClick={() => {
                setHeldCodes(prev => [...prev.filter(h => h.code !== fueraSectionModal.code), { code: fueraSectionModal.code, base: fueraSectionModal.base, tarimaNum: fueraSectionModal.tarimaNum }])
                setFueraSectionModal({ open: false, code: null, base: null, tarimaNum: null })
                refocus()
              }}
              className="btn-ghost"
            >
              {t('rec.tarimas.sections.bloqueado.retener')}
            </button>
            <button
              onClick={() => {
                const { code, tarimaNum } = fueraSectionModal
                setPrioritizedTarimas(prev => { const next = new Set(prev); next.add(tarimaNum); return next })
                setFueraSectionModal({ open: false, code: null, base: null, tarimaNum: null })
                scanMut.mutate({ codigo: code, ubicacion: selectedUbicacion })
              }}
              className="btn-primary"
            >
              {t('rec.tarimas.sections.bloqueado.priorizar')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.tarimas.sections.bloqueado.desc')}</p>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2">
            <div className="flex items-center gap-3">
              {fueraSectionModal.tarimaNum && (
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${getTarimaColor(fueraSectionModal.tarimaNum).pill}`}>
                  T{fueraSectionModal.tarimaNum}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold text-sky-800 break-all">{fueraSectionModal.code}</p>
                {fueraSectionModal.base && <p className="text-xs text-sky-500 font-mono">{fueraSectionModal.base}</p>}
              </div>
            </div>
            {activeTarimaSet && activeTarimaSet.size > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-sky-600 mb-1">{t('rec.tarimas.sections.activas')}:</p>
                <div className="flex gap-1 flex-wrap">
                  {Array.from(activeTarimaSet).sort((a, b) => a - b).map(num => {
                    const color = getTarimaColor(num)
                    return <span key={num} className={`badge text-[9px] font-bold ${color.pill}`}>T{num}</span>
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Tarima transfer modal ── */}
      <Modal
        isOpen={tarimaTransferModal.open}
        onClose={() => { setTarimaTransferModal({ open: false, fromNum: null, fromBases: [] }); setTransferToTarima('') }}
        title={t('rec.tarimas.transfer.title')}
        icon={ArrowRightLeft}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button
              onClick={() => { setTarimaTransferModal({ open: false, fromNum: null, fromBases: [] }); setTransferToTarima('') }}
              className="btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => {
                const toNum = parseInt(transferToTarima)
                if (!toNum || toNum === tarimaTransferModal.fromNum) return
                setTarimaOverrides(prev => {
                  const next = new Map(prev)
                  for (const base of tarimaTransferModal.fromBases) next.set(base, toNum)
                  return next
                })
                setTarimaTransferModal({ open: false, fromNum: null, fromBases: [] })
                setTransferToTarima('')
              }}
              disabled={!transferToTarima || parseInt(transferToTarima) === tarimaTransferModal.fromNum}
              className="btn-primary disabled:opacity-50"
            >
              {t('rec.tarimas.transfer.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.tarimas.transfer.desc')}</p>
          <div className="rounded-xl border border-warm-200 bg-warm-50 p-3 space-y-1">
            <p className="text-[10px] font-semibold text-warm-500 mb-1">
              T{tarimaTransferModal.fromNum} — {tarimaTransferModal.fromBases.length} {t('rec.tarimas.transfer.bases')}
            </p>
            {tarimaTransferModal.fromBases.map(base => (
              <p key={base} className="font-mono text-xs text-warm-700">{base}</p>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold text-warm-600 block mb-1.5">{t('rec.tarimas.transfer.to')}</label>
            <select
              value={transferToTarima}
              onChange={e => setTransferToTarima(e.target.value)}
              className="w-full text-sm border border-warm-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 bg-white"
            >
              <option value="">{t('rec.tarimas.transfer.to_placeholder')}</option>
              {tarimaStats.filter(ts => ts.num !== tarimaTransferModal.fromNum).map(ts => (
                <option key={ts.num} value={ts.num}>
                  T{ts.num} — {ts.bases[0]}{ts.bases.length > 1 ? ` +${ts.bases.length - 1}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
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
