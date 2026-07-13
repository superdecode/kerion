import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Copy, Check, PackageCheck, ScanBarcode, Printer,
  Download, Trash2, CheckCircle2, Clock, Search, X,
  User, Hash, Truck, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, AlertTriangle, MapPin, Plus, XOctagon,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import TablePagination from '../../../core/components/common/TablePagination'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import CatalogEmptyHint from '../../../core/components/common/CatalogEmptyHint'
import StatusPill from '../../../core/components/common/StatusPill'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { getOrder, getOrderExportData, getScanEvents, updateOrder, updateLine, getListaRecepcion, deleteLastValidationRecord, deleteScanEvent, getNovedades, createNovedad, deleteNovedad, getNovedadTipos, markScanEventAsNovedad } from '../services/recepcionService'
import { STALE } from '../../../core/constants/queryConfig'
import { buildListaRecepcionData, generateListaRecepcionXlsx } from '../utils/listaRecepcionReport'
import ListaRecepcionPreviewModal from '../components/ListaRecepcionPreviewModal'
import { useRecepcionValidationLauncher } from '../hooks/useRecepcionValidationLauncher'
import { normalizeCode } from '../../Shared/Wms/normalizeCode'
import * as XLSX from 'xlsx'

const ESTADO_META = {
  pendiente_validacion: { cls: 'bg-warm-100 text-warm-600' },
  en_validacion:        { cls: 'bg-sky-100 text-sky-700' },
  completo:             { cls: 'bg-success-100 text-success-700' },
  parcial:              { cls: 'bg-warning-100 text-warning-700' },
  anormal:              { cls: 'bg-danger-100 text-danger-700' },
  cancelado:            { cls: 'bg-danger-100 text-danger-700' },
}

const LINE_META = {
  pendiente: { cls: 'bg-warm-100 text-warm-600' },
  validada:  { cls: 'bg-success-100 text-success-700', locked: true },
  faltante:  { cls: 'bg-danger-100 text-danger-700' },
}

const SCAN_RESULT_META = {
  correcto:      { cls: 'bg-success-100 text-success-700' },
  duplicado:     { cls: 'bg-warning-100 text-warning-700' },
  no_encontrado: { cls: 'bg-danger-100 text-danger-700' },
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <button onClick={copy} className="ml-1 p-0.5 text-warm-300 hover:text-warm-600 transition-colors opacity-0 group-hover:opacity-100">
      {copied ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function CopyInline({ value, className = '', mono = false }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (event) => {
    event.stopPropagation()
    if (!value) return
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className={`group inline-flex max-w-full items-center gap-1.5 ${className}`}>
      <span className={`truncate ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
      {value ? (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-0.5 text-warm-300 opacity-0 transition-all hover:bg-warm-100 hover:text-primary-600 group-hover:opacity-100"
          title={t('common.copy')}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  )
}

function GeneralInfoBlock({ icon: Icon, label, value, tone = 'warm', mono = false }) {
  const toneCls = {
    warm:    'border-warm-100/80 bg-white/85 text-warm-500',
    primary: 'border-primary-100/80 bg-primary-50/55 text-primary-600',
    sky:     'border-sky-100/80 bg-sky-50/55 text-sky-600',
    success: 'border-success-100/80 bg-success-50/55 text-success-600',
  }
  return (
    <div className={`rounded-xl border px-3 py-3 shadow-sm ${toneCls[tone] || toneCls.warm}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
          <div className="mt-1 text-sm font-bold text-warm-800">
            <CopyInline value={value} mono={mono} />
          </div>
        </div>
      </div>
    </div>
  )
}

const TH = 'table-header whitespace-nowrap'

const TIPO_META = {
  'Caja con Daños':    'bg-orange-100 text-orange-700',
  'Faltante':          'bg-danger-100 text-danger-700',
  'Sobrante':          'bg-success-100 text-success-700',
  'Caja Vacía':        'bg-warm-100 text-warm-600',
  'Mercancía Suelta':  'bg-warning-100 text-warning-700',
  'Caja Con Faltante': 'bg-orange-100 text-orange-700',
  'Código Duplicado':  'bg-sky-100 text-sky-700',
  'Producto Dañada':   'bg-danger-100 text-danger-700',
  'Caja Sin Etiqueta': 'bg-warm-100 text-warm-600',
  'SKU Sueltos':       'bg-primary-100 text-primary-700',
}

function normalizeNovedadCode(value) {
  const normalized = normalizeCode(value)
  return normalized || ''
}

function getReadableQueryError(error, t) {
  const data = error?.response?.data
  if (data?.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
  if (error?.code === 'ERR_BACKEND_UNAVAILABLE') return t('rec.error.backend_unavailable')
  if (error?.code === 'ERR_RATE_LIMITED') return t('rec.error.rate_limited')
  if (error?.message) return error.message
  return t('rec.error.load_order')
}

export default function RecepcionDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useI18nStore()
  const toast = useToastStore()
  const { hasPermission, isAuthenticated } = useAuthStore()
  const { openValidationFlow, validationModeModal } = useRecepcionValidationLauncher()

  const [activeTab, setActiveTab] = useState('detalle')
  const [lineSearchInput, setLineSearchInput] = useState('')
  const [lineSearch, setLineSearch] = useState('')
  const [eventSearchInput, setEventSearchInput] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [novedadSearchInput, setNovedadSearchInput] = useState('')
  const [novedadSearch, setNovedadSearch] = useState('')
  const [lineStatusModal, setLineStatusModal] = useState(null)
  const [pendingStatus, setPendingStatus] = useState('')
  const [pendingNota, setPendingNota] = useState('')
  const [listaPreviewOpen, setListaPreviewOpen] = useState(false)
  const [listaPreviewLoading, setListaPreviewLoading] = useState(false)
  const [listaPreviewData, setListaPreviewData] = useState(null)
  const [lineSortKey, setLineSortKey] = useState('custom_box_barcode')
  const [lineSortDir, setLineSortDir] = useState('asc')
  const [linePage, setLinePage] = useState(1)
  const [linePageSize, setLinePageSize] = useState(100)
  const [eventPage, setEventPage] = useState(1)
  const [eventPageSize, setEventPageSize] = useState(100)
  const [novPage, setNovPage] = useState(1)
  const [novPageSize, setNovPageSize] = useState(100)
  const [eventSortKey, setEventSortKey] = useState('scanned_at')
  const [eventSortDir, setEventSortDir] = useState('desc')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [forceCloseOpen, setForceCloseOpen] = useState(false)
  const [exportingScope, setExportingScope] = useState(null)
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [nuevoCodigo, setNuevoCodigo] = useState('')
  const [nuevaUbicacion, setNuevaUbicacion] = useState('')

  useEffect(() => {
    setActiveTab('detalle')
    setLineSearchInput('')
    setLineSearch('')
    setEventSearchInput('')
    setEventSearch('')
    setNovedadSearchInput('')
    setNovedadSearch('')
    setLinePage(1)
    setEventPage(1)
    setNovPage(1)
    setNuevoTipo('')
    setNuevoCodigo('')
    setNuevaUbicacion('')
  }, [id])

  const canQueryRecepcion = isAuthenticated
  const orderQueryParams = useMemo(() => ({
    lines_page: linePage,
    lines_limit: linePageSize,
    lines_q: lineSearch.trim() || undefined,
    lines_sort_key: lineSortKey,
    lines_sort_dir: lineSortDir,
  }), [linePage, linePageSize, lineSearch, lineSortKey, lineSortDir])

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['recepcion-order', id, orderQueryParams],
    queryFn: () => getOrder(id, orderQueryParams),
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.SHORT,
  })

  const { data: eventsData, isLoading: isEventsLoading } = useQuery({
    queryKey: ['recepcion-scan-events', id, 'detail'],
    queryFn: () => getScanEvents(id, { compact: 1, limit: 500 }),
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.SHORT,
  })

  const { data: bulkEventsData } = useQuery({
    queryKey: ['recepcion-scan-events', id, 'detail-bulk'],
    queryFn: () => getScanEvents(id, { compact: 1, bulk: 1 }, { timeout: 15000 }),
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: STALE.SHORT,
  })

  const { data: novedadesData } = useQuery({
    queryKey: ['recepcion-novedades', id],
    queryFn: () => getNovedades(id),
    enabled: canQueryRecepcion && Boolean(data?.order),
    retry: false,
    staleTime: STALE.SHORT,
  })

  const { data: tiposData } = useQuery({
    queryKey: ['recepcion-novedad-tipos'],
    queryFn: getNovedadTipos,
    enabled: canQueryRecepcion && Boolean(data?.order),
    retry: false,
    staleTime: STALE.MEDIUM,
  })

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, payload }) => updateLine(lineId, payload),
    onSuccess: () => {
      toast.success(t('rec.toast.statusUpdated'))
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      setLineStatusModal(null)
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const deleteLastMut = useMutation({
    mutationFn: () => deleteLastValidationRecord(id),
    onSuccess: () => {
      toast.success(t('rec.toast.lastDeleted'))
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      setConfirmDeleteOpen(false)
    },
    onError: (err) => toast.error(err.response?.data?.error || t('rec.toast.deleteError')),
  })

  const deleteScanEventMut = useMutation({
    mutationFn: (eventId) => deleteScanEvent(id, eventId),
    onSuccess: () => {
      toast.success(t('rec.toast.lastDeleted'))
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('rec.toast.deleteError')),
  })

  const markScanEventAsNovedadMut = useMutation({
    mutationFn: ({ eventId, tipo, ubicacion }) => markScanEventAsNovedad(id, eventId, { tipo, ubicacion }),
    onSuccess: () => {
      toast.success(t('rec.val.markAnormalidad.success'))
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      setMoveToOtrosModal({ open: false, event: null, tipo: '', ubicacion: '' })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const createNovedadMut = useMutation({
    mutationFn: (payload) => createNovedad(id, payload),
    onSuccess: () => {
      toast.success(t('rec.toast.novedad_ok'))
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
      setNuevoCodigo('')
      setNuevaUbicacion('')
    },
    onError: (err) => {
      if (err?.response?.status === 403) return toast.error(t('rec.novedad.error.perm'))
      toast.error(err?.response?.data?.error || t('toast.error'))
    },
  })

  const deleteNovedadMut = useMutation({
    mutationFn: (nid) => deleteNovedad(id, nid),
    onSuccess: () => {
      toast.success(t('rec.toast.novedad_deleted'))
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
    },
    onError: () => toast.error(t('toast.error')),
  })

  const forceCloseMut = useMutation({
    mutationFn: () => updateOrder(id, { estado: 'completo' }),
    onSuccess: () => {
      toast.success(t('rec.val.forceClose.success'))
      setForceCloseOpen(false)
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders-active'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const canValidate = hasPermission('recepcion.recibir', 'crear')
  const canEdit = hasPermission('recepcion.recibir', 'actualizar')
  const canCreate = hasPermission('recepcion.recibir', 'crear')
  const canMoveValidatedToOtros = hasPermission('recepcion.validacion', 'crear')
  const canDeleteEvents = hasPermission('recepcion.validacion', 'eliminar')
  const canForceClose = hasPermission('recepcion.validacion', 'actualizar')
  const [moveToOtrosModal, setMoveToOtrosModal] = useState({ open: false, event: null, tipo: '', ubicacion: '' })

  const submitNuevaNovedad = () => {
    if (!nuevoTipo || createNovedadMut.isPending) return

    const normalizedCodigo = normalizeNovedadCode(nuevoCodigo)
    if (nuevoCodigo !== normalizedCodigo) setNuevoCodigo(normalizedCodigo)

    createNovedadMut.mutate({
      tipo: nuevoTipo,
      codigo: normalizedCodigo,
      ubicacion: nuevaUbicacion,
    })
  }

  const lineUbicacionMap = useMemo(() => {
    const map = new Map()
    for (const ev of (bulkEventsData?.events || eventsData?.events || [])) {
      if (ev.resultado === 'correcto' && ev.line_id && ev.ubicacion) {
        map.set(ev.line_id, ev.ubicacion)
      }
    }
    return map
  }, [bulkEventsData?.events, eventsData?.events])

  const order = data?.order ?? {}
  const lines = data?.lines ?? []
  const linesMeta = data?.lines_meta ?? {}
  const events = bulkEventsData?.events || eventsData?.events || []
  const novedades = novedadesData?.novedades || []
  const linesTotal = Number(linesMeta.total ?? lines.length)

  const totalBase = Number(order.total_cajas || 0) > 0 ? Number(order.total_cajas) : Number(linesMeta.total_all || lines.length)
  const validadasFromOrder = Number(order.cajas_validadas ?? 0)
  const forzadasFromOrder = Number(order.cajas_forzadas || 0)
  const lineStatusCounts = useMemo(() => {
    if (linesMeta.status_counts) {
      return {
        validada: Number(linesMeta.status_counts.validada || 0),
        faltante: Number(linesMeta.status_counts.faltante || 0),
      }
    }
    let validada = 0
    let faltante = 0
    for (const line of lines) {
      if (line.estado_validacion === 'validada') validada++
      else if (line.estado_validacion === 'faltante') faltante++
    }
    return { validada, faltante }
  }, [lines, linesMeta.status_counts])
  const validadas = validadasFromOrder > 0 ? validadasFromOrder : lineStatusCounts.validada
  const faltantes = lineStatusCounts.faltante
  const pendientes = Math.max(totalBase - validadas - faltantes, 0)
  const progresoRaw = totalBase > 0 ? (validadas / totalBase) * 100 : 0
  const progreso = (() => {
    if (totalBase <= 0) return 0
    if (validadas === totalBase) return 100
    const val = parseFloat(progresoRaw.toFixed(1))
    if (val >= 100 && validadas < totalBase) return 99.9
    return val
  })()

  const estadoMeta = ESTADO_META[order.estado] ?? ESTADO_META.pendiente_validacion

  const handleLineSort = (key) => {
    if (lineSortKey === key) setLineSortDir((dir) => dir === 'asc' ? 'desc' : 'asc')
    else { setLineSortKey(key); setLineSortDir('asc') }
    setLinePage(1)
  }

  const handleEventSort = (key) => {
    if (eventSortKey === key) setEventSortDir((dir) => dir === 'asc' ? 'desc' : 'asc')
    else { setEventSortKey(key); setEventSortDir(key === 'scanned_at' ? 'desc' : 'asc') }
    setEventPage(1)
  }

  const handleApplyLineSearch = useCallback(() => {
    setLineSearch(lineSearchInput.trim())
    setLinePage(1)
  }, [lineSearchInput])

  const handleClearLineSearch = useCallback(() => {
    setLineSearchInput('')
    setLineSearch('')
    setLinePage(1)
  }, [])

  const handleApplyEventSearch = useCallback(() => {
    setEventSearch(eventSearchInput.trim())
    setEventPage(1)
  }, [eventSearchInput])

  const handleClearEventSearch = useCallback(() => {
    setEventSearchInput('')
    setEventSearch('')
    setEventPage(1)
  }, [])

  const handleApplyNovedadSearch = useCallback(() => {
    setNovedadSearch(novedadSearchInput.trim())
    setNovPage(1)
  }, [novedadSearchInput])

  const handleClearNovedadSearch = useCallback(() => {
    setNovedadSearchInput('')
    setNovedadSearch('')
    setNovPage(1)
  }, [])

  // Filtering and sorting happen server-side via orderQueryParams (lines_q, lines_sort_*)
  const displayLines = lines

  const filteredEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase()
    if (!q) return events
    return events.filter((e) => [e.codigo_escaneado, e.sku_asociado, e.resultado, e.scanned_by_nombre].some((v) => String(v || '').toLowerCase().includes(q)))
  }, [events, eventSearch])

  const filteredNovedades = useMemo(() => {
    const q = novedadSearch.trim().toLowerCase()
    if (!q) return novedades
    return novedades.filter((n) => [n.tipo, n.codigo, n.ubicacion, n.created_by_nombre].some((v) => String(v || '').toLowerCase().includes(q)))
  }, [novedades, novedadSearch])

  const sortedEvents = useMemo(() => {
    const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
    return [...filteredEvents].sort((a, b) => {
      const av = a?.[eventSortKey] ?? ''
      const bv = b?.[eventSortKey] ?? ''
      const cmp = eventSortKey === 'scanned_at'
        ? new Date(av).getTime() - new Date(bv).getTime()
        : collator.compare(String(av), String(bv))
      return eventSortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredEvents, eventSortKey, eventSortDir])

  const pagedLines = lines

  const pagedEvents = useMemo(() => {
    const start = (eventPage - 1) * eventPageSize
    return sortedEvents.slice(start, start + eventPageSize)
  }, [sortedEvents, eventPage, eventPageSize])

  const pagedNovedades = useMemo(() => {
    const start = (novPage - 1) * novPageSize
    return filteredNovedades.slice(start, start + novPageSize)
  }, [filteredNovedades, novPage, novPageSize])

  const loadingOrder = canQueryRecepcion && (isLoading || (isFetching && !data))

  if (loadingOrder) {
    return <div className="flex items-center justify-center h-full"><LoadingSpinner size="lg" text={t('common.loadingData')} delayMs={1000} /></div>
  }
  if (isError || !data) return (
    <div className="flex flex-col h-full">
      <Header title={t('rec.recibir.title')} icon={PackageCheck} />
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-danger-600">{t('rec.error.load_detalle')}</p>
        <p className="max-w-xl text-xs text-warm-500">{getReadableQueryError(error, t)}</p>
        <button onClick={() => navigate('/recepcion/recibir')} className="btn-ghost text-sm flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </button>
      </div>
    </div>
  )

  const appendDetalleSheet = (wb, exportData) => {
    const detalleRows = (exportData.lines || []).map((l, i) => [
      i + 1, l.box_type || '', l.custom_box_barcode || '', l.sku || '',
      l.qty_per_box || '',
      l.length_oms || '', l.width_oms || '', l.height_oms || '', l.dimension_unit || '',
      l.weight_oms || '', l.weight_unit || '',
      t(`rec.line.status.${l.estado_validacion}`),
      l.validation_ubicacion || lineUbicacionMap.get(l.id) || '',
      l.validated_by_nombre || '', l.validated_at ? fmtDateTime(l.validated_at) : '',
    ])
    const wsDetalle = XLSX.utils.aoa_to_sheet([
      ['#', 'Box Type', 'Custom Box Barcode', 'SKU', 'Qty/Caja',
       'Length (OMS)', 'Width (OMS)', 'Height (OMS)', 'Dim Unit', 'Weight (OMS)', 'Weight Unit',
       'Estado', 'Ubicación', 'Validado por', 'Hora validación'],
      ...detalleRows,
    ])
    wsDetalle['!cols'] = [
      { wch: 5 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
      { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, wsDetalle, t('common.detail'))
  }

  const appendValidacionSheet = (wb, exportData) => {
    const validRows = (exportData.events || []).map((ev, i) => [
      i + 1,
      ev.codigo_escaneado || '',
      ev.sku_asociado || '',
      ev.match_field || '',
      t(`rec.scan.result.${ev.resultado}`) || ev.resultado,
      ev.ubicacion || '',
      ev.scanned_by_nombre || '',
      ev.scanned_at ? fmtDateTime(ev.scanned_at) : '',
    ])
    const wsValid = XLSX.utils.aoa_to_sheet([
      ['#', 'Código Escaneado', 'SKU', 'Campo', 'Resultado', 'Ubicación', 'Escaneado por', 'Hora'],
      ...validRows,
    ])
    wsValid['!cols'] = [
      { wch: 5 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, wsValid, t('rec.validacion.title'))
  }

  const appendOtrosSheet = (wb, exportData) => {
    const otrosRows = (exportData.novedades || []).map((n, i) => [
      i + 1,
      n.tipo || '',
      n.codigo || '',
      n.ubicacion || '',
      n.created_by_nombre || '',
      n.created_at ? fmtDateTime(n.created_at) : '',
    ])
    const wsOtros = XLSX.utils.aoa_to_sheet([
      ['#', t('rec.otros.col.tipo'), t('rec.otros.col.codigo'), t('rec.otros.col.ubicacion'), t('rec.otros.col.registrado_por'), t('rec.otros.col.fecha_hora')],
      ...otrosRows,
    ])
    wsOtros['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsOtros, t('common.others'))
  }

  const runExport = async (scope) => {
    if (exportingScope) return
    setExportingScope(scope)
    try {
      toast.info(t('rec.export.preparing'))
      const exportData = await getOrderExportData(id, scope)
      if (exportData.meta?.large_export) {
        toast.info(t('rec.export.large').replace('{count}', Number(exportData.meta.total_rows || 0).toLocaleString('es-MX')))
      }
      const wb = XLSX.utils.book_new()
      if (scope === 'all' || scope === 'detalle') appendDetalleSheet(wb, exportData)
      if (scope === 'all' || scope === 'validacion') appendValidacionSheet(wb, exportData)
      if (scope === 'all' || scope === 'otros') appendOtrosSheet(wb, exportData)
      const suffix = scope === 'all' ? 'recepcion' : scope
      XLSX.writeFile(wb, `${exportData.order?.folio || order.folio}-${suffix}.xlsx`)
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'EXPORT_TOO_LARGE') {
        toast.error(data.error, { duration: 8000 })
      } else {
        const msg = data?.error || t('rec.export.error')
        const detail = data?.detail ? ` (${data.detail})` : ''
        toast.error(msg + detail)
      }
    } finally {
      setExportingScope(null)
    }
  }

  const handleExportWorkbook = () => runExport('all')
  const handleExportDetalle = () => runExport('detalle')
  const handleExportValidacion = () => runExport('validacion')
  const handleExportOtros = () => runExport('otros')

  const handleListaRecepcion = async () => {
    setListaPreviewLoading(true)
    try {
      const result = await getListaRecepcion(id)
      setListaPreviewData(buildListaRecepcionData(result.order, result.lines, false))
      setListaPreviewOpen(true)
    } catch {
      toast.error(t('rec.lista.errorGenerate'))
    } finally {
      setListaPreviewLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/recepcion/recibir')}
              className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 flex-wrap min-w-0 group">
              <span className="font-mono font-black text-base text-warm-900 leading-none truncate">{order.folio}</span>
              <CopyButton text={order.folio} />
              <StatusPill className={`shrink-0 ${estadoMeta.cls}`}>
                {t(`rec.status.${order.estado}`)}
              </StatusPill>
            </div>
          </div>
        }
        icon={PackageCheck}
        actions={
          <div className="flex items-center gap-2">
            {canCreate && (
              <button onClick={handleListaRecepcion} className="btn-ghost flex items-center gap-1.5 text-sm">
                <Printer className="w-4 h-4" />
                {t('rec.btn.listaRecepcion')}
              </button>
            )}
            <button
              onClick={handleExportWorkbook}
              disabled={Boolean(exportingScope)}
              className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exportingScope === 'all' ? t('common.loading') : t('rec.btn.exportar')}
            </button>
            {canValidate && (
              <button
                onClick={() => openValidationFlow({ ...order, id })}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <ScanBarcode className="w-4 h-4" />
                {t('rec.btn.validar')}
              </button>
            )}
            {canForceClose && !['completo', 'cancelado'].includes(order.estado) && (
              <button
                type="button"
                onClick={() => setForceCloseOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700 transition-colors hover:bg-warning-100"
                title={t('rec.val.forceClose.title')}
              >
                <XOctagon className="h-4 w-4" />
                {t('rec.val.forceClose.btn')}
              </button>
            )}
          </div>
        }
      />

      {/* General info panel */}
      <div className="shrink-0 px-5 py-3 border-b border-warm-100">
        <div className="overflow-hidden rounded-2xl border border-warm-100 bg-gradient-to-br from-white to-sky-50/30 shadow-sm">
          <div className="border-b border-warm-100 px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-500">{t('rec.info.general')}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-white px-2.5 py-1 shadow-sm">
                <span className="text-xs font-bold text-warm-800 tabular-nums">{totalBase}</span>
                <span className="text-[10px] font-medium text-warm-400">{t('rec.total_cajas')}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-success-200 bg-success-50 px-2.5 py-1 shadow-sm">
                <CheckCircle2 className="w-3 h-3 text-success-500 shrink-0" />
                <span className="text-xs font-bold text-success-700 tabular-nums">{validadas}</span>
                <span className="text-[10px] font-medium text-success-600">{order.estado === 'anormal' ? t('rec.cajas_registradas') : t('rec.cajas_validadas')}</span>
              </div>
              {order.estado === 'anormal' && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-danger-200 bg-danger-50 px-2.5 py-1 shadow-sm">
                  <AlertTriangle className="w-3 h-3 text-danger-500 shrink-0" />
                  <span className="text-xs font-bold text-danger-700 tabular-nums">{forzadasFromOrder}</span>
                  <span className="text-[10px] font-medium text-danger-600">{t('rec.cajas_forzadas')}</span>
                </div>
              )}
              {pendientes > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-warm-50 px-2.5 py-1 shadow-sm">
                  <Clock className="w-3 h-3 text-warm-400 shrink-0" />
                  <span className="text-xs font-bold text-warm-600 tabular-nums">{pendientes}</span>
                  <span className="text-[10px] font-medium text-warm-400">{t('rec.cajas_pendientes')}</span>
                </div>
              )}
              {faltantes > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-danger-200 bg-danger-50 px-2.5 py-1 shadow-sm">
                  <AlertCircle className="w-3 h-3 text-danger-500 shrink-0" />
                  <span className="text-xs font-bold text-danger-700 tabular-nums">{faltantes}</span>
                  <span className="text-[10px] font-medium text-danger-500">{t('rec.cajas_error')}</span>
                </div>
              )}
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 shadow-sm">
                <span className="text-xs font-bold text-sky-700 tabular-nums">{progreso}%</span>
                <div className="relative w-14 h-1.5 rounded-full bg-sky-200/60 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-sky-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, progresoRaw)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <GeneralInfoBlock icon={User}  label={t('rec.cliente')}           value={order.cliente} />
              <GeneralInfoBlock icon={Hash}  label={t('rec.inbound_order_no')}  value={order.inbound_order_no} tone="primary" mono />
              <GeneralInfoBlock icon={Truck} label={t('rec.tracking_no')}       value={order.tracking_no}       tone="sky"     mono />
              <GeneralInfoBlock icon={Hash}  label={t('rec.reference_no')}      value={order.reference_no}      tone="sky" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Tabs row — tabs left, search + counter chip right */}
        {(() => {
          const allDone = totalBase > 0 && validadas >= totalBase
          const hasErrors = faltantes > 0
          const chipCls = allDone
            ? 'border-success-200 bg-success-50 text-success-700'
            : hasErrors
              ? 'border-danger-200 bg-danger-50 text-danger-700'
              : 'border-warning-200 bg-warning-50 text-warning-700'
          const currentSearch = activeTab === 'detalle'
              ? lineSearchInput
            : activeTab === 'validacion'
              ? eventSearchInput
              : novedadSearchInput
          const setCurrentSearch = activeTab === 'detalle'
            ? (v) => setLineSearchInput(v)
            : activeTab === 'validacion'
              ? (v) => setEventSearchInput(v)
              : (v) => setNovedadSearchInput(v)
          const handleCurrentSearchApply = activeTab === 'detalle'
            ? handleApplyLineSearch
            : activeTab === 'validacion'
              ? handleApplyEventSearch
              : handleApplyNovedadSearch
          const handleCurrentSearchClear = activeTab === 'detalle'
            ? handleClearLineSearch
            : activeTab === 'validacion'
              ? handleClearEventSearch
              : handleClearNovedadSearch
          const handleInlineExport = activeTab === 'detalle'
            ? handleExportDetalle
            : activeTab === 'validacion'
              ? handleExportValidacion
              : handleExportOtros
          return (
            <div className="flex items-center gap-2 border-b border-warm-100 pb-0 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setActiveTab('detalle')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    activeTab === 'detalle' ? 'border-primary-500 text-primary-700' : 'border-transparent text-warm-500 hover:text-warm-700'
                  }`}
                >
                  {t('rec.scan.tab.detalle')}
                  <span className={`badge border-0 shrink-0 ${chipCls}`}>{validadas}/{totalBase}</span>
                </button>
                <button
                  onClick={() => setActiveTab('validacion')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    activeTab === 'validacion' ? 'border-primary-500 text-primary-700' : 'border-transparent text-warm-500 hover:text-warm-700'
                  }`}
                >
                  {t('rec.scan.tab.validacion')}
                  {validadas > 0 && (
                    <span className="badge text-[9px] bg-sky-100 text-sky-700 border-0 shrink-0">{validadas.toLocaleString('es-MX')}</span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('otros')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    activeTab === 'otros' ? 'border-primary-500 text-primary-700' : 'border-transparent text-warm-500 hover:text-warm-700'
                  }`}
                >
                  {t('rec.otros.tab')}
                  {novedades.length > 0 && (
                    <span className="badge text-[9px] bg-warning-100 text-warning-700 border-0 shrink-0">{novedades.length}</span>
                  )}
                </button>
              </div>
              <div className="ml-auto flex items-center gap-2 pb-1.5 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-300 pointer-events-none" />
                  <input
                    value={currentSearch}
                    onChange={e => setCurrentSearch(e.target.value)}
                    onBlur={() => {
                      handleCurrentSearchApply()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCurrentSearchApply()
                      }
                    }}
                    placeholder={`${t('common.search')}...`}
                    className="pl-8 pr-8 py-1.5 rounded-lg border border-warm-200 text-sm focus:outline-none focus:border-sky-400 w-44 sm:w-52"
                  />
                  {currentSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        handleCurrentSearchClear()
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleInlineExport}
                  disabled={Boolean(exportingScope)}
                  className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  {exportingScope === activeTab ? t('common.loading') : t('rec.btn.exportar')}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Tab: Detalle */}
        {activeTab === 'detalle' && (
          <div className="space-y-3">

            <div className="card overflow-hidden border border-warm-100/80 shadow-soft" style={{ '--table-shell-offset': '24rem' }}>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>#</th>
                      {[
                        ['box_type', t('rec.line.box_type')],
                        ['custom_box_barcode', t('rec.line.custom_box_barcode')],
                        ['sku', t('rec.line.sku')],
                        ['qty_per_box', t('rec.line.qty_per_box')],
                        ['estado_validacion', t('rec.line.estado')],
                        ['validated_by_nombre', t('rec.line.validated_by')],
                        ['validated_at', t('rec.line.validated_at')],
                      ].map(([key, label]) => (
                        <th key={key} className={`${TH}${key === 'qty_per_box' ? ' text-right' : ''}`}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-primary-700 transition-colors"
                            onClick={() => handleLineSort(key)}
                          >
                            {label}
                            {lineSortKey === key
                              ? lineSortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                              : <ArrowUpDown size={10} className="opacity-40" />}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {pagedLines.map((line, i) => {
                      const globalIdx = (linePage - 1) * linePageSize + i
                      const meta = LINE_META[line.estado_validacion] ?? LINE_META.pendiente
                      return (
                        <tr key={line.id} className="table-row">
                          <td className="px-3 py-2.5 text-warm-400 text-xs tabular-nums">{globalIdx + 1}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-warm-600">{line.box_type || '—'}</td>
                          <td className="group px-3 py-2.5 font-mono text-xs font-semibold text-primary-700">
                            <CopyInline value={line.custom_box_barcode} mono />
                          </td>
                          <td className="px-3 py-2.5 text-xs text-warm-700">{line.sku || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-medium text-warm-700 tabular-nums">{line.qty_per_box ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => {
                                if (meta.locked || !canEdit) return
                                setLineStatusModal({ lineId: line.id, current: line.estado_validacion })
                                setPendingStatus('')
                                setPendingNota('')
                              }}
                              disabled={meta.locked || !canEdit}
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${meta.cls} ${
                                meta.locked || !canEdit ? 'cursor-default' : 'cursor-pointer hover:opacity-75'
                              }`}
                            >
                              {t(`rec.line.status.${line.estado_validacion}`)}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-warm-500">{line.validated_by_nombre || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-warm-500">{line.validated_at ? fmtDateTime(line.validated_at) : '—'}</td>
                        </tr>
                      )
                    })}
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-warm-400 text-sm">{t('common.noData')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {linesTotal > linePageSize && (
              <TablePagination
                page={linePage}
                pageSize={linePageSize}
                total={linesTotal}
                onPageChange={setLinePage}
                onPageSizeChange={(s) => { setLinePageSize(s); setLinePage(1) }}
                itemLabel={t('rec.line.items')}
              />
            )}
          </div>
        )}

        {/* Tab: Validación */}
        {activeTab === 'validacion' && (
          <div className="space-y-3">

            <div className="card overflow-hidden border border-warm-100/80 shadow-soft" style={{ '--table-shell-offset': '24rem' }}>
              {isEventsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size="md" />
                </div>
              ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>#</th>
                      {[
                        ['codigo_escaneado', t('rec.scan.col.codigo')],
                        ['ubicacion', t('rec.scan.col.ubicacion')],
                        ['match_field', t('rec.scan.col.match_field')],
                        ['scanned_by_nombre', t('rec.scan.col.usuario')],
                        ['scanned_at', t('rec.scan.col.hora')],
                        ['resultado', t('rec.scan.col.resultado')],
                      ].map(([key, label]) => (
                        <th key={key} className={TH}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-primary-700 transition-colors"
                            onClick={() => handleEventSort(key)}
                          >
                            {label}
                            {eventSortKey === key
                              ? eventSortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                              : <ArrowUpDown size={10} className="opacity-40" />}
                          </button>
                        </th>
                      ))}
                      <th className={`${TH} text-right`}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {pagedEvents.map((ev, i) => {
                      const globalIdx = (eventPage - 1) * eventPageSize + i
                      const meta = SCAN_RESULT_META[ev.resultado] ?? SCAN_RESULT_META.no_encontrado
                      return (
                        <tr key={ev.id} className="table-row">
                          <td className="px-3 py-2.5 text-warm-400 text-xs tabular-nums">{globalIdx + 1}</td>
                          <td className="group px-3 py-2.5 font-mono text-xs font-semibold text-warm-700">
                            <CopyInline value={ev.codigo_escaneado} mono />
                          </td>
                          <td className="px-3 py-2.5">
                            {ev.ubicacion
                              ? <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-accent-700 bg-accent-50 border border-accent-100 px-2 py-0.5 rounded-full">
                                  <MapPin size={9} className="shrink-0" />{ev.ubicacion}
                                </span>
                              : <span className="text-xs text-warm-300">—</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 text-xs text-warm-500">{ev.match_field ? (t(`rec.line.${ev.match_field}`) || ev.match_field) : '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-warm-600">{ev.scanned_by_nombre || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-warm-500">{fmtDateTime(ev.scanned_at)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${meta.cls}`}>
                              {t(`rec.scan.result.${ev.resultado}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {(canMoveValidatedToOtros || canDeleteEvents) ? (
                              <div className="inline-flex items-center justify-end gap-1">
                                {canMoveValidatedToOtros ? (
                                  <button
                                    type="button"
                                    onClick={() => setMoveToOtrosModal({ open: true, event: ev, tipo: '', ubicacion: ev.ubicacion || '' })}
                                    disabled={markScanEventAsNovedadMut.isPending}
                                    className="inline-flex rounded-lg p-1.5 text-warning-600 hover:bg-warning-50 disabled:cursor-not-allowed disabled:opacity-30"
                                    title={t('rec.val.markAnormalidad.tooltip')}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                ) : null}
                                {canDeleteEvents ? (
                                  <button
                                    type="button"
                                    onClick={() => deleteScanEventMut.mutate(ev.id)}
                                    disabled={deleteScanEventMut.isPending}
                                    className="inline-flex rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-30"
                                    title={t('rec.val.delete.tooltip')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                    {filteredEvents.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-warm-400 text-sm">{t('common.noData')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            {sortedEvents.length > 100 && (
              <TablePagination
                page={eventPage}
                pageSize={eventPageSize}
                total={sortedEvents.length}
                onPageChange={setEventPage}
                onPageSizeChange={(s) => { setEventPageSize(s); setEventPage(1) }}
                itemLabel={t('rec.scan.items') || 'escaneos'}
              />
            )}
          </div>
        )}

        {/* Tab: Otros */}
        {activeTab === 'otros' && (
          <div className="space-y-3">

            {/* Manual entry form */}
            <div className="card p-4 space-y-3 border border-warm-100/80 shadow-soft">
              <p className="text-xs font-bold text-warm-600 uppercase tracking-wide">{t('rec.otros.registrar')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <select
                  value={nuevoTipo}
                  onChange={e => setNuevoTipo(e.target.value)}
                  className="w-full border border-warm-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 bg-white"
                >
                  <option value="">{t('rec.otros.select_tipo')}</option>
                  {(tiposData?.tipos || []).map(tipo => (
                    <option key={tipo.id} value={tipo.nombre}>{tipo.nombre}</option>
                  ))}
                </select>
                {(tiposData?.tipos || []).length === 0 && <CatalogEmptyHint item={t('rec.otros.col.tipo').toLowerCase()} section={t('rec.recibir.title')} action={t('rec.tipos.btn_header')} />}
                <input
                  type="text"
                  value={nuevoCodigo}
                  onChange={e => setNuevoCodigo(normalizeNovedadCode(e.target.value))}
                  onBlur={() => setNuevoCodigo((current) => normalizeNovedadCode(current))}
                  placeholder={t('rec.otros.codigo_placeholder')}
                  className="w-full border border-warm-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  autoComplete="off"
                />
                <input
                  type="text"
                  value={nuevaUbicacion}
                  onChange={e => setNuevaUbicacion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && nuevoTipo) submitNuevaNovedad() }}
                  placeholder={t('rec.otros.ubicacion_placeholder')}
                  className="w-full border border-warm-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={submitNuevaNovedad}
                  disabled={!nuevoTipo || createNovedadMut.isPending}
                  className="btn-primary flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  {t('rec.otros.agregar')}
                </button>
              </div>
            </div>

            {/* Records table */}
            <div className="card overflow-hidden border border-warm-100/80 shadow-soft" style={{ '--table-shell-offset': '30rem' }}>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>#</th>
                      <th className={TH}>{t('rec.otros.col.tipo')}</th>
                      <th className={TH}>{t('rec.otros.col.codigo')}</th>
                      <th className={TH}>{t('rec.otros.col.ubicacion')}</th>
                      <th className={TH}>{t('rec.otros.col.registrado_por')}</th>
                      <th className={TH}>{t('rec.otros.col.fecha_hora')}</th>
                      <th className={`${TH} text-right`}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {pagedNovedades.map((n, i) => {
                      const globalIdx = (novPage - 1) * novPageSize + i
                      return (
                      <tr key={n.id} className="table-row">
                        <td className="px-3 py-2.5 text-warm-400 text-xs tabular-nums">{globalIdx + 1}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${TIPO_META[n.tipo] || 'bg-warm-100 text-warm-600'}`}>
                            {n.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-warm-700">{n.codigo || '—'}</td>
                        <td className="px-3 py-2.5">
                          {n.ubicacion
                            ? <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-accent-700 bg-accent-50 border border-accent-100 px-2 py-0.5 rounded-full">
                                <MapPin size={9} className="shrink-0" />{n.ubicacion}
                              </span>
                            : <span className="text-xs text-warm-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-xs text-warm-500">{n.created_by_nombre || '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-warm-500">{fmtDateTime(n.created_at)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => deleteNovedadMut.mutate(n.id)}
                            disabled={deleteNovedadMut.isPending}
                            className="inline-flex rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 disabled:opacity-30"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      )
                    })}
                    {filteredNovedades.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-warm-400 text-sm">{t('rec.otros.sin_registros')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {filteredNovedades.length > 100 && (
              <TablePagination
                page={novPage}
                pageSize={novPageSize}
                total={filteredNovedades.length}
                onPageChange={setNovPage}
                onPageSizeChange={(s) => { setNovPageSize(s); setNovPage(1) }}
                itemLabel={t('rec.otros.items') || 'registros'}
              />
            )}
          </div>
        )}
      </div>

      {/* Line status change modal */}
      {lineStatusModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="font-semibold text-warm-900">{t('rec.val.changeStatus')}</p>
            <div className="space-y-2">
              {['pendiente', 'faltante'].map(st => (
                <label key={st} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="lstate" value={st} checked={pendingStatus === st} onChange={() => setPendingStatus(st)} />
                  <span className="text-sm">{t(`rec.line.status.${st}`)}</span>
                </label>
              ))}
            </div>
            <textarea
              value={pendingNota}
              onChange={e => setPendingNota(e.target.value)}
              placeholder={t('rec.val.nota')}
              rows={2}
              className="w-full border border-warm-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-400 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLineStatusModal(null)} className="btn-ghost">{t('common.cancel')}</button>
              <button
                disabled={!pendingStatus || !pendingNota.trim() || updateLineMutation.isPending}
                onClick={() => updateLineMutation.mutate({
                  lineId: lineStatusModal.lineId,
                  payload: { estado_validacion: pendingStatus, notas: pendingNota },
                })}
                className="btn-primary disabled:opacity-50"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ListaRecepcionPreviewModal
        isOpen={listaPreviewOpen}
        onClose={() => setListaPreviewOpen(false)}
        data={listaPreviewData}
        loading={listaPreviewLoading}
        onExport={() => {
          if (!listaPreviewData) return
          generateListaRecepcionXlsx(listaPreviewData)
        }}
      />

      <Modal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={t('rec.val.delete.title')}
        icon={AlertCircle}
        size="md"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setConfirmDeleteOpen(false)} className="btn-ghost">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => deleteLastMut.mutate()}
              disabled={deleteLastMut.isPending}
              className="btn-danger disabled:opacity-50"
            >
              {deleteLastMut.isPending ? t('common.loading') : t('common.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">{t('rec.val.delete.desc')}</p>
      </Modal>

      <Modal
        isOpen={forceCloseOpen}
        onClose={() => !forceCloseMut.isPending && setForceCloseOpen(false)}
        title={t('rec.val.forceClose.title')}
        icon={XOctagon}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setForceCloseOpen(false)} disabled={forceCloseMut.isPending} className="btn-ghost disabled:opacity-50">
              {t('common.cancel')}
            </button>
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

      <Modal
        isOpen={moveToOtrosModal.open}
        onClose={() => setMoveToOtrosModal({ open: false, event: null, tipo: '', ubicacion: '' })}
        title={t('rec.val.markAnormalidad.title')}
        icon={AlertTriangle}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              onClick={() => setMoveToOtrosModal({ open: false, event: null, tipo: '', ubicacion: '' })}
              className="btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => moveToOtrosModal.event?.id && markScanEventAsNovedadMut.mutate({
                eventId: moveToOtrosModal.event.id,
                tipo: moveToOtrosModal.tipo,
                ubicacion: moveToOtrosModal.ubicacion || null,
              })}
              disabled={!moveToOtrosModal.tipo || markScanEventAsNovedadMut.isPending || !moveToOtrosModal.event?.id}
              className="btn-primary disabled:opacity-50"
            >
              {markScanEventAsNovedadMut.isPending ? t('common.loading') : t('rec.val.markAnormalidad.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('rec.val.markAnormalidad.helper')}</p>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-700">{t('rec.val.markAnormalidad.match')}</p>
            <p className="font-mono font-bold text-warning-900 break-all">{moveToOtrosModal.event?.codigo_escaneado || '—'}</p>
            {moveToOtrosModal.event?.match_field && (
              <p className="text-xs text-warning-700">
                <span className="font-semibold">{t('rec.scan.col.match_field')}:</span>{' '}
                {moveToOtrosModal.event.match_field}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-warm-600">{t('rec.val.forceEntry.tipo')}</label>
            <select
              value={moveToOtrosModal.tipo}
              onChange={e => setMoveToOtrosModal(prev => ({ ...prev, tipo: e.target.value }))}
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
              value={moveToOtrosModal.ubicacion}
              onChange={e => setMoveToOtrosModal(prev => ({ ...prev, ubicacion: e.target.value.toUpperCase() }))}
              className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm font-mono"
              placeholder={t('rec.val.forceEntry.ubicacion_placeholder')}
            />
          </div>
        </div>
      </Modal>
      {validationModeModal}
    </div>
  )
}
