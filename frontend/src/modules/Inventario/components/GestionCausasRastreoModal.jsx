import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, Trash2, Check, X, Loader2, Search } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { getCausasRastreo, createCausaRastreo, updateCausaRastreo, deleteCausaRastreo } from '../../../core/services/rastreoService'

export default function GestionCausasRastreoModal({ isOpen, onClose }) {
  const { t } = useI18nStore()
  const qc = useQueryClient()
  const toast = useToastStore()

  const [search, setSearch] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newArea, setNewArea] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDesc, setEditDesc] = useState('')
  const [editArea, setEditArea] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['rastreo-causas'],
    queryFn: getCausasRastreo,
    enabled: isOpen,
    staleTime: 60_000,
  })
  const causas = data?.data || []
  const existingAreas = [...new Set(causas.map(c => c.area).filter(Boolean))].sort()

  const filtered = search.trim()
    ? causas.filter(c =>
        c.descripcion.toLowerCase().includes(search.toLowerCase()) ||
        c.area.toLowerCase().includes(search.toLowerCase())
      )
    : causas

  const createMut = useMutation({
    mutationFn: () => createCausaRastreo({ descripcion: newDesc.trim(), area: newArea }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-causas'] })
      toast.success(t('rastreo.causas.toast.creada'))
      setNewDesc('')
      setNewArea('')
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('toast.error')),
  })

  const updateMut = useMutation({
    mutationFn: ({ id }) => updateCausaRastreo(id, { descripcion: editDesc.trim(), area: editArea }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-causas'] })
      toast.success(t('rastreo.causas.toast.actualizada'))
      setEditingId(null)
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('toast.error')),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteCausaRastreo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreo-causas'] })
      toast.success(t('rastreo.causas.toast.eliminada'))
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('toast.error')),
  })

  function startEdit(c) {
    setEditingId(c.id)
    setEditDesc(c.descripcion)
    setEditArea(c.area)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDesc('')
    setEditArea('')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { setSearch(''); setNewDesc(''); setNewArea(''); setEditingId(null); onClose() }}
      title={t('rastreo.causas.title')}
      icon={BookOpen}
      size="lg"
    >
      <div className="space-y-4">
        {/* Create form */}
        <div className="rounded-2xl border border-warm-100 bg-warm-50/60 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">{t('rastreo.causas.nueva')}</p>
          <datalist id="areas-list">
            {existingAreas.map(a => <option key={a} value={a} />)}
          </datalist>
          <div className="flex gap-2">
            <input
              type="text"
              list="areas-list"
              className="h-9 rounded-xl border border-warm-200 bg-white px-3 text-xs text-warm-700 placeholder-warm-300 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 shrink-0 w-[140px]"
              placeholder={t('rastreo.causas.areaPlaceholder')}
              value={newArea}
              onChange={e => setNewArea(e.target.value)}
            />
            <input
              type="text"
              className="flex-1 h-9 rounded-xl border border-warm-200 bg-white px-3 text-xs text-warm-700 placeholder-warm-300 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder={t('rastreo.causas.descPlaceholder')}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newDesc.trim() && newArea.trim() && createMut.mutate()}
            />
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={!newDesc.trim() || !newArea.trim() || createMut.isPending}
              className="h-9 px-3 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              {createMut.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : <Plus size={13} />}
              {t('rastreo.causas.add')}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-9 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
          <Search size={12} className="text-warm-400 shrink-0" />
          <input
            className="flex-1 text-xs outline-none bg-transparent text-warm-700 placeholder-warm-300"
            placeholder={t('rastreo.causas.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X size={11} className="text-warm-400 hover:text-warm-600" />
            </button>
          )}
        </div>

        {/* List */}
        <div className="border border-warm-100 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 size={16} className="animate-spin text-warm-300" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-warm-400">{t('rastreo.causas.empty')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">{t('rastreo.causas.col.area')}</th>
                  <th className="table-header">{t('rastreo.causas.col.descripcion')}</th>
                  <th className="table-header text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {filtered.map(c => (
                  <tr key={c.id} className="table-row">
                    <td className="px-3 py-2.5 w-[130px]">
                      {editingId === c.id ? (
                        <input
                          type="text"
                          list="areas-list"
                          className="w-full h-7 rounded-lg border border-warm-200 bg-white px-1.5 text-xs focus:outline-none focus:border-primary-400"
                          value={editArea}
                          onChange={e => setEditArea(e.target.value)}
                        />
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-primary-50 border border-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                          {c.area}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {editingId === c.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && editDesc.trim()) updateMut.mutate({ id: c.id })
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="w-full px-2 py-1 rounded-lg border border-primary-300 text-xs font-medium outline-none focus:ring-2 focus:ring-primary-100"
                        />
                      ) : (
                        <span className="text-warm-700 text-xs font-medium">{c.descripcion}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        {editingId === c.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => editDesc.trim() && editArea.trim() && updateMut.mutate({ id: c.id })}
                              disabled={!editDesc.trim() || !editArea.trim() || updateMut.isPending}
                              className="inline-flex rounded-lg p-1.5 text-success-600 hover:bg-success-50 disabled:opacity-30"
                              title={t('common.save')}
                            >
                              {updateMut.isPending
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Check size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex rounded-lg p-1.5 text-warm-400 hover:bg-warm-50"
                              title={t('common.cancel')}
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="inline-flex rounded-lg p-1.5 text-warm-400 hover:bg-warm-50 hover:text-primary-600"
                            title={t('common.edit')}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteMut.mutate(c.id)}
                          disabled={deleteMut.isPending || editingId === c.id}
                          className="inline-flex rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 disabled:opacity-30"
                          title={t('common.delete')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}
