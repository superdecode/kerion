import { create } from 'zustand'

/**
 * Store for the currently authenticated internal operator context.
 * This is set after the operator selects their name + validates PIN (low-level users)
 * or confirms identity (high-level users) before starting a scan session.
 */
export const useOperadorStore = create((set, get) => ({
  // Current operator context (set before scan session starts)
  operador: null,        // { id, nombre } for internal operators, or { nombre } for high-level users
  nivelUsuario: null,    // 'Administrador', 'Gestion', 'Operador', 'Usuario'
  usuarioInternoId: null, // ID from usuarios_internos table (null for high-level)
  isAuthenticated: false, // Whether operator auth flow is complete

  // Set operator context after successful auth
  setOperador: ({ operador, nivelUsuario, usuarioInternoId }) => set({
    operador,
    nivelUsuario,
    usuarioInternoId: usuarioInternoId || null,
    isAuthenticated: true,
  }),

  // Clear operator context (on session end or logout)
  clearOperador: () => set({
    operador: null,
    nivelUsuario: null,
    usuarioInternoId: null,
    isAuthenticated: false,
  }),

  // Get the display name for the operator
  getOperadorNombre: () => {
    const { operador } = get()
    return operador?.nombre || null
  },

  // Get session payload to send to backend when starting a scan session
  getSessionPayload: () => {
    const { operador, nivelUsuario, usuarioInternoId } = get()
    return {
      usuario_operador: operador?.nombre || null,
      usuario_interno_id: usuarioInternoId,
      nivel_usuario: nivelUsuario,
    }
  },
}))
