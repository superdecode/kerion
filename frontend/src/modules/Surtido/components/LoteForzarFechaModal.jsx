import { AlertTriangle } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'

/**
 * Única puerta por la que una caja de otra fecha entra al lote.
 * El mensaje nombra la orden y las dos fechas: el operador tiene que poder
 * decidir si es un error de fecha o realmente es la caja correcta.
 */
export default function LoteForzarFechaModal({ isOpen, outcome, onConfirm, onCancel }) {
  const { t } = useI18nStore()

  const body = t('surtido.lote.forzar.body')
    .replace('{orden}', outcome?.orderNo ?? '')
    .replace('{fechaOrden}', outcome?.orderDateKey ?? '')
    .replace('{fechaLote}', outcome?.loteDateKey ?? '')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={t('surtido.lote.forzar.title')}
      icon={AlertTriangle}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary text-sm">
            {t('surtido.lote.forzar.cancelar')}
          </button>
          <button onClick={onConfirm} className="btn-primary text-sm bg-warning-600 hover:bg-warning-700">
            {t('surtido.lote.forzar.confirmar')}
          </button>
        </div>
      }
    >
      <div className="rounded-xl border border-warning-200 bg-warning-50/60 px-3 py-2.5">
        <p className="text-sm text-warm-700 leading-relaxed">{body}</p>
      </div>
      {outcome?.code && (
        <p className="mt-2 font-mono text-xs text-warm-600">{outcome.code}</p>
      )}
    </Modal>
  )
}
