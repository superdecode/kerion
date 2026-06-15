import { useState, useEffect, useRef, useCallback } from 'react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { Settings2, ChevronDown, Check } from 'lucide-react'

// Custom select that renders its dropdown at a fixed position so it
// stays correctly placed inside framer-motion transformed containers.
function MappingSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const dropRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  const openDropdown = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    setOpen(true)
  }, [])

  // Close on click-outside or scroll
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', () => setOpen(false), true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', () => setOpen(false), true)
    }
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openDropdown}
        className={`w-full text-xs border rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-1 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300 ${
          value
            ? 'border-success-300 bg-success-50/40 text-success-700'
            : 'border-warm-200 bg-white text-warm-400 hover:border-warm-300'
        }`}
      >
        <span className="truncate">{selected ? selected.label : '— No mapear —'}</span>
        <ChevronDown size={12} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-white border border-warm-200 rounded-xl shadow-xl py-1 overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 220), maxHeight: 280 }}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-warm-400 hover:bg-warm-50 transition-colors"
            onClick={() => { onChange(''); setOpen(false) }}
          >
            — No mapear —
          </button>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                o.value === value
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-warm-700 hover:bg-warm-50'
              }`}
            >
              {o.value === value && <Check size={11} className="shrink-0" />}
              <span className={o.value === value ? '' : 'ml-[15px]'}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default function ColumnMappingModal({ isOpen, fileHeaders, currentMapping, systemFields, onClose, onConfirm }) {
  const { t } = useI18nStore()
  const [mapping, setMapping] = useState({})

  useEffect(() => {
    if (isOpen) setMapping({ ...currentMapping })
  }, [isOpen, currentMapping])

  const setField = (header, sysKey) => {
    setMapping(prev => ({ ...prev, [header]: sysKey || null }))
  }

  const options = systemFields.map(f => ({ value: f.key, label: f.label }))

  const mappedCount = Object.values(mapping).filter(Boolean).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('rec.import.mapping.title')}
      icon={Settings2}
      size="lg"
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-warm-500 flex-1">
            {mappedCount} / {fileHeaders.length} {t('rec.import.mapping.fileCol').toLowerCase()} mapeadas
          </span>
          <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={() => onConfirm(mapping)} className="btn-primary">{t('common.confirm')}</button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-warm-600">{t('rec.import.mapping.desc')}</p>

        <div className="border border-warm-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-warm-50 border-b border-warm-100 sticky top-0 z-[2]">
                <th className="table-header w-[45%]">{t('rec.import.mapping.fileCol')}</th>
                <th className="table-header">{t('rec.import.mapping.sysField')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-50">
              {fileHeaders.map(header => (
                <tr key={header}>
                  <td className="px-3 py-2 font-mono text-xs text-warm-700 max-w-0 truncate" title={header}>
                    {header}
                  </td>
                  <td className="px-3 py-2">
                    <MappingSelect
                      value={mapping[header] || ''}
                      options={options}
                      onChange={(val) => setField(header, val)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
