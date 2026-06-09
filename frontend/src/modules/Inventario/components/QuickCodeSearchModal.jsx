import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Boxes, Clock, MapPin, Package2, ScanBarcode, Search } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getInventoryCodeSearch, getBoxStock } from '../services/inventarioService'
import { fmtDateTime } from '../../../core/utils/dateFormat'

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

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setSearchError(null)
    setResults({ stock: [], matches: [], sessions: [] })
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [isOpen])

  async function doSearch(rawQuery) {
    const q = rawQuery.trim()
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Búsqueda rápida de código" icon={Search} size="xl">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-warm-200 bg-warm-50 px-4 transition-all focus-within:rounded-2xl focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-100 focus-within:shadow-sm">
            <ScanBarcode className="h-4 w-4 shrink-0 text-warm-300" />
            <input
              ref={inputRef}
              type="text"
              className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent font-mono text-base tracking-wide shadow-none outline-none ring-0 placeholder:text-warm-300 focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none"
              placeholder="Código 1, Código 2 o SKU"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchError(null) }}
              onKeyDown={(event) => { if (event.key === 'Enter' && query.trim()) doSearch(query) }}
              style={{ outline: 'none', boxShadow: 'none', WebkitBoxShadow: 'none' }}
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
                <Package2 className="h-3.5 w-3.5" /> Stock actual
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-[58vh] overflow-y-auto pr-1 scrollbar-thin">
                {results.stock.length === 0 ? (
                  <div className="rounded-2xl border border-warm-200 bg-warm-50 px-4 py-6 text-sm text-warm-400">
                    Sin coincidencias en el inventario disponible.
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
                        {row.isAvailable ? 'Disponible' : row.isBlocked ? 'Bloqueado' : 'No disponible'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">SKU</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.customizeCode || '—'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">Tipo caja</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.boxType || '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">Producto</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.productName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">Disponible</p>
                        <p className="mt-0.5 font-bold text-success-700">{row.availableAmount ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">Bloqueado</p>
                        <p className="mt-0.5 font-bold text-warning-700">{row.lockAmount ?? 0}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">Ubicación actual</p>
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
                <Boxes className="h-3.5 w-3.5" /> Registros vinculados
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-[58vh] overflow-y-auto pr-1 scrollbar-thin">
                {results.matches.length === 0 ? (
                  <div className="rounded-2xl border border-warm-200 bg-warm-50 px-4 py-6 text-sm text-warm-400">
                    Sin registros guardados para este código.
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
                        {row.scan_status === 'ok' ? 'Disponible' : row.scan_status === 'blocked' ? 'Bloqueado' : 'No WMS'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">Sección</p>
                        <p className="mt-0.5 font-medium text-warm-700">{formatSectionCode(row.tarima_code, row.completed_at)}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">Tipo</p>
                        <p className="mt-0.5 font-medium text-warm-700">{row.scan_type === 'clasificacion' ? 'Clasificación' : 'Unificado'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">Operador</p>
                        <p className="mt-0.5 font-medium text-warm-700 truncate">{row.operator_nombre || '—'}</p>
                      </div>
                      <div>
                        <p className="text-warm-400 uppercase tracking-wide">Ubic. trabajo</p>
                        <p className="mt-0.5 font-medium text-warm-700 truncate">{row.origin_location || '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">Ubic. destino</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-warm-700">
                          <MapPin className="h-3.5 w-3.5 text-accent-500" />
                          {row.cell_no || '—'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-warm-400 uppercase tracking-wide">Último movimiento / escaneo</p>
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
  )
}
