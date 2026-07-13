import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Boxes, Clock, MapPin, Package2, ScanBarcode, ScanLine, Search } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import BarcodeScannerModal from '../../../core/components/common/BarcodeScannerModal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getInventoryCodeSearch, getBoxStock } from '../services/inventarioService'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { normalizeScanCode } from '../../Shared/Wms/normalizeCode'

function formatSectionCode(code, fallbackDate) {
  const clean = String(code || '').trim()
  if (/^SEC-\d{8}M\d{2,}$/.test(clean)) return clean
  const date = fallbackDate ? new Date(fallbackDate) : new Date()
  const dayKey = Number.isNaN(date.getTime())
    ? '00000000'
    : date.toISOString().slice(0, 10).replace(/-/g, '')
  return `SEC-${dayKey}M00`
}

export default function QuickCodeSearchModal({ isOpen, onClose, onOpenSession }) {
  const { t } = useI18nStore()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [results, setResults] = useState({ stock: [], matches: [], sessions: [] })
  const [scannerOpen, setScannerOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setSearchError(null)
    setResults({ stock: [], matches: [], sessions: [] })
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [isOpen])

  function resolveSearchQuery(rawQuery) {
    const trimmed = String(rawQuery || '').trim()
    if (!trimmed) return ''
    return normalizeScanCode(trimmed) || trimmed.toUpperCase()
  }

  async function doSearch(rawQuery) {
    const q = resolveSearchQuery(rawQuery)
    if (!q) return
    setIsSearching(true)
    setSearchError(null)

    try {
      const [stockResponse, recordsResponse] = await Promise.all([
        getBoxStock(),
        getInventoryCodeSearch(q),
      ])

      const stockRecords = stockResponse?.data?.records || []
      const normalized = q.toLowerCase()
      const stock = stockRecords.filter((row) => (
        (row.customizeBarcode || '').toLowerCase().includes(normalized) ||
        (row.customizeCode || '').toLowerCase().includes(normalized) ||
        (row.boxType || '').toLowerCase().includes(normalized) ||
        (row.productName || '').toLowerCase().includes(normalized) ||
        (row.cellNo || '').toLowerCase().includes(normalized)
      )).slice(0, 12)

      setResults({
        stock,
        matches: recordsResponse?.data?.matches || [],
        sessions: recordsResponse?.data?.sessions || [],
      })
    } catch (err) {
      setSearchError(err?.response?.data?.error || err?.message || t('toast.error'))
    } finally {
      setIsSearching(false)
    }
  }

  const hasResults = results.stock.length > 0 || results.matches.length > 0

  function handleScanResult(text) {
    setScannerOpen(false)
    setQuery(text)
    doSearch(text)
  }

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.quickSearch.title')} icon={Search} size="xl">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-warm-200 bg-warm-50 px-4 transition-all focus-within:rounded-2xl focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-100 focus-within:shadow-sm">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="sm:hidden shrink-0 -ml-0.5 p-0.5 text-primary-600 hover:text-primary-700 transition-colors"
              aria-label={t('inventario.quickSearch.scanCamera')}
              title={t('inventario.quickSearch.scanCode')}
            >
              <ScanLine size={18} />
            </button>
            <ScanBarcode className="hidden h-4 w-4 shrink-0 text-warm-300 sm:block" />
            <input
              ref={inputRef}
              type="text"
              className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent font-mono text-base tracking-wide shadow-none outline-none ring-0 placeholder:text-warm-300 focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none"
              placeholder={t('inventario.quickSearch.placeholder')}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchError(null) }}
              onKeyDown={(event) => { if (event.key === 'Enter' && query.trim()) doSearch(query) }}
              inputMode="search"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{ outline: 'none', boxShadow: 'none', WebkitBoxShadow: 'none', fontSize: '16px' }}
            />
          </div>
          <button
            type="button"
            onClick={() => doSearch(query)}
            disabled={!query.trim() || isSearching}
            className="btn-primary h-12 px-5 shadow-glow disabled:opacity-50"
          >
            {isSearching ? 'Buscando...' : <Search size={16} />}
          </button>
        </div>

        {searchError && (
          <div className="flex items-start gap-3 rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
            <p className="text-danger-700">{searchError}</p>
          </div>
        )}

        {!searchError && !hasResults && !isSearching && (
          <div className="py-10 text-center text-sm text-warm-400">
            Ingresa un código para consultar stock actual y registros vinculados.
          </div>
        )}

        {hasResults && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-warm-500">
                <Package2 className="h-3.5 w-3.5" /> {t('inventario.quickSearch.currentStock')}
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-[58vh] overflow-y-auto pr-1 scrollbar-thin">
                {results.stock.length === 0 ? (
                  <div className="rounded-2xl border border-warm-200 bg-warm-50 px-4 py-6 text-sm text-warm-400">
                    {t('inventario.quickSearch.noStockMatches')}
                  </div>
                ) : results.stock.map((row, index) => (
                  <div key={`${row.customizeBarcode || row.boxType || 'stock'}-${index}`} className="rounded-2xl border border-warm-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-warm-900">{row.customizeBarcode || '—'}</span>
                      <span className={`badge text-[10px] ${
                        row.isAvailable ? 'bg-success-100 text-success-700' :
                        row.isBlocked ? 'bg-warning-100 text-warning-700' :
                        'bg-danger-100 text-danger-700'
                      }`}>
                        {row.isAvailable ? t('inventario.stock.available') : row.isBlocked ? t('inventario.stock.blocked') : t('inventario.stock.unavailable')}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.stock.sku')}</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.customizeCode || '—'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.quickSearch.boxType')}</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.boxType || '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.stock.product')}</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.productName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.stock.available')}</p>
                        <p className="mt-0.5 font-bold text-success-700">{row.availableAmount ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.stock.blocked')}</p>
                        <p className="mt-0.5 font-bold text-warning-700">{row.lockAmount ?? 0}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.quickSearch.currentLocation')}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-warm-700">
                          <MapPin className="h-3.5 w-3.5 text-accent-500" />
                          {row.cellNo || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-warm-500">
                <Boxes className="h-3.5 w-3.5" /> {t('inventario.quickSearch.linkedRecords')}
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-[58vh] overflow-y-auto pr-1 scrollbar-thin">
                {results.matches.length === 0 ? (
                  <div className="rounded-2xl border border-warm-200 bg-warm-50 px-4 py-6 text-sm text-warm-400">
                    {t('inventario.quickSearch.noSavedRecords')}
                  </div>
                ) : results.matches.map((row) => {
                  const CardTag = onOpenSession ? 'button' : 'div'
                  return (
                  <CardTag
                    key={row.id}
                    {...(onOpenSession ? { type: 'button', onClick: () => onOpenSession(row.session_id) } : {})}
                    className={`rounded-2xl border border-warm-200 bg-white p-4 text-left shadow-sm transition-all ${
                      onOpenSession ? 'hover:border-primary-200 hover:shadow-md' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-warm-900 truncate">{row.normalized_code || row.scanned_code}</p>
                        {row.code2 && <p className="mt-0.5 font-mono text-xs text-warm-400 truncate">Código 2: {row.code2}</p>}
                      </div>
                      <span className={`badge text-[10px] ${
                        row.scan_status === 'ok' ? 'bg-success-100 text-success-700' :
                        row.scan_status === 'blocked' ? 'bg-warning-100 text-warning-700' :
                        'bg-danger-100 text-danger-700'
                      }`}>
                        {row.scan_status === 'ok' ? t('inventario.stock.available') : row.scan_status === 'blocked' ? t('inventario.stock.blocked') : t('inventario.quickSearch.noWms')}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.registros.section')}</p>
                        <p className="mt-0.5 font-medium text-warm-700">{formatSectionCode(row.tarima_code, row.completed_at)}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.quickSearch.type')}</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.scan_type === 'clasificacion' ? 'Clasificación' : 'Unificado'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.quickSearch.operator')}</p>
                        <p className="mt-0.5 font-medium text-warm-700 truncate">{row.operator_nombre || '—'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.registros.work_location')}</p>
                        <p className="mt-0.5 font-medium text-warm-700 truncate">{row.origin_location || '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.registros.destination_location')}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-warm-700">
                          <MapPin className="h-3.5 w-3.5 text-accent-500" />
                          {row.ubicacion_destino_codigo || row.ubicacion_destino_nombre || row.cell_no || '—'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">{t('inventario.quickSearch.lastMovement')}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-warm-700">
                          <Clock className="h-3.5 w-3.5 text-warm-400" />
                          {row.scanned_at ? fmtDateTime(row.scanned_at) : '—'}
                        </p>
                      </div>
                    </div>
                  </CardTag>
                )})}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
    <BarcodeScannerModal
      isOpen={scannerOpen}
      onClose={() => setScannerOpen(false)}
      onScan={handleScanResult}
    />
    </>
  )
}
