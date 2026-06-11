import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Plus, RefreshCw, Pencil, Trash2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getCodigos, createCodigo, updateCodigo, deleteCodigo, getTiempos, updateTiempos } from '../services/anormalidadesService'

const PROCESOS = ['Recibo', 'Inventario', 'Picking', 'Salida', 'POD', 'Sistema']
const NIVELES = ['L1', 'L2', 'L3']

const CODIGO_EMPTY = { codigo: '', nombre_es: '', nombre_zh: '', proceso: '', nivel_sugerido: 'L2', descripcion: '' }

export default function AnormConfiguracion() {
  const toast = useToastStore()
  const { t } = useI18nStore()
  const qc = useQueryClient()

  const [procesoFilter, setProcesoFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editCodigo, setEditCodigo] = useState(null)
  const [deleteCod, setDeleteCod] = useState(null)

  const { data: codigosData, isLoading } = useQuery({ queryKey: ['anorm-codigos-config'], queryFn: getCodigos })
  const { data: tiemposData } = useQuery({ queryKey: ['anorm-tiempos'], queryFn: getTiempos })

  const codigos = codigosData?.data || []
  const tiempos = tiemposData?.data || { horas_limite_l1: 48, horas_limite_l2: 24, horas_limite_l3: 4 }

  const filtered = procesoFilter ? codigos.filter(c => c.proceso === procesoFilter) : codigos

  const createMut = useMutation({
    mutationFn: createCodigo,
    onSuccess: () => { qc.invalidateQueries(['anorm-codigos-config']); qc.invalidateQueries(['anorm-codigos']); setCreateOpen(false); toast.success(t('anorm.config.codigoCreado')) },
    onError: e => toast.error(e?.response?.data?.error || 'Error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateCodigo(id, data),
    onSuccess: () => { qc.invalidateQueries(['anorm-codigos-config']); qc.invalidateQueries(['anorm-codigos']); setEditCodigo(null); toast.success(t('common.saved')) },
    onError: e => toast.error(e?.response?.data?.error || 'Error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteCodigo,
    onSuccess: () => { qc.invalidateQueries(['anorm-codigos-config']); qc.invalidateQueries(['anorm-codigos']); setDeleteCod(null); toast.success(t('common.deleted')) },
    onError: e => toast.error(e?.response?.data?.error || 'Error al eliminar — los códigos base no pueden eliminarse'),
  })

  const tiemposMut = useMutation({
    mutationFn: updateTiempos,
    onSuccess: () => { qc.invalidateQueries(['anorm-tiempos']); toast.success(t('anorm.config.tiemposGuardados')) },
    onError: e => toast.error(e?.response?.data?.error || 'Error'),
  })

  const toggleActivo = (c) => updateMut.mutate({ id: c.id, data: { activo: !c.activo } })

  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'

  return (
    <div className="flex flex-col h-full">
      <Header title={t('anorm.config.title')} subtitle={t('anorm.config.subtitle')} icon={<Settings className="w-5 h-5 text-warm-500" />} />

      <div className="flex-1 overflow-auto px-6 py-4 space-y-6">

        {/* Tiempos límite */}
        <div className="bg-white rounded-2xl border border-warm-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-warm-800 mb-4">{t('anorm.config.tiemposTitle')}</h2>
          <TiemposForm tiempos={tiempos} onSubmit={d => tiemposMut.mutate(d)} loading={tiemposMut.isPending} t={t} inp={inp} />
        </div>

        {/* Catálogo de códigos */}
        <div className="bg-white rounded-2xl border border-warm-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100">
            <h2 className="text-sm font-semibold text-warm-800">{t('anorm.config.catalogoTitle')}</h2>
            <div className="flex items-center gap-2">
              <select value={procesoFilter} onChange={e => setProcesoFilter(e.target.value)}
                className="text-xs border border-warm-200 rounded-xl px-2 py-1.5 bg-white focus:outline-none">
                <option value="">{t('common.all')}</option>
                {PROCESOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" />
                {t('anorm.config.nuevoCodigo')}
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100">
                  {[t('anorm.field.codigo'), t('common.name'), t('anorm.field.proceso'), t('anorm.field.nivel'), t('common.status'), t('common.actions')].map(h => (
                    <th key={h} className="table-header">
                      <span className="text-xs font-semibold uppercase tracking-wider text-warm-500">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-warm-400 text-sm">{t('common.noData')}</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="hover:bg-warm-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-semibold text-primary-700">{c.codigo}</span>
                      {c.es_default && <span className="ml-1.5 text-[10px] bg-warm-100 text-warm-500 rounded px-1">base</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-sm text-warm-800">{c.nombre_es}</p>
                      {c.nombre_zh && <p className="text-[10px] text-warm-400">{c.nombre_zh}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-warm-600">{c.proceso}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        c.nivel_sugerido === 'L3' ? 'bg-danger-100 text-danger-700 border-danger-200'
                        : c.nivel_sugerido === 'L2' ? 'bg-warning-100 text-warning-700 border-warning-200'
                        : 'bg-success-100 text-success-700 border-success-200'
                      }`}>{c.nivel_sugerido}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleActivo(c)} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        c.activo
                          ? 'bg-success-50 border-success-200 text-success-700 hover:bg-success-100'
                          : 'bg-warm-100 border-warm-200 text-warm-500 hover:bg-warm-200'
                      }`}>
                        {c.activo ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {c.activo ? t('common.active') : t('common.inactive')}
                      </button>
                    </td>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditCodigo(c)} className="p-1.5 rounded-lg hover:bg-accent-100 text-warm-400 hover:text-accent-600 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!c.es_default && (
                          <button onClick={() => setDeleteCod(c)} className="p-1.5 rounded-lg hover:bg-danger-100 text-warm-400 hover:text-danger-600 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create code */}
      <CodigoFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('anorm.config.nuevoCodigo')}
        onSubmit={d => createMut.mutate(d)}
        loading={createMut.isPending}
        t={t} inp={inp}
      />

      {/* Edit code */}
      {editCodigo && (
        <CodigoFormModal
          isOpen
          onClose={() => setEditCodigo(null)}
          title={`${t('common.edit')} ${editCodigo.codigo}`}
          initialData={{ ...editCodigo }}
          onSubmit={d => updateMut.mutate({ id: editCodigo.id, data: d })}
          loading={updateMut.isPending}
          t={t} inp={inp}
        />
      )}

      {/* Delete confirm */}
      <Modal isOpen={!!deleteCod} onClose={() => setDeleteCod(null)} title={t('anorm.delete.title')} icon={Trash2} size="sm">
        <div className="flex items-start gap-3 p-3 bg-warning-50 border border-warning-200 rounded-xl mb-4">
          <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-warning-700">{t('anorm.config.deleteCodigoWarning')}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteCod(null)} className="btn-secondary text-sm">{t('common.cancel')}</button>
          <button onClick={() => deleteMut.mutate(deleteCod?.id)} disabled={deleteMut.isPending} className="btn-danger text-sm flex items-center gap-2">
            {deleteMut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {t('common.delete')}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function TiemposForm({ tiempos, onSubmit, loading, t, inp }) {
  const [form, setForm] = useState({ horas_limite_l1: tiempos.horas_limite_l1, horas_limite_l2: tiempos.horas_limite_l2, horas_limite_l3: tiempos.horas_limite_l3 })

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }}>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[['L1', 'horas_limite_l1', 'success'], ['L2', 'horas_limite_l2', 'warning'], ['L3', 'horas_limite_l3', 'danger']].map(([nivel, key, color]) => (
          <div key={nivel}>
            <label className="block text-xs font-medium text-warm-700 mb-1">
              {nivel} — {t('anorm.config.horasLimite')}
            </label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || 1 }))}
                className={inp + ' max-w-[80px]'} />
              <span className="text-xs text-warm-500">{t('anorm.config.horas')}</span>
            </div>
          </div>
        ))}
      </div>
      <button type="submit" disabled={loading} className="btn-primary text-xs flex items-center gap-2">
        {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
        {t('common.save')}
      </button>
    </form>
  )
}

function CodigoFormModal({ isOpen, onClose, title, initialData, onSubmit, loading, t, inp }) {
  const [form, setForm] = useState(initialData || { ...CODIGO_EMPTY })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={Settings} size="lg">
      <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.codigo')} *</label>
            <input value={form.codigo} onChange={e => set('codigo', e.target.value.toUpperCase())} className={inp} required maxLength={20} />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.proceso')} *</label>
            <select value={form.proceso} onChange={e => set('proceso', e.target.value)} className={inp} required>
              <option value="">{t('common.select')}</option>
              {PROCESOS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.name')} (ES) *</label>
          <input value={form.nombre_es} onChange={e => set('nombre_es', e.target.value)} className={inp} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.name')} (ZH)</label>
          <input value={form.nombre_zh} onChange={e => set('nombre_zh', e.target.value)} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.nivel')}</label>
            <select value={form.nivel_sugerido} onChange={e => set('nivel_sugerido', e.target.value)} className={inp}>
              {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.description')}</label>
          <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} className={`${inp} resize-none`} rows={2} />
        </div>
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
