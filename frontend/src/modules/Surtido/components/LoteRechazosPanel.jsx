import { XCircle, AlertCircle, Lock } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtTimeShort } from '../../../core/utils/dateFormat'

const RAZONES = {
  not_found: { label: 'surtido.lote.rechazos.razon.notFound', icon: XCircle, fg: 'text-danger-600' },
  ambiguous: { label: 'surtido.lote.rechazos.razon.ambiguous', icon: XCircle, fg: 'text-danger-600' },
  already_validated: { label: 'surtido.lote.rechazos.razon.alreadyValidated', icon: Lock, fg: 'text-danger-600' },
  duplicate: { label: 'surtido.lote.rechazos.razon.duplicate', icon: AlertCircle, fg: 'text-warning-600' },
}

/**
 * Trazabilidad de lo que NO se pudo validar: sin match, ambiguo, de una orden
 * cerrada, o repetido. Cada uno ya se envió al servidor en tiempo real
 * (pick_rejections) apenas ocurrió; esta lista es la vista local, disponible
 * incluso si el lote termina cancelado.
 */
export default function LoteRechazosPanel({ rejected }) {
  const { t } = useI18nStore()

  if (rejected.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-xs text-warm-400">{t('surtido.lote.rechazos.vacio')}</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-warm-100">
      {rejected.map(scan => {
        const razon = RAZONES[scan.result] ?? RAZONES.not_found
        const Icon = razon.icon
        return (
          <div key={scan.id} className="px-3.5 py-2.5 flex items-center gap-2.5">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${razon.fg}`} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-warm-600 truncate">{scan.code}</p>
              {scan.orderNo && (
                <p className="font-mono text-[11px] font-semibold text-primary-700 truncate">{scan.orderNo}</p>
              )}
            </div>
            <span className={`text-[11px] font-semibold shrink-0 ${razon.fg}`}>{t(razon.label)}</span>
            <span className="font-mono text-[11px] text-warm-500 font-semibold shrink-0">{scan.tarimaRef}</span>
            <span className="text-[11px] text-warm-400 tabular-nums shrink-0">{fmtTimeShort(new Date(scan.ts))}</span>
          </div>
        )
      })}
    </div>
  )
}
