import { useEffect, useState, useMemo, useDeferredValue } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Copy, Check, PackageCheck, ScanBarcode, Printer,
  Download, Trash2, CheckCircle2, Clock, Search, X,
  User, Hash, Truck, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, MapPin, Plus,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import StatusPill from '../../../core/components/common/StatusPill'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { getOrder, getScanEvents, updateLine, getListaRecepcion, deleteLastValidationRecord, deleteScanEvent, getNovedades, createNovedad, deleteNovedad, getNovedadTipos } from '../services/recepcionService'
import { buildListaRecepcionData, generateListaRecepcionXlsx } from '../utils/listaRecepcionReport'
import ListaRecepcionPreviewModal from '../components/ListaRecepcionPreviewModal'
import { normalizeCode } from '../../Shared/Wms/normalizeCode'
import * as XLSX from 'xlsx'

const ESTADO_META = {
  pendiente_validacion: { cls: 'bg-warm-100 text-warm-600' },
  en_validacion:        { cls: 'bg-sky-100 text-sky-700' },
  completo:             { cls: 'bg-success-100 text-success-700' },
  parcial:              { cls: 'bg-warning-100 text-warning-700' },
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
          title="Copiar"
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

export default function RecepcionDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useI18nStore()
  const toast = useToastStore()
  const { hasPermission, isAuthenticated, token } = useAuthStore()

  const [activeTab, setActiveTab] = useState('detalle')
  const [lineSearch, setLineSearch] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [novedadSearch, setNovedadSearch] = useState('')
  const [lineStatusModal, setLineStatusModal] = useState(null)
  const [pendingStatus, setPendingStatus] = useState('')
  const [pendingNota, setPendingNota] = useState('')
  const [listaPreviewOpen, setListaPreviewOpen] = useState(false)
  const [listaPreviewLoading, setListaPreviewLoading] = useState(false)
  const [listaPreviewData, setListaPreviewData] = useState(null)
  const [lineSortKey, setLineSortKey] = useState('custom_box_barcode')
  const [lineSortDir, setLineSortDir] = useState('asc')
  const [eventSortKey, setEventSortKey] = useState('scanned_at')
  const [eventSortDir, setEventSortDir] = useState('desc')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [nuevoCodigo, setNuevoCodigo] = useState('')
  const [nuevaUbicacion, setNuevaUbicacion] = useState('')
  const deferredLineSearch = useDeferredValue(lineSearch)
  const deferredEventSearch = useDeferredValue(eventSearch)
  const deferredNovedadSearch = useDeferredValue(novedadSearch)

  useEffect(() => {
    setNuevoTipo('')
    setNuevoCodigo('')
    setNuevaUbicacion('')
  }, [id])

  const canQueryRecepcion = isAuthenticated && Boolean(token)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recepcion-order', id],
    queryFn: () => getOrder(id),
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: 30_000,
  })

  const { data: eventsData } = useQuery({
    queryKey: ['recepcion-scan-events', id],
    queryFn: () => getScanEvents(id),
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: 30_000,
  })

  const { data: novedadesData } = useQuery({
    queryKey: ['recepcion-novedades', id],
    queryFn: () => getNovedades(id),
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: 30_000,
  })

  const { data: tiposData } = useQuery({
    queryKey: ['recepcion-novedad-tipos'],
    queryFn: getNovedadTipos,
    enabled: canQueryRecepcion,
    retry: false,
    staleTime: 60_000,
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

  const createNovedadMut = useMutation({
    mutationFn: (payload) => createNovedad(id, payload),
    onSuccess: () => {
      toast.success(t('rec.toast.novedad_ok'))
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
      setNuevoCodigo('')
      setNuevaUbicacion('')
    },
    onError: () => toast.error(t('toast.error')),
  })

  const deleteNovedadMut = useMutation({
    mutationFn: (nid) => deleteNovedad(id, nid),
    onSuccess: () => {
      toast.success(t('rec.toast.novedad_deleted'))
      qc.invalidateQueries({ queryKey: ['recepcion-novedades', id] })
    },
    onError: () => toast.error(t('toast.error')),
  })

  const canValidate = hasPermission('recepcion.recibir', 'actualizar')
  const canEdit = hasPermission('recepcion.recibir', 'actualizar')
  const canCreate = hasPermission('recepcion.recibir', 'crear')
  const canDeleteEvents = hasPermission('recepcion.recibir', 'eliminar')

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
    for (const ev of (eventsData?.events || [])) {
      if (ev.resultado === 'correcto' && ev.line_id && ev.ubicacion) {
        map.set(ev.line_id, ev.ubicacion)
      }
    }
    return map
  }, [eventsData?.events])

  const order = data?.order ?? {}
  const lines = data?.lines ?? []
  const events = eventsData?.events || []
  const novedades = novedadesData?.novedades || []

  const totalBase = Number(order.total_cajas || 0) > 0 ? Number(order.total_cajas) : lines.length
  const validadasFromOrder = Number(order.cajas_validadas || 0)
  const lineStatusCounts = useMemo(() => {
    let validada = 0
    let faltante = 0
    for (const line of lines) {
      if (line.estado_validacion === 'validada') validada++
      else if (line.estado_validacion === 'faltante') faltante++
    }
    return { validada, faltante }
  }, [lines])
  const validadas = validadasFromOrder > 0 ? validadasFromOrder : lineStatusCounts.validada
  const faltantes = lineStatusCounts.faltante
  const pendientes = Math.max(totalBase - validadas - faltantes, 0)
  const progresoRaw = totalBase > 0 ? Math.min(100, (validadas / totalBase) * 100) : 0
  const progreso = progresoRaw > 0 && progresoRaw < 1
    ? parseFloat(progresoRaw.toFixed(1))
    : Math.round(progresoRaw)

  const estadoMeta = ESTADO_META[order.estado] ?? ESTADO_META.pendiente_validacion

  const handleLineSort = (key) => {
    if (lineSortKey === key) setLineSortDir((dir) => dir === 'asc' ? 'desc' : 'asc')
    else { setLineSortKey(key); setLineSortDir('asc') }
  }

  const handleEventSort = (key) => {
    if (eventSortKey === key) setEventSortDir((dir) => dir === 'asc' ? 'desc' : 'asc')
    else { setEventSortKey(key); setEventSortDir(key === 'scanned_at' ? 'desc' : 'asc') }
  }

  const filteredLines = useMemo(() => {
    const q = deferredLineSearch.trim().toLowerCase()
    if (!q) return lines
    return lines.filter((l) => [l.box_type, l.custom_box_barcode, l.sku].some((v) => String(v || '').toLowerCase().includes(q)))
  }, [lines, deferredLineSearch])

  const sortedLines = useMemo(() => {
    const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
    return [...filteredLines].sort((a, b) => {
      const av = a?.[lineSortKey] ?? ''
      const bv = b?.[lineSortKey] ?? ''
      const cmp = lineSortKey === 'created_at'
        ? new Date(av).getTime() - new Date(bv).getTime()
        : collator.compare(String(av), String(bv))
      return lineSortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredLines, lineSortKey, lineSortDir])

  const filteredEvents = useMemo(() => {
    const q = deferredEventSearch.trim().toLowerCase()
    if (!q) return events
    return events.filter((e) => [e.codigo_escaneado, e.sku_asociado, e.resultado, e.scanned_by_nombre].some((v) => String(v || '').toLowerCase().includes(q)))
  }, [events, deferredEventSearch])

  const filteredNovedades = useMemo(() => {
    const q = deferredNovedadSearch.trim().toLowerCase()
    if (!q) return novedades
    return novedades.filter((n) => [n.tipo, n.codigo, n.ubicacion, n.created_by_nombre].some((v) => String(v || '').toLowerCase().includes(q)))
  }, [novedades, deferredNovedadSearch])

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

  if (isLoading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
  if (isError || !data) return (
    <div className="flex flex-col h-full">
      <Header title={t('rec.recibir.title')} icon={PackageCheck} />
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-danger-500">{t('toast.error')}</p>
        <button onClick={() => navigate('/recepcion/recibir')} className="btn-ghost text-sm flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
      </div>
    </div>
  )

  const handleExportWorkbook = () => {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Detalle
    const detalleRows = lines.map((l, i) => [
      i + 1, l.box_type || '', l.custom_box_barcode || '', l.sku || '',
      l.qty_per_box || '',
      l.length_oms || '', l.width_oms || '', l.height_oms || '', l.dimension_unit || '',
      l.weight_oms || '', l.weight_unit || '',
      t(`rec.line.status.${l.estado_validacion}`),
      lineUbicacionMap.get(l.id) || '',
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
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle')

    // Sheet 2: Validación
    const validRows = events.map((ev, i) => [
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
    XLSX.utils.book_append_sheet(wb, wsValid, 'Validación')

    // Sheet 3: Otros
    const otrosRows = novedades.map((n, i) => [
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
    XLSX.utils.book_append_sheet(wb, wsOtros, 'Otros')

    XLSX.writeFile(wb, `${order.folio}-recepcion.xlsx`)
  }

  const handleExportDetalle = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['#', 'Box Type', 'Custom Box Barcode', 'SKU', 'Qty/Caja',
       'Length (OMS)', 'Width (OMS)', 'Height (OMS)', 'Dim Unit', 'Weight (OMS)', 'Weight Unit',
       'Estado', 'Ubicación', 'Validado por', 'Hora validación'],
      ...sortedLines.map((l, i) => [
        i + 1, l.box_type || '', l.custom_box_barcode || '', l.sku || '',
        l.qty_per_box || '',
        l.length_oms || '', l.width_oms || '', l.height_oms || '', l.dimension_unit || '',
        l.weight_oms || '', l.weight_unit || '',
        t(`rec.line.status.${l.estado_validacion}`),
        lineUbicacionMap.get(l.id) || '',
        l.validated_by_nombre || '', l.validated_at ? fmtDateTime(l.validated_at) : '',
      ]),
    ])
    ws['!cols'] = [
      { wch: 5 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
      { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 18 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle')
    XLSX.writeFile(wb, `${order.folio}-detalle.xlsx`)
  }

  const handleExportValidacion = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['#', 'Código Escaneado', 'SKU', 'Campo', 'Resultado', 'Ubicación', 'Escaneado por', 'Hora'],
      ...sortedEvents.map((ev, i) => [
        i + 1,
        ev.codigo_escaneado || '',
        ev.sku_asociado || '',
        ev.match_field || '',
        t(`rec.scan.result.${ev.resultado}`) || ev.resultado,
        ev.ubicacion || '',
        ev.scanned_by_nombre || '',
        ev.scanned_at ? fmtDateTime(ev.scanned_at) : '',
      ]),
    ])
    ws['!cols'] = [
      { wch: 5 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 18 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Validación')
    XLSX.writeFile(wb, `${order.folio}-validacion.xlsx`)
  }

  const handleExportOtros = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['#', t('rec.otros.col.tipo'), t('rec.otros.col.codigo'), t('rec.otros.col.ubicacion'), t('rec.otros.col.registrado_por'), t('rec.otros.col.fecha_hora')],
      ...filteredNovedades.map((n, i) => [
        i + 1,
        n.tipo || '',
        n.codigo || '',
        n.ubicacion || '',
        n.created_by_nombre || '',
        n.created_at ? fmtDateTime(n.created_at) : '',
      ]),
    ])
    ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Otros')
    XLSX.writeFile(wb, `${order.folio}-otros.xlsx`)
  }

  const handleListaRecepcion = async () => {
    setListaPreviewLoading(true)
    try {
      const result = await getListaRecepcion(id)
      setListaPreviewData(buildListaRecepcionData(result.order, result.lines, false))
      setListaPreviewOpen(true)
    } catch {
      toast.error('Error al generar lista')
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
            <button onClick={handleExportWorkbook} className="btn-ghost flex items-center gap-1.5 text-sm">
              <Download className="w-4 h-4" />
              {t('rec.btn.exportar')}
            </button>
            {canValidate && (
              <button
                onClick={() => navigate(`/recepcion/recibir/${id}/validar`)}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <ScanBarcode className="w-4 h-4" />
                {t('rec.btn.validar')}
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
                <span className="text-[10px] font-medium text-success-600">{t('rec.cajas_validadas')}</span>
              </div>
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
                    style={{ width: `${progresoRaw}%` }}
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
            ? lineSearch
            : activeTab === 'validacion'
              ? eventSearch
              : novedadSearch
          const setCurrentSearch = activeTab === 'detalle'
            ? setLineSearch
            : activeTab === 'validacion'
              ? setEventSearch
              : setNovedadSearch
          const handleInlineExport = activeTab === 'detalle'
            ? handleExportDetalle
            : activeTab === 'validacion'
              ? handleExportValidacion
              : handleExportOtros
          return (
            <div className="flex items-center gap-2 border-b border-warm-100 pb-0 overflow-x-auto">
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
                  {events.length > 0 && (
                    <span className="badge text-[9px] bg-sky-100 text-sky-700 border-0 shrink-0">{events.length}</span>
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
                    placeholder={`${t('common.search')}...`}
                    className="pl-8 pr-8 py-1.5 rounded-lg border border-warm-200 text-sm focus:outline-none focus:border-sky-400 w-44 sm:w-52"
                  />
                  {currentSearch && (
                    <button onClick={() => setCurrentSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button onClick={handleInlineExport} className="btn-ghost flex items-center gap-1.5 text-sm">
                  <Download className="w-4 h-4" />
                  {t('rec.btn.exportar')}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Tab: Detalle */}
        {activeTab === 'detalle' && (
          <div className="space-y-3">

            <div className="card overflow-hidden border border-warm-100/80 shadow-soft">
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
                    {sortedLines.map((line, i) => {
                      const meta = LINE_META[line.estado_validacion] ?? LINE_META.pendiente
                      return (
                        <tr key={line.id} className="table-row">
                          <td className="px-3 py-2.5 text-warm-400 text-xs tabular-nums">{i + 1}</td>
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
                    {filteredLines.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-warm-400 text-sm">{t('common.noData')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Validación */}
        {activeTab === 'validacion' && (
          <div className="space-y-3">

            <div className="card overflow-hidden border border-warm-100/80 shadow-soft">
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
                    {sortedEvents.map((ev, i) => {
                      const meta = SCAN_RESULT_META[ev.resultado] ?? SCAN_RESULT_META.no_encontrado
                      return (
                        <tr key={ev.id} className="table-row">
                          <td className="px-3 py-2.5 text-warm-400 text-xs tabular-nums">{i + 1}</td>
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
                          <td className="px-3 py-2.5 text-xs text-warm-500">{ev.match_field || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-warm-600">{ev.scanned_by_nombre || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-warm-500">{fmtDateTime(ev.scanned_at)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${meta.cls}`}>
                              {t(`rec.scan.result.${ev.resultado}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
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
                            ) : canValidate ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOpen(true)}
                                disabled={i !== 0 || ev.resultado !== 'correcto' || deleteLastMut.isPending}
                                className="inline-flex rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-30"
                                title={t('rec.val.delete.tooltip')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
            </div>
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
            <div className="card overflow-hidden border border-warm-100/80 shadow-soft">
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
                    {filteredNovedades.map((n, i) => (
                      <tr key={n.id} className="table-row">
                        <td className="px-3 py-2.5 text-warm-400 text-xs tabular-nums">{i + 1}</td>
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
                    ))}
                    {filteredNovedades.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-warm-400 text-sm">{t('rec.otros.sin_registros')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
    </div>
  )
}
