import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { skuAutocomplete } from '../services/devolucionesService'

const emptySku = { sku: '', sku2: '', descripcion: '', cantidad: 1 }

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-primary-600' : 'bg-warm-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function EntradaFormItem({ onSubmit, onSaveAndAdd, saving = false, initialValue = null, onCancel = null }) {
  const emb1Ref = useRef(null)
  const [showDimensiones, setShowDimensiones] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [activeSuggIdx, setActiveSuggIdx] = useState(-1)
  const [showSuccess, setShowSuccess] = useState(false)
  const debounceRef = useRef(null)

  const emptyForm = () => ({
    embalaje1: '', embalaje2: '', descripcion: '',
    peso: '', largo: '', ancho: '', alto: '',
    multicaja: false, es_danado: false, notas: '',
    skus: [{ ...emptySku }],
    ubicacion_id: null,
  })

  const [form, setForm] = useState(initialValue || emptyForm())

  useEffect(() => {
    setForm(initialValue || emptyForm())
  }, [initialValue])

  useEffect(() => {
    emb1Ref.current?.focus()
  }, [])

  const fetchSuggestions = (val) => {
    clearTimeout(debounceRef.current)
    if (val.length < 2) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await skuAutocomplete(val)
        setSuggestions(data?.data || data?.items || [])
      } catch { setSuggestions([]) }
    }, 300)
  }

  const applySuggestion = (item) => {
    setForm(prev => ({
      ...prev,
      descripcion: prev.descripcion || item.descripcion || '',
      skus: prev.skus.map((row, i) => i === 0
        ? { ...row, sku: item.sku, sku2: item.sku2 || row.sku2, descripcion: item.descripcion || row.descripcion }
        : row
      ),
    }))
    setSuggestions([])
    setActiveSuggIdx(-1)
  }

  const updateSku = (index, key, value) => {
    setForm(prev => {
      const next = prev.skus.map((row, i) => i === index ? { ...row, [key]: value } : row)
      return { ...prev, skus: next }
    })
    if (key === 'sku') fetchSuggestions(value)
  }

  const addSku = () => setForm(prev => ({ ...prev, skus: [...prev.skus, { ...emptySku }] }))
  const removeSku = (i) => setForm(prev => ({ ...prev, skus: prev.skus.filter((_, idx) => idx !== i) }))

  const buildPayload = () => ({
    ...form,
    peso: form.peso ? parseFloat(form.peso) : null,
    largo: form.largo ? parseFloat(form.largo) : null,
    ancho: form.ancho ? parseFloat(form.ancho) : null,
    alto: form.alto ? parseFloat(form.alto) : null,
    skus: form.skus.filter(r => r.sku.trim()).map(r => ({ ...r, cantidad: Number(r.cantidad) || 1 })),
  })

  const handleGuardar = (e) => {
    e.preventDefault()
    onSubmit(buildPayload())
  }

  const handleGuardarYOtro = (e) => {
    e.preventDefault()
    if (onSaveAndAdd) {
      onSaveAndAdd(buildPayload(), () => {
        setForm(emptyForm())
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 1500)
        setTimeout(() => emb1Ref.current?.focus(), 50)
      })
    } else {
      onSubmit(buildPayload())
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white'
  const labelCls = 'block text-[11px] font-medium text-warm-500 mb-1'

  return (
    <form className="space-y-3 relative" onSubmit={handleGuardar}>

      {/* Success flash */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-success-50/90 rounded-2xl"
          >
            <div className="flex items-center gap-2 text-success-700 font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              Item guardado
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Embalajes */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Cód. Embalaje 1</label>
          <input
            ref={emb1Ref}
            value={form.embalaje1}
            onChange={e => setForm(p => ({ ...p, embalaje1: e.target.value }))}
            className={inputCls}
            placeholder="Guía / código"
          />
        </div>
        <div>
          <label className={labelCls}>Cód. Embalaje 2</label>
          <input
            value={form.embalaje2}
            onChange={e => setForm(p => ({ ...p, embalaje2: e.target.value }))}
            className={inputCls}
            placeholder="Opcional"
          />
        </div>
      </div>

      {/* SKUs */}
      <div className="space-y-2">
        {form.skus.map((row, index) => (
          <div key={index} className="space-y-1.5 border border-warm-100 rounded-xl p-2.5 bg-warm-50/40">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <label className={labelCls}>SKU</label>
                <input
                  value={row.sku}
                  onChange={e => updateSku(index, 'sku', e.target.value)}
                  className={inputCls}
                  placeholder="SKU principal"
                  autoComplete="off"
                  onKeyDown={e => {
                    if (suggestions.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggIdx(i => Math.min(i + 1, suggestions.length - 1)) }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggIdx(i => Math.max(i - 1, 0)) }
                      if (e.key === 'Enter' && activeSuggIdx >= 0) { e.preventDefault(); applySuggestion(suggestions[activeSuggIdx]) }
                      if (e.key === 'Escape') setSuggestions([])
                    }
                  }}
                />
                <AnimatePresence>
                  {index === 0 && suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute top-full left-0 right-0 z-30 mt-1 bg-white rounded-xl border border-warm-200 shadow-lg overflow-hidden"
                    >
                      {suggestions.slice(0, 5).map((item, si) => (
                        <button
                          key={si} type="button"
                          onMouseDown={() => applySuggestion(item)}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-primary-50 transition-colors ${activeSuggIdx === si ? 'bg-primary-50' : ''}`}
                        >
                          <span className="font-medium text-warm-800">{item.sku}</span>
                          {item.descripcion && <span className="text-warm-400 ml-2">· {item.descripcion}</span>}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div>
                <label className={labelCls}>Descripción</label>
                <input
                  value={row.descripcion}
                  onChange={e => updateSku(index, 'descripcion', e.target.value)}
                  className={inputCls}
                  placeholder="Descripción"
                />
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className={labelCls}>Cantidad</label>
                <input
                  type="number" min="1"
                  value={row.cantidad}
                  onChange={e => updateSku(index, 'cantidad', e.target.value)}
                  onFocus={e => e.target.select()}
                  className={inputCls}
                />
              </div>
              {form.skus.length > 1 && (
                <button type="button" onClick={() => removeSku(index)} className="p-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Multicaja toggle + add sku */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Toggle checked={form.multicaja} onChange={v => setForm(p => ({ ...p, multicaja: v }))} />
            <span className="text-xs text-warm-600">Multicaja</span>
          </div>
          {form.multicaja && (
            <button
              type="button" onClick={addSku}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs text-warm-700 hover:bg-warm-50"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar SKU
            </button>
          )}
        </div>
      </div>

      {/* Dañado toggle */}
      <div className="flex items-center gap-2 py-1">
        <Toggle checked={form.es_danado} onChange={v => setForm(p => ({ ...p, es_danado: v }))} />
        <span className="text-xs text-warm-600">Dañado / vacío</span>
      </div>
      <AnimatePresence>
        {form.es_danado && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <textarea
              value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
              placeholder="Descripción del daño..."
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dimensiones colapsables */}
      <div className="border border-warm-100 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDimensiones(d => !d)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-warm-500 hover:bg-warm-50 transition-colors"
        >
          <span>Dimensiones y peso (opcional)</span>
          {showDimensiones ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <AnimatePresence>
          {showDimensiones && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-4 gap-2 p-2.5 pt-0">
                {[['largo', 'L cm'], ['ancho', 'An cm'], ['alto', 'Al cm'], ['peso', 'Kg']].map(([field, ph]) => (
                  <div key={field}>
                    <label className={labelCls}>{ph}</label>
                    <input
                      type="number" step="0.01"
                      value={form[field]}
                      onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                      onFocus={e => e.target.select()}
                      className={inputCls}
                      placeholder={ph}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notas (solo si no dañado) */}
      {!form.es_danado && (
        <div>
          <label className={labelCls}>Observaciones</label>
          <input
            value={form.notas}
            onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
            className={inputCls}
            placeholder="Notas opcionales"
          />
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2 pt-1">
        {onSaveAndAdd && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleGuardarYOtro}
            disabled={saving}
            className="flex-1 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? '...' : 'Guardar y agregar otro'}
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={saving}
          className="flex-1 px-3 py-2 rounded-xl bg-primary-100 text-primary-700 text-sm font-medium disabled:opacity-60"
        >
          Guardar
        </motion.button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">
            Limpiar
          </button>
        )}
      </div>
    </form>
  )
}
