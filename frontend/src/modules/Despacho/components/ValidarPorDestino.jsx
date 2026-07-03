import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScanLine, Loader2, X, Check, CheckCircle2, XCircle, AlertCircle,
  Layers, MapPin, Trash2, Radio, Clock3, Search, MoveRight,
  PanelRightClose, PanelRightOpen, PartyPopper, ExternalLink, Plus, Copy, WifiOff,
} from 'lucide-react'
import { useOfflineStore } from '../../../core/stores/offlineStore'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDateTime, toDateKey } from '../../../core/utils/dateFormat'
import { generateCodeVariations, normalizeCodeFast, normalizeScanCode } from '../../Shared/Wms/normalizeCode'
import { extractBaseCode } from '../../Shared/Wms/extractBaseCode'
import {
  getFolio, getFolioScans, addFolioScan, deleteFolioScan,
  moveFolioScanTarima, cerrarFolio, cancelarFolio, getOutboundList, removeDestinationOrder,
} from '../services/despachoService'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'
import OfflineBlockedModal from '../../../core/components/common/OfflineBlockedModal'

function genTarimaRef(num) {
  return 'T' + String(num).padStart(2, '0')
}

function normalizeTarimaRef(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return genTarimaRef(Number(raw))
  if (/^T\d+$/.test(raw)) return 'T' + raw.slice(1).padStart(2, '0')
  return raw
}

function getTarimaNum(tarimaRef) {
  const match = String(tarimaRef || '').match(/^T(\d+)$/i)
  return match ? Number(match[1]) : null
}

function isOrderComplete(order, validatedCount) {
  const expected = Number(order.bultos_esperados ?? order.bultos ?? 0)
  return expected > 0 && validatedCount >= expected
}

function isOrderPending(order, validatedCount) {
  const expected = Number(order.bultos_esperados ?? order.bultos ?? 0)
  return validatedCount < (expected || 1)
}

function buildScanCodeVariants(rawCode) {
  const normalized = normalizeScanCode(rawCode)
  if (!normalized) return []
  return generateCodeVariations(normalized, false)
}

function hasCodeVariant(codeSet, variants) {
  return variants.some((variant) => codeSet.has(variant))
}

function findFirstVariantMatch(variantMap, variants) {
  for (const variant of variants) {
    const match = variantMap.get(variant)
    if (match) return match
  }
  return null
}

function normalizeBaseCode(rawCode) {
  const normalized = normalizeCodeFast(extractBaseCode(rawCode) || rawCode)
  return normalized || ''
}

function parseOrderMeta(order) {
  if (!order?.notas || typeof order.notas !== 'string') return {}
  try {
    const parsed = JSON.parse(order.notas)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getDestinoName(order) {
  return String(order?.receiverName || order?.logisticsChannel || order?.destinatario || '').trim()
}

function getOrderDateKey(order) {
  const raw = order?.outboundTime || order?.expectedTime || order?.orderCreateTime || order?.outbound_date || ''
  if (!raw) return ''
  const str = String(raw).trim()
  const isoLike = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoLike) return `${isoLike[1]}-${String(isoLike[2]).padStart(2, '0')}-${String(isoLike[3]).padStart(2, '0')}`

  const slashDate = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (slashDate) {
    const first = Number(slashDate[1])
    const second = Number(slashDate[2])
    // Google Sheets M/D/Y default. Only treat first as day when first > 12.
    const day   = first > 12 ? first : second
    const month = first > 12 ? second : first
    return `${slashDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  try { return toDateKey(str) } catch { return '' }
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
    <span className={`group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-mono whitespace-nowrap ${toneClass}`}>
      {label ? <span className="shrink-0 font-semibold not-italic">{label}</span> : null}
      <span className="min-w-0 truncate">{value}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded p-0.5 text-current opacity-0 transition-opacity hover:bg-white/70 group-hover:opacity-100"
        title="Copiar"
      >
        {copied ? <Check className="h-3 w-3 text-success-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  )
}

const ScanInputBar = memo(function ScanInputBar({ inputRef, onSubmit, placeholder, buttonLabel, disabled }) {
  const [value, setValue] = useState('')

  const submit = useCallback(() => {
    const raw = value.trim()
    if (!raw || disabled) return
    setValue('')
    onSubmit(raw)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [disabled, inputRef, onSubmit, value])

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <div className="flex items-center gap-2 bg-white border-2 rounded-2xl px-4 h-11 flex-1 transition-colors border-primary-200 focus-within:border-primary-400">
        <ScanLine className="w-3.5 h-3.5 text-primary-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-400"
          autoComplete="off"
          disabled={disabled}
        />
        {value && (
          <button
            type="button"
            onClick={() => { setValue(''); inputRef.current?.focus() }}
            className="text-warm-400 hover:text-warm-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || disabled}
        className="btn-primary text-sm flex items-center justify-center gap-1.5 h-11 px-4 rounded-2xl disabled:opacity-50 w-full sm:w-auto"
      >
        <ScanLine className="w-3.5 h-3.5" />
        {buttonLabel}
      </button>
    </div>
  )
})

const OrderSearchBox = memo(function OrderSearchBox({ onSearchChange, placeholder }) {
  const [value, setValue] = useState('')
  const timerRef = useRef(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const commit = useCallback((nextValue, delay = 120) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSearchChange(nextValue), delay)
  }, [onSearchChange])

  const update = (nextValue) => {
    setValue(nextValue)
    commit(nextValue)
  }

  const clear = () => {
    setValue('')
    commit('', 0)
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-primary-100/80 bg-gradient-to-r from-white via-primary-50/55 to-white px-3 h-9 shadow-[0_8px_18px_-14px_rgba(37,99,235,0.45)] focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-100 mb-2.5 transition-all">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100/80 shrink-0">
        <Search className="w-3 h-3 text-primary-500" />
      </div>
      <input
        value={value}
        onChange={e => update(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-[13px] text-warm-700 outline-none placeholder:text-warm-400 focus-visible:outline-none"
      />
      {value && (
        <button type="button" onClick={clear} className="text-warm-400 hover:text-warm-600 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
})

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
  const pendingOnlineRef = useRef(new Set())
  const [currentTarimaNum, setCurrentTarimaNum] = useState(1)
  const [errorModal, setErrorModal] = useState(null)
  const [showConfirmCancel, setShowConfirmCancel] = useState(false)
  const [showConfirmCerrar, setShowConfirmCerrar] = useState(false)
  const [folioCerradoNum, setFolioCerradoNum] = useState(null)
  const [showPanel, setShowPanel] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [forceModal, setForceModal] = useState({ open: false, code: '', orderNo: '' })
  const [overLimitModal, setOverLimitModal] = useState({ open: false, payload: null, scanned: 0, expected: 0 })
  const [moveModal, setMoveModal] = useState({ open: false, scan: null, target: '' })
  const [removeOrderModal, setRemoveOrderModal] = useState({ open: false, order: null })
  const [pendingOfflineScans, setPendingOfflineScans] = useState([])
  const [orderDetailsByNo, setOrderDetailsByNo] = useState({})
  const isOffline = useOfflineStore((s) => s.status === 'offline')
  const detailsFetchingRef = useRef(new Set())

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

  const { data: outboundCacheData } = useQuery({
    queryKey: ['despacho-outbound-list'],
    queryFn: getOutboundList,
    enabled: false,
    staleTime: 60_000,
  })

  const isActive = folio && ['borrador', 'en_proceso'].includes(folio.estado)
  const editable = !!isActive && canWrite('despacho.folios')
  const currentTarimaRef = genTarimaRef(currentTarimaNum)

  useEffect(() => {
    if (editable) setTimeout(() => scanRef.current?.focus(), 100)
  }, [editable, folioId])

  useEffect(() => {
    if (currentTarimaNum !== 1 || scans.length === 0) return
    const latestScan = scans[scans.length - 1]
    const latestTarimaNum = getTarimaNum(latestScan?.tarima_ref)
    if (latestTarimaNum && latestTarimaNum > 1) setCurrentTarimaNum(latestTarimaNum)
  }, [currentTarimaNum, scans])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folio-scans', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folios'] })
    qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
  }

  const outboundRecords = outboundCacheData?.data?.records ?? []

  useEffect(() => {
    let cancelled = false
    const orderNos = orders.map(order => order.outbound_order_no).filter(Boolean)
    orderNos.forEach((orderNo) => {
      if (orderDetailsByNo[orderNo] !== undefined) return
      if (detailsFetchingRef.current.has(orderNo)) return
      detailsFetchingRef.current.add(orderNo)
      getOutboundDetail(orderNo)
        .then((detail) => {
          if (cancelled) return
          setOrderDetailsByNo(prev => ({
            ...prev,
            [orderNo]: detail?.data ?? null,
          }))
        })
        .catch(() => {
          if (cancelled) return
          setOrderDetailsByNo(prev => ({
            ...prev,
            [orderNo]: null,
          }))
        })
        .finally(() => {
          detailsFetchingRef.current.delete(orderNo)
        })
    })
    return () => { cancelled = true }
  }, [orders, orderDetailsByNo])

  const orderMetaByNo = useMemo(() => {
    const cachedByOrder = new Map(outboundRecords.map(record => [record.outboundOrderNo, record]))
    const map = new Map()
    orders.forEach((order) => {
      const savedMeta = parseOrderMeta(order)
      const cached = orderDetailsByNo[order.outbound_order_no] || cachedByOrder.get(order.outbound_order_no) || {}
      map.set(order.outbound_order_no, {
        logisticsTrackNo: savedMeta.logisticsTrackNo || cached.logisticsTrackNo || null,
        thirdOrderNo: savedMeta.thirdOrderNo || cached.thirdOrderNo || null,
        logisticsChannel: savedMeta.logisticsChannel || cached.logisticsChannel || null,
        destino: savedMeta.destino || getDestinoName(cached) || order.destinatario || folio?.destino || '',
        outboundDate: savedMeta.outbound_date || getOrderDateKey(cached),
        outboundBoxCount: savedMeta.outboundBoxCount || cached.outboundBoxCount || null,
        allCustomizeCodes: Array.isArray(savedMeta.allCustomizeCodes)
          ? savedMeta.allCustomizeCodes
          : Array.isArray(cached.allCustomizeCodes)
            ? cached.allCustomizeCodes
            : [],
      })
    })
    return map
  }, [orders, outboundRecords, orderDetailsByNo, folio?.destino])

  const validatedCountByOrderNo = useMemo(() => (
    scans.reduce((acc, scan) => {
      const orderNo = scan.matched_order_no || orders.find(order => order.id === scan.folio_order_id)?.outbound_order_no
      if (!orderNo) return acc
      acc[orderNo] = (acc[orderNo] || 0) + 1
      return acc
    }, {})
  ), [orders, scans])

  const getOrderExpectedCount = useCallback((order) => {
    const meta = orderMetaByNo.get(order.outbound_order_no) || {}
    const validated = validatedCountByOrderNo[order.outbound_order_no] || 0
    return Math.max(
      Number(order.bultos_esperados ?? meta.outboundBoxCount ?? order.bultos ?? 0),
      validated
    )
  }, [orderMetaByNo, validatedCountByOrderNo])

  const orderCodeLookup = useMemo(() => {
    const variants = new Map()
    const bases = new Map()
    orders.forEach((order) => {
      const meta = orderMetaByNo.get(order.outbound_order_no) || {}
      const rawCodes = [
        order.outbound_order_no,
        meta.logisticsTrackNo,
        meta.thirdOrderNo,
        ...(Array.isArray(meta.allCustomizeCodes) ? meta.allCustomizeCodes : []),
      ]
      rawCodes.filter(Boolean).forEach((rawCode) => {
        const normalized = normalizeCodeFast(rawCode)
        if (normalized) {
          generateCodeVariations(normalized, false).forEach((variant) => {
            if (!variants.has(variant)) variants.set(variant, order.outbound_order_no)
          })
        }

        const base = normalizeBaseCode(rawCode)
        if (base && !bases.has(base)) bases.set(base, order.outbound_order_no)
      })
    })
    return { variants, bases }
  }, [orders, orderMetaByNo])

  const externalCodeLookup = useMemo(() => {
    const folioOrderNos = new Set(orders.map(order => order.outbound_order_no))
    const variants = new Map()

    outboundRecords.forEach((record) => {
      if (!record?.outboundOrderNo || folioOrderNos.has(record.outboundOrderNo)) return
      const rawCodes = [
        record.outboundOrderNo,
        record.logisticsTrackNo,
        record.thirdOrderNo,
      ]
      rawCodes.filter(Boolean).forEach((rawCode) => {
        const normalized = normalizeCodeFast(rawCode)
        if (!normalized) return
        generateCodeVariations(normalized, false).forEach((variant) => {
          if (!variants.has(variant)) {
            variants.set(variant, {
              orderNo: record.outboundOrderNo,
              destino: getDestinoName(record),
              dateKey: getOrderDateKey(record),
            })
          }
        })
      })
    })

    return { variants }
  }, [orders, outboundRecords])

  const currentTarimaHasScans = useMemo(
    () => scans.some((scan) => (scan.tarima_ref || 'Sin tarima') === currentTarimaRef),
    [scans, currentTarimaRef]
  )

  const handleNextTarima = useCallback(() => {
    if (!currentTarimaHasScans) {
      addToast(t('desp.validar.destino.tarimaVacia'), 'warning')
      setTimeout(() => scanRef.current?.focus(), 60)
      return
    }

    const next = currentTarimaNum + 1
    setCurrentTarimaNum(next)
    addToast(`${t('desp.validar.destino.tarimaLista')} ${genTarimaRef(next)}`, 'success')
    setTimeout(() => scanRef.current?.focus(), 60)
  }, [addToast, currentTarimaHasScans, currentTarimaNum, t])

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

  const { mutate: doAddScan } = useMutation({
    mutationFn: (body) => addFolioScan(folioId, body),
    onMutate: async (body) => {
      const queryKey = ['despacho-folio-scans', folioId]
      await qc.cancelQueries({ queryKey })
      const optimisticId = `optimistic-${Date.now()}-${body?.codigo_caja || 'scan'}`
      const optimisticScan = {
        id: optimisticId,
        codigo_caja: body?.codigo_caja,
        tarima_ref: body?.tarima_ref || null,
        matched_order_no: body?.matched_order_no || null,
        validated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        validated_by_nombre: 'Pendiente',
        __optimistic: true,
      }

      qc.setQueryData(queryKey, (old) => {
        const oldScans = old?.scans ?? scans
        return { ...(old || {}), scans: [...oldScans, optimisticScan] }
      })

      return { queryKey, optimisticId }
    },
    onSuccess: (data, body, context) => {
      pendingOnlineRef.current.delete(body?.codigo_caja)
      if (Array.isArray(data?.scans)) {
        qc.setQueryData(['despacho-folio-scans', folioId], (old) => ({ ...(old || {}), scans: data.scans }))
      } else if (data?.scan) {
        qc.setQueryData(['despacho-folio-scans', folioId], (old) => ({
          ...(old || {}),
          scans: (old?.scans ?? scans).map(scan => scan.id === context?.optimisticId ? data.scan : scan),
        }))
      }
      qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
      qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
      const matchedOrderNo = body?.matched_order_no
      if (matchedOrderNo) {
        const matchedOrder = orders.find(order => order.outbound_order_no === matchedOrderNo)
        const expected = matchedOrder ? getOrderExpectedCount(matchedOrder) : 0
        if (expected > 0) {
          const scansAfterSave = Array.isArray(data?.scans)
            ? data.scans
            : (qc.getQueryData(['despacho-folio-scans', folioId])?.scans || [])
          const scanned = scansAfterSave.filter(scan => scan.matched_order_no === matchedOrderNo).length
          if (scanned === expected) {
            addToast(t('desp.validar.destino.ordenCompletaAlert')
              .replace('{orden}', matchedOrderNo)
              .replace('{count}', String(scanned)), 'warning')
          } else if (scanned > expected) {
            addToast(t('desp.validar.destino.ordenExcedidaAlert')
              .replace('{orden}', matchedOrderNo)
              .replace('{scanned}', String(scanned))
              .replace('{expected}', String(expected)), 'error')
          }
        }
      }
    },
    onError: (err, body, context) => {
      pendingOnlineRef.current.delete(body?.codigo_caja)
      if (context?.queryKey && context?.optimisticId) {
        qc.setQueryData(context.queryKey, (old) => ({
          ...(old || {}),
          scans: (old?.scans ?? []).filter(scan => scan.id !== context.optimisticId),
        }))
      }
      const code = err?.response?.data?.code
      const msg = err?.response?.data?.error || 'Error registrando escaneo'
      if (code === 'DUPLICATE_IN_FOLIO') {
        setErrorModal({ type: 'duplicate', message: msg })
      } else if (code === 'DUPLICATE_CROSS_FOLIO') {
        setErrorModal({ type: 'cross_folio', message: msg, folio_numero: err?.response?.data?.folio_numero })
      } else {
        addToast(msg, 'error')
      }
      setTimeout(() => scanRef.current?.focus(), 50)
    },
  })

  const { mutate: doDeleteScan } = useMutation({
    mutationFn: (scanId) => deleteFolioScan(folioId, scanId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-folio-scans', folioId] })
      qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
      qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
      addToast('Escaneo eliminado', 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error eliminando escaneo', 'error'),
  })

  const { mutate: doMoveScan, isPending: movingScan } = useMutation({
    mutationFn: ({ scanId, tarimaRef }) => moveFolioScanTarima(folioId, scanId, { tarima_ref: tarimaRef }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-folio-scans', folioId] })
      setMoveModal({ open: false, scan: null, target: '' })
      addToast(t('desp.validar.destino.tarimaMovida'), 'success')
      setTimeout(() => scanRef.current?.focus(), 60)
    },
    onError: (err) => addToast(err?.response?.data?.error || t('desp.validar.destino.tarimaMoverError'), 'error'),
  })

  const { mutate: doRemoveDestinationOrder, isPending: removingDestinationOrder } = useMutation({
    mutationFn: ({ orderId }) => removeDestinationOrder(folioId, orderId),
    onSuccess: (data, variables) => {
      if (data?.folio || Array.isArray(data?.orders)) {
        qc.setQueryData(['despacho-folio', folioId], data)
      }
      qc.setQueryData(['despacho-folio-scans', folioId], (old) => ({
        ...(old || {}),
        scans: (old?.scans ?? scans).filter(scan => (
          scan.folio_order_id !== variables.orderId && scan.matched_order_no !== variables.orderNo
        )),
      }))
      setRemoveOrderModal({ open: false, order: null })
      qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
      qc.invalidateQueries({ queryKey: ['despacho-folio-scans', folioId] })
      qc.invalidateQueries({ queryKey: ['despacho-folios'] })
      qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
      addToast(t('desp.validar.destino.removeOrderSuccess'), 'success')
      setTimeout(() => scanRef.current?.focus(), 80)
    },
    onError: (err) => addToast(err?.response?.data?.error || t('desp.validar.destino.removeOrderError'), 'error'),
  })

  const requestAddScan = useCallback((payload, { skipOverLimit = false } = {}) => {
    const matchedOrderNo = payload?.matched_order_no
    if (!skipOverLimit && matchedOrderNo) {
      const matchedOrder = orders.find(order => order.outbound_order_no === matchedOrderNo)
      const expected = matchedOrder ? getOrderExpectedCount(matchedOrder) : 0
      const scanned = scans.filter(scan => scan.matched_order_no === matchedOrderNo).length
      if (expected > 0 && scanned >= expected) {
        setOverLimitModal({ open: true, payload, scanned, expected })
        return
      }
    }
    if (payload?.codigo_caja) pendingOnlineRef.current.add(payload.codigo_caja)
    doAddScan(payload)
  }, [doAddScan, getOrderExpectedCount, orders, scans])

  const submitOverLimitScan = useCallback(() => {
    if (!overLimitModal.payload) return
    const code = overLimitModal.payload.codigo_caja
    if (code) pendingOnlineRef.current.add(code)
    doAddScan(overLimitModal.payload)
    setOverLimitModal({ open: false, payload: null, scanned: 0, expected: 0 })
    setTimeout(() => scanRef.current?.focus(), 100)
  }, [doAddScan, overLimitModal.payload])

  const handleScan = useCallback((rawInput) => {
    const raw = String(rawInput || '').trim()
    if (!raw) return
    const variants = buildScanCodeVariants(raw)
    const code = variants[0] || ''
    scanRef.current?.focus()
    if (!code) return

    // Duplicate check (server scans + locally pending)
    const scannedCodes = new Set()
    scans.forEach((scan) => {
      const normalized = normalizeCodeFast(scan.codigo_caja)
      if (!normalized) return
      generateCodeVariations(normalized, false).forEach((variant) => scannedCodes.add(variant))
    })
    if (hasCodeVariant(scannedCodes, variants) || pendingOnlineRef.current.has(code)) {
      setErrorModal({ type: 'duplicate', code })
      return
    }

    const baseCode = normalizeBaseCode(code)

    // Match by outbound_order_no, logisticsTrackNo, thirdOrderNo, or scanned base
    // against a prebuilt index for orders already inside this folio.
    const matchedOrderNo =
      findFirstVariantMatch(orderCodeLookup.variants, variants) ||
      orderCodeLookup.bases.get(baseCode) ||
      null

    if (!matchedOrderNo) {
      const externalMatch = findFirstVariantMatch(externalCodeLookup.variants, variants)
      const activeDate = [...orderMetaByNo.values()].find(meta => meta.outboundDate)?.outboundDate || ''
      const activeDestino = String(folio?.destino || '').trim()
      let message = null

      if (externalMatch) {
        const sameDate = activeDate && externalMatch.dateKey === activeDate
        const sameDestino = activeDestino && externalMatch.destino === activeDestino
        if (sameDate && !sameDestino) {
          message = `El codigo pertenece a la fecha ${externalMatch.dateKey}, pero a otro destino: ${externalMatch.destino || 'sin destino'}. Orden ${externalMatch.orderNo}.`
        } else if (!sameDate) {
          message = `El codigo pertenece a otra fecha (${externalMatch.dateKey || 'sin fecha'}) y destino ${externalMatch.destino || 'sin destino'}. Orden ${externalMatch.orderNo}.`
        } else {
          message = `El codigo existe en WMS, pero no esta dentro del pool activo de este folio. Orden ${externalMatch.orderNo}.`
        }
      }

      setErrorModal({ type: 'nomatch', code, allowForce: true, message })
      setTimeout(() => scanRef.current?.focus(), 100)
      return
    }

    if (isOffline) {
      const offlineBody = { codigo_caja: code, tarima_ref: currentTarimaRef, matched_order_no: matchedOrderNo }
      useOfflineStore.getState().enqueueModule({
        type: 'despacho_folio_scan',
        payload: { folioId, body: offlineBody },
      })
      setPendingOfflineScans(p => [...p, { code, matchedOrderNo }])
      addToast(`Offline: ${code} — se enviará al recuperar conexión`, 'info')
      return
    }

    requestAddScan({ codigo_caja: code, tarima_ref: currentTarimaRef, matched_order_no: matchedOrderNo })
  }, [scans, orderCodeLookup, externalCodeLookup, orderMetaByNo, folio?.destino, currentTarimaRef, isOffline, folioId, requestAddScan, addToast])

  const openForceModal = useCallback((code) => {
    setErrorModal(null)
    setForceModal({ open: true, code: code || '', orderNo: '' })
  }, [])

  const closeForceModal = useCallback(() => {
    setForceModal({ open: false, code: '', orderNo: '' })
    setTimeout(() => scanRef.current?.focus(), 100)
  }, [])

  const submitForceScan = useCallback(() => {
    const code = normalizeScanCode(forceModal.code)
    const orderNo = normalizeCodeFast(forceModal.orderNo)
    if (!code || !orderNo) return
    requestAddScan({ codigo_caja: code, tarima_ref: currentTarimaRef, matched_order_no: orderNo })
    setForceModal({ open: false, code: '', orderNo: '' })
    setTimeout(() => scanRef.current?.focus(), 100)
  }, [forceModal.code, forceModal.orderNo, currentTarimaRef, requestAddScan])

  const submitForceScanNoOrder = useCallback(() => {
    const code = normalizeScanCode(forceModal.code)
    if (!code) return
    requestAddScan({ codigo_caja: code, tarima_ref: currentTarimaRef, matched_order_no: null })
    setForceModal({ open: false, code: '', orderNo: '' })
    setTimeout(() => scanRef.current?.focus(), 100)
  }, [forceModal.code, currentTarimaRef, requestAddScan])

  const submitMoveScan = useCallback(() => {
    const scanId = moveModal.scan?.id
    const tarimaRef = normalizeTarimaRef(moveModal.target)
    if (!scanId || !tarimaRef) return
    doMoveScan({ scanId, tarimaRef })
  }, [doMoveScan, moveModal.scan?.id, moveModal.target])

  const submitRemoveOrder = useCallback(() => {
    const order = removeOrderModal.order
    const orderId = order?.id
    if (!orderId || removingDestinationOrder) return
    doRemoveDestinationOrder({ orderId, orderNo: order?.outbound_order_no })
  }, [doRemoveDestinationOrder, removeOrderModal.order, removingDestinationOrder])

  // KPI counts
  const totalEsperadas = orders.reduce((s, o) => {
    return s + getOrderExpectedCount(o)
  }, 0)
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
  const tarimaSummary = useMemo(() => (
    tarimaKeys.map((tarima) => ({ tarima, count: scansByTarima[tarima].length }))
  ), [tarimaKeys, scansByTarima])

  const removeOrderScansCount = useMemo(() => {
    const order = removeOrderModal.order
    if (!order) return 0
    return scans.filter(scan => scan.folio_order_id === order.id || scan.matched_order_no === order.outbound_order_no).length
  }, [removeOrderModal.order, scans])

  const searchedOrders = useMemo(() => {
    let filtered = [...orders]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(o => {
        if (o.outbound_order_no.toLowerCase().includes(q)) return true
        if (o.destinatario?.toLowerCase().includes(q)) return true
        const meta = orderMetaByNo.get(o.outbound_order_no)
        if (meta?.logisticsTrackNo?.toLowerCase().includes(q)) return true
        if (meta?.thirdOrderNo?.toLowerCase().includes(q)) return true
        return false
      })
    }
    return filtered
  }, [orders, searchQuery, orderMetaByNo])

  const statusCounts = useMemo(() => ({
    all: searchedOrders.length,
    pending: searchedOrders.filter(order => {
      const expected = getOrderExpectedCount(order)
      return (validatedCountByOrderNo[order.outbound_order_no] || 0) < (expected || 1)
    }).length,
    complete: searchedOrders.filter(order => {
      const expected = getOrderExpectedCount(order)
      return expected > 0 && (validatedCountByOrderNo[order.outbound_order_no] || 0) >= expected
    }).length,
  }), [searchedOrders, validatedCountByOrderNo, getOrderExpectedCount])

  // Filtered orders for panel
  const filteredOrders = useMemo(() => {
    if (statusFilter === 'complete') {
      return searchedOrders.filter(order => {
        const expected = getOrderExpectedCount(order)
        return expected > 0 && (validatedCountByOrderNo[order.outbound_order_no] || 0) >= expected
      })
    }
    if (statusFilter === 'pending') {
      return searchedOrders.filter(order => {
        const expected = getOrderExpectedCount(order)
        return (validatedCountByOrderNo[order.outbound_order_no] || 0) < (expected || 1)
      })
    }
    return searchedOrders
  }, [searchedOrders, statusFilter, validatedCountByOrderNo, getOrderExpectedCount])

  if (loadingFolio && !isOffline) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  }

  if (isOffline && !folioData) {
    return <OfflineBlockedModal isBlocked message="Los datos del folio no han sido cargados. Restablece la conexión para continuar." />
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
    <div className="flex h-full flex-col xl:flex-row overflow-hidden relative">

      {/* ── LEFT COLUMN (header + scan stream) ───────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 border-b border-amber-300 text-amber-800 text-xs font-semibold shrink-0">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          Modo offline — escaneos guardados localmente
          {pendingOfflineScans.length > 0 && <span className="ml-auto bg-amber-200 px-1.5 py-0.5 rounded-full">{pendingOfflineScans.length} pendientes</span>}
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-warm-100 px-4 sm:px-5 pt-4 pb-3 space-y-3">

        {/* Row 1: folio identity + action buttons */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
              </div>
            </div>
          </div>

          {/* Action buttons — right side of row 1 */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center shrink-0 w-full lg:w-auto lg:justify-end">
            <button
              type="button"
              onClick={() => setShowPanel(v => !v)}
              title={showPanel ? t('desp.validar.destino.ocultarPanel') : t('desp.validar.destino.mostrarPanel')}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-600 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600 shrink-0 ${
                showPanel ? 'xl:hidden' : 'sm:order-last'
              }`}
            >
              {showPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
            {editable && (
              <button
                type="button"
                onClick={handleNextTarima}
                disabled={!currentTarimaHasScans}
                title={!currentTarimaHasScans ? t('desp.validar.destino.tarimaVacia') : ''}
                className="h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl border border-accent-300 bg-accent-50 text-accent-700 text-xs font-semibold hover:bg-accent-100 transition-colors w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-accent-50"
              >
                <Layers className="w-3 h-3" />
                {t('desp.validar.destino.sigTarima')} ({genTarimaRef(currentTarimaNum + 1)})
              </button>
            )}
            {folio?.estado === 'en_proceso' && canWrite('despacho.folios') && (
              <button onClick={() => setShowConfirmCerrar(true)} disabled={cerrando}
                className="btn-success text-xs flex items-center justify-center gap-1 h-9 px-3 w-full sm:w-auto">
                {cerrando ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                {t('desp.validar.destino.cerrarFolio')}
              </button>
            )}
            {canUpdate && isActive && (
              <button onClick={() => setShowConfirmCancel(true)}
                className="btn-danger text-xs flex items-center justify-center gap-1 h-9 px-3 w-full sm:w-auto">
                <XCircle className="w-3 h-3" />{t('desp.validar.orden.cancelar')}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: KPI metrics strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
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
        <ScanInputBar
          inputRef={scanRef}
          onSubmit={handleScan}
          placeholder={t('desp.validar.orden.scanPlaceholder')}
          buttonLabel={t('desp.validar.orden.validarBtn')}
          disabled={!editable}
        />

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
          <div className="px-4 py-3 border-b border-warm-100 bg-warm-50/70 shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-warm-700">{t('desp.validar.destino.flujo')}</span>
              <span className="text-[11px] text-warm-400 tabular-nums">{scans.length} total</span>
            </div>
            {tarimaSummary.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tarimaSummary.map(({ tarima, count }) => (
                  <span
                    key={tarima}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm ${
                      tarima === currentTarimaRef
                        ? 'border-accent-300 bg-accent-100 text-accent-800'
                        : 'border-warm-200 bg-white text-warm-700'
                    }`}
                  >
                    <span className="text-xs font-black">{tarima}</span>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-sm font-black tabular-nums">{count}</span>
                  </span>
                ))}
              </div>
            )}
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
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-warm-50/90 sticky top-0 z-[2] border-b border-warm-100">
                      <Layers className="w-4 h-4 text-accent-600 shrink-0" />
                      <span className="text-sm font-black text-accent-800">{tarima}</span>
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-100 px-3 py-1 text-sm font-black text-accent-800 tabular-nums">
                        {scansByTarima[tarima].length}
                        <span className="text-[10px] font-bold uppercase tracking-wide">{t('desp.validar.destino.cajasTotal')}</span>
                      </span>
                    </div>
                    {[...scansByTarima[tarima]]
                      .sort((a, b) => new Date(a.validated_at || a.created_at || 0) - new Date(b.validated_at || b.created_at || 0))
                      .map((s, i) => (
                      <div key={`${tarima}-${s.id || s.codigo_caja || 'scan'}-${i}`} className={`flex items-center gap-2.5 px-4 py-2.5 group hover:bg-warm-50 transition-colors ${
                        i === 0 ? 'bg-primary-50/30' : ''
                      }`}>
                        <span className="w-5 text-right text-[10px] text-warm-400 tabular-nums shrink-0">
                          {i + 1}
                        </span>
                        {s.__optimistic
                          ? <Loader2 className="w-3 h-3 text-primary-500 shrink-0 animate-spin" />
                          : <Check className="w-3 h-3 text-success-500 shrink-0" />
                        }
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
                        {editable && !s.__optimistic && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setMoveModal({ open: true, scan: s, target: s.tarima_ref || currentTarimaRef })}
                              className="p-1 rounded-lg text-warm-300 hover:text-accent-600 hover:bg-accent-50 transition-all"
                              title={t('desp.validar.destino.moverTarima')}
                            >
                              <MoveRight className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => doDeleteScan(s.id)}
                              className="p-1 rounded-lg text-warm-300 hover:text-danger-500 hover:bg-danger-50 transition-all"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
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

      {/* Right: orders side panel */}
      <div className={`shrink-0 relative transition-all ${showPanel ? 'w-full xl:w-[29rem] 2xl:w-[33rem]' : 'w-0 xl:w-0'}`}>
        {showPanel && (
        <div className="w-full h-full flex flex-col border-t xl:border-t-0 xl:border-l border-warm-100 bg-gradient-to-b from-white via-white to-primary-50/20 shadow-[-16px_0_34px_-28px_rgba(37,99,235,0.38)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              title={t('desp.validar.destino.ocultarPanel')}
              className="hidden xl:flex absolute -left-4 top-4 z-20 h-9 w-9 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-600 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600"
            >
              <PanelRightClose size={15} />
            </button>
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-warm-100 bg-warm-50/50 shrink-0">
              <div className="flex items-center gap-2.5 mb-3 min-w-0">
                <h4 className="min-w-0 flex-1 truncate text-[15px] font-bold text-warm-700">{t('desp.validar.destino.ordenesDestino')}</h4>
                <span className="badge shrink-0 bg-primary-100 text-primary-700 text-xs font-semibold">{orders.length}</span>
              </div>

              {/* Search */}
              <OrderSearchBox
                onSearchChange={setSearchQuery}
                placeholder={t('desp.validar.destino.searchPlaceholder')}
              />

              {/* Status filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {[
                  { k: 'all', l: t('desp.validar.destino.filtroTodas') },
                  { k: 'pending', l: t('desp.validar.destino.filtroPend') },
                  { k: 'complete', l: t('desp.validar.destino.filtroListas') },
                ].map(({ k, l }) => (
                  <button key={k} onClick={() => setStatusFilter(k)}
                    className={`flex-1 h-8 px-2.5 text-xs font-semibold rounded-lg border transition-all ${
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
                      <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
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
            <div className="flex-1 overflow-y-auto p-3 bg-warm-50/55">
              {filteredOrders.length === 0 ? (
                <div className="py-9 text-center text-sm text-warm-400">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Sin resultados'
                    : t('desp.validar.destino.sinOrdenes')}
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredOrders.map(order => {
                const validadas = validatedCountByOrderNo[order.outbound_order_no] || 0
                const meta = orderMetaByNo.get(order.outbound_order_no) || {}
                const esperadas = getOrderExpectedCount(order)
                const pct = esperadas > 0 ? Math.min(100, Math.round((validadas / esperadas) * 100)) : null
                const enrich = meta
                const complete = esperadas > 0 && validadas >= esperadas

                return (
                  <div key={order.id} className={`p-3.5 rounded-2xl border transition-all shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)] ${
                    complete
                      ? 'border-success-200 bg-gradient-to-br from-success-50/60 via-white to-white'
                      : 'border-warm-200/90 bg-white hover:border-primary-100 hover:shadow-[0_14px_28px_-18px_rgba(37,99,235,0.3)]'
                  }`}>
                    {/* Order header */}
                    <div className="flex items-start justify-between gap-2.5 mb-2.5">
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
                        className="group inline-flex min-w-0 items-start gap-2 text-left"
                      >
                        <span className="min-w-0 font-mono text-xs font-black leading-snug text-primary-700 break-all">
                          {order.outbound_order_no}
                        </span>
                        <span className="shrink-0 rounded p-0.5 text-warm-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-warm-100 hover:text-primary-600">
                          <Copy className="h-3 w-3" />
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                          complete ? 'bg-success-100 text-success-700' : 'bg-warm-100 text-warm-600'
                        }`}>
                          {complete && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {validadas}/{esperadas || '?'}
                        </span>
                        {canUpdate && isActive && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setRemoveOrderModal({ open: true, order })
                            }}
                            title={t('desp.validar.destino.removeOrderTooltip')}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-danger-100 bg-white text-danger-500 transition-colors hover:bg-danger-50 hover:text-danger-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Destinatario */}
                    {order.destinatario && (
                      <p className="text-[11px] leading-[1.1rem] text-warm-500 font-medium break-words min-h-[2.25rem] mb-2">
                        {order.destinatario}
                      </p>
                    )}

                    {/* Trucking + Reference */}
                    <div className="flex min-h-[1.75rem] flex-nowrap items-start gap-1.5 mb-2.5 overflow-hidden">
                      {enrich?.logisticsTrackNo ? (
                        <CopyMetaPill value={enrich.logisticsTrackNo} tone="primary" />
                      ) : (
                        <span className="shrink-0 text-[10px] text-warm-300 italic">{t('desp.validar.destino.sinTracking')}</span>
                      )}
                      {enrich?.thirdOrderNo && (
                        <CopyMetaPill label="Ref:" value={enrich.thirdOrderNo} tone="warm" />
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
                            <span className="text-[10px] text-warm-400">{pct}%</span>
                            <span className="text-[10px] text-danger-500">{Math.max(0, esperadas - validadas)} pend.</span>
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

      {/* ── Remove order from destination modal ── */}
      <Modal
        isOpen={removeOrderModal.open}
        onClose={() => {
          if (removingDestinationOrder) return
          setRemoveOrderModal({ open: false, order: null })
          setTimeout(() => scanRef.current?.focus(), 80)
        }}
        title={t('desp.validar.destino.removeOrderTitle')}
        icon={Trash2}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRemoveOrderModal({ open: false, order: null })
                setTimeout(() => scanRef.current?.focus(), 80)
              }}
              disabled={removingDestinationOrder}
              className="btn-secondary text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submitRemoveOrder}
              disabled={!removeOrderModal.order?.id || removingDestinationOrder}
              className="btn-danger text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {removingDestinationOrder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('desp.validar.destino.removeOrderConfirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">
            {t('desp.validar.destino.removeOrderBody')}
          </p>
          <div className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-danger-500">
              {t('desp.validar.orden.col.orden')}
            </p>
            <p className="font-mono text-sm font-bold text-danger-800 break-all">
              {removeOrderModal.order?.outbound_order_no || '—'}
            </p>
            <p className="mt-1 text-xs text-danger-700">
              {t('desp.validar.destino.removeOrderScans').replace('{count}', String(removeOrderScansCount))}
            </p>
          </div>
        </div>
      </Modal>

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
          <div className="flex justify-end gap-2">
            {errorModal?.type === 'nomatch' && errorModal?.allowForce && editable && (
              <button
                type="button"
                onClick={() => openForceModal(errorModal.code)}
                className="btn-danger text-sm"
              >
                {t('desp.validar.destino.forceOpen')}
              </button>
            )}
            <button onClick={closeErrorModal} className="btn-primary text-sm">
              {t('desp.validar.destino.entendido')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          {errorModal?.type === 'nomatch'
            ? (
              errorModal.message
                ? <>{errorModal.message}</>
                : <>{t('desp.validar.destino.codNoMatchPre')}<span className="font-mono font-semibold">{errorModal.code}</span>{t('desp.validar.destino.codNoMatchPost')}</>
            )
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

      {/* ── Move scan to tarima modal ── */}
      <Modal
        isOpen={moveModal.open}
        onClose={() => setMoveModal({ open: false, scan: null, target: '' })}
        title={t('desp.validar.destino.moverTarima')}
        icon={MoveRight}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMoveModal({ open: false, scan: null, target: '' })}
              className="btn-secondary text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submitMoveScan}
              disabled={!moveModal.target.trim() || movingScan}
              className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {movingScan && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('desp.validar.destino.confirmarMover')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-warm-100 bg-warm-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-warm-400">
              {t('desp.validar.destino.codigoEscaneado')}
            </p>
            <p className="font-mono text-sm font-bold text-warm-800 break-all">{moveModal.scan?.codigo_caja}</p>
            <p className="mt-1 text-xs text-warm-500">
              {t('desp.validar.destino.tarimaActual')}: <span className="font-mono font-semibold">{moveModal.scan?.tarima_ref || 'Sin tarima'}</span>
            </p>
          </div>

          {tarimaSummary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tarimaSummary.map(({ tarima, count }) => (
                <button
                  key={`move-${tarima}`}
                  type="button"
                  onClick={() => setMoveModal(prev => ({ ...prev, target: tarima }))}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    normalizeTarimaRef(moveModal.target) === tarima
                      ? 'border-primary-300 bg-primary-100 text-primary-700'
                      : 'border-warm-200 bg-white text-warm-600 hover:border-primary-200 hover:text-primary-600'
                  }`}
                >
                  {tarima}
                  <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[11px] tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-warm-600">
              {t('desp.validar.destino.tarimaDestino')}
            </span>
            <input
              type="text"
              value={moveModal.target}
              onChange={e => setMoveModal(prev => ({ ...prev, target: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitMoveScan()
                }
              }}
              placeholder="T02"
              className="w-full rounded-xl border border-warm-200 px-3 py-2 text-sm font-mono uppercase outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
              autoComplete="off"
              autoFocus
            />
          </label>
        </div>
      </Modal>

      {/* ── Over-limit forced box confirmation ── */}
      <Modal
        isOpen={overLimitModal.open}
        onClose={() => {
          setOverLimitModal({ open: false, payload: null, scanned: 0, expected: 0 })
          setTimeout(() => scanRef.current?.focus(), 100)
        }}
        title={t('desp.validar.destino.overLimitTitle')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOverLimitModal({ open: false, payload: null, scanned: 0, expected: 0 })
                setTimeout(() => scanRef.current?.focus(), 100)
              }}
              className="btn-secondary text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submitOverLimitScan}
              className="btn-danger text-sm"
            >
              {t('desp.validar.destino.overLimitConfirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">
            {t('desp.validar.destino.overLimitBody')
              .replace('{orden}', overLimitModal.payload?.matched_order_no || '—')
              .replace('{scanned}', String(overLimitModal.scanned))
              .replace('{expected}', String(overLimitModal.expected))}
          </p>
          <div className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-danger-500">
              {t('desp.validar.destino.codigoEscaneado')}
            </p>
            <p className="font-mono text-sm font-bold text-danger-800 break-all">
              {overLimitModal.payload?.codigo_caja}
            </p>
          </div>
          <p className="text-xs text-warm-500">
            {t('desp.validar.destino.overLimitWarning')}
          </p>
        </div>
      </Modal>

      {/* ── Force scan assignment modal ── */}
      <Modal
        isOpen={forceModal.open}
        onClose={closeForceModal}
        title={t('desp.validar.destino.forceTitle')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex justify-between gap-2">
            <button type="button" onClick={closeForceModal} className="btn-secondary text-sm">
              {t('common.cancel')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitForceScanNoOrder}
                className="btn-secondary text-sm border-amber-300 text-amber-700 hover:bg-amber-50"
                title="Ingresar sin vincular a ninguna orden — requiere conciliación manual"
              >
                Sin orden
              </button>
              <button
                type="button"
                onClick={submitForceScan}
                disabled={!forceModal.orderNo.trim()}
                className="btn-danger text-sm disabled:opacity-50"
              >
                {t('desp.validar.destino.forceConfirm')}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">
            {t('desp.validar.destino.forceBody')}
          </p>
          <div className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-danger-500">
              {t('desp.validar.destino.codigoEscaneado')}
            </p>
            <p className="font-mono text-sm font-bold text-danger-800 break-all">{forceModal.code}</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-warm-600">
              {t('desp.validar.destino.forceOrderLabel')}
            </span>
            <input
              type="text"
              value={forceModal.orderNo}
              onChange={e => setForceModal(prev => ({ ...prev, orderNo: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitForceScan()
                }
              }}
              placeholder={t('desp.validar.destino.forceOrderPlaceholder')}
              className="w-full rounded-xl border border-warm-200 px-3 py-2 text-sm font-mono uppercase outline-none focus:border-danger-300 focus:ring-2 focus:ring-danger-100"
              autoComplete="off"
              autoFocus
            />
          </label>
          <p className="text-xs text-warm-500">
            {t('desp.validar.destino.forceWarning')}
          </p>
          <p className="text-xs text-amber-600 border border-amber-100 bg-amber-50 rounded-lg px-2.5 py-1.5">
            "Sin orden" ingresa el codigo al folio sin vincularlo a ninguna orden — requiere conciliacion manual posterior.
          </p>
        </div>
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
