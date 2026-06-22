import { CloudOff, RefreshCw } from 'lucide-react'

/**
 * Blocking modal shown when the device is offline and the required working data
 * has not been loaded yet. There is no way to dismiss it — the user must restore
 * connectivity.
 */
export default function OfflineBlockedModal({ isBlocked, message }) {
  if (!isBlocked) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <CloudOff className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-warm-900 mb-2">Sin conexión</h2>
        <p className="text-sm text-warm-600 leading-relaxed">
          {message || 'Los datos de trabajo no han sido cargados. Restablece la conexión a Internet para continuar.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-warm-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Esperando conexión...
        </div>
      </div>
    </div>
  )
}
