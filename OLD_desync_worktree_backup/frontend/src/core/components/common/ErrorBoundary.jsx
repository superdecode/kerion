import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-danger-500" />
          </div>
          <h2 className="text-lg font-bold text-warm-800 mb-2">Algo salio mal</h2>
          <p className="text-sm text-warm-500 mb-6">
            {this.state.error?.message || 'Error inesperado en este modulo.'}
          </p>
          <button
            onClick={this.handleReset}
            className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-sm"
          >
            <RotateCcw className="w-4 h-4" /> Reintentar
          </button>
        </div>
      </div>
    )
  }
}
