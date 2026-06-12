import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Plus, LayoutList, Kanban, LayoutGrid, Search,
  RefreshCw, Eye, Trash2, X, Package, User,
  Crosshair, Calendar,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import MultiSelect from '../../../core/components/common/MultiSelect'
import TablePagination from '../../../core/components/common/TablePagination'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import CopyableCell from '../../../core/components/common/CopyableCell'
import Modal from '../../../core/components/common/Modal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import {
  getRastreoOrdenes, getRastreoUsuarios,
  deleteRastreoOrden,
} from '../../../core/services/rastreoService'
import NuevaOrdenRastreoModal from '../components/NuevaOrdenRastreoModal'
import RastreoKanban from '../components/RastreoKanban'
import RastreoCards from '../components/RastreoCards'
import RastreoSearchModal from '../components/RastreoSearchModal'

const TH = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'

const ESTADO_META = {
  abierta:    { cls: 'bg-primary-100 text-primary-700 border-primary-200', dot: 'bg-primary-400' },
  en_proceso: { cls: 'bg-warning-100 text-warning-700 border-warning-200', dot: 'bg-warning-500' },
  resuelta:   { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500' },
  cerrada:    { cls: 'bg-warm-100 text-warm-500 border-warm-200',          dot: 'bg-warm-400' },
}

const ESTADO_LABELS = {
  abierta: 'Abierta', en_proceso: 'En proceso', resuelta: 'Resuelta', cerrada: 'Cerrada',
}

function EstadoChip({ estado }) {
  const m = ESTADO_META[estado] || ESTADO_META.abierta
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {ESTADO_LABELS[estado] || estado}
    </span>
  )
}

export default function Rastreo() {
  const { t } = useI18nStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore()

  const [view, setView] = useState('lista')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [estadosFilter, setEstadosFilter] = useState([])
  const [operadoresFilter, setOperadoresFilter] = useState([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const canCreate = hasPermission('inventario.rastreo', 'crear')
  const canDelete = hasPermission('inventario.rastreo', 'eliminar')

  const { data: usersData } = useQuery({
    queryKey: ['rastreo-usuarios'],
    queryFn: () => getRastreoUsuarios(),
    staleTime: 5 * 60 * 1000,
  })
  const usuarios = usersData?.data || []

  const queryParams = {
    page,
    limit: 30,
    search: search || undefined,
    estado: estadosFilter.length ? estadosFilter.join(',') : undefined,
    asignado_a: operadoresFilter.length === 1 ? operadoresFilter[0] : undefined,
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['rastreo-ordenes', queryParams],
    queryFn: () => getRastreoOrdenes(queryParams),
    keepPreviousData: true,
  })

  const { data: allData } = useQuery({
    queryKey: ['rastreo-ordenes-all', { search, estadosFilter, operadoresFilter }],
    queryFn: () => getRastreoOrdenes({ page: 1, limit: 200, search: search || undefined }),
    enabled: view !== 'lista',
    keepPreviousData: true,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRastreoOrden(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
      toast.success('Orden eliminada')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Error al eliminar la orden'),
  })

  const ordenes = data?.data || []
  const total = data?.meta?.total || 0
  const allOrdenes = allData?.data || []

  const handleSearch = useCallback(() => {
    setSearch(searchInput)
    setPage(1)
  }, [searchInput])

  function clearFilters() {
    setSearch('')
    setSearchInput('')
    setEstadosFilter([])
    setOperadoresFilter([])
    setFechaDesde('')
    setFechaHasta('')
    setPage(1)
  }

  const hasActiveFilters = search || estadosFilter.length || operadoresFilter.length || fechaDesde || fechaHasta

  function handleCreated(folio) {
    qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })
    if (folio) navigate(`/Inventario/rastreo/${folio}`)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('rastreo.titulo')}
        subtitle={total ? `${total} órdenes` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-all text-xs font-medium"
            >
              <Search size={13} />
              Rastrear caja
            </button>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })}
              className="p-2 rounded-xl border border-warm-200 text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-all"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
            {canCreate && (
              <button onClick={() => setShowModal(true)} className="btn btn-primary flex items-center gap-1.5 text-sm">
                <Plus size={14} />
                {t('rastreo.nuevaOrden')}
              </button>
            )}
          </div>
        }
      />

      {/* Filter bar */}
      <div className="sticky top-16 bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 z-[9] flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-9 min-w-[200px] max-w-[260px] focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
          <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
          <input
            className="text-xs outline-none bg-transparent text-warm-700 flex-1 min-w-0"
            placeholder="Folio, orden, cliente..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {searchInput && <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}><X size={12} className="text-warm-400" /></button>}
        </div>

        {/* Estado MultiSelect */}
        <MultiSelect
          placeholder="Estado"
          options={[
            { value: 'abierta', label: 'Abierta' },
            { value: 'en_proceso', label: 'En proceso' },
            { value: 'resuelta', label: 'Resuelta' },
            { value: 'cerrada', label: 'Cerrada' },
          ]}
          selected={estadosFilter}
          onChange={(v) => { setEstadosFilter(v); setPage(1) }}
          className="max-w-[160px]"
        />

        {/* Operadores MultiSelect */}
        <MultiSelect
          placeholder="Asignado a"
          icon={User}
          options={usuarios.map(u => ({ value: String(u.id), label: u.nombre_completo }))}
          selected={operadoresFilter}
          onChange={(v) => { setOperadoresFilter(v); setPage(1) }}
          className="max-w-[200px]"
        />

        {/* Date filters */}
        <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-9 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
          <Calendar size={12} className="text-warm-400 shrink-0" />
          <input
            type="date"
            className="text-xs outline-none bg-transparent text-warm-600 w-[110px]"
            value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-9 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
          <Calendar size={12} className="text-warm-400 shrink-0" />
          <input
            type="date"
            className="text-xs outline-none bg-transparent text-warm-600 w-[110px]"
            value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
          />
        </div>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-warm-400 hover:text-warm-700 transition-colors px-2 py-1 rounded-lg hover:bg-warm-100">
            <X size={12} /> Limpiar
          </button>
        )}

        {/* View toggle — pushed right */}
        <div className="ml-auto flex items-center rounded-xl border border-warm-200 overflow-hidden">
          {[
            { key: 'lista', icon: LayoutList, label: 'Lista' },
            { key: 'kanban', icon: Kanban, label: 'Kanban' },
            { key: 'cards', icon: LayoutGrid, label: 'Cards' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
                ${view === v.key ? 'bg-primary-500 text-white' : 'text-warm-500 hover:bg-warm-50'}`}
            >
              <v.icon size={13} />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : view === 'lista' ? (
          <div className="px-5 pt-3 pb-6">
            <div className="rounded-2xl border border-warm-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                  <tr>
                    <th className={TH}><span className={TH_TEXT}>Folio TK</span></th>
                    <th className={TH}><span className={TH_TEXT}>Orden salida</span></th>
                    <th className={TH}><span className={TH_TEXT}>Cliente</span></th>
                    <th className={TH}><span className={TH_TEXT}>Cajas</span></th>
                    <th className={TH}><span className={TH_TEXT}>Estado</span></th>
                    <th className={TH}><span className={TH_TEXT}>Asignado a</span></th>
                    <th className={TH}><span className={TH_TEXT}>Creado</span></th>
                    <th className={TH}><span className={TH_TEXT}>Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-100">
                  {ordenes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-14 text-center text-xs text-warm-400">
                        <Crosshair size={24} className="mx-auto mb-2 text-warm-200" />
                        No hay órdenes de rastreo
                        {hasActiveFilters && <span className="block mt-1">Prueba eliminando los filtros activos</span>}
                      </td>
                    </tr>
                  ) : ordenes.map(o => (
                    <tr
                      key={o.id}
                      className="hover:bg-primary-50/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/Inventario/rastreo/${o.folio}`)}
                    >
                      <td className="px-4 py-3">
                        <CopyableCell text={o.folio} className="font-mono font-semibold text-xs text-primary-700" />
                      </td>
                      <td className="px-4 py-3">
                        {o.outbound_order_no
                          ? <CopyableCell text={o.outbound_order_no} className="font-mono text-xs text-warm-600" />
                          : <span className="text-xs text-warm-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-warm-700 font-medium">{o.customer_code || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-warm-600">
                          <Package size={11} />
                          <span>{o.total_cajas || 0}</span>
                          {o.cajas_localizadas > 0 && <span className="text-success-600 font-medium">+{o.cajas_localizadas}</span>}
                          {o.cajas_no_encontradas > 0 && <span className="text-danger-500 font-medium">-{o.cajas_no_encontradas}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3"><EstadoChip estado={o.estado} /></td>
                      <td className="px-4 py-3">
                        {o.asignado_nombre
                          ? <span className="flex items-center gap-1.5 text-xs text-warm-600"><User size={11} />{o.asignado_nombre}</span>
                          : <span className="text-xs text-warm-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-warm-400">
                          {new Date(o.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/Inventario/rastreo/${o.folio}`)}
                            className="p-1.5 rounded-lg hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-colors"
                            title="Ver detalle"
                          >
                            <Eye size={14} />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(o)}
                              className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-400 hover:text-danger-600 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > 30 && (
              <div className="mt-3">
                <TablePagination page={page} total={total} limit={30} onPageChange={setPage} />
              </div>
            )}
          </div>
        ) : view === 'kanban' ? (
          <div className="px-5 pt-4 pb-6">
            <RastreoKanban
              ordenes={allOrdenes}
              usuarios={usuarios}
              onReassigned={() => qc.invalidateQueries({ queryKey: ['rastreo-ordenes'] })}
            />
          </div>
        ) : (
          <div className="px-5 pt-4 pb-6">
            <RastreoCards ordenes={allOrdenes} />
          </div>
        )}
      </div>

      {/* Modals */}
      <NuevaOrdenRastreoModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        usuarios={usuarios}
        onCreated={handleCreated}
      />

      <RastreoSearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar orden de rastreo"
        icon={Trash2}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary text-sm">Cancelar</button>
            <button
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isLoading}
              className="btn text-sm bg-danger-600 text-white hover:bg-danger-700 flex items-center gap-1.5"
            >
              {deleteMutation.isLoading && <RefreshCw size={12} className="animate-spin" />}
              Eliminar
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-600">
          ¿Eliminar la orden <span className="font-mono font-semibold text-primary-700">{deleteTarget?.folio}</span>?
          Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  )
}
