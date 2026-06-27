import { useEffect, useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getToday, subtractDays } from '../../../core/utils/dateFormat'

const PRESETS = (t) => [
  { key: 'today',     label: t('common.today') },
  { key: 'yesterday', label: t('common.yesterday') },
  { key: 'thisWeek',  label: t('common.thisWeek') },
  { key: 'thisMonth', label: t('common.thisMonth') },
  { key: 'last7',     label: t('common.last7Days') },
  { key: 'last30',    label: t('common.last30Days') },
]

function calcRange(preset, customFrom, customTo) {
  const today = getToday()
  const sub = (n) => subtractDays(today, n)
  switch (preset) {
    case 'today': return { from: today, to: today }
    case 'yesterday': { const y = sub(1); return { from: y, to: y } }
    case 'thisWeek': {
      const d = new Date(`${today}T18:00:00Z`)
      return { from: sub(d.getUTCDay()), to: today }
    }
    case 'thisMonth': {
      const [y, m] = today.split('-')
      return { from: `${y}-${m}-01`, to: today }
    }
    case 'last7': return { from: sub(6), to: today }
    case 'last30': return { from: sub(29), to: today }
    case 'custom': return { from: customFrom || today, to: customTo || today }
    default: return { from: today, to: today }
  }
}

function findPresetForRange(range) {
  if (!range?.from || !range?.to) return null
  for (const preset of ['today', 'yesterday', 'thisWeek', 'thisMonth', 'last7', 'last30']) {
    const presetRange = calcRange(preset)
    if (presetRange.from === range.from && presetRange.to === range.to) return preset
  }
  return null
}

export function DateRangePicker({ value, onChange }) {
  const { t } = useI18nStore()
  const presets = PRESETS(t)
  const [active, setActive] = useState('today')
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    if (!value?.from || !value?.to) return
    const preset = findPresetForRange(value)
    if (preset) {
      setActive(preset)
      setShowCustom(false)
      return
    }
    setActive('custom')
    setCustomFrom(value.from)
    setCustomTo(value.to)
  }, [value?.from, value?.to])

  const handlePreset = (key) => {
    setActive(key)
    if (key !== 'custom') {
      setShowCustom(false)
      onChange(calcRange(key))
    }
  }

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setActive('custom')
      onChange({ from: customFrom, to: customTo })
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar className="w-4 h-4 text-warm-400 shrink-0" />
      {presets.map(p => (
        <button
          key={p.key}
          onClick={() => handlePreset(p.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            active === p.key
              ? 'bg-primary-600 text-white shadow-glow'
              : 'bg-warm-100 text-warm-600 hover:bg-warm-200 hover:text-warm-700'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => { setShowCustom(v => !v); if (!showCustom) setActive('custom') }}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 ${
          active === 'custom'
            ? 'bg-primary-600 text-white shadow-glow'
            : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
        }`}
      >
        {t('common.customRange')} <ChevronDown className={`w-3 h-3 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
      </button>
      {showCustom && (
        <div className="flex items-center gap-2 ml-1">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs outline-none focus:border-primary-400" />
          <span className="text-xs text-warm-400">—</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs outline-none focus:border-primary-400" />
          <button
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white disabled:opacity-40"
          >
            {t('common.apply')}
          </button>
        </div>
      )}
    </div>
  )
}
