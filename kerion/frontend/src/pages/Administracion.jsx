import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../core/components/layout/Header'
import Modal from '../core/components/common/Modal'
import LoadingSpinner from '../core/components/common/LoadingSpinner'
import { useAuthStore } from '../core/stores/authStore'
import { useToastStore } from '../core/stores/toastStore'
import api from '../core/services/api'
import {
  Users, Shield, Plus, Search, Edit3, Trash2, ToggleLeft, ToggleRight,
  Key, Copy, ChevronDown, CheckCircle, XCircle, Settings2
} from 'lucide-react'

// Module definitions for scalable permission system
const MODULE_GROUPS = [
  {
    group: 'DropScan',
    modules: [
      { key: 'dropscan.dashboard', label: 'Dashboard' },
      { key: 'dropscan.escaneo', label: 'Escaneo' },
      { key: 'dropscan.historial', label: 'Historial' },
      { key: 'dropscan.reportes', label: 'Reportes' },
    ]
  },
  {
    group: 'Sistema',
    modules: [
      { key: 'global.administracion', label: 'Administración' },
    ]
  },
  {
    group: 'Módulos Futuros',
    modules: [
      { key: 'inventario.dashboard', label: 'Inventario - Dashboard' },
      { key: 'inventario.productos', label: 'Inventario - Productos' },
      { key: 'inventario.movimientos', label: 'Inventario - Movimientos' },
      { key: 'despacho.ordenes', label: 'Despacho - Órdenes' },
      { key: 'despacho.validacion', label: 'Despacho - Validación' },
      { key: 'rastreo.consulta', label: 'Rastreo - Consulta' },
      { key: 'integraciones.config', label: 'Integraciones' },
      { key: 'reportes.global', label: 'Reportes Globales' },
    ]
  },
]

const PERM_LEVELS = [
  { value: 'sin_acceso', label: 'Sin acceso', color: 'bg-warm-100 text-warm-500' },
  { value: 'lectura', label: 'Solo lectura', color: 'bg-warning-100 text-warning-700' },
  { value: 'escritura', label: 'Lectura/Escritura', color: 'bg-success-100 text-success-700' },
  { value: 'gestion', label: 'Gestión', color: 'bg-accent-100 text-accent-700' },
  { value: 'total', label: 'Administrador', color: 'bg-primary-100 text-primary-700' },
]

// API helpers
const getUsers = async () => { const { data } = await api.get('/users'); return data }
const getRoles = async () => { const { data } = await api.get('/roles'); return data }

const isActive = (u) => u.estado !== 'INACTIVO' && u.activo !== false

export default function Administracion() {
  const [tab, setTab] = useState('usuarios')
  const { canWrite, canDelete } = useAuthStore()
  const canEditAdmin = canWrite('global.administracion')
  const canDeleteAdmin = canDelete('global.administracion')

  return (
    <div className="flex flex-col h-full">
      <Header title="Administración" subtitle="Usuarios y Roles del sistema" />

      <div className="flex-1 overflow-y-auto">
        {/* Tab bar */}
        <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6">
          <div className="flex gap-1">
            {[
              { key: 'usuarios', label: 'Usuarios', icon: Users },
              { key: 'roles', label: 'Roles', icon: Shield },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-200
                  ${tab === t.key
                    ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                    : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                  }`}>
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="max-w-full mx-auto">
            {tab === 'usuarios' ? (
              <UsersTab canEdit={canEditAdmin} canDel={canDeleteAdmin} />
            ) : (
              <RolesTab canEdit={canEditAdmin} canDel={canDeleteAdmin} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════ USERS TAB ═══════════
function UsersTab({ canEdit, canDel }) {
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const toast = useToastStore
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: getUsers })
  const { data: rolesData } = useQuery({ queryKey: ['admin-roles'], queryFn: getRoles })
  const users = data?.usuarios || data?.users || []
  const roles = rolesData?.roles || []

  const filtered = search
    ? users.filter(u => u.nombre_completo?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()) || u.codigo?.toLowerCase().includes(search.toLowerCase()))
    : users

  const toggleMutation = useMutation({
    mutationFn: (user) => api.put(`/users/${user.id}`, { nombre_completo: user.nombre_completo, email: user.email, rol_id: user.rol_id, estado: isActive(user) ? 'INACTIVO' : 'ACTIVO' }),
    onSuccess: () => { toast.success('Estado actualizado'); qc.invalidateQueries({ queryKey: ['admin-users'] }) },
    onError: () => toast.error('Error actualizando estado')
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => { toast.success('Usuario eliminado'); qc.invalidateQueries({ queryKey: ['admin-users'] }) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error eliminando')
  })

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuarios..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-warm-200 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100" />
        </div>
        <span className="badge bg-warm-100 text-warm-500">{filtered.length} usuarios</span>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 ml-auto">
            <Plus className="w-4 h-4" /> Nuevo Usuario
          </button>
        )}
      </div>

      {/* Users table */}
      {isLoading ? <LoadingSpinner text="Cargando usuarios..." /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-warm-50 to-purple-50 border-b border-warm-200">
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Usuario</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Email</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Código</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Rol</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Estado</th>
                  {canEdit && <th className="text-right px-4 py-3 font-bold text-warm-600">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {filtered.map(u => {
                  const initials = u.nombre_completo?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
                  const role = roles.find(r => r.id === u.rol_id)
                  return (
                    <tr key={u.id} className="hover:bg-purple-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
                            {initials}
                          </div>
                          <span className="font-semibold text-warm-800">{u.nombre_completo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-warm-600">{u.email}</td>
                      <td className="px-4 py-3 font-mono text-warm-500">{u.codigo}</td>
                      <td className="px-4 py-3">
                        <span className="badge bg-primary-100 text-primary-700">{role?.nombre || u.rol_nombre || 'Sin rol'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${isActive(u) ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700'}`}>
                          {isActive(u) ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditUser(u)} className="p-2 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all" title="Editar">
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => toggleMutation.mutate(u)}
                              className="p-2 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all" title={isActive(u) ? 'Desactivar' : 'Activar'}>
                              {isActive(u) ? <ToggleRight className="w-4 h-4 text-success-500" /> : <ToggleLeft className="w-4 h-4 text-warm-400" />}
                            </button>
                            <button className="p-2 rounded-lg hover:bg-warning-50 text-warm-400 hover:text-warning-600 transition-all" title="Resetear contraseña">
                              <Key className="w-4 h-4" />
                            </button>
                            {canDel && (
                              <button onClick={() => { if (confirm(`¿Eliminar usuario ${u.nombre_completo}?`)) deleteMutation.mutate(u.id) }}
                                className="p-2 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit User Modal */}
      <UserFormModal isOpen={showCreate || !!editUser} onClose={() => { setShowCreate(false); setEditUser(null) }}
        user={editUser} roles={roles} />
    </div>
  )
}

function UserFormModal({ isOpen, onClose, user, roles }) {
  const [form, setForm] = useState({ nombre_completo: '', email: '', codigo: '', password: '', rol_id: '' })
  const toast = useToastStore
  const qc = useQueryClient()

  // Populate on open
  useState(() => {
    if (user) setForm({ nombre_completo: user.nombre_completo || '', email: user.email || '', codigo: user.codigo || '', password: '', rol_id: user.rol_id || '' })
    else setForm({ nombre_completo: '', email: '', codigo: '', password: '', rol_id: '' })
  }, [user])

  const mutation = useMutation({
    mutationFn: (data) => user ? api.put(`/users/${user.id}`, data) : api.post('/users', data),
    onSuccess: () => { toast.success(user ? 'Usuario actualizado' : 'Usuario creado'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error guardando usuario')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = { ...form, rol_id: parseInt(form.rol_id) || undefined }
    if (!user && !payload.password) { toast.warning('La contraseña es requerida'); return }
    if (user && !payload.password) delete payload.password
    mutation.mutate(payload)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={user ? 'Editar Usuario' : 'Nuevo Usuario'} icon={Users} size="md"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancelar</button>
        <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary">
          {mutation.isPending ? 'Guardando...' : user ? 'Actualizar' : 'Crear Usuario'}
        </button>
      </>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">Nombre completo</label>
          <input value={form.nombre_completo} onChange={e => setForm(f => ({ ...f, nombre_completo: e.target.value }))}
            className="input-field" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">Código</label>
            <input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              className="input-field" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">{user ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label>
          <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            className="input-field" {...(!user ? { required: true } : {})} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5">Rol</label>
          <select value={form.rol_id} onChange={e => setForm(f => ({ ...f, rol_id: e.target.value }))} className="select-field" required>
            <option value="">Seleccionar rol...</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.nombre} — {r.descripcion}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  )
}

// ═══════════ ROLES TAB ═══════════
function RolesTab({ canEdit, canDel }) {
  const [editRole, setEditRole] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const toast = useToastStore
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['admin-roles'], queryFn: getRoles })
  const { data: usersData } = useQuery({ queryKey: ['admin-users'], queryFn: getUsers })
  const roles = data?.roles || data || []
  const users = usersData?.usuarios || usersData?.users || []

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/roles/${id}`),
    onSuccess: () => { toast.success('Rol eliminado'); qc.invalidateQueries({ queryKey: ['admin-roles'] }) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error eliminando rol')
  })

  const duplicateMutation = useMutation({
    mutationFn: (role) => api.post('/roles', { nombre: `${role.nombre} (copia)`, descripcion: role.descripcion, permisos: role.permisos }),
    onSuccess: () => { toast.success('Rol duplicado'); qc.invalidateQueries({ queryKey: ['admin-roles'] }) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error duplicando')
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="badge bg-warm-100 text-warm-500">{roles.length} roles</span>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 ml-auto">
            <Plus className="w-4 h-4" /> Nuevo Rol
          </button>
        )}
      </div>

      {isLoading ? <LoadingSpinner text="Cargando roles..." /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-warm-50 to-purple-50 border-b border-warm-200">
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Rol</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Descripción</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Usuarios</th>
                  <th className="text-left px-4 py-3 font-bold text-warm-600">Permisos</th>
                  {canEdit && <th className="text-right px-4 py-3 font-bold text-warm-600">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {roles.map(r => {
                  const userCount = users.filter(u => u.rol_id === r.id).length
                  return (
                    <tr key={r.id} className="hover:bg-purple-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 text-white flex items-center justify-center shadow-sm shrink-0">
                            <Shield className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-warm-800">{r.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-warm-600">{r.descripcion || 'Sin descripción'}</td>
                      <td className="px-4 py-3">
                        <span className="badge bg-warm-100 text-warm-500">{userCount}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {r.permisos && typeof r.permisos === 'object' && Object.entries(r.permisos).slice(0, 3).map(([mod, perms]) => {
                            if (typeof perms === 'object') {
                              return Object.entries(perms).filter(([, v]) => v !== 'sin_acceso').slice(0, 2).map(([sub, level]) => (
                                <span key={`${mod}.${sub}`} className={`badge text-[9px] ${PERM_LEVELS.find(p => p.value === level)?.color || 'bg-warm-100 text-warm-500'}`}>
                                  {sub}: {level}
                                </span>
                              ))
                            }
                            return perms !== 'sin_acceso' ? (
                              <span key={mod} className={`badge text-[9px] ${PERM_LEVELS.find(p => p.value === perms)?.color || 'bg-warm-100 text-warm-500'}`}>
                                {mod}: {perms}
                              </span>
                            ) : null
                          })}
                          {r.permisos && Object.keys(r.permisos).length > 3 && (
                            <span className="badge bg-warm-100 text-warm-400 text-[9px]">+{Object.keys(r.permisos).length - 3}</span>
                          )}
                        </div>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditRole(r)} className="p-2 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all" title="Editar permisos">
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => duplicateMutation.mutate(r)} className="p-2 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all" title="Duplicar rol">
                              <Copy className="w-4 h-4" />
                            </button>
                            {canDel && userCount === 0 && (
                              <button onClick={() => { if (confirm(`¿Eliminar rol ${r.nombre}?`)) deleteMutation.mutate(r.id) }}
                                className="p-2 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RoleFormModal isOpen={showCreate || !!editRole} onClose={() => { setShowCreate(false); setEditRole(null) }} role={editRole} />
    </div>
  )
}

function RoleFormModal({ isOpen, onClose, role }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [permisos, setPermisos] = useState({})
  const toast = useToastStore
  const qc = useQueryClient()

  // Populate
  useState(() => {
    if (role) {
      setNombre(role.nombre || ''); setDescripcion(role.descripcion || '')
      setPermisos(role.permisos && typeof role.permisos === 'object' ? JSON.parse(JSON.stringify(role.permisos)) : {})
    } else {
      setNombre(''); setDescripcion(''); setPermisos({})
    }
  }, [role])

  const mutation = useMutation({
    mutationFn: (data) => role ? api.put(`/roles/${role.id}`, data) : api.post('/roles', data),
    onSuccess: () => { toast.success(role ? 'Rol actualizado' : 'Rol creado'); qc.invalidateQueries({ queryKey: ['admin-roles'] }); onClose() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error guardando rol')
  })

  const setPermLevel = (moduleKey, level) => {
    const parts = moduleKey.split('.')
    setPermisos(prev => {
      const next = { ...prev }
      if (parts.length === 2) {
        if (!next[parts[0]]) next[parts[0]] = {}
        next[parts[0]] = { ...next[parts[0]], [parts[1]]: level }
      } else {
        next[parts[0]] = level
      }
      return next
    })
  }

  const getPermLevel = (moduleKey) => {
    const parts = moduleKey.split('.')
    if (parts.length === 2) return permisos[parts[0]]?.[parts[1]] || 'sin_acceso'
    return permisos[parts[0]] || 'sin_acceso'
  }

  const handleSubmit = () => {
    if (!nombre.trim()) { toast.warning('El nombre es requerido'); return }
    mutation.mutate({ nombre, descripcion, permisos })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={role ? `Editar: ${role.nombre}` : 'Nuevo Rol'} icon={Shield} size="lg"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancelar</button>
        <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary">
          {mutation.isPending ? 'Guardando...' : role ? 'Actualizar Rol' : 'Crear Rol'}
        </button>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">Nombre del Rol</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} className="input-field" />
          </div>
        </div>

        {/* Permission matrix */}
        <div>
          <h4 className="text-xs font-bold text-warm-400 uppercase tracking-wider mb-3">Permisos por Módulo</h4>
          <div className="space-y-4">
            {MODULE_GROUPS.map(g => (
              <div key={g.group} className="rounded-xl border border-warm-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-warm-50 border-b border-warm-100">
                  <h5 className="text-xs font-bold text-warm-600 uppercase tracking-wider">{g.group}</h5>
                </div>
                <div className="divide-y divide-warm-50">
                  {g.modules.map(m => {
                    const current = getPermLevel(m.key)
                    return (
                      <div key={m.key} className="flex items-center gap-3 px-4 py-3">
                        <span className="text-sm text-warm-700 font-medium flex-1 min-w-[140px]">{m.label}</span>
                        <div className="flex gap-1.5">
                          {PERM_LEVELS.map(pl => (
                            <button key={pl.value} onClick={() => setPermLevel(m.key, pl.value)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all
                                ${current === pl.value
                                  ? `${pl.color} ring-1 ring-current/20 shadow-sm`
                                  : 'bg-warm-50 text-warm-400 hover:bg-warm-100 hover:text-warm-600'
                                }`}
                              title={pl.label}>
                              {pl.label.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
