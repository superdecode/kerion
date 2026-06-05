import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, AlertCircle, X, Image, LayoutGrid } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { skuAutocomplete } from '../services/devolucionesService'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'

const emptySku = { sku: '', sku2: '', descripcion: '', cantidad: 1, peso: '', largo: '', ancho: '', alto: '' }

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-primary-600' : 'bg-warm-200'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

function LocationCombo({ value, onChange, ubicaciones, error }) {
  const { t } = useI18nStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = ubicaciones.find(u => String(u.id) === String(value))
  const display = selected ? selected.codigo : ''

  const filtered = (q
    ? ubicaciones.filter(u => u.activo !== false &&
        (`${u.codigo} ${u.nombre}`).toLowerCase().includes(q.toLowerCase()))
    : ubicaciones.filter(u => u.activo !== false)
  ).slice(0, 8)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (u) => { onChange(String(u.id)); setQ(''); setOpen(false) }

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={open ? q : display}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { setQ(''); setOpen(true) }}
        placeholder={t('dev.entrada_form.buscar_ubicacion')}
        className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 bg-warm-50 ${
          error ? 'border-danger-300 focus:ring-danger-200' : 'border-warm-200 focus:ring-primary-200'
        }`}
      />
      {value && !open && (
        <button
          type="button"
          onClick={() => { onChange(''); setQ('') }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-300 hover:text-warm-500"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-full left-0 right-0 z-30 mt-1 bg-white rounded-xl border border-warm-100 shadow-depth overflow-hidden max-h-48 overflow-y-auto"
          >
            {filtered.map(u => (
              <button
                key={u.id} type="button"
                onMouseDown={() => handleSelect(u)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-primary-50 transition-colors border-b border-warm-50 last:border-0 ${
                  String(u.id) === String(value) ? 'bg-primary-50 text-primary-700' : 'text-warm-700'
                }`}
              >
                <span className="font-semibold">{u.codigo}</span>
                {u.pcs_stock > 0 && (
                  <span className="float-right text-warm-400 font-normal">{u.pcs_stock} pcs</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function EntradaFormItem({
  onSubmit,
  onSaveAndAdd,
  onSaveDraft = null,
  onFormStateChange = null,
  saving = false,
  initialValue = null,
  onCancel = null,
  ubicaciones = [],
  existingSkus = [],
  onOpenUbicaciones = null,
  canManageUbicaciones = false,
  selectedUbicacionEvent = null,
}) {
  const { t } = useI18nStore()
  const MAX_FOTO_SIZE_BYTES = 2 * 1024 * 1024
  const emb1Ref = useRef(null)
  const [suggestions, setSuggestions] = useState([])
  const [activeSuggRow, setActiveSuggRow] = useState(-1)
  const [activeSuggIdx, setActiveSuggIdx] = useState(-1)
  const [errors, setErrors] = useState({})
  const [fotoFile, setFotoFile] = useState(null)
  const [pendingUbicacion, setPendingUbicacion] = useState(null)
  const debounceRef = useRef(null)

  const emptyForm = () => ({
    embalaje1: '', embalaje2: '',
    multicaja: false, es_danado: false, notas: '',
    skus: [{ ...emptySku }],
    ubicacion_id: '',
  })

  const normalizeFormValue = (val) => ({
    ...val,
    ubicacion_id: val.ubicacion_id?.toString() || '',
    skus: (val.skus || [{ ...emptySku }]).map(s => ({
      ...emptySku,
      ...s,
      peso: s.peso ?? '', largo: s.largo ?? '', ancho: s.ancho ?? '', alto: s.alto ?? '',
    })),
  })

  const [form, setForm] = useState(initialValue ? normalizeFormValue(initialValue) : emptyForm())

  const hasMeaningfulFormValue = (value) => {
    if (!value) return false
    if (value.embalaje1?.trim() || value.embalaje2?.trim() || value.notas?.trim() || value.ubicacion_id) return true
    if (value.multicaja || value.es_danado) return true

    return (value.skus || []).some((skuRow) =>
      skuRow?.sku?.trim() ||
      skuRow?.sku2?.trim() ||
      skuRow?.descripcion?.trim() ||
      skuRow?.peso !== '' ||
      skuRow?.largo !== '' ||
      skuRow?.ancho !== '' ||
      skuRow?.alto !== '' ||
      Number(skuRow?.cantidad || 1) !== 1
    )
  }

  useEffect(() => {
    setForm(initialValue ? normalizeFormValue(initialValue) : emptyForm())
    setErrors({})
    setFotoFile(null)
  }, [initialValue])

  useEffect(() => {
    const ubicacion = selectedUbicacionEvent?.ubicacion
    if (!ubicacion?.id) return

    if (Number(ubicacion.pcs_stock) > 0) {
      setPendingUbicacion(ubicacion)
      return
    }

    setPendingUbicacion(null)
    setForm(prev => ({ ...prev, ubicacion_id: String(ubicacion.id) }))
    setErrors(prev => ({ ...prev, ubicacion_id: undefined }))
  }, [selectedUbicacionEvent?.nonce])

  useEffect(() => {
    setTimeout(() => emb1Ref.current?.focus(), 50)
  }, [])

  useEffect(() => {
    onFormStateChange?.({
      form,
      isDirty: hasMeaningfulFormValue(form),
    })
  }, [form, onFormStateChange])

  const fetchSuggestions = (val, rowIndex) => {
    clearTimeout(debounceRef.current)
    if (val.length < 2) { setSuggestions([]); setActiveSuggRow(-1); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await skuAutocomplete(val)
        setSuggestions(data?.data || data?.items || [])
        setActiveSuggRow(rowIndex)
      } catch { setSuggestions([]); setActiveSuggRow(-1) }
    }, 300)
  }

  const applySuggestion = (item, rowIndex) => {
    const normalizeNumberInput = (value) => (
      value === null || value === undefined || value === '' ? '' : String(value)
    )

    setForm(prev => ({
      ...prev,
      skus: prev.skus.map((row, i) => i === rowIndex
        ? {
            ...row,
            sku: item.sku,
            sku2: item.sku2 || row.sku2,
            descripcion: item.descripcion || row.descripcion,
            peso: normalizeNumberInput(item.peso ?? row.peso),
            largo: normalizeNumberInput(item.largo ?? row.largo),
            ancho: normalizeNumberInput(item.ancho ?? row.ancho),
            alto: normalizeNumberInput(item.alto ?? row.alto),
          }
        : row
      ),
    }))
    setErrors(prev => ({
      ...prev,
      sku0: undefined,
      peso0: undefined,
      largo0: undefined,
      ancho0: undefined,
      alto0: undefined,
    }))
    setSuggestions([])
    setActiveSuggRow(-1)
    setActiveSuggIdx(-1)
  }

  const updateSku = (index, key, value) => {
    setForm(prev => ({
      ...prev,
      skus: prev.skus.map((row, i) => i === index ? { ...row, [key]: value } : row),
    }))
    if (key === 'sku') fetchSuggestions(value, index)
  }

  const addSku = () => setForm(prev => ({ ...prev, skus: [...prev.skus, { ...emptySku }] }))
  const removeSku = (i) => setForm(prev => ({ ...prev, skus: prev.skus.filter((_, idx) => idx !== i) }))

  const duplicateSku = form.skus[0]?.sku && existingSkus.includes(form.skus[0].sku.trim())

  const validate = () => {
    const e = {}
    if (!form.embalaje1.trim()) e.embalaje1 = t('dev.entrada_form.obligatorio')
    if (!form.skus[0]?.sku?.trim()) e.sku0 = t('dev.entrada_form.sku_col') + ' ' + t('dev.entrada_form.obligatorio').toLowerCase()
    if (!form.ubicacion_id) e.ubicacion_id = t('dev.entrada_form.obligatorio')
    const first = form.skus[0] || {}
    if (!first.peso) e.peso0 = t('dev.entrada_form.obligatorio')
    if (!first.largo) e.largo0 = t('dev.entrada_form.obligatorio')
    if (!first.ancho) e.ancho0 = t('dev.entrada_form.obligatorio')
    if (!first.alto) e.alto0 = t('dev.entrada_form.obligatorio')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildPayload = () => ({
    embalaje1: form.embalaje1,
    embalaje2: form.embalaje2,
    notas: form.notas,
    multicaja: form.multicaja,
    es_danado: form.es_danado,
    ubicacion_id: form.ubicacion_id || null,
    evidencia: fotoFile || null,
    skus: form.skus.filter(r => r.sku.trim()).map(r => ({
      sku: r.sku.trim(),
      sku2: r.sku2 || null,
      descripcion: r.descripcion || null,
      cantidad: Number(r.cantidad) || 1,
      peso: r.peso ? parseFloat(r.peso) : null,
      largo: r.largo ? parseFloat(r.largo) : null,
      ancho: r.ancho ? parseFloat(r.ancho) : null,
      alto: r.alto ? parseFloat(r.alto) : null,
    })),
  })

  const handleSoloAgregar = (e) => {
    e.preventDefault()
    if (!validate()) return
    if (onSaveAndAdd) {
      onSaveAndAdd(buildPayload(), () => {
        const savedUbicacion = form.ubicacion_id
        setForm({ ...emptyForm(), ubicacion_id: savedUbicacion })
        setErrors({})
        setFotoFile(null)
        setSuggestions([])
        setActiveSuggRow(-1)
        setActiveSuggIdx(-1)
        setTimeout(() => emb1Ref.current?.focus(), 50)
      })
      return
    }

    onSubmit(buildPayload())
  }

  const handleGuardarBorrador = (e) => {
    e.preventDefault()
    if (!validate()) return
    onSaveDraft?.(buildPayload())
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-warm-50'
  const inputErrCls = 'w-full px-3 py-2 rounded-xl border border-danger-300 text-sm focus:outline-none focus:ring-2 focus:ring-danger-200 bg-warm-50'
  const qtyInputCls = 'w-full px-3 py-2 rounded-xl border border-primary-200 text-sm font-semibold text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-200 bg-primary-50/70'
  const labelCls = 'block text-[11px] font-medium text-warm-500 mb-1'
  const errMsgCls = 'text-[10px] text-danger-500 mt-0.5 flex items-center gap-1'

  return (
    <form className="relative" onSubmit={handleSoloAgregar}>
      <div className="space-y-3">

        {/* Block 1: Datos generales — Embalajes + Ubicación */}
        <div className="bg-warm-50/70 border border-warm-100 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-semibold text-warm-400 uppercase tracking-wider">{t('dev.entrada_form.embalaje_section')}</p>
          <div className="grid grid-cols-[1fr,1fr,1.3fr] gap-2">
            <div>
              <label className={`${labelCls} ${errors.embalaje1 ? 'text-danger-500' : ''}`}>
                {t('dev.entrada_form.embalaje1')} <span className="text-danger-400">*</span>
              </label>
              <input
                ref={emb1Ref}
                value={form.embalaje1}
                onChange={e => setForm(p => ({ ...p, embalaje1: e.target.value }))}
                className={errors.embalaje1 ? inputErrCls : inputCls}
                placeholder={t('dev.entrada_form.embalaje1_ph')}
              />
              {errors.embalaje1 && (
                <p className={errMsgCls}><AlertCircle className="w-3 h-3" /> {errors.embalaje1}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>{t('dev.entrada_form.embalaje2')}</label>
              <input
                value={form.embalaje2}
                onChange={e => setForm(p => ({ ...p, embalaje2: e.target.value }))}
                className={inputCls}
                placeholder={t('dev.entrada_form.embalaje2_ph')}
              />
            </div>
            <div>
              <div className={`${labelCls} flex items-center justify-between ${errors.ubicacion_id ? 'text-danger-500' : ''}`}>
                <span>{t('dev.entrada_form.ubicacion')} <span className="text-danger-400">*</span></span>
                {onOpenUbicaciones && (
                  <button type="button" onClick={onOpenUbicaciones}
                    className="text-[10px] text-primary-500 hover:text-primary-700 hover:underline font-medium normal-case tracking-normal">
                    {canManageUbicaciones ? t('dev.entrada_form.ubicar_btn') : t('dev.entrada_form.ubicar_sel')}
                  </button>
                )}
              </div>
              <LocationCombo
                value={form.ubicacion_id}
                onChange={v => {
                  const ub = ubicaciones.find(u => String(u.id) === v)
                  if (ub && Number(ub.pcs_stock) > 0) {
                    setPendingUbicacion(ub)
                  } else {
                    setForm(p => ({ ...p, ubicacion_id: v }))
                  }
                }}
                ubicaciones={ubicaciones}
                error={!!errors.ubicacion_id}
              />
              {errors.ubicacion_id && (
                <p className={errMsgCls}><AlertCircle className="w-3 h-3" /> {errors.ubicacion_id}</p>
              )}
            </div>
          </div>
        </div>

        {/* Block 2: Datos de producto — cada SKU con sus propias medidas */}
        <div className="bg-white border border-warm-100 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-semibold text-warm-400 uppercase tracking-wider">{t('dev.entrada_form.producto_section')}</p>

          {/* Column headers — only shown once */}
          <div className="grid grid-cols-[1fr,1.2fr,84px,64px,64px,64px,88px,32px] gap-2 px-0.5">
            <span className={`${labelCls} ${errors.sku0 ? 'text-danger-500' : ''}`}>{t('dev.entrada_form.sku_col')} <span className="text-danger-400">*</span></span>
            <span className={labelCls}>{t('dev.entrada_form.desc_col')}</span>
            <span className={`${labelCls} ${errors.peso0 ? 'text-danger-500' : ''}`}>{t('dev.entrada_form.peso_col')} <span className="text-danger-400">*</span></span>
            <span className={`${labelCls} ${errors.largo0 ? 'text-danger-500' : ''}`}>{t('dev.entrada_form.largo_col')} <span className="text-danger-400">*</span></span>
            <span className={`${labelCls} ${errors.ancho0 ? 'text-danger-500' : ''}`}>{t('dev.entrada_form.ancho_col')} <span className="text-danger-400">*</span></span>
            <span className={`${labelCls} ${errors.alto0 ? 'text-danger-500' : ''}`}>{t('dev.entrada_form.alto_col')} <span className="text-danger-400">*</span></span>
            <span className={`${labelCls} ml-3 rounded-lg bg-primary-50/70 px-2.5 py-1 text-primary-600`}>{t('dev.entrada_form.cant_col')}</span>
            <span />
          </div>

          <div className="space-y-1.5">
            {form.skus.map((row, index) => (
              <div key={index} className={`${index > 0 ? 'border-t border-warm-100 pt-1.5' : ''}`}>
                <div className="grid grid-cols-[1fr,1.2fr,84px,64px,64px,64px,88px,32px] gap-2 items-start">

                  {/* SKU */}
                  <div className="relative">
                    <input
                      value={row.sku}
                      onChange={e => updateSku(index, 'sku', e.target.value)}
                      className={`${errors.sku0 && index === 0 ? inputErrCls : inputCls} ${duplicateSku && index === 0 ? '!border-warning-400 !bg-warning-50/40' : ''}`}
                      placeholder={t('dev.entrada_form.sku_ph')}
                      autoComplete="off"
                      onKeyDown={e => {
                        if (index === activeSuggRow && suggestions.length > 0) {
                          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggIdx(i => Math.min(i + 1, suggestions.length - 1)) }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggIdx(i => Math.max(i - 1, 0)) }
                          if (e.key === 'Enter' && activeSuggIdx >= 0) { e.preventDefault(); applySuggestion(suggestions[activeSuggIdx], index) }
                          if (e.key === 'Escape') { setSuggestions([]); setActiveSuggRow(-1) }
                        }
                      }}
                    />
                    <AnimatePresence>
                      {index === activeSuggRow && suggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="absolute top-full left-0 right-0 z-30 mt-1 bg-white/95 backdrop-blur-xl rounded-xl border border-warm-100 shadow-depth overflow-hidden"
                        >
                          {suggestions.slice(0, 6).map((item, si) => (
                            <button key={si} type="button" onMouseDown={() => applySuggestion(item, index)}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-primary-50 transition-colors border-b border-warm-50 last:border-0 ${activeSuggIdx === si ? 'bg-primary-50' : ''}`}
                            >
                              <span className="font-semibold text-warm-800">{item.sku}</span>
                              {item.descripcion && <span className="text-warm-400 ml-2">· {item.descripcion}</span>}
                              {(item.peso || item.largo || item.ancho || item.alto) && (
                                <span className="block mt-0.5 text-[10px] text-warm-400">
                                  {item.peso ? `${item.peso} kg` : t('dev.entrada_form.sin_peso')}
                                  {(item.largo || item.ancho || item.alto) ? ` · ${item.largo || '—'}×${item.ancho || '—'}×${item.alto || '—'} cm` : ''}
                                </span>
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Descripción */}
                  <input
                    value={row.descripcion}
                    onChange={e => updateSku(index, 'descripcion', e.target.value)}
                    className={inputCls}
                    placeholder={t('dev.entrada_form.desc_ph')}
                  />

                  {/* Peso */}
                  <input
                    type="number" step="0.01" min="0"
                    value={row.peso}
                    onChange={e => updateSku(index, 'peso', e.target.value)}
                    onFocus={e => e.target.select()}
                    className={errors.peso0 && index === 0 ? inputErrCls : inputCls}
                    placeholder={t('dev.entrada_form.peso_ph')}
                  />

                  {/* Largo */}
                  <input
                    type="number" step="0.01" min="0"
                    value={row.largo}
                    onChange={e => updateSku(index, 'largo', e.target.value)}
                    onFocus={e => e.target.select()}
                    className={errors.largo0 && index === 0 ? inputErrCls : inputCls}
                    placeholder={t('dev.entrada_form.largo_ph')}
                  />

                  {/* Ancho */}
                  <input
                    type="number" step="0.01" min="0"
                    value={row.ancho}
                    onChange={e => updateSku(index, 'ancho', e.target.value)}
                    onFocus={e => e.target.select()}
                    className={errors.ancho0 && index === 0 ? inputErrCls : inputCls}
                    placeholder={t('dev.entrada_form.ancho_ph')}
                  />

                  {/* Alto */}
                  <input
                    type="number" step="0.01" min="0"
                    value={row.alto}
                    onChange={e => updateSku(index, 'alto', e.target.value)}
                    onFocus={e => e.target.select()}
                    className={errors.alto0 && index === 0 ? inputErrCls : inputCls}
                    placeholder={t('dev.entrada_form.alto_ph')}
                  />

                  {/* Cantidad */}
                  <div className="ml-3">
                    <input
                      type="number" min="1"
                      value={row.cantidad}
                      onChange={e => updateSku(index, 'cantidad', e.target.value)}
                      onFocus={e => e.target.select()}
                      className={qtyInputCls}
                    />
                  </div>

                  {/* Remove */}
                  <div className="flex items-center justify-center h-full pt-0.5">
                    {form.skus.length > 1 ? (
                      <button type="button" onClick={() => removeSku(index)}
                        className="p-1.5 rounded-lg text-warm-300 hover:text-danger-500 hover:bg-danger-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : <span />}
                  </div>
                </div>
                {/* Validation errors for first row */}
                {index === 0 && (errors.sku0 || errors.peso0 || errors.largo0 || errors.ancho0 || errors.alto0) && (
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {errors.sku0 && <p className={errMsgCls}><AlertCircle className="w-3 h-3" /> {errors.sku0}</p>}
                    {(errors.largo0 || errors.ancho0 || errors.alto0 || errors.peso0) && (
                      <p className={errMsgCls}><AlertCircle className="w-3 h-3" /> {t('dev.entrada_form.medidas_obligatorio')}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Observaciones */}
          <div className="pt-1">
            <label className={labelCls}>{form.es_danado ? t('dev.entrada_form.dano_label') : t('dev.entrada_form.obs_label')}</label>
            <input
              value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
              className={inputCls}
              placeholder={form.es_danado ? t('dev.entrada_form.dano_ph') : t('dev.entrada_form.obs_ph')}
            />
          </div>

          {/* Duplicate SKU warning */}
          <AnimatePresence>
            {duplicateSku && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-warning-50 border border-warning-200 text-xs text-warning-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {t('dev.entrada_form.sku_duplicado')}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Multicaja + Dañado toggles */}
          <div className="flex items-center gap-4 py-1">
            <div className="flex items-center gap-2">
              <Toggle checked={form.multicaja} onChange={v => setForm(p => ({ ...p, multicaja: v }))} />
              <span className="text-xs text-warm-600">{t('dev.entrada_form.multicaja')}</span>
            </div>
            {form.multicaja && (
              <button type="button" onClick={addSku}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-warm-200 text-xs text-warm-700 hover:bg-warm-50">
                <Plus className="w-3.5 h-3.5" /> {t('dev.entrada_form.agregar_sku')}
              </button>
            )}
            <div className="flex items-center gap-2 ml-4">
              <Toggle checked={form.es_danado} onChange={v => setForm(p => ({ ...p, es_danado: v }))} />
              <span className="text-xs text-warm-600">{t('dev.entrada_form.danado')}</span>
            </div>
          </div>
        </div>

        {/* Photo upload — shown when dañado */}
        <AnimatePresence>
          {form.es_danado && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-warning-300 bg-warning-50/50">
                <Image className="w-4 h-4 text-warning-500 shrink-0" />
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-warning-700 mb-1">
                    {t('dev.entrada_form.evidencia')} <span className="font-normal text-warning-500">({t('dev.entrada_form.evidencia_opt')})</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0] || null
                      if (file && file.size > MAX_FOTO_SIZE_BYTES) {
                        setErrors(prev => ({ ...prev, foto: t('dev.entrada_form.evidencia_err') }))
                        setFotoFile(null)
                        e.target.value = ''
                        return
                      }
                      setErrors(prev => ({ ...prev, foto: undefined }))
                      setFotoFile(file)
                    }}
                    className="text-xs text-warm-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-warning-100 file:text-warning-700 hover:file:bg-warning-200 cursor-pointer"
                  />
                  {errors.foto && <p className={errMsgCls}><AlertCircle className="w-3 h-3" /> {errors.foto}</p>}
                </div>
                {fotoFile && (
                  <button type="button" onClick={() => setFotoFile(null)}
                    className="text-warm-400 hover:text-warm-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ubicacion-conflict confirmation modal */}
        <Modal
          isOpen={!!pendingUbicacion}
          onClose={() => setPendingUbicacion(null)}
          title={t('dev.entrada_form.ubicacion_con_mat')}
          icon={LayoutGrid}
          size="sm"
          footer={
            <>
              <button onClick={() => setPendingUbicacion(null)} className="btn-ghost">{t('dev.entrada_form.ubicacion_cambiar')}</button>
              <button
                onClick={() => {
                  setForm(p => ({ ...p, ubicacion_id: String(pendingUbicacion.id) }))
                  setPendingUbicacion(null)
                }}
                className="btn-primary"
              >
                {t('dev.entrada_form.ubicacion_agregar')}
              </button>
            </>
          }
        >
          {pendingUbicacion && (
            <div className="space-y-3 text-sm text-warm-700">
              <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-warning-500 shrink-0 mt-px" />
                <span>
                  <span className="font-bold">{pendingUbicacion.codigo}</span> — {pendingUbicacion.nombre} {t('dev.entrada_form.ubicacion_ya')}{' '}
                  <span className="font-bold text-warning-700">{pendingUbicacion.pcs_stock}</span> {t('dev.entrada_form.ubicacion_pieza')}
                </span>
              </div>
            </div>
          )}
        </Modal>

        {/* Acciones */}
        <div className="flex gap-2 pt-1 justify-end">
          {onCancel && (
            <button type="button" onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50">
              {t('dev.entrada_form.cancelar')}
            </button>
          )}
          {onSaveDraft && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleGuardarBorrador}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-warm-100 text-warm-700 text-sm font-medium hover:bg-warm-200 disabled:opacity-60 transition-colors"
            >
              {saving ? t('dev.entrada_form.guardando') : t('dev.entrada_form.guardar_borrador')}
            </motion.button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? t('dev.entrada_form.guardando') : t('dev.entrada_form.agregar')}
          </button>
        </div>
      </div>
    </form>
  )
}
