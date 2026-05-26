import { useState, useEffect } from 'react'
import { PackageCheck } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'

export default function SurtidoConfirmModal({ isOpen, onClose, items = [], onConfirm, saving = false }) {
  const [local, setLocal] = useState([])

  useEffect(() => {
    setLocal(items.map(it => ({
      salida_item_id: it.id,
      sku: it.sku,
      descripcion: it.descripcion,
      codigo_trazabilidad: it.codigo_trazabilidad,
      ubicacion_nombre: it.ubicacion_nombre || it.ubicacion_codigo,
      cantidad_solicitada: it.cantidad_solicitada,
      cantidad_disponible: it.cantidad_disponible,
      cantidad_surtida: it.cantidad_solicitada,
      surtido: true,
    })))
  }, [items, isOpen])

  const update = (i, key, val) => setLocal(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  const handleConfirm = () => {
    onConfirm(local.map(r => ({
      salida_item_id: r.salida_item_id,
      cantidad_surtida: r.surtido ? Number(r.cantidad_surtida) : 0,
      surtido: r.surtido,
    })))
  }

  const totalSurtido = local.reduce((a, r) => a + (r.surtido ? Number(r.cantidad_surtida || 0) : 0), 0)
  const totalSolicitado = local.reduce((a, r) => a + Number(r.cantidad_solicitada || 0), 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirmar surtido"
      icon={PackageCheck}
      size="xl"
      footer={
        <>
          <div className="text-xs text-warm-500 mr-auto">
            {totalSurtido} / {totalSolicitado} piezas surtidas
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">Cancelar</button>
          <button onClick={handleConfirm} disabled={saving} className="px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold disabled:opacity-60">
            {saving ? 'Completando...' : 'Completar orden'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-warm-500 mb-3">Confirma las cantidades reales surtidas para cada línea.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-warm-500 border-b border-warm-100">
              <th className="pb-2">SKU</th>
              <th className="pb-2">Código</th>
              <th className="pb-2">Ubicación</th>
              <th className="pb-2 text-right">Solicitada</th>
              <th className="pb-2 text-right">Surtida</th>
              <th className="pb-2 text-center">¿Surtido?</th>
            </tr>
          </thead>
          <tbody>
            {local.map((row, i) => {
              const overStock = row.surtido && Number(row.cantidad_surtida) > (row.cantidad_disponible ?? Infinity)
              return (
                <tr key={i} className={`border-b border-warm-50 ${!row.surtido ? 'opacity-60' : ''}`}>
                  <td className="py-2.5 pr-3">
                    <div className="text-xs font-medium text-warm-800">{row.sku}</div>
                    {row.descripcion && <div className="text-[11px] text-warm-400">{row.descripcion}</div>}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-warm-500">{row.codigo_trazabilidad || '—'}</td>
                  <td className="py-2.5 pr-3 text-xs text-warm-500">{row.ubicacion_nombre || '—'}</td>
                  <td className="py-2.5 pr-3 text-right text-xs">{row.cantidad_solicitada}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <input
                      type="number" min="0"
                      value={row.cantidad_surtida}
                      onChange={e => update(i, 'cantidad_surtida', e.target.value)}
                      onFocus={e => e.target.select()}
                      disabled={!row.surtido}
                      className={`w-20 px-2 py-1 rounded-lg border text-xs text-right focus:outline-none focus:ring-2 focus:ring-primary-200 ${
                        overStock ? 'border-danger-400 bg-danger-50 text-danger-700' : 'border-warm-200'
                      }`}
                    />
                    {overStock && <div className="text-[10px] text-danger-500 mt-0.5">Excede stock</div>}
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => update(i, 'surtido', !row.surtido)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${row.surtido ? 'bg-success-500' : 'bg-warm-200'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${row.surtido ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
