import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, User, ChevronRight } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'

const ESTADO_GROUPS = [
  {
    key: 'abierta',
    labelKey: 'rastreo.group.abierta',
    headerCls: 'bg-gradient-to-r from-primary-500 to-primary-600 text-white',
    bodyCls: 'bg-primary-50/25 border-primary-200/50',
    dotCls: 'bg-primary-500',
    cardHover: 'hover:border-primary-300/60 hover:shadow-[0_4px_12px_-4px_rgba(99,102,241,0.12)]',
  },
  {
    key: 'en_proceso',
    labelKey: 'rastreo.group.en_proceso',
    headerCls: 'bg-gradient-to-r from-amber-400 to-orange-400 text-white',
    bodyCls: 'bg-amber-50/25 border-amber-200/50',
    dotCls: 'bg-amber-400',
    cardHover: 'hover:border-amber-300/60 hover:shadow-[0_4px_12px_-4px_rgba(245,158,11,0.12)]',
  },
  {
    key: 'parcial',
    labelKey: 'rastreo.group.parcial',
    headerCls: 'bg-gradient-to-r from-accent-500 to-violet-500 text-white',
    bodyCls: 'bg-accent-50/25 border-accent-200/50',
    dotCls: 'bg-accent-500',
    cardHover: 'hover:border-accent-300/60 hover:shadow-[0_4px_12px_-4px_rgba(168,85,247,0.12)]',
  },
  {
    key: 'completada',
    labelKey: 'rastreo.group.completada',
    headerCls: 'bg-gradient-to-r from-success-500 to-emerald-500 text-white',
    bodyCls: 'bg-success-50/25 border-success-200/50',
    dotCls: 'bg-success-500',
    cardHover: 'hover:border-success-300/60 hover:shadow-[0_4px_12px_-4px_rgba(34,197,94,0.12)]',
  },
  {
    key: 'cancelada',
    labelKey: 'rastreo.group.cancelada',
    headerCls: 'bg-gradient-to-r from-warm-400 to-warm-500 text-white',
    bodyCls: 'bg-warm-50/50 border-warm-200/50',
    dotCls: 'bg-warm-400',
    cardHover: 'hover:border-warm-300 hover:shadow-sm',
  },
]

function OrdenCard({ orden, cardHover }) {
  const navigate = useNavigate()
  const { t } = useI18nStore()

  return (
    <button
      onClick={() => navigate(`/Inventario/rastreo/${orden.folio}`)}
      className={`w-full text-left bg-white rounded-xl border border-warm-200/70 p-3 shadow-sm transition-all group ${cardHover}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs font-semibold text-primary-700 leading-tight">{orden.folio}</span>
        <ChevronRight size={13} className="text-warm-300 group-hover:text-primary-500 transition-colors flex-shrink-0 mt-0.5" />
      </div>
      {orden.outbound_order_no && (
        <p className="text-xs text-warm-600 font-mono truncate mb-1">{orden.outbound_order_no}</p>
      )}
      {orden.customer_code && (
        <p className="text-xs text-warm-500 truncate mb-1.5">{orden.customer_code}</p>
      )}
      <div className="flex items-center justify-between pt-1.5 border-t border-warm-100/60">
        <span className="flex items-center gap-1 text-xs text-warm-400">
          <Package size={10} />
          {orden.total_cajas || 0} {t('rastreo.items.cajas')}
        </span>
        {orden.asignado_nombre && (
          <span className="flex items-center gap-1 text-xs text-warm-400 truncate max-w-[110px]">
            <User size={10} className="flex-shrink-0" />
            {orden.asignado_nombre}
          </span>
        )}
      </div>
    </button>
  )
}

export default function RastreoCards({ ordenes }) {
  const { t } = useI18nStore()
  const grouped = {}
  ordenes.forEach(o => {
    if (!grouped[o.estado]) grouped[o.estado] = []
    grouped[o.estado].push(o)
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {ESTADO_GROUPS.map(group => (
        <div key={group.key} className={`rounded-2xl border overflow-hidden shadow-sm ${group.bodyCls}`}>
          <div className={`px-4 py-3 flex items-center justify-between ${group.headerCls}`}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white/40" />
              <span className="text-sm font-semibold">{t(group.labelKey)}</span>
            </div>
            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">
              {(grouped[group.key] || []).length}
            </span>
          </div>
          <div className="p-2.5 flex flex-col gap-2 min-h-[80px]">
            {(grouped[group.key] || []).map(o => (
              <OrdenCard key={o.id} orden={o} cardHover={group.cardHover} />
            ))}
            {!grouped[group.key]?.length && (
              <div className="flex flex-col items-center justify-center py-6 gap-1.5">
                <div className={`w-2 h-2 rounded-full opacity-30 ${group.dotCls}`} />
                <p className="text-xs text-warm-300">{t('rastreo.noOrdenes')}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
