import Modal from '../../../core/components/common/Modal'
import { motion } from 'framer-motion'
import { Boxes, Check, Layers3, Loader2, MapPin, PackageCheck, SlidersHorizontal } from 'lucide-react'

export default function ValidationModeSelectorModal({
  isOpen,
  mode,
  onModeChange,
  onClose,
  onConfirm,
  isSubmitting,
  groupSmallCodes = false,
  onGroupSmallCodesChange,
  minCajasParaAgrupar = 3,
  onMinCajasChange,
  maxCajasEnGrupo = 10,
  onMaxCajasChange,
  t,
}) {
  const options = [
    {
      value: 'ubicacion',
      icon: MapPin,
      title: t('rec.mode.normal.title'),
      description: t('rec.mode.normal.desc'),
      accent: 'sky',
    },
    {
      value: 'tarimas',
      icon: Layers3,
      title: t('rec.mode.classified.title'),
      description: t('rec.mode.classified.desc'),
      accent: 'amber',
    },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      title={t('rec.mode.title')}
      icon={PackageCheck}
      size="lg"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-warm-100 bg-gradient-to-r from-warm-50 via-white to-sky-50/50 px-4 py-3">
          <p className="text-sm font-medium text-warm-700">{t('rec.mode.subtitle')}</p>
          <p className="mt-0.5 text-[11px] text-warm-400">{t('rec.mode.helper')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {options.map(option => {
            const selected = mode === option.value
            const Icon = option.icon
            return (
              <motion.button
                key={option.value}
                type="button"
                onClick={() => {
                  onModeChange(option.value)
                  if (option.value === 'tarimas' && !groupSmallCodes) onGroupSmallCodesChange?.(true)
                }}
                disabled={isSubmitting}
                whileTap={{ scale: 0.985 }}
                className={`group relative overflow-hidden rounded-2xl border-2 p-4 text-left transition-all ${
                  selected && option.accent === 'sky'
                    ? 'border-sky-400 bg-sky-50/70 shadow-[0_8px_24px_-16px_rgba(14,165,233,0.8)]'
                    : selected
                      ? 'border-amber-400 bg-amber-50/70 shadow-[0_8px_24px_-16px_rgba(245,158,11,0.8)]'
                      : 'border-warm-150 bg-white hover:-translate-y-0.5 hover:border-warm-300 hover:shadow-sm'
                } ${isSubmitting ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <span className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                  selected && option.accent === 'sky' ? 'bg-sky-500 text-white' :
                  selected ? 'bg-amber-500 text-white' : 'bg-warm-100 text-warm-500 group-hover:bg-warm-150'
                }`}>
                  <Icon className="h-5 w-5" />
                </span>
                {selected && (
                  <span className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full ${option.accent === 'sky' ? 'bg-sky-500' : 'bg-amber-500'} text-white`}>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
                <span className="block text-base font-black tracking-tight text-warm-900">{option.title}</span>
                <span className="mt-1.5 block text-xs leading-relaxed text-warm-500">{option.description}</span>
              </motion.button>
            )
          })}
        </div>

        {mode === 'tarimas' && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <Boxes className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-warm-800">{t('rec.tarimas.group.enable')}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-warm-500">{t('rec.tarimas.group.desc')}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`hidden text-[10px] font-bold uppercase tracking-wide sm:inline ${groupSmallCodes ? 'text-amber-700' : 'text-warm-500'}`}>
                          {groupSmallCodes ? t('common.enabled') : t('common.disabled')}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={groupSmallCodes}
                          aria-label={`${t('rec.tarimas.group.enable')}: ${groupSmallCodes ? t('common.enabled') : t('common.disabled')}`}
                          title={groupSmallCodes ? t('common.enabled') : t('common.disabled')}
                          onClick={() => onGroupSmallCodesChange?.(!groupSmallCodes)}
                          disabled={isSubmitting}
                          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                            groupSmallCodes
                              ? 'border-amber-500 bg-amber-500'
                              : 'border-warm-400 bg-warm-300'
                          }`}
                        >
                          <span className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.28)] transition-transform duration-200 ${groupSmallCodes ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>

                    {groupSmallCodes && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-amber-100 pt-4">
                            <label className="block">
                              <span className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-warm-500"><SlidersHorizontal className="h-3 w-3" />{t('rec.tarimas.group.min_cajas')}</span>
                              <input type="number" min={1} max={99} value={minCajasParaAgrupar} onChange={e => onMinCajasChange?.(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} className="h-10 w-full rounded-xl border border-amber-200 bg-white px-3 font-mono text-sm font-bold text-warm-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-warm-500">{t('rec.tarimas.group.max_cajas')}</span>
                              <input type="number" min={minCajasParaAgrupar} max={999} value={maxCajasEnGrupo} onChange={e => onMaxCajasChange?.(Math.max(minCajasParaAgrupar, Number.parseInt(e.target.value, 10) || minCajasParaAgrupar))} className="h-10 w-full rounded-xl border border-amber-200 bg-white px-3 font-mono text-sm font-bold text-warm-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                            </label>
                            <p className="col-span-2 rounded-lg bg-amber-100/60 px-3 py-2 text-[10px] leading-relaxed text-amber-800">
                              {t('rec.tarimas.group.preview').replace('{min}', minCajasParaAgrupar).replace('{max}', maxCajasEnGrupo)}
                            </p>
                          </div>
                        </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-warm-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-ghost disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="btn-primary inline-flex min-w-[180px] items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{t('rec.mode.starting')}</span>
              </>
            ) : t('rec.mode.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
