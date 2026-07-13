import { useState } from 'react'
import { AlertTriangle, TrendingUp, X, ChevronRight, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

const MODULE_META = {
  dropscan:     { label: 'DropScan',     unit: 'guías',       color: 'blue' },
  surtido:      { label: 'Surtido',      unit: 'validaciones', color: 'purple' },
  inventario:   { label: 'Inventario',   unit: 'escaneos',    color: 'emerald' },
  devoluciones: { label: 'Devoluciones', unit: 'entradas',    color: 'amber' },
  recepcion:    { label: 'Recepción',    unit: 'entradas',    color: 'sky' },
  despacho:     { label: 'Despacho',     unit: 'folios',      color: 'orange' },
}

function UpgradeModal({ module, usage, onClose }) {
  const { user } = useAuthStore()
  const meta = MODULE_META[module] || { label: module, unit: 'operaciones', color: 'blue' }
  const [form, setForm] = useState({ message: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/public/renewal-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_name: user?.tenant_name || '',
          contact_name: user?.nombre_completo || '',
          contact_email: user?.email || '',
          current_plan: usage?.plan_name || 'unknown',
          message: `Solicitud de upgrade — módulo ${meta.label}: ${usage?.used}/${usage?.limit} ${meta.unit} usados este mes. ${form.message}`,
        }),
      })
      setSent(true)
    } catch {
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-white font-bold">Solicitar upgrade — {meta.label}</h2>
          {!sent && (
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Solicitud enviada</h3>
            <p className="text-gray-400 text-sm mb-6">Nuestro equipo te contactará pronto para ampliar tu plan.</p>
            <button onClick={onClose} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-medium">{t('common.monthUsage')} — {meta.label}</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-sm font-semibold">{(usage?.used ?? 0).toLocaleString()} / {usage?.limit != null ? usage.limit.toLocaleString() : '∞'} {meta.unit}</span>
                <span className="text-danger-400 text-xs font-bold">{usage?.pct ?? 100}% {t('common.used')}</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-danger-500 rounded-full transition-all" style={{ width: `${usage?.pct ?? 100}%` }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">{t('common.additionalMessageOptional')}</label>
              <textarea
                rows={3}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder={t('sub.renewMessagePlaceholder')}
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loading ? 'Enviando...' : 'Solicitar upgrade'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * ModuleLimitBanner — renders per-module usage warnings and a full block wall when at limit.
 *
 * Props:
 *   module:   'dropscan' | 'surtido' | 'inventario' | 'devoluciones'
 *   usage:    { used, limit, at_limit, warning, pct } from useModuleUsage()
 *   children: the module content to show (blocked behind wall if at_limit)
 */
export default function ModuleLimitBanner({ module, usage, children }) {
  const [showModal, setShowModal] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const meta = MODULE_META[module] || { label: module, unit: 'operaciones', color: 'blue' }

  if (!usage || usage.limit == null) return children

  if (usage.at_limit) {
    return (
      <>
        <div className="fixed inset-0 z-[200] bg-gray-950/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(239,68,68,0.06),transparent)]" />
          <div className="relative text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-2xl bg-danger-500/10 border border-danger-500/30 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-danger-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Límite de {meta.label} alcanzado</h1>
            <p className="text-gray-400 mb-1">Has usado <span className="text-white font-bold">{(usage.used ?? 0).toLocaleString()}</span> de <span className="text-white font-bold">{(usage.limit ?? 0).toLocaleString()}</span> {meta.unit} este mes.</p>
            <p className="text-gray-500 text-sm mb-8">El módulo se desbloqueará automáticamente el 1 del próximo mes, o puedes solicitar un upgrade de plan.</p>
            <div className="space-y-3">
              <button
                onClick={() => setShowModal(true)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/25 flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-5 h-5" />
                Solicitar upgrade de plan
              </button>
              <p className="text-gray-600 text-xs">
                ¿Preguntas? <a href="mailto:contacto@kirion.app" className="text-blue-400 hover:text-blue-300">contacto@kirion.app</a>
              </p>
            </div>
          </div>
        </div>
        {showModal && (
          <UpgradeModal module={module} usage={usage} onClose={() => setShowModal(false)} />
        )}
      </>
    )
  }

  if (usage.warning && !dismissed) {
    const isUrgent = usage.pct >= 95
    return (
      <>
        <div className={`w-full flex items-center justify-between gap-4 px-4 py-2.5 border-b backdrop-blur-sm ${
          isUrgent
            ? 'bg-danger-950/60 border-danger-800/50'
            : 'bg-amber-950/60 border-amber-800/50'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isUrgent ? 'text-danger-400 animate-pulse' : 'text-amber-400'}`} />
            <span className={`text-sm font-medium ${isUrgent ? 'text-danger-300' : 'text-amber-300'}`}>
              {meta.label}: {(usage.used ?? 0).toLocaleString()} / {(usage.limit ?? 0).toLocaleString()} {meta.unit} usados este mes ({usage.pct}%)
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Upgrade <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setDismissed(true)} className="text-gray-600 hover:text-gray-400 transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {children}
        {showModal && (
          <UpgradeModal module={module} usage={usage} onClose={() => setShowModal(false)} />
        )}
      </>
    )
  }

  return children
}
