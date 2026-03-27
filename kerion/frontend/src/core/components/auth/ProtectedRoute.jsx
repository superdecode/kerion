import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

export function PermissionRoute({ children, module, fallback = null }) {
  const { canView } = useAuthStore()

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
