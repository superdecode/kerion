import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Plus, Search, X, PackageCheck, CheckCircle2, XCircle, Clock,
  Users, Truck, User, Eye, Filter, ChevronUp, ChevronDown, ChevronsUpDown,
  AlertCircle, RefreshCw,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import MultiSelect from '../../../core/components/common/MultiSelect'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDate, fmtTimeShort, getToday, subtractDays } from '../../../core/utils/dateFormat'
import { getFolios, getConductores, getUnidades } from '../services/despachoService'
import { ConductoresModal, UnidadesModal, FolioFormModal } from '../components/CatalogsModals'

const ESTADO_META = {
  borrador:   { labelKey: 'desp.folio.estado.borrador',   cls: 'bg-warm-100 text-warm-600',       icon: Clock },
  en_proceso: { labelKey: 'desp.folio.estado.enProceso',  cls: 'bg-primary-100 text-primary-700', icon: Truck },
  cerrado:    { labelKey: 'desp.folio.estado.cerrado',     cls: 'bg-success-100 text-success-700',  icon: CheckCircle2 },
  cancelado:  { labelKey: 'desp.folio.estado.cancelado',   cls: 'bg-danger-100 text-danger-700',    icon: XCircle },
}

function SortHeader({ label, field, sortField, sortDir, onSort, className = '' }) {
  const active = field === sortField
  return (
    <th
      className={`table-header cursor-pointer select-none hover:bg-warm-100/60 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-primary-500" />
            : <ChevronDown className="w-3 h-3 text-primary-500" />
          : <ChevronsUpDown className="w-3 h-3 text-warm-300" />
        }
      </div>
    </th>
  )
}

export default function Folios() {
  const navigate = useNavigate()
  const { canWrite } = useAuthStore()
  const { t } = useI18nStore()
  const canManageCatalogs = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.folios')
    return lvl === 'actualizar' || lvl === 'eliminar'
  })

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [estadoFilter, setEstadoFilter] = useState([])
  const [unidadFilter, setUnidadFilter] = useState([])
  const [conductorFilter, setConductorFilter] = useState([])
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [showCreate, setShowCreate] = useState(false)
  const [showConductores, setShowConductores] = useState(false)
  const [showUnidades, setShowUnidades] = useState(false)

  const { data: foliosData, isLoading, isError, refetch } = useQuery({
    queryKey: ['despacho-folios'],
    queryFn: () => getFolios({}),
    refetchInterval: 30000,
    retry: 1,
  })
  const { data: conductoresData } = useQuery({ queryKey: ['despacho-conductores'], queryFn: getConductores })
  const { data: unidadesData } = useQuery({ queryKey: ['despacho-unidades'], queryFn: getUnidades })

  const folios = foliosData?.folios ?? []
  const conductores = conductoresData?.conductores ?? []
  const unidades = unidadesData?.unidades ?? []

  const conductorOptions = useMemo(
    () => conductores.map(c => ({ value: String(c.id), label: c.nombre })),
    [conductores]
  )
  const unidadOptions = useMemo(
    () => unidades.map(u => ({ value: String(u.id), label: u.placa })),
    [unidades]
  )

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase()
    return folios.filter(f => {
      const dateKey = f.fecha_salida ? f.fecha_salida.slice(0, 10) : ''
      if (dateFrom && dateKey && dateKey < dateFrom) return false
      if (dateTo && dateKey && dateKey > dateTo) return false
      if (estadoFilter.length > 0 && !estadoFilter.includes(f.estado)) return false
      if (unidadFilter.length > 0) {
        if (!f.unidad_id || !unidadFilter.includes(String(f.unidad_id))) return false
      }
      if (conductorFilter.length > 0) {
        if (!f.conductor_id || !conductorFilter.includes(String(f.conductor_id))) return false
      }
      if (search) {
        const haystack = [f.folio_numero, f.conductor_nombre, f.unidad_placa]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [folios, q, dateFrom, dateTo, estadoFilter, unidadFilter, conductorFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = a[sortField] ?? ''
      const bv = b[sortField] ?? ''
      if (sortField === 'total_ordenes' || sortField === 'total_cajas') {
        return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
      }
      const as = String(av).toLowerCase()
      const bs = String(bv).toLowerCase()
      if (sortDir === 'asc') return as < bs ? -1 : as > bs ? 1 : 0
      return bs < as ? -1 : bs > as ? 1 : 0
    })
    return arr
  }, [filtered, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize]
  )

  useEffect(() => { setPage(1) }, [q, dateFrom, dateTo, estadoFilter, unidadFilter, conductorFilter])

  function handleSort(field) {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function applyFilters() { setQ(searchInput.trim()) }

  function clearFilters() {
    setSearchInput('')
    setQ('')
    setDateFrom('')
    setDateTo('')
    setEstadoFilter([])
    setUnidadFilter([])
    setConductorFilter([])
  }

  const hasFilters = q || dateFrom || dateTo ||
    estadoFilter.length > 0 || unidadFilter.length > 0 || conductorFilter.length > 0

  const DATE_PRESETS = [
    { label: t('common.today'),      d: 0 },
    { label: t('common.last7Days'),  d: 7 },
    { label: t('common.last30Days'), d: 30 },
  ]

  const ESTADO_OPTIONS = Object.entries(ESTADO_META).map(([k, v]) => ({
    value: k,
    label: t(v.labelKey),
  }))

  function estadoBadge(estado) {
    const meta = ESTADO_META[estado] ?? ESTADO_META.borrador
    const Icon = meta.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cls}`}>
        <Icon className="w-3 h-3" />
        {t(meta.labelKey)}
      </span>
    )
  }

  const sp = { sortField, sortDir, onSort: handleSort }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('desp.folios.title')}
        subtitle={t('desp.folios.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {canManageCatalogs && (
              <>
                <button onClick={() => setShowConductores(true)} className="btn-ghost text-xs flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {t('desp.btn.conductores')}
                </button>
                <button onClick={() => setShowUnidades(true)} className="btn-ghost text-xs flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  {t('desp.btn.unidades')}
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Sticky filter bar */}
        <div className="sticky top-0 z-[100] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">

          {/* Row 1 — date range + presets + Nuevo Folio */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input
                type="date" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0" />
              <span className="text-warm-300 text-xs">→</span>
              <input
                type="date" value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0" />
            </div>
            {DATE_PRESETS.map(({ label, d }) => (
              <button key={label}
                onClick={() => {
                  const today = getToday()
                  setDateFrom(d === 0 ? today : subtractDays(today, d))
                  setDateTo(today)
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
              >{label}</button>
            ))}
            <div className="flex-1" />
            {canWrite('despacho.folios') && (
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                {t('desp.btn.nuevoFolio')}
              </button>
            )}
          </div>

          {/* Row 2 — MultiSelects + search + apply */}
          <div className="flex items-center gap-2 flex-wrap">
            <MultiSelect
              options={ESTADO_OPTIONS}
              selected={estadoFilter}
              onChange={setEstadoFilter}
              placeholder={t('desp.folio.col.estado')}
              icon={Clock}
            />
            <MultiSelect
              options={unidadOptions}
              selected={unidadFilter}
              onChange={setUnidadFilter}
              placeholder={t('desp.folio.col.unidad')}
              icon={Truck}
            />
            <MultiSelect
              options={conductorOptions}
              selected={conductorFilter}
              onChange={setConductorFilter}
              placeholder={t('desp.folio.col.conductor')}
              icon={User}
            />
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[200px] flex-1 transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
              <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input
                type="text"
                placeholder={t('desp.filter.buscarFolio')}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyFilters() }}
                className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0"
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setQ('') }} className="text-warm-400 hover:text-warm-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {hasFilters && (
              <button onClick={clearFilters}
                className="inline-flex items-center gap-1 h-10 px-3 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                <X className="w-3 h-3" /> {t('common.clear')}
              </button>
            )}
            <button onClick={applyFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-100 px-4 text-xs font-semibold text-violet-700 hover:bg-violet-200 transition-colors">
              <Filter className="w-3 h-3" /> {t('common.apply')}
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center px-5">
            <AlertCircle className="w-10 h-10 text-danger-300" />
            <p className="text-sm font-semibold text-warm-700">{t('desp.folios.error')}</p>
            <p className="text-xs text-warm-500">{t('desp.folios.errorHint')}</p>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> {t('desp.btn.reintentar')}
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="rounded-2xl border border-warm-100 overflow-hidden shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                  <tr>
                    <SortHeader label={t('desp.folio.col.folio')} field="folio_numero" {...sp} />
                    <SortHeader label={t('desp.folio.col.fechaCreacion')} field="created_at" {...sp} />
                    <SortHeader label={t('desp.folio.col.estado')} field="estado" {...sp} />
                    <SortHeader label={t('desp.folio.col.conductor')} field="conductor_nombre" {...sp} />
                    <SortHeader label={t('desp.folio.col.unidad')} field="unidad_placa" {...sp} />
                    <SortHeader label={t('desp.folio.col.ordenes')} field="total_ordenes" {...sp} className="text-center" />
                    <SortHeader label={t('desp.folio.col.cajas')} field="total_cajas" {...sp} className="text-center" />
                    <th className="table-header w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-14 text-center">
                        <PackageCheck className="w-8 h-8 text-warm-200 mx-auto mb-2" />
                        <p className="text-sm text-warm-400 font-medium">{t('desp.folios.empty')}</p>
                      </td>
                    </tr>
                  ) : paginated.map((folio, i) => (
                    <motion.tr key={folio.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="hover:bg-warm-50/60 cursor-pointer transition-colors"
                      onClick={() => navigate(`/despacho/folios/${folio.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-primary-700 text-xs">{folio.folio_numero}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs text-warm-700">{fmtDate(folio.created_at)}</span>
                          <span className="text-[10px] text-warm-400">{fmtTimeShort(folio.created_at)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{estadoBadge(folio.estado)}</td>
                      <td className="px-4 py-3">
                        {folio.conductor_nombre
                          ? <span className="flex items-center gap-1.5 text-xs text-warm-700 font-medium"><User className="w-3.5 h-3.5 text-warm-400" />{folio.conductor_nombre}</span>
                          : <span className="text-warm-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {folio.unidad_placa
                          ? <span className="flex items-center gap-1.5 text-xs text-warm-700 font-medium"><Truck className="w-3.5 h-3.5 text-warm-400" />{folio.unidad_placa} <span className="text-warm-400">({folio.unidad_tipo})</span></span>
                          : <span className="text-warm-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">
                          {folio.total_ordenes}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-semibold tabular-nums text-warm-700">
                          {folio.total_cajas ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/despacho/folios/${folio.id}`)}
                          title={t('desp.btn.verDetalle')}
                          className="p-1.5 rounded-xl hover:bg-primary-50 text-warm-300 hover:text-primary-600 transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={safePage}
                totalPages={totalPages}
                pageSize={pageSize}
                total={sorted.length}
                onPageChange={setPage}
                onPageSizeChange={p => { setPageSize(p); setPage(1) }}
              />
            </div>
          </div>
        )}
      </div>

      <FolioFormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => navigate(`/despacho/folios/${id}`)}
        conductores={conductores}
        unidades={unidades}
      />
      <ConductoresModal isOpen={showConductores} onClose={() => setShowConductores(false)} canManage={canManageCatalogs} />
      <UnidadesModal isOpen={showUnidades} onClose={() => setShowUnidades(false)} canManage={canManageCatalogs} />
    </div>
  )
}
