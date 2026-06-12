import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, User, ChevronRight } from 'lucide-react'

const ESTADO_GROUPS = [
  { key: 'abierta', label: 'Abiertas', color: 'border-blue-200 bg-blue-50', headerColor: 'bg-blue-500 text-white' },
  { key: 'en_proceso', label: 'En proceso', color: 'border-amber-200 bg-amber-50', headerColor: 'bg-amber-500 text-white' },
  { key: 'resuelta', label: 'Resueltas', color: 'border-green-200 bg-green-50', headerColor: 'bg-green-600 text-white' },
  { key: 'cerrada', label: 'Cerradas', color: 'border-warm-200 bg-warm-50', headerColor: 'bg-warm-400 text-white' },
]

function OrdenCard({ orden }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(`/Inventario/rastreo/${orden.folio}`)}
      className="w-full text-left bg-white rounded-lg border border-warm-200 p-3 shadow-sm hover:shadow-md hover:border-primary-300 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-semibold text-primary-700">{orden.folio}</span>
        <ChevronRight size={13} className="text-warm-300 group-hover:text-primary-500 transition-colors flex-shrink-0 mt-0.5" />
      </div>
      {orden.outbound_order_no && (
        <p className="text-xs text-warm-700 font-medium truncate mb-1">{orden.outbound_order_no}</p>
      )}
      {orden.customer_code && (
        <p className="text-xs text-warm-500 truncate mb-2">{orden.customer_code}</p>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-warm-100">
        <span className="flex items-center gap-1 text-xs text-warm-400">
          <Package size={10} />
          {orden.total_cajas || 0}
        </span>
        {orden.asignado_nombre && (
          <span className="flex items-center gap-1 text-xs text-warm-400 truncate max-w-[100px]">
            <User size={10} className="flex-shrink-0" />
            {orden.asignado_nombre}
          </span>
        )}
      </div>
    </button>
  )
}

export default function RastreoCards({ ordenes }) {
  const grouped = {}
  ordenes.forEach(o => {
    if (!grouped[o.estado]) grouped[o.estado] = []
    grouped[o.estado].push(o)
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {ESTADO_GROUPS.map(group => (
        <div key={group.key} className={`rounded-xl border overflow-hidden ${group.color}`}>
          <div className={`px-4 py-2.5 flex items-center justify-between ${group.headerColor}`}>
            <span className="text-sm font-semibold">{group.label}</span>
            <span className="text-xs font-bold">{(grouped[group.key] || []).length}</span>
          </div>
          <div className="p-2 flex flex-col gap-2 min-h-[80px]">
            {(grouped[group.key] || []).map(o => (
              <OrdenCard key={o.id} orden={o} />
            ))}
            {!grouped[group.key]?.length && (
              <p className="text-xs text-warm-300 text-center py-4">Sin órdenes</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
