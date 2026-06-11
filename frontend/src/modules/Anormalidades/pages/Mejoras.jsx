import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Target, CheckCircle2, Clock, Pencil, Eye, Link2, XCircle } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDate, fmtDateTime } from '../../../core/utils/dateFormat'
import {
  listMejoras, getMejora, createMejora, updateMejora,
  listAnormalidades, vincularMejora, getUsuarios,
} from '../services/anormalidadesService'

const ESTADO_META = {
  nuevo:      { label: 'Nuevo',      cls: 'bg-primary-100 text-primary-700 border-primary-200' },
  en_proceso: { label: 'En proceso', cls: 'bg-accent-100 text-accent-700 border-accent-200' },
  cerrado:    { label: 'Cerrado',    cls: 'bg-success-100 text-success-700 border-success-200' },
}

function EstadoChip({ estado }) {
  const m = ESTADO_META[estado] || ESTADO_META.nuevo
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{m.label}</span>
}

const FORM_EMPTY = {
  descripcion_problema: '',
  ocurrencias: 1,
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

  const canUpdate = hasPermission('anormalidades.mejoras', 'actualizar')

  const [page, setPage] = useState(1)
  const [estadoFilter, setEstadoFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [vincularMejoraId, setVincularMejoraId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['anorm-mejoras', page, estadoFilter],
    queryFn: () => listMejoras({ page, limit: 20, estado: estadoFilter || undefined }),
    keepPreviousData: true,
    enabled: backendOnline,
  })

  const { data: usuariosData } = useQuery({ queryKey: ['anorm-usuarios'], queryFn: getUsuarios, enabled: backendOnline })
  const usuarios = usuariosData?.data || []

  const rows = data?.data || []
  const total = data?.total || 0

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['anorm-mejora-detail', detailId],
    queryFn: () => getMejora(detailId),
    enabled: backendOnline && !!detailId,
  })
  const detail = detailData?.data

  const createMut = useMutation({
    mutationFn: createMejora,
    onSuccess: () => { qc.invalidateQueries(['anorm-mejoras']); setCreateOpen(false); toast.success(t('anorm.mejoras.created')) },
    onError: e => toast.error(e?.response?.data?.error || 'Error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateMejora(id, data),
    onSuccess: () => { qc.invalidateQueries(['anorm-mejoras']); qc.invalidateQueries(['anorm-mejora-detail', editId]); setEditId(null); toast.success(t('common.saved')) },
    onError: e => toast.error(e?.response?.data?.error || 'Error'),
  })

  const vincularMut = useMutation({
    mutationFn: ({ mejora_id, anorm_id }) => vincularMejora(mejora_id, anorm_id),
    onSuccess: () => { qc.invalidateQueries(['anorm-mejora-detail', vincularMejoraId]); setVincularMejoraId(null); toast.success(t('anorm.mejoras.vinculado')) },
    onError: e => toast.error(e?.response?.data?.error || 'Error'),
  })

  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'

  return (
    <div className="flex flex-col h-full">
      <Header title={t('anorm.mejoras.title')} subtitle={t('anorm.mejoras.subtitle')} icon={<Target className="w-5 h-5 text-accent-500" />} />

      <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-warm-100 rounded-xl p-1">
            {['', 'nuevo', 'en_proceso', 'cerrado'].map(e => (
              <button key={e} onClick={() => { setEstadoFilter(e); setPage(1) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${estadoFilter === e ? 'bg-white text-primary-700 shadow-sm' : 'text-warm-600 hover:text-warm-800'}`}>
                {e ? (ESTADO_META[e]?.label || e) : t('common.all')}
              </button>
            ))}
          </div>
          {canUpdate && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs ml-auto">
              <Plus className="w-3.5 h-3.5" />
              {t('anorm.mejoras.nueva')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className="bg-white rounded-2xl border border-warm-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100">
                  {[t('common.date'), t('anorm.mejoras.problema'), t('anorm.mejoras.ocurrencias'), t('anorm.field.responsable'), t('anorm.mejoras.fechaLimite'), t('common.status'), t('common.actions')].map(h => (
                    <th key={h} className="table-header">
                      <span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-warm-500">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16 text-warm-400 text-sm">{t('common.noData')}</td></tr>
                ) : rows.map(row => (
                  <tr key={row.id} onClick={() => setDetailId(row.id)} className="hover:bg-primary-50/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-xs text-warm-600">{fmtDate(row.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-warm-800 line-clamp-2 max-w-[240px]">{row.descripcion_problema}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold text-accent-700">{row.ocurrencias}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-warm-600">{row.responsable_nombre || '—'}</td>
                    <td className="px-4 py-3 text-xs text-warm-600">{row.fecha_limite ? fmtDate(row.fecha_limite) : '—'}</td>
                    <td className="px-4 py-3"><EstadoChip estado={row.estado} /></td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetailId(row.id)} className="p-1.5 rounded-lg hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                        {canUpdate && <button onClick={() => setEditId(row.id)} className="p-1.5 rounded-lg hover:bg-accent-100 text-warm-400 hover:text-accent-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>}
                        {canUpdate && <button onClick={() => setVincularMejoraId(row.id)} className="p-1.5 rounded-lg hover:bg-success-100 text-warm-400 hover:text-success-600 transition-colors" title={t('anorm.mejoras.vincular')}><Link2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination page={page} limit={20} total={total} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Create */}
      <MejoraFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        usuarios={usuarios}
        onSubmit={d => createMut.mutate(d)}
        loading={createMut.isPending}
        title={t('anorm.mejoras.nueva')}
      />

      {/* Edit */}
      {editId && (
        <MejoraEditModal
          id={editId}
          usuarios={usuarios}
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

function MejoraFormModal({ isOpen, onClose, usuarios, onSubmit, loading, title, initialData }) {
  const { t } = useI18nStore()
  const [form, setForm] = useState(initialData || { ...FORM_EMPTY })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={Target} size="lg">
      <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.problema')} *</label>
          <textarea value={form.descripcion_problema} onChange={e => set('descripcion_problema', e.target.value)} className={`${inp} resize-none`} rows={3} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.ocurrencias')}</label>
            <input type="number" min="1" value={form.ocurrencias} onChange={e => set('ocurrencias', e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.fechaLimite')}</label>
            <input type="date" value={form.fecha_limite} onChange={e => set('fecha_limite', e.target.value)} className={inp} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.causaRaiz')}</label>
          <textarea value={form.causa_raiz_principal} onChange={e => set('causa_raiz_principal', e.target.value)} className={`${inp} resize-none`} rows={2} />
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.accion')} *</label>
          <textarea value={form.accion_mejora} onChange={e => set('accion_mejora', e.target.value)} className={`${inp} resize-none`} rows={3} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.responsable')}</label>
            <select value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)} className={inp}>
              <option value="">{t('anorm.field.sinAsignar')}</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.status')}</label>
            <select value={form.estado} onChange={e => set('estado', e.target.value)} className={inp}>
              {['nuevo', 'en_proceso', 'cerrado'].map(e => <option key={e} value={e}>{ESTADO_META[e]?.label || e}</option>)}
            </select>
          </div>
        </div>
        {form.estado === 'cerrado' && (
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.mejoras.resultado')}</label>
            <textarea value={form.resultado_revision} onChange={e => set('resultado_revision', e.target.value)} className={`${inp} resize-none`} rows={2} />
          </div>
        )}
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

function MejoraEditModal({ id, usuarios, onClose, onSubmit, loading }) {
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const { data, isLoading } = useQuery({ queryKey: ['anorm-mejora-detail', id], queryFn: () => getMejora(id), enabled: backendOnline && !!id })
  const d = data?.data
  if (isLoading || !d) return (
    <Modal isOpen title={t('common.edit')} icon={Pencil} onClose={onClose} size="lg">
      <div className="flex justify-center py-12"><LoadingSpinner /></div>
    </Modal>
  )
  const initial = {
    descripcion_problema: d.descripcion_problema || '',
    ocurrencias: d.ocurrencias || 1,
    causa_raiz_principal: d.causa_raiz_principal || '',
    accion_mejora: d.accion_mejora || '',
    responsable_id: d.responsable_id ? String(d.responsable_id) : '',
    fecha_limite: d.fecha_limite ? d.fecha_limite.slice(0, 10) : '',
    estado: d.estado || 'nuevo',
    resultado_revision: d.resultado_revision || '',
  }
  return <MejoraFormModal isOpen onClose={onClose} usuarios={usuarios} onSubmit={onSubmit} loading={loading} title={`${t('common.edit')} — ${t('anorm.mejoras.title')}`} initialData={initial} />
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
