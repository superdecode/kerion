import { motion } from 'framer-motion'

export function KpiCard({ icon: Icon, label, value, gradient, iconBg, index = 0, alert = false }) {
  return (
    <motion.div
      className="card p-4 flex flex-col gap-2 relative overflow-hidden"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {gradient && (
        <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full bg-gradient-to-br ${gradient} opacity-[0.08]`} />
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-warm-500 leading-tight pr-2">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg || 'bg-warm-50 border border-warm-100'}`}>
          <Icon className={`w-4 h-4 ${alert ? 'text-danger-500' : 'text-warm-500'}`} />
        </div>
      </div>
      <span className={`text-2xl font-bold ${alert && value > 0 ? 'text-danger-600' : 'text-warm-800'}`}>
        {value ?? 0}
      </span>
    </motion.div>
  )
}

export function KpiCardGradient({ icon: Icon, label, value, gradient, iconBg, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className={`card relative overflow-hidden bg-gradient-to-br ${gradient} text-white p-5`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium opacity-80 mb-1">{label}</p>
          <p className="text-3xl font-bold">{value ?? 0}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${iconBg || 'bg-white/20'}`}>
          <Icon className="w-5 h-5 opacity-90" />
        </div>
      </div>
    </motion.div>
  )
}
