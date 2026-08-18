import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, AlertCircle, Lock, Undo2 } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'

const ESTILOS = {
  ok:                 { icon: CheckCircle2, fg: 'text-success-700', bg: 'bg-success-50', border: 'border-success-200' },
  duplicate:          { icon: AlertCircle,  fg: 'text-warning-700', bg: 'bg-warning-50', border: 'border-warning-200' },
  not_found:          { icon: XCircle,      fg: 'text-danger-700',  bg: 'bg-danger-50',  border: 'border-danger-200' },
  ambiguous:          { icon: XCircle,      fg: 'text-danger-700',  bg: 'bg-danger-50',  border: 'border-danger-200' },
  already_validated:  { icon: Lock,         fg: 'text-danger-700',  bg: 'bg-danger-50',  border: 'border-danger-200' },
}

/**
 * Resultado del último escaneo: aparece fija sobre el área de escaneo y se
 * limpia sola (el padre la retira por temporizador). No es un historial —
 * solo el último evento, para no llenar la pantalla con un feed permanente.
 */
export default function LoteResultBar({ result, onUndo, canUndo }) {
  const { t } = useI18nStore()
  if (!result) return null

  const estilo = ESTILOS[result.result] ?? ESTILOS.not_found
  const Icon = estilo.icon

  const mensaje = {
    ok: `${t('surtido.lote.scan.ok')} ${result.orderNo}`,
    duplicate: `${t('surtido.lote.scan.duplicate')}: ${result.code}`,
    ambiguous: t('surtido.lote.scan.ambiguous'),
    not_found: t('surtido.lote.scan.notFound'),
    already_validated: `${t('surtido.lote.scan.alreadyValidated')} ${result.orderNo}`,
  }[result.result]

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={result.id}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${estilo.bg} ${estilo.border}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${estilo.fg}`} />
        <span className={`text-sm font-semibold truncate ${estilo.fg}`}>{mensaje}</span>
        <span className="shrink-0 font-mono text-xs text-warm-400">{result.code}</span>
        {canUndo && (
          <button
            onClick={onUndo}
            className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/60 transition-colors ${estilo.fg}`}
          >
            <Undo2 size={12} /> {t('surtido.lote.scan.deshacer')}
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
