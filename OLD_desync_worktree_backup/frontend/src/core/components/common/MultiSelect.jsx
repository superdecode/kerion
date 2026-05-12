import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, X, Check } from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'

export default function MultiSelect({ options = [], selected = [], onChange, placeholder = 'Seleccionar...', label, icon: Icon }) {
  const { t } = useI18nStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const toggle = (val) => {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val]
    onChange(next)
  }

  const clearAll = (e) => {
    e.stopPropagation()
    onChange([])
  }

  const selectedLabels = options.filter(o => selected.includes(o.value)).map(o => o.label)

  return (
    <div ref={wrapperRef} className="relative">
      {label && <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 w-full min-w-[180px] px-3 py-2 rounded-lg border text-sm text-left transition-all outline-none ${
          open
            ? 'border-primary-400 ring-2 ring-primary-100 bg-white'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        {Icon && <Icon className="w-4 h-4 text-warm-400 shrink-0" />}
        <span className="flex-1 truncate">
          {selected.length === 0 ? (
            <span className="text-warm-400">{placeholder}</span>
          ) : selected.length <= 2 ? (
            <span className="text-warm-700">{selectedLabels.join(', ')}</span>
          ) : (
            <span className="text-warm-700">{selected.length} {t('multiselect.seleccionados')}</span>
          )}
        </span>
        {selected.length > 0 && (
          <button onClick={clearAll} className="p-0.5 rounded hover:bg-warm-100 transition-colors shrink-0">
            <X className="w-3.5 h-3.5 text-warm-400" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 text-warm-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-white rounded-xl shadow-depth border border-warm-100 overflow-hidden"
          >
            {/* Search */}
            {options.length > 5 && (
              <div className="p-2 border-b border-warm-100">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('multiselect.buscar')}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-warm-200 outline-none focus:border-primary-400 bg-warm-50"
                  autoFocus
                />
              </div>
            )}

            {/* Select all / clear */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-warm-50 bg-warm-50/50">
              <button
                type="button"
                onClick={() => onChange(options.map(o => o.value))}
                className="text-[10px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                {t('multiselect.todos')}
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] font-semibold text-warm-400 hover:text-warm-600 transition-colors"
              >
                {t('multiselect.limpiar')}
              </button>
            </div>

            {/* Options */}
            <div className="max-h-52 overflow-y-auto scrollbar-thin">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-warm-400">{t('multiselect.sinResultados')}</div>
              ) : (
                filtered.map(option => {
                  const isSelected = selected.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggle(option.value)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                        isSelected
                          ? 'bg-primary-50/60 text-primary-700'
                          : 'text-warm-700 hover:bg-warm-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-warm-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>
                      {option.color && (
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: option.color }} />
                      )}
                      <span className="truncate text-left">{option.label}</span>
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer count */}
            {selected.length > 0 && (
              <div className="px-3 py-1.5 border-t border-warm-100 bg-warm-50/50">
                <p className="text-[10px] text-warm-400 font-semibold">
                  {selected.length} de {options.length} seleccionado{selected.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
