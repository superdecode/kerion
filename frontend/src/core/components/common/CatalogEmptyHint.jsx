import { Info } from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'

export default function CatalogEmptyHint({ item, section, action, className = '' }) {
  const { t } = useI18nStore()

  return (
    <div className={`mt-2 inline-flex items-start gap-2 rounded-xl border border-warm-200/80 bg-warm-50/80 px-3 py-2 text-[11px] leading-relaxed text-warm-600 ${className}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
      <p>{t('common.catalogHint.message').replace('{item}', item).replace('{section}', section).replace('{action}', action)}</p>
    </div>
  )
}
