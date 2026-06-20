import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Truck, Users, Loader2, Edit3, Trash2, Check, FileText,
} from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import CatalogEmptyHint from '../../../core/components/common/CatalogEmptyHint'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import {
  getConductores, createConductor, updateConductor, deleteConductor,
  getUnidades, createUnidad, updateUnidad, deleteUnidad,
  createFolio,
} from '../services/despachoService'

export const TIPO_UNIDAD = ['camion', 'furgon', 'camioneta', 'trailer', 'torton', 'moto']

// ── Conductores catalog modal ─────────────────────────────────────────────────
export function ConductoresModal({ isOpen, onClose, canManage }) {
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const qc = useQueryClient()
  const [form, setForm] = useState({ nombre: '', licencia: '', telefono: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const { data } = useQuery({ queryKey: ['despacho-conductores'], queryFn: getConductores, enabled: isOpen })
  const conductores = data?.conductores ?? []

  const addMut = useMutation({
    mutationFn: createConductor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-conductores'] })
      setForm({ nombre: '', licencia: '', telefono: '' })
      addToast(t('desp.toast.conductorAgregado'), 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error', 'error'),
  })

  const editMut = useMutation({
    mutationFn: ({ id, body }) => updateConductor(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-conductores'] })
      setEditingId(null)
      addToast(t('desp.toast.conductorActualizado'), 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error', 'error'),
  })

  const delMut = useMutation({
    mutationFn: deleteConductor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despacho-conductores'] }),
    onError: (err) => addToast(err?.response?.data?.error || 'Error', 'error'),
  })

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditForm({ nombre: c.nombre, licencia: c.licencia || '', telefono: c.telefono || '' })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('desp.cat.conductores.title')} icon={Users} size="md"
      footer={<button className="btn-secondary text-sm" onClick={onClose}>{t('common.close')}</button>}
    >
      <div className="space-y-4">
        {canManage && (
          <div className="bg-warm-50 rounded-xl p-3 border border-warm-100 space-y-2">
            <p className="text-xs font-semibold text-warm-600">{t('desp.cat.conductores.agregar')}</p>
            <div className="grid grid-cols-3 gap-2">
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder={t('desp.cat.conductores.nombre')} className="input-field text-sm col-span-3" />
              <input value={form.licencia} onChange={e => setForm(f => ({ ...f, licencia: e.target.value }))}
                placeholder={t('desp.cat.conductores.licencia')} className="input-field text-sm" />
              <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                placeholder={t('desp.cat.conductores.telefono')} className="input-field text-sm col-span-2" />
            </div>
            <button onClick={() => addMut.mutate(form)} disabled={!form.nombre.trim() || addMut.isPending}
              className="btn-primary text-xs flex items-center gap-1.5">
              {addMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {t('common.create')}
            </button>
          </div>
        )}
        <div className="divide-y divide-warm-100 max-h-64 overflow-y-auto">
          {conductores.length === 0 ? (
            <p className="text-sm text-warm-400 text-center py-6">{t('desp.cat.conductores.empty')}</p>
          ) : conductores.map(c => (
            <div key={c.id} className="py-2.5">
              {editingId === c.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                      className="input-field text-sm col-span-3" placeholder="Nombre" />
                    <input value={editForm.licencia} onChange={e => setEditForm(f => ({ ...f, licencia: e.target.value }))}
                      className="input-field text-sm" placeholder="Licencia" />
                    <input value={editForm.telefono} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))}
                      className="input-field text-sm col-span-2" placeholder="Teléfono" />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => editMut.mutate({ id: c.id, body: editForm })} disabled={editMut.isPending}
                      className="btn-primary text-xs flex items-center gap-1">
                      {editMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {t('common.save')}
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">{t('common.cancel')}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {c.nombre[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-warm-800 truncate">{c.nombre}</p>
                      {(c.licencia || c.telefono) && (
                        <p className="text-[10px] text-warm-400 truncate">{[c.licencia, c.telefono].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => delMut.mutate(c.id)} className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ── Unidades catalog modal ────────────────────────────────────────────────────
export function UnidadesModal({ isOpen, onClose, canManage }) {
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const qc = useQueryClient()
  const [form, setForm] = useState({ placa: '', tipo: 'camion', capacidad_kg: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const { data } = useQuery({ queryKey: ['despacho-unidades'], queryFn: getUnidades, enabled: isOpen })
  const unidades = data?.unidades ?? []

  const addMut = useMutation({
    mutationFn: createUnidad,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-unidades'] })
      setForm({ placa: '', tipo: 'camion', capacidad_kg: '' })
      addToast(t('desp.toast.unidadAgregada'), 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error', 'error'),
  })

  const editMut = useMutation({
    mutationFn: ({ id, body }) => updateUnidad(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-unidades'] })
      setEditingId(null)
      addToast(t('desp.toast.unidadActualizada'), 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error', 'error'),
  })

  const delMut = useMutation({
    mutationFn: deleteUnidad,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despacho-unidades'] }),
    onError: (err) => addToast(err?.response?.data?.error || 'Error', 'error'),
  })

  const startEdit = (u) => {
    setEditingId(u.id)
    setEditForm({ placa: u.placa, tipo: u.tipo, capacidad_kg: u.capacidad_kg || '' })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('desp.cat.unidades.title')} icon={Truck} size="md"
      footer={<button className="btn-secondary text-sm" onClick={onClose}>{t('common.close')}</button>}
    >
      <div className="space-y-4">
        {canManage && (
          <div className="bg-warm-50 rounded-xl p-3 border border-warm-100 space-y-2">
            <p className="text-xs font-semibold text-warm-600">{t('desp.cat.unidades.agregar')}</p>
            <div className="grid grid-cols-3 gap-2">
              <input value={form.placa} onChange={e => setForm(f => ({ ...f, placa: e.target.value }))}
                placeholder={t('desp.cat.unidades.placa')} className="input-field text-sm" />
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                className="input-field text-sm">
                {TIPO_UNIDAD.map(tipo => <option key={tipo} value={tipo}>{tipo.charAt(0).toUpperCase() + tipo.slice(1)}</option>)}
              </select>
              <input type="number" value={form.capacidad_kg} onChange={e => setForm(f => ({ ...f, capacidad_kg: e.target.value }))}
                placeholder={t('desp.cat.unidades.capacidad')} className="input-field text-sm" />
            </div>
            <button onClick={() => addMut.mutate(form)} disabled={!form.placa.trim() || addMut.isPending}
              className="btn-primary text-xs flex items-center gap-1.5">
              {addMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {t('common.create')}
            </button>
          </div>
        )}
        <div className="divide-y divide-warm-100 max-h-64 overflow-y-auto">
          {unidades.length === 0 ? (
            <p className="text-sm text-warm-400 text-center py-6">{t('desp.cat.unidades.empty')}</p>
          ) : unidades.map(u => (
            <div key={u.id} className="py-2.5">
              {editingId === u.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input value={editForm.placa} onChange={e => setEditForm(f => ({ ...f, placa: e.target.value }))}
                      className="input-field text-sm" placeholder="Placa" />
                    <select value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
                      className="input-field text-sm">
                      {TIPO_UNIDAD.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    <input type="number" value={editForm.capacidad_kg} onChange={e => setEditForm(f => ({ ...f, capacidad_kg: e.target.value }))}
                      className="input-field text-sm" placeholder="Cap. kg" />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => editMut.mutate({ id: u.id, body: editForm })} disabled={editMut.isPending}
                      className="btn-primary text-xs flex items-center gap-1">
                      {editMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {t('common.save')}
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">{t('common.cancel')}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4 text-warm-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-warm-800">{u.placa}</p>
                      <p className="text-[10px] text-warm-400">{u.tipo}{u.capacidad_kg ? ` · ${u.capacidad_kg} kg` : ''}</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(u)} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => delMut.mutate(u.id)} className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ── New folio form modal ──────────────────────────────────────────────────────
export function FolioFormModal({ isOpen, onClose, onCreated, conductores = [], unidades = [] }) {
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const qc = useQueryClient()
  const [form, setForm] = useState({ conductor_id: '', unidad_id: '', fecha_salida: '', notas: '' })

  const { mutate: crear, isPending } = useMutation({
    mutationFn: createFolio,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['despacho-folios'] })
      addToast(t('desp.toast.folioCreado'), 'success')
      setForm({ conductor_id: '', unidad_id: '', fecha_salida: '', notas: '' })
      onClose()
      if (onCreated && data?.folio?.id) onCreated(data.folio.id)
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error creando folio', 'error'),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('desp.folio.form.title')} icon={FileText} size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
          <button onClick={() => crear(form)} disabled={isPending} className="btn-primary text-sm flex items-center gap-1.5">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('desp.folio.form.crear')}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <label className="block font-medium text-warm-700 mb-1">{t('desp.folio.form.conductor')}</label>
          <select value={form.conductor_id} onChange={e => set('conductor_id', e.target.value)} className="input-field w-full">
            <option value="">{t('desp.folio.form.sinConductor')}</option>
            {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.licencia ? ` · ${c.licencia}` : ''}</option>)}
          </select>
          {conductores.length === 0 && <CatalogEmptyHint item={t('desp.folio.form.conductor').toLowerCase()} section={t('desp.folios.title')} action={t('desp.btn.conductores')} />}
        </div>
        <div>
          <label className="block font-medium text-warm-700 mb-1">{t('desp.folio.form.unidad')}</label>
          <select value={form.unidad_id} onChange={e => set('unidad_id', e.target.value)} className="input-field w-full">
            <option value="">{t('desp.folio.form.sinUnidad')}</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.placa} ({u.tipo})</option>)}
          </select>
          {unidades.length === 0 && <CatalogEmptyHint item={t('desp.folio.form.unidad').toLowerCase()} section={t('desp.folios.title')} action={t('desp.btn.unidades')} />}
        </div>
        <div>
          <label className="block font-medium text-warm-700 mb-1">{t('desp.folio.form.fechaSalida')}</label>
          <input type="date" value={form.fecha_salida} onChange={e => set('fecha_salida', e.target.value)} className="input-field w-full" />
        </div>
        <div>
          <label className="block font-medium text-warm-700 mb-1">{t('desp.folio.form.notas')}</label>
          <textarea value={form.notas} onChange={e => set('notas', e.target.value)}
            rows={2} className="input-field w-full resize-none" placeholder={t('desp.folio.form.notasPlaceholder')} />
        </div>
      </div>
    </Modal>
  )
}
