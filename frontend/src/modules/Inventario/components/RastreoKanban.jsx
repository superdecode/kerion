import React, { useState, useMemo } from 'react'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { useNavigate } from 'react-router-dom'
import { User, Package, ExternalLink } from 'lucide-react'
import { updateRastreoOrden } from '../../../core/services/rastreoService'

const ESTADO_COLOR = {
  abierta: 'bg-blue-100 text-blue-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  resuelta: 'bg-green-100 text-green-700',
  cerrada: 'bg-warm-100 text-warm-500',
}

function KanbanCard({ orden }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: orden.id })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.4 : 1,
  } : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-white rounded-lg border border-warm-200 p-3 shadow-sm cursor-grab hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs font-semibold text-primary-700">{orden.folio}</span>
        <span className={`badge text-[11px] font-semibold ${ESTADO_COLOR[orden.estado] || ''}`}>
          {orden.estado}
        </span>
      </div>
      {orden.outbound_order_no && (
        <p className="text-xs text-warm-700 font-medium truncate mb-1">{orden.outbound_order_no}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="flex items-center gap-1 text-xs text-warm-500">
          <Package size={11} />
          {orden.total_cajas || 0} caja(s)
        </span>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => navigate(`/Inventario/rastreo/${orden.folio}`)}
          className="p-1 rounded hover:bg-warm-100 text-warm-400 hover:text-primary-600 transition-colors"
        >
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function KanbanColumn({ column, ordenes }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex-1 min-w-[200px] max-w-[280px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-7 h-7 rounded-full bg-warm-200 flex items-center justify-center">
          <User size={13} className="text-warm-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-warm-800 truncate">{column.label}</p>
          <p className="text-[11px] text-warm-400">{ordenes.length} órden(es)</p>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] rounded-xl p-2 flex flex-col gap-2 transition-colors
          ${isOver ? 'bg-primary-50 border-2 border-dashed border-primary-300' : 'bg-warm-50 border border-warm-100'}`}
      >
        {ordenes.map(o => <KanbanCard key={o.id} orden={o} />)}
        {ordenes.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-xs text-warm-300 py-4">
            Sin órdenes
          </div>
        )}
      </div>
    </div>
  )
}

export default function RastreoKanban({ ordenes, usuarios, onReassigned }) {
  const [activeId, setActiveId] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const columns = useMemo(() => {
    const cols = [{ id: 'ninguno', label: 'Sin asignar', userId: null }]
    usuarios.forEach(u => cols.push({ id: String(u.id), label: u.nombre_completo, userId: u.id }))
    return cols
  }, [usuarios])

  const columnMap = useMemo(() => {
    const map = {}
    ordenes.forEach(o => {
      const key = o.asignado_a ? String(o.asignado_a) : 'ninguno'
      if (!map[key]) map[key] = []
      map[key].push(o)
    })
    return map
  }, [ordenes])

  const activeOrden = activeId ? ordenes.find(o => o.id === activeId) : null

  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const orden = ordenes.find(o => o.id === active.id)
    if (!orden) return

    const newAsignado = over.id === 'ninguno' ? null : parseInt(over.id)
    if (orden.asignado_a === newAsignado) return

    try {
      await updateRastreoOrden(orden.id, { asignado_a: newAsignado })
      onReassigned?.()
    } catch {
      // refetch will restore state on error
      onReassigned?.()
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={e => setActiveId(e.active.id)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            column={col}
            ordenes={columnMap[col.id] || []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeOrden && <KanbanCard orden={activeOrden} />}
      </DragOverlay>
    </DndContext>
  )
}
