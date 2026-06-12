import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useAdminAuthStore } from '../../../modules/SuperAdmin/stores/adminAuthStore'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  const { isAuthenticated: isAdminAuth } = useAdminAuthStore()

  if (!isAuthenticated) {
    // Admin-only user navigating to tenant routes → redirect to admin panel
    if (isAdminAuth) return <Navigate to="/super-admin" replace />
    return <Navigate to="/login" replace />
  }

  return children
}

export const PERM_TO_MODULE = {
  dropscan: 'dropscan',
  fep: 'dropscan',
  inventario: 'inventario',
  inventory: 'inventario',
  devoluciones: 'devoluciones',
  surtido: 'surtido',
  anormalidades: 'anormalidades',
}

export function PermissionRoute({ children, module, fallback = null }) {
  const { canView, isModuleEnabled } = useAuthStore()

  const moduleCode = PERM_TO_MODULE[module?.split('.')?.[0]]
  if (moduleCode && !isModuleEnabled(moduleCode)) {
    return fallback || (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-lg font-semibold text-slate-700">Modulo no habilitado</h2>
          <p className="text-sm text-slate-400 mt-1">Este modulo no esta activo en tu plan</p>
        </div>
      </div>
    )
  }

  if (!canView(module)) {
    return fallback || (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-lg font-semibold text-slate-700">Sin Acceso</h2>
          <p className="text-sm text-slate-400 mt-1">No tienes permisos para este módulo</p>
        </div>
      </div>
    )
  }

  return children
}
