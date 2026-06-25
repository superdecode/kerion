import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { List, MapPin, ArrowRight, Loader2, ScanBarcode, CalendarDays, User, Truck, Search, X } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import CatalogEmptyHint from '../../../core/components/common/CatalogEmptyHint'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getOutboundList } from '../services/despachoService'
import { getOrderDateKey, getOrderDateTimeRaw } from '../utils/orderDate'

const EASE = [0.16, 1, 0.3, 1]

const FOLIO_TYPE_DEFS = [
  {
    value: 'por_orden',
    icon: List,
    ring: 'border-primary-400',
    gradient: 'from-primary-50/80 to-white',
    iconBg: 'bg-primary-100',
    iconFg: 'text-primary-600',
    dotBg: 'bg-primary-500',
    dotBorder: 'border-primary-400',
    labelKey: 'desp.validar.tipo.porOrden.label',
    descKey: 'desp.validar.tipo.porOrden.desc',
  },
  {
    value: 'por_destino',
    icon: MapPin,
    ring: 'border-accent-400',
    gradient: 'from-accent-50/80 to-white',
    iconBg: 'bg-accent-100',
    iconFg: 'text-accent-600',
    dotBg: 'bg-accent-500',
    dotBorder: 'border-accent-400',
    labelKey: 'desp.validar.tipo.porDestino.label',
    descKey: 'desp.validar.tipo.porDestino.desc',
  },
]

function getDestinoName(order) {
  return String(order?.receiverName || order?.logisticsChannel || '').trim()
}


export default function FolioTypeModal({ isOpen, onClose, onCreate, conductores = [], unidades = [], isCreating = false }) {
  const { t } = useI18nStore()
  const [tipoSelected, setTipoSelected] = useState(null)
  const [form, setForm] = useState({ conductor_id: '', unidad_id: '', fecha_salida: new Date().toISOString().slice(0, 10) })
  const [showMissingFieldsError, setShowMissingFieldsError] = useState(false)
  const [showDestinoError, setShowDestinoError] = useState(false)

  // Por destino fields
  const [destinoSearch, setDestinoSearch] = useState('')
  const [destinoSelected, setDestinoSelected] = useState('')
  const [fechaEnvio, setFechaEnvio] = useState('')
  const [destinoFocused, setDestinoFocused] = useState(false)
  const destinoAnchorRef = useRef(null)
  const [dropdownRect, setDropdownRect] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setTipoSelected(null)
      setForm({ conductor_id: '', unidad_id: '', fecha_salida: new Date().toISOString().slice(0, 10) })
      setShowMissingFieldsError(false)
      setShowDestinoError(false)
      setDestinoSearch('')
      setDestinoSelected('')
      setFechaEnvio('')
      setDestinoFocused(false)
    }
  }, [isOpen])

  // Re-uses the cache pre-warmed by Validar.jsx — no extra network call
  const { data: outboundRaw, isLoading: loadingDestinos } = useQuery({
    queryKey: ['despacho-outbound-list'],
    queryFn: getOutboundList,
    enabled: isOpen && tipoSelected === 'por_destino',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.data?.partial ? 1500 : false,
    retry: false,
  })

  const deferredFechaEnvio = useDeferredValue(fechaEnvio)
  const deferredDestinoSearch = useDeferredValue(destinoSearch)
  const allOutboundRecords = outboundRaw?.data?.records ?? []
  const outboundIsPartial = !!outboundRaw?.data?.partial

  const destinoOptionsByDate = useMemo(() => {
    const byDate = new Map()
    allOutboundRecords.forEach(record => {
      const dateKey = getOrderDateKey(record)
      const destinoName = getDestinoName(record)
      if (!dateKey || !destinoName) return

      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map())
      const destinosForDate = byDate.get(dateKey)

      if (!destinosForDate.has(destinoName)) {
        destinosForDate.set(destinoName, { name: destinoName, orders: [] })
      }
      destinosForDate.get(destinoName).orders.push(record)
    })

    const sortedByDate = new Map()
    byDate.forEach((destinosForDate, dateKey) => {
      sortedByDate.set(
        dateKey,
        [...destinosForDate.values()].sort((a, b) => a.name.localeCompare(b.name))
      )
    })
    return sortedByDate
  }, [allOutboundRecords])

  const destinoOptions = useMemo(() => {
    if (!deferredFechaEnvio) return []
    return destinoOptionsByDate.get(deferredFechaEnvio) ?? []
  }, [destinoOptionsByDate, deferredFechaEnvio])

  const filteredDestinos = useMemo(() => {
    const q = deferredDestinoSearch.trim().toLowerCase()
    if (!q) return destinoOptions
    return destinoOptions.filter(d => d.name.toLowerCase().includes(q))
  }, [destinoOptions, deferredDestinoSearch])

  const selectedDestinoOption = destinoOptions.find(d => d.name === destinoSelected) ?? null

  // Derived — never stored in state to avoid sync bugs
  const derivedOrders = (() => {
    if (!selectedDestinoOption) return []
    return selectedDestinoOption.orders
  })()

  function selectDestino(d) {
    setShowDestinoError(false)
    setDestinoSelected(d.name)
    setDestinoSearch(d.name)
  }

  const hasRequiredAssignment = !!form.conductor_id && !!form.unidad_id && !!form.fecha_salida
  const missingConductor = !form.conductor_id
  const missingUnidad = !form.unidad_id
  const missingFechaSalida = !form.fecha_salida

  const canCreate = tipoSelected === 'por_orden'
    ? hasRequiredAssignment
    : (hasRequiredAssignment && !!selectedDestinoOption && derivedOrders.length > 0)

  const requiresFechaEnvio = tipoSelected === 'por_destino' && !fechaEnvio
  const shouldKeepLoadingDestinos = (
    tipoSelected === 'por_destino' &&
    !!fechaEnvio &&
    outboundIsPartial &&
    destinoOptions.length === 0
  )
  const isPreparingDestinos = (
    tipoSelected === 'por_destino' &&
    !!fechaEnvio &&
    (loadingDestinos || shouldKeepLoadingDestinos || deferredFechaEnvio !== fechaEnvio)
  )

  function handleCreate() {
    if (!hasRequiredAssignment) {
      setShowMissingFieldsError(true)
      return
    }
    setShowMissingFieldsError(false)

    if (tipoSelected === 'por_destino') {
      if (!fechaEnvio || !selectedDestinoOption || derivedOrders.length === 0 || isPreparingDestinos) {
        setShowDestinoError(true)
        return
      }
    }
    setShowDestinoError(false)

    if (!canCreate) return
    const payload = {
      tipo: tipoSelected,
      conductor_id: form.conductor_id || null,
      unidad_id: form.unidad_id || null,
      fecha_salida: form.fecha_salida || null,
    }
    if (tipoSelected === 'por_destino') {
      payload.destino = selectedDestinoOption.name
      payload.orders = derivedOrders.map(o => ({
        outbound_order_no: o.outboundOrderNo,
        destinatario: getDestinoName(o),
        bultos: 0,
        bultos_esperados: o.outboundBoxCount || null,
        outbound_date: getOrderDateTimeRaw(o) || null,
        notas: JSON.stringify({
          validation_scope: 'por_destino',
          destino: selectedDestinoOption.name,
          logisticsTrackNo: o.logisticsTrackNo || null,
          thirdOrderNo: o.thirdOrderNo || null,
          logisticsChannel: o.logisticsChannel || null,
          allCustomizeCodes: Array.isArray(o.allCustomizeCodes) ? o.allCustomizeCodes : [],
        }),
      }))
    }
    onCreate(payload)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('desp.validar.modal.title')}
      icon={ScanBarcode}
      size="lg"
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose} disabled={isCreating}>{t('common.cancel')}</button>
          <button
            className="btn-primary inline-flex items-center gap-2"
            onClick={handleCreate}
            disabled={!tipoSelected || isCreating}
          >
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {t('desp.validar.modal.crear')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Type selection — side by side */}
        <div className="grid grid-cols-2 gap-2.5">
          {FOLIO_TYPE_DEFS.map(opt => {
            const Icon = opt.icon
            const active = tipoSelected === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setTipoSelected(opt.value)}
                className={`group w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-all duration-200
                  ${active
                    ? `${opt.ring} bg-gradient-to-br ${opt.gradient} shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)]`
                    : 'border-warm-200 bg-white hover:border-warm-300 hover:shadow-sm'
                  }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                  ${active ? opt.iconBg : 'bg-warm-100 group-hover:bg-warm-200/60'}`}>
                  <Icon className={`w-4 h-4 transition-colors duration-200 ${active ? opt.iconFg : 'text-warm-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-xs leading-tight transition-colors duration-200 ${active ? 'text-warm-900' : 'text-warm-600'}`}>
                    {t(opt.labelKey)}
                  </p>
                  <p className={`text-[11px] mt-0.5 leading-snug transition-colors duration-200 ${active ? 'text-warm-500' : 'text-warm-400'}`}>
                    {t(opt.descKey)}
                  </p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all duration-200
                  ${active ? `${opt.dotBorder} ${opt.dotBg}` : 'border-warm-300 bg-white'}`}>
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            )
          })}
        </div>

        {/* Form fields — revealed with smooth animation after type selection */}
        <AnimatePresence>
          {tipoSelected && (
            <motion.div
              key="form-fields"
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pt-1">
                {/* Common fields — single row */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.28, ease: EASE }}
                  className="rounded-xl border border-warm-100 bg-warm-50/60 px-3 py-2.5 space-y-2"
                >
                  <AnimatePresence>
                    {showMissingFieldsError && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2"
                      >
                        <p className="text-[11px] font-semibold text-danger-700">
                          {t('desp.validar.modal.debeCompletarCUF')}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">{t('desp.validar.modal.folioInfo')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-warm-600 mb-1 flex items-center gap-1">
                        <User size={10} /> {t('desp.validar.modal.conductor')}
                      </label>
                      <select
                        value={form.conductor_id}
                        onChange={e => {
                          const value = e.target.value
                          setForm(f => ({ ...f, conductor_id: value }))
                          if (value && !missingUnidad && !missingFechaSalida) setShowMissingFieldsError(false)
                        }}
                        className={`input-field w-full text-xs ${showMissingFieldsError && missingConductor ? 'border-danger-400 bg-danger-50 text-danger-700 focus:border-danger-500 focus:ring-danger-100' : ''}`}
                      >
                        <option value="">{t('desp.validar.modal.selConductorReq')}</option>
                        {conductores.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}{c.licencia ? ` · ${c.licencia}` : ''}</option>
                        ))}
                      </select>
                      {conductores.length === 0 && <CatalogEmptyHint item={t('desp.validar.modal.conductor').toLowerCase()} section={t('desp.folios.title')} action={t('desp.btn.conductores')} />}
                      {showMissingFieldsError && missingConductor && (
                        <p className="mt-1 text-[11px] font-medium text-danger-700">Selecciona un conductor.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-warm-600 mb-1 flex items-center gap-1">
                        <Truck size={10} /> {t('desp.validar.modal.unidad')}
                      </label>
                      <select
                        value={form.unidad_id}
                        onChange={e => {
                          const value = e.target.value
                          setForm(f => ({ ...f, unidad_id: value }))
                          if (!missingConductor && value && !missingFechaSalida) setShowMissingFieldsError(false)
                        }}
                        className={`input-field w-full text-xs ${showMissingFieldsError && missingUnidad ? 'border-danger-400 bg-danger-50 text-danger-700 focus:border-danger-500 focus:ring-danger-100' : ''}`}
                      >
                        <option value="">{t('desp.validar.modal.selUnidadReq')}</option>
                        {unidades.map(u => (
                          <option key={u.id} value={u.id}>{u.placa} ({u.tipo})</option>
                        ))}
                      </select>
                      {unidades.length === 0 && <CatalogEmptyHint item={t('desp.validar.modal.unidad').toLowerCase()} section={t('desp.folios.title')} action={t('desp.btn.unidades')} />}
                      {showMissingFieldsError && missingUnidad && (
                        <p className="mt-1 text-[11px] font-medium text-danger-700">Selecciona una unidad.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-warm-600 mb-1 flex items-center gap-1">
                        <CalendarDays size={10} /> {t('desp.validar.modal.fechaSalida')}
                      </label>
                      <input
                        type="date"
                        value={form.fecha_salida}
                        onChange={e => {
                          const value = e.target.value
                          setForm(f => ({ ...f, fecha_salida: value }))
                          if (!missingConductor && !missingUnidad && value) setShowMissingFieldsError(false)
                        }}
                        className={`input-field w-full text-xs ${showMissingFieldsError && missingFechaSalida ? 'border-danger-400 bg-danger-50 text-danger-700 focus:border-danger-500 focus:ring-danger-100' : ''}`}
                      />
                      {showMissingFieldsError && missingFechaSalida && (
                        <p className="mt-1 text-[11px] font-medium text-danger-700">{t('desp.validar.modal.selFechaSalida')}</p>
                      )}
                    </div>
                  </div>
                  {!hasRequiredAssignment && !showMissingFieldsError && (
                    <p className="text-[11px] text-warning-700">
                      {t('desp.validar.modal.debeSelCUF')}
                    </p>
                  )}
                </motion.div>

                {/* Por destino: destino selector */}
                <AnimatePresence>
                  {tipoSelected === 'por_destino' && (
                    <motion.div
                      key="destino-section"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4, height: 0 }}
                      transition={{ delay: 0.14, duration: 0.28, ease: EASE }}
                      className="rounded-xl border border-accent-200 bg-accent-50/40 px-3 py-2.5 space-y-2"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-500">{t('desp.validar.modal.selDestino')}</p>

                      {/* Fecha + Destino search in one row */}
                      <div className="grid grid-cols-[160px_1fr] gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-warm-600 mb-1">{t('desp.validar.modal.fechaEnvio')}</label>
                          <input
                            type="date"
                            value={fechaEnvio}
                            onChange={e => {
                              const value = e.target.value
                              setFechaEnvio(value)
                              setShowDestinoError(false)
                              setDestinoSelected('')
                              setDestinoSearch('')
                              setDestinoFocused(false)
                            }}
                            className={`input-field w-full text-xs ${showDestinoError && !fechaEnvio ? 'border-danger-400 bg-danger-50 text-danger-700 focus:border-danger-500 focus:ring-danger-100' : ''}`}
                          />
                        </div>
                        <div>
                        <label className="block text-[11px] font-semibold text-warm-600 mb-1">{t('desp.validar.modal.destinoCanal')}</label>
                        <div className="relative" ref={destinoAnchorRef}>
                          <div className={`flex items-center gap-2 bg-white border rounded-xl px-3 h-9 focus-within:ring-2 ${
                            showDestinoError && fechaEnvio && !selectedDestinoOption
                              ? 'border-danger-400 bg-danger-50 focus-within:border-danger-500 focus-within:ring-danger-100'
                              : 'border-warm-200 focus-within:border-accent-400 focus-within:ring-accent-100'
                          }`}>
                            {isPreparingDestinos
                              ? <Loader2 size={12} className="animate-spin text-warm-400 shrink-0" />
                              : <Search size={12} className="text-warm-400 shrink-0" />
                            }
                            <input
                              type="text"
                              className="flex-1 text-xs outline-none bg-transparent text-warm-700 placeholder-warm-300"
                              placeholder={
                                requiresFechaEnvio
                                  ? t('desp.validar.modal.selPrimeroFecha')
                                  : isPreparingDestinos
                                  ? t('desp.validar.modal.cargandoDestinos')
                                  : t('desp.validar.modal.buscarDestino')
                              }
                              value={destinoSearch}
                              onChange={e => { setDestinoSearch(e.target.value); setDestinoSelected(''); setShowDestinoError(false) }}
                              onFocus={() => {
                                if (requiresFechaEnvio || isPreparingDestinos) return
                                if (destinoAnchorRef.current) {
                                  setDropdownRect(destinoAnchorRef.current.getBoundingClientRect())
                                }
                                setDestinoFocused(true)
                              }}
                              onBlur={() => setTimeout(() => setDestinoFocused(false), 150)}
                              disabled={requiresFechaEnvio || isPreparingDestinos}
                            />
                            {destinoSearch && (
                              <button onClick={() => { setDestinoSearch(''); setDestinoSelected('') }}>
                                <X size={11} className="text-warm-400 hover:text-warm-600" />
                              </button>
                            )}
                          </div>
                          {requiresFechaEnvio && (
                            <p className={`mt-1 text-[11px] ${showDestinoError ? 'font-semibold text-danger-700' : 'text-warning-700'}`}>
                              {t('desp.validar.modal.debeFecha')}
                            </p>
                          )}
                          {!requiresFechaEnvio && isPreparingDestinos && (
                            <p className="mt-1 text-[11px] text-accent-700">
                              {t('desp.validar.modal.preparandoDestinos')}
                            </p>
                          )}
                          {!requiresFechaEnvio && !isPreparingDestinos && fechaEnvio && filteredDestinos.length === 0 && (
                            <p className={`mt-1 text-[11px] ${showDestinoError ? 'font-semibold text-danger-700' : 'text-warning-700'}`}>
                              {t('desp.validar.modal.sinDestinosFecha')}
                            </p>
                          )}
                          {!requiresFechaEnvio && !isPreparingDestinos && fechaEnvio && filteredDestinos.length > 0 && !selectedDestinoOption && showDestinoError && (
                            <p className="mt-1 text-[11px] font-semibold text-danger-700">
                              {t('desp.validar.modal.selDestinoLista')}
                            </p>
                          )}
                          {/* Dropdown rendered via portal to escape overflow:hidden parents */}
                          {!requiresFechaEnvio && !isPreparingDestinos && (destinoFocused || destinoSearch) && !selectedDestinoOption && filteredDestinos.length > 0 && dropdownRect && createPortal(
                            <div
                              style={{
                                position: 'fixed',
                                bottom: window.innerHeight - dropdownRect.top + 4,
                                left: dropdownRect.left,
                                width: dropdownRect.width,
                                zIndex: 10001,
                              }}
                              className="bg-white border border-warm-200 rounded-xl shadow-depth max-h-48 overflow-y-auto"
                            >
                              {filteredDestinos.slice(0, 20).map(d => (
                                <button
                                  key={d.name}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent-50 transition-colors flex items-center justify-between"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => selectDestino(d)}
                                >
                                  <span className="font-medium text-warm-800 truncate">{d.name}</span>
                                  <span className="text-warm-400 shrink-0 ml-2">{d.orders.length} {t('desp.validar.modal.ordenes')}</span>
                                </button>
                              ))}
                            </div>,
                            document.body
                          )}
                        </div>
                        </div>
                      </div>

                      {/* Selected destino summary */}
                      {isPreparingDestinos && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.22, ease: EASE }}
                          className="rounded-xl border border-accent-200 bg-white px-3 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-accent-500 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-warm-800">{t('desp.validar.modal.preparandoDestinosTitle')}</p>
                              <p className="text-[11px] text-warm-500">{t('desp.validar.modal.preparandoDestinosBody')}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {selectedDestinoOption && !isPreparingDestinos && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.22, ease: EASE }}
                          className="rounded-xl border border-accent-200 bg-white px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MapPin size={13} className="text-accent-600 shrink-0" />
                              <span className="text-sm font-bold text-warm-800">{selectedDestinoOption.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-right">
                              <div>
                                <p className="text-[9px] text-warm-400 uppercase tracking-wide">{t('desp.validar.modal.ordenes')}</p>
                                <p className="text-sm font-bold text-accent-700 tabular-nums">{derivedOrders.length}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-warm-400 uppercase tracking-wide">{t('desp.validar.modal.cajasEsp')}</p>
                                <p className="text-sm font-bold text-warm-800 tabular-nums">
                                  {derivedOrders.reduce((s, o) => s + (o.outboundBoxCount || 0), 0) || '—'}
                                </p>
                              </div>
                            </div>
                          </div>
                          {derivedOrders.length === 0 && (
                            <p className="text-[11px] text-warning-600 mt-1.5">
                              {t('desp.validar.modal.sinOrdenesDate')}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[11px] text-warm-400 text-center">
          {t('desp.validar.modal.tipoNoEdit')}
        </p>
      </div>
    </Modal>
  )
}
