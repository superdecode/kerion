import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { captureErrorEvent } from '../../services/errorTelemetry'
import { useI18nStore } from '../../stores/i18nStore'

// Vite hashes chunk filenames per build. A tab left open across a deploy still holds
// references to the previous build's chunk URLs in its lazy()-wrapped route imports —
// those 404 once the new deploy replaces the asset manifest, surfacing as "Failed to
// fetch dynamically imported module" (Chrome/Firefox) or "Importing a module script
// failed" (Safari). Resetting this boundary's state can't fix it: the failed import()
// promise is cached forever inside the lazy() call that produced it, so re-rendering
// the same children just rethrows the same cached rejection. Only a full page reload —
// which re-fetches the current index.html and its up-to-date chunk manifest — resolves it.
const CHUNK_ERROR_PATTERN = /fetch dynamically imported module|dynamically imported module|importing a module script failed|loading chunk .* failed/i
const RELOAD_GUARD_KEY = 'kirion-chunk-reload-at'
const RELOAD_GUARD_WINDOW_MS = 10000

function isChunkLoadError(error) {
  return CHUNK_ERROR_PATTERN.test(String(error?.message || ''))
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, reloading: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    const chunkLoadError = isChunkLoadError(error)
    captureErrorEvent({
      source: 'react',
      severity: 'critical',
      error,
      componentStack: info?.componentStack,
      metadata: { boundary: true, chunkLoadError },
    })

    if (chunkLoadError) {
      // Multiple boundaries can catch a chunk failure in the same tick (e.g. several
      // lazy modules failing together) — guard so only one of them triggers a reload.
      const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
      if (Date.now() - lastReload > RELOAD_GUARD_WINDOW_MS) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
        this.setState({ reloading: true })
        window.location.reload()
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const t = this.props.t || useI18nStore.getState().t

    if (this.state.reloading) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <RotateCcw className="w-8 h-8 text-primary-500" />
            </div>
            <p className="text-sm text-warm-500">{t('error.boundary.updating')}</p>
          </div>
        </div>
      )
    }

    const chunkLoadError = isChunkLoadError(this.state.error)
    const title = t('error.boundary.title')
    const body = chunkLoadError ? t('error.boundary.chunk_body') : (this.state.error?.message || t('error.boundary.body'))
    const retryLabel = chunkLoadError ? t('common.reload') : t('common.retry')

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-danger-500" />
          </div>
          <h2 className="text-lg font-bold text-warm-800 mb-2">{title}</h2>
          <p className="text-sm text-warm-500 mb-6">{body}</p>
          <button
            onClick={chunkLoadError ? () => window.location.reload() : this.handleReset}
            className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-sm"
          >
            <RotateCcw className="w-4 h-4" /> {retryLabel}
          </button>
        </div>
      </div>
    )
  }
}
