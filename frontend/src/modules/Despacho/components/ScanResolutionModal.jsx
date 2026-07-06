// frontend/src/modules/Despacho/components/ScanResolutionModal.jsx
import { useState, useEffect } from 'react'
import { AlertTriangle, CalendarDays, MapPin, Hash, Tag, Package, Truck, X, CheckCircle2, Clock, XCircle } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import StatusPill from '../../../core/components/common/StatusPill'
import { fmtDateString, toDateKey } from '../../../core/utils/dateFormat'
import { useI18nStore } from '../../../core/stores/i18nStore'

function getOrderDateKey(order) {
  const raw = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
  if (!raw) return ''
  try {
    const k = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : toDateKey(raw)
    return (k && k !== '—') ? k : ''
  } catch { return '' }
}

function getDateStatus(order, dateFrom, dateTo) {
  const dk = getOrderDateKey(order)
  const today = new Date().toISOString().slice(0, 10)

  if (!dk) return { type: 'unknown', label: 'Sin fecha registrada', cls: 'bg-warm-100 text-warm-500' }

  const isCancelled = (order.trackingStatus || order.status || '') === 'cancelled'
  if (isCancelled) return { type: 'cancelled', label: 'Cancelada', cls: 'bg-danger-100 text-danger-600' }

  if (dateFrom && dateTo && dk >= dateFrom && dk <= dateTo)
    return { type: 'in_range', label: 'En rango activo', cls: 'bg-success-100 text-success-700' }

  if (dk < today)
    return { type: 'past', label: `Fecha pasada · ${fmtDateString(dk)}`, cls: 'bg-warning-100 text-warning-700' }

  if (dk > today)
    return { type: 'future', label: `Fecha futura · ${fmtDateString(dk)}`, cls: 'bg-accent-100 text-accent-700' }

  return { type: 'out_range', label: `Fuera de rango · ${fmtDateString(dk)}`, cls: 'bg-danger-100 text-danger-600' }
}

function OrderCard({ entry, selected, onSelect, dateFrom, dateTo }) {
  const { order, inRange } = entry
  const orderNo  = order.outboundOrderNo || order.order_no || '—'
  const destino  = order.receiverName || order.customerName || order.cliente || '—'
  const dateVal  = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
  const tracking = order.logisticsTrackNo || ''
  const ref      = order.thirdOrderNo || ''
  const channel  = order.logisticsChannel || ''
  const boxes    = order.outboundBoxCount ?? null
  const ds       = getDateStatus(order, dateFrom, dateTo)

  return (
    <button
      type="button"
      onClick={() => onSelect(orderNo)}
      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all duration-150 space-y-2 ${
        selected
          ? inRange
            ? 'border-success-400 bg-success-50/60'
            : 'border-warning-400 bg-warning-50/60'
          : 'border-warm-200 bg-warm-50/40 hover:border-warm-300 hover:bg-warm-50'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            selected ? (inRange ? 'border-success-500 bg-success-500' : 'border-warning-500 bg-warning-500') : 'border-warm-300 bg-white'
          }`}>
            {selected && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
          <span className="font-mono font-bold text-primary-700 text-sm">{orderNo}</span>
        </div>
        <StatusPill size="xs" className={ds.cls}>{ds.label}</StatusPill>
      </div>

      {/* Data rows */}
      <div className="pl-6 space-y-1">
        {dateVal && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3 text-warm-400 shrink-0" />
            <span className="text-xs text-warm-700">{fmtDateString(getOrderDateKey(order) || dateVal)}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-warm-400 shrink-0" />
          <span className="text-xs text-warm-700 font-medium">{destino}</span>
        </div>
        {channel && (
          <div className="flex items-center gap-1.5">
            <Truck className="w-3 h-3 text-warm-400 shrink-0" />
            <span className="text-xs text-warm-600">{channel}</span>
          </div>
        )}
        {tracking && (
          <div className="flex items-center gap-1.5">
            <Hash className="w-3 h-3 text-warm-400 shrink-0" />
            <span className="font-mono text-xs text-warm-600 break-all">{tracking}</span>
          </div>
        )}
        {ref && (
          <div className="flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-warm-400 shrink-0" />
            <span className="font-mono text-xs text-warm-600">{ref}</span>
          </div>
        )}
        {boxes !== null && (
          <div className="flex items-center gap-1.5">
            <Package className="w-3 h-3 text-warm-400 shrink-0" />
            <span className="text-xs text-warm-600">{boxes} cajas esperadas</span>
          </div>
        )}
      </div>
    </button>
  )
}

export default function ScanResolutionModal({ isOpen, onClose, onConfirm, orders = [], query = '', dateFrom, dateTo }) {
  const { t } = useI18nStore()
  const [selectedNo, setSelectedNo] = useState(null)

  const isSingle     = orders.length === 1
  const inRangeList  = orders.filter(e => e.inRange)
  const allOutRange  = inRangeList.length === 0

  // Default selection: first in-range order; if none, first order
  useEffect(() => {
    if (!isOpen) return
    const preferred = inRangeList[0] ?? orders[0]
    setSelectedNo(preferred ? (preferred.order.outboundOrderNo || preferred.order.order_no) : null)
  }, [isOpen, orders])

  if (!isOpen) return null

  const selectedEntry = orders.find(e => (e.order.outboundOrderNo || e.order.order_no) === selectedNo)

  function handleConfirm() {
    if (!selectedEntry) return
    onConfirm(selectedEntry.order)
  }

  const titleText = isSingle
    ? 'Orden fuera del rango de fechas'
    : `${orders.length} órdenes encontradas — Selecciona una`

  const subtitleText = isSingle
    ? allOutRange
      ? '¿Deseas agregar esta orden al despacho de todas formas?'
      : 'Confirma antes de continuar'
    : allOutRange
      ? 'Ninguna está en el rango activo. Selecciona la que corresponde.'
      : inRangeList.length < orders.length
        ? 'Una o más están fuera del rango activo. La del rango activo está pre-seleccionada.'
        : 'Selecciona la orden correcta para el despacho.'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={titleText}
      icon={AlertTriangle}
      size="md"
      preventBackdropClose={false}
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="btn-ghost flex-1 inline-flex items-center justify-center gap-1.5 text-sm">
            <X className="w-3.5 h-3.5" /> {t('desp.scan.resolution.cancelar')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedEntry}
            className="btn-primary flex-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSingle && allOutRange ? t('desp.scan.resolution.confirmarDeTodas') : t('desp.scan.resolution.confirmar')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Context info */}
        <div className="rounded-xl bg-warm-50 border border-warm-100 px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-warm-400 uppercase tracking-wide">{t('desp.scan.codigoEscaneado')}</span>
            <span className="font-mono text-xs font-bold text-warm-700">{query}</span>
          </div>
          {dateFrom && dateTo && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-warm-400 shrink-0" />
              <span className="text-xs text-warm-600">
                {t('desp.scan.rangoActivo')}: <span className="font-semibold">{fmtDateString(dateFrom)} → {fmtDateString(dateTo)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Warning for single out-of-range */}
        {isSingle && allOutRange && (
          <div className="flex items-start gap-2 rounded-xl bg-warning-50 border border-warning-200 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
            <p className="text-xs text-warning-700 font-medium">
              Esta orden no corresponde al rango de fechas seleccionado para el despacho.
              Verifica que sea la orden correcta antes de continuar.
            </p>
          </div>
        )}

        {/* Warning for all-out-of-range multi */}
        {!isSingle && allOutRange && (
          <div className="flex items-start gap-2 rounded-xl bg-danger-50 border border-danger-200 px-4 py-3">
            <XCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
            <p className="text-xs text-danger-700 font-medium">
              Ninguna de las órdenes encontradas está dentro del rango de fechas activo.
            </p>
          </div>
        )}

        {/* Order cards */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5">
          {orders.map(entry => {
            const no = entry.order.outboundOrderNo || entry.order.order_no
            return (
              <OrderCard
                key={no}
                entry={entry}
                selected={selectedNo === no}
                onSelect={setSelectedNo}
                dateFrom={dateFrom}
                dateTo={dateTo}
              />
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
