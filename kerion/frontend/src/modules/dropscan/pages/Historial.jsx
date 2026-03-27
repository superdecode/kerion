import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import * as ds from '../services/dropscanService'
import {
  Filter, ChevronLeft, ChevronRight, Eye, Trash2, Search, Download,
  Lock, Unlock, Package, Clock, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, X
} from 'lucide-react'

export default function Historial() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ estado: '', fecha_inicio: '', fecha_fin: '', search: '' })
  const [showFilters, setShowFilters] = useState(true)
  const [selectedTarima, setSelectedTarima] = useState(null)
  const [sortCol, setSortCol] = useState('fecha_inicio')
  const [sortDir, setSortDir] = useState('desc')
  const { canDelete, canUnlock, canWrite } = useAuthStore()
  const toast = useToastStore
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['dropscan-tarimas', page, filters],
    queryFn: () => ds.getTarimas({ ...filters, page, limit: 15 }),
  })

  const rawTarimas = data?.tarimas || []
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 }

  // Client-side sort
  const tarimas = useMemo(() => {
    const sorted = [...rawTarimas]
    sorted.sort((a, b) => {
      let aV = a[sortCol], bV = b[sortCol]
      if (sortCol === 'cantidad_guias') { aV = Number(aV); bV = Number(bV) }
      if (sortCol === 'fecha_inicio') { aV = new Date(aV); bV = new Date(bV) }
      if (typeof aV === 'string') { aV = aV.toLowerCase(); bV = bV?.toLowerCase() || '' }
      if (aV < bV) return sortDir === 'asc' ? -1 : 1
      if (aV > bV) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [rawTarimas, sortCol, sortDir])

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['dropscan-tarima-detail', selectedTarima],
    queryFn: () => ds.getTarimaDetail(selectedTarima),
    enabled: !!selectedTarima,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => ds.deleteTarima(id),
    onSuccess: () => { toast.success('Tarima eliminada'); qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] }); setSelectedTarima(null) },
    onError: (err) => toast.error(err.response?.data?.error || 'Error eliminando tarima')
  })

  const lockMutation = useMutation({
    mutationFn: ({ id, razon }) => ds.lockTarima(id, razon),
    onSuccess: () => { toast.success('Tarima bloqueada'); qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] }); qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail'] }) },
    onError: () => toast.error('Error bloqueando tarima')
  })

  const unlockMutation = useMutation({
    mutationFn: (id) => ds.unlockTarima(id),
    onSuccess: () => { toast.success('Tarima desbloqueada'); qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] }); qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail'] }) },
    onError: () => toast.error('Error desbloqueando tarima')
  })

  const estadoColors = {
    'EN_PROCESO': 'bg-warning-100 text-warning-700',
    'COMPLETA': 'bg-success-100 text-success-700',
    'CANCELADA': 'bg-danger-100 text-danger-700',
  }

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-warm-300" />
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary-500" /> : <ArrowDown className="w-3 h-3 text-primary-500" />
  }

  const clearFilters = () => { setFilters({ estado: '', fecha_inicio: '', fecha_fin: '', search: '' }); setPage(1) }
  const hasActiveFilters = filters.estado || filters.fecha_inicio || filters.search

  const handleExport = () => {
    try {
      const csv = [
        ['Código', 'Empresa', 'Canal', 'Operador', 'Guías', 'Estado', 'Fecha'].join(','),
        ...tarimas.map(t => [t.codigo, t.empresa_nombre, t.canal_nombre, t.operador_nombre, t.cantidad_guias, t.estado, new Date(t.fecha_inicio).toLocaleString('es-MX')].join(','))
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `historial_${new Date().toISOString().slice(0,10)}.csv`; a.click()
      toast.success('Exportación completada')
    } catch { toast.error('Error exportando') }
  }

  const detail = detailData?.tarima
  const detailGuias = detailData?.guias || []

  return (
    <div className="flex flex-col h-full">
      <Header title="Historial" subtitle="DropScan · Tarimas y guías" />

      <div className="flex-1 overflow-y-auto">
        {/* Filter bar — always visible */}
        <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Global search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
              <input value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }}
                placeholder="Buscar por guía, tarima, operador..."
                className="w-full pl-10 pr-10 py-2 text-sm rounded-xl border border-warm-200 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 bg-white" />
              {filters.search && (
                <button onClick={() => setFilters(f => ({ ...f, search: '' }))} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-warm-400 hover:text-warm-600" />
                </button>
              )}
            </div>

            {/* Quick status filter */}
            {['', 'EN_PROCESO', 'COMPLETA', 'CANCELADA'].map(s => (
              <button key={s} onClick={() => { setFilters(f => ({ ...f, estado: s })); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${filters.estado === s ? 'bg-primary-600 text-white shadow-glow' : 'bg-warm-100 text-warm-600 hover:bg-warm-200'}`}>
                {s === '' ? 'Todos' : s === 'EN_PROCESO' ? 'En Proceso' : s === 'COMPLETA' ? 'Completa' : 'Cancelada'}
              </button>
            ))}

            <div className="flex items-center gap-2 ml-auto">
              <input type="date" value={filters.fecha_inicio} onChange={e => { setFilters(f => ({ ...f, fecha_inicio: e.target.value })); setPage(1) }}
                className="px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs outline-none focus:border-primary-400" />
              <span className="text-xs text-warm-400">—</span>
              <input type="date" value={filters.fecha_fin} onChange={e => { setFilters(f => ({ ...f, fecha_fin: e.target.value })); setPage(1) }}
                className="px-2.5 py-1.5 rounded-lg border border-warm-200 text-xs outline-none focus:border-primary-400" />
            </div>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">Limpiar</button>
            )}
            <button onClick={handleExport} className="p-2 rounded-xl text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-all" title="Exportar CSV">
              <Download className="w-4 h-4" />
            </button>
            <span className="badge bg-warm-100 text-warm-500">{pagination.total} tarimas</span>
          </div>
        </div>

        <div className="p-4">
          <div className="max-w-full mx-auto">
            {/* Table - Full width */}
            <motion.div
              className="card overflow-hidden"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {isLoading ? (
                <LoadingSpinner text="Cargando tarimas..." />
              ) : tarimas.length === 0 ? (
                <div className="p-16 text-center text-sm text-warm-400">No se encontraron tarimas</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        <th className="table-header" onClick={() => handleSort('codigo')}>
                          <span className="flex items-center gap-1.5">Código <SortIcon col="codigo" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('empresa_nombre')}>
                          <span className="flex items-center gap-1.5">Empresa <SortIcon col="empresa_nombre" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('canal_nombre')}>
                          <span className="flex items-center gap-1.5">Canal <SortIcon col="canal_nombre" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('operador_nombre')}>
                          <span className="flex items-center gap-1.5">Operador <SortIcon col="operador_nombre" /></span>
                        </th>
                        <th className="table-header text-center" onClick={() => handleSort('cantidad_guias')}>
                          <span className="flex items-center justify-center gap-1.5">Guías <SortIcon col="cantidad_guias" /></span>
                        </th>
                        <th className="table-header text-center" onClick={() => handleSort('estado')}>
                          <span className="flex items-center justify-center gap-1.5">Estado <SortIcon col="estado" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('fecha_inicio')}>
                          <span className="flex items-center gap-1.5">Fecha <SortIcon col="fecha_inicio" /></span>
                        </th>
                        <th className="table-header text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {tarimas.map(t => (
                        <tr key={t.id} className="hover:bg-warm-50/50 transition-colors group">
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              {t.bloqueada && <Lock className="w-3.5 h-3.5 text-danger-500" />}
                              <span className="font-mono font-semibold text-warm-700">{t.codigo}</span>
                            </div>
                          </td>
                          <td className="table-cell text-warm-600">{t.empresa_nombre}</td>
                          <td className="table-cell text-warm-600">{t.canal_nombre}</td>
                          <td className="table-cell text-warm-600">{t.operador_nombre}</td>
                          <td className="table-cell text-center">
                            <span className="font-bold text-warm-700">{t.cantidad_guias}</span>
                            <span className="text-warm-400">/100</span>
                          </td>
                          <td className="table-cell text-center">
                            <span className={`badge text-[10px] ${estadoColors[t.estado]}`}>{t.estado}</span>
                          </td>
                          <td className="table-cell text-warm-500 text-xs">
                            {new Date(t.fecha_inicio).toLocaleDateString('es-MX')}
                            <br /><span className="text-warm-400">{new Date(t.fecha_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setSelectedTarima(t.id)}
                                className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all" title="Ver detalle">
                                <Eye className="w-4 h-4" />
                              </button>
                              {canDelete('dropscan.historial') && !t.bloqueada && (
                                <button onClick={() => { if (confirm(`¿Eliminar tarima ${t.codigo}?`)) deleteMutation.mutate(t.id) }}
                                  className="p-2 rounded-xl hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all" title="Eliminar">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-warm-100 bg-warm-50/30">
                  <p className="text-xs text-warm-400 font-medium">Página {pagination.page} de {pagination.pages} · {pagination.total} registros</p>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="p-2 rounded-xl hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}
                      className="p-2 rounded-xl hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Detail Modal — redesigned with gradient header and sections */}
      <Modal isOpen={!!selectedTarima} onClose={() => setSelectedTarima(null)} icon={Package}
        title={detail ? `Tarima ${detail.codigo}` : 'Cargando...'} size="xl"
        footer={detail && (
          <>
            {detail.bloqueada && canUnlock('dropscan.historial') && (
              <button onClick={() => unlockMutation.mutate(detail.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-success-50 text-success-700 rounded-xl hover:bg-success-100 font-semibold transition-all">
                <Unlock className="w-4 h-4" /> Desbloquear
              </button>
            )}
            {!detail.bloqueada && canWrite('dropscan.historial') && (
              <button onClick={() => { const r = prompt('Razón del bloqueo:'); if (r) lockMutation.mutate({ id: detail.id, razon: r }) }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-warning-50 text-warning-700 rounded-xl hover:bg-warning-100 font-semibold transition-all">
                <Lock className="w-4 h-4" /> Bloquear
              </button>
            )}
            <button onClick={() => setSelectedTarima(null)} className="btn-ghost">Cerrar</button>
          </>
        )}>
        {detailLoading ? (
          <LoadingSpinner text="Cargando detalle..." />
        ) : detail ? (
          <div className="space-y-5">
            {/* Info grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Package, l: 'Empresa', v: detail.empresa_nombre },
                { icon: Package, l: 'Canal', v: detail.canal_nombre },
                { icon: Package, l: 'Operador', v: detail.operador_nombre },
                { icon: Package, l: 'Guías', v: `${detail.cantidad_guias}/100` },
                { icon: CheckCircle, l: 'Estado', v: detail.estado },
                { icon: Clock, l: 'Inicio', v: new Date(detail.fecha_inicio).toLocaleString('es-MX') },
                { icon: Clock, l: 'Cierre', v: detail.fecha_cierre ? new Date(detail.fecha_cierre).toLocaleString('es-MX') : '—' },
                { icon: Clock, l: 'Tiempo', v: detail.tiempo_armado_segundos ? `${Math.round(detail.tiempo_armado_segundos / 60)} min` : '—' },
              ].map(f => (
                <div key={f.l} className="p-3 rounded-xl bg-warm-50 border border-warm-100/50">
                  <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-0.5">{f.l}</p>
                  <p className="text-sm font-semibold text-warm-700">{f.v}</p>
                </div>
              ))}
            </div>

            {detail.bloqueada && (
              <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 flex items-start gap-3">
                <Lock className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-danger-700">Tarima Bloqueada</p>
                  <p className="text-xs text-danger-500 mt-0.5">Por {detail.bloqueada_por_nombre} · {detail.bloqueada_razon || 'Sin razón'}</p>
                </div>
              </div>
            )}

            {/* Guias */}
            <div>
              <h4 className="text-xs font-bold text-warm-400 uppercase tracking-wider mb-2">Guías ({detailGuias.length})</h4>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="bg-warm-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-bold text-warm-500">#</th>
                      <th className="text-left px-3 py-2.5 font-bold text-warm-500">Código</th>
                      <th className="text-left px-3 py-2.5 font-bold text-warm-500">Operador</th>
                      <th className="text-left px-3 py-2.5 font-bold text-warm-500">Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {detailGuias.map(g => (
                      <tr key={g.id} className="hover:bg-warm-50 transition-colors">
                        <td className="px-3 py-2 text-warm-400 font-bold">{g.posicion}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-warm-700">{g.codigo_guia}</td>
                        <td className="px-3 py-2 text-warm-500">{g.operador_nombre}</td>
                        <td className="px-3 py-2 text-warm-400">{new Date(g.timestamp_escaneo).toLocaleTimeString('es-MX')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
