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

const ESTADO_META = {
  abierta:    { cls: 'bg-primary-100 text-primary-700 border-primary-200', dot: 'bg-primary-500', label: 'Abierta' },
  en_proceso: { cls: 'bg-warning-100 text-warning-700 border-warning-200', dot: 'bg-warning-500', label: 'En proceso' },
  resuelta:   { cls: 'bg-success-100 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Resuelta' },
  cerrada:    { cls: 'bg-warm-100 text-warm-500 border-warm-200', dot: 'bg-warm-400', label: 'Cerrada' },
}

const CARD_BORDER = {
  abierta:    'border-primary-200/60 hover:border-primary-300 hover:shadow-[0_4px_12px_-4px_rgba(99,102,241,0.15)]',
  en_proceso: 'border-warning-200/60 hover:border-warning-300 hover:shadow-[0_4px_12px_-4px_rgba(245,158,11,0.15)]',
  resuelta:   'border-success-200/60 hover:border-success-300 hover:shadow-[0_4px_12px_-4px_rgba(34,197,94,0.15)]',
  cerrada:    'border-warm-200/60 hover:border-warm-300 hover:shadow-[0_4px_12px_-4px_rgba(120,113,108,0.10)]',
}

function EstadoChip({ estado }) {
  const meta = ESTADO_META[estado] || ESTADO_META.abierta
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function KanbanCard({ orden }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: orden.id })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.35 : 1,
  } : {}

  const borderCls = CARD_BORDER[orden.estado] || CARD_BORDER.cerrada

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white/90 rounded-xl border p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all ${borderCls}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs font-semibold text-primary-700 leading-tight">{orden.folio}</span>
        <EstadoChip estado={orden.estado} />
      </div>
      {orden.outbound_order_no && (
        <p className="text-xs text-warm-600 font-mono truncate mb-1">{orden.outbound_order_no}</p>
      )}
      {orden.customer_code && (
        <p className="text-xs text-warm-500 truncate mb-1">{orden.customer_code}</p>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-warm-100/60">
        <span className="flex items-center gap-1 text-xs text-warm-400">
          <Package size={11} />
          {orden.total_cajas || 0} caja{orden.total_cajas !== 1 ? 's' : ''}
        </span>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => navigate(`/Inventario/rastreo/${orden.folio}`)}
          className="p-1 rounded-lg hover:bg-primary-50 text-warm-300 hover:text-primary-600 transition-colors"
        >
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function KanbanColumn({ column, ordenes }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex-1 min-w-[200px] max-w-[280px]">
      <div className="flex items-center gap-2.5 mb-3 px-1">
        {column.userId ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[11px] font-bold shadow-sm flex-shrink-0">
            {getInitials(column.label)}
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-warm-100 flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-warm-400" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-warm-800 truncate">{column.label}</p>
          <p className="text-[11px] text-warm-400">{ordenes.length} orden{ordenes.length !== 1 ? 'es' : ''}</p>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] rounded-xl p-2 flex flex-col gap-2 transition-all
          ${isOver
            ? 'bg-primary-50 border-2 border-dashed border-primary-300 shadow-inner'
            : 'bg-gradient-to-b from-warm-50/70 to-white/40 border border-warm-200/70'}`}
      >
        {ordenes.map(o => <KanbanCard key={o.id} orden={o} />)}
        {ordenes.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-xs text-warm-300 py-6">
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
    const assignedUserIds = new Set(ordenes.map(o => o.asignado_a ? String(o.asignado_a) : null).filter(Boolean))
    const cols = [{ id: 'ninguno', label: 'Sin asignar', userId: null }]
    usuarios
      .filter(u => assignedUserIds.has(String(u.id)))
      .forEach(u => cols.push({ id: String(u.id), label: u.nombre_completo, userId: u.id }))
    return cols
  }, [usuarios, ordenes])

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
