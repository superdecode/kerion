import { Package, Boxes, Layers } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'

function Card({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="card px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone.bg}`}>
        <Icon className={`w-4 h-4 ${tone.fg}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-warm-500 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-warm-800 leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-warm-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}

export default function LoteResumenCards({ summary }) {
  const { t } = useI18nStore()

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Card
        icon={Package}
        label={t('surtido.lote.resumen.ordenes')}
        value={`${summary.ordenesCompletas}/${summary.ordenesTotal}`}
        tone={{ bg: 'bg-primary-100', fg: 'text-primary-600' }}
      />
      <Card
        icon={Boxes}
        label={t('surtido.lote.resumen.cajas')}
        value={`${summary.cajasValidadas}/${summary.cajasEsperadas}`}
        tone={{ bg: 'bg-success-100', fg: 'text-success-600' }}
      />
      <Card
        icon={Layers}
        label={t('surtido.lote.resumen.tarimas')}
        value={summary.tarimasCerradas}
        sub={summary.tarimaActiva}
        tone={{ bg: 'bg-accent-100', fg: 'text-accent-600' }}
      />
    </div>
  )
}
