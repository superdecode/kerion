import { create } from 'zustand'

let nextTaskId = 1
const pendingTimers = new Map()
const visibleTasks = new Map()

function syncStore(set) {
  const visibleArr = Array.from(visibleTasks.values())
  const latestVisibleTask = visibleArr[visibleArr.length - 1] || null
  set({
    visible: visibleTasks.size > 0,
    message: latestVisibleTask?.message || 'Cargando...',
  })
}

export const usePreloaderStore = create((set) => ({
  visible: false,
  message: 'Cargando...',

  begin: (message = 'Cargando...', delayMs = 2000) => {
    const taskId = nextTaskId++
    const timerId = window.setTimeout(() => {
      pendingTimers.delete(taskId)
      visibleTasks.set(taskId, { message })
      syncStore(set)
    }, delayMs)

    pendingTimers.set(taskId, timerId)
    return taskId
  },

  end: (taskId) => {
    const timerId = pendingTimers.get(taskId)
    if (timerId) {
      window.clearTimeout(timerId)
      pendingTimers.delete(taskId)
    }

    if (visibleTasks.delete(taskId)) {
      syncStore(set)
    }
  },

  reset: () => {
    for (const timerId of pendingTimers.values()) {
      window.clearTimeout(timerId)
    }
    pendingTimers.clear()
    visibleTasks.clear()
    set({ visible: false, message: 'Cargando...' })
  },
}))
