import React, { useState, useRef, useEffect } from 'react'
import Modal from '../../../core/components/common/Modal'
import {
  Crosshair, Search, X, ScanBarcode, Loader2, CheckSquare, Square,
  FileSearch, Truck, User, FileText, Package,
} from 'lucide-react'
import { getOutboundDetail, getInventoryList } from '../../WmsHub/services/googleSheetsService'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { createRastreoOrden } from '../../../core/services/rastreoService'

export default function NuevaOrdenRastreoModal({ isOpen, onClose, usuarios = [], onCreated }) {
  const [tab, setTab] = useState('con_orden')
  const [obc, setObc] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [outboundDetail, setOutboundDetail] = useState(null)
  const [selectedBoxes, setSelectedBoxes] = useState(new Set())
  const [manualCajas, setManualCajas] = useState([])
  const [scanInput, setScanInput] = useState('')
  const [asignadoA, setAsignadoA] = useState('')
  const [notas, setNotas] = useState('')
  const [invMap, setInvMap] = useState(null)
  const [loadingInv, setLoadingInv] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const scanRef = useRef(null)

  useEffect(() => {
    if (!isOpen || invMap) return
    setLoadingInv(true)
    getInventoryList()
      .then(res => {
        const map = {}
        ;(res?.data?.records || []).forEach(item => {
          const k = normalizeCodeFast(item.customizeBarcode || '')
          if (k) map[k] = item
        })
        setInvMap(map)
      })
      .catch(() => setInvMap({}))
      .finally(() => setLoadingInv(false))
  }, [isOpen])

  function reset() {
    setTab('con_orden')
    setObc('')
    setOutboundDetail(null)
    setSelectedBoxes(new Set())
    setManualCajas([])
    setScanInput('')
    setAsignadoA('')
    setNotas('')
    setError('')
  }

  async function handleLoadObc() {
    if (!obc.trim()) return
    setLoadingDetail(true)
    setError('')
    setOutboundDetail(null)
    setSelectedBoxes(new Set())
    try {
      const res = await getOutboundDetail(obc.trim().toUpperCase())
      if (!res?.data) { setError('Orden no encontrada en el sistema'); return }
      setOutboundDetail(res.data)
      const allCodes = new Set((res.data.packageList || []).map(b => b.customizeCode).filter(Boolean))
      setSelectedBoxes(allCodes)
    } catch {
      setError('Error al cargar la orden')
    } finally {
      setLoadingDetail(false)
    }
  }

  function toggleBox(code) {
    setSelectedBoxes(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  function selectAllBoxes() {
    const allCodes = new Set((outboundDetail?.packageList || []).map(b => b.customizeCode).filter(Boolean))
    setSelectedBoxes(allCodes)
  }

  function clearSelectedBoxes() {
    setSelectedBoxes(new Set())
  }

  function handleScanKeyDown(e) {
    if (e.key !== 'Enter') return
    const code = scanInput.trim().toUpperCase()
    if (!code) return
    if (manualCajas.find(c => c.box_code === code)) { setScanInput(''); return }
    const normalized = normalizeCodeFast(code)
    const gsItem = invMap?.[normalized]
    setManualCajas(prev => [...prev, {
      box_code: code,
      ubicacion: gsItem?.cellNo || null,
      producto: gsItem?.productName || null,
      cantidad_disponible: gsItem?.availableAmount != null ? parseFloat(gsItem.availableAmount) : null,
    }])
    setScanInput('')
  }

  function removeManualCaja(code) {
    setManualCajas(prev => prev.filter(c => c.box_code !== code))
  }

  function buildCajasPayload() {
    if (tab === 'con_orden') {
      return (outboundDetail?.packageList || [])
        .filter(b => selectedBoxes.has(b.customizeCode))
        .map(b => {
          const normalized = normalizeCodeFast(b.customizeCode || '')
          const gsItem = invMap?.[normalized]
          return {
            box_code: b.customizeCode,
            ubicacion: gsItem?.cellNo || null,
            producto: gsItem?.productName || null,
            cantidad_disponible: gsItem?.availableAmount != null ? parseFloat(gsItem.availableAmount) : null,
          }
        })
    }
    return manualCajas
  }

  async function handleSubmit() {
    setError('')
    const cajas = buildCajasPayload()
    if (!cajas.length) { setError('Selecciona al menos una caja'); return }
    setSubmitting(true)
    try {
      const body = {
        outbound_order_no: tab === 'con_orden' ? obc.trim().toUpperCase() : undefined,
        customer_code: tab === 'con_orden' ? outboundDetail?.customerCode || undefined : undefined,
        asignado_a: asignadoA || undefined,
        notas: notas || undefined,
        cajas,
      }
      const res = await createRastreoOrden(body)
      onCreated?.(res.data?.folio)
      reset()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error || 'Error al crear la orden')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = tab === 'con_orden'
    ? selectedBoxes.size > 0 && outboundDetail
    : manualCajas.length > 0

  const TABS = [
    { key: 'con_orden', label: 'Con orden de salida', icon: FileSearch },
    { key: 'sin_orden', label: 'Sin orden (flexible)', icon: ScanBarcode },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { reset(); onClose() }}
      title="Nueva orden de rastreo"
      icon={Crosshair}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className="flex gap-2 ml-auto">
            <button onClick={() => { reset(); onClose() }} className="btn btn-secondary">Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="btn btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Crear rastreo
            </button>
          </div>
        </div>
      }
    >
      {/* Tab bar */}
      <div className="flex border-b border-warm-200 mb-4 -mx-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${tab === t.key
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-warm-400 hover:text-warm-700'}`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'con_orden' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-warm-600 mb-1.5 flex items-center gap-1.5">
                <Truck size={12} className="text-warm-400" />
                Número de orden de salida (OBC)
              </label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Ej: OBC-20240611-001"
                  value={obc}
                  onChange={e => setObc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLoadObc()}
                />
                <button
                  onClick={handleLoadObc}
                  disabled={loadingDetail || !obc.trim()}
                  className="btn btn-secondary flex items-center gap-1.5"
                >
                  {loadingDetail ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Cargar
                </button>
              </div>
            </div>

            {outboundDetail && (
              <div className="rounded-xl border border-warm-200 overflow-hidden">
                <div className="bg-warm-50 px-3 py-2.5 border-b border-warm-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={13} className="text-warm-400" />
                    <span className="text-xs font-semibold text-warm-700">
                      {outboundDetail.packageList?.length || 0} cajas
                      {outboundDetail.customerCode && ` — ${outboundDetail.customerCode}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-primary-600 font-semibold">{selectedBoxes.size} seleccionadas</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={selectAllBoxes}
                        className="text-[11px] font-semibold text-primary-600 hover:text-primary-700"
                      >
                        Marcar todo
                      </button>
                      <span className="text-warm-300">·</span>
                      <button
                        type="button"
                        onClick={clearSelectedBoxes}
                        className="text-[11px] font-semibold text-warm-500 hover:text-warm-700"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>
                </div>
                <div className="max-h-[220px] overflow-y-auto divide-y divide-warm-100">
                  {(outboundDetail.packageList || []).map((b, i) => {
                    const gsItem = invMap?.[normalizeCodeFast(b.customizeCode || '')]
                    return (
                      <button
                        key={i}
                        onClick={() => toggleBox(b.customizeCode)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-warm-50 transition-colors"
                      >
                        {selectedBoxes.has(b.customizeCode)
                          ? <CheckSquare size={15} className="text-primary-600 flex-shrink-0" />
                          : <Square size={15} className="text-warm-300 flex-shrink-0" />}
                        <span className="font-mono text-xs text-warm-700 flex-1">{b.customizeCode}</span>
                        {gsItem?.cellNo && (
                          <span className="text-xs text-warm-400">{gsItem.cellNo}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'sin_orden' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-warm-600 mb-1.5 flex items-center gap-1.5">
                <ScanBarcode size={12} className="text-warm-400" />
                Escanear código de caja
              </label>
              <div className="relative">
                <ScanBarcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  ref={scanRef}
                  className="input pl-9"
                  placeholder="Escanear o ingresar + Enter"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  autoFocus
                />
              </div>
              {loadingInv && (
                <p className="mt-1.5 text-xs text-warm-400 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" />
                  Cargando inventario...
                </p>
              )}
            </div>

            {manualCajas.length > 0 && (
              <div className="rounded-xl border border-warm-200 overflow-hidden">
                <div className="bg-warm-50 px-3 py-2.5 border-b border-warm-100 flex items-center gap-2">
                  <Package size={13} className="text-warm-400" />
                  <span className="text-xs font-semibold text-warm-700">{manualCajas.length} caja{manualCajas.length !== 1 ? 's' : ''} agregadas</span>
                </div>
                <div className="max-h-[200px] overflow-y-auto divide-y divide-warm-100">
                  {manualCajas.map(c => (
                    <div key={c.box_code} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="font-mono text-xs text-warm-700 flex-1">{c.box_code}</span>
                      {c.ubicacion && <span className="text-xs text-warm-400">{c.ubicacion}</span>}
                      {c.producto && <span className="text-xs text-warm-400 truncate max-w-[120px]">{c.producto}</span>}
                      <button
                        onClick={() => removeManualCaja(c.box_code)}
                        className="p-1 rounded-lg hover:bg-warm-100 text-warm-300 hover:text-warm-600 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Common fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5 flex items-center gap-1.5">
              <User size={12} className="text-warm-400" />
              Asignar a
            </label>
            <select className="input" value={asignadoA} onChange={e => setAsignadoA(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre_completo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5 flex items-center gap-1.5">
              <FileText size={12} className="text-warm-400" />
              Notas iniciales
            </label>
            <input
              className="input"
              placeholder="Opcional"
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
