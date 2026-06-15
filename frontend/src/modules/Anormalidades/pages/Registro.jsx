import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  Plus, Search, AlertTriangle, X,
  Download, Clock, CheckCircle2, AlertCircle,
  Eye, Edit3, Trash2, Loader2,
  ChevronRight, FileText, History, Link2, RefreshCw, ArrowUpDown, Target,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import MultiSelect from '../../../core/components/common/MultiSelect'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDateTime, fmtDate, getToday, subtractDays } from '../../../core/utils/dateFormat'
import {
  listAnormalidades, getAnormalidad, createAnormalidad, updateAnormalidad,
  deleteAnormalidad, changeEstado, getCodigos, getUsuarios, crearMejoraDesdeAnormalidad,
  getProcesosConfig, getOrigenesConfig, getNivelesConfig,
} from '../services/anormalidadesService'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDatetimeString() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Constants ────────────────────────────────────────────────────────────────

const NIVEL_META = {
  L1: { label: 'L1', cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500' },
  L2: { label: 'L2', cls: 'bg-warning-100 text-warning-700 border-warning-200', dot: 'bg-warning-500' },
  L3: { label: 'L3', cls: 'bg-danger-100 text-danger-700 border-danger-200', dot: 'bg-danger-500', pulse: true },
}

const ESTADO_META = {
  nuevo:      { labelKey: 'anorm.estado.nuevo',      cls: 'bg-primary-100 text-primary-700 border-primary-200' },
  en_proceso: { labelKey: 'anorm.estado.en_proceso', cls: 'bg-accent-100 text-accent-700 border-accent-200' },
  cerrado:    { labelKey: 'anorm.estado.cerrado',    cls: 'bg-success-100 text-success-700 border-success-200' },
  vencido:    { labelKey: 'anorm.estado.vencido',    cls: 'bg-danger-100 text-danger-700 border-danger-200' },
}

const STATUS_TABS = ['todos', 'nuevo', 'en_proceso', 'cerrado', 'vencido']

const TH = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider text-warm-500'

function SectionBlock({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-500 mb-3 pb-1 border-b border-warm-100">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Field({ label, span = 1, children }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-warm-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function NivelChip({ nivel }) {
  const m = NIVEL_META[nivel] || NIVEL_META.L1
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${m.pulse ? 'animate-pulse' : ''}`} />
      {m.label}
    </span>
  )
}

function EstadoChip({ estado }) {
  const { t } = useI18nStore()
  const m = ESTADO_META[estado] || ESTADO_META.nuevo
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>
      {t(m.labelKey)}
    </span>
  )
}

// ── Form helpers ─────────────────────────────────────────────────────────────

const FORM_EMPTY = {
  fecha_ocurrencia: '',
  proceso: '',
  codigo_id: '',
  codigo: '',
  nombre: '',
  nivel: '',
  cliente: '',
  almacen: '',
  contenedor_orden: '',
  sku: '',
  ubicacion: '',
  cantidad_afectada: '',
  monto_impacto: '',
  descripcion: '',
  detectado_por_id: '',
  detectado_por_nombre: '',
  origen_responsabilidad: '',
  responsable_id: '',
  accion_inmediata: '',
  causa_raiz: '',
  accion_preventiva: '',
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AnormalidadesRegistro() {
  const { hasPermission } = useAuthStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const toast = useToastStore()
  const { t } = useI18nStore()
  const qc = useQueryClient()

  const canCreate = hasPermission('anormalidades.registro', 'crear')
  const canUpdate = hasPermission('anormalidades.registro', 'actualizar')
  const canDelete = hasPermission('anormalidades.registro', 'eliminar')

  // List state
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('todos')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [selectedProcesos, setSelectedProcesos] = useState([])
  const [selectedNiveles, setSelectedNiveles] = useState([])
  const [selectedResponsables, setSelectedResponsables] = useState([])
  const [selectedOrigenes, setSelectedOrigenes] = useState([])
  const [soloVencidas, setSoloVencidas] = useState(false)
  const [sinResponsable, setSinResponsable] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [selectingAllFiltered, setSelectingAllFiltered] = useState(false)

  // Modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [estadoModal, setEstadoModal] = useState(null) // { id, estado_actual }

  const queryParams = useMemo(() => {
    const p = { page, limit: 20, search: search || undefined }
    if (activeTab !== 'todos') p.estado = activeTab
    if (fechaDesde) p.fecha_desde = fechaDesde
    if (fechaHasta) p.fecha_hasta = fechaHasta
    if (selectedProcesos.length) p.proceso = selectedProcesos.join(',')
    if (selectedNiveles.length) p.nivel = selectedNiveles.join(',')
    if (selectedResponsables.length) p.responsable_id = selectedResponsables.join(',')
    if (selectedOrigenes.length) p.origen = selectedOrigenes.join(',')
    if (soloVencidas) p.solo_vencidas = true
    if (sinResponsable) p.sin_responsable = true
    return p
  }, [
    page,
    search,
    activeTab,
    fechaDesde,
    fechaHasta,
    selectedProcesos,
    selectedNiveles,
    selectedResponsables,
    selectedOrigenes,
    soloVencidas,
    sinResponsable,
  ])

  const { data, isLoading } = useQuery({
    queryKey: ['anormalidades', queryParams],
    queryFn: () => listAnormalidades(queryParams),
    keepPreviousData: true,
    enabled: backendOnline,
  })

  const { data: codigosData } = useQuery({ queryKey: ['anorm-codigos'], queryFn: getCodigos, enabled: backendOnline })
  const { data: usuariosData } = useQuery({ queryKey: ['anorm-usuarios'], queryFn: getUsuarios, enabled: backendOnline })
  const { data: procesosData } = useQuery({ queryKey: ['anorm-procesos-config'], queryFn: getProcesosConfig, enabled: backendOnline })
  const { data: nivelesData } = useQuery({ queryKey: ['anorm-niveles-config'], queryFn: getNivelesConfig, enabled: backendOnline })
  const { data: origenesData } = useQuery({ queryKey: ['anorm-origenes-config'], queryFn: getOrigenesConfig, enabled: backendOnline })

  const codigos = codigosData?.data || []
  const usuarios = usuariosData?.data || []
  const procesos = (procesosData?.data || []).filter(item => item.activo)
  const niveles = (nivelesData?.data || []).filter(item => item.activo)
  const origenes = (origenesData?.data || []).filter(item => item.activo)

  const rows = data?.data || []
  const total = data?.total || 0
  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id))
  const someChecked = selected.size > 0
  const allFilteredSelected = someChecked && total > 0 && selected.size === total

  // ── Detail query ────────────────────────────────────────────────────────────
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['anormalidad-detail', detailId],
    queryFn: () => getAnormalidad(detailId),
    enabled: !!detailId,
  })
  const detail = detailData?.data

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: createAnormalidad,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anormalidades'] }); setCreateOpen(false); toast.success(t('anorm.toast.created')) },
    onError: (e) => toast.error(e?.response?.data?.error || t('anorm.toast.errorCreate')),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateAnormalidad(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anormalidades'] }); qc.invalidateQueries({ queryKey: ['anormalidad-detail', editId] }); setEditId(null); toast.success(t('anorm.toast.updated')) },
    onError: (e) => toast.error(e?.response?.data?.error || t('anorm.toast.errorUpdate')),
  })

  const deleteMut = useMutation({
    mutationFn: deleteAnormalidad,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anormalidades'] }); setDeleteId(null); toast.success('Eliminado') },
    onError: (e) => toast.error(e?.response?.data?.error || t('anorm.toast.errorDelete')),
  })

  const estadoMut = useMutation({
    mutationFn: ({ id, estado, nota }) => changeEstado(id, { estado, nota }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anormalidades'] })
      qc.invalidateQueries({ queryKey: ['anormalidad-detail', estadoModal?.id] })
      setEstadoModal(null)
      toast.success(t('anorm.toast.statusUpdated'))
    },
    onError: (e) => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const crearMejoraMut = useMutation({
    mutationFn: ({ id, payload }) => crearMejoraDesdeAnormalidad(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anormalidad-detail', detailId] })
      toast.success(t('anorm.toast.mejoraCreated'))
    },
    onError: (e) => toast.error(e?.response?.data?.error || t('anorm.toast.errorCreateMejora')),
  })

  const clearFilters = () => {
    setFechaDesde('')
    setFechaHasta('')
    setSelectedProcesos([])
    setSelectedNiveles([])
    setSelectedResponsables([])
    setSelectedOrigenes([])
    setSoloVencidas(false)
    setSinResponsable(false)
    setPage(1)
  }

  const hasActiveFilters = !!(fechaDesde || fechaHasta || selectedProcesos.length || selectedNiveles.length || selectedResponsables.length || selectedOrigenes.length || soloVencidas || sinResponsable)

  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) rows.forEach(r => next.delete(r.id))
      else rows.forEach(r => next.add(r.id))
      return next
    })
  }, [allChecked, rows])

  const toggleRow = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const selectAllFiltered = useCallback(async () => {
    try {
      setSelectingAllFiltered(true)
      const all = await listAnormalidades({ ...queryParams, page: 1, limit: 9999 })
      setSelected(new Set((all.data || []).map(r => r.id)))
    } catch {
      toast.error(t('anorm.toast.errorSelectFiltered'))
    } finally {
      setSelectingAllFiltered(false)
    }
  }, [queryParams, toast])

  const exportSelected = useCallback(async () => {
    if (!canUpdate || selected.size === 0) return
    try {
      const all = await listAnormalidades({ ...queryParams, page: 1, limit: 9999 })
      const selectedRows = (all.data || []).filter(r => selected.has(r.id))
      const ws = XLSX.utils.json_to_sheet(selectedRows.map(r => ({
        [t('anorm.export.folio')]: r.folio,
        [t('anorm.export.fecha')]: fmtDateTime(r.fecha_ocurrencia),
        [t('anorm.export.proceso')]: r.proceso,
        [t('anorm.export.codigo')]: r.codigo,
        [t('anorm.export.nombre')]: r.nombre,
        [t('anorm.export.nivel')]: r.nivel,
        [t('anorm.export.estado')]: t(ESTADO_META[r.estado]?.labelKey || r.estado),
        [t('anorm.export.cliente')]: r.cliente || '',
        [t('anorm.export.responsable')]: r.responsable_nombre || '',
        [t('anorm.export.diasAbierto')]: r.dias_abierto ? Math.floor(r.dias_abierto) : 0,
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, t('anorm.export.sheet'))
      XLSX.writeFile(wb, `${t('anorm.export.fileSelected')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      setSelected(new Set())
    } catch {
      toast.error(t('anorm.toast.errorExportSelected'))
    }
  }, [queryParams, selected, canUpdate, toast, t])

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('anorm.registro.title')}
        subtitle={t('anorm.registro.subtitle')}
        icon={<AlertTriangle className="w-5 h-5 text-warning-500" />}
      />

      {/* ── Sticky filter bar ─────────────────────────────────────────────── */}
      <div className="sticky top-[3.5rem] z-[20] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
                <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
                  className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
                <span className="text-warm-300 text-xs">→</span>
                <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
                  className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
              </div>
              {[{ label: t('common.today'), d: 0 }, { label: t('common.last7Days'), d: 7 }, { label: t('common.last30Days'), d: 30 }].map(({ label, d }) => (
                <button key={d}
                  onClick={() => { const today = getToday(); setFechaDesde(d === 0 ? today : subtractDays(today, d)); setFechaHasta(today); setPage(1) }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
                >{label}</button>
              ))}
              <button
                onClick={() => { setSoloVencidas(v => !v); setPage(1) }}
                className={`h-10 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                  soloVencidas ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-warm-200 bg-white text-warm-600'
                }`}
              >
                {t('anorm.registro.onlyOverdue')}
              </button>
              <button
                onClick={() => { setSinResponsable(v => !v); setPage(1) }}
                className={`h-10 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                  sinResponsable ? 'border-warning-300 bg-warning-50 text-warning-700' : 'border-warm-200 bg-white text-warm-600'
                }`}
              >
                {t('anorm.registro.unassigned')}
              </button>
            </div>
            {canCreate && (
              <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs h-10 ml-auto">
                <Plus className="w-3.5 h-3.5" />
                {t('anorm.registro.nueva')}
              </button>
            )}
          </div>

        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelect
            placeholder={t('anorm.field.proceso')}
            options={procesos.map(item => ({ value: item.nombre, label: item.nombre }))}
            selected={selectedProcesos}
            onChange={(v) => { setSelectedProcesos(v); setPage(1) }}
          />
          <MultiSelect
            placeholder={t('anorm.field.nivel')}
            options={niveles.map(n => ({ value: n.codigo, label: n.nombre }))}
            selected={selectedNiveles}
            onChange={(v) => { setSelectedNiveles(v); setPage(1) }}
          />
          <MultiSelect
            placeholder={t('anorm.field.responsable')}
            options={usuarios.map(u => ({ value: String(u.id), label: u.nombre_completo }))}
            selected={selectedResponsables}
            onChange={(v) => { setSelectedResponsables(v); setPage(1) }}
          />
          <MultiSelect
            placeholder={t('anorm.field.origen')}
            options={origenes.map(item => ({ value: item.nombre, label: item.nombre }))}
            selected={selectedOrigenes}
            onChange={(v) => { setSelectedOrigenes(v); setPage(1) }}
          />
          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[200px] focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
            <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              placeholder={t('anorm.registro.searchPlaceholder')}
              className="text-xs outline-none bg-transparent text-warm-700 flex-1" />
            {search && <button onClick={() => setSearch('')} className="text-warm-400 hover:text-warm-600"><X className="w-3 h-3" /></button>}
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
              <X className="w-3 h-3" /> {t('common.clear')}
            </button>
          )}
        </div>
        </div>
      </div>

      {/* ── Status tabs ───────────────────────────────────────────────────── */}
      <div className="sticky top-[8.6rem] z-[4] border-b border-warm-100 bg-white px-5">
        <div className="flex gap-0">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPage(1) }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-warm-400 hover:text-warm-600'
              }`}
            >
              {t(`anorm.estado.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className="card overflow-hidden shadow-sm table-shell">
            {someChecked && canUpdate && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100 flex-wrap">
                <span className="text-xs text-primary-700 font-semibold tabular-nums">
                  {t('anorm.registro.selectedCount').replace('{n}', selected.size)}
                  {allFilteredSelected && total > 0 && (
                    <span className="ml-1 text-primary-500 font-normal">{t('anorm.registro.allFiltered')}</span>
                  )}
                </span>
                {!allFilteredSelected && total > selected.size && (
                  <button
                    className="text-xs text-primary-600 hover:text-primary-800 underline font-semibold transition-colors"
                    onClick={selectAllFiltered}
                    disabled={selectingAllFiltered}
                  >
                    {selectingAllFiltered ? t('anorm.registro.selecting') : t('anorm.registro.selectAllFiltered').replace('{n}', total)}
                  </button>
                )}
                <button
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors"
                  onClick={exportSelected}
                >
                  <Download size={12} /> {t('common.export')} ({selected.size})
                </button>
                <button
                  className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors ml-auto"
                  onClick={() => setSelected(new Set())}
                >
                  <X className="w-3 h-3" /> {t('common.clear')}
                </button>
              </div>
            )}
            <div className="overflow-x-auto table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-warm-50 border-b border-warm-100">
                    <th className={`${TH} w-8`}>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                        onChange={toggleAll}
                        className="rounded border-warm-300 text-primary-600 cursor-pointer"
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <th className={TH}><span className={TH_TEXT}>{t('anorm.field.folio')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('common.date')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('anorm.field.proceso')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('anorm.field.codigo')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('anorm.field.nivel')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('common.status')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('anorm.field.responsable')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('anorm.field.dias')}</span></th>
                    <th className={TH}><span className={TH_TEXT}>{t('common.actions')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {rows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-16 text-warm-400 text-sm">{t('common.noData')}</td></tr>
                  ) : rows.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => setDetailId(row.id)}
                      className="table-row hover:bg-primary-50/30 cursor-pointer transition-colors"
                    >
                      <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="rounded border-warm-300 text-primary-600 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="table-cell">
                        <span className="font-mono text-xs font-semibold text-primary-700">{row.folio}</span>
                      </td>
                      <td className="table-cell text-xs text-warm-600">{fmtDateTime(row.fecha_ocurrencia)}</td>
                      <td className="table-cell text-xs text-warm-700">{row.proceso}</td>
                      <td className="table-cell">
                        <div className="text-xs font-medium text-warm-800">{row.codigo}</div>
                        <div className="text-[10px] text-warm-400 truncate max-w-[120px]">{row.nombre}</div>
                      </td>
                      <td className="table-cell"><NivelChip nivel={row.nivel} /></td>
                      <td className="table-cell">
                        <EstadoChip estado={row.vencido && row.estado !== 'cerrado' ? 'vencido' : row.estado} />
                      </td>
                      <td className="table-cell text-xs text-warm-600">{row.responsable_nombre || <span className="text-warm-300">—</span>}</td>
                      <td className="table-cell">
                        <span className={`text-xs font-medium ${row.vencido && row.estado !== 'cerrado' ? 'text-danger-600' : 'text-warm-600'}`}>
                          {row.dias_abierto ? `${Math.floor(row.dias_abierto)}d` : '0d'}
                          {row.vencido && row.estado !== 'cerrado' && ' ⚠'}
                        </span>
                      </td>
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailId(row.id)} className="p-1.5 rounded-lg hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-colors" title={t('common.view')}>
                            <Eye className="w-4 h-4" />
                          </button>
                          {canCreate && (
                            <button onClick={() => setEditId(row.id)} className="p-1.5 rounded-lg hover:bg-accent-100 text-warm-400 hover:text-accent-600 transition-colors" title={t('common.edit')}>
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteId(row.id)} className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-400 hover:text-danger-600 transition-colors" title={t('common.delete')}>
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
            <TablePagination
              page={page}
              limit={20}
              total={total}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* Modal: create */}
      <AnormFormModal
        key="anorm-create"
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        codigos={codigos}
        usuarios={usuarios}
        procesos={procesos}
        niveles={niveles}
        origenes={origenes}
        onSubmit={(data) => createMut.mutate(data)}
        loading={createMut.isPending}
        title={t('anorm.registro.nueva')}
      />

      {/* Modal: edit */}
      {editId && (
        <AnormEditModal
          key={`anorm-edit-${editId}`}
          id={editId}
          codigos={codigos}
          usuarios={usuarios}
          procesos={procesos}
          niveles={niveles}
          origenes={origenes}
          onClose={() => setEditId(null)}
          onSubmit={(data) => updateMut.mutate({ id: editId, data })}
          loading={updateMut.isPending}
        />
      )}

      {/* Modal: detail */}
      <AnormDetailModal
        key={`anorm-detail-${detailId || 'none'}`}
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        detail={detail}
        loading={detailLoading}
        canUpdate={canUpdate}
        canCreate={canCreate}
        onChangeEstado={(estado) => setEstadoModal({ id: detailId, estado_actual: detail?.estado })}
        onEdit={() => { setEditId(detailId); setDetailId(null) }}
        onCrearMejora={() => crearMejoraMut.mutate({ id: detailId, payload: {} })}
        creandoMejora={crearMejoraMut.isPending}
      />

      {/* Modal: cambiar estado */}
      {estadoModal && (
        <CambiarEstadoModal
          estadoActual={estadoModal.estado_actual}
          onClose={() => setEstadoModal(null)}
          onSubmit={({ estado, nota }) => estadoMut.mutate({ id: estadoModal.id, estado, nota })}
          loading={estadoMut.isPending}
        />
      )}

      {/* Delete confirm */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title={t('anorm.delete.title')} icon={Trash2} size="sm">
        <p className="text-warm-600 text-sm">{t('anorm.delete.confirm')}</p>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setDeleteId(null)} className="btn-secondary text-sm">{t('common.cancel')}</button>
          <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="btn-danger text-sm flex items-center gap-2">
            {deleteMut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {t('common.delete')}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ── AnormFormModal ─────────────────────────────────────────────────────────────

function AnormFormModal({ isOpen, onClose, codigos, usuarios, procesos, niveles, origenes, onSubmit, loading, title, initialData }) {
  const { t } = useI18nStore()
  const [form, setForm] = useState(initialData || { ...FORM_EMPTY, fecha_ocurrencia: toLocalDatetimeString() })
  const [isEditing, setIsEditing] = useState(!initialData)
  const isCreateMode = !initialData

  useEffect(() => {
    setForm(initialData || { ...FORM_EMPTY, fecha_ocurrencia: toLocalDatetimeString() })
    setIsEditing(!initialData)
  }, [initialData, isOpen])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const codigosPorProceso = useMemo(() => {
    const grouped = {}
    ;(codigos || []).filter(c => c.activo).forEach(c => {
      if (!grouped[c.proceso]) grouped[c.proceso] = []
      grouped[c.proceso].push(c)
    })
    return grouped
  }, [codigos])

  const handleCodigoChange = (e) => {
    const id = e.target.value
    const found = codigos.find(c => String(c.id) === id)
    if (found) {
      set('codigo_id', id)
      set('codigo', found.codigo)
      set('nombre', found.nombre)
      if (!form.nivel) set('nivel', found.nivel_sugerido || '')
    } else {
      set('codigo_id', '')
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = { ...form }
    if (payload.cantidad_afectada) payload.cantidad_afectada = parseInt(payload.cantidad_afectada)
    if (payload.monto_impacto) payload.monto_impacto = parseFloat(payload.monto_impacto)
    onSubmit(payload)
  }

  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'
  const sel = inp
  const disabledInput = `${inp} disabled:opacity-60 disabled:bg-warm-50 disabled:cursor-not-allowed`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={AlertTriangle} size="2xl">
      <form onSubmit={handleSubmit}>
        <SectionBlock title={t('anorm.section.identificacion')}>
          <Field label={t('anorm.field.fechaOcurrencia')}>
            <input type="datetime-local" value={form.fecha_ocurrencia} onChange={e => set('fecha_ocurrencia', e.target.value)} disabled={!isEditing} className={disabledInput} required />
          </Field>
          <Field label={t('anorm.field.proceso')}>
            <select value={form.proceso} onChange={e => set('proceso', e.target.value)} disabled={!isEditing} className={disabledInput} required>
              <option value="">{t('common.select')}</option>
              {procesos.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
            </select>
          </Field>
          <Field label={t('anorm.field.codigo')}>
            <select value={form.codigo_id} onChange={handleCodigoChange} disabled={!isEditing} className={disabledInput}>
              <option value="">{t('common.select')}</option>
              {Object.entries(codigosPorProceso).map(([proc, codes]) => (
                <optgroup key={proc} label={proc}>
                  {codes.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={t('anorm.field.nombre')}>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)} disabled={!isEditing} className={disabledInput} required placeholder={t('anorm.field.nombrePlaceholder')} />
          </Field>
          <Field label={t('anorm.field.nivel')}>
            <select value={form.nivel} onChange={e => set('nivel', e.target.value)} disabled={!isEditing} className={disabledInput} required>
              <option value="">{t('common.select')}</option>
              {niveles.map(n => <option key={n.codigo} value={n.codigo}>{n.nombre}</option>)}
            </select>
          </Field>
        </SectionBlock>

        <SectionBlock title={t('anorm.section.contexto')}>
          <Field label={t('anorm.field.cliente')}>
            <input value={form.cliente} onChange={e => set('cliente', e.target.value)} disabled={!isEditing} className={disabledInput} placeholder={t('anorm.field.clientePlaceholder')} />
          </Field>
          <Field label={t('anorm.field.almacen')}>
            <input value={form.almacen} onChange={e => set('almacen', e.target.value)} disabled={!isEditing} className={disabledInput} />
          </Field>
          <Field label={t('anorm.field.contenedor')}>
            <input value={form.contenedor_orden} onChange={e => set('contenedor_orden', e.target.value)} disabled={!isEditing} className={disabledInput} />
          </Field>
          <Field label={t('anorm.field.sku')}>
            <input value={form.sku} onChange={e => set('sku', e.target.value)} disabled={!isEditing} className={disabledInput} />
          </Field>
          <Field label={t('anorm.field.ubicacion')}>
            <input value={form.ubicacion} onChange={e => set('ubicacion', e.target.value)} disabled={!isEditing} className={disabledInput} />
          </Field>
          <Field label={t('anorm.field.cantidad')}>
            <input
              type="text"
              inputMode="numeric"
              value={form.cantidad_afectada}
              onChange={e => set('cantidad_afectada', e.target.value.replace(/[^\d]/g, ''))}
              disabled={!isEditing}
              className={disabledInput}
            />
          </Field>
          <Field label={t('anorm.field.monto')}>
            <input
              type="text"
              inputMode="decimal"
              value={form.monto_impacto}
              onChange={e => set('monto_impacto', e.target.value.replace(/[^\d.]/g, ''))}
              disabled={!isEditing}
              className={disabledInput}
            />
          </Field>
          <Field label={t('anorm.field.descripcion')} span={2}>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} disabled={!isEditing} className={`${disabledInput} resize-none`} rows={3} required />
          </Field>
        </SectionBlock>

        <SectionBlock title={t('anorm.section.responsabilidad')}>
          <Field label={t('anorm.field.detectadoPor')}>
            <select value={form.detectado_por_id} onChange={e => set('detectado_por_id', e.target.value)} disabled={!isEditing} className={disabledInput}>
              <option value="">{t('common.select')}</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          </Field>
          <Field label={t('anorm.field.origen')}>
            <select value={form.origen_responsabilidad} onChange={e => set('origen_responsabilidad', e.target.value)} disabled={!isEditing} className={disabledInput}>
              <option value="">{t('common.select')}</option>
              {origenes.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
            </select>
          </Field>
          <Field label={t('anorm.field.responsableAsignado')} span={2}>
            <select value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)} disabled={!isEditing} className={disabledInput}>
              <option value="">{t('anorm.field.sinAsignar')}</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          </Field>
        </SectionBlock>

        <div className="flex justify-end gap-2 pt-2 border-t border-warm-100">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
          {!isEditing && !isCreateMode ? (
            <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-accent-700 bg-accent-50 hover:bg-accent-100 rounded-lg border border-accent-200 transition-colors">
              <Edit3 className="w-3.5 h-3.5" />
              {t('common.edit')}
            </button>
          ) : (
            <button type="submit" disabled={loading} className="btn-primary text-sm flex items-center gap-2">
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {t('common.save')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ── AnormEditModal ─────────────────────────────────────────────────────────────

function AnormEditModal({ id, codigos, usuarios, procesos, niveles, origenes, onClose, onSubmit, loading }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const { data, isLoading } = useQuery({ queryKey: ['anormalidad-detail', id], queryFn: () => getAnormalidad(id), enabled: backendOnline && !!id })
  const d = data?.data

  if (isLoading || !d) return (
    <Modal isOpen title={t('common.edit')} icon={Edit3} onClose={onClose} size="2xl">
      <div className="flex justify-center py-12"><LoadingSpinner /></div>
    </Modal>
  )

  const initial = {
    ...FORM_EMPTY,
    fecha_ocurrencia: d.fecha_ocurrencia ? new Date(d.fecha_ocurrencia).toISOString().slice(0, 16) : '',
    proceso: d.proceso || '',
    codigo_id: String(d.codigo_id || ''),
    codigo: d.codigo || '',
    nombre: d.nombre || '',
    nivel: d.nivel || '',
    cliente: d.cliente || '',
    almacen: d.almacen || '',
    contenedor_orden: d.contenedor_orden || '',
    sku: d.sku || '',
    ubicacion: d.ubicacion || '',
    cantidad_afectada: d.cantidad_afectada || '',
    monto_impacto: d.monto_impacto || '',
    descripcion: d.descripcion || '',
    detectado_por_id: d.detectado_por_id ? String(d.detectado_por_id) : '',
    detectado_por_nombre: d.detectado_por_nombre || '',
    origen_responsabilidad: d.origen_responsabilidad || '',
    responsable_id: d.responsable_id ? String(d.responsable_id) : '',
    accion_inmediata: d.accion_inmediata || '',
    causa_raiz: d.causa_raiz || '',
    accion_preventiva: d.accion_preventiva || '',
  }

  return (
    <AnormFormModal
      isOpen
      onClose={onClose}
      codigos={codigos}
      usuarios={usuarios}
      procesos={procesos}
      niveles={niveles}
      origenes={origenes}
      onSubmit={onSubmit}
      loading={loading}
      title={`${t('common.edit')} ${d.folio}`}
      initialData={initial}
    />
  )
}

// ── AnormDetailModal ───────────────────────────────────────────────────────────

function AnormDetailModal({ isOpen, onClose, detail: d, loading, canUpdate, canCreate, onChangeEstado, onEdit, onCrearMejora, creandoMejora }) {
  const [tab, setTab] = useState('detalle')
  const { t } = useI18nStore()

  const tabs = [
    { id: 'detalle', label: t('anorm.tab.detalle'), icon: FileText },
    { id: 'resolucion', label: t('anorm.tab.resolucion'), icon: CheckCircle2 },
    { id: 'historial', label: t('anorm.tab.historial'), icon: History },
    { id: 'mejoras', label: t('anorm.tab.mejoras'), icon: Target },
  ]

  if (!isOpen) return null

  const headerAction = (
    <div className="flex items-center gap-2">
      {d && <NivelChip nivel={d.nivel} />}
      {d && <EstadoChip estado={d.vencido && d.estado !== 'cerrado' ? 'vencido' : d.estado} />}
      {canUpdate && d && (
        <button onClick={onChangeEstado} className="btn-secondary text-xs flex items-center gap-1.5">
          <ArrowUpDown className="w-3 h-3" />
          {t('anorm.action.cambiarEstado')}
        </button>
      )}
      {d && onCrearMejora && (
        <button onClick={onCrearMejora} disabled={creandoMejora} className="btn-success text-xs flex items-center gap-1.5">
          {creandoMejora ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
          {t('anorm.action.crearMejora')}
        </button>
      )}
    </div>
  )

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={d?.folio || '...'}
      icon={AlertTriangle}
      size="xl"
      headerAction={headerAction}
      footer={canCreate && d ? (
        <button onClick={onEdit} className="btn-ghost text-xs flex items-center gap-1.5">
          <Edit3 className="w-3 h-3" />
          {t('common.edit')}
        </button>
      ) : null}
    >
      {loading || !d ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard label={t('anorm.field.proceso')} value={d.proceso} />
            <KpiCard label={t('anorm.field.cliente')} value={d.cliente || '—'} />
            <KpiCard label={t('anorm.field.responsable')} value={d.responsable_nombre || t('anorm.field.sinAsignar')} />
            <KpiCard label={t('anorm.field.dias')} value={`${d.dias_abierto ? Math.floor(d.dias_abierto) : 0}d`} danger={d.vencido && d.estado !== 'cerrado'} />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-warm-100 mb-4">
            {tabs.map(tb => {
              const Icon = tb.icon
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === tb.id ? 'border-primary-500 text-primary-700' : 'border-transparent text-warm-500 hover:text-warm-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tb.label}
                </button>
              )
            })}
          </div>

          {tab === 'detalle' && <TabDetalle d={d} t={t} />}
          {tab === 'resolucion' && <TabResolucion d={d} t={t} />}
          {tab === 'historial' && <TabHistorial historial={d.historial || []} t={t} />}
          {tab === 'mejoras' && <TabMejoras mejoras={d.mejoras_vinculadas || []} />}
        </>
      )}
    </Modal>
  )
}

function KpiCard({ label, value, danger }) {
  return (
    <div className={`rounded-xl p-3 border ${danger ? 'bg-danger-50 border-danger-200' : 'bg-warm-50 border-warm-100'}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-warm-400 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold truncate ${danger ? 'text-danger-700' : 'text-warm-800'}`}>{value}</p>
    </div>
  )
}

function TabDetalle({ d, t }) {
  const rows = [
    [t('anorm.field.folio'), d.folio],
    [t('anorm.field.fechaOcurrencia'), fmtDateTime(d.fecha_ocurrencia)],
    [t('anorm.field.proceso'), d.proceso],
    [t('anorm.field.codigo'), `${d.codigo} — ${d.nombre}`],
    [t('anorm.field.nivel'), d.nivel],
    [t('anorm.field.cliente'), d.cliente || '—'],
    [t('anorm.field.almacen'), d.almacen || '—'],
    [t('anorm.field.contenedor'), d.contenedor_orden || '—'],
    [t('anorm.field.sku'), d.sku || '—'],
    [t('anorm.field.ubicacion'), d.ubicacion || '—'],
    [t('anorm.field.cantidad'), d.cantidad_afectada ?? '—'],
    [t('anorm.field.monto'), d.monto_impacto ? `$${parseFloat(d.monto_impacto).toLocaleString()} MXN` : '—'],
    [t('anorm.field.origen'), d.origen_responsabilidad || '—'],
    [t('anorm.field.detectadoPor'), d.detectado_nombre || d.detectado_por_nombre || '—'],
    [t('anorm.field.responsable'), d.responsable_nombre || '—'],
  ]
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
        {rows.map(([label, val]) => (
          <div key={label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-warm-400">{label}</span>
            <span className="text-sm text-warm-800">{val}</span>
          </div>
        ))}
      </div>
      {d.descripcion && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-warm-400 mb-1">{t('common.description')}</p>
          <p className="text-sm text-warm-700 bg-warm-50 rounded-xl p-3 border border-warm-100">{d.descripcion}</p>
        </div>
      )}
    </div>
  )
}

function TabResolucion({ d, t }) {
  const fields = [
    [t('anorm.field.accionInmediata'), d.accion_inmediata],
    [t('anorm.field.causaRaiz'), d.causa_raiz],
    [t('anorm.field.accionPreventiva'), d.accion_preventiva],
    [t('anorm.field.fechaCierre'), d.fecha_cierre ? fmtDateTime(d.fecha_cierre) : null],
  ]
  return (
    <div className="space-y-4">
      {fields.map(([label, val]) => (
        <div key={label}>
          <p className="text-[10px] uppercase tracking-wider text-warm-400 mb-1">{label}</p>
          {val ? (
            <p className="text-sm text-warm-700 bg-warm-50 rounded-xl p-3 border border-warm-100">{val}</p>
          ) : (
            <p className="text-sm text-warm-300 italic">{t('anorm.field.sinRegistro')}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function TabHistorial({ historial, t }) {
  if (!historial.length) return <p className="text-sm text-warm-400 text-center py-8">{t('common.noData')}</p>
  return (
    <div className="space-y-2">
      {historial.map(h => (
        <div key={h.id} className="flex items-start gap-3 p-3 bg-warm-50 rounded-xl border border-warm-100">
          <div className="mt-0.5 w-2 h-2 rounded-full bg-primary-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-warm-700">{h.usuario_nombre || h.usuario_nombre_full || t('anorm.field.sistema')}</span>
              {h.estado_anterior && (
                <>
                  <EstadoChip estado={h.estado_anterior} />
                  <ChevronRight className="w-3 h-3 text-warm-400" />
                </>
              )}
              <EstadoChip estado={h.estado_nuevo} />
            </div>
            {h.nota && <p className="text-xs text-warm-500 mt-1">{h.nota}</p>}
            <p className="text-[10px] text-warm-400 mt-1">{fmtDateTime(h.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function TabMejoras({ mejoras }) {
  if (!mejoras.length) return <p className="text-sm text-warm-400 text-center py-8">{useI18nStore.getState().t('anorm.mejoras.emptyLinked')}</p>
  return (
    <div className="space-y-2">
      {mejoras.map((mejora) => (
        <div key={mejora.mejora_id} className="flex items-start gap-3 p-3 bg-warm-50 rounded-xl border border-warm-100">
          <div className="mt-0.5 w-8 h-8 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
            <Link2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-warm-800">{mejora.descripcion_problema}</p>
            <div className="mt-2">
              <EstadoChip estado={mejora.mejora_estado} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── CambiarEstadoModal ─────────────────────────────────────────────────────────

function CambiarEstadoModal({ estadoActual, onClose, onSubmit, loading }) {
  const { t } = useI18nStore()
  const [estado, setEstado] = useState('')
  const [nota, setNota] = useState('')

  const NEXT_ESTADOS = ['nuevo', 'en_proceso', 'cerrado'].filter(e => e !== estadoActual)

  return (
    <Modal isOpen onClose={onClose} title={t('anorm.action.cambiarEstado')} icon={ArrowUpDown} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.nuevoEstado')}</label>
          <select value={estado} onChange={e => setEstado(e.target.value)}
            className="w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300">
            <option value="">{t('common.select')}</option>
            {NEXT_ESTADOS.map(e => <option key={e} value={e}>{t(ESTADO_META[e]?.labelKey || e)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.nota')} ({t('common.optional')})</label>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3}
            className="w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none" />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
        <button
          onClick={() => onSubmit({ estado, nota })}
          disabled={!estado || loading}
          className="btn-primary text-sm flex items-center gap-2"
        >
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
