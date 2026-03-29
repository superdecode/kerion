import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import api from '../../../core/services/api'
import * as configService from '../services/configService'
import {
  Settings, Plus, Edit3, Trash2,
  Radio, Package, Search, X, ToggleLeft, ToggleRight,
  Sliders, Save
} from 'lucide-react'

export default function Configuracion() {
  const { t } = useI18nStore()
  const [tab, setTab] = useState('empresas')
  const { user, canWrite, canDelete } = useAuthStore()
  const canEdit = canWrite('dropscan.configuracion')
  const canRemove = canDelete('dropscan.configuracion')

  const isSupervisorOrAdmin = user?.rol_nombre === 'Administrador' || user?.rol_nombre === 'Supervisor'

  return (
    <div className="flex flex-col h-full">
      <Header title={t('config.title')} subtitle={t('config.subtitle')} />

      <div className="flex-1 overflow-y-auto">
        {/* Tab bar */}
        <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6">
          <div className="flex gap-1">
            {[
              { key: 'empresas', label: t('config.companies'), icon: Package },
              { key: 'canales', label: t('config.channels'), icon: Radio },
              { key: 'parametros', label: t('config.parameters'), icon: Sliders },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-200
                  ${tab === t.key
                    ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                    : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                  }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === 'empresas' && <EmpresasTab canEdit={canEdit} canRemove={canRemove} />}
          {tab === 'canales' && <CanalesTab canEdit={canEdit} canRemove={canRemove} />}
          {tab === 'parametros' && <ParametrosTab canEdit={isSupervisorOrAdmin} />}
        </div>
      </div>
    </div>
  )
}

// ==================== EMPRESAS TAB ====================

function EmpresasTab({ canEdit, canRemove }) {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingEmpresa, setEditingEmpresa] = useState(null)
  const queryClient = useQueryClient()
  const toast = useToastStore

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['dropscan-empresas'],
    queryFn: () => configService.getEmpresas()
  })

  const createMutation = useMutation({
    mutationFn: configService.createEmpresa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success('Empresa creada correctamente')
      setShowModal(false)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error creando empresa')
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => configService.updateEmpresa(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success('Empresa actualizada correctamente')
      setShowModal(false)
      setEditingEmpresa(null)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error actualizando empresa')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: configService.deleteEmpresa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success('Empresa eliminada correctamente')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error eliminando empresa')
    }
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/dropscan/config/empresas/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success('Estado de empresa actualizado')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error cambiando estado')
    }
  })

  const handleOpenModal = (empresa = null) => {
    setEditingEmpresa(empresa)
    setShowModal(true)
  }

  const handleDelete = (empresa) => {
    if (confirm(`Eliminar la empresa "${empresa.nombre}"?`)) {
      deleteMutation.mutate(empresa.id)
    }
  }

  const filtered = empresas.filter(e =>
    e.nombre.toLowerCase().includes(search.toLowerCase()) ||
    e.codigo.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) return <LoadingSpinner text="Cargando empresas..." />

  return (
    <>
      <div className="max-w-6xl mx-auto">
        {/* Header actions */}
        <motion.div
          className="flex items-center gap-3 mb-6"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresas..."
              className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-warm-200 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-warm-400 hover:text-warm-600" />
              </button>
            )}
          </div>
          {canEdit && (
            <motion.button
              onClick={() => handleOpenModal()}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="w-4 h-4" /> Nueva Empresa
            </motion.button>
          )}
        </motion.div>

        {/* Empresas grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((empresa, i) => (
            <motion.div
              key={empresa.id}
              className="card-interactive p-5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: empresa.color + '20' }}
                >
                  <Package className="w-6 h-6" style={{ color: empresa.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-warm-800 truncate">{empresa.nombre}</h3>
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold bg-warm-100 text-warm-600">
                    {empresa.codigo}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-warm-400 mb-3">
                <div className="flex items-center gap-1.5">
                  <span>Color:</span>
                  <div
                    className="w-4 h-4 rounded border border-warm-200"
                    style={{ backgroundColor: empresa.color }}
                  />
                  <span className="font-mono">{empresa.color}</span>
                </div>
              </div>

              {/* Toggle active/inactive */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold ${empresa.activo ? 'text-success-600' : 'text-warm-400'}`}>
                  {empresa.activo ? 'Activa' : 'Inactiva'}
                </span>
                {canEdit && (
                  <button
                    onClick={() => toggleMutation.mutate(empresa.id)}
                    className={`p-1 rounded-lg transition-all ${
                      empresa.activo
                        ? 'text-success-500 hover:bg-success-50'
                        : 'text-warm-400 hover:bg-warm-100'
                    }`}
                    title={empresa.activo ? 'Desactivar' : 'Activar'}
                    disabled={toggleMutation.isPending}
                  >
                    {empresa.activo ? (
                      <ToggleRight className="w-6 h-6" />
                    ) : (
                      <ToggleLeft className="w-6 h-6" />
                    )}
                  </button>
                )}
              </div>

              {(canEdit || canRemove) && (
                <div className="flex items-center gap-1 pt-3 border-t border-warm-100">
                  {canEdit && (
                    <button
                      onClick={() => handleOpenModal(empresa)}
                      className="flex-1 p-2 rounded-xl hover:bg-primary-50 text-warm-500 hover:text-primary-600 transition-all text-sm font-medium"
                    >
                      <Edit3 className="w-4 h-4 inline mr-1" /> Editar
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => handleDelete(empresa)}
                      className="flex-1 p-2 rounded-xl hover:bg-danger-50 text-warm-500 hover:text-danger-500 transition-all text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4 inline mr-1" /> Eliminar
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full card p-16 text-center">
              <Package className="w-12 h-12 text-warm-300 mx-auto mb-3" />
              <p className="text-sm text-warm-400">
                {search ? 'No se encontraron empresas' : 'No hay empresas configuradas'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <EmpresaModal
          empresa={editingEmpresa}
          onClose={() => {
            setShowModal(false)
            setEditingEmpresa(null)
          }}
          onSubmit={(data) => {
            if (editingEmpresa) {
              updateMutation.mutate({ id: editingEmpresa.id, data })
            } else {
              createMutation.mutate(data)
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </>
  )
}

function EmpresaModal({ empresa, onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    nombre: empresa?.nombre || '',
    codigo: empresa?.codigo || '',
    color: empresa?.color || '#6366f1',
    activo: empresa?.activo !== false
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={empresa ? 'Editar Empresa' : 'Nueva Empresa'}
      icon={Package}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            Nombre <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nombre}
            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
            className="input-field"
            placeholder="Ej: FedEx"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            Codigo <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={formData.codigo}
            onChange={e => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
            className="input-field font-mono"
            placeholder="Ej: FEDEX"
            required
          />
          <p className="text-xs text-warm-500 mt-1">Codigo unico para identificar la empresa</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            Color <span className="text-danger-500">*</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={formData.color}
              onChange={e => setFormData({ ...formData, color: e.target.value })}
              className="w-16 h-10 rounded-lg border border-warm-200 cursor-pointer"
            />
            <input
              type="text"
              value={formData.color}
              onChange={e => setFormData({ ...formData, color: e.target.value })}
              className="flex-1 input-field font-mono"
              placeholder="#6366f1"
              pattern="^#[0-9A-Fa-f]{6}$"
              required
            />
            <div
              className="w-10 h-10 rounded-xl border-2 border-warm-200 shrink-0"
              style={{ backgroundColor: formData.color }}
              title="Vista previa del color"
            />
          </div>
          <p className="text-xs text-warm-500 mt-1">Color hexadecimal para representar la empresa en la UI</p>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.activo}
              onChange={e => setFormData({ ...formData, activo: e.target.checked })}
              className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-warm-700">Empresa activa</span>
          </label>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-warm-200 text-warm-700 font-medium hover:bg-warm-50 transition-colors"
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 btn-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Guardando...' : empresa ? 'Actualizar' : 'Crear Empresa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ==================== CANALES TAB ====================

function CanalesTab({ canEdit, canRemove }) {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCanal, setEditingCanal] = useState(null)
  const queryClient = useQueryClient()
  const toast = useToastStore

  const { data: canales = [], isLoading } = useQuery({
    queryKey: ['dropscan-canales'],
    queryFn: () => configService.getCanales()
  })

  const createMutation = useMutation({
    mutationFn: configService.createCanal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success('Canal creado correctamente')
      setShowModal(false)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error creando canal')
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => configService.updateCanal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success('Canal actualizado correctamente')
      setShowModal(false)
      setEditingCanal(null)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error actualizando canal')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: configService.deleteCanal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success('Canal eliminado correctamente')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error eliminando canal')
    }
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/dropscan/config/canales/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success('Estado de canal actualizado')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error cambiando estado')
    }
  })

  const handleOpenModal = (canal = null) => {
    setEditingCanal(canal)
    setShowModal(true)
  }

  const handleDelete = (canal) => {
    if (confirm(`Eliminar el canal "${canal.nombre}"?`)) {
      deleteMutation.mutate(canal.id)
    }
  }

  const filtered = canales.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (c.descripcion && c.descripcion.toLowerCase().includes(search.toLowerCase()))
  )

  if (isLoading) return <LoadingSpinner text="Cargando canales..." />

  return (
    <>
      <div className="max-w-6xl mx-auto">
        {/* Header actions */}
        <motion.div
          className="flex items-center gap-3 mb-6"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar canales..."
              className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-warm-200 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-warm-400 hover:text-warm-600" />
              </button>
            )}
          </div>
          {canEdit && (
            <motion.button
              onClick={() => handleOpenModal()}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="w-4 h-4" /> Nuevo Canal
            </motion.button>
          )}
        </motion.div>

        {/* Canales list */}
        <div className="grid gap-4">
          {filtered.map((canal, i) => (
            <motion.div
              key={canal.id}
              className="card-interactive p-5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  canal.es_default ? 'bg-gradient-to-br from-primary-100 to-accent-100' : 'bg-warm-100'
                }`}>
                  <Radio className={`w-6 h-6 ${canal.es_default ? 'text-primary-600' : 'text-warm-500'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-warm-800">{canal.nombre}</h3>
                    {canal.es_default && (
                      <span className="badge bg-primary-100 text-primary-700 text-xs">Predeterminado</span>
                    )}
                  </div>
                  {canal.descripcion && (
                    <p className="text-sm text-warm-500 mb-2">{canal.descripcion}</p>
                  )}

                  {/* Linked empresas badges */}
                  {canal.empresas && canal.empresas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {canal.empresas.map(emp => (
                        <span
                          key={emp.id}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: (emp.color || '#6366f1') + '18',
                            color: emp.color || '#6366f1'
                          }}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: emp.color || '#6366f1' }}
                          />
                          {emp.nombre}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-warm-400">
                    <span>Creado: {new Date(canal.created_at).toLocaleDateString('es-MX')}</span>
                    {canal.updated_at !== canal.created_at && (
                      <span>Actualizado: {new Date(canal.updated_at).toLocaleDateString('es-MX')}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle active/inactive */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-[10px] font-semibold ${canal.activo ? 'text-success-600' : 'text-warm-400'}`}>
                      {canal.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => toggleMutation.mutate(canal.id)}
                        className={`p-1 rounded-lg transition-all ${
                          canal.activo
                            ? 'text-success-500 hover:bg-success-50'
                            : 'text-warm-400 hover:bg-warm-100'
                        }`}
                        title={canal.activo ? 'Desactivar' : 'Activar'}
                        disabled={toggleMutation.isPending}
                      >
                        {canal.activo ? (
                          <ToggleRight className="w-6 h-6" />
                        ) : (
                          <ToggleLeft className="w-6 h-6" />
                        )}
                      </button>
                    )}
                  </div>

                  {(canEdit || canRemove) && (
                    <div className="flex items-center gap-1 pl-2 border-l border-warm-100">
                      {canEdit && (
                        <button
                          onClick={() => handleOpenModal(canal)}
                          className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {canRemove && !canal.es_default && (
                        <button
                          onClick={() => handleDelete(canal)}
                          className="p-2 rounded-xl hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="card p-16 text-center">
              <Radio className="w-12 h-12 text-warm-300 mx-auto mb-3" />
              <p className="text-sm text-warm-400">
                {search ? 'No se encontraron canales' : 'No hay canales configurados'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <CanalModal
          canal={editingCanal}
          onClose={() => {
            setShowModal(false)
            setEditingCanal(null)
          }}
          onSubmit={(data) => {
            if (editingCanal) {
              updateMutation.mutate({ id: editingCanal.id, data })
            } else {
              createMutation.mutate(data)
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </>
  )
}

function CanalModal({ canal, onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    nombre: canal?.nombre || '',
    descripcion: canal?.descripcion || '',
    activo: canal?.activo !== false,
    es_default: canal?.es_default || false,
    empresa_ids: canal?.empresas?.map(e => e.id) || []
  })

  const { data: empresas = [] } = useQuery({
    queryKey: ['dropscan-empresas'],
    queryFn: () => configService.getEmpresas()
  })

  const activeEmpresas = empresas.filter(e => e.activo)

  const handleEmpresaToggle = (empresaId) => {
    setFormData(prev => {
      const ids = prev.empresa_ids.includes(empresaId)
        ? prev.empresa_ids.filter(id => id !== empresaId)
        : [...prev.empresa_ids, empresaId]
      return { ...prev, empresa_ids: ids }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={canal ? 'Editar Canal' : 'Nuevo Canal'}
      icon={Radio}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            Nombre <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nombre}
            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
            className="input-field"
            placeholder="Ej: Canal Principal"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Descripcion</label>
          <textarea
            value={formData.descripcion}
            onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
            className="input-field resize-none"
            rows={3}
            placeholder="Descripcion del canal..."
          />
        </div>

        {/* Empresa multi-select checkboxes */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-2">
            Empresas vinculadas
          </label>
          {activeEmpresas.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto p-3 rounded-xl border border-warm-200 bg-warm-50/50">
              {activeEmpresas.map(empresa => (
                <label
                  key={empresa.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={formData.empresa_ids.includes(empresa.id)}
                    onChange={() => handleEmpresaToggle(empresa.id)}
                    className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: empresa.color }}
                  />
                  <span className="text-sm font-medium text-warm-700">{empresa.nombre}</span>
                  <span className="text-xs font-mono text-warm-400">{empresa.codigo}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-warm-400 italic p-3 rounded-xl border border-warm-200 bg-warm-50/50">
              No hay empresas activas disponibles
            </p>
          )}
          {formData.empresa_ids.length > 0 && (
            <p className="text-xs text-warm-500 mt-1">
              {formData.empresa_ids.length} empresa{formData.empresa_ids.length !== 1 ? 's' : ''} seleccionada{formData.empresa_ids.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.activo}
              onChange={e => setFormData({ ...formData, activo: e.target.checked })}
              className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-warm-700">Canal activo</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.es_default}
              onChange={e => setFormData({ ...formData, es_default: e.target.checked })}
              className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-warm-700">Canal predeterminado</span>
          </label>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-warm-200 text-warm-700 font-medium hover:bg-warm-50 transition-colors"
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 btn-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Guardando...' : canal ? 'Actualizar' : 'Crear Canal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ==================== PARAMETROS GENERALES TAB ====================

function ParametrosTab({ canEdit }) {
  const [guiasPorTarima, setGuiasPorTarima] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const toast = useToastStore

  const { data: parametros, isLoading } = useQuery({
    queryKey: ['dropscan-parametros'],
    queryFn: async () => {
      const { data } = await api.get('/dropscan/config/parametros')
      return data
    },
  })

  useEffect(() => {
    if (parametros && guiasPorTarima === null) {
      setGuiasPorTarima(parametros.guias_por_tarima ?? 100)
    }
  }, [parametros])

  const currentValue = parametros?.guias_por_tarima ?? 100

  const handleSave = async () => {
    if (!canEdit) return
    setIsSaving(true)
    try {
      await api.put('/dropscan/config/parametros', {
        guias_por_tarima: Number(guiasPorTarima)
      })
      toast.success('Parametros guardados correctamente')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error guardando parametros')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <LoadingSpinner text="Cargando parametros..." />

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center">
              <Sliders className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-warm-800">Parametros Generales</h3>
              <p className="text-xs text-warm-500">Configuracion global del modulo DropScan</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Guias por tarima */}
            <div className="p-4 rounded-xl border border-warm-200 bg-warm-50/50">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-warm-700 mb-1">
                    Guias por tarima
                  </label>
                  <p className="text-xs text-warm-500 mb-3">
                    Cantidad maxima de guias que se pueden asignar a una tarima antes de cerrarla automaticamente.
                    Valor actual en uso: <span className="font-bold text-warm-700">{currentValue}</span>
                  </p>

                  {canEdit ? (
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        value={guiasPorTarima ?? ''}
                        onChange={e => setGuiasPorTarima(e.target.value)}
                        className="input-field w-32 text-center font-mono font-bold text-lg"
                        min={1}
                        max={10000}
                        step={1}
                      />
                      <motion.button
                        onClick={handleSave}
                        disabled={isSaving || Number(guiasPorTarima) === currentValue}
                        className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={Number(guiasPorTarima) !== currentValue ? { scale: 1.02 } : {}}
                        whileTap={Number(guiasPorTarima) !== currentValue ? { scale: 0.98 } : {}}
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Guardando...' : 'Guardar'}
                      </motion.button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="px-4 py-2.5 rounded-xl bg-white border border-warm-200 font-mono font-bold text-lg text-warm-700 w-32 text-center">
                        {currentValue}
                      </div>
                      <span className="text-xs text-warm-400 italic">
                        Solo Supervisores y Administradores pueden modificar este valor
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!canEdit && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-50 border border-warning-200">
                <Settings className="w-4 h-4 text-warning-600 shrink-0" />
                <p className="text-xs text-warning-700">
                  No tienes permisos para modificar estos parametros. Contacta a un Supervisor o Administrador.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
