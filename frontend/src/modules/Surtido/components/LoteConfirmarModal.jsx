import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'

// Mismas tarjetas KPI que LoteResumenCards (punto de color + etiqueta +
// número grande) — el resumen de la pantalla de confirmación debe leerse
// igual que el resto del flujo, no como un párrafo aparte.
function Kpi({ label, value, accent, tone }) {
  return (
    <div className="min-w-0 rounded-xl border border-warm-200 bg-warm-50 px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${accent}`} />
        <span className="text-[9px] font-semibold text-warm-400 uppercase tracking-wider leading-none truncate">
          {label}
        </span>
      </div>
      <span className={`font-mono font-black tabular-nums text-xl leading-none ${tone}`}>{value}</span>
    </div>
  )
}

export default function LoteConfirmarModal({
  isOpen, mode, summary, notes, onNotesChange, onConfirm, onClose, isPending,
}) {
  const { t } = useI18nStore()
  const esCancelar = mode === 'cancelar'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={esCancelar ? t('surtido.lote.cancelar.title') : t('surtido.lote.confirmar.title')}
      icon={esCancelar ? AlertTriangle : CheckCircle2}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={isPending} className="btn-secondary text-sm">
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
              esCancelar ? 'btn-danger' : 'btn-primary'
            }`}
          >
            {isPending && <Loader2 size={13} className="animate-spin" />}
            {esCancelar ? t('surtido.lote.cancelar.confirmar') : t('surtido.lote.confirmar')}
          </button>
        </div>
      }
    >
      <p className="text-sm text-warm-700 leading-relaxed">
        {esCancelar ? t('surtido.lote.cancelar.intro') : t('surtido.lote.confirmar.intro')}
      </p>

      {esCancelar ? (
        <div className="mt-3">
          <Kpi
            label={t('surtido.lote.cancelar.kpi.cajas')}
            value={summary.cajasValidadas}
            accent="bg-danger-500"
            tone="text-danger-600"
          />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Kpi
            label={t('surtido.lote.confirmar.kpi.ordenes')}
            value={`${summary.ordenesConEscaneos}/${summary.ordenesTotal}`}
            accent="bg-primary-500"
            tone="text-warm-900"
          />
          <Kpi
            label={t('surtido.lote.confirmar.kpi.cajas')}
            value={`${summary.cajasValidadas}/${summary.cajasEsperadas}`}
            accent="bg-success-500"
            tone="text-success-600"
          />
          <Kpi
            label={t('surtido.lote.confirmar.kpi.tarimas')}
            value={summary.tarimasCerradas}
            accent="bg-accent-500"
            tone="text-warm-900"
          />
        </div>
      )}

      <p className="mt-3 text-[11px] text-warm-400 leading-relaxed">
        {esCancelar ? t('surtido.lote.cancelar.warning') : t('surtido.lote.confirmar.warning')}
      </p>

      {!esCancelar && (
        <div className="mt-3">
          <label className="block text-[11px] font-semibold text-warm-600 mb-1">
            {t('surtido.lote.confirmar.notas')}
          </label>
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            rows={2}
            className="input-field w-full text-xs resize-none"
          />
        </div>
      )}
    </Modal>
  )
}
