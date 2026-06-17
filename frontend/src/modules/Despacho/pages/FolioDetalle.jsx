import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck, User, Loader2, Plus, Trash2, CheckCircle2, XCircle, Clock,
  FileText, Edit3, ArrowLeft, CalendarDays, StickyNote, ScanLine, X,
  Check, PackageCheck, AlertCircle, Printer, ShieldCheck, MapPin,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDate, fmtTimeShort, fmtDateTime } from '../../../core/utils/dateFormat'
import {
  getFolio, updateFolio, addOrder, updateOrder, removeOrder,
  cerrarFolio, cancelarFolio,
  getConductores, getUnidades, findOrderByBarcode,
  addOrderScan, deleteLastOrderScan,
} from '../services/despachoService'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'
import FolioPreviewModal from '../components/FolioPreviewModal'

const FOLIO_ESTADO_META = {
  borrador:   { label: 'Borrador',   cls: 'bg-warm-100 text-warm-600',       icon: Clock },
  en_proceso: { label: 'En Proceso', cls: 'bg-primary-100 text-primary-700', icon: Truck },
  cerrado:    { label: 'Cerrado',    cls: 'bg-success-100 text-success-700',  icon: CheckCircle2 },
  cancelado:  { label: 'Cancelado',  cls: 'bg-danger-100 text-danger-700',    icon: XCircle },
}

const ORDER_ESTADO_META = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-warm-100 text-warm-600' },
  cargado:    { label: 'Cargado',    cls: 'bg-primary-100 text-primary-700' },
  entregado:  { label: 'Entregado',  cls: 'bg-success-100 text-success-700' },
  devolucion: { label: 'Devolución', cls: 'bg-danger-100 text-danger-700' },
}
const ORDER_ESTADOS = ['pendiente', 'cargado', 'entregado', 'devolucion']

function estadoBadge(estado) {
  const m = ORDER_ESTADO_META[estado] ?? ORDER_ESTADO_META.pendiente
  return <span className={`badge text-[11px] font-semibold ${m.cls}`}>{m.label}</span>
}

// ── Validation panel (per order) ──────────────────────────────────────────────
function ValidationPanel({ order, folioId, onUpdate, canEdit, onAutoConfirm, onClose }) {
  const { addToast } = useToastStore()
  const scanRef = useRef(null)
  const [input, setInput] = useState('')
  const [orderDetail, setOrderDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  const scans = order.scans ?? []

  // Load order detail first — scan input is blocked until this resolves
  useEffect(() => {
    setDetailLoading(true)
    setCompleted(false)
    getOutboundDetail(order.outbound_order_no)
      .then(r => setOrderDetail(r?.data ?? null))
      .finally(() => setDetailLoading(false))
  }, [order.outbound_order_no])

  // Focus scan input only after detail is loaded
  useEffect(() => {
    if (!detailLoading && canEdit && !completed) {
      setTimeout(() => scanRef.current?.focus(), 100)
    }
  }, [detailLoading, canEdit, completed])

  const validCodes = useCallback(() => {
    if (!orderDetail) return new Set()
    const codes = new Set()
    ;(orderDetail.packageList ?? orderDetail.outboundBoxList ?? []).forEach(p => {
      if (p.customizeCode) codes.add(p.customizeCode.trim().toUpperCase())
    })
    if (orderDetail.thirdOrderNo) codes.add(orderDetail.thirdOrderNo.trim().toUpperCase())
    if (orderDetail.logisticsTrackNo) codes.add(orderDetail.logisticsTrackNo.trim().toUpperCase())
    return codes
  }, [orderDetail])

  const alreadyScanned = new Set(scans.map(s => s.codigo_caja.toUpperCase()))
  const expected = order.bultos_esperados ?? orderDetail?.outboundBoxCount ?? null

  const { mutate: doAddScan, isPending: scanning } = useMutation({
    mutationFn: (code) => addOrderScan(folioId, order.id, { codigo_caja: code }),
    onSuccess: (data) => {
      onUpdate(data)
      setInput('')

      const updatedOrder = data?.orders?.find(o => o.id === order.id)
      const newScansCount = updatedOrder?.scans?.length ?? 0
      const expectedCount = Number(order.bultos_esperados ?? orderDetail?.outboundBoxCount)

      if (expectedCount > 0 && newScansCount >= expectedCount) {
        setCompleted(true)
        onAutoConfirm({ bultos: newScansCount, estado: 'cargado' })
        addToast(`Validación completa — ${newScansCount} cajas confirmadas`, 'success')
        setTimeout(() => onClose(), 2000)
      } else {
        scanRef.current?.focus()
      }
    },
    onError: (err) => {
      addToast(err?.response?.data?.error || 'Error registrando escaneo', 'error')
      scanRef.current?.focus()
    },
  })

  const { mutate: doDeleteLast, isPending: deletingLast } = useMutation({
    mutationFn: () => deleteLastOrderScan(folioId, order.id),
    onSuccess: (data) => { onUpdate(data); setCompleted(false) },
    onError: (err) => addToast(err?.response?.data?.error || 'Error eliminando escaneo', 'error'),
  })

  const handleScan = useCallback(() => {
    const code = input.trim().toUpperCase()
    if (!code) return

    if (alreadyScanned.has(code)) {
      addToast('Código ya escaneado en esta orden', 'warning')
      setInput('')
      scanRef.current?.focus()
      return
    }

    const codes = validCodes()
    if (codes.size > 0 && !codes.has(code)) {
      addToast('Código no corresponde a esta orden — rechazado', 'error')
      setInput('')
      scanRef.current?.focus()
      return
    }

    doAddScan(code)
  }, [input, validCodes, alreadyScanned, doAddScan, addToast])

  const pct = expected && expected > 0
    ? Math.round((scans.length / expected) * 100)
    : null

  // Completed state
  if (completed) {
    return (
      <div className="bg-success-50 border-t border-success-100 px-5 py-6 flex flex-col items-center gap-2">
        <CheckCircle2 className="w-8 h-8 text-success-500" />
        <p className="text-sm font-bold text-success-700">Validación completa</p>
        <p className="text-xs text-success-600 tabular-nums">
          {scans.length} caja{scans.length !== 1 ? 's' : ''} confirmada{scans.length !== 1 ? 's' : ''} — orden marcada como Cargada
        </p>
      </div>
    )
  }

  return (
    <div className="bg-primary-50/60 border-t border-primary-100 px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary-600" />
          <span className="text-xs font-semibold text-primary-700">
            Validación · {order.outbound_order_no}
          </span>
          {detailLoading && <Loader2 className="w-3 h-3 animate-spin text-primary-400" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-primary-600">
          <span className="font-bold tabular-nums">
            {scans.length}/{expected ?? '?'}{pct !== null ? ` · ${pct}%` : ''}
          </span>
          {pct !== null && (
            <div className="w-24 h-1.5 bg-primary-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-success-500' : 'bg-primary-500'}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Scan input — blocked while detail is loading */}
      {detailLoading ? (
        <div className="flex items-center gap-2 h-10 mb-3 px-3 bg-white/60 border border-primary-100 rounded-xl">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-400 shrink-0" />
          <span className="text-xs text-primary-500">Cargando datos de la orden desde el sistema...</span>
        </div>
      ) : canEdit && (
        <div className="flex items-center gap-2 mb-3">
          <div className={`flex items-center gap-1.5 bg-white border-2 rounded-xl px-3 h-10 flex-1 transition-colors ${
            scanning ? 'border-primary-300' : 'border-primary-200 focus-within:border-primary-400'
          }`}>
            <ScanLine className="w-3.5 h-3.5 text-primary-400 shrink-0" />
            <input
              ref={scanRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleScan() }}
              placeholder="Escanea código de caja u orden..."
              className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-400"
              autoComplete="off"
              disabled={scanning}
            />
            {input && !scanning && (
              <button onClick={() => { setInput(''); scanRef.current?.focus() }}
                className="text-warm-400 hover:text-warm-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={handleScan}
            disabled={!input.trim() || scanning}
            className="btn-primary text-xs flex items-center gap-1.5 h-10 px-4">
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
            Validar
          </button>
          {scans.length > 0 && (
            <button
              onClick={() => doDeleteLast()}
              disabled={deletingLast}
              className="btn-ghost text-xs flex items-center gap-1.5 h-10 px-3 text-danger-600 hover:bg-danger-50 border border-danger-200">
              {deletingLast ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Borrar último
            </button>
          )}
        </div>
      )}

      {!detailLoading && orderDetail && !orderDetail.packageList?.length && (
        <p className="text-[11px] text-warm-400 mb-2">
          Sin detalle de cajas disponible — se aceptará cualquier código
        </p>
      )}

      {scans.length > 0 ? (
        <div className="space-y-1">
          {scans.map((s, i) => (
            <div key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs
              ${i === scans.length - 1 ? 'bg-white border border-primary-100' : 'bg-transparent'}`}>
              <Check className="w-3 h-3 text-success-500 shrink-0" />
              <span className="font-mono font-semibold text-warm-800 flex-1">{s.codigo_caja}</span>
              <span className="text-warm-400">{s.validated_by_nombre || '—'}</span>
              <span className="text-warm-400 tabular-nums">{fmtDateTime(s.validated_at)}</span>
            </div>
          ))}
        </div>
      ) : (
        !detailLoading && <p className="text-xs text-primary-500/70">Sin escaneos — escanea la primera caja</p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FolioDetalle() {
  const { id: folioId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const { canWrite, canDelete } = useAuthStore()
  const qc = useQueryClient()

  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(null)

  // Add-order state
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResult, setLookupResult] = useState(null)  // sheets data for found order
  const [addForm, setAddForm] = useState({ outbound_order_no: '', destinatario: '', bultos: '', bultos_esperados: null, notas: '' })
  const lookupRef = useRef(null)
  const inlineScanRef = useRef(null)
  const pendingOrderNoRef = useRef(null)
  const pendingScansRef = useRef([])
  const autoValidateRef = useRef(false)
  const [autoValidate, setAutoValidate] = useState(false)
  const [localScans, setLocalScans] = useState([])
  const [scanInput, setScanInput] = useState('')
  const [lookupDetail, setLookupDetail] = useState(null)

  // Validation panel state
  const [validatingOrderId, setValidatingOrderId] = useState(null)

  const [showConfirmCancel, setShowConfirmCancel] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['despacho-folio', folioId],
    queryFn: () => getFolio(folioId),
    enabled: !!folioId,
    staleTime: 30_000,
  })

  const { data: conductoresData } = useQuery({ queryKey: ['despacho-conductores'], queryFn: getConductores, staleTime: 10 * 60_000 })
  const { data: unidadesData } = useQuery({ queryKey: ['despacho-unidades'], queryFn: getUnidades, staleTime: 10 * 60_000 })

  const folio = data?.folio
  const orders = data?.orders ?? []
  const conductores = conductoresData?.conductores ?? []
  const unidades = unidadesData?.unidades ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folios'] })
  }

  // Push fresh data from mutation responses without a full refetch
  const applyUpdate = useCallback((freshData) => {
    if (freshData?.folio) {
      qc.setQueryData(['despacho-folio', folioId], freshData)
    }
  }, [qc, folioId])

  const { mutate: doUpdate, isPending: updatingFolio } = useMutation({
    mutationFn: (body) => updateFolio(folioId, body),
    onSuccess: () => { invalidate(); setEditMode(false); addToast('Folio actualizado', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error actualizando folio', 'error'),
  })

  const { mutate: doCerrar, isPending: cerrando } = useMutation({
    mutationFn: () => cerrarFolio(folioId),
    onSuccess: () => { invalidate(); addToast('Folio cerrado', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error cerrando folio', 'error'),
  })

  const { mutate: doCancelar, isPending: cancelando } = useMutation({
    mutationFn: () => cancelarFolio(folioId),
    onSuccess: () => { invalidate(); addToast('Folio cancelado', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error cancelando folio', 'error'),
  })

  const { mutate: doAddOrder, isPending: addingOrder } = useMutation({
    mutationFn: (body) => addOrder(folioId, body),
    onSuccess: async (data) => {
      applyUpdate(data)
      const newOrders = data?.orders ?? []
      const addedOrder = newOrders.find(o => o.outbound_order_no === pendingOrderNoRef.current)

      if (addedOrder && pendingScansRef.current.length > 0) {
        let lastData = data
        for (const code of pendingScansRef.current) {
          try { lastData = await addOrderScan(folioId, addedOrder.id, { codigo_caja: code }) } catch {}
        }
        applyUpdate(lastData)
        const expectedCount = Number(addedOrder.bultos_esperados)
        const scanned = pendingScansRef.current.length
        if (expectedCount > 0 && scanned >= expectedCount) {
          try { await updateOrder(folioId, addedOrder.id, { bultos: scanned, estado: 'cargado' }) } catch {}
          addToast(`Validación completa — ${scanned} cajas confirmadas`, 'success')
          invalidate()
        } else {
          if (autoValidateRef.current) setValidatingOrderId(addedOrder.id)
          invalidate()
        }
      } else if (addedOrder && autoValidateRef.current) {
        setValidatingOrderId(addedOrder.id)
      }

      setShowAddOrder(false)
      setLookupInput('')
      setLookupResult(null)
      setLookupDetail(null)
      setLocalScans([])
      setScanInput('')
      setAddForm({ outbound_order_no: '', destinatario: '', bultos: '', bultos_esperados: null, notas: '' })
      addToast('Orden agregada', 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error agregando orden', 'error'),
  })

  const { mutate: doRemoveOrder } = useMutation({
    mutationFn: ({ orderId }) => removeOrder(folioId, orderId),
    onSuccess: (data) => { applyUpdate(data); addToast('Orden eliminada', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error eliminando orden', 'error'),
  })

  const { mutate: doUpdateOrder } = useMutation({
    mutationFn: ({ orderId, body }) => updateOrder(folioId, orderId, body),
    onSuccess: (data) => applyUpdate(data),
    onError: (err) => addToast(err?.response?.data?.error || 'Error actualizando orden', 'error'),
  })

  const canEdit = folio && ['borrador', 'en_proceso'].includes(folio.estado)
  const editable = canEdit && canWrite('despacho.folios')

  const startEdit = () => {
    setEditForm({
      conductor_id: folio.conductor_id || '',
      unidad_id: folio.unidad_id || '',
      fecha_salida: folio.fecha_salida ? folio.fecha_salida.slice(0, 10) : '',
      notas: folio.notas || '',
    })
    setEditMode(true)
  }

  const handlePrint = () => setShowPrintModal(true)

  // Lookup order in sheets
  const handleLookup = useCallback(async (code) => {
    const q = (code || lookupInput).trim()
    if (!q) return
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const found = await findOrderByBarcode(q)
      if (found) {
        // findOrderByBarcode returns one row — outboundBoxCount may be null.
        // getOutboundDetail counts all rows for the order to get the real box count.
        const detail = await getOutboundDetail(found.outboundOrderNo || q)
        const boxCount = detail?.data?.outboundBoxCount || found.outboundBoxCount || null
        const enriched = { ...found, outboundBoxCount: boxCount }
        setLookupResult(enriched)
        setLookupDetail(detail?.data ?? null)
        setAddForm({
          outbound_order_no: enriched.outboundOrderNo || q,
          destinatario: enriched.receiverName || enriched.logisticsChannel || '',
          bultos: '',
          bultos_esperados: boxCount,
          notas: '',
        })
      } else {
        addToast('Orden no encontrada en hojas — completa manualmente', 'warning')
        setAddForm(f => ({ ...f, outbound_order_no: q }))
      }
    } finally {
      setLookupLoading(false)
    }
  }, [lookupInput, addToast])

  const openAddOrder = () => {
    setShowAddOrder(true)
    setLookupInput('')
    setLookupResult(null)
    setLookupDetail(null)
    setLocalScans([])
    setScanInput('')
    setAutoValidate(false)
    autoValidateRef.current = false
    setAddForm({ outbound_order_no: '', destinatario: '', bultos: '', bultos_esperados: null, notas: '' })
    setTimeout(() => lookupRef.current?.focus(), 100)
  }

  const handleInlineScan = useCallback(() => {
    const code = scanInput.trim().toUpperCase()
    if (!code) return
    if (localScans.includes(code)) {
      addToast('Código ya escaneado', 'warning')
      setScanInput('')
      inlineScanRef.current?.focus()
      return
    }
    if (lookupDetail) {
      const codes = new Set()
      ;(lookupDetail.packageList ?? lookupDetail.outboundBoxList ?? []).forEach(p => {
        if (p.customizeCode) codes.add(p.customizeCode.trim().toUpperCase())
      })
      if (lookupDetail.thirdOrderNo) codes.add(lookupDetail.thirdOrderNo.trim().toUpperCase())
      if (lookupDetail.logisticsTrackNo) codes.add(lookupDetail.logisticsTrackNo.trim().toUpperCase())
      if (codes.size > 0 && !codes.has(code)) {
        addToast('Código no corresponde a esta orden — rechazado', 'error')
        setScanInput('')
        inlineScanRef.current?.focus()
        return
      }
    }
    setLocalScans(prev => [...prev, code])
    setScanInput('')
    inlineScanRef.current?.focus()
  }, [scanInput, localScans, lookupDetail, addToast])

  const handleConfirmAdd = () => {
    pendingOrderNoRef.current = addForm.outbound_order_no
    if (autoValidateRef.current && localScans.length > 0) {
      pendingScansRef.current = [...localScans]
      doAddOrder({ ...addForm, bultos: localScans.length })
    } else {
      pendingScansRef.current = []
      doAddOrder({ ...addForm, bultos: parseInt(addForm.bultos) || 0 })
    }
  }

  const estadoMeta = folio ? (FOLIO_ESTADO_META[folio.estado] ?? FOLIO_ESTADO_META.borrador) : null
  const totalBultos = orders.reduce((s, o) => s + (o.bultos || 0), 0)
  const primaryDestinatario = orders.find(o => o.destinatario)?.destinatario ?? null

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-5 flex items-center gap-3 shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate('/despacho/folios')}
          className="p-1.5 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition-all shrink-0"
          title="Volver a folios"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <h1 className="text-base font-bold text-warm-800 truncate">
            {isLoading ? 'Cargando...' : (folio?.folio_numero ?? 'Folio')}
          </h1>
          {estadoMeta && (
            <span className={`badge text-[10px] font-semibold gap-1 shrink-0 ${estadoMeta.cls}`}>
              <estadoMeta.icon className="w-3 h-3" />
              {estadoMeta.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handlePrint}
            disabled={!folio || !orders.length}
            className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50">
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
          {canEdit && folio?.estado === 'en_proceso' && canWrite('despacho.folios') && (
            <button onClick={() => doCerrar()} disabled={cerrando}
              className="btn-success text-xs flex items-center gap-1.5">
              {cerrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Cerrar Folio
            </button>
          )}
          {canEdit && canDelete('despacho.folios') && (
            <button onClick={() => setShowConfirmCancel(true)} disabled={cancelando}
              className="btn-danger text-xs flex items-center gap-1.5">
              {cancelando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Cancelar
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : !folio ? (
          <div className="py-20 text-center text-warm-400">
            <FileText className="w-10 h-10 mx-auto mb-3 text-warm-200" />
            <p className="font-medium">Folio no encontrado</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-5">

            {/* ── Info block ──────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-warm-100 shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-warm-700">Información del folio</span>
                  <span className="text-xs text-warm-400">
                    {fmtDate(folio.created_at)} · {fmtTimeShort(folio.created_at)}
                  </span>
                  {orders.length > 0 && (
                    <>
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 shadow-sm">
                        <span className="text-xs font-bold text-primary-700 tabular-nums">{orders.length}</span>
                        <span className="text-[10px] font-medium text-primary-500">{t('desp.folio.col.ordenes').toLowerCase()}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-white px-2.5 py-0.5 shadow-sm">
                        <span className="text-xs font-bold text-warm-800 tabular-nums">{totalBultos}</span>
                        <span className="text-[10px] font-medium text-warm-400">{t('desp.folio.col.cajas').toLowerCase()}</span>
                      </div>
                    </>
                  )}
                  {primaryDestinatario && (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 shadow-sm">
                      <MapPin className="w-3 h-3 text-sky-500 shrink-0" />
                      <span className="text-[10px] font-semibold text-sky-700 max-w-[180px] truncate">{primaryDestinatario}</span>
                    </div>
                  )}
                </div>
                {editable && !editMode && (
                  <button onClick={startEdit}
                    className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 px-3">
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                )}
              </div>

              {editMode ? (
                <div className="px-6 py-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-warm-600 mb-1.5">Conductor</label>
                      <select value={editForm.conductor_id}
                        onChange={e => setEditForm(f => ({ ...f, conductor_id: e.target.value }))}
                        className="input-field w-full text-sm">
                        <option value="">Sin conductor</option>
                        {conductores.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}{c.licencia ? ` · ${c.licencia}` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-warm-600 mb-1.5">Unidad</label>
                      <select value={editForm.unidad_id}
                        onChange={e => setEditForm(f => ({ ...f, unidad_id: e.target.value }))}
                        className="input-field w-full text-sm">
                        <option value="">Sin unidad</option>
                        {unidades.map(u => (
                          <option key={u.id} value={u.id}>{u.placa} ({u.tipo})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-warm-600 mb-1.5">Fecha de Salida</label>
                      <input type="date" value={editForm.fecha_salida}
                        onChange={e => setEditForm(f => ({ ...f, fecha_salida: e.target.value }))}
                        className="input-field w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-warm-600 mb-1.5">Notas</label>
                      <input value={editForm.notas}
                        onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                        className="input-field w-full text-sm" placeholder="Observaciones..." />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => doUpdate(editForm)} disabled={updatingFolio}
                      className="btn-primary text-sm flex items-center gap-1.5">
                      {updatingFolio && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Guardar cambios
                    </button>
                    <button onClick={() => setEditMode(false)} className="btn-secondary text-sm">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-warm-100 px-0">
                    {[
                      { icon: User,         label: 'Conductor',    value: folio.conductor_nombre || '—',
                        sub: folio.conductor_licencia || null },
                      { icon: Truck,        label: 'Unidad',       value: folio.unidad_placa || '—',
                        sub: folio.unidad_tipo || null },
                      { icon: CalendarDays, label: 'Fecha Salida', value: folio.fecha_salida ? fmtDate(folio.fecha_salida) : '—' },
                      { icon: FileText,     label: 'Operador',     value: folio.operador_nombre || '—' },
                    ].map(({ icon: Icon, label, value, sub }) => (
                      <div key={label} className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-warm-400 mb-1.5">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
                        </div>
                        <p className="text-sm font-bold text-warm-800 truncate">{value}</p>
                        {sub && <p className="text-xs text-warm-400 mt-0.5">{sub}</p>}
                      </div>
                    ))}
                  </div>
                  {folio.notas && (
                    <div className="flex items-start gap-2 text-xs text-warm-500 bg-warm-50 border-t border-warm-100 px-6 py-3">
                      <StickyNote className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{folio.notas}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Orders block ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-warm-100 shadow-sm overflow-hidden">

              {/* Orders header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-warm-800">Órdenes asignadas</h3>
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">
                    {orders.length}
                  </span>
                  {orders.length > 0 && (
                    <span className="text-xs text-warm-400">{totalBultos} bultos despacho</span>
                  )}
                </div>
                {editable && (
                  <button
                    onClick={showAddOrder ? () => { setShowAddOrder(false); setLookupResult(null); setLookupInput('') } : openAddOrder}
                    className="btn-primary text-xs flex items-center gap-1.5">
                    {showAddOrder ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showAddOrder ? 'Cerrar' : 'Agregar Orden'}
                  </button>
                )}
              </div>

              {/* Add order panel */}
              <AnimatePresence>
                {showAddOrder && editable && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-primary-50/60 px-6 py-5 border-b border-primary-100">
                      {/* Lookup row */}
                      <p className="text-xs font-semibold text-primary-700 mb-3">Buscar orden</p>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="flex items-center gap-1.5 bg-white border-2 border-primary-200 rounded-xl px-3 h-10 flex-1 focus-within:border-primary-400 transition-colors">
                          <ScanLine className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                          <input
                            ref={lookupRef}
                            type="text"
                            value={lookupInput}
                            onChange={e => setLookupInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleLookup() }}
                            placeholder="Escanear o ingresar No. orden..."
                            className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-400"
                            autoComplete="off"
                          />
                        </div>
                        <button
                          onClick={() => handleLookup()}
                          disabled={!lookupInput.trim() || lookupLoading}
                          className="btn-primary text-xs flex items-center gap-1.5 h-10 px-4">
                          {lookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                          Buscar
                        </button>
                      </div>

                      {/* Result / manual form */}
                      {lookupResult ? (
                        <div className="space-y-3">
                          {/* Read-only order info card */}
                          <div className="bg-white rounded-xl border border-primary-100 px-4 py-3">
                            <div className="flex items-start gap-3">
                              <PackageCheck className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                {/* Order no + status chip */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-primary-700 text-sm">{lookupResult.outboundOrderNo}</span>
                                  {lookupResult.status && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warm-100 text-warm-600 capitalize">
                                      {lookupResult.status}
                                    </span>
                                  )}
                                </div>
                                {lookupResult.receiverName && (
                                  <p className="text-xs text-warm-700 font-medium mt-0.5">{lookupResult.receiverName}</p>
                                )}
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {lookupResult.logisticsChannel && (
                                    <span className="text-[10px] bg-warm-100 text-warm-600 px-2 py-0.5 rounded-full font-medium">{lookupResult.logisticsChannel}</span>
                                  )}
                                  {lookupResult.logisticsTrackNo && (
                                    <span className="text-[10px] bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-mono">{lookupResult.logisticsTrackNo}</span>
                                  )}
                                  {lookupResult.thirdOrderNo && (
                                    <span className="text-[10px] bg-warm-100 text-warm-600 px-2 py-0.5 rounded-full font-mono">Ref: {lookupResult.thirdOrderNo}</span>
                                  )}
                                </div>
                              </div>
                              {/* Stats: Esperadas + Validadas */}
                              <div className="shrink-0 flex items-stretch gap-3 text-right">
                                <div>
                                  <p className="text-[9px] text-warm-400 uppercase tracking-wider font-semibold mb-0.5">Esperadas</p>
                                  <p className="text-sm font-bold text-warm-800 tabular-nums">{lookupResult.outboundBoxCount ?? '—'}</p>
                                </div>
                                <div className="w-px bg-warm-100" />
                                <div>
                                  <p className="text-[9px] text-warm-400 uppercase tracking-wider font-semibold mb-0.5">Validadas</p>
                                  <p className={`text-sm font-bold tabular-nums ${localScans.length > 0 ? 'text-success-600' : 'text-warm-300'}`}>
                                    {localScans.length}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Destination mismatch warning */}
                          {primaryDestinatario && addForm.destinatario && addForm.destinatario !== primaryDestinatario && (
                            <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
                              <AlertCircle className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
                              <div className="min-w-0 space-y-1">
                                <p className="text-xs font-semibold text-warning-700">Destino diferente al del folio</p>
                                <div className="flex flex-col gap-0.5 text-[11px] text-warning-600">
                                  <span><span className="font-semibold">Folio:</span> {primaryDestinatario}</span>
                                  <span><span className="font-semibold">Esta orden:</span> {addForm.destinatario}</span>
                                </div>
                                <p className="text-[11px] text-warning-500 leading-snug pt-0.5">
                                  Puedes agregar esta orden al folio, pero ten en cuenta que generalmente un folio corresponde a un solo destino.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Cantidad a despachar + toggle en la misma fila */}
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-semibold text-warm-600 shrink-0">
                              Cant. a despachar {!autoValidate && '*'}
                            </label>
                            <input
                              type="number" min="1"
                              value={autoValidate ? (localScans.length > 0 ? localScans.length : '') : addForm.bultos}
                              onChange={e => !autoValidate && setAddForm(f => ({ ...f, bultos: e.target.value }))}
                              disabled={autoValidate}
                              className={`input-field w-20 text-sm ${autoValidate ? 'bg-warm-50 text-warm-400 cursor-not-allowed' : ''}`}
                              placeholder={autoValidate ? 'Auto' : '0'}
                              autoFocus={!autoValidate}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = !autoValidate
                                setAutoValidate(next)
                                autoValidateRef.current = next
                                if (next) setTimeout(() => inlineScanRef.current?.focus(), 200)
                              }}
                              className={`h-10 flex items-center gap-2 px-3 rounded-xl border transition-all text-xs font-semibold shrink-0 ${
                                autoValidate
                                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                                  : 'bg-warm-50 border-warm-200 text-warm-500 hover:border-warm-300 hover:text-warm-700'
                              }`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                              <span>{autoValidate ? 'Validación activa' : 'Validar a detalle'}</span>
                              <div className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${
                                autoValidate ? 'bg-primary-500' : 'bg-warm-300'
                              }`}>
                                <span className={`inline-block w-4 h-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                  autoValidate ? 'translate-x-[22px]' : 'translate-x-[2px]'
                                }`} />
                              </div>
                            </button>
                          </div>

                          {/* Zona de escaneo inline — se expande al activar validación */}
                          <AnimatePresence>
                            {autoValidate && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="bg-white border border-primary-100 rounded-xl p-4 space-y-3">
                                  {/* Header stats */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <ScanLine className="w-3.5 h-3.5 text-primary-600" />
                                      <span className="text-xs font-semibold text-primary-700">Validación a detalle</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {[
                                        { label: 'Esperadas', value: lookupResult.outboundBoxCount ?? '—', cls: 'text-warm-700' },
                                        { label: 'Escaneadas', value: localScans.length, cls: localScans.length > 0 ? 'text-success-600' : 'text-warm-400' },
                                        lookupResult.outboundBoxCount != null && {
                                          label: 'Pendientes',
                                          value: Math.max(0, lookupResult.outboundBoxCount - localScans.length),
                                          cls: localScans.length >= lookupResult.outboundBoxCount ? 'text-success-600' : 'text-danger-500',
                                        },
                                      ].filter(Boolean).map(({ label, value, cls }) => (
                                        <div key={label} className="text-center">
                                          <p className="text-[9px] font-semibold text-warm-400 uppercase tracking-wider">{label}</p>
                                          <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Progress bar */}
                                  {lookupResult.outboundBoxCount > 0 && (
                                    <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          localScans.length >= lookupResult.outboundBoxCount ? 'bg-success-500' : 'bg-primary-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (localScans.length / lookupResult.outboundBoxCount) * 100)}%` }}
                                      />
                                    </div>
                                  )}

                                  {/* Scan input */}
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 bg-warm-50 border-2 border-primary-200 rounded-xl px-3 h-9 flex-1 focus-within:border-primary-400 focus-within:bg-white transition-all">
                                      <ScanLine className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                                      <input
                                        ref={inlineScanRef}
                                        type="text"
                                        value={scanInput}
                                        onChange={e => setScanInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleInlineScan() }}
                                        placeholder="Escanea código de caja..."
                                        className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-300"
                                        autoComplete="off"
                                      />
                                      {scanInput && (
                                        <button onClick={() => { setScanInput(''); inlineScanRef.current?.focus() }} className="text-warm-400 hover:text-warm-600">
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    <button
                                      onClick={handleInlineScan}
                                      disabled={!scanInput.trim()}
                                      className="btn-primary text-xs h-9 px-3 flex items-center gap-1">
                                      <ScanLine className="w-3.5 h-3.5" />
                                      OK
                                    </button>
                                    {localScans.length > 0 && (
                                      <button
                                        onClick={() => setLocalScans(prev => prev.slice(0, -1))}
                                        className="h-9 px-2.5 rounded-xl border border-danger-200 text-danger-500 hover:bg-danger-50 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Scanned list */}
                                  {localScans.length > 0 ? (
                                    <div className="space-y-1 max-h-36 overflow-y-auto">
                                      {[...localScans].reverse().map((code, i) => (
                                        <div key={code} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                                          i === 0 ? 'bg-primary-50 border border-primary-100' : 'bg-transparent'
                                        }`}>
                                          <Check className="w-3 h-3 text-success-500 shrink-0" />
                                          <span className="font-mono font-semibold text-warm-800 flex-1">{code}</span>
                                          <span className="text-warm-400 tabular-nums">#{localScans.length - i}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-primary-400/70 text-center py-1">Escanea la primera caja para comenzar...</p>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-semibold text-warm-600 mb-1.5">No. Orden *</label>
                            <input value={addForm.outbound_order_no}
                              onChange={e => setAddForm(f => ({ ...f, outbound_order_no: e.target.value }))}
                              className="input-field w-full text-sm font-mono" placeholder="OBC-12345" />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-semibold text-warm-600 mb-1.5">Destinatario</label>
                            <input value={addForm.destinatario}
                              onChange={e => setAddForm(f => ({ ...f, destinatario: e.target.value }))}
                              className="input-field w-full text-sm" placeholder="Receptor o canal..." />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-warm-600 mb-1.5">
                              Cant. a despachar
                              {addForm.bultos_esperados ? (
                                <span className="ml-1 font-normal text-warm-400">
                                  (esperadas: {addForm.bultos_esperados})
                                </span>
                              ) : null}
                            </label>
                            <input type="number" min="1" value={addForm.bultos}
                              onChange={e => setAddForm(f => ({ ...f, bultos: e.target.value }))}
                              className="input-field w-full text-sm"
                              placeholder="Cantidad..." />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={handleConfirmAdd}
                          disabled={
                            addingOrder ||
                            !addForm.outbound_order_no.trim() ||
                            (autoValidate
                              ? false
                              : !String(addForm.bultos).trim() || parseInt(addForm.bultos) < 1)
                          }
                          className="btn-primary text-sm flex items-center gap-1.5">
                          {addingOrder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {autoValidate && localScans.length > 0
                            ? `Confirmar y agregar (${localScans.length} escaneadas)`
                            : 'Confirmar y agregar'}
                        </button>
                        <button
                          onClick={() => { setShowAddOrder(false); setLookupResult(null); setLookupInput(''); setLocalScans([]); setScanInput('') }}
                          className="btn-secondary text-sm">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Orders table */}
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                  <tr>
                    <th className="table-header w-10"></th>
                    <th className="table-header">Orden</th>
                    <th className="table-header">Destinatario</th>
                    <th className="table-header text-center">{t('desp.folio.col.esperadas')}</th>
                    <th className="table-header text-center">{t('desp.folio.col.validadas')}</th>
                    <th className="table-header text-center">{t('desp.folio.col.despacho')}</th>
                    <th className="table-header">Estado</th>
                    {editable && <th className="table-header w-10"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={editable ? 8 : 7} className="py-14 text-center text-warm-300 text-xs">
                        Sin órdenes — usa <strong>Agregar Orden</strong> para comenzar
                      </td>
                    </tr>
                  ) : orders.map((order) => (
                    <>
                      <motion.tr key={order.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        onClick={() => editable && setValidatingOrderId(id => id === order.id ? null : order.id)}
                        className={`transition-colors group ${editable ? 'cursor-pointer' : ''} ${
                          validatingOrderId === order.id
                            ? 'bg-primary-50/50 border-l-[3px] border-l-primary-400'
                            : 'hover:bg-primary-100'
                        }`}>
                        <td className="pl-3 pr-1 py-3.5">
                          {editable && (
                            <div className={`flex items-center justify-center w-6 h-6 rounded-full transition-all ${
                              validatingOrderId === order.id
                                ? 'bg-primary-100 text-primary-600'
                                : 'text-warm-300 group-hover:text-primary-500 group-hover:bg-primary-50'
                            }`}>
                              {validatingOrderId === order.id
                                ? <ChevronUp className="w-3.5 h-3.5" />
                                : <ChevronDown className="w-3.5 h-3.5" />
                              }
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className={`w-3 h-3 shrink-0 ${
                              validatingOrderId === order.id ? 'text-primary-500' : 'text-warm-200'
                            }`} />
                            <span className="font-mono font-semibold text-primary-700 text-xs">{order.outbound_order_no}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {order.destinatario ? (
                              <>
                                <MapPin className="w-3 h-3 text-warm-300 shrink-0" />
                                <span className="text-xs text-warm-700 font-medium truncate max-w-[160px]">{order.destinatario}</span>
                              </>
                            ) : (
                              <span className="text-xs text-warm-300">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-xs text-warm-500 tabular-nums">{order.bultos_esperados ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`text-xs font-semibold tabular-nums ${
                            (order.surtido_validadas ?? 0) > 0 ? 'text-success-600' : 'text-warm-300'
                          }`}>
                            {order.surtido_validadas ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-xs font-semibold text-warm-800 tabular-nums">{order.bultos}</span>
                        </td>
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          {editable ? (
                            <select value={order.estado}
                              onChange={e => doUpdateOrder({ orderId: order.id, body: { estado: e.target.value } })}
                              className="text-xs border border-warm-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400">
                              {ORDER_ESTADOS.map(e => (
                                <option key={e} value={e}>{ORDER_ESTADO_META[e]?.label}</option>
                              ))}
                            </select>
                          ) : estadoBadge(order.estado)}
                        </td>
                        {editable && (
                          <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => setValidatingOrderId(id => id === order.id ? null : order.id)}
                                title={validatingOrderId === order.id ? 'Cerrar validación' : 'Validar carga'}
                                className={`p-1.5 rounded-lg transition-all ${
                                  validatingOrderId === order.id
                                    ? 'bg-primary-100 text-primary-600'
                                    : 'text-warm-300 hover:text-primary-600 hover:bg-primary-50'
                                }`}>
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                              {canDelete('despacho.folios') && (
                                <button
                                  onClick={() => doRemoveOrder({ orderId: order.id })}
                                  className="p-1.5 rounded-lg text-warm-200 hover:text-danger-500 hover:bg-danger-50 transition-all">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </motion.tr>

                      {/* Validation panel — renders as a pseudo-row */}
                      {validatingOrderId === order.id && (
                        <tr key={`val-${order.id}`}>
                          <td colSpan={editable ? 8 : 7} className="p-0">
                            <AnimatePresence>
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}>
                                <ValidationPanel
                                  order={order}
                                  folioId={folioId}
                                  onUpdate={applyUpdate}
                                  canEdit={editable}
                                  onAutoConfirm={(body) => doUpdateOrder({ orderId: order.id, body })}
                                  onClose={() => setValidatingOrderId(null)}
                                />
                              </motion.div>
                            </AnimatePresence>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Print preview modal ───────────────────────────────────────────── */}
      <FolioPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        folio={folio}
        orders={orders}
      />

      {/* ── Cancel confirm modal ───────────────────────────────────────────── */}
      <Modal
        isOpen={showConfirmCancel}
        onClose={() => setShowConfirmCancel(false)}
        title="Cancelar Folio"
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowConfirmCancel(false)} className="btn-secondary text-sm">
              Volver
            </button>
            <button
              onClick={() => { doCancelar(); setShowConfirmCancel(false) }}
              disabled={cancelando}
              className="btn-danger text-sm flex items-center gap-1.5">
              {cancelando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirmar Cancelación
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          ¿Estás seguro de que deseas cancelar este folio? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  )
}
