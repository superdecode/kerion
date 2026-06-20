import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 500]

export default function TablePagination({
  page,
  totalPages,
  pageSize,
  limit,
  totalItems,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}) {
  const { t } = useI18nStore()
  const resolvedPageSize = Number(pageSize ?? limit ?? 20) || 20
  const resolvedTotalItems = Number(totalItems ?? total ?? 0) || 0
  const derivedTotalPages = Math.ceil(resolvedTotalItems / resolvedPageSize) || 1
  const safePageSize = Math.max(1, resolvedPageSize)
  const safeTotalItems = Math.max(0, resolvedTotalItems)
  const safeTotalPages = Math.max(1, Number(totalPages ?? derivedTotalPages) || 1)
  const safePage = Math.min(Math.max(1, page || 1), safeTotalPages)
  const start = safeTotalItems === 0 ? 0 : (safePage - 1) * safePageSize + 1
  const end = safeTotalItems === 0 ? 0 : Math.min(safePage * safePageSize, safeTotalItems)
  const label = itemLabel ?? t('common.pagination.records')

  return (
    <div className="surface-enter-soft shrink-0 flex flex-col gap-0.5 border-t border-warm-100 bg-white/96 px-3.5 py-1 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-warm-500">
        <span className="font-medium">{start}–{end} {t('common.pagination.of')} {safeTotalItems} {label}</span>
        <label className="flex items-center gap-1.5">
          <span>{t('common.pagination.show')}</span>
          <select
            value={safePageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="interactive-lift h-8 rounded-lg border border-warm-200 bg-warm-50 px-2.5 text-[11px] font-medium text-warm-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-1.5 md:justify-end">
        <span className="text-[11px] text-warm-400">
          {t('common.pagination.page')} {safePage} {t('common.pagination.of')} {safeTotalPages}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            className="interactive-lift inline-flex h-7 w-7 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="interactive-lift inline-flex h-7 w-7 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="status-pop inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-primary-300 bg-white px-2 text-[10px] font-semibold text-primary-700 shadow-[0_0_0_3px_rgba(124,58,237,0.10)]">
            {safePage}
          </span>
          <button
            onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
            disabled={safePage >= safeTotalPages}
            className="interactive-lift inline-flex h-7 w-7 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onPageChange(safeTotalPages)}
            disabled={safePage >= safeTotalPages}
            className="interactive-lift inline-flex h-7 w-7 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
