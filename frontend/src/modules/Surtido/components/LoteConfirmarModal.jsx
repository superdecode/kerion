import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'

export default function LoteConfirmarModal({
  isOpen, mode, summary, tarimaAbierta, notes, onNotesChange, onConfirm, onClose, isPending,
}) {
  const { t } = useI18nStore()
  const esCancelar = mode === 'cancelar'

  const bodyConfirmar = t('surtido.lote.confirmar.body')
    .replace('{ordenes}', summary.ordenesConEscaneos)
    .replace('{cajas}', summary.cajasValidadas)
    .replace('{tarimas}', summary.tarimasCerradas)

  const bodyCancelar = t('surtido.lote.cancelar.body')
    .replace('{cajas}', summary.cajasValidadas)

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
            disabled={isPending || (!esCancelar && tarimaAbierta)}
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
        {esCancelar ? bodyCancelar : bodyConfirmar}
      </p>

      {!esCancelar && tarimaAbierta && (
        <div className="mt-2.5 rounded-xl border border-warning-200 bg-warning-50/60 px-3 py-2">
          <p className="text-xs font-medium text-warning-700">
            {t('surtido.lote.confirmar.tarimaAbierta')}
          </p>
        </div>
      )}

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
