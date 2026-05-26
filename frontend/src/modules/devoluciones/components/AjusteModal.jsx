import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowLeftRight, ClipboardList } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'

export default function AjusteModal({ isOpen, onClose, initialTipo = 'ajuste', inventario = [], ubicaciones = [], onSubmit, saving = false }) {
  const [tipo, setTipo] = useState(initialTipo)
  const [descripcion, setDescripcion] = useState('')
  const [ajustes, setAjustes] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [destinoId, setDestinoId] = useState('')

  useEffect(() => {
    setTipo(initialTipo)
    setDescripcion('')
    setAjustes([])
    setSelectedIds([])
    setDestinoId('')
  }, [isOpen, initialTipo])

  const addAjusteRow = () => setAjustes(prev => [...prev, { inventario_id: '', cantidad_nueva: '', motivo: '' }])
  const updateRow = (i, key, val) => setAjustes(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  const removeRow = (i) => setAjustes(prev => prev.filter((_, idx) => idx !== i))
  const toggleId = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSubmit = () => {
    if (tipo === 'ajuste') {
      const valid = ajustes.filter(r => r.inventario_id && r.cantidad_nueva !== '')
      if (!valid.length) return
      onSubmit({
        tipo: 'ajuste',
        descripcion,
        ajustes: valid.map(r => ({ inventario_id: r.inventario_id, cantidad_nueva: parseInt(r.cantidad_nueva), motivo: r.motivo || descripcion })),
      })
    } else {
      if (!selectedIds.length || !destinoId) return
      onSubmit({
        tipo: 'movimiento',
        descripcion,
        movimiento: { inventario_ids: selectedIds, ubicacion_destino_id: parseInt(destinoId) },
      })
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200'
  const labelCls = 'block text-[11px] text-warm-500 mb-1'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tipo === 'ajuste' ? 'Ajuste de inventario' : 'Mover mercancía'}
      icon={tipo === 'ajuste' ? ClipboardList : ArrowLeftRight}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-60">
            {saving ? 'Guardando...' : 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Selector tipo */}
        <div className="flex gap-2">
          {[
            { id: 'ajuste', label: 'Ajuste de cantidad', Icon: ClipboardList },
            { id: 'movimiento', label: 'Mover mercancía', Icon: ArrowLeftRight },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                tipo === t.id ? 'bg-primary-600 text-white border-transparent' : 'bg-white border-warm-200 text-warm-700 hover:bg-warm-50'
              }`}
            >
              <t.Icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div>
          <label className={labelCls}>Descripción / motivo general</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Ej. Conteo físico mensual" />
        </div>

        {/* AJUSTE */}
        {tipo === 'ajuste' && (
          <div className="space-y-3">
            <div className="text-xs text-warm-500 font-medium">Items a ajustar</div>
            {ajustes.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr,80px,1fr,36px] gap-2 items-end">
                <div>
                  <label className={labelCls}>Item</label>
                  <select value={row.inventario_id} onChange={e => updateRow(i, 'inventario_id', e.target.value)} className={inputCls}>
                    <option value="">Seleccionar...</option>
                    {inventario.map(inv => (
                      <option key={inv.id} value={inv.id}>{inv.sku} · {inv.codigo_trazabilidad} · {inv.cantidad_disponible} disp.</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Cant. real</label>
                  <input type="number" min="0" value={row.cantidad_nueva} onChange={e => updateRow(i, 'cantidad_nueva', e.target.value)} onFocus={e => e.target.select()} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Motivo (opcional)</label>
                  <input value={row.motivo} onChange={e => updateRow(i, 'motivo', e.target.value)} className={inputCls} placeholder="Motivo" />
                </div>
                <button onClick={() => removeRow(i)} className="p-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 self-end">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={addAjusteRow} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-warm-200 text-sm text-warm-700 hover:bg-warm-50">
              <Plus className="w-4 h-4" /> Agregar item
            </button>
          </div>
        )}

        {/* MOVIMIENTO */}
        {tipo === 'movimiento' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Ubicación destino</label>
              <select value={destinoId} onChange={e => setDestinoId(e.target.value)} className={inputCls}>
                <option value="">Seleccionar ubicación...</option>
                {ubicaciones.filter(u => u.activo !== false).map(u => (
                  <option key={u.id} value={u.id}>{u.codigo} — {u.nombre}</option>
                ))}
              </select>
            </div>
            <div className="text-xs text-warm-500 font-medium">Items a mover</div>
            <div className="border border-warm-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-warm-400 border-b border-warm-100 bg-warm-50">
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Ubicación</th>
                    <th className="px-3 py-2 text-right">Disp.</th>
                  </tr>
                </thead>
                <tbody>
                  {inventario.length === 0
                    ? <tr><td colSpan={5} className="px-3 py-6 text-center text-warm-400">Sin inventario</td></tr>
                    : inventario.map(inv => (
                      <tr
                        key={inv.id}
                        className={`border-b border-warm-50 cursor-pointer transition-colors ${selectedIds.includes(inv.id) ? 'bg-primary-50' : 'hover:bg-warm-50'}`}
                        onClick={() => toggleId(inv.id)}
                      >
                        <td className="px-3 py-2"><input type="checkbox" readOnly checked={selectedIds.includes(inv.id)} className="rounded" /></td>
                        <td className="px-3 py-2 font-mono">{inv.codigo_trazabilidad}</td>
                        <td className="px-3 py-2 font-medium text-warm-800">{inv.sku}</td>
                        <td className="px-3 py-2 text-warm-500">{inv.ubicacion_nombre || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{inv.cantidad_disponible}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            {selectedIds.length > 0 && (
              <div className="text-xs text-primary-600 font-medium">{selectedIds.length} items seleccionados</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
