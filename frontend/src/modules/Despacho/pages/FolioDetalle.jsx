import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Truck, User, Package, Loader2, Plus, Trash2,
  CheckCircle2, XCircle, Clock, FileText, Edit3, ArrowLeft,
  CalendarDays, StickyNote, ScanLine, X, Check, PackageCheck, AlertCircle, Printer,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDate, fmtTimeShort } from '../../../core/utils/dateFormat'
import {
  getFolio, updateFolio, addOrder, updateOrder, removeOrder,
  cerrarFolio, cancelarFolio,
  getConductores, getUnidades, findOrderByBarcode,
} from '../services/despachoService'
import { printFolio } from '../utils/printFolio'

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

export default function FolioDetalle() {
  const { id: folioId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToastStore()
  const { canWrite, canDelete } = useAuthStore()
  const qc = useQueryClient()

  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [addOrderForm, setAddOrderForm] = useState({ outbound_order_no: '', cliente: '', bultos: 1, peso_kg: '', notas: '' })
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [scanInput, setScanInput] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanValidated, setScanValidated] = useState(false)
  const [showConfirmCancel, setShowConfirmCancel] = useState(false)
  const scanRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['despacho-folio', folioId],
    queryFn: () => getFolio(folioId),
    enabled: !!folioId,
  })

  const { data: conductoresData } = useQuery({ queryKey: ['despacho-conductores'], queryFn: getConductores })
  const { data: unidadesData } = useQuery({ queryKey: ['despacho-unidades'], queryFn: getUnidades })

  const folio = data?.folio
  const orders = data?.orders ?? []
  const conductores = conductoresData?.conductores ?? []
  const unidades = unidadesData?.unidades ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folios'] })
  }

  function handlePrint() {
    if (!folio) return
    const result = printFolio({ folio, orders })
    if (!result.success) addToast(result.message, 'error')
  }

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
    onSuccess: () => {
      invalidate()
      setAddOrderForm({ outbound_order_no: '', cliente: '', bultos: 1, peso_kg: '', notas: '' })
      setShowAddOrder(false)
      addToast('Orden agregada', 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error agregando orden', 'error'),
  })

  const { mutate: doRemoveOrder } = useMutation({
    mutationFn: ({ orderId }) => removeOrder(folioId, orderId),
    onSuccess: () => { invalidate(); addToast('Orden eliminada', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error eliminando orden', 'error'),
  })

  const { mutate: doUpdateOrder } = useMutation({
    mutationFn: ({ orderId, body }) => updateOrder(folioId, orderId, body),
    onSuccess: () => invalidate(),
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

  const setAof = (k, v) => setAddOrderForm(f => ({ ...f, [k]: v }))

  const handleScan = useCallback(async (barcode) => {
    const code = (barcode || scanInput).trim()
    if (!code) return

    // Second scan on the same result = validate (mark as cargado)
    if (scanResult && (scanResult.outboundOrderNo || '').toUpperCase() === code.toUpperCase()) {
      const match = orders.find(o => o.outbound_order_no === scanResult.outboundOrderNo)
      if (match) {
        doUpdateOrder({ orderId: match.id, body: { estado: 'cargado' } })
        addToast(`Orden ${scanResult.outboundOrderNo} marcada como Cargada`, 'success')
        setScanValidated(true)
        setScanResult(null)
        setScanInput('')
        setTimeout(() => setScanValidated(false), 2500)
        return
      }
    }

    setScanLoading(true)
    setScanResult(null)
    setScanValidated(false)
    try {
      const found = await findOrderByBarcode(code)
      if (found) {
        setScanResult(found)
        setAddOrderForm({
          outbound_order_no: found.outboundOrderNo || code,
          cliente: found.receiverName || found.customerCode || '',
          bultos: found.outboundBoxCount || 1,
          peso_kg: '',
          notas: '',
        })
        addToast(`Orden ${found.outboundOrderNo} encontrada`, 'info')
      } else {
        addToast('Código no encontrado. Puedes agregar la orden manualmente.', 'warning')
        setAddOrderForm(f => ({ ...f, outbound_order_no: code }))
        setShowAddOrder(true)
      }
    } finally {
      setScanLoading(false)
      setScanInput('')
      scanRef.current?.focus()
    }
  }, [scanInput, scanResult, orders, doUpdateOrder, addToast])

  const confirmScanAdd = () => {
    if (!scanResult) return
    doAddOrder(addOrderForm)
    setScanResult(null)
  }

  const openScan = () => {
    setScanMode(true)
    setScanResult(null)
    setScanInput('')
    setScanValidated(false)
    setTimeout(() => scanRef.current?.focus(), 100)
  }

  const closeScan = () => {
    setScanMode(false)
    setScanResult(null)
    setScanInput('')
    setScanValidated(false)
  }

  const estadoMeta = folio ? (FOLIO_ESTADO_META[folio.estado] ?? FOLIO_ESTADO_META.borrador) : null

  // Totals
  const totalBultos = orders.reduce((s, o) => s + (o.bultos || 0), 0)
  const totalPeso = orders.reduce((s, o) => s + (parseFloat(o.peso_kg) || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Custom header */}
      <header className="h-14 bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-5 flex items-center gap-3 shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate('/despacho/folios')}
          className="p-1.5 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition-all shrink-0"
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
            className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
          {editMode && (
            <button onClick={() => setEditMode(false)} className="btn-secondary text-xs flex items-center gap-1">
              <X className="w-3.5 h-3.5" />
              Cancelar
            </button>
          )}
          {!editMode && folio && canEdit && canDelete('despacho.folios') && (
            <button onClick={() => setShowConfirmCancel(true)} disabled={cancelando}
              className="btn-danger text-xs flex items-center gap-1">
              {cancelando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Cancelar Folio
            </button>
          )}
          {canEdit && folio?.estado === 'en_proceso' && canWrite('despacho.folios') && !editMode && (
            <button onClick={() => doCerrar()} disabled={cerrando}
              className="btn-success text-xs flex items-center gap-1">
              {cerrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Cerrar Folio
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : !folio ? (
          <div className="py-16 text-center text-warm-400">
            <FileText className="w-10 h-10 mx-auto mb-3 text-warm-200" />
            <p className="font-medium">Folio no encontrado</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-3">

            {/* Info block */}
            <div className="bg-white rounded-2xl border border-warm-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-warm-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-warm-600">Información del folio</span>
                  <span className="text-[10px] text-warm-400">{fmtDate(folio.created_at)} · {fmtTimeShort(folio.created_at)}</span>
                </div>
                {editable && !editMode && (
                  <button onClick={startEdit} className="btn-ghost text-xs flex items-center gap-1 py-1 px-2">
                    <Edit3 className="w-3 h-3" />
                    Editar
                  </button>
                )}
              </div>

              {editMode ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-warm-600 mb-1">Conductor</label>
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
                      <label className="block text-xs font-semibold text-warm-600 mb-1">Unidad</label>
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
                      <label className="block text-xs font-semibold text-warm-600 mb-1">Fecha de Salida</label>
                      <input type="date" value={editForm.fecha_salida}
                        onChange={e => setEditForm(f => ({ ...f, fecha_salida: e.target.value }))}
                        className="input-field w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-warm-600 mb-1">Notas</label>
                      <input value={editForm.notas}
                        onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                        className="input-field w-full text-sm" placeholder="Observaciones..." />
                    </div>
                  </div>
                  <button onClick={() => doUpdate(editForm)} disabled={updatingFolio}
                    className="btn-primary text-sm flex items-center gap-1.5">
                    {updatingFolio && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Guardar cambios
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-warm-100">
                  {[
                    { icon: User,        label: 'Conductor',    value: folio.conductor_nombre || '—' },
                    { icon: Truck,       label: 'Unidad',       value: folio.unidad_placa ? `${folio.unidad_placa} (${folio.unidad_tipo})` : '—' },
                    { icon: CalendarDays,label: 'Fecha Salida', value: folio.fecha_salida ? fmtDate(folio.fecha_salida) : '—' },
                    { icon: Package,     label: 'Operador',     value: folio.operador_nombre || '—' },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-warm-400 mb-1">
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
                      </div>
                      <p className="text-sm font-semibold text-warm-800 truncate">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {folio.notas && !editMode && (
                <div className="flex items-start gap-2 text-xs text-warm-500 bg-warm-50 border-t border-warm-100 px-4 py-2.5">
                  <StickyNote className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{folio.notas}</span>
                </div>
              )}
            </div>

            {/* Orders section */}
            <div className="bg-white rounded-2xl border border-warm-100 shadow-sm overflow-hidden">
              {/* Orders header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-warm-100">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-warm-800">Órdenes asignadas</h3>
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">
                    {orders.length}
                  </span>
                  {orders.length > 0 && (
                    <span className="text-xs text-warm-400">
                      {totalBultos} bultos
                      {totalPeso > 0 && ` · ${totalPeso.toFixed(1)} kg`}
                    </span>
                  )}
                </div>
                {editable && canWrite('despacho.folios') && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={scanMode ? closeScan : openScan}
                      className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all ${
                        scanMode
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100'
                      }`}
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      {scanMode ? 'Cerrar Escaneo' : 'Escanear'}
                    </button>
                    <button onClick={() => { setShowAddOrder(v => !v); setScanMode(false) }}
                      className="btn-primary text-xs flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Agregar Orden
                    </button>
                  </div>
                )}
              </div>

              {/* Scan panel */}
              {scanMode && editable && (
                <div className="bg-emerald-50/60 px-5 py-4 border-b border-emerald-100">
                  <div className="flex items-center gap-2 mb-3">
                    <ScanLine className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-semibold text-emerald-700">Modo escaneo — escanea o ingresa el código de la caja u orden</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-white border-2 border-emerald-300 rounded-xl px-3 h-10 flex-1 focus-within:border-emerald-500 transition-colors">
                      <ScanLine className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <input
                        ref={scanRef}
                        type="text"
                        value={scanInput}
                        onChange={e => setScanInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleScan() }}
                        placeholder="Código de caja, guía o No. orden..."
                        className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-800 font-mono placeholder:font-sans placeholder:text-warm-400"
                        autoComplete="off"
                      />
                      {scanInput && (
                        <button onClick={() => setScanInput('')} className="text-warm-400 hover:text-warm-600">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => handleScan()}
                      disabled={!scanInput.trim() || scanLoading}
                      className="btn-primary text-xs flex items-center gap-1.5 h-10 px-4"
                    >
                      {scanLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                      Buscar
                    </button>
                  </div>

                  {/* Scan validated flash */}
                  {scanValidated && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 font-semibold">
                      <Check className="w-4 h-4" />
                      Orden marcada como Cargada
                    </div>
                  )}

                  {/* Scan result */}
                  {scanResult && !scanValidated && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-3 bg-white rounded-xl border border-emerald-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <PackageCheck className="w-4 h-4 text-emerald-600" />
                            <span className="font-mono font-semibold text-primary-700 text-sm">{scanResult.outboundOrderNo}</span>
                          </div>
                          {(scanResult.receiverName || scanResult.customerCode) && (
                            <p className="text-xs text-warm-600">{scanResult.receiverName || scanResult.customerCode}</p>
                          )}
                          {scanResult.outboundBoxCount && (
                            <p className="text-[11px] text-warm-400">{scanResult.outboundBoxCount} caja{scanResult.outboundBoxCount !== 1 ? 's' : ''}</p>
                          )}
                          {orders.find(o => o.outbound_order_no === scanResult.outboundOrderNo) && (
                            <p className="text-[11px] font-semibold text-warning-600">Ya asignada al folio — escanea de nuevo para marcar como Cargada</p>
                          )}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {!orders.find(o => o.outbound_order_no === scanResult.outboundOrderNo) && (
                            <button
                              onClick={confirmScanAdd}
                              disabled={addingOrder}
                              className="btn-primary text-xs flex items-center gap-1">
                              {addingOrder ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                              Agregar
                            </button>
                          )}
                          <button onClick={() => setScanResult(null)} className="btn-secondary text-xs">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <p className="mt-3 text-[10px] text-emerald-600/70">
                    Segundo escaneo del mismo código marca la orden como <strong>Cargada</strong>
                  </p>
                </div>
              )}

              {/* Add order form */}
              {showAddOrder && !scanMode && (
                <div className="bg-primary-50 px-5 py-4 border-b border-primary-100">
                  <p className="text-xs font-semibold text-primary-700 mb-3">Nueva orden</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-warm-600 mb-1">No. Orden *</label>
                      <input value={addOrderForm.outbound_order_no}
                        onChange={e => setAof('outbound_order_no', e.target.value)}
                        className="input-field w-full text-sm" placeholder="OBC-12345" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-warm-600 mb-1">Cliente</label>
                      <input value={addOrderForm.cliente} onChange={e => setAof('cliente', e.target.value)}
                        className="input-field w-full text-sm" placeholder="Nombre del cliente" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-warm-600 mb-1">Bultos</label>
                      <input type="number" min="1" value={addOrderForm.bultos}
                        onChange={e => setAof('bultos', parseInt(e.target.value) || 1)}
                        className="input-field w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-warm-600 mb-1">Peso (kg)</label>
                      <input type="number" step="0.1" value={addOrderForm.peso_kg}
                        onChange={e => setAof('peso_kg', e.target.value)}
                        className="input-field w-full text-sm" placeholder="0.0" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => doAddOrder(addOrderForm)}
                      disabled={addingOrder || !addOrderForm.outbound_order_no.trim()}
                      className="btn-primary text-sm flex items-center gap-1.5">
                      {addingOrder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Agregar
                    </button>
                    <button onClick={() => setShowAddOrder(false)} className="btn-secondary text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Orders table */}
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                  <tr>
                    <th className="table-header">Orden</th>
                    <th className="table-header">Cliente</th>
                    <th className="table-header text-center">Bultos</th>
                    <th className="table-header text-center">Peso</th>
                    <th className="table-header">Estado</th>
                    {editable && <th className="table-header w-10"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={editable ? 6 : 5} className="py-12 text-center text-warm-300 text-xs">
                        Sin órdenes asignadas — usa el botón <strong>Agregar Orden</strong> para comenzar
                      </td>
                    </tr>
                  ) : orders.map((order) => (
                    <motion.tr key={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="hover:bg-warm-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-primary-700 text-xs">{order.outbound_order_no}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-warm-700 font-medium">{order.cliente || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-warm-700">{order.bultos}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-warm-600">{order.peso_kg ? `${order.peso_kg} kg` : '—'}</span>
                      </td>
                      <td className="px-4 py-3">
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
                        <td className="px-4 py-3">
                          {canDelete('despacho.folios') && (
                            <button onClick={() => doRemoveOrder({ orderId: order.id })}
                              className="text-warm-300 hover:text-danger-500 transition-colors p-1 rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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
            <button onClick={() => { doCancelar(); setShowConfirmCancel(false) }} disabled={cancelando} className="btn-danger text-sm flex items-center gap-1.5">
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
