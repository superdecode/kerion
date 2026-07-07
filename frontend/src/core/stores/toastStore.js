import { create } from 'zustand'

let toastId = 0

export const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = 'info', duration = 2500) => {
    const id = ++toastId
    const safeMsg = typeof message === 'string'
      ? message
      : (message instanceof Error ? message.message : null) ||
        (typeof message?.message === 'string' ? message.message : null) ||
        (message != null ? String(message) : 'Error')
    set((state) => ({
      toasts: [...state.toasts, { id, message: safeMsg, type, duration }]
    }))
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id)
        }))
      }, duration)
    }
    return id
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
  },

  success: (msg, duration) => {
    const { addToast } = useToastStore.getState()
    return addToast(msg, 'success', duration)
  },
  error: (msg, duration) => {
    const { addToast } = useToastStore.getState()
    return addToast(msg, 'error', duration || 5100)
  },
  warning: (msg, duration) => {
    const { addToast } = useToastStore.getState()
    return addToast(msg, 'warning', duration)
  },
  info: (msg, duration) => {
    const { addToast } = useToastStore.getState()
    return addToast(msg, 'info', duration)
  },
}))
