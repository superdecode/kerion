import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ size = 'md', text = '', delayMs = 1000, className = '' }) {
  const [visible, setVisible] = useState(delayMs <= 0)

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true)
      return undefined
    }
    setVisible(false)
    const timer = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs])

  const sizes = {
    sm: { shell: 'w-10 h-10', icon: 'w-4 h-4' },
    md: { shell: 'w-14 h-14', icon: 'w-5 h-5' },
    lg: { shell: 'w-16 h-16', icon: 'w-6 h-6' },
  }

  if (!visible) return null

  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`}>
      <div className={`relative flex items-center justify-center rounded-[1.5rem] bg-primary-50 shadow-glow ${sizes[size].shell} animate-bounce-soft`}>
        <div className="absolute inset-1 rounded-[1.15rem] bg-white/90" />
        <Loader2 className={`relative z-10 ${sizes[size].icon} text-primary-600 animate-spin`} />
      </div>
      {text && <p className="text-sm text-slate-500">{text}</p>}
    </div>
  )
}
