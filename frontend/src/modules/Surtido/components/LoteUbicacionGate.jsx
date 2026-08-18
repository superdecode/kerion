import { useState, useRef, useEffect } from 'react'
import { MapPin, Check } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'

/**
 * Puerta de entrada de la validación por lote: la ubicación se pide antes de
 * habilitar el escaneo, igual que en el modo por orden. Bloquea el paso
 * mientras la tarima activa no tenga una ubicación fijada.
 */
export default function LoteUbicacionGate({ tarimaRef, onConfirm, error, isActive }) {
  const { t } = useI18nStore()
  const [valor, setValor] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isActive) requestAnimationFrame(() => inputRef.current?.focus())
  }, [isActive])

  function confirmar() {
    const texto = valor.trim()
    if (!texto) return
    const err = onConfirm(texto)
    if (!err) setValor('')
  }

  return (
    <div className="card p-4 border-2 border-accent-300 bg-accent-50/40 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-accent-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-accent-700">{t('surtido.lote.tarima.ubicacion')}</p>
          <p className="text-[11px] text-warm-500">
            {t('surtido.lote.tarima.ubicacionAyuda').replace('{tarima}', tarimaRef)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
          placeholder={t('surtido.lote.tarima.ubicacionPlaceholder')}
          aria-label={t('surtido.lote.tarima.ubicacion')}
          className="input-field flex-1 min-w-0 text-sm font-mono"
        />
        <button
          onClick={confirmar}
          disabled={!valor.trim()}
          className="btn-primary inline-flex items-center gap-1.5 text-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} /> {t('common.save')}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-danger-600">{error}</p>}
    </div>
  )
}
