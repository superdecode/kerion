import {
  Clock, User, AlertTriangle, CheckCircle2, XCircle, Edit3,
  Package, RefreshCw, ScanLine, UserPlus, FileText, ListPlus, MinusCircle,
} from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'
import { useI18nStore } from '../../stores/i18nStore'
import { fmtDateTime } from '../../utils/dateFormat'

const STATUS_LABEL_KEYS = {
  pending_assignment: 'logs.status.pending_assignment',
  assigned: 'logs.status.assigned',
  sorting: 'logs.status.sorting',
  pending_validation: 'logs.status.pending_validation',
  validating: 'logs.status.validating',
  complete: 'logs.status.complete',
  partial: 'logs.status.partial',
  cancelled: 'logs.status.cancelled',
  pendiente: 'logs.status.pendiente',
  validada: 'logs.status.validada',
  faltante: 'logs.status.faltante',
  anormalidad: 'logs.status.anormalidad',
  reparacion: 'logs.status.reparacion',
  rastreo: 'logs.status.rastreo',
  open: 'logs.status.open',
  with_discrepancies: 'logs.status.with_discrepancies',
}

const FIELD_LABEL_KEYS = {
  conductor_id: 'logs.field.conductor_id',
  unidad_id: 'logs.field.unidad_id',
  notas: 'logs.field.notas',
  fecha_salida: 'logs.field.fecha_salida',
  validar_por_tarimas: 'logs.field.validar_por_tarimas',
}

function statusLabel(t, code) {
  if (!code) return '—'
  const key = STATUS_LABEL_KEYS[code]
  return key ? t(key) : code
}

function fill(template, values) {
  return Object.entries(values).reduce(
    (str, [key, value]) => str.replace(`{${key}}`, value ?? '—'),
    template
  )
}

function describeEvent(entry, t) {
  const d = entry.details || {}
  switch (entry.action) {
    case 'SURTIDO_ORDER_STATUS_CHANGE':
      return { icon: RefreshCw, text: fill(t('logs.action.SURTIDO_ORDER_STATUS_CHANGE'), { from: statusLabel(t, d.from), to: statusLabel(t, d.to) }) }
    case 'SURTIDO_ORDER_ASSIGNED':
      return d.surtidor_nombre
        ? { icon: UserPlus, text: fill(t('logs.action.SURTIDO_ORDER_ASSIGNED'), { surtidor: d.surtidor_nombre }) }
        : { icon: UserPlus, text: t('logs.action.SURTIDO_ORDER_ASSIGNED_REMOVED') }
    case 'SURTIDO_BOX_STATUS_CHANGE':
      return { icon: AlertTriangle, text: fill(t('logs.action.SURTIDO_BOX_STATUS_CHANGE'), { box: d.box_code, from: statusLabel(t, d.from), to: statusLabel(t, d.to) }) }
    case 'SURTIDO_SESSION_UPDATE': {
      const parts = []
      if (d.status) parts.push(fill(t('logs.action.SURTIDO_SESSION_UPDATE_STATUS'), { from: statusLabel(t, d.status.from), to: statusLabel(t, d.status.to) }))
      if (d.ubicacion_nota) parts.push(fill(t('logs.action.SURTIDO_SESSION_UPDATE_UBICACION'), { from: d.ubicacion_nota.from || '—', to: d.ubicacion_nota.to || '—' }))
      return { icon: Edit3, text: parts.join(' · ') || t('logs.action.SURTIDO_SESSION_UPDATE_STATUS') }
    }
    case 'SURTIDO_EVENT_UPDATE': {
      const parts = []
      if (d.ubicacion_nota) parts.push(fill(t('logs.action.SURTIDO_EVENT_UPDATE_UBICACION'), { box: d.box_code, from: d.ubicacion_nota.from || '—', to: d.ubicacion_nota.to || '—' }))
      if (d.code) parts.push(fill(t('logs.action.SURTIDO_EVENT_UPDATE_CODE'), { from: d.code.from || '—', to: d.code.to || '—' }))
      return { icon: Edit3, text: parts.join(' · ') }
    }
    case 'DESPACHO_FOLIO_CREATE':
      return { icon: FileText, text: fill(t('logs.action.DESPACHO_FOLIO_CREATE'), { n: d.orders_added ?? 0 }) }
    case 'DESPACHO_FOLIO_EDIT': {
      const fields = (d.fields || []).map(f => t(FIELD_LABEL_KEYS[f] || f)).join(', ')
      return { icon: Edit3, text: fill(t('logs.action.DESPACHO_FOLIO_EDIT'), { fields }) }
    }
    case 'DESPACHO_FOLIO_CERRAR':
      return { icon: CheckCircle2, text: t('logs.action.DESPACHO_FOLIO_CERRAR') }
    case 'DESPACHO_FOLIO_REABRIR':
      return { icon: RefreshCw, text: t('logs.action.DESPACHO_FOLIO_REABRIR') }
    case 'DESPACHO_FOLIO_CANCELAR':
      return { icon: XCircle, text: t('logs.action.DESPACHO_FOLIO_CANCELAR') }
    case 'DESPACHO_FOLIO_ORDER_ADD':
      return d.bulk
        ? { icon: ListPlus, text: fill(t('logs.action.DESPACHO_FOLIO_ORDER_ADD_BULK'), { n: d.orders_added ?? 0 }) }
        : { icon: ListPlus, text: fill(t('logs.action.DESPACHO_FOLIO_ORDER_ADD'), { obc: d.outbound_order_no }) }
    case 'DESPACHO_DESTINO_ORDER_REMOVE':
      return { icon: MinusCircle, text: fill(t('logs.action.DESPACHO_DESTINO_ORDER_REMOVE'), { obc: d.outbound_order_no }) }
    default:
      return { icon: Package, text: entry.action }
  }
}

function EventRow({ entry, t }) {
  const { icon: Icon, text } = describeEvent(entry, t)
  return (
    <div className="flex items-start gap-3 py-2.5 px-1">
      <div className="w-7 h-7 rounded-lg bg-warm-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-warm-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-warm-800">{text}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-warm-400">
          {entry.actor_name && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" />{entry.actor_name}
            </span>
          )}
          <span className="tabular-nums">{fmtDateTime(entry.at)}</span>
        </div>
      </div>
    </div>
  )
}

function ValidationPeriodRow({ entry, t }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-1">
      <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 mt-0.5">
        <ScanLine className="w-3.5 h-3.5 text-primary-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-warm-400 mb-0.5">
          {entry.actor_name && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-warm-800">
              <User className="w-3 h-3" />{entry.actor_name}
            </span>
          )}
          <span className="badge bg-primary-100 text-primary-700 text-[10px]">
            {fill(t('logs.scanPeriod.count'), { n: entry.scan_count ?? 0 })}
          </span>
        </div>
        <p className="text-xs text-warm-500 tabular-nums">
          {t('logs.scanPeriod.first')} {fmtDateTime(entry.started_at)}
          {entry.ended_at && entry.ended_at !== entry.started_at && (
            <> · {t('logs.scanPeriod.last')} {fmtDateTime(entry.ended_at)}</>
          )}
        </p>
      </div>
    </div>
  )
}

export default function LogsTimeline({ entries, isLoading }) {
  const { t } = useI18nStore()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <LoadingSpinner size="sm" text={t('common.loading')} />
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-2 text-warm-300">
        <Clock className="w-8 h-8 opacity-50" />
        <p className="text-xs text-warm-400">{t('logs.empty')}</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-warm-50">
      {entries.map((entry, i) => (
        entry.type === 'validation_period'
          ? <ValidationPeriodRow key={`period-${entry.actor_name || 'unknown'}-${i}`} entry={entry} t={t} />
          : <EventRow key={entry.id ?? `event-${i}`} entry={entry} t={t} />
      ))}
    </div>
  )
}
