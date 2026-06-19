import { useState, useRef, useCallback, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, Plus, Trash2, CheckCircle2, XCircle, ScanLine, X,
  Check, PackageCheck, AlertCircle, ShieldCheck, ChevronDown, ChevronUp,
  Layers, MapPin,
} from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import StatusPill from '../../../core/components/common/StatusPill'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import {
  getFolio, addOrder, updateOrder, removeOrder,
  cerrarFolio, cancelarFolio, findOrderByBarcode,
  addOrderScan, deleteLastOrderScan,
} from '../services/despachoService'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'

const ORDER_ESTADO_META = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-warm-100 text-warm-600' },
  cargado:    { label: 'Cargado',    cls: 'bg-primary-100 text-primary-700' },
  entregado:  { label: 'Entregado',  cls: 'bg-success-100 text-success-700' },
  devolucion: { label: 'Devolución', cls: 'bg-danger-100 text-danger-700' },
}
const ORDER_ESTADOS = ['pendiente', 'cargado', 'entregado', 'devolucion']

// ── Validation panel (per order) ─────────────────────────────────────────────
function ValidationPanel({ order, folioId, onUpdate, canEdit, onAutoConfirm, onClose, validarPorTarimas }) {
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const scanRef = useRef(null)
  const [input, setInput] = useState('')
  const [orderDetail, setOrderDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [currentTarimaNum, setCurrentTarimaNum] = useState(1)

  const scans = order.scans ?? []

  useEffect(() => {
    if (!validarPorTarimas) { setCurrentTarimaNum(1); return }
    const refs = scans.map(s => s.tarima_ref).filter(Boolean)
    if (refs.length === 0) { setCurrentTarimaNum(1); return }
    const max = Math.max(...refs.map(r => parseInt(r.replace('T', '')) || 0))
    setCurrentTarimaNum(max > 0 ? max : 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, validarPorTarimas])

  const currentTarimaRef = validarPorTarimas
    ? 'T' + String(currentTarimaNum).padStart(2, '0')
    : null

  useEffect(() => {
    setDetailLoading(true)
    setCompleted(false)
    getOutboundDetail(order.outbound_order_no)
      .then(r => setOrderDetail(r?.data ?? null))
      .finally(() => setDetailLoading(false))
  }, [order.outbound_order_no])

  useEffect(() => {
    if (!detailLoading && canEdit && !completed) {
      setTimeout(() => scanRef.current?.focus(), 100)
    }
  }, [detailLoading, canEdit, completed])

  const validCodes = useCallback(() => {
    if (!orderDetail) return new Set()
    const codes = new Set()
    ;(orderDetail.packageList ?? orderDetail.outboundBoxList ?? []).forEach(p => {
      if (p.customizeCode) codes.add(normalizeCodeFast(p.customizeCode))
    })
    if (orderDetail.thirdOrderNo) codes.add(normalizeCodeFast(orderDetail.thirdOrderNo))
    if (orderDetail.logisticsTrackNo) codes.add(normalizeCodeFast(orderDetail.logisticsTrackNo))
    return codes
  }, [orderDetail])

  const alreadyScanned = new Set(scans.map(s => normalizeCodeFast(s.codigo_caja)))
  const expected = order.bultos_esperados ?? orderDetail?.outboundBoxCount ?? null

  const { mutate: doAddScan, isPending: scanning } = useMutation({
    mutationFn: (code) => addOrderScan(folioId, order.id, { codigo_caja: code, tarima_ref: currentTarimaRef }),
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
    const code = normalizeCodeFast(input.trim())
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

  const pct = expected && expected > 0 ? Math.round((scans.length / expected) * 100) : null

  const scansByTarima = validarPorTarimas
    ? scans.reduce((acc, s) => {
        const key = s.tarima_ref || '__none'
        if (!acc[key]) acc[key] = []
        acc[key].push(s)
        return acc
      }, {})
    : null

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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary-600" />
          <span className="text-xs font-semibold text-primary-700">Validación · {order.outbound_order_no}</span>
          {detailLoading && <Loader2 className="w-3 h-3 animate-spin text-primary-400" />}
          {validarPorTarimas && currentTarimaRef && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-100 border border-accent-200 text-[11px] font-bold text-accent-700">
              <Layers className="w-3 h-3" />{currentTarimaRef}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {validarPorTarimas && canEdit && (
            <button
              type="button"
              onClick={() => setCurrentTarimaNum(n => n + 1)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-accent-300 bg-accent-50 text-accent-700 text-[11px] font-semibold hover:bg-accent-100 transition-colors"
            >
              <Layers className="w-3 h-3" />{t('desp.validar.destino.sigTarima')}
            </button>
          )}
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
      </div>

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
              placeholder={t('desp.validar.orden.scanPlaceholderPanel')}
              className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-400"
              autoComplete="off"
              disabled={scanning}
            />
            {input && !scanning && (
              <button onClick={() => { setInput(''); scanRef.current?.focus() }} className="text-warm-400 hover:text-warm-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button onClick={handleScan} disabled={!input.trim() || scanning}
            className="btn-primary text-xs flex items-center gap-1.5 h-10 px-4">
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
            {t('desp.validar.orden.validarBtn')}
          </button>
          {scans.length > 0 && (
            <button onClick={() => doDeleteLast()} disabled={deletingLast}
              className="btn-ghost text-xs flex items-center gap-1.5 h-10 px-3 text-danger-600 hover:bg-danger-50 border border-danger-200">
              {deletingLast ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {t('desp.validar.orden.borrarUltimo')}
            </button>
          )}
        </div>
      )}

      {!detailLoading && orderDetail && !orderDetail.packageList?.length && (
        <p className="text-[11px] text-warm-400 mb-2">Sin detalle de cajas disponible — se aceptará cualquier código</p>
      )}

      {scans.length > 0 ? (
        validarPorTarimas && scansByTarima ? (
          <div className="space-y-2">
            {Object.entries(scansByTarima).map(([tarima, tarScans]) => (
              <div key={tarima}>
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <Layers className="w-3 h-3 text-accent-500 shrink-0" />
                  <span className="text-[11px] font-bold text-accent-700">{tarima === '__none' ? t('desp.validar.destino.sinOrden') : tarima}</span>
                  <span className="text-[10px] text-warm-400">({tarScans.length} caja{tarScans.length !== 1 ? 's' : ''})</span>
                </div>
                <div className="space-y-0.5">
                  {tarScans.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs bg-accent-50/40 border border-accent-100/50">
                      <Check className="w-3 h-3 text-success-500 shrink-0" />
                      <span className="font-mono font-semibold text-warm-800 flex-1">{s.codigo_caja}</span>
                      <span className="text-warm-400">{s.validated_by_nombre || '—'}</span>
                      <span className="text-warm-400 tabular-nums">{fmtDateTime(s.validated_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {scans.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                i === scans.length - 1 ? 'bg-white border border-primary-100' : 'bg-transparent'
              }`}>
                <Check className="w-3 h-3 text-success-500 shrink-0" />
                <span className="font-mono font-semibold text-warm-800 flex-1">{s.codigo_caja}</span>
                <span className="text-warm-400">{s.validated_by_nombre || '—'}</span>
                <span className="text-warm-400 tabular-nums">{fmtDateTime(s.validated_at)}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        !detailLoading && <p className="text-xs text-primary-500/70">Sin escaneos — escanea la primera caja</p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ValidarPorOrden({ folioId }) {
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const { canWrite, canDelete } = useAuthStore()
  const canUpdate = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.folios')
    return lvl === 'actualizar' || lvl === 'eliminar'
  })
  const qc = useQueryClient()

  // Add-order state
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResult, setLookupResult] = useState(null)
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
  const [validatingOrderId, setValidatingOrderId] = useState(null)
  const [showConfirmCancel, setShowConfirmCancel] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['despacho-folio', folioId],
    queryFn: () => getFolio(folioId),
    enabled: !!folioId,
    staleTime: 30_000,
  })

  const folio = data?.folio
  const orders = data?.orders ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folios'] })
  }

  const applyUpdate = useCallback((freshData) => {
    if (freshData?.folio || freshData?.orders) {
      qc.setQueryData(['despacho-folio', folioId], freshData)
    }
  }, [qc, folioId])

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

  const { mutate: doAddOrder, isPending: addingOrder } = useMutation({
    mutationFn: (body) => addOrder(folioId, body),
    onSuccess: async (respData) => {
      applyUpdate(respData)
      const newOrders = respData?.orders ?? []
      const addedOrder = newOrders.find(o => o.outbound_order_no === pendingOrderNoRef.current)
      if (addedOrder && pendingScansRef.current.length > 0) {
        let lastData = respData
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
    onSuccess: (d) => { applyUpdate(d); addToast('Orden eliminada', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error eliminando orden', 'error'),
  })

  const { mutate: doUpdateOrder } = useMutation({
    mutationFn: ({ orderId, body }) => updateOrder(folioId, orderId, body),
    onSuccess: (d) => applyUpdate(d),
    onError: (err) => addToast(err?.response?.data?.error || 'Error actualizando orden', 'error'),
  })

  const isActive = folio && ['borrador', 'en_proceso'].includes(folio.estado)
  const editable = !!isActive && canWrite('despacho.folios')
  const canCancelFolio = !!isActive && canUpdate
  const totalBultos = orders.reduce((s, o) => s + (o.bultos || 0), 0)
  const primaryDestinatario = orders.find(o => o.destinatario)?.destinatario ?? null

  const addOrderNo = addForm.outbound_order_no.trim()
  const isDuplicateInFolio = !!addOrderNo && orders.some(o => o.outbound_order_no === addOrderNo)

  const handleLookup = useCallback(async (code) => {
    const raw = (code || lookupInput).trim()
    if (!raw) return
    const q = normalizeCodeFast(raw)
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const found = await findOrderByBarcode(q)
      if (found) {
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
        setAddForm(f => ({ ...f, outbound_order_no: raw }))
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
    const code = normalizeCodeFast(scanInput.trim())
    if (!code) return
    const alreadyScanned = new Set(localScans.map(c => normalizeCodeFast(c)))
    if (alreadyScanned.has(code)) {
      addToast('Código ya escaneado', 'warning')
      setScanInput('')
      inlineScanRef.current?.focus()
      return
    }
    if (lookupDetail) {
      const codes = new Set()
      ;(lookupDetail.packageList ?? lookupDetail.outboundBoxList ?? []).forEach(p => {
        if (p.customizeCode) codes.add(normalizeCodeFast(p.customizeCode))
      })
      if (lookupDetail.thirdOrderNo) codes.add(normalizeCodeFast(lookupDetail.thirdOrderNo))
      if (lookupDetail.logisticsTrackNo) codes.add(normalizeCodeFast(lookupDetail.logisticsTrackNo))
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

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  }

  return (
    <div className="space-y-4">
      {/* Orders block */}
      <div className="bg-white rounded-2xl border border-warm-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-warm-100 flex-wrap">
          <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-wrap">
            <h3 className="text-sm font-semibold text-warm-800 shrink-0">{t('desp.validar.orden.ordenesAsignadas')}</h3>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold shrink-0">
              {orders.length}
            </span>
            {orders.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-warm-50 px-2.5 py-0.5 text-xs font-bold text-warm-800">
                {totalBultos} {t('desp.validar.orden.cajas')}
              </span>
            )}
            {primaryDestinatario && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 max-w-[180px] truncate">
                <MapPin className="w-3 h-3 shrink-0" />{primaryDestinatario}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editable && (
              <button
                onClick={showAddOrder ? () => { setShowAddOrder(false); setLookupResult(null); setLookupInput('') } : openAddOrder}
                className="btn-primary text-xs flex items-center gap-1.5 h-8">
                {showAddOrder ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showAddOrder ? t('desp.validar.orden.cerrar') : t('desp.validar.orden.agregarOrden')}
              </button>
            )}
            {folio?.estado === 'en_proceso' && canWrite('despacho.folios') && (
              <button onClick={() => doCerrar()} disabled={cerrando}
                className="btn-success text-xs flex items-center gap-1.5 h-8">
                {cerrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {t('desp.validar.orden.cerrarFolio')}
              </button>
            )}
            {canCancelFolio && (
              <button onClick={() => setShowConfirmCancel(true)} disabled={cancelando}
                className="btn-danger text-xs flex items-center gap-1.5 h-8">
                <XCircle className="w-3.5 h-3.5" />
                {t('desp.validar.orden.cancelar')}
              </button>
            )}
          </div>
        </div>

        {/* Add order panel */}
        <AnimatePresence>
          {showAddOrder && editable && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-primary-50/60 px-6 py-5 border-b border-primary-100">
                <p className="text-xs font-semibold text-primary-700 mb-3">{t('desp.validar.orden.buscarOrden')}</p>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-1.5 bg-white border-2 border-primary-200 rounded-xl px-3 h-10 flex-1 focus-within:border-primary-400 transition-colors">
                    <ScanLine className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                    <input
                      ref={lookupRef}
                      type="text"
                      value={lookupInput}
                      onChange={e => setLookupInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleLookup() }}
                      placeholder={t('desp.validar.orden.scanPlaceholderLookup')}
                      className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-400"
                      autoComplete="off"
                    />
                  </div>
                  <button onClick={() => handleLookup()} disabled={!lookupInput.trim() || lookupLoading}
                    className="btn-primary text-xs flex items-center gap-1.5 h-10 px-4">
                    {lookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                    {t('desp.validar.orden.buscar')}
                  </button>
                </div>

                {lookupResult ? (
                  <div className="space-y-3">
                    <div className="bg-white rounded-xl border border-primary-100 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <PackageCheck className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
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

                    {isDuplicateInFolio && (
                      <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3">
                        <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-semibold text-danger-700">{t('desp.validar.orden.duplicadoFolio')}</p>
                          <p className="text-[11px] text-danger-600 leading-snug">
                            <span className="font-mono font-semibold">{addOrderNo}</span> {t('desp.validar.orden.duplicadoFolioDesc')}
                          </p>
                        </div>
                      </div>
                    )}

                    {primaryDestinatario && addForm.destinatario && addForm.destinatario !== primaryDestinatario && (
                      <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
                        <AlertCircle className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-semibold text-warning-700">{t('desp.validar.orden.destDiferente')}</p>
                          <div className="flex flex-col gap-0.5 text-[11px] text-warning-600">
                            <span><span className="font-semibold">Folio:</span> {primaryDestinatario}</span>
                            <span><span className="font-semibold">Esta orden:</span> {addForm.destinatario}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-warm-600 shrink-0">
                        {t('desp.validar.orden.cantDespachar')} {!autoValidate && '*'}
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
                        <span>{autoValidate ? t('desp.validar.orden.validarActiva') : t('desp.validar.orden.validarDetalle')}</span>
                        <div className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 ${
                          autoValidate ? 'bg-primary-500' : 'bg-warm-300'
                        }`}>
                          <span className={`inline-block w-4 h-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            autoValidate ? 'translate-x-[22px]' : 'translate-x-[2px]'
                          }`} />
                        </div>
                      </button>
                    </div>

                    <AnimatePresence>
                      {autoValidate && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-white border border-primary-100 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <ScanLine className="w-3.5 h-3.5 text-primary-600" />
                                <span className="text-xs font-semibold text-primary-700">{t('desp.validar.orden.validacionDetalle')}</span>
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
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 bg-warm-50 border-2 border-primary-200 rounded-xl px-3 h-9 flex-1 focus-within:border-primary-400 focus-within:bg-white transition-all">
                                <ScanLine className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                                <input
                                  ref={inlineScanRef}
                                  type="text"
                                  value={scanInput}
                                  onChange={e => setScanInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleInlineScan() }}
                                  placeholder={t('desp.validar.orden.scanPlaceholder')}
                                  className="flex-1 min-w-0 text-sm outline-none bg-transparent font-mono placeholder:font-sans placeholder:text-warm-300"
                                  autoComplete="off"
                                />
                                {scanInput && (
                                  <button onClick={() => { setScanInput(''); inlineScanRef.current?.focus() }} className="text-warm-400 hover:text-warm-600">
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              <button onClick={handleInlineScan} disabled={!scanInput.trim()}
                                className="btn-primary text-xs h-9 px-3 flex items-center gap-1">
                                <ScanLine className="w-3.5 h-3.5" />OK
                              </button>
                              {localScans.length > 0 && (
                                <button onClick={() => setLocalScans(prev => prev.slice(0, -1))}
                                  className="h-9 px-2.5 rounded-xl border border-danger-200 text-danger-500 hover:bg-danger-50 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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
                              <p className="text-xs text-primary-400/70 text-center py-1">{t('desp.validar.orden.scanHint')}</p>
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
                        {addForm.bultos_esperados ? <span className="ml-1 font-normal text-warm-400">(esp: {addForm.bultos_esperados})</span> : null}
                      </label>
                      <input type="number" min="1" value={addForm.bultos}
                        onChange={e => setAddForm(f => ({ ...f, bultos: e.target.value }))}
                        className="input-field w-full text-sm" placeholder="Cantidad..." />
                    </div>
                  </div>
                )}

                {!lookupResult && isDuplicateInFolio && (
                  <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 mt-3">
                    <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-danger-700">{t('desp.validar.orden.duplicadoFolio')}</p>
                      <p className="text-[11px] text-danger-600 leading-snug">
                        <span className="font-mono font-semibold">{addOrderNo}</span> {t('desp.validar.orden.duplicadoFolioDesc')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleConfirmAdd}
                    disabled={
                      addingOrder || isDuplicateInFolio || !addForm.outbound_order_no.trim() ||
                      (!autoValidate && (!String(addForm.bultos).trim() || parseInt(addForm.bultos) < 1))
                    }
                    className="btn-primary text-sm flex items-center gap-1.5">
                    {addingOrder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {autoValidate && localScans.length > 0
                      ? `${t('desp.validar.orden.confirmar')} (${localScans.length})`
                      : t('desp.validar.orden.confirmar')}
                  </button>
                  <button
                    onClick={() => { setShowAddOrder(false); setLookupResult(null); setLookupInput(''); setLocalScans([]); setScanInput('') }}
                    className="btn-secondary text-sm">{t('common.cancel')}</button>
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
              <th className="table-header text-center">Esp.</th>
              <th className="table-header text-center">Valid.</th>
              <th className="table-header text-center">Desp.</th>
              <th className="table-header">Estado</th>
              {editable && <th className="table-header w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={editable ? 8 : 7} className="py-14 text-center text-warm-300 text-xs">
                  {t('desp.validar.orden.sinOrdenes')}
                </td>
              </tr>
            ) : orders.map((order) => (
              <Fragment key={order.id}>
                <motion.tr
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
                        {validatingOrderId === order.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className={`w-3 h-3 shrink-0 ${validatingOrderId === order.id ? 'text-primary-500' : 'text-warm-200'}`} />
                      <span className="font-mono font-semibold text-primary-700 text-xs">{order.outbound_order_no}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {order.destinatario ? (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-warm-300 shrink-0" />
                        <span className="text-xs text-warm-700 font-medium truncate max-w-[160px]">{order.destinatario}</span>
                      </div>
                    ) : <span className="text-xs text-warm-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-xs text-warm-500 tabular-nums">{order.bultos_esperados ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`text-xs font-semibold tabular-nums ${(order.surtido_validadas ?? 0) > 0 ? 'text-success-600' : 'text-warm-300'}`}>
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
                    ) : (
                      <StatusPill className={ORDER_ESTADO_META[order.estado]?.cls ?? ORDER_ESTADO_META.pendiente.cls}>
                        {ORDER_ESTADO_META[order.estado]?.label ?? 'Pendiente'}
                      </StatusPill>
                    )}
                  </td>
                  {editable && (
                    <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setValidatingOrderId(id => id === order.id ? null : order.id)}
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

                {validatingOrderId === order.id && (
                  <tr>
                    <td colSpan={editable ? 8 : 7} className="p-0">
                      <AnimatePresence>
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                          <ValidationPanel
                            order={order}
                            folioId={folioId}
                            onUpdate={applyUpdate}
                            canEdit={editable}
                            onAutoConfirm={(body) => doUpdateOrder({ orderId: order.id, body })}
                            onClose={() => setValidatingOrderId(null)}
                            validarPorTarimas={true}
                          />
                        </motion.div>
                      </AnimatePresence>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cancel confirm modal */}
      <Modal
        isOpen={showConfirmCancel}
        onClose={() => setShowConfirmCancel(false)}
        title={t('desp.validar.cancelarFolioTitle')}
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowConfirmCancel(false)} className="btn-secondary text-sm">{t('common.back')}</button>
            <button onClick={() => doCancelar()} disabled={cancelando}
              className="btn-danger text-sm flex items-center gap-1.5">
              {cancelando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('desp.validar.confirmarCancelacion')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          {t('desp.validar.orden.cancelConfirm')}
        </p>
      </Modal>
    </div>
  )
}
