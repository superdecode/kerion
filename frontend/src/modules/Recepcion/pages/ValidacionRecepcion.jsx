import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ScanBarcode, CheckCircle2, XCircle, AlertCircle, AlertTriangle,
  Layers, PackageCheck, X, Square, ArrowUp, ArrowDown, ArrowUpDown, Trash2,
  ChevronDown, PanelRightClose, PanelRightOpen, Search, LayoutList, MapPin, Check, Edit3,
  ArrowRightLeft, WifiOff, Loader2, XOctagon,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import OfflineBlockedModal from '../../../core/components/common/OfflineBlockedModal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import ValidationModeSelectorModal from '../components/ValidationModeSelectorModal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useOfflineStore } from '../../../core/stores/offlineStore'
import { playSound, initAudio } from '../../Shared/Wms/playSound'
import { getOrder, updateOrder, createSession, updateSession, scanCode, deleteLastValidationRecord, deleteScanEvent, deleteLocationScans, getScanEvents, relocateScanEvents, updateScanEventLocation, getNovedadTipos, createNovedad, markScanEventAsNovedad, markScanEventsAsNovedadBulk, searchByCode } from '../services/recepcionService'
import { useRecepcionEscanearStore } from '../stores/recepcionEscanearStore'
import { extractBaseCode } from '../../Shared/Wms/extractBaseCode'
import { generateCodeVariations, normalizeScanCode } from '../../Shared/Wms/normalizeCode'
import { STALE } from '../../../core/constants/queryConfig'

const VALIDATION_LARGE_ORDER_THRESHOLD = 5000
const VALIDATION_DEFAULT_LINES_LIMIT = 3000
const VALIDATION_LARGE_ORDER_LINES_LIMIT = 50000
const VALIDATION_DEFAULT_EVENTS_LIMIT = 2000
const VALIDATION_LARGE_ORDER_EVENTS_LIMIT = 50000
const VALIDATION_HEAVY_REQUEST_TIMEOUT_MS = 120000
// Keep each database read below the backend's 12s query deadline.
const VALIDATION_LARGE_ORDER_CHUNK_SIZE = 500

function parseTarimaNumber(value) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/^T\s*/, '')
  const num = Number.parseInt(normalized, 10)
  return Number.isInteger(num) && num > 0 ? num : null
}

function formatTarimaLocation(value) {
  const num = parseTarimaNumber(value)
  return num ? String(num) : null
}

function compareScanChronology(left, right) {
  const leftTime = Date.parse(left?.scannedAt || '')
  const rightTime = Date.parse(right?.scannedAt || '')
  const safeLeft = Number.isFinite(leftTime) ? leftTime : 0
  const safeRight = Number.isFinite(rightTime) ? rightTime : 0
  if (safeLeft !== safeRight) return safeLeft - safeRight
  return String(left?.id || left?.code || '').localeCompare(String(right?.id || right?.code || ''))
}

function formatScanDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function pickBestDuplicateSource(events, scannedCode) {
  return events
    .filter((event) => codesMatch(event.code || event.codigo_escaneado, scannedCode))
    .sort((left, right) => {
      const rightHasLocation = right?.ubicacion ? 1 : 0
      const leftHasLocation = left?.ubicacion ? 1 : 0
      if (rightHasLocation !== leftHasLocation) return rightHasLocation - leftHasLocation
      return compareScanChronology(right, left)
    })[0] || null
}

function normalizeTarimaAssignments(input) {
  const map = new Map()
  if (Array.isArray(input)) {
    for (const entry of input) {
      const base = String(entry?.base || '').trim()
      const num = parseTarimaNumber(entry?.num)
      if (base && num) map.set(base, num)
    }
    return map
  }
  if (input && typeof input === 'object') {
    for (const [rawBase, rawNum] of Object.entries(input)) {
      const base = String(rawBase || '').trim()
      const num = parseTarimaNumber(rawNum)
      if (base && num) map.set(base, num)
    }
  }
  return map
}

function serializeTarimaAssignments(map) {
  return Array.from(map.entries())
    .filter(([base, num]) => base && parseTarimaNumber(num))
    .map(([base, num]) => ({ base, num: parseTarimaNumber(num) }))
    .sort((a, b) => a.num - b.num || a.base.localeCompare(b.base, 'es'))
}

function normalizeTarimaNumberList(input) {
  const values = Array.isArray(input)
    ? input
    : input == null
      ? []
      : [input]
  return Array.from(new Set(values.map((value) => parseTarimaNumber(value)).filter(Boolean))).sort((a, b) => a - b)
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

function codesMatch(left, right) {
  const leftVars = new Set(generateCodeVariations(normalizeScanCode(left), false))
  return generateCodeVariations(normalizeScanCode(right), false).some((variant) => leftVars.has(variant))
}

function applyLocalValidationsToLines(lines, localScans) {
  if (!localScans.length) return lines
  const consumed = new Set()

  return lines.map((line) => {
    if (line.estado_validacion === 'validada' || !line.custom_box_barcode) return line
    const localIndex = localScans.findIndex((scan, index) =>
      !consumed.has(index) && codesMatch(line.custom_box_barcode, scan.code)
    )
    if (localIndex === -1) return line

    consumed.add(localIndex)
    const scan = localScans[localIndex]
    return {
      ...line,
      estado_validacion: 'validada',
      validated_at: scan.scannedAt,
      validated_by_nombre: scan.scannedBy || line.validated_by_nombre,
    }
  })
}

function getStoredLineCode(line, fallback = '') {
  const stored = String(line?.custom_box_barcode || '').trim()
  return stored || normalizeScanCode(fallback)
}

function isPersistedScanEventId(id) {
  if (!id) return false
  const value = String(id)
  return !value.startsWith('offline-') && !value.startsWith('local-')
}

function getScanErrorMessage(err) {
  const status = err?.response?.status
  if (status === 401) return 'Sesión expirada. Vuelve a iniciar sesión.'
  const data = err?.response?.data
  const parts = [data?.error, data?.detalle].filter(v => v && typeof v === 'string')
  if (parts.length > 0) return parts.join(': ')
  if (status === 403) return 'Sin permiso para escanear en esta orden. Contacta al administrador.'
  if (err?.message) return err.message
  return 'Error al procesar escaneo'
}

function isRecoverableConnectionError(err) {
  if ([502, 503, 504].includes(err?.response?.status)) return true
  if (err?.response) return false
  return (
    err?.code === 'ERR_NETWORK' ||
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ECONNABORTED' ||
    /Network Error|timeout|Backend temporarily unavailable/i.test(err?.message || '')
  )
}

export default function ValidacionRecepcion({ orderId: propOrderId, initialOrder = null, embedded = false, onBack, onCancel, closeRequestToken = 0, headerActionsSlot = null } = {}) {
  const { id: paramId } = useParams()
  const id = propOrderId ?? paramId
  const navigate = useNavigate()
  const goBack = () => {
    if (embedded && onBack) { onBack(); return }
    navigate('/recepcion/recibir')
  }
  const cancelValidation = () => {
    if (embedded && onCancel) { onCancel(); return }
    goBack()
  }
  const { t } = useI18nStore()
  const toast = useToastStore()
  const qc = useQueryClient()
  const { hasPermission, isAuthenticated } = useAuthStore()
  const canMarkAnormalidad = hasPermission('recepcion.validacion', 'crear')
  const canUndoLastValidation = hasPermission('recepcion.validacion', 'crear')
  const canDeleteScan = hasPermission('recepcion.validacion', 'eliminar')
  const canDeleteScanGroup = hasPermission('recepcion.validacion', 'actualizar') || canDeleteScan
  const canDeleteTarimaGroup = canDeleteScan
  const canForceClose = hasPermission('recepcion.validacion', 'actualizar')

  const scanRefDesktop = useRef(null)
  const scanRefMobile  = useRef(null)
  const locationRef    = useRef(null)
  const sessionBootOrderRef = useRef(null)
  const sessionBootRequestRef = useRef(null)
  const handledCloseRequestRef = useRef(0)
  const scanStartRef = useRef(null)
  const refocusRef = useRef(null)
  const inFlightCodes = useRef(new Set())
  const lastResultSeqRef = useRef(0)
  const scanFeedbackSeqRef = useRef(0)
  const lastPublishedFeedbackSeqRef = useRef(0)
  const tarimaAssignmentsRef = useRef(new Map())
  const tarimaPersistenceRef = useRef(Promise.resolve())

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
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState(null)
  const [pendingDeleteMode, setPendingDeleteMode] = useState('event')
  const [deleteGroupModal, setDeleteGroupModal] = useState({ open: false, ubicacion: '', label: '', type: 'ubicacion', tarimaNum: null })
  const [markAnormalidadModal, setMarkAnormalidadModal] = useState({
    open: false, mode: 'single', event: null, eventIds: [], count: 0, scopeLabel: '', tipo: '', ubicacion: '',
  })
  const [dupModal, setDupModal] = useState({ open: false, code: null, entry: null })
  const [rejectModal, setRejectModal] = useState({ open: false, code: null, message: null, reason: null })
  const [crossOrderModal, setCrossOrderModal] = useState({ open: false, code: null, order: null })
  const [forceModal, setForceModal] = useState({ open: false, code: '', tipo: '', ubicacion: '' })
  const [showModeSelection, setShowModeSelection] = useState(false)
  const [pendingMode, setPendingMode] = useState('ubicacion')
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

  // Edit ubicacion
  const [editUbicacionModal, setEditUbicacionModal] = useState(null) // { from: string|null, eventId?: string|null, scope: 'group'|'event' }
  const [editUbicacionValue, setEditUbicacionValue] = useState('')

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
  const [isEndingSession, setIsEndingSession] = useState(false)
  const [showEndingOverlay, setShowEndingOverlay] = useState(false)

  const canQueryRecepcion = isAuthenticated
  const isOffline = useOfflineStore((s) => s.status === 'offline')
  const moduleQueue = useOfflineStore((s) => s.moduleQueue)
  const orderSummaryQueryKey = useMemo(() => ['recepcion-order', id, 'validation-summary'], [id])
  const initialOrderData = useMemo(() => {
    if (!initialOrder || String(initialOrder.id) !== String(id)) return undefined
    const totalCajas = Number(initialOrder.total_cajas || 0)
    const registradas = Number(initialOrder.cajas_registradas ?? initialOrder.cajas_validadas ?? 0)
    const faltantes = Number(initialOrder.cajas_error ?? initialOrder.missing_lines ?? 0)
    return {
      order: initialOrder,
      lines: [],
      lines_meta: {
        page: 1,
        limit: 0,
        total: totalCajas,
        total_all: totalCajas,
        lines_loaded: false,
        status_counts: {
          validada: registradas,
          faltante: faltantes,
          pendiente: Math.max(totalCajas - registradas - faltantes, 0),
        },
      },
    }
  }, [initialOrder, id])

  const {
    data: orderSummaryData,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    error: summaryError,
    isPlaceholderData: isSummaryPlaceholder,
  } = useQuery({
    queryKey: orderSummaryQueryKey,
    queryFn: () => getOrder(id, { validation_mode: 1, include_lines: 0 }),
    enabled: canQueryRecepcion,
    placeholderData: initialOrderData,
    retry: false,
    staleTime: STALE.FROZEN,
  })
  const summaryTotalLines = Number(orderSummaryData?.lines_meta?.total_all ?? initialOrderData?.lines_meta?.total_all ?? 0)
  const shouldLoadLargeValidationDataset = summaryTotalLines > VALIDATION_LARGE_ORDER_THRESHOLD
  const validationLinesLimit = shouldLoadLargeValidationDataset
    ? VALIDATION_LARGE_ORDER_LINES_LIMIT
    : VALIDATION_DEFAULT_LINES_LIMIT
  const validationEventsLimit = shouldLoadLargeValidationDataset
    ? VALIDATION_LARGE_ORDER_EVENTS_LIMIT
    : VALIDATION_DEFAULT_EVENTS_LIMIT
  const orderQueryKey = useMemo(
    () => ['recepcion-order', id, 'validation-lines', validationLinesLimit],
    [id, validationLinesLimit]
  )

  const loadValidationLines = async () => {
    if (!shouldLoadLargeValidationDataset) {
      return getOrder(id, {
        validation_mode: 1,
        lines_limit: validationLinesLimit,
        lines_sort_key: 'created_at',
        lines_sort_dir: 'asc',
      })
    }

    const pages = Math.ceil(summaryTotalLines / VALIDATION_LARGE_ORDER_CHUNK_SIZE)
    const responses = []
    for (let page = 1; page <= pages; page += 1) {
      responses.push(await getOrder(id, {
        validation_mode: 1,
        lines_page: page,
        lines_limit: VALIDATION_LARGE_ORDER_CHUNK_SIZE,
        lines_sort_key: 'created_at',
        lines_sort_dir: 'asc',
      }, { timeout: VALIDATION_HEAVY_REQUEST_TIMEOUT_MS }))
    }

    const first = responses[0]
    return {
      ...first,
      lines: responses.flatMap(response => response.lines || []),
      lines_meta: {
        ...first.lines_meta,
        page: 1,
        limit: validationLinesLimit,
      },
    }
  }

  const loadValidationEvents = async () => {
    if (!shouldLoadLargeValidationDataset) {
      return getScanEvents(id, { resultados: 'correcto', compact: 1, limit: validationEventsLimit })
    }

    const events = []
    let page = 1
    while (events.length < VALIDATION_LARGE_ORDER_EVENTS_LIMIT) {
      const response = await getScanEvents(id, {
        resultados: 'correcto',
        compact: 1,
        limit: VALIDATION_LARGE_ORDER_CHUNK_SIZE,
        page,
      }, { timeout: VALIDATION_HEAVY_REQUEST_TIMEOUT_MS })
      events.push(...(response.events || []))
      if (!response.truncated || response.events.length === 0) break
      page += 1
    }
    return { events, truncated: events.length >= VALIDATION_LARGE_ORDER_EVENTS_LIMIT }
  }

  const {
    data: orderLinesData,
    isLoading: isLinesLoading,
    isFetching: isLinesFetching,
    isError: isLinesError,
    error: linesError,
  } = useQuery({
    queryKey: orderQueryKey,
    queryFn: loadValidationLines,
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.FROZEN,
    refetchInterval: canQueryRecepcion && scanning && !isOffline ? 15000 : false,
    refetchIntervalInBackground: false,
  })
  const queriedOrderData = orderLinesData?.order ? orderLinesData : orderSummaryData
  const orderData = queriedOrderData?.order && initialOrder?.validation_config?.mode && !queriedOrderData.order.validation_config?.mode
    ? {
        ...queriedOrderData,
        order: {
          ...queriedOrderData.order,
          validation_config: initialOrder.validation_config,
        },
      }
    : queriedOrderData
  const isLoading = !orderData?.order && (isSummaryLoading || isLinesLoading)
  const isOrderError = !orderData?.order && (isSummaryError || isLinesError)
  const orderError = summaryError || linesError
  const linesLoading = !orderLinesData?.lines_meta?.lines_loaded && (isLinesLoading || isLinesFetching)
  const linesReady = orderLinesData?.lines_meta?.lines_loaded === true

  const { data: eventsData } = useQuery({
    queryKey: ['recepcion-scan-events', id, validationEventsLimit],
    queryFn: loadValidationEvents,
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.DEFAULT,
    refetchInterval: canQueryRecepcion && scanning && !isOffline ? 20000 : false,
    refetchIntervalInBackground: false,
  })
  const serverEvents = eventsData?.events ?? []

  const { data: tiposData } = useQuery({
    queryKey: ['recepcion-novedad-tipos'],
    queryFn: getNovedadTipos,
    enabled: canQueryRecepcion && Boolean(orderData?.order),
    retry: false,
    staleTime: STALE.MEDIUM,
  })

  const order    = orderData?.order ?? null
  const lines    = orderData?.lines ?? []
  const linesMeta = orderData?.lines_meta ?? {}
  const hasCompleteLineSet = linesReady && Number(linesMeta.total_all ?? lines.length) <= lines.length
  const pendingRecepcionScans = useMemo(() =>
    moduleQueue
      .filter((item) => item.type === 'recepcion_scan' && String(item.payload?.orderId) === String(id))
      .map((item) => ({
        id: item.payload?.local_id || item.id,
        code: item.payload?.codigo_escaneado,
        ubicacion: item.payload?.ubicacion || null,
        scannedAt: item.ts,
        scannedBy: 'Pendiente local',
      }))
      .filter((item) => item.code),
    [moduleQueue, id]
  )
  const savedValidationConfig = order?.validation_config ?? null
  const isTarimaMode = withTarimas
  const savedTarimaMap = useMemo(
    () => normalizeTarimaAssignments(savedValidationConfig?.tarimaAssignments),
    [savedValidationConfig?.tarimaAssignments]
  )
  const savedEmptyTarimas = useMemo(
    () => normalizeTarimaNumberList(savedValidationConfig?.emptyTarimas),
    [savedValidationConfig?.emptyTarimas]
  )
  const correctHistory = useMemo(() => history.filter((h) => h.result === 'correcto'), [history])
  const unifiedCorrectScanEvents = useMemo(() => {
    const entries = []
    const persistedIds = new Set()
    const persistedCodeLocationKeys = new Set()
    const addPersistedKey = (code, ubicacion) => {
      const normalizedCode = normalizeScanCode(code)
      if (!normalizedCode) return
      persistedCodeLocationKeys.add(`${normalizedCode}:${String(ubicacion || '')}`)
    }

    for (const ev of serverEvents) {
      if (ev.resultado !== 'correcto') continue
      if (ev.id) persistedIds.add(String(ev.id))
      addPersistedKey(ev.codigo_escaneado, ev.ubicacion)
      entries.push({
        id: ev.id,
        code: ev.codigo_escaneado,
        ubicacion: ev.ubicacion || null,
        scannedAt: ev.scanned_at,
        scannedBy: ev.scanned_by_nombre,
        lineId: ev.line_id,
        persisted: true,
      })
    }

    const localSeen = new Set()
    const addLocal = (scan, fallbackUbicacion = null) => {
      const normalizedCode = normalizeScanCode(scan.code)
      if (!normalizedCode) return
      const ubicacion = scan.ubicacion || fallbackUbicacion || null
      if (scan.id && persistedIds.has(String(scan.id))) return
      if (persistedCodeLocationKeys.has(`${normalizedCode}:${String(ubicacion || '')}`)) return
      // Prefer id alone when present: an offline scan gets the same offlineId in
      // both `history` (set synchronously) and the moduleQueue entry (stamped a
      // moment later inside enqueueModule), so their scannedAt timestamps can
      // differ by a few ms — including scannedAt in the key broke the match and
      // showed every offline scan twice until reconnect resolved it via server data.
      const key = scan.id ? `id:${scan.id}` : `${normalizedCode}:${String(ubicacion || '')}:${scan.scannedAt || ''}`
      if (localSeen.has(key)) return
      localSeen.add(key)
      entries.push({
        id: scan.id,
        code: scan.code,
        ubicacion,
        scannedAt: scan.scannedAt,
        scannedBy: scan.scannedBy,
        lineId: scan.line_id || scan.lineId || null,
        persisted: false,
      })
    }

    for (const h of correctHistory) addLocal(h, selectedUbicacion)
    for (const pending of pendingRecepcionScans) addLocal(pending)

    return entries
  }, [serverEvents, correctHistory, pendingRecepcionScans, selectedUbicacion])
  const localValidationScans = useMemo(() => {
    const seen = new Set()
    return [...correctHistory, ...pendingRecepcionScans].filter((scan) => {
      const key = `${scan.id || ''}:${normalizeScanCode(scan.code)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [correctHistory, pendingRecepcionScans])
  const effectiveLines = useMemo(
    () => applyLocalValidationsToLines(lines, localValidationScans),
    [lines, localValidationScans]
  )
  const scanLineIndex = useMemo(() => {
    const index = new Map()
    for (const line of effectiveLines) {
      if (!line.custom_box_barcode) continue
      const normalized = normalizeScanCode(line.custom_box_barcode)
      for (const variant of generateCodeVariations(normalized, false)) {
        const list = index.get(variant) || []
        list.push(line)
        index.set(variant, list)
      }
    }
    return index
  }, [effectiveLines])
  const correctHistoryCount = correctHistory.length
  const total = Math.max(Number(order?.total_cajas || 0), effectiveLines.length)
  const totalRegistradas = Number(order?.cajas_registradas ?? order?.cajas_validadas ?? 0)
  const totalForzadas = Number(order?.cajas_forzadas ?? 0)
  const serverCorrectScanCount = serverEvents.filter((ev) => ev.resultado === 'correcto').length
  const unifiedCorrectScanCount = unifiedCorrectScanEvents.length
  const hasPersistedValidationRecords = totalRegistradas > 0 || totalForzadas > 0
  const validadas = Math.max(totalRegistradas, effectiveLines.filter(l => l.estado_validacion === 'validada').length)
  const faltantes  = effectiveLines.filter(l => l.estado_validacion === 'faltante').length
  const pendientes = Math.max(total - validadas - faltantes, 0)
  const progressPct = total > 0 ? Math.min(100, Math.round((validadas / total) * 100)) : 0

  const persistedTarimaMap = useMemo(() => {
    if (!isTarimaMode) return new Map()
    const map = new Map()
    for (const ev of serverEvents) {
      if (ev.resultado !== 'correcto') continue
      const base = extractBaseCode(ev.codigo_escaneado)
      const tarimaNum = parseTarimaNumber(ev.ubicacion)
      if (base && tarimaNum) map.set(base, tarimaNum)
    }
    for (const h of history) {
      if (h.result !== 'correcto') continue
      const base = extractBaseCode(h.code)
      const tarimaNum = parseTarimaNumber(h.ubicacion)
      if (base && tarimaNum) map.set(base, tarimaNum)
    }
    return map
  }, [serverEvents, history, isTarimaMode])
  const lockedTarimaMap = useMemo(() => {
    if (!isTarimaMode) return new Map()
    const map = new Map(savedTarimaMap)
    for (const [base, num] of tarimaOverrides) map.set(base, num)
    for (const [base, num] of persistedTarimaMap) {
      if (!map.has(base)) map.set(base, num)
    }
    return map
  }, [savedTarimaMap, tarimaOverrides, persistedTarimaMap, isTarimaMode])
  // FIFO source of truth: only persisted or locally confirmed assignments exist.
  // Unscanned codes never pre-generate tarimas.
  const effectiveTarimaMap = lockedTarimaMap
  useEffect(() => {
    tarimaAssignmentsRef.current = new Map(lockedTarimaMap)
  }, [lockedTarimaMap])
  const totalTarimas = useMemo(
    () => new Set([...effectiveTarimaMap.values(), ...savedEmptyTarimas]).size,
    [effectiveTarimaMap, savedEmptyTarimas]
  )

  const lastTarimaNum = useMemo(() => {
    if (!withTarimas || !lastResult?.code) return null
    if (lastResult?.tarimaNum) return lastResult.tarimaNum
    const base = extractBaseCode(lastResult.code)
    return base ? (effectiveTarimaMap.get(base) ?? null) : null
  }, [withTarimas, lastResult, effectiveTarimaMap])

  const tarimaStats = useMemo(() => {
    if (!isTarimaMode) return []
    // Build linesByBase for O(n) lookup
    const linesByBase = new Map()
    for (const l of effectiveLines) {
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
    for (const num of savedEmptyTarimas) {
      if (!byNum.has(num)) byNum.set(num, { num, bases: [], tarLines: [], color: getTarimaColor(num), empty: true })
    }
    return Array.from(byNum.values()).map(ts => ({
      ...ts,
      total: ts.tarLines.length,
      validated: ts.tarLines.filter(l => l.estado_validacion === 'validada').length,
      empty: ts.tarLines.length === 0 && ts.bases.length === 0,
    })).sort((a, b) => a.num - b.num)
  }, [isTarimaMode, effectiveTarimaMap, effectiveLines, savedEmptyTarimas])

  const tarimaCounts = useMemo(() => ({
    completo:   tarimaStats.filter(ts => ts.validated === ts.total && ts.total > 0).length,
    pendiente:  tarimaStats.filter(ts => ts.validated === 0).length,
    en_proceso: tarimaStats.filter(ts => ts.validated > 0 && ts.validated < ts.total).length,
  }), [tarimaStats])

  const activeTarimaStat = useMemo(
    () => (lastTarimaNum ? tarimaStats.find((ts) => ts.num === lastTarimaNum) ?? null : null),
    [lastTarimaNum, tarimaStats]
  )
  const lastTarimaBase = activeTarimaStat?.bases?.[0] ?? (lastResult?.code ? extractBaseCode(lastResult.code) : null)
  const lastTarimaColor = activeTarimaStat?.color ?? (lastTarimaNum ? getTarimaColor(lastTarimaNum) : null)
  const activeTarimaPct = activeTarimaStat?.total > 0
    ? Math.round((activeTarimaStat.validated / activeTarimaStat.total) * 100)
    : 0
  const activeTarimaCountLabel = activeTarimaStat
    ? (activeTarimaStat.empty ? t('rec.tarimas.empty.desc') : `${activeTarimaStat.validated}/${activeTarimaStat.total}`)
    : '—'

  const tarimaScanEventsByNum = useMemo(() => {
    if (!isTarimaMode) return new Map()
    const map = new Map()
    const seen = new Set()
    const add = ({ id: eventId, code, ubicacion, scannedAt, scannedBy, persisted }) => {
      const storedCode = String(code || '').trim()
      if (!storedCode) return
      const base = extractBaseCode(storedCode)
      const num = parseTarimaNumber(ubicacion) || (base ? effectiveTarimaMap.get(base) : null)
      if (!num) return
      const key = eventId && persisted ? String(eventId) : `${normalizeScanCode(storedCode)}:${scannedAt || ''}:${ubicacion || ''}`
      if (seen.has(key)) return
      seen.add(key)
      const list = map.get(num) || []
      list.push({
        id: eventId,
        code: storedCode,
        ubicacion: ubicacion || formatTarimaLocation(num),
        scannedAt,
        scannedBy,
        persisted: persisted && isPersistedScanEventId(eventId),
      })
      map.set(num, list)
    }

    for (const ev of unifiedCorrectScanEvents) {
      add({
        id: ev.id,
        code: ev.code,
        ubicacion: ev.ubicacion,
        scannedAt: ev.scannedAt,
        scannedBy: ev.scannedBy,
        persisted: ev.persisted,
      })
    }

    for (const list of map.values()) {
      list.sort(compareScanChronology)
    }
    return map
  }, [isTarimaMode, unifiedCorrectScanEvents, effectiveTarimaMap])

  const buildValidationConfig = useCallback(() => ({
    mode: withTarimas ? 'tarimas' : 'ubicacion',
    locked: withTarimas,
    groupSmallCodes,
    minCajasParaAgrupar,
    maxCajasEnGrupo,
  }), [withTarimas, groupSmallCodes, minCajasParaAgrupar, maxCajasEnGrupo])

  const filteredTarimaStats = useMemo(() => {
    let result = tarimaStats
    const q = tarimaSearch.trim().toLowerCase()
    if (q) result = result.filter(ts =>
      ts.bases.some(base => base.toLowerCase().includes(q)) ||
      (tarimaScanEventsByNum.get(ts.num) || []).some(event => String(event.code || '').toLowerCase().includes(q))
    )
    if (tarimaFilter === 'completo')   result = result.filter(ts => ts.validated === ts.total && ts.total > 0)
    if (tarimaFilter === 'pendiente')  result = result.filter(ts => ts.validated === 0)
    if (tarimaFilter === 'en_proceso') result = result.filter(ts => ts.validated > 0 && ts.validated < ts.total)
    return result
  }, [tarimaStats, tarimaSearch, tarimaFilter, tarimaScanEventsByNum])

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

  // Unified scan events grouped by ubicacion (server truth plus non-persisted local queue)
  const allUbicacionGroups = useMemo(() => {
    if (isTarimaMode) return []
    const map = new Map()
    const seen = new Set()
    for (const ev of unifiedCorrectScanEvents) {
      const key = ev.ubicacion ?? ''
      const existing = map.get(key) ?? { ubicacion: ev.ubicacion || null, codes: [] }
      const eventKey = ev.id && ev.persisted ? String(ev.id) : `${normalizeScanCode(ev.code)}:${key}:${ev.scannedAt || ''}`
      if (seen.has(eventKey)) continue
      seen.add(eventKey)
      existing.codes.push({ id: ev.id, code: ev.code, scannedAt: ev.scannedAt })
      map.set(key, existing)
    }
    for (const group of map.values()) {
      group.codes.sort(compareScanChronology)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.ubicacion) return 1
      if (!b.ubicacion) return -1
      return a.ubicacion.localeCompare(b.ubicacion)
    })
  }, [unifiedCorrectScanEvents, isTarimaMode])

  const filteredUbicacionGroups = useMemo(() => {
    if (isTarimaMode) return []
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
    return sortActive(result.filter(g =>
      (g.ubicacion ?? '').toLowerCase().includes(q) ||
      g.codes.some(code => String(code.code || '').toLowerCase().includes(q))
    ))
  }, [allUbicacionGroups, ubicacionSearch, ubicacionFilter, selectedUbicacion, ubicacionConfirmed, isTarimaMode])

  const totalUbicacionCodes = useMemo(() => {
    if (isTarimaMode) return 0
    return allUbicacionGroups.reduce((s, g) => s + g.codes.length, 0)
  }, [allUbicacionGroups, isTarimaMode])
  const activeUbicacionGroup = useMemo(() => {
    if (isTarimaMode || !ubicacionConfirmed) return null
    const activeKey = selectedUbicacion ?? ''
    return allUbicacionGroups.find(g => (g.ubicacion ?? '') === activeKey) ?? null
  }, [allUbicacionGroups, selectedUbicacion, ubicacionConfirmed, isTarimaMode])
  const activeUbicacionScanCount = activeUbicacionGroup?.codes.length ?? 0
  const latestPersistedValidationEvent = useMemo(() => {
    const events = unifiedCorrectScanEvents
      .filter((event) => event.lineId || event.id)
      .filter((event) => isPersistedScanEventId(event.id))
      .sort((a, b) => new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0))
    return events[0] ?? null
  }, [unifiedCorrectScanEvents])
  const latestPersistedValidationId = latestPersistedValidationEvent?.id ?? null
  const activeTarimaPersistedEventIds = useMemo(
    () => (
      activeTarimaStat
        ? (tarimaScanEventsByNum.get(activeTarimaStat.num) || [])
          .filter((event) => isPersistedScanEventId(event.id))
          .map((event) => event.id)
        : []
    ),
    [activeTarimaStat, tarimaScanEventsByNum]
  )
  const activeUbicacionPersistedEventIds = useMemo(
    () => (
      activeUbicacionGroup?.codes
        ?.filter((event) => isPersistedScanEventId(event.id))
        ?.map((event) => event.id) || []
    ),
    [activeUbicacionGroup]
  )

  const publishLastResult = useCallback((payload, feedbackSeq = null) => {
    if (feedbackSeq != null) {
      if (feedbackSeq < scanFeedbackSeqRef.current) return
      if (feedbackSeq < lastPublishedFeedbackSeqRef.current) return
      lastPublishedFeedbackSeqRef.current = feedbackSeq
    }
    lastResultSeqRef.current += 1
    setLastResult({
      ...payload,
      at: payload.at || new Date().toISOString(),
      seq: lastResultSeqRef.current,
    })
  }, [])

  const resetDeleteModal = useCallback(() => {
    setConfirmDeleteOpen(false)
    setPendingDeleteEventId(null)
    setPendingDeleteMode('event')
  }, [])

  const closeMarkAnormalidadModal = useCallback(() => {
    setMarkAnormalidadModal({
      open: false, mode: 'single', event: null, eventIds: [], count: 0, scopeLabel: '', tipo: '', ubicacion: '',
    })
  }, [])

  const openSingleMarkAnormalidad = useCallback((event, ubicacion = '') => {
    setMarkAnormalidadModal({
      open: true,
      mode: 'single',
      event,
      eventIds: event?.id ? [event.id] : [],
      count: event?.id ? 1 : 0,
      scopeLabel: event?.code || '',
      tipo: '',
      ubicacion: ubicacion || event?.ubicacion || '',
    })
  }, [])

  const openBulkMarkAnormalidad = useCallback(({ eventIds, count, scopeLabel, ubicacion }) => {
    setMarkAnormalidadModal({
      open: true,
      mode: 'bulk',
      event: null,
      eventIds,
      count,
      scopeLabel,
      tipo: '',
      ubicacion: ubicacion || '',
    })
  }, [])

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
  useEffect(() => { refocusRef.current = refocus }, [refocus])

  useEffect(() => { if (scanning) refocus() }, [scanning, refocus])

  useEffect(() => {
    const handler = () => initAudio()
    window.addEventListener('keydown', handler, { once: true })
    window.addEventListener('click', handler, { once: true })
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('click', handler)
    }
  }, [])

  useEffect(() => {
    if (!canQueryRecepcion) {
      setBootingSession(false)
      setScanning(false)
      setSessionId(null)
      navigate('/login', { replace: true })
    }
  }, [canQueryRecepcion, navigate])

  useEffect(() => {
    if (isOrderError) {
      setBootingSession(false)
      setScanning(false)
      setSessionId(null)
    }
  }, [isOrderError])

  useEffect(() => {
    if (isSummaryPlaceholder) return
    const cfg = order?.validation_config
    const validationAlreadyStarted = Boolean(order?.validation_session_started)
    if (!cfg || typeof cfg !== 'object' || !hasPersistedValidationRecords) {
      // No config, or config was chosen but no scans recorded — allow (re-)selection
      setWithTarimas(validationAlreadyStarted ? Boolean(order?.validation_tarimas_started) : (cfg?.mode === 'tarimas'))
      setGroupSmallCodes(cfg ? Boolean(cfg.groupSmallCodes) : false)
      setMinCajasParaAgrupar(Math.max(1, parseInt(cfg?.minCajasParaAgrupar, 10) || 3))
      setMaxCajasEnGrupo(Math.max(1, parseInt(cfg?.maxCajasEnGrupo, 10) || 10))
      if (Boolean(order) && !validationAlreadyStarted && !cfg?.mode) {
        setPendingMode('ubicacion')
        setShowModeSelection(true)
      } else {
        setShowModeSelection(false)
      }
      return
    }
    setShowModeSelection(false)
    setWithTarimas(cfg.mode === 'tarimas')
    setGroupSmallCodes(Boolean(cfg.groupSmallCodes))
    setMinCajasParaAgrupar(Math.max(1, parseInt(cfg.minCajasParaAgrupar, 10) || 3))
    setMaxCajasEnGrupo(Math.max(1, parseInt(cfg.maxCajasEnGrupo, 10) || 10))
  }, [order?.id, order?.validation_config, order?.validation_session_started, order?.validation_tarimas_started, hasPersistedValidationRecords, isSummaryPlaceholder])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (isSummaryPlaceholder) return
      if (!order || sessionBootOrderRef.current === id) return
      const validationAlreadyStarted = Boolean(order.validation_session_started)
      if (!order.validation_config?.mode && !validationAlreadyStarted) {
        setPendingMode('ubicacion')
        setShowModeSelection(true)
        setBootingSession(false)
        return
      }
      if (useOfflineStore.getState().status === 'offline') {
        if (!cancelled) {
          sessionBootOrderRef.current = id
          setSessionId('local')
          setScanning(true)
          setBootingSession(false)
          refocusRef.current?.()
        }
        return
      }
      try {
        const tarimasEnabled = order.validation_config?.mode === 'tarimas' ||
          (!order.validation_config?.mode && Boolean(order.validation_tarimas_started))
        const requestKey = `${id}:${tarimasEnabled ? 'tarimas' : 'ubicacion'}`
        let request = sessionBootRequestRef.current
        if (!request || request.key !== requestKey) {
          request = {
            key: requestKey,
            promise: createSession(id, { tarimas_enabled: tarimasEnabled }),
          }
          sessionBootRequestRef.current = request
        }
        const res = await request.promise
        if (cancelled) return
        sessionBootOrderRef.current = id
        setSessionId(res.session?.id ?? 'local')
        setScanning(true)
        refocusRef.current?.()
      } catch {
        if (!cancelled) toast.error(t('rec.val.toast.sessionStartError'))
      } finally {
        if (!cancelled) setBootingSession(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [id, order, toast, isSummaryPlaceholder])

  const endSession = async () => {
    if (isEndingSession) return
    setIsEndingSession(true)
    try {
      if (sessionId && sessionId !== 'local') {
        await updateSession(id, sessionId, {
          total_escaneado: totalRegistradas,
          ubicacion_nota: selectedUbicacion || null,
        })
      }
      setSessionId(null)
      setScanning(false)
      playSound('complete')
      void Promise.all([
        qc.invalidateQueries({ queryKey: ['recepcion-order', id] }),
        qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] }),
        qc.invalidateQueries({ queryKey: ['recepcion-orders'] }),
      ])
      goBack()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'No se pudo terminar la validación')
      setIsEndingSession(false)
    }
  }

  useEffect(() => {
    if (!embedded || !closeRequestToken || bootingSession || isEndingSession) return
    if (handledCloseRequestRef.current === closeRequestToken) return
    handledCloseRequestRef.current = closeRequestToken
    void endSession()
  }, [closeRequestToken, embedded, bootingSession, isEndingSession])

  useEffect(() => {
    if (!isEndingSession) {
      setShowEndingOverlay(false)
      return undefined
    }
    const timer = window.setTimeout(() => setShowEndingOverlay(true), 450)
    return () => window.clearTimeout(timer)
  }, [isEndingSession])

  const findPendingCrossOrder = useCallback(async (code) => {
    if (isOffline) return null
    try {
      const result = await searchByCode(code)
      const orders = Array.isArray(result?.orders) ? result.orders : []
      return orders.find((candidate) =>
        String(candidate.id) !== String(id) &&
        Number(candidate.pending_exact_lines ?? candidate.pending_lines ?? 0) > 0 &&
        !['cancelado', 'completo'].includes(candidate.estado)
      ) || null
    } catch {
      return null
    }
  }, [id, isOffline])

  const openCrossOrder = useCallback(() => {
    const orderToOpen = crossOrderModal.order
    if (!orderToOpen?.id) return
    setCrossOrderModal({ open: false, code: null, order: null })
    useRecepcionEscanearStore.getState().openOrderTab(orderToOpen.id, orderToOpen.folio, orderToOpen.cliente, orderToOpen)
    if (!embedded) navigate('/recepcion/escanear')
  }, [crossOrderModal.order, embedded, navigate])

  const queueRecepcionScanOffline = useCallback(({ code, sku = null, lineId = null, ubicacion = null, feedbackSeq = null, scannedBy = 'Pendiente local', counterAlreadyApplied = false }) => {
    const offlineId = `offline-${Date.now()}`
    const offlineAt = new Date().toISOString()
    useOfflineStore.getState().enqueueModule({
      type: 'recepcion_scan',
      payload: {
        orderId: id,
        codigo_escaneado: code,
        session_id: sessionId !== 'local' ? sessionId : null,
        tarimas_enabled: withTarimas,
        ubicacion: ubicacion || null,
        local_id: offlineId,
      },
    })
    publishLastResult({
      result: 'correcto',
      code,
      sku,
      tarimaNum: parseTarimaNumber(ubicacion),
      at: offlineAt,
    }, feedbackSeq)
    const base = extractBaseCode(code)
    const tarimaNum = parseTarimaNumber(ubicacion)
    if (base && tarimaNum) {
      setTarimaOverrides(prev => { const next = new Map(prev); next.set(base, tarimaNum); return next })
    }
    setHistory(prev => [{
      id: offlineId,
      result: 'correcto',
      code,
      sku,
      scannedAt: offlineAt,
      scannedBy,
      ubicacion: ubicacion || null,
    }, ...prev.slice(0, 49)])
    if (lineId && !counterAlreadyApplied) {
      qc.setQueryData(orderQueryKey, (cur) => {
        if (!cur) return cur
        return {
          ...cur,
          order: {
            ...cur.order,
            cajas_validadas: (cur.order?.cajas_validadas || 0) + 1,
            cajas_registradas: (cur.order?.cajas_registradas || cur.order?.cajas_validadas || 0) + 1,
          },
          lines: (cur.lines || []).map(l =>
            l.id === lineId
              ? { ...l, estado_validacion: 'validada', validated_at: offlineAt, validated_by_nombre: scannedBy }
              : l
          ),
        }
      })
    }
    return { offlineId, offlineAt }
  }, [id, orderQueryKey, publishLastResult, qc, sessionId, withTarimas])

  const applyOptimisticScanCount = useCallback((lineId) => {
    if (!lineId) return
    const now = new Date().toISOString()
    qc.setQueryData(orderQueryKey, (cur) => {
      if (!cur) return cur
      const line = (cur.lines || []).find(item => item.id === lineId)
      if (!line || line.estado_validacion === 'validada') return cur
      return {
        ...cur,
        order: {
          ...cur.order,
          cajas_validadas: (cur.order?.cajas_validadas || 0) + 1,
          cajas_registradas: (cur.order?.cajas_registradas ?? cur.order?.cajas_validadas ?? 0) + 1,
        },
        lines: (cur.lines || []).map(item => item.id === lineId
          ? { ...item, estado_validacion: 'validada', validated_at: now }
          : item),
      }
    })
  }, [orderQueryKey, qc])

  const scanMut = useMutation({
    mutationFn: ({ codigo, ubicacion }) => scanCode(id, { codigo_escaneado: codigo, session_id: sessionId, tarimas_enabled: withTarimas, ubicacion: ubicacion || null }),
    onSuccess: async (data, variables) => {
      const ev = data.event
      const crossOrder = ev.resultado === 'no_encontrado'
        ? await findPendingCrossOrder(variables.codigo)
        : null
      if (import.meta.env.DEV && scanStartRef.current != null) {
        const elapsed = performance.now() - scanStartRef.current
        console.debug(`[recepcion] scan client ${elapsed.toFixed(1)}ms`)
        scanStartRef.current = null
      }
      startTransition(() => {
        publishLastResult({
          result: ev.resultado,
          code: ev.codigo_escaneado,
          sku: ev.sku_asociado,
          tarimaNum: parseTarimaNumber(ev.ubicacion || variables.ubicacion),
          at: ev.scanned_at,
        }, variables.feedbackSeq)
        if (ev.resultado === 'no_encontrado') {
          if (crossOrder) {
            setCrossOrderModal({ open: true, code: variables.codigo, order: crossOrder })
          } else {
            setRejectModal({
              open: true,
              code: variables.codigo,
              message: data.mensaje || 'El código no existe en las líneas esperadas de esta orden de recepción.',
              reason: data.motivo || 'codigo_no_pertenece_orden',
            })
          }
        }
        if (ev.resultado === 'duplicado') {
          const previousLocalEvent = pickBestDuplicateSource(unifiedCorrectScanEvents, ev.codigo_escaneado)
          setDupModal({
            open: true,
            code: variables.codigo,
            entry: {
              scannedAt: data.previous_event?.scanned_at || null,
              scannedBy: data.previous_event?.scanned_by_nombre || '—',
              ubicacion: data.previous_event?.ubicacion || previousLocalEvent?.ubicacion || null,
              message: data.mensaje || 'Todas las cajas esperadas para este código ya fueron validadas.',
              reason: data.motivo || 'codigo_ya_validado',
            },
          })
        }
        if (ev.resultado === 'correcto') {
          const tarimaNum = parseTarimaNumber(ev.ubicacion || variables.ubicacion)
          const base = extractBaseCode(ev.codigo_escaneado)
          if (base && tarimaNum) {
            setTarimaOverrides(prev => {
              const next = new Map(prev)
              next.set(base, tarimaNum)
              return next
            })
          }
          setHistory(prev => [{
            id: ev.id, result: ev.resultado, code: ev.codigo_escaneado,
            sku: ev.sku_asociado, scannedAt: ev.scanned_at, scannedBy: ev.scanned_by_nombre || '—',
            ubicacion: ev.ubicacion || variables.ubicacion || null,
          }, ...prev.slice(0, 49)])
          if (data.line) {
            qc.setQueryData(orderQueryKey, (cur) => {
              if (!cur) return cur
              return {
                ...cur,
                order: {
                  ...cur.order,
                  cajas_validadas: data.cajas_validadas ?? cur.order?.cajas_validadas ?? 0,
                  cajas_forzadas: data.cajas_forzadas ?? cur.order?.cajas_forzadas ?? 0,
                  cajas_registradas: data.cajas_registradas ?? cur.order?.cajas_registradas ?? cur.order?.cajas_validadas ?? 0,
                  estado: data.estado || cur.order?.estado,
                },
                lines: (cur.lines || []).map(l => l.id === data.line.id
                  ? { ...l, estado_validacion: 'validada', validated_at: ev.scanned_at, validated_by_nombre: ev.scanned_by_nombre || l.validated_by_nombre }
                  : l),
              }
            })
          }
        }
      })
      if (ev.resultado === 'correcto') {
        if (!variables.optimisticFeedback) playSound('success')
      } else if (ev.resultado === 'duplicado') {
        playSound('duplicate')
      } else if (crossOrder) {
        playSound('warning')
      } else {
        playSound('error')
      }
    },
    onError: (err, variables) => {
      if (import.meta.env.DEV && scanStartRef.current != null) {
        const elapsed = performance.now() - scanStartRef.current
        console.debug(`[recepcion] scan client failed ${elapsed.toFixed(1)}ms`)
        scanStartRef.current = null
      }
      const canQueueOffline = isRecoverableConnectionError(err) && variables?.offlineFallback?.code
      if (canQueueOffline) {
        useOfflineStore.getState().setConnectionDegraded('scan_network_failure')
        startTransition(() => {
          queueRecepcionScanOffline({
            code: variables.offlineFallback.code,
            sku: variables.offlineFallback.sku || null,
            lineId: variables.offlineFallback.lineId || null,
            ubicacion: variables.ubicacion || null,
            feedbackSeq: variables.feedbackSeq,
            counterAlreadyApplied: variables.optimisticCounterApplied === true,
          })
        })
        playSound('success')
        toast.info('Conexión lenta o fallida: escaneo guardado offline para sincronizar.')
        return
      }
      if (variables?.optimisticCounterApplied) qc.invalidateQueries({ queryKey: orderQueryKey })
      playSound('error')
      publishLastResult({
        result: 'no_encontrado',
        code: variables?.codigo || '',
        sku: null,
        tarimaNum: parseTarimaNumber(variables?.ubicacion),
      }, variables?.feedbackSeq)
      toast.error(getScanErrorMessage(err))
    },
    onSettled: (data, error, variables) => {
      inFlightCodes.current.delete(variables.codigo?.toLowerCase())
      refocus()
    },
  })

  const applyRemovedScanEffects = useCallback((data) => {
    const removedIds = Array.from(new Set(
      [
        ...(Array.isArray(data?.removedEventIds) ? data.removedEventIds : []),
        data?.removedEvent?.id,
      ].filter(Boolean)
    ))
    const lineIds = new Set(
      [
        ...(Array.isArray(data?.lineIds) ? data.lineIds : []),
        data?.lineId,
      ].filter(Boolean)
    )

    if (removedIds.length > 0) {
      setHistory((prev) => prev.filter((item) => !removedIds.includes(item.id)))
    }

    qc.setQueryData(orderQueryKey, (cur) => {
      if (!cur) return cur
      const nextOrder = data.order ? { ...cur.order, ...data.order } : {
        ...cur.order,
        cajas_validadas: data.cajas_validadas ?? cur.order?.cajas_validadas ?? 0,
        cajas_forzadas: data.cajas_forzadas ?? cur.order?.cajas_forzadas ?? 0,
        cajas_registradas: data.cajas_registradas ?? cur.order?.cajas_registradas ?? cur.order?.cajas_validadas ?? 0,
        estado: data.estado || cur.order?.estado,
      }
      return {
        ...cur,
        order: nextOrder,
        lines: (cur.lines || []).map((line) => lineIds.has(line.id)
          ? { ...line, estado_validacion: 'pendiente', validated_at: null, validated_by_nombre: null }
          : line),
      }
    })
  }, [orderQueryKey, qc])

  const deleteScanEventMut = useMutation({
    mutationFn: (eventId) => deleteScanEvent(id, eventId),
    onSuccess: (data) => {
      applyRemovedScanEffects(data)
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      toast.success(t('rec.val.toast.recordDeleted'))
      resetDeleteModal()
      refocus()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  })

  const deleteLastValidationMut = useMutation({
    mutationFn: () => deleteLastValidationRecord(id),
    onSuccess: (data) => {
      applyRemovedScanEffects(data)
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      toast.success(t('rec.val.toast.lastRecordDeleted'))
      resetDeleteModal()
      refocus()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar el último registro'),
  })

  const deleteLocationScansMut = useMutation({
    mutationFn: (ubicacion) => deleteLocationScans(id, ubicacion),
    onSuccess: (data) => {
      applyRemovedScanEffects(data)
      if (deleteGroupModal.type === 'tarima' && deleteGroupModal.tarimaNum) {
        const removedNum = deleteGroupModal.tarimaNum
        setTarimaOverrides((prev) => new Map([...prev].filter(([, num]) => num !== removedNum)))
        tarimaAssignmentsRef.current = new Map([...tarimaAssignmentsRef.current].filter(([, num]) => num !== removedNum))
      }
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: orderQueryKey })
      toast.success(t('rec.val.deleteGroup.success'))
      setDeleteGroupModal({ open: false, ubicacion: '', label: '', type: 'ubicacion', tarimaNum: null })
      refocus()
    },
    onError: (err) => toast.error(err.response?.data?.error || t('rec.val.deleteGroup.error')),
  })

  const markScanEventAsNovedadMut = useMutation({
    mutationFn: ({ eventId, tipo, ubicacion }) => markScanEventAsNovedad(id, eventId, { tipo, ubicacion }),
    onSuccess: (data) => {
      applyRemovedScanEffects(data)
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      toast.success(t('rec.val.markAnormalidad.success'))
      closeMarkAnormalidadModal()
      refocus()
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const markScanEventsAsNovedadBulkMut = useMutation({
    mutationFn: ({ eventIds, tipo, ubicacion }) => markScanEventsAsNovedadBulk(id, { event_ids: eventIds, tipo, ubicacion }),
    onSuccess: (data) => {
      applyRemovedScanEffects(data)
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      toast.success(`Se enviaron ${data.movedCount || 0} registros a anormalidad`)
      closeMarkAnormalidadModal()
      refocus()
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const forceCloseMut = useMutation({
    mutationFn: () => updateOrder(id, { estado: 'completo' }),
    onSuccess: () => {
      toast.success(t('rec.val.forceClose.success'))
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      setForceCloseOpen(false)
      goBack()
    },
    onError: () => toast.error(t('toast.error')),
  })

  const saveValidationConfigMut = useMutation({
    mutationFn: (payload) => {
      const validationConfig = payload?.validationConfig ?? payload
      const reconfigureTarimas = payload?.reconfigureTarimas === true
      return updateOrder(id, {
        validation_config: validationConfig,
        ...(reconfigureTarimas ? { reconfigure_tarimas: true } : {}),
      })
    },
    onSuccess: (data) => {
      qc.setQueryData(orderQueryKey, (cur) => cur ? { ...cur, order: data.order } : cur)
      qc.setQueryData(orderSummaryQueryKey, (cur) => cur ? { ...cur, order: data.order } : cur)
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const relocateUbicacionMut = useMutation({
    mutationFn: ({ from, to }) => {
      if (useOfflineStore.getState().status === 'offline') {
        // Fix not-yet-synced scans in the local queue so they sync with the
        // corrected location, patch the current session's local history so the
        // count/grouping reflects it immediately, and queue the same relocation
        // for the server so it also catches anything already persisted before
        // the device went offline — replayed on reconnect in FIFO order, after
        // the (already-corrected) queued scans.
        const queuedTouched = useOfflineStore.getState().relocateQueuedRecepcionScans(id, from, to)
        setHistory((prev) => prev.map((item) => item.ubicacion === from ? { ...item, ubicacion: to.toUpperCase() } : item))
        useOfflineStore.getState().enqueueModule({
          type: 'recepcion_relocate_ubicacion',
          payload: { orderId: id, from, to },
        })
        return Promise.resolve({ offline: true, updated: queuedTouched })
      }
      return relocateScanEvents(id, from, to)
    },
    onSuccess: (data, { to }) => {
      if (selectedUbicacion === editUbicacionModal?.from) {
        setSelectedUbicacion(to.toUpperCase())
      }
      setEditUbicacionModal(null)
      setEditUbicacionValue('')
      if (data.offline) {
        toast.success(t('rec.val.toast.offlineSavedWillSync'))
      } else {
        qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
        toast.success(`${t('rec.val.ubicacion.edit')} (${data.updated} escaneos)`)
      }
    },
    onError: () => toast.error(t('toast.error')),
  })

  const updateScanLocationMut = useMutation({
    mutationFn: ({ eventId, ubicacion }) => updateScanEventLocation(id, eventId, ubicacion),
    onSuccess: (_, { ubicacion }) => {
      setEditUbicacionModal(null)
      setEditUbicacionValue('')
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      setHistory((prev) => prev.map((item) => item.id === editUbicacionModal?.eventId
        ? { ...item, ubicacion: ubicacion.toUpperCase() }
        : item))
      toast.success(t('common.save'))
    },
    onError: () => toast.error(t('toast.error')),
  })

  const forceEntryMut = useMutation({
    mutationFn: (payload) => createNovedad(id, payload),
    onSuccess: (data) => {
      const nextOrder = data?.order || null
      qc.setQueryData(orderQueryKey, (cur) => {
        if (!cur) return cur
        return {
          ...cur,
          order: nextOrder ? { ...cur.order, ...nextOrder } : cur.order,
        }
      })
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      toast.success(t('rec.val.forceEntry.success'))
      setForceModal({ open: false, code: '', tipo: '', ubicacion: '' })
      setRejectModal({ open: false, code: null, message: null, reason: null })
      setDupModal({ open: false, code: null, entry: null })
      refocus()
    },
    onError: (err) => {
      const status = err?.response?.status
      if (status === 403) return toast.error(t('rec.novedad.error.perm'))
      toast.error(err.response?.data?.error || t('toast.error'))
    },
  })

  async function persistTarimaAssignments(nextMap, nextEmptyTarimas = savedEmptyTarimas) {
    const nextConfig = {
      ...buildValidationConfig(),
      mode: 'tarimas',
      locked: true,
      tarimaAssignments: serializeTarimaAssignments(nextMap),
      emptyTarimas: normalizeTarimaNumberList(nextEmptyTarimas),
    }
    await saveValidationConfigMut.mutateAsync(nextConfig)
  }

  async function selectValidationMode(mode) {
    const classified = mode === 'tarimas'
    const nextConfig = {
      ...buildValidationConfig(),
      mode: classified ? 'tarimas' : 'ubicacion',
      locked: classified,
      tarimaAssignments: [],
      emptyTarimas: [],
    }
    await saveValidationConfigMut.mutateAsync(nextConfig)
    setWithTarimas(classified)
    setTarimaOverrides(new Map())
    setPendingMode(null)
    setShowModeSelection(false)
    setBootingSession(true)
    sessionBootOrderRef.current = null
    sessionBootRequestRef.current = null
  }

  async function resolveFifoTarima(base) {
    const currentMap = tarimaAssignmentsRef.current
    const existing = currentMap.get(base)
    if (existing) return existing

    const nextMap = new Map(currentMap)
    const expectedCount = effectiveLines.filter(line => extractBaseCode(line.custom_box_barcode) === base).length
    let tarimaNum = null

    if (groupSmallCodes && expectedCount > 0 && expectedCount < minCajasParaAgrupar) {
      const assignedCounts = new Map()
      for (const [assignedBase, num] of nextMap) {
        const count = effectiveLines.filter(line => extractBaseCode(line.custom_box_barcode) === assignedBase).length
        assignedCounts.set(num, (assignedCounts.get(num) || 0) + count)
      }
      tarimaNum = [...assignedCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .find(([, count]) => count < maxCajasEnGrupo && count + expectedCount <= maxCajasEnGrupo)?.[0] || null
    }

    if (!tarimaNum) {
      const used = new Set([...nextMap.values(), ...savedEmptyTarimas])
      tarimaNum = 1
      while (used.has(tarimaNum)) tarimaNum += 1
    }
    nextMap.set(base, tarimaNum)
    tarimaAssignmentsRef.current = nextMap
    setTarimaOverrides(nextMap)
    tarimaPersistenceRef.current = tarimaPersistenceRef.current
      .catch(() => {})
      .then(() => persistTarimaAssignments(nextMap, savedEmptyTarimas))
    tarimaPersistenceRef.current.catch(() => {
      toast.error(t('rec.tarimas.assignment.error'))
    })
    return tarimaNum
  }

  const openForceEntryModal = useCallback((code) => {
    const tipos = tiposData?.tipos || []
    setForceModal({
      open: true,
      code: code || '',
      tipo: tipos[0]?.nombre || '',
      ubicacion: '',
    })
  }, [tiposData?.tipos])


  const handleKeyDown = async (e) => {
    if (!withTarimas && !ubicacionConfirmed) return
    if (e.key === 'Enter' && e.target.value.trim()) {
      if (!linesReady) {
        toast.info(t('rec.val.loadingLines'))
        return
      }
      const rawCode = e.target.value.trim()
      const code = normalizeScanCode(rawCode)
      if (!code) {
        e.target.value = ''
        refocus()
        return
      }
      const feedbackSeq = ++scanFeedbackSeqRef.current
      e.target.value = ''
      const matchingLines = []
      const matchedIds = new Set()
      for (const variant of generateCodeVariations(code, false)) {
        for (const line of (scanLineIndex.get(variant) || [])) {
          if (matchedIds.has(line.id)) continue
          matchedIds.add(line.id)
          matchingLines.push(line)
        }
      }
      const pendingMatchingLine = matchingLines.find(l => l.estado_validacion !== 'validada') || null
      const matchedLineForScan = pendingMatchingLine || matchingLines[0] || null
      const pendingLineForOptimisticScan = pendingMatchingLine || null
      const matchedStoredCode = getStoredLineCode(matchedLineForScan, code)
      const matchedTarimaCode = matchedLineForScan ? matchedStoredCode : ''
      const hasPendingMatchingLine = pendingMatchingLine !== null
      if (isOffline && matchingLines.length > 0 && !hasPendingMatchingLine) {
        // Defer this O(n·normalizeScanCode) search to inside the branch that needs it.
        // On happy-path (online correct scan) this was running on every keystroke for nothing.
        const existing = history.find(h => codesMatch(h.code, code))
          || pickBestDuplicateSource(unifiedCorrectScanEvents, code)
          || serverEvents.find(ev => ev.resultado === 'correcto' && codesMatch(ev.codigo_escaneado, code))
        playSound('duplicate')
        publishLastResult({
          result: 'duplicado',
          code: matchedStoredCode || code,
          sku: matchedLineForScan?.sku || null,
          tarimaNum: withTarimas ? effectiveTarimaMap.get(extractBaseCode(matchedStoredCode || code)) : null,
        }, feedbackSeq)
        setDupModal({
          open: true, code: matchedStoredCode || code,
          entry: existing?.scannedAt
            ? {
                ...existing,
                ubicacion: existing?.ubicacion || null,
                message: 'Todas las cajas esperadas para este código ya fueron validadas.',
                reason: 'codigo_ya_validado',
              }
            : {
                scannedAt: existing?.scanned_at || null,
                scannedBy: existing?.scanned_by_nombre || '—',
                ubicacion: existing?.ubicacion || null,
                message: 'Todas las cajas esperadas para este código ya fueron validadas.',
                reason: 'codigo_ya_validado',
              },
        })
        refocus()
        return
      }
      if (matchingLines.length === 0 && hasCompleteLineSet) {
        const crossOrder = await findPendingCrossOrder(code)
        if (crossOrder) {
          playSound('warning')
          publishLastResult({ result: 'no_encontrado', code, sku: null, tarimaNum: null }, feedbackSeq)
          setCrossOrderModal({ open: true, code, order: crossOrder })
          refocus()
          return
        }
        playSound('error')
        publishLastResult({ result: 'no_encontrado', code, sku: null, tarimaNum: null }, feedbackSeq)
        setRejectModal({
          open: true,
          code,
          message: 'El código no existe en las líneas esperadas de esta orden de recepción.',
          reason: 'codigo_no_pertenece_orden',
        })
        refocus()
        return
      }
      if (matchingLines.length === 0 && isOffline) {
        playSound('error')
        toast.error(t('rec.val.toast.noOfflineValidationUntilOrderLoaded'))
        refocus()
        return
      }
      const matchedBase = extractBaseCode(matchedTarimaCode)
      const tarimaNum = withTarimas && matchedBase ? await resolveFifoTarima(matchedBase) : null
      const ubicacion = withTarimas ? formatTarimaLocation(tarimaNum) : selectedUbicacion
      if (isOffline) {
        const offlineResult = !matchedLineForScan
          ? 'no_encontrado'
          : matchedLineForScan.estado_validacion === 'validada'
            ? 'duplicado'
            : 'correcto'
        startTransition(() => {
          publishLastResult({
            result: offlineResult,
            code: offlineResult === 'correcto' ? matchedStoredCode : code,
            sku: matchedLineForScan?.sku || null,
            tarimaNum,
          }, feedbackSeq)
          if (offlineResult === 'no_encontrado') {
            setRejectModal({
              open: true,
              code,
              message: 'El código no existe en las líneas esperadas de esta orden de recepción.',
              reason: 'codigo_no_pertenece_orden',
            })
          } else if (offlineResult === 'duplicado') {
            const previousLocalEvent = pickBestDuplicateSource(unifiedCorrectScanEvents, matchedStoredCode || code)
            setDupModal({
              open: true,
              code: matchedStoredCode || code,
              entry: {
                scannedAt: previousLocalEvent?.scannedAt || previousLocalEvent?.scanned_at || null,
                scannedBy: previousLocalEvent?.scannedBy || previousLocalEvent?.scanned_by_nombre || '—',
                ubicacion: previousLocalEvent?.ubicacion || ubicacion || null,
                message: 'Todas las cajas esperadas para este código ya fueron validadas.',
                reason: 'codigo_ya_validado',
              },
            })
          } else {
            queueRecepcionScanOffline({
              code: matchedStoredCode,
              sku: matchedLineForScan?.sku || null,
              lineId: matchedLineForScan?.id || null,
              ubicacion,
              feedbackSeq,
              scannedBy: '—',
            })
          }
        })
        if (offlineResult === 'correcto') playSound('success')
        else if (offlineResult === 'duplicado') playSound('duplicate')
        else playSound('error')
        refocus()
        return
      }
      if (import.meta.env.DEV) scanStartRef.current = performance.now()
      if (pendingLineForOptimisticScan) {
        const codeKey = code.toLowerCase()
        applyOptimisticScanCount(pendingLineForOptimisticScan.id)
        if (!inFlightCodes.current.has(codeKey)) {
          inFlightCodes.current.add(codeKey)
          publishLastResult({ result: 'correcto', code: matchedStoredCode, sku: pendingLineForOptimisticScan?.sku || null, tarimaNum }, feedbackSeq)
          playSound('success')
          scanMut.mutate({
            codigo: code,
            ubicacion,
            optimisticFeedback: true,
            optimisticCounterApplied: true,
            feedbackSeq,
            offlineFallback: { code: matchedStoredCode, sku: pendingLineForOptimisticScan?.sku || null, lineId: pendingLineForOptimisticScan.id },
          })
        } else {
          publishLastResult({ result: 'correcto', code: matchedStoredCode, sku: pendingLineForOptimisticScan?.sku || null, tarimaNum }, feedbackSeq)
          scanMut.mutate({
            codigo: code,
            ubicacion,
            feedbackSeq,
            optimisticCounterApplied: true,
            offlineFallback: { code: matchedStoredCode, sku: pendingLineForOptimisticScan?.sku || null, lineId: pendingLineForOptimisticScan.id },
          })
        }
      } else {
        scanMut.mutate({ codigo: code, ubicacion, feedbackSeq })
      }
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
    const batchCodes = correctHistory.map(h => ({
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
  }, [correctHistory, selectedUbicacion])

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
                  {activeUbicacionScanCount} {t('rec.val.ubicacion.lote_actual')}
                </p>
              </div>
              <span className="badge bg-primary-100 text-primary-700 text-[9px] shrink-0">{t('rec.val.ubicacion.badge')}</span>
              {canMarkAnormalidad && activeUbicacionPersistedEventIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => openBulkMarkAnormalidad({
                    eventIds: activeUbicacionPersistedEventIds,
                    count: activeUbicacionPersistedEventIds.length,
                    scopeLabel: selectedUbicacion || t('rec.val.ubicacion.panel.sin_ub'),
                    ubicacion: selectedUbicacion || '',
                  })}
                  className="p-1.5 rounded-lg text-warning-600 hover:text-warning-700 hover:bg-warning-50 transition-colors"
                  title={t('rec.val.markAnormalidad.tooltip')}
                >
                  <AlertTriangle size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => { setUbicacionConfirmed(false); setLocationInputValue(selectedUbicacion || ''); setTimeout(() => { locationRef.current?.focus(); locationRef.current?.select() }, 80) }}
                className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                title={t('rec.val.ubicacion.edit')}
              >
                <Edit3 size={12} />
              </button>
              {canDeleteScanGroup && activeUbicacionPersistedEventIds.length > 0 && selectedUbicacion && (
                <button
                  type="button"
                  onClick={() => setDeleteGroupModal({ open: true, ubicacion: selectedUbicacion, label: selectedUbicacion, type: 'ubicacion', tarimaNum: null })}
                  className="p-1.5 rounded-lg text-danger-500 hover:text-danger-700 hover:bg-danger-50 transition-colors"
                  title={t('rec.val.deleteGroup.ubicacion')}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            {activeUbicacionScanCount > 0 && (
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
            className="flex-1 min-w-0 bg-transparent text-sm text-warm-700 outline-none placeholder:text-warm-400 font-mono"
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
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-warm-50/55 p-3 space-y-2.5">
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
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggleUbicacion(cardKey)}
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 text-left min-w-0"
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
                {g.ubicacion && (
                  isActive && canMarkAnormalidad && activeUbicacionPersistedEventIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openBulkMarkAnormalidad({
                        eventIds: activeUbicacionPersistedEventIds,
                        count: activeUbicacionPersistedEventIds.length,
                        scopeLabel: g.ubicacion || t('rec.val.ubicacion.panel.sin_ub'),
                        ubicacion: g.ubicacion || '',
                      })}
                      className="p-2 rounded-lg transition-colors shrink-0 text-warning-500 hover:bg-warning-50 hover:text-warning-700"
                      title={t('rec.val.markAnormalidad.tooltip')}
                    >
                      <AlertTriangle size={11} />
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditUbicacionModal({ from: g.ubicacion || null, eventId: null, scope: 'group' })
                    setEditUbicacionValue((g.ubicacion || '').toUpperCase())
                  }}
                  className={`p-2 mr-1.5 rounded-lg transition-colors shrink-0 ${isActive ? 'text-primary-400 hover:bg-primary-100 hover:text-primary-700' : 'text-warm-300 hover:text-primary-600 hover:bg-primary-50'}`}
                  title={isOffline ? t('rec.val.ubicacion.edit') + ' (sin conexión — se sincronizará al reconectar)' : t('rec.val.ubicacion.edit')}
                >
                  <Edit3 size={11} />
                </button>
              </div>

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
                <div className={`border-t ${isActive ? 'border-primary-100' : 'border-warm-100'} divide-y divide-warm-50`}>
                  <div className="grid grid-cols-[2rem_1rem_minmax(0,1fr)_8.5rem] gap-2 bg-warm-50/80 px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-warm-500">
                    <span>#</span>
                    <span />
                    <span>{t('rec.scan.col.codigo')}</span>
                    <span className="text-right">{t('rec.scan.col.fecha_hora')}</span>
                  </div>
                  {g.codes.map((c, ci) => (
                    <div key={c.id || ci} className="grid grid-cols-[2rem_1rem_minmax(0,1fr)_8.5rem] items-center gap-2 px-3 py-1.5 hover:bg-primary-50/30 transition-colors">
                      <span className="text-[10px] font-black tabular-nums text-primary-500">{ci + 1}</span>
                      <Check className="h-3 w-3 text-success-500" />
                      <span className="font-mono text-[10px] truncate flex-1 text-warm-600">{c.code}</span>
                      {c.scannedAt && (
                        <span className="text-right text-[9px] font-medium tabular-nums shrink-0 text-warm-600">
                          {formatScanDateTime(c.scannedAt)}
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

        {lastTarimaNum && lastTarimaColor && (
          <div className={`rounded-2xl border px-3 py-2.5 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.28)] ${lastTarimaColor.pill}`}>
            <div className="flex items-center gap-2.5">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${lastTarimaColor.bg} text-white`}>
                {lastTarimaNum}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{t('rec.tarimas.panel.activa')}</p>
                <p className="font-mono text-xs font-black truncate">{lastTarimaBase || '—'}</p>
                <p className="text-[11px] font-bold mt-1 tabular-nums opacity-80">{activeTarimaCountLabel}</p>
              </div>
              {activeTarimaStat && !activeTarimaStat.empty && (
                <div className="shrink-0 text-right">
                  <p className="text-lg font-black tabular-nums leading-none">{activeTarimaPct}%</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wide opacity-70">{t('rec.cajas_validadas')}</p>
                </div>
              )}
              {canMarkAnormalidad && activeTarimaStat && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTarimaPersistedEventIds.length === 0) return
                    openBulkMarkAnormalidad({
                      eventIds: activeTarimaPersistedEventIds,
                      count: activeTarimaPersistedEventIds.length,
                      scopeLabel: `T${lastTarimaNum}`,
                      ubicacion: formatTarimaLocation(lastTarimaNum) || '',
                    })
                  }}
                  disabled={activeTarimaPersistedEventIds.length === 0 || markScanEventAsNovedadMut.isPending || markScanEventsAsNovedadBulkMut.isPending}
                  className="shrink-0 p-1.5 rounded-lg text-white/80 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                  title={t('rec.val.markAnormalidad.tooltip')}
                >
                  <AlertTriangle size={12} />
                </button>
              )}
            </div>
            {activeTarimaStat && !activeTarimaStat.empty && (
              <div className="mt-2.5 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-white/80 transition-all duration-500" style={{ width: `${activeTarimaPct}%` }} />
              </div>
            )}
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
            className="flex-1 min-w-0 bg-transparent text-sm text-warm-700 outline-none focus-visible:ring-0 placeholder:text-warm-400 font-mono"
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
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-warm-50/55 p-3 space-y-2.5">
        {filteredTarimaStats.length === 0 ? (
          <div className="py-8 text-center text-xs text-warm-400">{tarimaSearch ? t('rec.tarimas.panel.no_results') : t('rec.tarimas.panel.sin_tarimas')}</div>
        ) : filteredTarimaStats.map(ts => {
          const isActive = ts.num === lastTarimaNum
          const isExpanded = expandedTarimas.has(ts.num)
          const pct = ts.total > 0 ? Math.round((ts.validated / ts.total) * 100) : 0
          const scanEvents = tarimaScanEventsByNum.get(ts.num) || []
          return (
            <div
              key={ts.num}
              className={`rounded-2xl border overflow-hidden transition-all duration-200 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.32)] ${
                isActive
                  ? `${ts.color.bg} border-transparent ring-2 ${ts.color.ring} ring-offset-1 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.5)]`
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
                      {ts.bases[0] || t('rec.tarimas.empty.title')}
                      {ts.bases.length > 1 && (
                        <span className={`ml-1 text-[9px] font-bold ${isActive ? 'text-white/60' : 'text-warm-400'}`}>+{ts.bases.length - 1}</span>
                      )}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/70' : 'text-warm-400'}`}>
                      {ts.empty ? t('rec.tarimas.empty.desc') : `${ts.validated}/${ts.total}`}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className={`text-xs font-bold tabular-nums ${isActive ? 'text-white' : 'text-warm-600'}`}>{pct}%</span>
                    {isActive && (
                      <span className="badge text-[9px] bg-white/25 text-white border-0">ACTIVA</span>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isExpanded ? '-rotate-180' : ''} ${isActive ? 'text-white/60' : 'text-warm-300'}`} />
                </button>
                {withTarimas && (
                  isActive && canMarkAnormalidad && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTarimaPersistedEventIds.length === 0) return
                        openBulkMarkAnormalidad({
                          eventIds: activeTarimaPersistedEventIds,
                          count: activeTarimaPersistedEventIds.length,
                          scopeLabel: `T${ts.num}`,
                          ubicacion: formatTarimaLocation(ts.num) || '',
                        })
                      }}
                      disabled={activeTarimaPersistedEventIds.length === 0 || markScanEventAsNovedadMut.isPending || markScanEventsAsNovedadBulkMut.isPending}
                      className={`p-2 rounded-lg transition-colors shrink-0 disabled:opacity-35 disabled:cursor-not-allowed ${isActive ? 'text-white/70 hover:bg-white/20 hover:text-white' : 'text-warning-500 hover:text-warning-700 hover:bg-warning-50'}`}
                      title={t('rec.val.markAnormalidad.tooltip')}
                    >
                      <AlertTriangle size={11} />
                    </button>
                  )
                )}
                {withTarimas && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isOffline) { toast.error(t('rec.val.toast.transferTarimaNeedsInternet')); return }
                      setTarimaTransferModal({ open: true, fromNum: ts.num, fromBases: ts.bases }); setTransferToTarima('')
                    }}
                    disabled={ts.empty || isOffline}
                    className={`p-2 mr-2 rounded-lg transition-colors shrink-0 disabled:opacity-35 disabled:cursor-not-allowed ${isActive ? 'text-white/60 hover:bg-white/20 hover:text-white' : 'text-warm-300 hover:text-primary-600 hover:bg-primary-50'}`}
                    title={isOffline ? 'Requiere conexión a internet' : t('rec.tarimas.transfer.btn')}
                  >
                    <ArrowRightLeft size={11} />
                  </button>
                )}
                {canDeleteTarimaGroup && (tarimaScanEventsByNum.get(ts.num) || []).some(event => isPersistedScanEventId(event.id)) && (
                  <button
                    type="button"
                    onClick={() => setDeleteGroupModal({ open: true, ubicacion: formatTarimaLocation(ts.num), label: `T${ts.num}`, type: 'tarima', tarimaNum: ts.num })}
                    className={`p-2 mr-2 rounded-lg transition-colors shrink-0 ${isActive ? 'text-white/75 hover:bg-white/20 hover:text-white' : 'text-danger-400 hover:text-danger-700 hover:bg-danger-50'}`}
                    title={t('rec.val.deleteGroup.tarima')}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                {ts.empty && (
                  <button
                    type="button"
                    onClick={async () => {
                      const nextEmptyTarimas = savedEmptyTarimas.filter(num => num !== ts.num)
                      try {
                        await persistTarimaAssignments(new Map(lockedTarimaMap), nextEmptyTarimas)
                        toast.success(t('common.deleted'))
                      } catch {
                        // handled by mutation toast
                      }
                    }}
                    disabled={saveValidationConfigMut.isPending}
                    className={`p-2 mr-2 rounded-lg transition-colors shrink-0 ${isActive ? 'text-white/60 hover:bg-white/20 hover:text-white' : 'text-danger-400 hover:text-danger-600 hover:bg-danger-50'}`}
                    title={t('common.delete')}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
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
                  {scanEvents.length > 0 && (
                    <div className={`px-3 py-2 ${isActive ? 'bg-white/5' : 'bg-sky-50/45'}`}>
                      <div className={`mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide ${isActive ? 'text-white/65' : 'text-sky-600'}`}>
                        <span>{t('rec.tarimas.panel.validated_scans')}</span>
                        <span className="tabular-nums">{scanEvents.length}</span>
                      </div>
                      <div className="space-y-1">
                        <div className={`grid grid-cols-[2rem_1rem_minmax(0,1fr)_8.5rem] gap-2 px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${isActive ? 'text-white/75' : 'text-warm-500'}`}>
                          <span>#</span>
                          <span />
                          <span>{t('rec.scan.col.codigo')}</span>
                          <span className="text-right">{t('rec.scan.col.fecha_hora')}</span>
                        </div>
                        {scanEvents.map((item, scanIndex) => {
                          const canActOnEvent = item.persisted && isPersistedScanEventId(item.id)
                          return (
                            <div key={item.id || `${item.code}-${item.scannedAt}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${isActive ? 'bg-white/10' : 'bg-white/85'}`}>
                              <span className={`w-6 shrink-0 text-[10px] font-black tabular-nums ${isActive ? 'text-white/75' : 'text-primary-500'}`}>{scanIndex + 1}</span>
                              <CheckCircle2 className={`w-3 h-3 shrink-0 ${isActive ? 'text-white/75' : 'text-success-500'}`} />
                              <div className="min-w-0 flex-1">
                                <p className={`truncate font-mono text-[10px] font-semibold ${isActive ? 'text-white/85' : 'text-warm-700'}`}>{item.code}</p>
                              </div>
                              <span className={`w-[8.5rem] shrink-0 text-right text-[9px] font-medium tabular-nums ${isActive ? 'text-white/80' : 'text-warm-600'}`}>
                                {formatScanDateTime(item.scannedAt)}
                              </span>
                              {canActOnEvent && (canMarkAnormalidad || canDeleteScan || (canUndoLastValidation && item.id === latestPersistedValidationId)) && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {canMarkAnormalidad && (
                                    <button
                                      type="button"
                                      onClick={() => openSingleMarkAnormalidad(item, item.ubicacion || formatTarimaLocation(ts.num) || '')}
                                      disabled={markScanEventAsNovedadMut.isPending || markScanEventsAsNovedadBulkMut.isPending}
                                      className={`p-1 rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${isActive ? 'text-white/80 hover:bg-white/15' : 'text-warning-600 hover:bg-warning-50'}`}
                                      title={t('rec.val.markAnormalidad.tooltip')}
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                    </button>
                                  )}
                                  {(canDeleteScan || (canUndoLastValidation && item.id === latestPersistedValidationId)) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPendingDeleteMode(canDeleteScan ? 'event' : 'last-validation')
                                        setPendingDeleteEventId(item.id)
                                        setConfirmDeleteOpen(true)
                                      }}
                                      disabled={deleteScanEventMut.isPending || deleteLastValidationMut.isPending}
                                      className={`p-1 rounded-md transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${isActive ? 'text-white/80 hover:bg-white/15' : 'text-danger-500 hover:bg-danger-50'}`}
                                      title={t('rec.val.delete.tooltip')}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )

  if (isOrderError) {
    const status = orderError?.response?.status
    const message = status === 401
      ? t('rec.error.session_expired')
      : status === 403
        ? t('rec.error.no_permission_val')
        : (orderError?.response?.data?.error || orderError?.message || t('rec.error.load_order'))
    return (
      <div className="flex flex-col h-full">
        {!embedded && (<Header title={t('rec.scan.title')} icon={PackageCheck} />)}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-danger-100 bg-danger-50/70 p-5 text-center shadow-sm">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger-500" />
            <p className="text-sm font-semibold text-danger-800">{message}</p>
            <button
              type="button"
              onClick={() => status === 401 ? navigate('/login', { replace: true }) : goBack()}
              className="btn-primary mt-4"
            >
              {status === 401 ? t('auth.loginBtn') : t('common.back')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading || !order) return (
    <div className="flex flex-col h-full">
      {!embedded && (<Header title={t('rec.scan.title')} icon={PackageCheck} />)}
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" text={t('common.loading')} delayMs={1000} />
      </div>
      <OfflineBlockedModal isBlocked={isOffline && !order} />
    </div>
  )

  if (bootingSession && !showModeSelection) return (
    <div className="flex flex-col h-full">
      {!embedded && (<Header title={order.folio} icon={PackageCheck} />)}
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" text={t('common.loading')} delayMs={0} />
      </div>
    </div>
  )

  const scanReady = linesReady && !linesLoading
  const scanInputProps = {
    type: 'text',
    className: 'w-full pl-12 pr-4 py-3.5 text-lg bg-white border-2 border-warm-200 rounded-2xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide',
    placeholder: scanReady ? (t('rec.scan.placeholder') || 'Escanear código...') : t('rec.val.loadingLines'),
    onKeyDown: handleKeyDown,
    disabled: !scanReady || (!withTarimas && !ubicacionConfirmed),
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    inputMode: 'none',
  }

  return (
    <div className={`flex flex-col bg-warm-50 overflow-hidden${embedded ? ' flex-1' : ' h-screen-safe'}`}>

      {/* ── Header ── */}
      {!embedded && (
      <Header
        hideUserOnMobile
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
              onClick={() => goBack()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-warm-200 text-warm-500 hover:bg-warm-50 hover:text-sky-600 transition-colors"
              title="Lista de órdenes"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            {withTarimas && (
              <button
                type="button"
                onClick={() => setMobilePanelOpen(true)}
                className="lg:hidden flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-700 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('rec.tarimas.label')}</span>
                <span className="opacity-70 font-normal">({totalTarimas})</span>
              </button>
            )}
            {/* Ubicacion panel button (when not in tarimas mode) */}
            {!withTarimas && allUbicacionGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileUbicacionPanelOpen(true)}
                className="lg:hidden flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-700 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{t('rec.val.ubicacion.label')}</span>
                <span className="opacity-70 font-normal">({allUbicacionGroups.length})</span>
              </button>
            )}
            {/* Completar ubicacion (when confirmed and has scans) */}
            {!withTarimas && ubicacionConfirmed && activeUbicacionScanCount > 0 && (
              <button
                type="button"
                onClick={completarUbicacion}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-primary-300 bg-primary-600 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('rec.val.btn.completar')}</span>
                <span className="sm:hidden">{t('rec.val.mobile.completar_ubi')}</span>
              </button>
            )}
            {/* Force close */}
            {canForceClose && (
              <button
                type="button"
                onClick={() => setForceCloseOpen(true)}
                className="hidden sm:flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-warning-200 text-xs font-semibold text-warning-600 hover:bg-warning-50 transition-colors"
                title={t('rec.val.forceClose.title')}
              >
                <XOctagon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('rec.val.forceClose.btn')}</span>
              </button>
            )}
            {/* Terminar — desktop only */}
            <button
              onClick={endSession}
              disabled={isEndingSession}
              className="hidden sm:flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-danger-200 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-60 transition-colors"
            >
              {isEndingSession ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
              <span>{t('rec.val.btn.terminar')}</span>
            </button>
          </div>
        }
      />
      )}

      {/* ── Portal: beam action buttons into the top Header when embedded ── */}
      {embedded && headerActionsSlot && createPortal(
        <>
          <button onClick={endSession} disabled={isEndingSession} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-warm-200 text-warm-500 hover:bg-warm-50 hover:text-sky-600 disabled:opacity-60 transition-colors" title={t('common.back')}>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-5 bg-warm-200 mx-0.5" />
          {withTarimas && (
            <button type="button" onClick={() => setMobilePanelOpen(true)} className="lg:hidden flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-700 transition-colors">
              <Layers className="w-3.5 h-3.5" /><span>{t('rec.tarimas.label')}</span><span className="opacity-70 font-normal">({totalTarimas})</span>
            </button>
          )}
          {!withTarimas && allUbicacionGroups.length > 0 && (
            <button type="button" onClick={() => setMobileUbicacionPanelOpen(true)} className="lg:hidden flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-700 transition-colors">
              <MapPin className="w-3.5 h-3.5" /><span>{t('rec.val.ubicacion.label')}</span><span className="opacity-70 font-normal">({allUbicacionGroups.length})</span>
            </button>
          )}
          {!withTarimas && ubicacionConfirmed && activeUbicacionScanCount > 0 && (
            <button type="button" onClick={completarUbicacion} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-primary-300 bg-primary-600 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">
              <Check className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('rec.val.btn.completar')}</span>
              <span className="sm:hidden">{t('rec.val.mobile.completar_ubi')}</span>
            </button>
          )}
          {canForceClose && (
            <button type="button" onClick={() => setForceCloseOpen(true)} className="hidden sm:flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-warning-200 text-xs font-semibold text-warning-600 hover:bg-warning-50 transition-colors" title={t('rec.val.forceClose.title')}>
              <XOctagon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('rec.val.forceClose.btn')}</span>
            </button>
          )}
          <button onClick={endSession} disabled={isEndingSession} className="hidden sm:flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-danger-200 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-60 transition-colors">
            {isEndingSession ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
            <span>{t('rec.val.btn.terminar')}</span>
          </button>
        </>,
        headerActionsSlot
      )}

      {/* ── Offline banner ── */}
      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium shrink-0">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Sin conexión — escaneos en cola para sincronizar. <strong>No trabaje en esta orden con otro operador simultaneamente: sin red no hay sincronización y se generarán duplicados.</strong></span>
        </div>
      )}

      {/* ── Body: flex row (main content + sidebar) ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">

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
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-success-600 mt-0.5">{order?.estado === 'anormal' ? t('rec.cajas_registradas') : t('rec.cajas_validadas')}</p>
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
              {order?.estado === 'anormal' && (
                <div className="mt-2.5 flex items-center gap-2 bg-danger-50 border border-danger-200 text-danger-700 rounded-xl px-3 py-2 text-sm font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {t('rec.status.anormal')}
                </div>
              )}
              {progressPct >= 100 && (
                <div className="mt-2.5 flex items-center gap-2 bg-success-50 border border-success-200 text-success-700 rounded-xl px-3 py-2 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {t('rec.status.completo')} {t('rec.val.allValidated')}
                </div>
              )}
            </div>

            {/* ── Desktop scan input ── */}
            <div className={`hidden sm:block card p-3 sm:p-4 sticky top-0 z-[11] bg-gradient-to-br from-sky-50/40 via-white to-white border-sky-100 shadow-[0_6px_22px_-12px_rgba(14,165,233,0.22)] backdrop-blur-sm ${(!withTarimas && !ubicacionConfirmed) || !scanReady ? 'opacity-60' : ''}`}>
              <div className="relative">
                <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sky-500 pointer-events-none" />
                {!scanReady && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Loader2 className="h-4 w-4 animate-spin text-primary-500" /></span>}
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
                    key={lastResult.seq || `${lastResult.code}-${lastResult.result}-${lastResult.at || ''}`}
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.18 }}
                    className="relative"
                  >
                    <button
                      type="button"
                      onClick={() => setLastResult(null)}
                      onTouchEnd={(e) => { e.preventDefault(); setLastResult(null) }}
                      style={{ touchAction: 'manipulation', minWidth: 36, minHeight: 36 }}
                      className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-white/70 hover:text-warm-700 flex items-center justify-center"
                      title={t('common.close')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {withTarimas && lastTarimaNum && lastTarimaColor && (
                      <div className={`${sidebarVisible ? 'sm:hidden' : ''} rounded-2xl flex flex-col items-center justify-center py-6 mb-3 ${lastTarimaColor.bg} ring-4 ${lastTarimaColor.ring} ring-offset-2`}>
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">{t('rec.tarimas.label')}</p>
                        <p className="text-[80px] sm:text-[96px] font-black text-white leading-none tabular-nums">{lastTarimaNum}</p>
                        <p className="text-xs font-mono text-white/60 mt-1">{lastTarimaBase}</p>
                        <p className="text-sm font-black text-white mt-2 tabular-nums">{activeTarimaCountLabel}</p>
                        {activeTarimaStat && !activeTarimaStat.empty && (
                          <div className="mt-2 w-32 max-w-full">
                            <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                              <div className="h-full rounded-full bg-white/80 transition-all duration-500" style={{ width: `${activeTarimaPct}%` }} />
                            </div>
                            <p className="mt-1 text-[10px] font-semibold text-white/70 text-center">{activeTarimaPct}%</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`p-4 pr-12 rounded-2xl flex items-center gap-3 border backdrop-blur-sm ${cfg.bg}`}>
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
              const batchCount = activeUbicacionScanCount
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
                          onClick={() => { setUbicacionConfirmed(false); setLocationInputValue(selectedUbicacion || ''); setTimeout(() => { locationRef.current?.focus(); locationRef.current?.select() }, 80) }}
                          className="flex items-center gap-1 text-accent-600 hover:text-accent-800 hover:bg-accent-100 transition-colors rounded-lg px-1.5 py-1 text-[10px] font-semibold shrink-0"
                          title={t('rec.val.ubicacion.edit')}
                        >
                          <Edit3 size={11} />
                          <span className="hidden sm:inline">{t('rec.val.ubicacion.edit')}</span>
                          <span className="sm:hidden">{t('rec.val.mobile.cambiar')}</span>
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
                                          {((canMarkAnormalidad || canDeleteScan || canDeleteScanGroup || (canUndoLastValidation && h.id === latestPersistedValidationId)) && h.result === 'correcto' && isPersistedScanEventId(h.id)) && (
                                            <div className="inline-flex items-center justify-end gap-1">
                                              {canDeleteScanGroup && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    if (isOffline) { toast.error('Cambiar ubicación requiere conexión a internet'); return }
                                                    setEditUbicacionModal({ from: h.ubicacion || null, eventId: h.id, scope: 'event' })
                                                    setEditUbicacionValue((h.ubicacion || '').toUpperCase())
                                                  }}
                                                  disabled={isOffline || relocateUbicacionMut.isPending || updateScanLocationMut.isPending}
                                                  className="p-1 rounded-md text-primary-500 hover:bg-primary-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                                  title={isOffline ? 'Requiere conexión a internet' : t('rec.val.ubicacion.edit')}
                                                >
                                                  <Edit3 className="w-3 h-3" />
                                                </button>
                                              )}
                                              {canMarkAnormalidad && (
                                                <button
                                                  type="button"
                                                  onClick={() => openSingleMarkAnormalidad(h, h.ubicacion || '')}
                                                  disabled={markScanEventAsNovedadMut.isPending || markScanEventsAsNovedadBulkMut.isPending}
                                                  className="p-1 rounded-md text-warning-600 hover:bg-warning-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                                  title={t('rec.val.markAnormalidad.tooltip')}
                                                >
                                                  <AlertTriangle className="w-3 h-3" />
                                                </button>
                                              )}
                                              {(canDeleteScan || (canUndoLastValidation && h.id === latestPersistedValidationId)) && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setPendingDeleteMode(canDeleteScan ? 'event' : 'last-validation')
                                                    setPendingDeleteEventId(h.id)
                                                    setConfirmDeleteOpen(true)
                                                  }}
                                                  disabled={deleteScanEventMut.isPending || deleteLastValidationMut.isPending}
                                                  className="p-1 rounded-md text-danger-500 hover:bg-danger-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                                  title={t('rec.val.delete.tooltip')}
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              )}
                                            </div>
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
                </div>
                <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '208px' }}>
                  <table className="w-full min-w-[560px] text-xs">
                    <thead className="bg-warm-50 border-b border-warm-100">
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
                        const tarimaNum = withTarimas ? (parseTarimaNumber(h.ubicacion) || (base ? (effectiveTarimaMap.get(base) ?? null) : null)) : null
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
                              {((canMarkAnormalidad || canDeleteScan || canDeleteScanGroup || (canUndoLastValidation && h.id === latestPersistedValidationId)) && h.result === 'correcto' && isPersistedScanEventId(h.id)) && (
                                <div className="inline-flex items-center justify-end gap-1">
                                  {canDeleteScanGroup && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isOffline) { toast.error('Cambiar ubicación requiere conexión a internet'); return }
                                        setEditUbicacionModal({ from: h.ubicacion || null, eventId: h.id, scope: 'event' })
                                        setEditUbicacionValue((h.ubicacion || '').toUpperCase())
                                      }}
                                      disabled={isOffline || relocateUbicacionMut.isPending || updateScanLocationMut.isPending}
                                      className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                      title={isOffline ? 'Requiere conexión a internet' : t('rec.val.ubicacion.edit')}
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {canMarkAnormalidad && (
                                    <button
                                      type="button"
                                      onClick={() => openSingleMarkAnormalidad(h, h.ubicacion || '')}
                                      disabled={markScanEventAsNovedadMut.isPending || markScanEventsAsNovedadBulkMut.isPending}
                                      className="p-1.5 rounded-lg text-warning-600 hover:bg-warning-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                      title={t('rec.val.markAnormalidad.tooltip')}
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {(canDeleteScan || (canUndoLastValidation && h.id === latestPersistedValidationId)) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPendingDeleteMode(canDeleteScan ? 'event' : 'last-validation')
                                        setPendingDeleteEventId(h.id)
                                        setConfirmDeleteOpen(true)
                                      }}
                                      disabled={deleteScanEventMut.isPending || deleteLastValidationMut.isPending}
                                      className="p-1.5 rounded-lg text-danger-600 hover:bg-danger-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                      title={t('rec.val.delete.tooltip')}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
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

        {/* ── Side panel — wrapper always rendered so toggle stays at panel edge ── */}
        <div className={`hidden lg:flex shrink-0 relative ${sidebarVisible ? 'w-[400px]' : 'w-0'}`}>
          <button
            type="button"
            onClick={() => setSidebarVisible(v => !v)}
            title={sidebarVisible ? 'Ocultar panel' : 'Mostrar panel'}
            className="hidden lg:flex absolute -left-5 top-4 z-20 h-10 w-10 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-500 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600"
          >
            {sidebarVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
          {sidebarVisible && (
          <div className={`w-full h-full flex flex-col border-l border-warm-100 backdrop-blur-2xl animate-fade-in overflow-hidden ${
            withTarimas
              ? 'bg-gradient-to-b from-white via-white to-sky-50/20 shadow-[-16px_0_34px_-28px_rgba(14,165,233,0.38)]'
              : 'bg-gradient-to-b from-white via-white to-primary-50/20 shadow-[-16px_0_34px_-28px_rgba(37,99,235,0.38)]'
          }`}>
            {withTarimas ? renderPanelBody() : renderUbicacionPanelBody()}
          </div>
          )}
        </div>

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
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-2.5 py-1.5 rounded-full flex-1 min-w-0 truncate">
              <MapPin size={11} className="shrink-0" />{selectedUbicacion || t('rec.val.ubicacion.skip')}
            </span>
            <button
              type="button"
              onClick={() => { setUbicacionConfirmed(false); setLocationInputValue(selectedUbicacion || ''); setTimeout(() => { locationRef.current?.focus(); locationRef.current?.select() }, 80) }}
              className="h-8 px-3 rounded-xl text-xs font-semibold text-warm-600 bg-warm-100 hover:bg-warm-200 active:scale-95 transition-all inline-flex items-center gap-1.5 shrink-0"
            >
              <Edit3 size={12} />
              {t('rec.val.mobile.cambiar')}
            </button>
          </div>
        )}

        <div className={`relative ${(!withTarimas && !ubicacionConfirmed) || !scanReady ? 'opacity-60' : ''}`}>
          <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sky-500 pointer-events-none" />
          {!scanReady && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Loader2 className="h-4 w-4 animate-spin text-primary-500" /></span>}
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
              style={{ maxHeight: '82vh' }}
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
              style={{ maxHeight: '82vh' }}
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

      {/* ── Initial validation mode selection ── */}
      <ValidationModeSelectorModal
        isOpen={showModeSelection}
        onClose={cancelValidation}
        mode={pendingMode}
        onModeChange={setPendingMode}
        groupSmallCodes={groupSmallCodes}
        onGroupSmallCodesChange={setGroupSmallCodes}
        minCajasParaAgrupar={minCajasParaAgrupar}
        onMinCajasChange={(value) => {
          setMinCajasParaAgrupar(value)
          setMaxCajasEnGrupo(current => Math.max(value, current))
        }}
        maxCajasEnGrupo={maxCajasEnGrupo}
        onMaxCajasChange={setMaxCajasEnGrupo}
        onConfirm={() => { void selectValidationMode(pendingMode) }}
        isSubmitting={saveValidationConfigMut.isPending}
        t={t}
      />
      {/* ── Duplicate scan block modal ── */}
      <Modal
        isOpen={dupModal.open}
        onClose={() => { setDupModal({ open: false, code: null, entry: null }); refocus() }}
        title={t('rec.val.dup.title')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              onClick={() => openForceEntryModal(dupModal.code)}
              className="btn-ghost"
              disabled={!dupModal.code}
            >
              {t('rec.val.forceEntry.btn')}
            </button>
            <button onClick={() => { setDupModal({ open: false, code: null, entry: null }); refocus() }} className="btn-primary">
              {t('rec.val.dup.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{dupModal.entry?.message || t('rec.val.dup.body')}</p>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 space-y-1.5">
            <p className="font-mono font-bold text-warning-800 text-base break-all">{dupModal.code}</p>
            {dupModal.entry?.reason && (
              <p className="text-[11px] font-semibold text-warning-700 uppercase tracking-wide">
                {dupModal.entry.reason}
              </p>
            )}
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
            {dupModal.entry?.ubicacion && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-warning-300 bg-white/70 px-2.5 py-2 text-warning-900">
                {withTarimas ? <Layers className="h-4 w-4 shrink-0" /> : <MapPin className="h-4 w-4 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-warning-600">
                    {withTarimas ? t('rec.val.dup.tarima') : t('rec.val.dup.location')}
                  </p>
                  <p className="truncate font-mono text-sm font-black">
                    {withTarimas ? `T${parseTarimaNumber(dupModal.entry.ubicacion) || dupModal.entry.ubicacion}` : dupModal.entry.ubicacion}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Code belongs to another inbound order ── */}
      <Modal
        isOpen={crossOrderModal.open}
        onClose={() => { setCrossOrderModal({ open: false, code: null, order: null }); refocus() }}
        title={t('rec.val.crossOrder.title')}
        icon={XOctagon}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              onClick={() => { setCrossOrderModal({ open: false, code: null, order: null }); refocus() }}
              className="btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={openCrossOrder}
              className="btn-primary"
              disabled={!crossOrderModal.order?.id}
            >
              {t('rec.val.crossOrder.open')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.val.crossOrder.body')}</p>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 space-y-2">
            <p className="font-mono font-bold text-warning-800 text-base break-all">{crossOrderModal.code}</p>
            {crossOrderModal.order && (
              <div className="rounded-lg bg-white/80 border border-warning-100 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm font-black text-warm-900 truncate">{crossOrderModal.order.folio}</p>
                  <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-bold uppercase text-warning-700">
                    {t(`rec.status.${crossOrderModal.order.estado}`) || crossOrderModal.order.estado}
                  </span>
                </div>
                <p className="text-xs text-warm-500 truncate">{crossOrderModal.order.cliente || '—'}</p>
                <p className="text-[11px] font-semibold text-warning-700">
                  {t('rec.val.crossOrder.pending').replace('{n}', Number(crossOrderModal.order.pending_exact_lines ?? crossOrderModal.order.pending_lines ?? 0))}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-warm-500 leading-relaxed">{t('rec.val.crossOrder.hint')}</p>
        </div>
      </Modal>

      {/* ── Delete confirm modal ── */}
      <Modal
        isOpen={confirmDeleteOpen}
        onClose={resetDeleteModal}
        title={t('rec.val.delete.title')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button onClick={resetDeleteModal} className="btn-ghost">{t('common.cancel')}</button>
            <button
              onClick={() => {
                if (pendingDeleteMode === 'last-validation') deleteLastValidationMut.mutate()
                else if (pendingDeleteEventId) deleteScanEventMut.mutate(pendingDeleteEventId)
              }}
              disabled={(pendingDeleteMode === 'last-validation' ? deleteLastValidationMut.isPending : deleteScanEventMut.isPending) || (pendingDeleteMode !== 'last-validation' && !pendingDeleteEventId)}
              className="btn-danger disabled:opacity-50"
            >
              {(deleteScanEventMut.isPending || deleteLastValidationMut.isPending) ? t('common.loading') : t('rec.val.delete.btn')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          {pendingDeleteMode === 'last-validation'
            ? t('rec.val.delete.last_validation_desc')
            : t('rec.val.delete.desc')}
        </p>
      </Modal>

      <Modal
        isOpen={deleteGroupModal.open}
        onClose={() => setDeleteGroupModal({ open: false, ubicacion: '', label: '', type: 'ubicacion', tarimaNum: null })}
        title={deleteGroupModal.type === 'tarima' ? t('rec.val.deleteGroup.tarimaTitle') : t('rec.val.deleteGroup.ubicacionTitle')}
        icon={Trash2}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteGroupModal({ open: false, ubicacion: '', label: '', type: 'ubicacion', tarimaNum: null })}
              className="btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => deleteLocationScansMut.mutate(deleteGroupModal.ubicacion)}
              disabled={!deleteGroupModal.ubicacion || deleteLocationScansMut.isPending}
              className="btn-danger disabled:opacity-50"
            >
              {deleteLocationScansMut.isPending ? t('common.loading') : t('rec.val.deleteGroup.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-3">
            <p className="font-mono text-base font-black text-danger-800">{deleteGroupModal.label}</p>
          </div>
          <p className="text-sm leading-relaxed text-warm-700">
            {deleteGroupModal.type === 'tarima' ? t('rec.val.deleteGroup.tarimaDesc') : t('rec.val.deleteGroup.ubicacionDesc')}
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={markAnormalidadModal.open}
        onClose={closeMarkAnormalidadModal}
        title={t('rec.val.markAnormalidad.title')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              onClick={closeMarkAnormalidadModal}
              className="btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => {
                if (markAnormalidadModal.mode === 'bulk') {
                  if (markAnormalidadModal.eventIds.length > 0) {
                    markScanEventsAsNovedadBulkMut.mutate({
                      eventIds: markAnormalidadModal.eventIds,
                      tipo: markAnormalidadModal.tipo,
                      ubicacion: markAnormalidadModal.ubicacion || null,
                    })
                  }
                  return
                }
                if (markAnormalidadModal.event?.id) {
                  markScanEventAsNovedadMut.mutate({
                    eventId: markAnormalidadModal.event.id,
                    tipo: markAnormalidadModal.tipo,
                    ubicacion: markAnormalidadModal.ubicacion || null,
                  })
                }
              }}
              disabled={
                !markAnormalidadModal.tipo ||
                markScanEventAsNovedadMut.isPending ||
                markScanEventsAsNovedadBulkMut.isPending ||
                (markAnormalidadModal.mode === 'bulk'
                  ? markAnormalidadModal.eventIds.length === 0
                  : !markAnormalidadModal.event?.id)
              }
              className="btn-primary disabled:opacity-50"
            >
              {(markScanEventAsNovedadMut.isPending || markScanEventsAsNovedadBulkMut.isPending)
                ? t('common.loading')
                : t('rec.val.markAnormalidad.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">
            {markAnormalidadModal.mode === 'bulk'
              ? t('rec.val.markAnormalidad.bulk_helper').replace('{count}', String(markAnormalidadModal.count))
              : t('rec.val.markAnormalidad.helper')}
          </p>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-700">{t('rec.val.markAnormalidad.match')}</p>
            <p className="font-mono font-bold text-warning-900 break-all">
              {markAnormalidadModal.mode === 'bulk' ? markAnormalidadModal.scopeLabel || '—' : (markAnormalidadModal.event?.code || '—')}
            </p>
            {markAnormalidadModal.mode === 'bulk' && (
              <p className="text-xs text-warning-700">
                <span className="font-semibold">{t('rec.val.markAnormalidad.bulk_count')}:</span>{' '}
                <span className="font-mono">{markAnormalidadModal.count}</span>
              </p>
            )}
            {markAnormalidadModal.ubicacion && (
              <p className="text-xs text-warning-700">
                <span className="font-semibold">{t('rec.scan.col.ubicacion')}:</span>{' '}
                <span className="font-mono">{markAnormalidadModal.ubicacion}</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-warm-600">{t('rec.val.forceEntry.tipo')}</label>
            <select
              value={markAnormalidadModal.tipo}
              onChange={e => setMarkAnormalidadModal(prev => ({ ...prev, tipo: e.target.value }))}
              className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('rec.otros.select_tipo')}</option>
              {(tiposData?.tipos || []).map((tipo) => (
                <option key={tipo.id} value={tipo.nombre}>{tipo.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-warm-600">{t('rec.val.forceEntry.ubicacion')}</label>
            <input
              value={markAnormalidadModal.ubicacion}
              onChange={e => setMarkAnormalidadModal(prev => ({ ...prev, ubicacion: e.target.value.toUpperCase() }))}
              className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm font-mono"
              placeholder={t('rec.val.forceEntry.ubicacion_placeholder')}
            />
          </div>
        </div>
      </Modal>

      {/* ── Force close modal ── */}
      <Modal
        isOpen={canForceClose && forceCloseOpen}
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
              onClick={async () => {
                if (isOffline) { toast.error(t('rec.val.toast.transferTarimaNeedsInternet')); return }
                const toNum = parseInt(transferToTarima)
                if (!toNum || toNum === tarimaTransferModal.fromNum) return
                const nextMap = new Map(lockedTarimaMap)
                for (const base of tarimaTransferModal.fromBases) nextMap.set(base, toNum)
                const nextEmptyTarimas = new Set(savedEmptyTarimas)
                const fromNum = tarimaTransferModal.fromNum
                if (![...nextMap.values()].some(num => num === fromNum)) nextEmptyTarimas.add(fromNum)
                else nextEmptyTarimas.delete(fromNum)
                nextEmptyTarimas.delete(toNum)
                try {
                  await persistTarimaAssignments(nextMap, [...nextEmptyTarimas])
                  setTarimaOverrides(new Map(nextMap))
                  setTarimaTransferModal({ open: false, fromNum: null, fromBases: [] })
                  setTransferToTarima('')
                } catch {
                  // handled by mutation toast
                }
              }}
              disabled={isOffline || !transferToTarima || parseInt(transferToTarima) === tarimaTransferModal.fromNum || saveValidationConfigMut.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {isOffline ? 'Sin conexión' : saveValidationConfigMut.isPending ? t('common.loading') : t('rec.tarimas.transfer.confirm')}
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

      {/* ── Edit ubicacion modal ── */}
      <Modal
        isOpen={!!editUbicacionModal}
        onClose={() => { setEditUbicacionModal(null); setEditUbicacionValue('') }}
        title={t('rec.val.ubicacion.edit')}
        icon={Edit3}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => { setEditUbicacionModal(null); setEditUbicacionValue('') }} className="btn-ghost">{t('common.cancel')}</button>
            <button
              onClick={() => {
                const nextLocation = editUbicacionValue.trim().toUpperCase()
                if (editUbicacionModal?.scope === 'event' && editUbicacionModal?.eventId) {
                  if (isOffline) { toast.error('Editar un escaneo puntual requiere conexión a internet'); return }
                  updateScanLocationMut.mutate({ eventId: editUbicacionModal.eventId, ubicacion: nextLocation })
                  return
                }
                relocateUbicacionMut.mutate({ from: editUbicacionModal?.from || '', to: nextLocation })
              }}
              disabled={
                (isOffline && editUbicacionModal?.scope === 'event') ||
                !editUbicacionValue.trim() ||
                editUbicacionValue.trim().toUpperCase() === String(editUbicacionModal?.from || '').trim().toUpperCase() ||
                relocateUbicacionMut.isPending ||
                updateScanLocationMut.isPending
              }
              className="btn-primary"
            >
              {isOffline && editUbicacionModal?.scope === 'event' ? 'Sin conexión' : (relocateUbicacionMut.isPending || updateScanLocationMut.isPending) ? t('admin.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs text-warm-500 mb-1">{t('rec.val.ubicacion.badge')}</p>
            <p className="font-mono text-sm font-bold text-warm-700 bg-warm-50 rounded-lg px-3 py-2">
              {editUbicacionModal?.scope === 'event'
                ? (editUbicacionModal?.from || t('rec.val.ubicacion.panel.sin_ub'))
                : (editUbicacionModal?.from || t('rec.val.ubicacion.panel.sin_ub'))}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('rec.val.ubicacion.edit')}</label>
            <input
              autoFocus
              value={editUbicacionValue}
              onChange={e => setEditUbicacionValue(e.target.value.toUpperCase())}
              onKeyDown={e => {
                const nextLocation = editUbicacionValue.trim().toUpperCase()
                if (e.key === 'Enter' && nextLocation && nextLocation !== String(editUbicacionModal?.from || '').trim().toUpperCase()) {
                  if (editUbicacionModal?.scope === 'event' && editUbicacionModal?.eventId) {
                    if (isOffline) { toast.error('Editar un escaneo puntual requiere conexión a internet'); return }
                    updateScanLocationMut.mutate({ eventId: editUbicacionModal.eventId, ubicacion: nextLocation })
                    return
                  }
                  relocateUbicacionMut.mutate({ from: editUbicacionModal?.from || '', to: nextLocation })
                }
              }}
              className="input-field font-mono"
              placeholder="Ej: A28-03-01-02"
            />
          </div>
        </div>
      </Modal>

      {/* ── Rejection blocking modal ── */}
      <Modal
        isOpen={rejectModal.open}
        onClose={() => { setRejectModal({ open: false, code: null, message: null, reason: null }); refocus() }}
        title={t('rec.val.reject.title')}
        icon={XCircle}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              onClick={() => openForceEntryModal(rejectModal.code)}
              className="btn-ghost"
              disabled={!rejectModal.code}
            >
              {t('rec.val.forceEntry.btn')}
            </button>
            <button onClick={() => { setRejectModal({ open: false, code: null, message: null, reason: null }); refocus() }} className="btn-danger">
              {t('rec.val.reject.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{rejectModal.message || t('rec.val.reject.body')}</p>
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-3 space-y-1.5">
            <p className="font-mono font-bold text-danger-800 text-base break-all">{rejectModal.code}</p>
            {rejectModal.reason && (
              <p className="text-[11px] font-semibold text-danger-700 uppercase tracking-wide">
                {rejectModal.reason}
              </p>
            )}
          </div>
          <p className="text-xs text-warm-500 leading-relaxed">{t('rec.val.reject.hint')}</p>
        </div>
      </Modal>

      {/* ── Force entry modal ── */}
      <Modal
        isOpen={forceModal.open}
        onClose={() => setForceModal({ open: false, code: '', tipo: '', ubicacion: '' })}
        title={t('rec.val.forceEntry.title')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              onClick={() => setForceModal({ open: false, code: '', tipo: '', ubicacion: '' })}
              className="btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => forceEntryMut.mutate({
                tipo: forceModal.tipo,
                codigo: forceModal.code,
                ubicacion: forceModal.ubicacion || null,
              })}
              disabled={!forceModal.tipo || forceEntryMut.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {forceEntryMut.isPending ? t('common.loading') : t('rec.val.forceEntry.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.val.forceEntry.helper')}</p>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-warm-600">{t('rec.val.forceEntry.tipo')}</label>
            <select
              value={forceModal.tipo}
              onChange={e => setForceModal(prev => ({ ...prev, tipo: e.target.value }))}
              className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('rec.otros.select_tipo')}</option>
              {(tiposData?.tipos || []).map((tipo) => (
                <option key={tipo.id} value={tipo.nombre}>{tipo.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-warm-600">{t('rec.val.forceEntry.codigo')}</label>
            <input
              value={forceModal.code}
              onChange={e => setForceModal(prev => ({ ...prev, code: e.target.value }))}
              className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm font-mono"
              placeholder={t('rec.val.forceEntry.codigo_placeholder')}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-warm-600">{t('rec.val.forceEntry.ubicacion')}</label>
            <input
              value={forceModal.ubicacion}
              onChange={e => setForceModal(prev => ({ ...prev, ubicacion: e.target.value.toUpperCase() }))}
              className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm font-mono"
              placeholder={t('rec.val.forceEntry.ubicacion_placeholder')}
            />
          </div>
          <p className="text-[11px] text-warm-500 leading-relaxed">{t('rec.val.forceEntry.ubicacion_hint')}</p>
        </div>
      </Modal>

      {showEndingOverlay && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-warm-950/25 p-4 backdrop-blur-[3px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="flex min-w-[240px] flex-col items-center rounded-2xl border border-white/80 bg-white/95 px-8 py-7 text-center shadow-2xl"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <Loader2 className="h-6 w-6 animate-spin" />
            </span>
            <p className="mt-4 text-sm font-bold text-warm-800">{t('rec.val.endingSession')}</p>
            <p className="mt-1 text-xs text-warm-500">{t('rec.val.endingSessionHint')}</p>
          </motion.div>
        </div>,
        document.body
      )}

    </div>
  )
}
