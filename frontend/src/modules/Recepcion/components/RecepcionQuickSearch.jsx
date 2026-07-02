import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, Loader2, PackageCheck, Clock3, User, MapPin, Container,
  ClipboardList, ScanBarcode, ArrowRight, Copy, Check,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { quickSearchBoxes } from '../services/recepcionService'
import { useRecepcionEscanearStore } from '../stores/recepcionEscanearStore'
import { fmtDateTimeMini } from '../../../core/utils/dateFormat'

const STATUS_STYLE = {
  validada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  faltante: 'bg-red-100 text-red-700 border-red-200',
}

function CopyTiny({ value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  async function handleCopy(event) {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-warm-300 transition-colors hover:bg-warm-100 hover:text-sky-600"
      title="Copiar"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function InfoPill({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="min-w-0 rounded-xl border border-warm-100 bg-white/75 px-3 py-2">
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-warm-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={`truncate text-xs font-semibold text-warm-700 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  )
}

function ResultCard({ item, onOpenOrder }) {
  const statusClass = STATUS_STYLE[item.estado_validacion] || STATUS_STYLE.pendiente
  const scanned = Boolean(item.scanned_at)
  const container = item.inbound_order_no || item.tracking_no || item.reference_no || '—'

  return (
    <article className="rounded-2xl border border-warm-100 bg-white p-3 shadow-sm transition-all hover:border-sky-200 hover:shadow-md sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-mono text-sm font-black text-warm-900">{item.custom_box_barcode || item.box_type || '—'}</p>
            <CopyTiny value={item.custom_box_barcode || item.box_type} />
          </div>
          <p className="mt-0.5 truncate text-xs text-warm-500">
            Box Type <span className="font-mono font-semibold text-warm-700">{item.box_type || '—'}</span>
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass}`}>
          {item.estado_validacion || 'pendiente'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <InfoPill icon={Clock3} label="Escaneada" value={scanned ? fmtDateTimeMini(item.scanned_at) : 'Sin escaneo'} />
        <InfoPill icon={User} label="Usuario" value={item.scanned_by_nombre || (scanned ? '—' : 'Pendiente')} />
        <InfoPill icon={MapPin} label="Ubicacion" value={item.ubicacion || '—'} mono />
        <InfoPill icon={Container} label="Contenedor" value={container} mono />
        <InfoPill icon={ClipboardList} label="Orden entrada" value={item.folio} mono />
        <InfoPill icon={PackageCheck} label="Cliente" value={item.cliente || '—'} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-warm-100 pt-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-warm-400">
            SKU <span className="font-mono text-warm-600">{item.sku || '—'}</span>
            {item.qty_per_box != null ? <span> · Qty {item.qty_per_box}</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenOrder(item)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-3 text-xs font-bold text-white transition-colors hover:bg-sky-700"
        >
          Abrir <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  )
}

export default function RecepcionQuickSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 80)
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const runSearch = useCallback(async (raw) => {
    const q = raw.trim()
    if (q.length < 2) {
      setResults([])
      setTotal(0)
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const data = await quickSearchBoxes(q, 30)
      setResults(data.results || [])
      setTotal(data.total || data.count || 0)
    } catch {
      setResults([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(event) {
    const next = event.target.value
    setQuery(next)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(next), 280)
  }

  function handleSubmit(event) {
    event.preventDefault()
    clearTimeout(debounceRef.current)
    runSearch(query)
  }

  function handleClose() {
    setOpen(false)
  }

  function handleOpenOrder(item) {
    useRecepcionEscanearStore.getState().openOrderTab(item.order_id, item.folio, item.cliente, {
      id: item.order_id,
      folio: item.folio,
      cliente: item.cliente,
      estado: item.order_estado,
    })
    setOpen(false)
    navigate('/recepcion/escanear')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="interactive-lift inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100"
        title="Buscar caja de recepcion"
      >
        <Search className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] bg-warm-950/45 p-0 backdrop-blur-sm sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="ml-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-warm-50 shadow-2xl sm:h-[min(760px,calc(100dvh-2rem))] sm:max-w-3xl sm:rounded-3xl sm:border sm:border-warm-100"
            >
              <div className="border-b border-warm-100 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-5 sm:pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-warm-900">Busqueda rapida de recepcion</p>
                    <p className="text-xs text-warm-500">Box Type o Custom Box Barcode</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-warm-400 hover:bg-warm-100 hover:text-warm-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={handleChange}
                    placeholder="Escanea o escribe codigo de caja..."
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="search"
                    className="h-12 w-full rounded-2xl border border-sky-200 bg-white pl-10 pr-12 font-mono text-base font-semibold text-warm-800 outline-none transition-all placeholder:font-sans placeholder:text-warm-300 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                  {loading ? (
                    <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-sky-500" />
                  ) : query ? (
                    <button
                      type="button"
                      onClick={() => { setQuery(''); setResults([]); setTotal(0); setSearched(false); inputRef.current?.focus() }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-warm-300 hover:bg-warm-100 hover:text-warm-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </form>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
                {!searched ? (
                  <div className="flex h-full items-center justify-center p-6 text-center">
                    <div>
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                        <ScanBarcode className="h-7 w-7" />
                      </div>
                      <p className="text-sm font-bold text-warm-800">Lista para buscar desde PDA</p>
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-warm-500">
                        Escanea un codigo o escribe al menos 2 caracteres para consultar registros de recepcion.
                      </p>
                    </div>
                  </div>
                ) : loading ? (
                  <div className="flex h-48 items-center justify-center text-sm text-warm-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-sky-500" />
                    Buscando coincidencias...
                  </div>
                ) : results.length === 0 ? (
                  <div className="flex h-48 items-center justify-center p-6 text-center">
                    <div>
                      <Search className="mx-auto mb-2 h-9 w-9 text-warm-200" />
                      <p className="text-sm font-semibold text-warm-700">Sin coincidencias</p>
                      <p className="mt-1 text-xs text-warm-400">Revisa el Box Type o el Custom Box Barcode.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-black uppercase tracking-wider text-warm-400">
                        {results.length} de {total} resultado(s)
                      </p>
                      {total > results.length && (
                        <p className="text-[11px] text-warm-400">Refina la busqueda para ver menos coincidencias</p>
                      )}
                    </div>
                    {results.map((item) => (
                      <ResultCard key={item.line_id} item={item} onOpenOrder={handleOpenOrder} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

