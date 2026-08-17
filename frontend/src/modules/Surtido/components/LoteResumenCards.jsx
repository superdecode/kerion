import { useI18nStore } from '../../../core/stores/i18nStore'

// Mismo patrón que la tira de KPIs de Despacho (ValidarPorDestino): punto de
// color + etiqueta en mayúsculas arriba, número grande abajo.
function Kpi({ label, value, accent, tone }) {
  return (
    <div className="min-w-0 rounded-xl border border-warm-200 bg-warm-50 px-2 py-1.5 sm:px-3 sm:py-2">
      <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${accent}`} />
        <span className="text-[9px] sm:text-[10px] font-semibold text-warm-400 uppercase tracking-wider leading-none truncate">
          {label}
        </span>
      </div>
      <span className={`font-mono font-black tabular-nums text-lg sm:text-2xl leading-none ${tone}`}>{value}</span>
    </div>
  )
}

export default function LoteResumenCards({ summary }) {
  const { t } = useI18nStore()

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
      <Kpi
        label={t('surtido.lote.resumen.ordenes')}
        value={`${summary.ordenesCompletas}/${summary.ordenesTotal}`}
        accent="bg-primary-500"
        tone="text-warm-900"
      />
      <Kpi
        label={t('surtido.lote.resumen.cajas')}
        value={`${summary.cajasValidadas}/${summary.cajasEsperadas}`}
        accent="bg-success-500"
        tone={summary.cajasValidadas > 0 ? 'text-success-600' : 'text-warm-400'}
      />
      <Kpi
        label={t('surtido.lote.resumen.tarimas')}
        value={`${summary.tarimasCerradas} · ${summary.tarimaActiva}`}
        accent="bg-accent-500"
        tone="text-warm-900"
      />
    </div>
  )
}
