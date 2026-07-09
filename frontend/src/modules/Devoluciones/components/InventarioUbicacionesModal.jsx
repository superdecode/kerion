import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, Upload, Trash2, Search, X, Plus, AlertTriangle, Check, Loader2, ToggleRight, ToggleLeft } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { createUbicacion, deleteUbicacion, updateUbicacion } from '../services/devolucionesService'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'

const AREA_LABEL_KEYS = { devoluciones: 'dev.inv_ubicaciones.area.devoluciones', inventario: 'dev.inv_ubicaciones.area.inventario' }
const AREA_BADGE_CLS = {
  devoluciones: 'bg-purple-100 text-purple-700',
  inventario: 'bg-primary-100 text-primary-700',
}

function Toggle({ checked, onChange }) {
  const { t } = useI18nStore()
  return (
    <button
      type="button"
      onClick={onChange}
      title={checked ? t('dev.inv_ubicaciones.toggle.desact') : t('dev.inv_ubicaciones.toggle.activar')}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-primary-500' : 'bg-warm-200'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

export default function InventarioUbicacionesModal({
  isOpen,
  onClose,
  ubicaciones = [],
  onSaved,
  onSelect = null,
  onImportClick = null,
  allowManagement = true,
  selectActionLabel = 'Seleccionar',
  serviceOverrides = null,
  onSearchChange = null,
  loading = false,
  defaultArea = 'inventario',
}) {
  const toast = useToastStore()
  const { t } = useI18nStore()
  const [codigo, setCodigo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const locationServices = {
    createUbicacion,
    updateUbicacion,
    deleteUbicacion,
    ...serviceOverrides,
  }

  // When onSearchChange is provided the parent performs server-side search,
  // so the received `ubicaciones` are already filtered — skip client filtering.
  const serverSearch = typeof onSearchChange === 'function'
  const filtered = useMemo(() => {
    let rows = ubicaciones
    if (!serverSearch) {
      const q = search.toLowerCase().trim()
      if (q) {
        rows = rows.filter(u =>
          u.codigo?.toLowerCase().includes(q) || u.nombre?.toLowerCase().includes(q)
        )
      }
    }
    if (areaFilter) rows = rows.filter(u => (u.area || 'inventario') === areaFilter)
    return rows
  }, [ubicaciones, search, serverSearch, areaFilter])

  // Only offer areas that actually have at least one location — a tenant that
  // never created any Devoluciones location shouldn't see an empty option.
  const availableAreas = useMemo(() => new Set(ubicaciones.map(u => u.area || 'inventario')), [ubicaciones])
  useEffect(() => {
    if (areaFilter && !availableAreas.has(areaFilter)) setAreaFilter('')
  }, [areaFilter, availableAreas])

  // Selection only ever holds ids that are currently visible — clear anything
  // that fell out of view when the filter changes, so bulk actions never
  // silently apply to rows the user can no longer see.
  useEffect(() => {
    const visibleIds = new Set(filtered.map(u => u.id))
    setSelected(prev => {
      const next = new Set([...prev].filter(id => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filtered])

  const allFilteredSelected = filtered.length > 0 && filtered.every(u => selected.has(u.id))

  const toggleSelectAll = () => {
    setSelected(allFilteredSelected ? new Set() : new Set(filtered.map(u => u.id)))
  }

  const toggleSelectRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!codigo.trim()) return
    setSaving(true)
    try {
      await locationServices.createUbicacion({ codigo: codigo.trim(), nombre: codigo.trim(), area: defaultArea })
      setCodigo('')
      setShowForm(false)
      toast.success(t('dev.inv_ubicaciones.toast.creada'))
      onSaved?.()
    } catch (e) {
      toast.error(e.response?.data?.error || t('dev.inv_ubicaciones.toast.err_crear'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActivo = async (row) => {
    try {
      await locationServices.updateUbicacion(row.id, {
        codigo: row.codigo,
        nombre: row.nombre || row.codigo,
        descripcion: row.descripcion || '',
        activo: !row.activo,
      })
      onSaved?.()
    } catch {
      toast.error(t('dev.inv_ubicaciones.toast.err_upd'))
    }
  }

  const handleBulkSetActivo = async (activo) => {
    const rows = filtered.filter(u => selected.has(u.id))
    if (rows.length === 0) return
    setBulkRunning(true)
    try {
      const results = await Promise.allSettled(rows.map(row => locationServices.updateUbicacion(row.id, {
        codigo: row.codigo,
        nombre: row.nombre || row.codigo,
        descripcion: row.descripcion || '',
        activo,
      })))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed > 0) {
        toast.error(t('dev.inv_ubicaciones.bulk.toast_failed').replace('{failed}', failed).replace('{total}', rows.length))
      } else {
        toast.success(t(activo ? 'dev.inv_ubicaciones.bulk.toast_activated' : 'dev.inv_ubicaciones.bulk.toast_deactivated').replace('{n}', rows.length))
      }
      setSelected(new Set())
      onSaved?.()
    } finally {
      setBulkRunning(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteRow) return
    setDeletingId(deleteRow.id)
    try {
      await locationServices.deleteUbicacion(deleteRow.id)
      toast.success(t('dev.inv_ubicaciones.toast.eliminada'))
      onSaved?.()
      setDeleteRow(null)
    } catch (e) {
      toast.error(e.response?.data?.error || t('dev.inv_ubicaciones.toast.err_del'))
    } finally {
      setDeletingId(null)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white'

  const totalActivas = ubicaciones.filter(u => u.activo !== false).length
  const canSelect = typeof onSelect === 'function'
  const colCount = allowManagement ? 7 : 6

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('dev.inv_ubicaciones.title')} icon={LayoutGrid} size="lg-wide">
      <div className="space-y-4">

        {/* Buscador + botón nueva */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); if (serverSearch) onSearchChange(e.target.value) }}
              placeholder={t('dev.inv_ubicaciones.search')}
              className="text-xs outline-none bg-transparent text-warm-700 flex-1"
            />
            {search && (
              <button onClick={() => { setSearch(''); if (serverSearch) onSearchChange('') }} className="text-warm-400 hover:text-warm-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {availableAreas.size > 1 && (
            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className="shrink-0 text-xs rounded-xl border border-warm-200 bg-warm-50 px-2.5 py-1.5 text-warm-700 outline-none focus:ring-2 focus:ring-primary-200 cursor-pointer"
            >
              <option value="">{t('dev.inv_ubicaciones.area.todas')}</option>
              {availableAreas.has('devoluciones') && <option value="devoluciones">{t('dev.inv_ubicaciones.area.devoluciones')}</option>}
              {availableAreas.has('inventario') && <option value="inventario">{t('dev.inv_ubicaciones.area.inventario')}</option>}
            </select>
          )}
          <div className="text-xs text-warm-500 shrink-0">
            <span className="font-semibold text-warm-700">{totalActivas}</span> {t('dev.inv_ubicaciones.activas')}
            <span className="text-warm-300 mx-1">·</span>
            <span className="font-semibold text-warm-700">{ubicaciones.length}</span> {t('dev.inv_ubicaciones.totales')}
          </div>
          {allowManagement && (
            <div className="flex items-center gap-1.5 shrink-0">
              {onImportClick && (
                <button
                  onClick={() => {
                    onClose?.()
                    onImportClick()
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-warm-200 bg-white text-warm-600 hover:bg-warm-100 cursor-pointer transition-all"
                >
                  <Upload className="w-3.5 h-3.5" /> {t('dev.inv_ubicaciones.importar')}
                </button>
              )}
              <button
                onClick={() => setShowForm(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  showForm
                    ? 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                    : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow-glow'
                }`}
              >
                {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showForm ? t('dev.inv_ubicaciones.cerrar') : t('dev.inv_ubicaciones.nueva')}
              </button>
            </div>
          )}
        </div>

        {/* Barra de acción masiva — solo aplica sobre lo que está filtrado/visible */}
        <AnimatePresence initial={false}>
          {allowManagement && selected.size > 0 && (
            <motion.div
              key="bulk-bar"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5">
                <span className="text-xs font-semibold text-primary-700">
                  {t('common.bulk.selected').replace('{n}', selected.size)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBulkSetActivo(true)}
                    disabled={bulkRunning}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-success-100 text-success-700 hover:bg-success-200 disabled:opacity-50 transition-colors"
                  >
                    {bulkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ToggleRight className="w-3.5 h-3.5" />}
                    {t('dev.inv_ubicaciones.bulk.activate')}
                  </button>
                  <button
                    onClick={() => handleBulkSetActivo(false)}
                    disabled={bulkRunning}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-warm-200 text-warm-700 hover:bg-warm-300 disabled:opacity-50 transition-colors"
                  >
                    {bulkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    {t('dev.inv_ubicaciones.bulk.deactivate')}
                  </button>
                  <button onClick={() => setSelected(new Set())} className="text-warm-400 hover:text-warm-600 px-1" title={t('dev.inv_ubicaciones.bulk.clear')}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Formulario creación (colapsable) */}
        <AnimatePresence initial={false}>
          {allowManagement && showForm && (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="bg-warm-50/60 rounded-2xl border border-warm-100 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] text-warm-500 mb-1 font-medium">{t('dev.inv_ubicaciones.codigo_label')}</label>
                    <input
                      value={codigo}
                      onChange={e => setCodigo(e.target.value)}
                      placeholder={t('dev.inv_ubicaciones.codigo_ph')}
                      className={inputCls}
                      onKeyDown={e => e.key === 'Enter' && handleSave()}
                      autoFocus
                    />
                  </div>
                  <div className="pt-5">
                    <button
                      onClick={handleSave}
                      disabled={saving || !codigo.trim()}
                      className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      {saving ? t('dev.inv_ubicaciones.guardar_btn') : t('dev.inv_ubicaciones.agregar_btn')}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-warm-400 mt-1.5">{t('dev.inv_ubicaciones.nota_masiva')}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabla */}
        <div className="border border-warm-100 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-warm-500 border-b border-warm-100 bg-warm-50/50">
                {allowManagement && (
                  <th className="px-4 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-warm-300 text-primary-600 focus:ring-primary-300 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-4 py-2.5">{t('dev.inv_ubicaciones.col.codigo')}</th>
                <th className="px-4 py-2.5">{t('dev.inv_ubicaciones.col.nombre')}</th>
                <th className="px-4 py-2.5">{t('dev.inv_ubicaciones.col.area')}</th>
                <th className="px-4 py-2.5 text-right">{t('dev.inv_ubicaciones.col.pcs')}</th>
                <th className="px-4 py-2.5 text-center">{allowManagement ? t('dev.inv_ubicaciones.col.activa') : t('dev.inv_ubicaciones.col.estado')}</th>
                <th className="px-4 py-2.5 text-right">{t('dev.inv_ubicaciones.col.acciones')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-500 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-warm-400 text-sm">
                    {search ? t('dev.inv_ubicaciones.sin_resultados') : t('dev.inv_ubicaciones.sin_datos')}
                  </td>
                </tr>
              ) : filtered.map(row => {
                const stock = row.pcs_en_stock ?? row.pcs_stock ?? 0
                const isActive = row.activo !== false
                const area = row.area || 'inventario'

                return (
                  <tr key={row.id} className={`border-b border-warm-50 last:border-0 transition-colors ${isActive ? 'hover:bg-primary-100' : 'bg-warm-50/30 opacity-70'}`}>
                    {allowManagement && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelectRow(row.id)}
                          className="rounded border-warm-300 text-primary-600 focus:ring-primary-300 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 code-main">{row.codigo}</td>
                    <td className="px-4 py-3 text-warm-700">{row.nombre}
                      {row.descripcion && <span className="text-warm-400 text-xs ml-1.5">· {row.descripcion}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${AREA_BADGE_CLS[area] || AREA_BADGE_CLS.inventario}`}>
                        {AREA_LABEL_KEYS[area] ? t(AREA_LABEL_KEYS[area]) : area}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${stock > 0 ? 'text-success-700' : 'text-warm-400'}`}>{stock}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {allowManagement ? (
                        <Toggle checked={isActive} onChange={() => handleToggleActivo(row)} />
                      ) : (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isActive ? 'bg-success-100 text-success-700' : 'bg-warm-100 text-warm-500'
                        }`}>
                          {isActive ? t('dev.inv_ubicaciones.estado.activa') : t('dev.inv_ubicaciones.estado.inactiva')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canSelect && (
                          <button
                            onClick={() => {
                              onSelect(row)
                              onClose?.()
                            }}
                            disabled={!isActive}
                            title={selectActionLabel}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isActive
                                ? 'hover:bg-primary-50 text-warm-400 hover:text-primary-700'
                                : 'text-warm-200 cursor-not-allowed'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {allowManagement && (
                          <button
                            onClick={() => stock > 0
                              ? toast.error(t('dev.inv_ubicaciones.has_stock'))
                              : setDeleteRow(row)
                            }
                            title={stock > 0 ? t('dev.inv_ubicaciones.title.no_del') : t('dev.inv_ubicaciones.title.del')}
                            className={`p-1.5 rounded-lg transition-colors ${
                              stock > 0
                                ? 'text-warm-200 cursor-not-allowed'
                                : 'hover:bg-danger-50 text-warm-400 hover:text-danger-600'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Inline delete confirmation */}
        <AnimatePresence>
          {deleteRow && (
            <motion.div
              key="confirm-delete"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="mt-3 rounded-xl border border-danger-200 bg-danger-50/60 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0" />
                <p className="text-sm text-danger-700">
                  {t('dev.inv_ubicaciones.del.body')} <span className="font-semibold font-mono">{deleteRow.codigo}</span>? {t('dev.inv_ubicaciones.del.warning')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setDeleteRow(null)}
                  className="px-3 py-1.5 rounded-lg border border-warm-200 text-xs font-semibold text-warm-600 hover:bg-warm-100 transition-colors"
                >
                  {t('dev.inv_ubicaciones.del.cancelar')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!!deletingId}
                  className="px-3 py-1.5 rounded-lg bg-danger-600 text-white text-xs font-semibold hover:bg-danger-700 disabled:opacity-60 transition-colors"
                >
                  {deletingId ? t('dev.inv_ubicaciones.del.ing') : t('dev.inv_ubicaciones.del.confirmar')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  )
}
