import { motion, AnimatePresence } from 'framer-motion'
import { useToastStore } from '../../stores/toastStore'
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles = {
  success: 'bg-success-50/90 border-success-300 text-success-800',
  error: 'bg-danger-50/90 border-danger-300 text-danger-800',
  warning: 'bg-warning-50/90 border-warning-300 text-warning-800',
  info: 'bg-primary-50/90 border-primary-300 text-primary-800',
}

const iconStyles = {
  success: 'text-success-500',
  error: 'text-danger-500',
  warning: 'text-warning-500',
  info: 'text-primary-500',
}

export default function Toast() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || Info
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={`flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl shadow-depth pointer-events-auto ${styles[toast.type] || styles.info}`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconStyles[toast.type]}`} />
              <p className="flex-1 text-sm font-medium">{toast.message}</p>
              <motion.button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
