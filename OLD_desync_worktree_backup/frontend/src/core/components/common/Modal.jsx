import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, icon: Icon, children, size = 'md', footer, preventBackdropClose = false, headerAction }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !preventBackdropClose) onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === overlayRef.current && !preventBackdropClose) onClose() }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-warm-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />

          {/* Content */}
          <motion.div
            className={`${sizes[size]} w-full bg-white rounded-2xl shadow-depth border border-warm-100 max-h-[90vh] flex flex-col relative z-10`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-primary-100/60
                            bg-gradient-to-r from-primary-50/80 via-primary-100/50 to-accent-50/40 rounded-t-2xl">
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center shadow-glow">
                    <Icon className="w-4 h-4" />
                  </div>
                )}
                <h2 className="text-lg font-bold text-warm-800">{title}</h2>
              </div>
              <div className="flex items-center gap-2">
                {headerAction}
                <motion.button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-primary-100/60 text-warm-400 hover:text-primary-600 transition-all duration-200"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
              {children}
            </div>
            {footer && (
              <div className="px-6 py-4 border-t border-warm-100/60 flex items-center justify-end gap-3 bg-warm-50/30 rounded-b-2xl">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
