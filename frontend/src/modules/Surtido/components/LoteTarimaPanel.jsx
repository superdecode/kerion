import { useState, useRef, useEffect } from 'react'
import { Layers, MapPin, Check, Trash2, X } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtTimeShort } from '../../../core/utils/dateFormat'

export default function LoteTarimaPanel({ draft, onCloseTarima, onRemoveTarima, canRemoveTarima }) {
  const { t } = useI18nStore()
  const [capturando, setCapturando] = useState(false)
  const [ubicacion, setUbicacion] = useState('')
  const [confirmarBorrado, setConfirmarBorrado] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (capturando) requestAnimationFrame(() => inputRef.current?.focus())
  }, [capturando])

  const cajasEnTarima = draft.scans.filter(
    s => s.tarimaRef === draft.activeTarimaRef && s.result === 'ok'
  ).length
  const cerradas = draft.tarimas.filter(tar => tar.closedAt)

  function confirmarUbicacion() {
    const valor = ubicacion.trim()
    if (!valor) return
    const error = onCloseTarima(valor)
    if (!error) {
      setUbicacion('')
      setCapturando(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-warm-100 flex items-center gap-2">
        <Layers size={14} className="text-accent-500 shrink-0" />
        <span className="text-xs font-semibold text-warm-600">{t('surtido.lote.tarima.activa')}</span>
        <span className="font-mono font-semibold text-primary-700 text-sm">{draft.activeTarimaRef}</span>
        <span className="ml-auto text-[11px] text-warm-500 tabular-nums">
          {cajasEnTarima} {t('surtido.lote.tarima.cajas')}
        </span>
      </div>

      <div className="px-4 py-3">
        {capturando ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
              <input
                ref={inputRef}
                value={ubicacion}
                onChange={e => setUbicacion(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); confirmarUbicacion() }
                  if (e.key === 'Escape') { setCapturando(false); setUbicacion('') }
                }}
                placeholder={t('surtido.lote.tarima.ubicacionPlaceholder')}
                aria-label={t('surtido.lote.tarima.ubicacion')}
                className="input-field w-full text-sm font-mono pl-8"
              />
            </div>
            <button
              onClick={confirmarUbicacion}
              disabled={!ubicacion.trim()}
              className="btn-primary inline-flex items-center gap-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={13} /> {t('common.save')}
            </button>
            <button
              onClick={() => { setCapturando(false); setUbicacion('') }}
              aria-label={t('common.cancel')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-warm-200 text-warm-500 hover:bg-warm-100 transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCapturando(true)}
            disabled={cajasEnTarima === 0}
            className="btn-secondary w-full inline-flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MapPin size={14} /> {t('surtido.lote.tarima.cerrar')}
          </button>
        )}
      </div>

      {cerradas.length > 0 && (
        <div className="border-t border-warm-100">
          <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-warm-400">
            {t('surtido.lote.tarima.cerradas')}
          </p>
          <div className="divide-y divide-warm-100">
            {cerradas.map(tar => {
              const cajas = draft.scans.filter(s => s.tarimaRef === tar.ref && s.result === 'ok').length
              const puedeBorrar = canRemoveTarima(tar.ref)
              return (
                <div key={tar.ref} className="px-4 py-2 flex items-center gap-2">
                  <span className="font-mono font-semibold text-primary-700 text-xs shrink-0">{tar.ref}</span>
                  <span className="font-mono text-xs text-warm-600 truncate">{tar.ubicacionNota}</span>
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
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
