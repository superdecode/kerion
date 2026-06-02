import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, Upload, Trash2, Search, X, Plus, AlertTriangle, Check } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { createUbicacion, deleteUbicacion, updateUbicacion, importUbicaciones } from '../services/devolucionesService'
import { useToastStore } from '../../../core/stores/toastStore'

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      title={checked ? 'Desactivar ubicación' : 'Activar ubicación'}
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
  allowManagement = true,
  selectActionLabel = 'Seleccionar',
}) {
  const toast = useToastStore()
  const [codigo, setCodigo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return ubicaciones
    return ubicaciones.filter(u =>
      u.codigo?.toLowerCase().includes(q) || u.nombre?.toLowerCase().includes(q)
    )
  }, [ubicaciones, search])

  const handleSave = async () => {
    if (!codigo.trim()) return
    setSaving(true)
    try {
      await createUbicacion({ codigo: codigo.trim(), nombre: codigo.trim() })
      setCodigo('')
      setShowForm(false)
      toast.success('Ubicación creada')
      onSaved?.()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al crear ubicación')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActivo = async (row) => {
    try {
      await updateUbicacion(row.id, {
        codigo: row.codigo,
        nombre: row.nombre || row.codigo,
        descripcion: row.descripcion || '',
        activo: !row.activo,
      })
      onSaved?.()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  const handleDelete = async () => {
    if (!deleteRow) return
    setDeletingId(deleteRow.id)
    try {
      await deleteUbicacion(deleteRow.id)
      toast.success('Ubicación eliminada')
      onSaved?.()
      setDeleteRow(null)
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se puede eliminar: puede tener registros asociados')
    } finally {
      setDeletingId(null)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await importUbicaciones(fd)
      const summary = res.data || res
      toast.success(`Importación completada: ${summary.created || 0} creadas, ${summary.skipped || 0} omitidas`)
      onSaved?.()
    } catch {
      toast.error('Error al importar')
    }
    e.target.value = ''
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white'

  const totalActivas = ubicaciones.filter(u => u.activo !== false).length
  const canSelect = typeof onSelect === 'function'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ubicaciones" icon={LayoutGrid} size="lg-wide">
      <div className="space-y-4">

        {/* Buscador + botón nueva */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por código o nombre..."
              className="text-xs outline-none bg-transparent text-warm-700 flex-1"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-warm-400 hover:text-warm-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="text-xs text-warm-500 shrink-0">
            <span className="font-semibold text-warm-700">{totalActivas}</span> activas
            <span className="text-warm-300 mx-1">·</span>
            <span className="font-semibold text-warm-700">{ubicaciones.length}</span> totales
          </div>
          {allowManagement && (
            <button
              onClick={() => setShowForm(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                showForm
                  ? 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                  : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow-glow'
              }`}
            >
              {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showForm ? 'Cerrar' : 'Nueva'}
            </button>
          )}
        </div>

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
                    <label className="block text-[11px] text-warm-500 mb-1 font-medium">Código de ubicación *</label>
                    <input
                      value={codigo}
                      onChange={e => setCodigo(e.target.value)}
                      placeholder="ej. U-01, BODEGA-A, RACK-1"
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
                      {saving ? 'Guardando...' : 'Agregar'}
                    </button>
                  </div>
                  <div className="pt-5">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-warm-200 text-[11px] font-semibold text-warm-600 bg-white hover:bg-warm-50 cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Excel
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
                    </label>
                  </div>
                </div>
                <p className="text-[10px] text-warm-400 mt-1.5">Columnas Excel: codigo (requerido), nombre, descripcion</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabla */}
        <div className="border border-warm-100 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-warm-500 border-b border-warm-100 bg-warm-50/50">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5 text-right">Pcs en stock</th>
                <th className="px-4 py-2.5 text-center">{allowManagement ? 'Activa' : 'Estado'}</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-warm-400 text-sm">
                    {search ? 'Sin resultados para esa búsqueda' : 'Sin ubicaciones registradas'}
                  </td>
                </tr>
              ) : filtered.map(row => {
                const stock = row.pcs_en_stock ?? row.pcs_stock ?? 0
                const isActive = row.activo !== false

                return (
                  <tr key={row.id} className={`border-b border-warm-50 last:border-0 transition-colors ${isActive ? 'hover:bg-warm-50/40' : 'bg-warm-50/30 opacity-70'}`}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-warm-800">{row.codigo}</td>
                    <td className="px-4 py-3 text-warm-700">{row.nombre}
                      {row.descripcion && <span className="text-warm-400 text-xs ml-1.5">· {row.descripcion}</span>}
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
                          {isActive ? 'Activa' : 'Inactiva'}
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
                              ? toast.error('Tiene inventario activo. Desactívala primero.')
                              : setDeleteRow(row)
                            }
                            title={stock > 0 ? 'No eliminable: tiene stock' : 'Eliminar ubicación'}
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
                  ¿Eliminar <span className="font-semibold font-mono">{deleteRow.codigo}</span>? Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setDeleteRow(null)}
                  className="px-3 py-1.5 rounded-lg border border-warm-200 text-xs font-semibold text-warm-600 hover:bg-warm-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!!deletingId}
                  className="px-3 py-1.5 rounded-lg bg-danger-600 text-white text-xs font-semibold hover:bg-danger-700 disabled:opacity-60 transition-colors"
                >
                  {deletingId ? '...' : 'Eliminar'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  )
}
