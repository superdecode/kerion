import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../services/api'

const MAIN_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', 'kirion.vercel.app']

function isMainDomain(hostname) {
  if (MAIN_HOSTS.includes(hostname)) return true
  const base = (import.meta.env.VITE_TENANT_BASE_DOMAIN || '').trim()
  if (base && (hostname === base || hostname === `www.${base}`)) return true
  return false
}

function BlockedDomainPage({ status }) {
  const isBlocked = status === 'TENANT_BLOCKED'
  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(239,68,68,0.08),transparent)]" />
      <div className="relative text-center max-w-md mx-auto">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-black text-white mb-3">
          {isBlocked ? 'Cuenta no disponible' : 'Dominio no encontrado'}
        </h1>
        <p className="text-gray-400 text-base mb-8">
          {isBlocked
            ? 'Esta cuenta está suspendida o pendiente de aprobación. Contacta a soporte para más información.'
            : 'Este enlace no corresponde a ninguna empresa registrada. Verifica que escribiste la dirección correctamente.'}
        </p>
        <p className="text-gray-500 text-sm">
          ¿Necesitas ayuda? <a href="mailto:contacto@kirion.app" className="text-blue-400 hover:text-blue-300">contacto@kirion.app</a>
        </p>
      </div>
    </div>
  )
}

// Blocks the entire app from loading when the current subdomain doesn't match
// a registered tenant (e.g. a mistyped URL), instead of silently failing at login.
export default function TenantGuard({ children }) {
  const [state, setState] = useState(() => (isMainDomain(window.location.hostname) ? 'valid' : 'checking'))

  useEffect(() => {
    if (isMainDomain(window.location.hostname)) return

    let cancelled = false
    api.get('/public/tenant-status')
      .then(({ data }) => {
        if (cancelled) return
        setState(data?.valid ? 'valid' : (data?.code || 'TENANT_NOT_FOUND'))
      })
      .catch((error) => {
        if (cancelled) return
        // Fail-open on network errors — don't brick the app over a connectivity blip.
        setState(error.response?.status === 404 ? 'TENANT_NOT_FOUND' : 'valid')
      })

    return () => { cancelled = true }
  }, [])

  if (state === 'checking') return null
  if (state === 'valid') return children
  return <BlockedDomainPage status={state} />
}
