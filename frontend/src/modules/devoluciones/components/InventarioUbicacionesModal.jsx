import { useState } from 'react'
import { MapPin, Upload, Power, Trash2 } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { createUbicacion, deleteUbicacion, updateUbicacion, importUbicaciones } from '../services/devolucionesService'
import { useToastStore } from '../../../core/stores/toastStore'

export default function InventarioUbicacionesModal({ isOpen, onClose, ubicaciones = [], onSaved }) {
  const toast = useToastStore()
  const [form, setForm] = useState({ codigo: '', nombre: '', descripcion: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const handleSave = async () => {
    if (!form.codigo.trim() || !form.nombre.trim()) return
    setSaving(true)
    try {
      await createUbicacion(form)
      setForm({ codigo: '', nombre: '', descripcion: '' })
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
      await updateUbicacion(row.id, { activo: !row.activo })
      onSaved?.()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  const handleDelete = async (row) => {
    if ((row.pcs_en_stock || row.pcs_stock || 0) > 0) {
      toast.error('No se puede eliminar: tiene inventario activo. Desactívala en su lugar.')
      return
    }
    try {
      await deleteUbicacion(row.id)
      onSaved?.()
      setDeletingId(null)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al eliminar')
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

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestión de ubicaciones" icon={MapPin} size="xl">
      <div className="space-y-5">
        {/* Formulario agregar */}
        <div className="bg-warm-50/60 rounded-2xl border border-warm-100 p-4 space-y-3">
          <div className="text-xs font-semibold text-warm-500 uppercase tracking-wide">Nueva ubicación</div>
          <div className="grid grid-cols-[120px,1fr,1fr] gap-2">
            <div>
              <label className="block text-[11px] text-warm-500 mb-1">Código</label>
              <input value={form.codigo} onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))} placeholder="U-01" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-warm-500 mb-1">Nombre</label>
              <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Bodega principal" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-warm-500 mb-1">Descripción (opcional)</label>
              <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción" className={inputCls} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !form.codigo.trim() || !form.nombre.trim()}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Agregar ubicación'}
            </button>
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50 cursor-pointer">
              <Upload className="w-4 h-4" /> Importar Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            </label>
            <span className="text-xs text-warm-400">Columnas: codigo, nombre, descripcion</span>
          </div>
        </div>

        {/* Tabla ubicaciones */}
        <div className="border border-warm-100 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100 bg-warm-50/50">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5 text-right">Pcs en stock</th>
                <th className="px-4 py-2.5 text-center">Activo</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ubicaciones.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-warm-400">Sin ubicaciones</td></tr>
              ) : ubicaciones.map(row => {
                const stock = row.pcs_en_stock ?? row.pcs_stock ?? 0
                return (
                  <tr key={row.id} className="border-b border-warm-50 hover:bg-warm-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-warm-800">{row.codigo}</td>
                    <td className="px-4 py-2.5 text-warm-700">{row.nombre}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-medium ${stock > 0 ? 'text-success-700' : 'text-warm-400'}`}>{stock}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`badge text-[10px] ${row.activo !== false ? 'bg-success-100 text-success-700' : 'bg-warm-100 text-warm-500'}`}>
                        {row.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleActivo(row)}
                          title={row.activo !== false ? 'Desactivar' : 'Activar'}
                          className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-warm-700"
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => stock > 0 ? toast.error('Tiene inventario activo. Desactívala primero.') : handleDelete(row)}
                          title={stock > 0 ? 'No eliminable: tiene stock' : 'Eliminar'}
                          className={`p-1.5 rounded-lg transition-colors ${stock > 0 ? 'text-warm-200 cursor-not-allowed' : 'hover:bg-danger-50 text-warm-400 hover:text-danger-600'}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
