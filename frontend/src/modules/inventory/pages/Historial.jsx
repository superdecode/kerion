import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getHistory } from '../services/inventoryService'
import { CheckCircle, AlertTriangle, XCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react'

const STATUS_META = {
  OK:        { label: 'OK',        color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  Bloqueado: { label: 'Bloqueado', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  NoWMS:     { label: 'No en WMS', color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
}

export default function InvHistorial() {
  const { t } = useI18nStore()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: '', barcode: '', date_from: '', date_to: '' })
  const [applied, setApplied] = useState({})
  const limit = 50

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['inv-history', applied, page],
    queryFn: () => getHistory({ ...applied, page, limit }),
    keepPreviousData: true,
  })

  const scans = data?.scans || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit)

  const handleSearch = (e) => {
    e.preventDefault()
    setApplied({ ...filters })
    setPage(1)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('inventory.historial.title') || 'Historial de Escaneos'}
        subtitle={t('inventory.historial.subtitle') || 'Registro de todos los escaneos'}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Filters */}
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSearch}
          className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-5 shadow-sm"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-warm-600 mb-1.5">Estado</label>
              <select
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm bg-white
                  focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="">Todos</option>
                <option value="OK">OK</option>
                <option value="Bloqueado">Bloqueado</option>
                <option value="NoWMS">No en WMS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-600 mb-1.5">Código</label>
              <input
                type="text"
                value={filters.barcode}
                onChange={e => setFilters(f => ({ ...f, barcode: e.target.value }))}
                placeholder="Buscar código..."
                className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm bg-white
                  focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-600 mb-1.5">Desde</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm bg-white
                  focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-600 mb-1.5">Hasta</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm bg-white
                  focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700
                text-white text-sm font-semibold transition"
            >
              <Search className="w-4 h-4" />
              Buscar
            </button>
          </div>
        </motion.form>

        {/* Table */}
        <div className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-warm-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-warm-700">
              {isLoading || isFetching ? 'Cargando...' : `${total} registros`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100 text-xs text-warm-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Código</th>
                  <th className="px-5 py-3 text-left">SKU</th>
                  <th className="px-5 py-3 text-left">Producto</th>
                  <th className="px-5 py-3 text-left">Ubicación</th>
                  <th className="px-5 py-3 text-left">Stock</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-left">Usuario</th>
                  <th className="px-5 py-3 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {scans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-warm-400 text-sm">
                      {isLoading ? 'Cargando...' : 'Sin registros'}
                    </td>
                  </tr>
                ) : scans.map((scan) => {
                  const meta = STATUS_META[scan.status]
                  return (
                    <tr key={scan.id} className="border-b border-warm-50 hover:bg-warm-50/50 transition">
                      <td className="px-5 py-3 font-mono text-xs">{scan.barcode}</td>
                      <td className="px-5 py-3 text-warm-600">{scan.sku || '—'}</td>
                      <td className="px-5 py-3 text-warm-700">{scan.product_name || '—'}</td>
                      <td className="px-5 py-3 text-warm-600">{scan.cell_no || '—'}</td>
                      <td className="px-5 py-3">{scan.available_stock ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border
                          ${meta?.bg} ${meta?.color}`}>
                          {meta?.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-warm-600">{scan.user_name || '—'}</td>
                      <td className="px-5 py-3 text-warm-500 text-xs whitespace-nowrap">
                        {new Date(scan.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-warm-100 flex items-center justify-between text-sm text-warm-600">
              <span>Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-40 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
