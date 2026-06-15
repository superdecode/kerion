export function ChartCard({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-warm-800 mb-3 flex items-center gap-2">
        {Icon && (
          <div className="w-6 h-6 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
            <Icon className="w-3 h-3" />
          </div>
        )}
        {title}
      </h3>
      {children}
    </div>
  )
}

export function NoData({ height = 180 }) {
  return (
    <div className="flex items-center justify-center text-warm-300 text-sm" style={{ height }}>
      Sin datos en el período
    </div>
  )
}
