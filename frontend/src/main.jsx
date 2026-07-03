import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const APP_VERSION = '2026-07-03-v16'
const APP_VERSION_KEY = 'kirion-app-version'
const EXTENSION_ASYNC_RESPONSE_ERROR =
  'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'

async function resetStaleClientState() {
  try {
    // In dev mode always clear any stale SW/cache — dev chunks change on every restart
    const isDev = import.meta.env.DEV
    const storedVersion = localStorage.getItem(APP_VERSION_KEY)
    if (!isDev && storedVersion === APP_VERSION) return

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => {})))
    }

    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)))
    }

    if (!isDev) {
      localStorage.setItem(APP_VERSION_KEY, APP_VERSION)
    }
  } catch {
    // Ignore cache cleanup errors and continue booting.
  }
}

async function registerServiceWorker() {
  try {
    // Never register SW in dev — it would cache Vite's hashed chunks and cause
    // "multiple React copies" errors when chunk hashes change between restarts.
    if (import.meta.env.DEV) return
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`, {
      updateViaCache: 'none',
    })
    await reg.update().catch(() => {})
  } catch {
    // Sw registration is best-effort.
  }
}

function suppressKnownBrowserNoise() {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      typeof reason === 'string'
        ? reason
        : reason instanceof Error
          ? reason.message
          : ''

    // Browser extensions can inject this rejection into the page. Ignore only
    // this exact noise so real application promise failures still surface.
    if (message.includes(EXTENSION_ASYNC_RESPONSE_ERROR)) {
      event.preventDefault()
    }
  })
}

void resetStaleClientState().finally(() => {
  suppressKnownBrowserNoise()
  void registerServiceWorker()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
