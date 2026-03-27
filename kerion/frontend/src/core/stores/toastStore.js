import { create } from 'zustand'

let toastId = 0

export const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = 'info', duration = 4000) => {
    const id = ++toastId
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }]
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
    return addToast(msg, 'error', duration || 6000)
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
