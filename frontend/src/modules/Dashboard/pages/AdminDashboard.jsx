import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Shield, UserCheck, UserX, Settings2 } from 'lucide-react'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { getAdminStats } from '../services/dashboardService'
import { KpiCard } from '../components/KpiCard'
import { ChartCard, NoData } from '../components/ChartCard'

const ROLE_COLORS = ['#2e57fe', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6']

export default function AdminDashboard() {
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data, isLoading } = useQuery({
    queryKey: ['dash-admin'],
    queryFn: getAdminStats,
    enabled: backendOnline,
  })

  const users = data?.users?.users ?? []
  const roles = data?.roles?.roles ?? []

  const kpis = useMemo(() => {
    const total = users.length
    const activos = users.filter(u => u.activo !== false).length
    const inactivos = total - activos
    return { total, activos, inactivos, total_roles: roles.length }
  }, [users, roles])

  const byRole = useMemo(() => {
    const map = new Map()
    for (const u of users) {
      const rol = u.rol_nombre || 'Sin rol'
      map.set(rol, (map.get(rol) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, color: ROLE_COLORS[i % ROLE_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
  }, [users])

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>

  return (
    <div className="space-y-4 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Usuarios totales" value={kpis.total}       icon={Users}     index={0} iconBg="bg-slate-50 border border-slate-200" />
        <KpiCard label="Activos"          value={kpis.activos}     icon={UserCheck} index={1} iconBg="bg-success-50 border border-success-100" />
        <KpiCard label="Inactivos"        value={kpis.inactivos}   icon={UserX}     index={2} alert={kpis.inactivos > 0} />
        <KpiCard label="Roles definidos"  value={kpis.total_roles} icon={Shield}    index={3} iconBg="bg-violet-50 border border-violet-100" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By role pie */}
        <ChartCard title="Usuarios por rol" icon={Shield}>
          {byRole.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={byRole} dataKey="value" cx="50%" cy="50%" outerRadius={60} stroke="none">
                    {byRole.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1 max-h-36 overflow-y-auto">
                {byRole.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span className="text-xs text-warm-600 flex-1 truncate">{entry.name}</span>
                    <span className="text-xs font-bold text-warm-800">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData height={160} />}
        </ChartCard>

        {/* Active vs Inactive */}
        <ChartCard title="Estado de usuarios" icon={Users}>
          {kpis.total > 0 ? (
            <div className="space-y-4 pt-2">
              {[
                { label: 'Activos',   value: kpis.activos,   pct: kpis.total > 0 ? Math.round((kpis.activos / kpis.total) * 100) : 0,   color: 'bg-success-500' },
                { label: 'Inactivos', value: kpis.inactivos, pct: kpis.total > 0 ? Math.round((kpis.inactivos / kpis.total) * 100) : 0, color: 'bg-warm-300' },
              ].map(({ label, value, pct, color }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs text-warm-600">
                    <span>{label}</span>
                    <span className="font-bold text-warm-800">{value} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-warm-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <NoData height={160} />}
        </ChartCard>
      </div>

      {/* Roles list */}
      {roles.length > 0 && (
        <ChartCard title="Roles del sistema" icon={Settings2}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {roles.map((rol, i) => (
              <div key={rol.id || i} className="flex items-center gap-2 rounded-xl border border-warm-100 bg-warm-50 px-3 py-2.5">
                <Shield className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs font-semibold text-warm-700 truncate">{rol.nombre}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  )
}
