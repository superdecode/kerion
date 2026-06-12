import React, { useState, useRef, useEffect } from 'react'
import Modal from '../../../core/components/common/Modal'
import { Crosshair, Search, X, ScanBarcode, Loader2, CheckSquare, Square } from 'lucide-react'
import { getOutboundDetail } from '../../WmsHub/services/googleSheetsService'
import { getInventoryList } from '../../WmsHub/services/googleSheetsService'
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

  // Load GS inventory map once when modal opens
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
      if (!res?.data) {
        setError('Orden no encontrada en el sistema')
        return
      }
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

  function handleScanKeyDown(e) {
    if (e.key !== 'Enter') return
    const code = scanInput.trim().toUpperCase()
    if (!code) return
    if (manualCajas.find(c => c.box_code === code)) {
      setScanInput('')
      return
    }
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
      const packages = outboundDetail?.packageList || []
      return packages
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
    if (!cajas.length) {
      setError('Selecciona al menos una caja')
      return
    }
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
      <div className="flex border-b border-warm-200 mb-4">
        {[
          { key: 'con_orden', label: 'Con orden de salida' },
          { key: 'sin_orden', label: 'Sin orden (flexible)' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${tab === t.key
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-warm-500 hover:text-warm-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {/* Con orden mode */}
        {tab === 'con_orden' && (
          <>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Número de orden (OBC)"
                value={obc}
                onChange={e => setObc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoadObc()}
              />
              <button onClick={handleLoadObc} disabled={loadingDetail || !obc.trim()} className="btn btn-secondary flex items-center gap-1.5">
                {loadingDetail ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Cargar
              </button>
            </div>

            {outboundDetail && (
              <div className="rounded-lg border border-warm-200 overflow-hidden">
                <div className="bg-warm-50 px-3 py-2 border-b border-warm-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-warm-700">
                    {outboundDetail.packageList?.length || 0} caja(s) — {outboundDetail.customerCode || '—'}
                  </span>
                  <span className="text-xs text-warm-400">{selectedBoxes.size} seleccionadas</span>
                </div>
                <div className="max-h-[220px] overflow-y-auto divide-y divide-warm-100">
                  {(outboundDetail.packageList || []).map((b, i) => (
                    <button
                      key={i}
                      onClick={() => toggleBox(b.customizeCode)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-warm-50 transition-colors"
                    >
                      {selectedBoxes.has(b.customizeCode)
                        ? <CheckSquare size={15} className="text-primary-600 flex-shrink-0" />
                        : <Square size={15} className="text-warm-300 flex-shrink-0" />}
                      <span className="font-mono text-xs text-warm-700">{b.customizeCode}</span>
                      {invMap?.[normalizeCodeFast(b.customizeCode || '')] && (
                        <span className="ml-auto text-xs text-warm-400">
                          {invMap[normalizeCodeFast(b.customizeCode)]?.cellNo || '—'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Sin orden mode */}
        {tab === 'sin_orden' && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  ref={scanRef}
                  className="input pl-9"
                  placeholder="Escanear o ingresar código de caja + Enter"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  autoFocus
                />
              </div>
            </div>
            {loadingInv && (
              <p className="text-xs text-warm-400 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Cargando inventario...
              </p>
            )}
            {manualCajas.length > 0 && (
              <div className="rounded-lg border border-warm-200 overflow-hidden">
                <div className="bg-warm-50 px-3 py-2 border-b border-warm-200">
                  <span className="text-xs font-semibold text-warm-700">{manualCajas.length} caja(s)</span>
                </div>
                <div className="max-h-[200px] overflow-y-auto divide-y divide-warm-100">
                  {manualCajas.map(c => (
                    <div key={c.box_code} className="flex items-center gap-3 px-3 py-2">
                      <span className="font-mono text-xs text-warm-700 flex-1">{c.box_code}</span>
                      {c.ubicacion && <span className="text-xs text-warm-400">{c.ubicacion}</span>}
                      <button onClick={() => removeManualCaja(c.box_code)} className="p-0.5 rounded hover:bg-warm-100 text-warm-400">
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
            <label className="block text-xs font-medium text-warm-600 mb-1">Asignar a</label>
            <select className="input" value={asignadoA} onChange={e => setAsignadoA(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre_completo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-600 mb-1">Notas</label>
            <input
              className="input"
              placeholder="Notas opcionales"
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
