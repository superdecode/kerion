import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, icon: Icon, children, size = 'md', footer, preventBackdropClose = false, headerAction }) {
  const mouseDownOnBackdrop = useRef(false)

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
    'lg-wide': 'max-w-[54rem]',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
    full: 'max-w-6xl',
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
          onClick={(e) => { if (e.target === e.currentTarget && mouseDownOnBackdrop.current && !preventBackdropClose) onClose() }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-warm-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          />

          {/* Content */}
          <motion.div
            className={`surface-enter ${sizes[size]} w-full bg-white rounded-2xl shadow-depth border border-warm-100 max-h-[88vh] sm:max-h-[96vh] flex flex-col relative z-10`}
            style={{ transformOrigin: 'center center', willChange: 'transform, opacity' }}
            initial={{ opacity: 0, scale: 0.985, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: 6 }}
            transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.75 }}
          >
            <div className="chrome-shell flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-primary-100/60
                            bg-gradient-to-r from-primary-50/80 via-primary-100/50 to-accent-50/40 rounded-t-2xl">
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center shadow-glow">
                    <Icon className="w-4 h-4" />
                  </div>
                )}
                <h2 className="text-base sm:text-lg font-bold text-warm-800">{title}</h2>
              </div>
              <div className="flex items-center gap-2">
                {headerAction}
                <motion.button
                  onClick={onClose}
                  className="p-2 rounded-xl bg-transparent hover:bg-primary-100/60 text-warm-400 hover:text-primary-600 transition-all duration-200"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
            <div className="surface-enter-soft flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 scrollbar-thin">
              {children}
            </div>
            {footer && (
              <div className="px-4 py-2.5 sm:px-6 border-t border-warm-100/60 flex items-center justify-end gap-3 bg-warm-50/30 rounded-b-2xl">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
