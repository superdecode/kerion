import LoadingSpinner from './LoadingSpinner'
import { usePreloaderStore } from '../../stores/preloaderStore'

export default function GlobalPreloader() {
  const { visible, message } = usePreloaderStore()

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-warm-950/28 backdrop-blur-sm">
      <div className="min-w-[16rem] rounded-[2rem] border border-white/60 bg-white/92 px-8 py-7 shadow-depth">
        <LoadingSpinner size="lg" text={message} />
      </div>
    </div>
  )
}
