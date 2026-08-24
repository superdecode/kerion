import { useState } from 'react'
import { MoveRight, Trash2, X, Radio, ChevronDown, CheckCircle2 } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDateTimeMini, fmtTimeShort } from '../../../core/utils/dateFormat'

// Lista de cajas escaneadas de una tarima (activa o cerrada), con fecha,
// hora y OBC asignado — el mismo detalle que ya se ve por orden en el panel
// derecho, pero agrupado por tarima para revisarla sin buscar orden por orden.
function ScansList({ scans, t }) {
  if (scans.length === 0) {
    return <p className="px-4 pb-3 pt-1 text-[11px] text-warm-400">{t('surtido.lote.tarima.sinEscaneos')}</p>
  }
  return (
    <div className="px-4 pb-3 pt-1 space-y-1 border-t border-warm-100">
      {scans.map(scan => (
        <div key={scan.id} className="flex items-center gap-1.5 text-[11px] pt-1.5">
          <CheckCircle2 size={10} className="text-success-500 shrink-0" />
          <span className="font-mono text-warm-600 truncate">{scan.code}</span>
          {scan.orderNo && (
            <span className="badge text-[9px] font-mono font-semibold bg-primary-50 text-primary-700 shrink-0">
              {scan.orderNo}
            </span>
          )}
          {scan.forcedDateMismatch && (
            <span className="badge text-[9px] font-semibold bg-warning-50 text-warning-700 shrink-0">
              {t('surtido.lote.forzada')}
            </span>
          )}
          <span className="ml-auto shrink-0 text-warm-400 tabular-nums">{fmtDateTimeMini(new Date(scan.ts))}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Barra compacta de la tarima activa (ya con ubicación — LoteUbicacionGate
 * resuelve eso antes de mostrar esto) más el listado de tarimas cerradas.
 * Un chevron por tarima expande el detalle de cajas escaneadas con su hora.
 */
export default function LoteTarimaPanel({ draft, onNextTarima, onRemoveTarima, canRemoveTarima }) {
  const { t } = useI18nStore()
  const [confirmarBorrado, setConfirmarBorrado] = useState(null)
  const [expandida, setExpandida] = useState(null)

  const activa = draft.tarimas.find(tar => tar.ref === draft.activeTarimaRef)
  const scansActiva = draft.scans.filter(
    s => s.tarimaRef === draft.activeTarimaRef && s.result === 'ok'
  )
  const cajasEnTarima = scansActiva.length
  const activaExpandida = expandida === draft.activeTarimaRef
  const cerradas = draft.tarimas.filter(tar => tar.closedAt)

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandida(activaExpandida ? null : draft.activeTarimaRef)}
        className="w-full px-4 py-3 flex items-center gap-2.5 flex-wrap hover:bg-warm-50/60 transition-colors text-left"
      >
        <span className="inline-flex items-center gap-1 rounded-full border border-accent-200 bg-accent-50 px-2.5 py-1 text-xs font-bold text-accent-700">
          <Radio className="w-3 h-3" />{draft.activeTarimaRef}
        </span>
        <span className="font-mono text-xs text-warm-600 truncate">{activa?.ubicacionNota}</span>
        <span className="text-[11px] text-warm-500 tabular-nums">
          {cajasEnTarima} {t('surtido.lote.tarima.cajas')}
        </span>
        <ChevronDown size={13} className={`text-warm-400 transition-transform ${activaExpandida ? 'rotate-180' : ''}`} />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNextTarima() }}
          disabled={cajasEnTarima === 0}
          title={cajasEnTarima === 0 ? t('surtido.lote.tarima.sinEscaneos') : ''}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-accent-300 bg-accent-50 text-accent-700 text-xs font-semibold hover:bg-accent-100 transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-accent-50"
        >
          <MoveRight className="w-3.5 h-3.5" />
          {t('surtido.lote.tarima.siguiente')}
        </button>
      </button>
      {activaExpandida && <ScansList scans={scansActiva} t={t} />}

      {cerradas.length > 0 && (
        <div className="border-t border-warm-100">
          <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-warm-400">
            {t('surtido.lote.tarima.cerradas')}
          </p>
          <div className="divide-y divide-warm-100">
            {cerradas.map(tar => {
              const scansTarima = draft.scans.filter(s => s.tarimaRef === tar.ref && s.result === 'ok')
              const cajas = scansTarima.length
              const puedeBorrar = canRemoveTarima(tar.ref)
              const tarimaExpandida = expandida === tar.ref
              return (
                <div key={tar.ref}>
                <div className="px-4 py-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandida(tarimaExpandida ? null : tar.ref)}
                    className="flex min-w-0 items-center gap-2 text-left"
                  >
                    <ChevronDown size={12} className={`shrink-0 text-warm-400 transition-transform ${tarimaExpandida ? 'rotate-180' : ''}`} />
                    <span className="font-mono font-semibold text-primary-700 text-xs shrink-0">{tar.ref}</span>
                    <span className="font-mono text-xs text-warm-600 truncate">{tar.ubicacionNota}</span>
                  </button>
                  <span className="ml-auto text-[11px] text-warm-400 tabular-nums shrink-0">
                    {cajas} · {fmtTimeShort(new Date(tar.closedAt))}
                  </span>
                  {puedeBorrar && (
                    confirmarBorrado === tar.ref ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { onRemoveTarima(tar.ref); setConfirmarBorrado(null) }}
                          className="px-2 py-1 rounded-lg bg-danger-50 text-danger-700 text-[11px] font-semibold hover:bg-danger-100 transition-colors"
                        >
                          {t('common.delete')}
                        </button>
                        <button
                          onClick={() => setConfirmarBorrado(null)}
                          aria-label={t('common.cancel')}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-warm-400 hover:bg-warm-100 transition-colors"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmarBorrado(tar.ref)}
                        title={t('surtido.lote.tarima.eliminarConfirm').replace('{ref}', tar.ref)}
                        aria-label={t('surtido.lote.tarima.eliminar')}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-warm-400 hover:bg-danger-50 hover:text-danger-600 transition-colors shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    )
                  )}
                </div>
                {tarimaExpandida && <ScansList scans={scansTarima} t={t} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
