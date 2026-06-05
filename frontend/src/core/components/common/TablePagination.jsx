import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useI18nStore } from '../../stores/i18nStore'

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 500]

export default function TablePagination({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}) {
  const { t } = useI18nStore()
  const safeTotalPages = Math.max(1, totalPages || 1)
  const safePage = Math.min(Math.max(1, page || 1), safeTotalPages)
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = totalItems === 0 ? 0 : Math.min(safePage * pageSize, totalItems)
  const label = itemLabel ?? t('common.pagination.records')

  return (
    <div className="shrink-0 flex flex-col gap-2 border-t border-warm-100 bg-warm-50/30 px-5 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs text-warm-500">
        <span className="font-medium">{start}–{end} {t('common.pagination.of')} {totalItems} {label}</span>
        <label className="flex items-center gap-2">
          <span>{t('common.pagination.show')}</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 rounded-xl border border-warm-200 bg-warm-50 px-3 text-xs font-medium text-warm-700 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 md:justify-end">
        <span className="text-xs text-warm-400">
          {t('common.pagination.page')} {safePage} {t('common.pagination.of')} {safeTotalPages}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-primary-300 bg-white px-2.5 text-[11px] font-semibold text-primary-700 shadow-[0_0_0_3px_rgba(124,58,237,0.10)]">
            {safePage}
          </span>
          <button
            onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
            disabled={safePage >= safeTotalPages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(safeTotalPages)}
            disabled={safePage >= safeTotalPages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm-200 bg-white/90 text-warm-500 transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30 disabled:hover:border-warm-200 disabled:hover:bg-white/90 disabled:hover:text-warm-500"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
