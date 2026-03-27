import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ size = 'md', text = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 className={`${sizes[size]} text-primary-600 animate-spin`} />
      {text && <p className="text-sm text-slate-500">{text}</p>}
    </div>
  )
}
