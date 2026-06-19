const SIZE_CLASSES = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2.5 py-1 text-[11px]',
}

const TONE_DOT_MAP = [
  ['text-success-', 'bg-success-500'],
  ['text-danger-', 'bg-danger-500'],
  ['text-warning-', 'bg-warning-500'],
  ['text-primary-', 'bg-primary-500'],
  ['text-accent-', 'bg-accent-500'],
  ['text-sky-', 'bg-sky-500'],
  ['text-violet-', 'bg-violet-500'],
  ['text-warm-', 'bg-warm-400'],
]

function inferDotClass(className = '') {
  const tone = TONE_DOT_MAP.find(([token]) => className.includes(token))
  return tone?.[1] ?? 'bg-warm-400'
}

export default function StatusPill({
  children,
  label,
  className = '',
  dotClassName,
  size = 'sm',
  title,
}) {
  const content = children ?? label
  if (!content) return null

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${SIZE_CLASSES[size] || SIZE_CLASSES.sm} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClassName || inferDotClass(className)}`} />
      <span>{content}</span>
    </span>
  )
}
