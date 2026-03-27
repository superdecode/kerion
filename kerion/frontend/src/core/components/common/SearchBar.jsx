import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, X, Package, ArrowRight } from 'lucide-react'
import api from '../../services/api'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const { data } = await api.get('/dropscan/dashboard/guias/search', { params: { q } })
      setResults(data.guias || [])
    } catch (e) {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setIsOpen(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Buscar guía..."
          className="w-full pl-10 pr-10 py-2 text-sm bg-warm-50 border border-warm-200 rounded-xl
                     focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100
                     transition-all outline-none placeholder:text-warm-400"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-warm-400 hover:text-warm-600" />
          </button>
        )}
      </div>

      {isOpen && (query.length >= 2) && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-card-hover border border-warm-100 max-h-80 overflow-y-auto z-50">
          {loading ? (
            <div className="p-4 text-center text-sm text-warm-400">Buscando...</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-warm-400">Sin resultados</div>
          ) : (
            results.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-warm-50 cursor-pointer border-b border-warm-50 last:border-b-0"
              >
                <Package className="w-4 h-4 text-primary-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-warm-700 truncate">{g.codigo_guia}</p>
                  <p className="text-xs text-warm-500">
                    {g.tarima_codigo} · {g.empresa_nombre} · Pos {g.posicion}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  g.tarima_estado === 'COMPLETA'
                    ? 'bg-success-100 text-success-700'
                    : 'bg-warning-100 text-warning-700'
                }`}>
                  {g.tarima_estado}
                </span>
                <ArrowRight className="w-3 h-3 text-warm-300" />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
