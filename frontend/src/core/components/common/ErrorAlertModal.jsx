import Modal from './Modal'
import { AlertCircle } from 'lucide-react'

export function ErrorAlertModal({ isOpen, onClose, title, message }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || 'Error'} icon={AlertCircle} size="sm">
      <div className="flex flex-col items-center py-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-50 text-danger-500">
          <AlertCircle size={32} />
        </div>
        <p className="text-center text-sm text-warm-700 font-medium px-4">{message}</p>
        <button
          className="mt-8 w-full rounded-xl bg-danger-600 px-4 py-3 text-sm font-semibold text-white hover:bg-danger-700 transition-colors"
          onClick={onClose}
        >
          Entendido
        </button>
      </div>
    </Modal>
  )
}
