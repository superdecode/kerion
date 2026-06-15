// frontend/src/modules/Despacho/components/DispatchQuantityModal.jsx
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Truck, Plus, X, CheckCircle2, MapPin, Hash, Tag } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { getFolios, createFolio, addOrder } from '../services/despachoService'
import { fmtDate } from '../../../core/utils/dateFormat'

export default function DispatchQuantityModal({ isOpen, onClose, order, conductores = [], unidades = [] }) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const [bultos, setBultos]           = useState(1)
  const [selectedFolioId, setSelectedFolioId] = useState('')
  const [createNew, setCreateNew]     = useState(false)
  const [newConductorId, setNewConductorId] = useState('')
  const [newUnidadId, setNewUnidadId] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')

  const { data: foliosData } = useQuery({
    queryKey: ['despacho-folios'],
    queryFn: () => getFolios({}),
    enabled: isOpen,
  })

  const activeFolios = (foliosData?.folios ?? []).filter(
    f => f.estado === 'borrador' || f.estado === 'en_proceso'
  )

  useEffect(() => {
    if (!isOpen) return
    setBultos(order?.outboundBoxCount ?? 1)
    setSelectedFolioId('')
    setCreateNew(false)
    setNewConductorId('')
    setNewUnidadId('')
    setError('')
  }, [isOpen, order])

  async function handleSubmit() {
    if (!order) return
    if (!createNew && !selectedFolioId) { setError('Selecciona un folio'); return }
    if (createNew && !newConductorId)   { setError('Selecciona un conductor'); return }
    if (createNew && !newUnidadId)      { setError('Selecciona una unidad'); return }
    if (!bultos || bultos < 1)          { setError('Bultos debe ser al menos 1'); return }

    setSubmitting(true)
    setError('')

    try {
      let folioId = selectedFolioId

      if (createNew) {
        const created = await createFolio({ conductor_id: newConductorId, unidad_id: newUnidadId })
        folioId = created.folio.id
      }

      await addOrder(folioId, {
        outbound_order_no: order.outboundOrderNo || order.order_no,
        cliente: order.customerName || order.cliente || '',
        bultos: Number(bultos),
      })

      await qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
      await qc.invalidateQueries({ queryKey: ['despacho-folios'] })

      const folioNum = createNew
        ? 'nuevo folio'
        : (activeFolios.find(f => f.id === folioId)?.folio_numero ?? folioId)

      addToast(`Orden agregada al folio ${folioNum}`, 'success')
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error ?? err.message ?? 'Error al agregar orden')
    } finally {
      setSubmitting(false)
    }
  }

  if (!order) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirmar Despacho"
      icon={Truck}
      size="sm"
      footer={
        <div className="flex gap-2 pt-4">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm inline-flex items-center justify-center gap-1.5" disabled={submitting}>
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          <button onClick={handleSubmit} className="btn-primary flex-1 text-sm" disabled={submitting}>
            {submitting ? 'Despachando...' : 'Despachar'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Order info card */}
        {(() => {
          const orderNo  = order.outboundOrderNo || order.order_no || '—'
          const destino  = order.receiverName || order.customerName || order.cliente || '—'
          const dateVal  = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
          const tracking = order.logisticsTrackNo || ''
          const ref      = order.thirdOrderNo || ''
          return (
            <div className="rounded-xl bg-white border border-warm-200 shadow-sm px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono font-bold text-primary-700 text-sm leading-tight">{orderNo}</p>
                {dateVal && (
                  <span className="text-xs text-warm-500 font-medium shrink-0">{fmtDate(dateVal)}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-warm-400 shrink-0" />
                <span className="text-xs text-warm-700">{destino}</span>
              </div>
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
            </div>
          )
        })()}

        {/* Bultos — expected qty left, dispatch qty right */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-warm-600 flex items-center gap-1">
            <Package className="w-3.5 h-3.5" /> Bultos
          </label>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 flex flex-col items-center justify-center gap-0.5">
              <span className="text-[10px] text-primary-500 font-semibold uppercase tracking-wide">Esperado</span>
              <span className="text-base font-bold text-primary-700">{order.outboundBoxCount ?? '—'}</span>
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[10px] text-warm-400 font-semibold uppercase tracking-wide text-center">A despachar</span>
              <input
                type="number"
                min={1}
                value={bultos}
                onChange={e => setBultos(e.target.value)}
                className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-center font-bold text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>
        </div>

        {/* Folio selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-warm-600">Folio de despacho</label>

          {/* Create new option */}
          <button
            onClick={() => { setCreateNew(true); setSelectedFolioId('') }}
            className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
              createNew
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-warm-200 bg-warm-50 text-warm-600 hover:border-primary-300'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Crear nuevo folio
          </button>

          {/* Inline conductor + unidad for new folio */}
          {createNew && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-3 space-y-2">
              <select
                value={newConductorId}
                onChange={e => setNewConductorId(e.target.value)}
                className="w-full rounded-lg border border-warm-200 bg-white px-2 py-2 text-xs text-warm-800 outline-none"
              >
                <option value="">Seleccionar conductor...</option>
                {conductores.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <select
                value={newUnidadId}
                onChange={e => setNewUnidadId(e.target.value)}
                className="w-full rounded-lg border border-warm-200 bg-white px-2 py-2 text-xs text-warm-800 outline-none"
              >
                <option value="">Seleccionar unidad...</option>
                {unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.placa} ({u.tipo})</option>
                ))}
              </select>
            </div>
          )}

          {/* Existing folios */}
          {activeFolios.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {activeFolios.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFolioId(f.id); setCreateNew(false) }}
                  className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all ${
                    selectedFolioId === f.id
                      ? 'border-primary-400 bg-primary-50 text-primary-700 shadow-sm'
                      : 'border-warm-200 bg-white text-warm-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:border-primary-300 hover:shadow-sm'
                  }`}
                >
                  <span className="font-mono text-xs font-semibold">{f.folio_numero}</span>
                  <span className="text-[10px] text-warm-400">{f.conductor_nombre} · {f.unidad_placa}</span>
                  {selectedFolioId === f.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary-500 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {activeFolios.length === 0 && !createNew && (
            <p className="text-xs text-warm-400 text-center py-2">No hay folios activos. Crea uno nuevo.</p>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-danger-600 font-medium bg-danger-50 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

    </Modal>
  )
}
