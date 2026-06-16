import { useEffect, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Target, CheckCircle2, Clock, Edit3, Eye, Link2, XCircle, Search, AlertTriangle, X, Trash2 } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import Header from '../../../core/components/layout/Header'
import MultiSelect from '../../../core/components/common/MultiSelect'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDate, fmtDateTime, getToday, subtractDays } from '../../../core/utils/dateFormat'
import {
  listMejoras, getMejora, createMejora, updateMejora, deleteMejora,
  listAnormalidades, vincularMejora, getUsuarios, getMejorasCandidatas,
  getProcesosConfig, getOrigenesConfig,
} from '../services/anormalidadesService'

const ESTADO_META = {
  nuevo:      { labelKey: 'anorm.estado.nuevo',      cls: 'bg-primary-100 text-primary-700 border-primary-200' },
  en_proceso: { labelKey: 'anorm.estado.en_proceso', cls: 'bg-accent-100 text-accent-700 border-accent-200' },
  cerrado:    { labelKey: 'anorm.estado.cerrado',    cls: 'bg-success-100 text-success-700 border-success-200' },
}

function EstadoChip({ estado }) {
  const { t } = useI18nStore()
  const m = ESTADO_META[estado] || ESTADO_META.nuevo
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{t(m.labelKey)}</span>
}

const FORM_EMPTY = {
  descripcion_problema: '',
  ocurrencias: 1,
  proceso: '',
  origen: '',
  causa_raiz_principal: '',
  accion_mejora: '',
  responsable_id: '',
  fecha_limite: '',
  estado: 'nuevo',
  resultado_revision: '',
}

export default function AnormMejoras() {
  const { hasPermission } = useAuthStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const toast = useToastStore()
  const { t } = useI18nStore()
  const qc = useQueryClient()

  const canCreate = hasPermission('anormalidades.mejoras', 'crear')
  const canUpdate = hasPermission('anormalidades.mejoras', 'actualizar')
  const canDelete = hasPermission('anormalidades.mejoras', 'eliminar')

  const [page, setPage] = useState(1)
  const [estadoFilter, setEstadoFilter] = useState('')
  const [search, setSearch] = useState('')
  const [soloVencidas, setSoloVencidas] = useState(false)
  const [soloVinculadas, setSoloVinculadas] = useState(false)
  const [sinVinculos, setSinVinculos] = useState(false)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [selectedProcesos, setSelectedProcesos] = useState([])
  const [selectedOrigenes, setSelectedOrigenes] = useState([])
  const [selectedResponsables, setSelectedResponsables] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [vincularMejoraId, setVincularMejoraId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const queryParams = useMemo(() => {
    const p = { page, limit: 20, search: search || undefined }
    if (estadoFilter) p.estado = estadoFilter
    if (soloVencidas) p.vencidas = true
    if (soloVinculadas) p.vinculadas = true
    if (sinVinculos) p.sin_vinculos = true
    if (fechaDesde) p.fecha_desde = fechaDesde
    if (fechaHasta) p.fecha_hasta = fechaHasta
    if (selectedProcesos.length) p.proceso = selectedProcesos.join(',')
    if (selectedOrigenes.length) p.origen = selectedOrigenes.join(',')
    if (selectedResponsables.length) p.responsable_id = selectedResponsables.join(',')
    return p
  }, [page, search, estadoFilter, soloVencidas, soloVinculadas, sinVinculos, fechaDesde, fechaHasta, selectedProcesos, selectedOrigenes, selectedResponsables])

  const { data, isLoading } = useQuery({
    queryKey: ['anorm-mejoras', queryParams],
    queryFn: () => listMejoras(queryParams),
    keepPreviousData: true,
    enabled: backendOnline,
  })
  const { data: candidatasData } = useQuery({
    queryKey: ['anorm-mejoras-candidatas'],
    queryFn: () => getMejorasCandidatas(),
    enabled: backendOnline,
  })

  const { data: usuariosData } = useQuery({ queryKey: ['anorm-usuarios'], queryFn: getUsuarios, enabled: backendOnline })
  const { data: procesosData } = useQuery({ queryKey: ['anorm-procesos-config'], queryFn: getProcesosConfig, enabled: backendOnline })
  const { data: origenesData } = useQuery({ queryKey: ['anorm-origenes-config'], queryFn: getOrigenesConfig, enabled: backendOnline })
  const usuarios = usuariosData?.data || []
  const procesos = (procesosData?.data || []).filter(item => item.activo)
  const origenes = (origenesData?.data || []).filter(item => item.activo)
  const responsableOptions = usuarios.map(u => ({ value: String(u.id), label: u.nombre_completo }))
  const procesoOptions = procesos.map(item => ({ value: item.nombre, label: item.nombre }))
  const origenOptions = origenes.map(item => ({ value: item.nombre, label: item.nombre }))

  const rows = data?.data || []
  const total = data?.total || 0
  const candidatas = candidatasData?.data || []

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['anorm-mejora-detail', detailId],
    queryFn: () => getMejora(detailId),
    enabled: backendOnline && !!detailId,
  })
  const detail = detailData?.data

  const createMut = useMutation({
    mutationFn: createMejora,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anorm-mejoras'] }); setCreateOpen(false); toast.success(t('anorm.mejoras.created')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateMejora(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anorm-mejoras'] }); qc.invalidateQueries({ queryKey: ['anorm-mejora-detail', editId] }); setEditId(null); toast.success(t('common.saved')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const vincularMut = useMutation({
    mutationFn: ({ mejora_id, anorm_id }) => vincularMejora(mejora_id, anorm_id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anorm-mejora-detail', vincularMejoraId] }); setVincularMejoraId(null); toast.success(t('anorm.mejoras.vinculado')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const deleteMut = useMutation({
    mutationFn: deleteMejora,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anorm-mejoras'] }); setDeleteId(null); toast.success(t('common.deleted')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'
  const hasFilters = !!(search || estadoFilter || soloVencidas || soloVinculadas || sinVinculos || fechaDesde || fechaHasta || selectedProcesos.length || selectedOrigenes.length || selectedResponsables.length)

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('anorm.mejoras.title')}
        subtitle={t('anorm.mejoras.subtitle')}
        icon={<Target className="w-5 h-5 text-accent-500" />}
      />

      <div className="sticky top-[3.5rem] z-[20] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5">
        <div className="space-y-2">
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
              <button
                key={d}
                onClick={() => { const today = getToday(); setFechaDesde(d === 0 ? today : subtractDays(today, d)); setFechaHasta(today) }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => { setSoloVencidas(v => !v); setPage(1) }}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                soloVencidas ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-warm-200 bg-white text-warm-600'
              }`}
            >
              {t('anorm.mejoras.onlyOverdue')}
            </button>
            <button
              onClick={() => { setSoloVinculadas(v => !v); if (sinVinculos) setSinVinculos(false); setPage(1) }}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                soloVinculadas ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-warm-200 bg-white text-warm-600'
              }`}
            >
              {t('anorm.mejoras.withLinks')}
            </button>
            <button
              onClick={() => { setSinVinculos(v => !v); if (soloVinculadas) setSoloVinculadas(false); setPage(1) }}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                sinVinculos ? 'border-warning-300 bg-warning-50 text-warning-700' : 'border-warm-200 bg-white text-warm-600'
              }`}
            >
              {t('anorm.mejoras.withoutLinks')}
            </button>
            {canCreate && (
              <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs ml-auto">
                <Plus className="w-3.5 h-3.5" />
                {t('anorm.mejoras.nueva')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <MultiSelect
              selected={selectedProcesos}
              onChange={(v) => { setSelectedProcesos(v); setPage(1) }}
              options={procesoOptions}
              placeholder={t('anorm.field.proceso')}
            />
            <MultiSelect
              selected={selectedOrigenes}
              onChange={(v) => { setSelectedOrigenes(v); setPage(1) }}
              options={origenOptions}
              placeholder={t('anorm.field.origen')}
            />
            <MultiSelect
              selected={selectedResponsables}
              onChange={(v) => { setSelectedResponsables(v); setPage(1) }}
              options={responsableOptions}
              placeholder={t('anorm.field.responsable')}
            />
            <div className="flex items-center gap-2 rounded-xl border border-warm-200 bg-white px-3 py-2 min-w-[240px] flex-1">
              <Search className="w-3.5 h-3.5 text-warm-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder={t('anorm.mejoras.searchPlaceholder')}
                className="w-full bg-transparent text-sm outline-none text-warm-700"
              />
            </div>
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch('')
                  setEstadoFilter('')
                  setSoloVencidas(false)
                  setSoloVinculadas(false)
                  setSinVinculos(false)
                  setFechaDesde('')
                  setFechaHasta('')
                  setSelectedProcesos([])
                  setSelectedOrigenes([])
                  setSelectedResponsables([])
                  setPage(1)
                }}
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
              >
                <X className="w-3 h-3" /> {t('common.clear')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sticky top-[7rem] z-[4] border-b border-warm-100 bg-white px-5">
        <div className="flex gap-0">
          {['', 'nuevo', 'en_proceso', 'cerrado'].map(e => (
            <button
              key={e}
              onClick={() => { setEstadoFilter(e); setPage(1) }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                estadoFilter === e
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-warm-400 hover:text-warm-600'
              }`}
            >
              {e ? t(ESTADO_META[e]?.labelKey || e) : t('common.all')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4 space-y-4">

        {candidatas.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-warm-500" />
              <h3 className="text-sm font-semibold text-warm-800">{t('anorm.mejoras.autoCandidates')}</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {candidatas.slice(0, 4).map((item) => (
                <div key={item.codigo} className="rounded-xl border border-warm-100 bg-warm-50 px-3 py-2">
                  <p className="text-sm font-semibold text-warm-800">{item.codigo} · {item.nombre}</p>
                  <p className="text-xs text-warm-500">
                    {item.proceso} · {t('anorm.mejoras.occurrencesCount').replace('{n}', item.ocurrencias)} · {t('anorm.mejoras.withoutLinkedImprovement').replace('{n}', item.sin_mejora)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className="card overflow-hidden shadow-sm table-shell">
            <div className="overflow-x-auto table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-warm-50 border-b border-warm-100">
                  {[t('common.date'), t('anorm.field.proceso'), t('anorm.field.origen'), t('anorm.mejoras.problema'), t('anorm.mejoras.ocurrencias'), t('anorm.field.responsable'), t('anorm.mejoras.fechaLimite'), t('common.status'), t('common.actions')].map(h => (
                    <th key={h} className="table-header">
                      <span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-warm-500">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-16 text-warm-400 text-sm">{t('common.noData')}</td></tr>
                ) : rows.map(row => (
                  <tr key={row.id} onClick={() => setDetailId(row.id)} className="table-row cursor-pointer transition-colors">
                    <td className="table-cell text-xs text-warm-600">{fmtDate(row.created_at)}</td>
                    <td className="table-cell text-xs text-warm-700">{row.proceso || '—'}</td>
                    <td className="table-cell text-xs text-warm-600">{row.origen || '—'}</td>
                    <td className="table-cell">
                      <p className="text-sm font-medium text-warm-800 line-clamp-2 max-w-[240px]">{row.descripcion_problema}</p>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-xs font-semibold text-accent-700">{row.ocurrencias}</span>
                    </td>
                    <td className="table-cell text-xs text-warm-600">{row.responsable_nombre || '—'}</td>
                    <td className="table-cell text-xs text-warm-600">{row.fecha_limite ? fmtDate(row.fecha_limite) : '—'}</td>
                    <td className="table-cell"><EstadoChip estado={row.estado} /></td>
                    <td className="table-cell" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetailId(row.id)} className="p-1.5 rounded-lg hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-colors"><Eye className="w-4 h-4" /></button>
                        {canUpdate && <button onClick={() => setEditId(row.id)} className="p-1.5 rounded-lg hover:bg-accent-100 text-warm-400 hover:text-accent-600 transition-colors"><Edit3 className="w-4 h-4" /></button>}
                        {canUpdate && <button onClick={() => setVincularMejoraId(row.id)} className="p-1.5 rounded-lg hover:bg-success-100 text-warm-400 hover:text-success-600 transition-colors" title={t('anorm.mejoras.vincular')}><Link2 className="w-4 h-4" /></button>}
                        {canDelete && <button onClick={() => setDeleteId(row.id)} className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-400 hover:text-danger-600 transition-colors" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <TablePagination page={page} limit={20} total={total} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Create */}
      <MejoraFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        usuarios={usuarios}
        procesos={procesos}
        origenes={origenes}
        onSubmit={d => createMut.mutate(d)}
        loading={createMut.isPending}
        title={t('anorm.mejoras.nueva')}
      />

      {/* Edit */}
      {editId && (
        <MejoraEditModal
          id={editId}
          usuarios={usuarios}
          procesos={procesos}
          origenes={origenes}
          onClose={() => setEditId(null)}
          onSubmit={d => updateMut.mutate({ id: editId, data: d })}
          loading={updateMut.isPending}
        />
      )}

      {/* Detail */}
      <Modal isOpen={!!detailId} onClose={() => setDetailId(null)} title={t('anorm.mejoras.detalle')} icon={Target} size="xl">
        {detailLoading || !detail ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2"><EstadoChip estado={detail.estado} /></div>
            <InfoRow label={t('anorm.field.proceso')} value={detail.proceso || '—'} />
            <InfoRow label={t('anorm.field.origen')} value={detail.origen || '—'} />
            <InfoRow label={t('anorm.mejoras.problema')} value={detail.descripcion_problema} />
            <InfoRow label={t('anorm.mejoras.ocurrencias')} value={detail.ocurrencias} />
            <InfoRow label={t('anorm.mejoras.causaRaiz')} value={detail.causa_raiz_principal || '—'} />
            <InfoRow label={t('anorm.mejoras.accion')} value={detail.accion_mejora} />
            <InfoRow label={t('anorm.field.responsable')} value={detail.responsable_nombre || '—'} />
            <InfoRow label={t('anorm.mejoras.fechaLimite')} value={detail.fecha_limite ? fmtDate(detail.fecha_limite) : '—'} />
            {detail.resultado_revision && <InfoRow label={t('anorm.mejoras.resultado')} value={detail.resultado_revision} />}
            {detail.anormalidades_vinculadas?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-warm-500 mb-2">{t('anorm.mejoras.anormsVinculadas')}</p>
                <div className="space-y-1">
                  {detail.anormalidades_vinculadas.map(a => (
                    <div key={a.anormalidad_id} className="flex items-center gap-2 text-xs text-warm-700 bg-warm-50 rounded-lg px-3 py-1.5">
                      <span className="font-mono font-semibold text-primary-700">{a.folio}</span>
                      <span className="text-warm-400">·</span>
                      <span>{a.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {canUpdate && (
              <div className="flex justify-end gap-3 pt-4 border-t border-warm-100">
                <button
                  type="button"
                  onClick={() => { setDetailId(null); setEditId(detailId) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-warning-700 bg-warning-50 hover:bg-warning-100 rounded-lg border border-warning-200 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {t('common.edit')}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Vincular */}
      {vincularMejoraId && (
        <VincularModal
          mejoraId={vincularMejoraId}
          onClose={() => setVincularMejoraId(null)}
          onVincular={(anorm_id) => vincularMut.mutate({ mejora_id: vincularMejoraId, anorm_id })}
          loading={vincularMut.isPending}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <Modal isOpen onClose={() => setDeleteId(null)} title={t('anorm.delete.title')} icon={Trash2} size="sm">
          <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-warning-700">{t('anorm.config.deleteCatalogWarning')}</p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteId(null)} className="btn-secondary text-sm">{t('common.cancel')}</button>
            <button
              onClick={() => deleteMut.mutate(deleteId)}
              disabled={deleteMut.isPending}
              className="btn-danger text-sm inline-flex items-center gap-2"
            >
              {deleteMut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {t('common.delete')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-warm-400 mb-0.5">{label}</p>
      <p className="text-sm text-warm-800">{value}</p>
    </div>
  )
}

function MejoraFormModal({ isOpen, onClose, usuarios, procesos, origenes, onSubmit, loading, title, initialData }) {
  const { t } = useI18nStore()
  const [form, setForm] = useState(initialData || { ...FORM_EMPTY })
  const [isEditing, setIsEditing] = useState(!initialData)
  const isCreateMode = !initialData
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'

  useEffect(() => {
    setForm(initialData || { ...FORM_EMPTY })
    setIsEditing(!initialData)
  }, [initialData, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(form)
  }

  const disabledInput = `${inp} disabled:opacity-60 disabled:bg-warm-50 disabled:cursor-not-allowed`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={Target} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.proceso')} *</label>
            <select value={form.proceso} onChange={e => set('proceso', e.target.value)} disabled={!isEditing} className={disabledInput} required>
              <option value="">{t('common.select')}</option>
              {procesos.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.origen')}</label>
            <select value={form.origen} onChange={e => set('origen', e.target.value)} disabled={!isEditing} className={disabledInput}>
              <option value="">{t('common.select')}</option>
              {origenes.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.problema')} *</label>
          <textarea value={form.descripcion_problema} onChange={e => set('descripcion_problema', e.target.value)} disabled={!isEditing} className={`${disabledInput} resize-none`} rows={3} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.ocurrencias')}</label>
            <input type="number" min="1" value={form.ocurrencias} onChange={e => set('ocurrencias', e.target.value)} disabled={!isEditing} className={disabledInput} />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.fechaLimite')}</label>
            <input type="date" value={form.fecha_limite} onChange={e => set('fecha_limite', e.target.value)} disabled={!isEditing} className={disabledInput} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.causaRaiz')}</label>
          <textarea value={form.causa_raiz_principal} onChange={e => set('causa_raiz_principal', e.target.value)} disabled={!isEditing} className={`${disabledInput} resize-none`} rows={2} />
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.accion')} *</label>
          <textarea value={form.accion_mejora} onChange={e => set('accion_mejora', e.target.value)} disabled={!isEditing} className={`${disabledInput} resize-none`} rows={3} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.responsable')}</label>
            <select value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)} disabled={!isEditing} className={disabledInput}>
              <option value="">{t('anorm.field.sinAsignar')}</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.status')}</label>
            <select value={form.estado} onChange={e => set('estado', e.target.value)} disabled={!isEditing} className={disabledInput}>
              {['nuevo', 'en_proceso', 'cerrado'].map(e => <option key={e} value={e}>{t(ESTADO_META[e]?.labelKey || e)}</option>)}
            </select>
          </div>
        </div>
        {form.estado === 'cerrado' && (
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.resultado')}</label>
            <textarea value={form.resultado_revision} onChange={e => set('resultado_revision', e.target.value)} disabled={!isEditing} className={`${disabledInput} resize-none`} rows={2} />
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2 border-t border-warm-100">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
          {!isEditing && !isCreateMode ? (
            <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-warning-700 bg-warning-50 hover:bg-warning-100 rounded-lg border border-warning-200 transition-colors">
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

function MejoraEditModal({ id, usuarios, procesos, origenes, onClose, onSubmit, loading }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const { data, isLoading } = useQuery({ queryKey: ['anorm-mejora-detail', id], queryFn: () => getMejora(id), enabled: backendOnline && !!id })
  const d = data?.data
  if (isLoading || !d) return (
    <Modal isOpen title={t('common.edit')} icon={Edit3} onClose={onClose} size="lg">
      <div className="flex justify-center py-12"><LoadingSpinner /></div>
    </Modal>
  )
  const initial = {
    descripcion_problema: d.descripcion_problema || '',
    ocurrencias: d.ocurrencias || 1,
    proceso: d.proceso || '',
    origen: d.origen || '',
    causa_raiz_principal: d.causa_raiz_principal || '',
    accion_mejora: d.accion_mejora || '',
    responsable_id: d.responsable_id ? String(d.responsable_id) : '',
    fecha_limite: d.fecha_limite ? d.fecha_limite.slice(0, 10) : '',
    estado: d.estado || 'nuevo',
    resultado_revision: d.resultado_revision || '',
  }
  return <MejoraFormModal isOpen onClose={onClose} usuarios={usuarios} procesos={procesos} origenes={origenes} onSubmit={onSubmit} loading={loading} title={`${t('common.edit')} — ${t('anorm.mejoras.title')}`} initialData={initial} />
}

function VincularModal({ mejoraId, onClose, onVincular, loading }) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const { data } = useQuery({
    queryKey: ['anorm-list-for-vincular', search],
    queryFn: () => listAnormalidades({ search: search || undefined, limit: 10 }),
    enabled: search.length >= 2 || !search,
  })

  const rows = data?.data || []

  return (
    <Modal isOpen onClose={onClose} title={t('anorm.mejoras.vincular')} icon={Link2} size="md">
      <div className="space-y-3">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('anorm.registro.searchPlaceholder')}
          className="w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {rows.map(a => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors border ${
                selected?.id === a.id
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'bg-white border-warm-100 hover:bg-warm-50 text-warm-700'
              }`}
            >
              <span className="font-mono font-semibold mr-2">{a.folio}</span>
              <span className="text-xs">{a.nombre}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <button onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
        <button
          onClick={() => selected && onVincular(selected.id)}
          disabled={!selected || loading}
          className="btn-primary text-sm flex items-center gap-2"
        >
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {t('anorm.mejoras.vincular')}
        </button>
      </div>
    </Modal>
  )
}
