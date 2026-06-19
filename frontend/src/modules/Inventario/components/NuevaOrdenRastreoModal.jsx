import React, { useState, useRef, useEffect, useMemo } from 'react'
import Modal from '../../../core/components/common/Modal'
import {
  Crosshair, Search, X, ScanBarcode, Loader2, CheckSquare, Square,
  FileSearch, Truck, User, FileText, Package,
} from 'lucide-react'
import { getOutboundDetail, getInventoryList } from '../../WmsHub/services/googleSheetsService'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { createRastreoOrden } from '../../../core/services/rastreoService'
import { useI18nStore } from '../../../core/stores/i18nStore'

export default function NuevaOrdenRastreoModal({ isOpen, onClose, usuarios = [], onCreated }) {
  const { t } = useI18nStore()
  const [tab, setTab] = useState('con_orden')
  const [obc, setObc] = useState('')
  const [boxSearch, setBoxSearch] = useState('')
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
          const barcode = normalizeCodeFast(item.customizeBarcode || '')
          const boxType = normalizeCodeFast(item.boxType || '')
          if (barcode) map[barcode] = item
          if (boxType) map[boxType] = item
        })
        setInvMap(map)
      })
      .catch(() => setInvMap({}))
      .finally(() => setLoadingInv(false))
  }, [isOpen])

  const visibleBoxes = useMemo(() => {
    const list = outboundDetail?.packageList || []
    const q = boxSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter(b =>
      b.customizeCode?.toLowerCase().includes(q) ||
      b.boxType?.toLowerCase().includes(q) ||
      invMap?.[normalizeCodeFast(b.customizeCode || '')]?.cellNo?.toLowerCase().includes(q) ||
      invMap?.[normalizeCodeFast(b.boxType || '')]?.cellNo?.toLowerCase().includes(q)
    )
  }, [outboundDetail, boxSearch, invMap])

  const outboundBoxTotal = outboundDetail?.outboundBoxCount ?? outboundDetail?.packageList?.length ?? outboundDetail?.outboundBoxList?.length ?? 0

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
    setBoxSearch('')
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
      const allCodes = new Set((res.data.packageList || []).map(b => b.customizeCode || b.boxType).filter(Boolean))
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
    const allCodes = new Set((outboundDetail?.packageList || []).map(b => b.customizeCode || b.boxType).filter(Boolean))
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
      box_type: gsItem?.boxType || null,
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
        .filter(b => selectedBoxes.has(b.customizeCode || b.boxType))
        .map(b => {
          const normalized = normalizeCodeFast(b.customizeCode || '')
          const normalizedBoxType = normalizeCodeFast(b.boxType || '')
          const gsItem = invMap?.[normalized] || invMap?.[normalizedBoxType]
          return {
            box_code: b.customizeCode || b.boxType,
            box_type: b.boxType || null,
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
    { key: 'con_orden', label: t('rastreo.nuevaOrden.tabConOrden'), icon: FileSearch },
    { key: 'sin_orden', label: t('rastreo.nuevaOrden.tabSinOrden'), icon: ScanBarcode },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { reset(); onClose() }}
      title={t('rastreo.nuevaOrden.title')}
      icon={Crosshair}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className="flex gap-2 ml-auto">
            <button onClick={() => { reset(); onClose() }} className="btn btn-secondary">{t('common.cancel')}</button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="btn btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {t('rastreo.nuevaOrden.create')}
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
                {t('rastreo.nuevaOrden.obcLabel')}
              </label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder={t('rastreo.nuevaOrden.obcPlaceholder')}
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
                  {t('rastreo.nuevaOrden.load')}
                </button>
              </div>
            </div>

            {outboundDetail && (
              <div className="rounded-xl border border-warm-200 overflow-hidden">
                <div className="bg-warm-50 px-3 py-2.5 border-b border-warm-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Package size={13} className="text-warm-400" />
                    <span className="text-xs font-semibold text-warm-700">
                      {outboundBoxTotal} {t('rastreo.nuevaOrden.cajas')}
                      {outboundDetail.customerCode && ` — ${outboundDetail.customerCode}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-primary-600 font-semibold">{selectedBoxes.size} {t('rastreo.nuevaOrden.seleccionadas')}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const visibleCodes = new Set(visibleBoxes.map(b => b.customizeCode || b.boxType).filter(Boolean))
                          setSelectedBoxes(prev => {
                            const next = new Set(prev)
                            visibleCodes.forEach(c => next.add(c))
                            return next
                          })
                        }}
                        className="text-[11px] font-semibold text-primary-600 hover:text-primary-700"
                      >
                        {t('rastreo.nuevaOrden.marcarVisibles')}
                      </button>
                      <span className="text-warm-300">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          const visibleCodes = new Set(visibleBoxes.map(b => b.customizeCode || b.boxType).filter(Boolean))
                          setSelectedBoxes(prev => {
                            const next = new Set(prev)
                            visibleCodes.forEach(c => next.delete(c))
                            return next
                          })
                        }}
                        className="text-[11px] font-semibold text-warm-500 hover:text-warm-700"
                      >
                        {t('rastreo.nuevaOrden.desmarcarVisibles')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Search within boxes */}
                <div className="flex items-center gap-1.5 bg-white border-b border-warm-100 px-3 h-8 focus-within:border-primary-300">
                  <Search size={11} className="text-warm-400 shrink-0" />
                  <input
                    className="flex-1 text-xs outline-none bg-transparent text-warm-700 placeholder-warm-300"
                    placeholder={t('rastreo.nuevaOrden.searchBoxes')}
                    value={boxSearch}
                    onChange={e => setBoxSearch(e.target.value)}
                  />
                  {boxSearch && (
                    <button onClick={() => setBoxSearch('')}>
                      <X size={10} className="text-warm-400 hover:text-warm-600" />
                    </button>
                  )}
                </div>

                <div className="max-h-[200px] overflow-y-auto divide-y divide-warm-100">
                  {visibleBoxes.length === 0 ? (
                    <div className="py-4 text-center text-xs text-warm-400">{t('rastreo.nuevaOrden.noBoxResults')}</div>
                  ) : visibleBoxes.map((b, i) => {
                    const boxKey = b.customizeCode || b.boxType
                    const gsItem = invMap?.[normalizeCodeFast(b.customizeCode || '')] || invMap?.[normalizeCodeFast(b.boxType || '')]
                    return (
                      <button
                        key={i}
                        onClick={() => toggleBox(boxKey)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-warm-50 transition-colors"
                      >
                        {selectedBoxes.has(boxKey)
                          ? <CheckSquare size={15} className="text-primary-600 flex-shrink-0" />
                          : <Square size={15} className="text-warm-300 flex-shrink-0" />}
                        <span className="font-mono text-xs text-warm-700 flex-1">{boxKey}</span>
                        {b.boxType && b.boxType !== boxKey && (
                          <span className="text-[10px] text-warm-400">{b.boxType}</span>
                        )}
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
                {t('rastreo.nuevaOrden.scanBoxLabel')}
              </label>
              <div className="relative">
                <ScanBarcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  ref={scanRef}
                  className="input pl-9"
                  placeholder={t('rastreo.nuevaOrden.scanBoxPlaceholder')}
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  autoFocus
                />
              </div>
              {loadingInv && (
                <p className="mt-1.5 text-xs text-warm-400 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" />
                  {t('rastreo.nuevaOrden.loadingInventory')}
                </p>
              )}
            </div>

            {manualCajas.length > 0 && (
              <div className="rounded-xl border border-warm-200 overflow-hidden">
                <div className="bg-warm-50 px-3 py-2.5 border-b border-warm-100 flex items-center gap-2">
                  <Package size={13} className="text-warm-400" />
                  <span className="text-xs font-semibold text-warm-700">{manualCajas.length} {t('rastreo.nuevaOrden.manualAdded')}</span>
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
              {t('rastreo.nuevaOrden.assignTo')}
            </label>
            <select className="input" value={asignadoA} onChange={e => setAsignadoA(e.target.value)}>
              <option value="">{t('rastreo.nuevaOrden.unassigned')}</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre_completo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-600 mb-1.5 flex items-center gap-1.5">
              <FileText size={12} className="text-warm-400" />
              {t('rastreo.nuevaOrden.initialNotes')}
            </label>
            <input
              className="input"
              placeholder={t('common.optional')}
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
