import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  Plus, Search, AlertTriangle, X,
  Download, Clock, CheckCircle2, AlertCircle,
  Eye, Pencil, Trash2, Calendar, User, MoreHorizontal,
  ChevronRight, FileText, History, Link2, RefreshCw, ArrowUpDown,
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
  deleteAnormalidad, changeEstado, getCodigos, getUsuarios,
} from '../services/anormalidadesService'

// ── Constants ────────────────────────────────────────────────────────────────

const NIVEL_META = {
  L1: { label: 'L1', cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500' },
  L2: { label: 'L2', cls: 'bg-warning-100 text-warning-700 border-warning-200', dot: 'bg-warning-500' },
  L3: { label: 'L3', cls: 'bg-danger-100 text-danger-700 border-danger-200', dot: 'bg-danger-500', pulse: true },
}

const ESTADO_META = {
  nuevo:      { label: 'Nuevo',      cls: 'bg-primary-100 text-primary-700 border-primary-200' },
  en_proceso: { label: 'En proceso', cls: 'bg-accent-100 text-accent-700 border-accent-200' },
  cerrado:    { label: 'Cerrado',    cls: 'bg-success-100 text-success-700 border-success-200' },
  vencido:    { label: 'Vencido',    cls: 'bg-danger-100 text-danger-700 border-danger-200' },
}

const PROCESOS = ['Recibo', 'Inventario', 'Picking', 'Salida', 'POD', 'Sistema']
const ORIGENES = ['Operativo', 'Cliente', 'Sistema', 'Proceso', 'Transporte', 'Proveedor']
const STATUS_TABS = ['todos', 'nuevo', 'en_proceso', 'cerrado', 'vencido']

const TH = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider text-warm-500'

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
  const m = ESTADO_META[estado] || ESTADO_META.nuevo
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>
      {m.label}
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
  const [appliedFilters, setAppliedFilters] = useState({})

  // Modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [estadoModal, setEstadoModal] = useState(null) // { id, estado_actual }

  const queryParams = useMemo(() => {
    const p = { page, limit: 20, search: search || undefined }
    if (activeTab !== 'todos') p.estado = activeTab
    return { ...p, ...appliedFilters }
  }, [page, search, activeTab, appliedFilters])

  const { data, isLoading } = useQuery({
    queryKey: ['anormalidades', queryParams],
    queryFn: () => listAnormalidades(queryParams),
    keepPreviousData: true,
    enabled: backendOnline,
  })

  const { data: codigosData } = useQuery({ queryKey: ['anorm-codigos'], queryFn: getCodigos, enabled: backendOnline })
  const { data: usuariosData } = useQuery({ queryKey: ['anorm-usuarios'], queryFn: getUsuarios, enabled: backendOnline })

  const codigos = codigosData?.data || []
  const usuarios = usuariosData?.data || []

  const rows = data?.data || []
  const total = data?.total || 0

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
    onSuccess: () => { qc.invalidateQueries(['anormalidades']); setCreateOpen(false); toast.success('Anormalidad registrada') },
    onError: (e) => toast.error(e?.response?.data?.error || 'Error al crear'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateAnormalidad(id, data),
    onSuccess: () => { qc.invalidateQueries(['anormalidades']); qc.invalidateQueries(['anormalidad-detail', editId]); setEditId(null); toast.success('Anormalidad actualizada') },
    onError: (e) => toast.error(e?.response?.data?.error || 'Error al actualizar'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteAnormalidad,
    onSuccess: () => { qc.invalidateQueries(['anormalidades']); setDeleteId(null); toast.success('Eliminado') },
    onError: (e) => toast.error(e?.response?.data?.error || 'Error al eliminar'),
  })

  const estadoMut = useMutation({
    mutationFn: ({ id, estado, nota }) => changeEstado(id, { estado, nota }),
    onSuccess: () => {
      qc.invalidateQueries(['anormalidades'])
      qc.invalidateQueries(['anormalidad-detail', estadoModal?.id])
      setEstadoModal(null)
      toast.success('Estado actualizado')
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Error'),
  })

  const applyFilters = () => {
    const f = {}
    if (fechaDesde) f.fecha_desde = fechaDesde
    if (fechaHasta) f.fecha_hasta = fechaHasta
    if (selectedProcesos.length) f.proceso = selectedProcesos.join(',')
    if (selectedNiveles.length) f.nivel = selectedNiveles.join(',')
    if (selectedResponsables.length) f.responsable_id = selectedResponsables.join(',')
    setAppliedFilters(f)
    setPage(1)
  }

  const clearFilters = () => {
    setFechaDesde('')
    setFechaHasta('')
    setSelectedProcesos([])
    setSelectedNiveles([])
    setSelectedResponsables([])
    setAppliedFilters({})
    setPage(1)
  }

  const hasActiveFilters = Object.keys(appliedFilters).length > 0

  const exportXlsx = useCallback(async () => {
    if (!canUpdate) return
    try {
      const all = await listAnormalidades({ ...queryParams, page: 1, limit: 9999 })
      const ws = XLSX.utils.json_to_sheet((all.data || []).map(r => ({
        Folio: r.folio,
        Fecha: fmtDateTime(r.fecha_ocurrencia),
        Proceso: r.proceso,
        Código: r.codigo,
        Nombre: r.nombre,
        Nivel: r.nivel,
        Estado: ESTADO_META[r.estado]?.label || r.estado,
        Cliente: r.cliente || '',
        Responsable: r.responsable_nombre || '',
        'Días abierto': r.dias_abierto ? Math.floor(r.dias_abierto) : 0,
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Anormalidades')
      XLSX.writeFile(wb, `anormalidades_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch { toast.error('Error al exportar') }
  }, [queryParams, canUpdate])

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('anorm.registro.title')}
        subtitle={t('anorm.registro.subtitle')}
        icon={<AlertTriangle className="w-5 h-5 text-warning-500" />}
      />

      {/* ── Sticky filter bar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">

        {/* Row 1: date range + shortcuts + export + new */}
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
            </div>
            {[{ label: t('common.today'), d: 0 }, { label: t('common.last7Days'), d: 7 }, { label: t('common.last30Days'), d: 30 }].map(({ label, d }) => (
              <button key={d}
                onClick={() => { const today = getToday(); setFechaDesde(d === 0 ? today : subtractDays(today, d)); setFechaHasta(today) }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
              >{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canUpdate && (
              <button onClick={exportXlsx} className="btn-success flex items-center gap-1.5 text-xs py-2">
                <Download className="w-3.5 h-3.5" />
                {t('common.export')}
              </button>
            )}
            {canCreate && (
              <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs py-2">
                <Plus className="w-3.5 h-3.5" />
                {t('anorm.registro.nueva')}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: filters + search + apply */}
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelect
            placeholder={t('anorm.field.proceso')}
            options={PROCESOS.map(p => ({ value: p, label: p }))}
            selected={selectedProcesos}
            onChange={setSelectedProcesos}
          />
          <MultiSelect
            placeholder={t('anorm.field.nivel')}
            options={['L1', 'L2', 'L3'].map(n => ({ value: n, label: n }))}
            selected={selectedNiveles}
            onChange={setSelectedNiveles}
          />
          <MultiSelect
            placeholder={t('anorm.field.responsable')}
            options={usuarios.map(u => ({ value: String(u.id), label: u.nombre_completo }))}
            selected={selectedResponsables}
            onChange={setSelectedResponsables}
          />
          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[200px] focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
            <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('anorm.registro.searchPlaceholder')}
              className="text-xs outline-none bg-transparent text-warm-700 flex-1" />
            {search && <button onClick={() => setSearch('')} className="text-warm-400 hover:text-warm-600"><X className="w-3 h-3" /></button>}
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
              <X className="w-3 h-3" /> {t('common.clear')}
            </button>
          )}
          <button onClick={applyFilters} className="btn-primary flex items-center gap-1.5 text-xs py-2 ml-auto">
            {t('common.apply')}
          </button>
        </div>
      </div>

      {/* ── Status tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-warm-100 bg-white px-5">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setPage(1) }}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-warm-500 hover:text-warm-700'
            }`}
          >
            {t(`anorm.estado.${tab}`)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className="bg-white rounded-2xl border border-warm-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-100">
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
                    <tr><td colSpan={9} className="text-center py-16 text-warm-400 text-sm">{t('common.noData')}</td></tr>
                  ) : rows.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => setDetailId(row.id)}
                      className="hover:bg-primary-50/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-primary-700">{row.folio}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-warm-600">{fmtDateTime(row.fecha_ocurrencia)}</td>
                      <td className="px-4 py-3 text-xs text-warm-700">{row.proceso}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-warm-800">{row.codigo}</div>
                        <div className="text-[10px] text-warm-400 truncate max-w-[120px]">{row.nombre}</div>
                      </td>
                      <td className="px-4 py-3"><NivelChip nivel={row.nivel} /></td>
                      <td className="px-4 py-3">
                        <EstadoChip estado={row.vencido && row.estado !== 'cerrado' ? 'vencido' : row.estado} />
                      </td>
                      <td className="px-4 py-3 text-xs text-warm-600">{row.responsable_nombre || <span className="text-warm-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${row.vencido && row.estado !== 'cerrado' ? 'text-danger-600' : 'text-warm-600'}`}>
                          {row.dias_abierto ? `${Math.floor(row.dias_abierto)}d` : '0d'}
                          {row.vencido && row.estado !== 'cerrado' && ' ⚠'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailId(row.id)} className="p-1.5 rounded-lg hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-colors" title={t('common.view')}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canCreate && (
                            <button onClick={() => setEditId(row.id)} className="p-1.5 rounded-lg hover:bg-accent-100 text-warm-400 hover:text-accent-600 transition-colors" title={t('common.edit')}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteId(row.id)} className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-400 hover:text-danger-600 transition-colors" title={t('common.delete')}>
                              <Trash2 className="w-3.5 h-3.5" />
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
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        codigos={codigos}
        usuarios={usuarios}
        onSubmit={(data) => createMut.mutate(data)}
        loading={createMut.isPending}
        title={t('anorm.registro.nueva')}
      />

      {/* Modal: edit */}
      {editId && (
        <AnormEditModal
          id={editId}
          codigos={codigos}
          usuarios={usuarios}
          onClose={() => setEditId(null)}
          onSubmit={(data) => updateMut.mutate({ id: editId, data })}
          loading={updateMut.isPending}
        />
      )}

      {/* Modal: detail */}
      <AnormDetailModal
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        detail={detail}
        loading={detailLoading}
        canUpdate={canUpdate}
        canCreate={canCreate}
        onChangeEstado={(estado) => setEstadoModal({ id: detailId, estado_actual: detail?.estado })}
        onEdit={() => { setEditId(detailId); setDetailId(null) }}
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

function AnormFormModal({ isOpen, onClose, codigos, usuarios, onSubmit, loading, title, initialData }) {
  const { t } = useI18nStore()
  const [form, setForm] = useState(initialData || { ...FORM_EMPTY, fecha_ocurrencia: new Date().toISOString().slice(0, 16) })

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
      set('nombre', found.nombre_es)
      if (!form.nivel) set('nivel', found.nivel_sugerido)
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

  const Section = ({ title: st, children }) => (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-500 mb-3 pb-1 border-b border-warm-100">{st}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )

  const Field = ({ label, span = 1, children }) => (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-warm-700 mb-1">{label}</label>
      {children}
    </div>
  )

  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'
  const sel = inp

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={AlertTriangle} size="2xl">
      <form onSubmit={handleSubmit}>
        <Section title={t('anorm.section.identificacion')}>
          <Field label={t('anorm.field.fechaOcurrencia')}>
            <input type="datetime-local" value={form.fecha_ocurrencia} onChange={e => set('fecha_ocurrencia', e.target.value)} className={inp} required />
          </Field>
          <Field label={t('anorm.field.proceso')}>
            <select value={form.proceso} onChange={e => set('proceso', e.target.value)} className={sel} required>
              <option value="">{t('common.select')}</option>
              {PROCESOS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={t('anorm.field.codigo')}>
            <select value={form.codigo_id} onChange={handleCodigoChange} className={sel}>
              <option value="">{t('common.select')}</option>
              {Object.entries(codigosPorProceso).map(([proc, codes]) => (
                <optgroup key={proc} label={proc}>
                  {codes.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre_es}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={t('anorm.field.nombre')}>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)} className={inp} required placeholder={t('anorm.field.nombrePlaceholder')} />
          </Field>
          <Field label={t('anorm.field.nivel')}>
            <select value={form.nivel} onChange={e => set('nivel', e.target.value)} className={sel} required>
              <option value="">{t('common.select')}</option>
              {['L1', 'L2', 'L3'].map(n => <option key={n} value={n}>{n} — {n === 'L1' ? t('anorm.nivel.l1') : n === 'L2' ? t('anorm.nivel.l2') : t('anorm.nivel.l3')}</option>)}
            </select>
          </Field>
        </Section>

        <Section title={t('anorm.section.contexto')}>
          <Field label={t('anorm.field.cliente')}>
            <input value={form.cliente} onChange={e => set('cliente', e.target.value)} className={inp} placeholder={t('anorm.field.clientePlaceholder')} />
          </Field>
          <Field label={t('anorm.field.almacen')}>
            <input value={form.almacen} onChange={e => set('almacen', e.target.value)} className={inp} />
          </Field>
          <Field label={t('anorm.field.contenedor')}>
            <input value={form.contenedor_orden} onChange={e => set('contenedor_orden', e.target.value)} className={inp} />
          </Field>
          <Field label={t('anorm.field.sku')}>
            <input value={form.sku} onChange={e => set('sku', e.target.value)} className={inp} />
          </Field>
          <Field label={t('anorm.field.ubicacion')}>
            <input value={form.ubicacion} onChange={e => set('ubicacion', e.target.value)} className={inp} />
          </Field>
          <Field label={t('anorm.field.cantidad')}>
            <input type="number" min="0" value={form.cantidad_afectada} onChange={e => set('cantidad_afectada', e.target.value)} className={inp} />
          </Field>
          <Field label={t('anorm.field.monto')}>
            <input type="number" min="0" step="0.01" value={form.monto_impacto} onChange={e => set('monto_impacto', e.target.value)} className={inp} />
          </Field>
          <Field label={t('anorm.field.descripcion')} span={2}>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} className={`${inp} resize-none`} rows={3} required />
          </Field>
        </Section>

        <Section title={t('anorm.section.responsabilidad')}>
          <Field label={t('anorm.field.detectadoPor')}>
            <select value={form.detectado_por_id} onChange={e => set('detectado_por_id', e.target.value)} className={sel}>
              <option value="">{t('common.select')}</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          </Field>
          <Field label={t('anorm.field.origen')}>
            <select value={form.origen_responsabilidad} onChange={e => set('origen_responsabilidad', e.target.value)} className={sel}>
              <option value="">{t('common.select')}</option>
              {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label={t('anorm.field.responsableAsignado')} span={2}>
            <select value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)} className={sel}>
              <option value="">{t('anorm.field.sinAsignar')}</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          </Field>
        </Section>

        <div className="flex justify-end gap-3 pt-2 border-t border-warm-100">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary text-sm flex items-center gap-2">
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── AnormEditModal ─────────────────────────────────────────────────────────────

function AnormEditModal({ id, codigos, usuarios, onClose, onSubmit, loading }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const { data, isLoading } = useQuery({ queryKey: ['anormalidad-detail', id], queryFn: () => getAnormalidad(id), enabled: backendOnline && !!id })
  const d = data?.data

  if (isLoading || !d) return (
    <Modal isOpen title={t('common.edit')} icon={Pencil} onClose={onClose} size="2xl">
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
      onSubmit={onSubmit}
      loading={loading}
      title={`${t('common.edit')} ${d.folio}`}
      initialData={initial}
    />
  )
}

// ── AnormDetailModal ───────────────────────────────────────────────────────────

function AnormDetailModal({ isOpen, onClose, detail: d, loading, canUpdate, canCreate, onChangeEstado, onEdit }) {
  const [tab, setTab] = useState('detalle')
  const { t } = useI18nStore()

  const tabs = [
    { id: 'detalle', label: t('anorm.tab.detalle'), icon: FileText },
    { id: 'resolucion', label: t('anorm.tab.resolucion'), icon: CheckCircle2 },
    { id: 'historial', label: t('anorm.tab.historial'), icon: History },
  ]

  if (!isOpen) return null

  const headerAction = (
    <div className="flex items-center gap-2">
      {d && <NivelChip nivel={d.nivel} />}
      {d && <EstadoChip estado={d.estado} />}
      {canUpdate && d && (
        <button onClick={onChangeEstado} className="btn-secondary text-xs flex items-center gap-1.5">
          <ArrowUpDown className="w-3 h-3" />
          {t('anorm.action.cambiarEstado')}
        </button>
      )}
      {canCreate && d && (
        <button onClick={onEdit} className="btn-ghost text-xs flex items-center gap-1.5">
          <Pencil className="w-3 h-3" />
          {t('common.edit')}
        </button>
      )}
    </div>
  )

  return (
    <Modal isOpen onClose={onClose} title={d?.folio || '...'} icon={AlertTriangle} size="2xl" headerAction={headerAction}>
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
            {NEXT_ESTADOS.map(e => <option key={e} value={e}>{ESTADO_META[e]?.label || e}</option>)}
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
