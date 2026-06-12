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
import { fmtDate } from '../../../core/utils/dateFormat'
import * as configService from '../services/configService'
import {
  Settings, Plus, Edit3, Trash2,
  Radio, Package, Search, X, ToggleLeft, ToggleRight,
  Sliders, Save, Users, Lock, KeyRound
} from 'lucide-react'
import * as operadoresService from '../services/operadoresService'

export default function Configuracion() {
  const { t } = useI18nStore()
  const [tab, setTab] = useState('empresas')
  const { canDelete, getPermissionLevel } = useAuthStore()
  const configLevel = getPermissionLevel('dropscan.configuracion')
  // crear+: can toggle active/inactive status
  const canToggle = ['crear', 'actualizar', 'eliminar'].includes(configLevel)
  // actualizar+: can edit names, create records, change permissions
  const canEdit = ['actualizar', 'eliminar'].includes(configLevel)
  const canRemove = canDelete('dropscan.configuracion')

  return (
    <div className="flex flex-col h-full">
      <Header title={t('config.title')} subtitle={t('config.subtitle')} />

      <div className="flex-1 overflow-y-auto">
        {/* Tab bar */}
        <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6">
          <div data-tour="config-tabs" className="flex gap-1">
            {[
              { key: 'empresas', label: t('config.companies'), icon: Package },
              { key: 'canales', label: t('config.channels'), icon: Radio },
              { key: 'operadores', label: t('config.internalUsers'), icon: Users },
              { key: 'parametros', label: t('config.parameters'), icon: Sliders },
            ].map(item => (
              <button key={item.key} data-tour={`config-tab-${item.key}`} onClick={() => setTab(item.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-200
                  ${tab === item.key
                    ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                    : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                  }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === 'empresas' && <div data-tour="config-empresas"><EmpresasTab canEdit={canEdit} canToggle={canToggle} canRemove={canRemove} /></div>}
          {tab === 'canales' && <CanalesTab canEdit={canEdit} canToggle={canToggle} canRemove={canRemove} />}
          {tab === 'operadores' && <OperadoresTab canEdit={canEdit} canToggle={canToggle} canRemove={canRemove} />}
          {tab === 'parametros' && <ParametrosTab canEdit={canEdit} />}
        </div>
      </div>
    </div>
  )
}

function ConfigHero({ icon: Icon, title, subtitle, search, onSearchChange, searchPlaceholder, action, maxWidth = 'max-w-6xl' }) {
  return (
    <div className={`${maxWidth} mx-auto mb-6`}>
      <div className="rounded-3xl border border-warm-100 bg-gradient-to-br from-white via-white to-primary-50/35 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-warm-900">{title}</h2>
              <p className="mt-1 text-sm text-warm-500">{subtitle}</p>
            </div>
          </div>
          {(onSearchChange || action) && (
            <div className="flex items-center gap-3">
              {onSearchChange && (
                <div className="relative min-w-[260px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
                  <input
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="input-field pl-10 pr-10 text-sm"
                  />
                  {search && (
                    <button onClick={() => onSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X className="w-4 h-4 text-warm-400 hover:text-warm-600" />
                    </button>
                  )}
                </div>
              )}
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== EMPRESAS TAB ====================

function EmpresasTab({ canEdit, canToggle, canRemove }) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingEmpresa, setEditingEmpresa] = useState(null)
  const queryClient = useQueryClient()
  const toast = useToastStore.getState()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data: empresasRaw, isLoading, isError } = useQuery({
    queryKey: ['dropscan-empresas'],
    queryFn: () => configService.getEmpresas(),
    enabled: backendOnline,
  })
  const empresas = Array.isArray(empresasRaw) ? empresasRaw : empresasRaw?.items || empresasRaw?.empresas || []

  const createMutation = useMutation({
    mutationFn: configService.createEmpresa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success(t('config.companyCreated'))
      setShowModal(false)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.companyCreateError'))
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => configService.updateEmpresa(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success(t('config.companyUpdated'))
      setShowModal(false)
      setEditingEmpresa(null)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.companyUpdateError'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: configService.deleteEmpresa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success(t('config.companyDeleted'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.companyDeleteError'))
    }
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/DropScan/config/empresas/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-empresas'] })
      toast.success(t('config.companyToggled'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.companyToggleError'))
    }
  })

  const handleOpenModal = (empresa = null) => {
    setEditingEmpresa(empresa)
    setShowModal(true)
  }

  const handleDelete = (empresa) => {
    if (confirm(t('config.confirmDeleteCompany'))) {
      deleteMutation.mutate(empresa.id)
    }
  }

  const filtered = empresas.filter(e =>
    e.nombre.toLowerCase().includes(search.toLowerCase()) ||
    e.codigo.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) return <LoadingSpinner text={t('config.loadingCompanies')} />

  return (
    <>
      <ConfigHero
        icon={Package}
        title={t('config.companies')}
        subtitle={t('config.companiesSubtitle')}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('config.searchCompanies')}
        action={canEdit ? (
          <button onClick={() => handleOpenModal()} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus className="w-4 h-4" /> {t('config.newCompany')}
          </button>
        ) : null}
      />

      <div className="max-w-6xl mx-auto">

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
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: empresa.color + '20' }}
                  >
                    <Package className="w-6 h-6" style={{ color: empresa.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-warm-800 truncate mb-1">{empresa.nombre}</h3>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold bg-warm-100 text-warm-600">
                      {empresa.codigo}
                    </span>
                  </div>
                </div>

                {(canToggle || canEdit || canRemove) && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {canToggle && (
                      <button
                        onClick={() => toggleMutation.mutate(empresa.id)}
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                        title={empresa.activo ? t('config.deactivate') : t('config.activate')}
                        disabled={toggleMutation.isPending}
                      >
                        {empresa.activo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleOpenModal(empresa)}
                        className="p-1.5 rounded-lg hover:bg-accent-50 text-warm-400 hover:text-accent-600 transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => handleDelete(empresa)}
                        className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 text-xs text-warm-400">
                  <span>{t('config.color')}:</span>
                  <div
                    className="w-4 h-4 rounded border border-warm-200"
                    style={{ backgroundColor: empresa.color }}
                  />
                  <span className="font-mono">{empresa.color}</span>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border ${
                  empresa.activo
                    ? 'border-success-200 bg-success-50 text-success-700'
                    : 'border-warm-200 bg-warm-100 text-warm-500'
                }`}>
                  {empresa.activo ? t('common.active') : t('common.inactive')}
                </span>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full card p-16 text-center">
              <Package className="w-12 h-12 text-warm-300 mx-auto mb-3" />
              <p className="text-sm text-warm-400">
                {search ? t('config.noCompaniesFound') : t('config.noCompanies')}
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
  const { t } = useI18nStore()
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
      title={empresa ? t('config.editCompany') : t('config.newCompany')}
      icon={Package}
      size="md"
      preventBackdropClose
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            {t('common.name')} <span className="text-danger-500">*</span>
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
            {t('common.code')} <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={formData.codigo}
            onChange={e => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
            className="input-field font-mono"
            placeholder="Ej: FEDEX"
            required
          />
          <p className="text-xs text-warm-500 mt-1">{t('config.uniqueCode')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            {t('config.color')} <span className="text-danger-500">*</span>
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
          <p className="text-xs text-warm-500 mt-1">{t('config.colorHex')}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-warm-700 block mb-2">{t('common.status')}</label>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, activo: !formData.activo })}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              formData.activo
                ? 'bg-success-100 text-success-700 ring-1 ring-success-300 hover:bg-success-200'
                : 'bg-warm-100 text-warm-500 ring-1 ring-warm-200 hover:bg-warm-200'
            }`}
          >
            {formData.activo ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {formData.activo ? t('common.active') : t('common.inactive')}
          </button>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-warm-200 text-warm-700 font-medium hover:bg-warm-50 transition-colors"
            disabled={isLoading}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="flex-1 btn-primary"
            disabled={isLoading}
          >
            {isLoading ? t('config.saving') : empresa ? t('config.update') : t('config.createCompany')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ==================== CANALES TAB ====================

function CanalesTab({ canEdit, canToggle, canRemove }) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCanal, setEditingCanal] = useState(null)
  const queryClient = useQueryClient()
  const toast = useToastStore.getState()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data: canalesRaw, isLoading, isError } = useQuery({
    queryKey: ['dropscan-canales'],
    queryFn: () => configService.getCanales(),
    enabled: backendOnline,
  })
  const canales = Array.isArray(canalesRaw) ? canalesRaw : canalesRaw?.items || canalesRaw?.canales || []

  const createMutation = useMutation({
    mutationFn: configService.createCanal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success(t('config.channelCreated'))
      setShowModal(false)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.channelCreateError'))
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => configService.updateCanal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success(t('config.channelUpdated'))
      setShowModal(false)
      setEditingCanal(null)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.channelUpdateError'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: configService.deleteCanal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success(t('config.channelDeleted'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.channelDeleteError'))
    }
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/DropScan/config/canales/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-canales'] })
      toast.success(t('config.channelToggled'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.channelToggleError'))
    }
  })

  const handleOpenModal = (canal = null) => {
    setEditingCanal(canal)
    setShowModal(true)
  }

  const handleDelete = (canal) => {
    if (confirm(t('config.confirmDeleteChannel'))) {
      deleteMutation.mutate(canal.id)
    }
  }

  const filtered = canales.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (c.descripcion && c.descripcion.toLowerCase().includes(search.toLowerCase()))
  )

  if (isLoading) return <LoadingSpinner text={t('config.loadingChannels')} />

  return (
    <>
      <ConfigHero
        icon={Radio}
        title={t('config.channels')}
        subtitle={t('config.channelsSubtitle')}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('config.searchChannels')}
        action={canEdit ? (
          <button onClick={() => handleOpenModal()} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus className="w-4 h-4" /> {t('config.newChannel')}
          </button>
        ) : null}
      />

      <div className="max-w-6xl mx-auto">

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
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-base font-bold text-warm-800 truncate">{canal.nombre}</h3>
                      {canal.es_default && (
                        <span className="badge bg-primary-100 text-primary-700 text-xs shrink-0">{t('config.default')}</span>
                      )}
                    </div>
                    {(canToggle || canEdit || canRemove) && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        {canToggle && (
                          <button
                            onClick={() => toggleMutation.mutate(canal.id)}
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                            title={canal.activo ? t('config.deactivate') : t('config.activate')}
                            disabled={toggleMutation.isPending}
                          >
                            {canal.activo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => handleOpenModal(canal)}
                            className="p-1.5 rounded-lg hover:bg-accent-50 text-warm-400 hover:text-accent-600 transition-colors"
                            title={t('common.edit')}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {canRemove && !canal.es_default && (
                          <button
                            onClick={() => handleDelete(canal)}
                            className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {canal.descripcion && (
                    <p className="text-sm text-warm-500 mb-2">{canal.descripcion}</p>
                  )}

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
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: emp.color || '#6366f1' }} />
                          {emp.nombre}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4 mt-2">
                    <div className="flex items-center gap-4 text-xs text-warm-400">
                      <span>{t('config.created')}: {fmtDate(canal.created_at)}</span>
                      {canal.updated_at !== canal.created_at && (
                        <span>{t('config.updated')}: {fmtDate(canal.updated_at)}</span>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border shrink-0 ${
                      canal.activo ? 'border-success-200 bg-success-50 text-success-700' : 'border-warm-200 bg-warm-100 text-warm-500'
                    }`}>
                      {canal.activo ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="card p-16 text-center">
              <Radio className="w-12 h-12 text-warm-300 mx-auto mb-3" />
              <p className="text-sm text-warm-400">
                {search ? t('config.noChannelsFound') : t('config.noChannels')}
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
  const { t } = useI18nStore()
  const [formData, setFormData] = useState({
    nombre: canal?.nombre || '',
    descripcion: canal?.descripcion || '',
    activo: canal?.activo !== false,
    es_default: canal?.es_default || false,
    empresa_ids: canal?.empresas?.map(e => e.id) || []
  })

  const { data: empresasRaw } = useQuery({
    queryKey: ['dropscan-empresas'],
    queryFn: () => configService.getEmpresas(),
    enabled: backendOnline,
  })
  const empresas = Array.isArray(empresasRaw) ? empresasRaw : empresasRaw?.items || empresasRaw?.empresas || []

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
      title={canal ? t('config.editChannel') : t('config.newChannel')}
      icon={Radio}
      size="md"
      preventBackdropClose
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            {t('common.name')} <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nombre}
            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
            className="input-field"
            placeholder={t('config.enterName')}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">{t('common.description')}</label>
          <textarea
            value={formData.descripcion}
            onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
            className="input-field resize-none"
            rows={3}
            placeholder={t('config.enterDescription')}
          />
        </div>

        {/* Empresa multi-select checkboxes */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-2">
            {t('config.linkedCompanies')}
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
              {t('config.noActiveCompanies')}
            </p>
          )}
          {formData.empresa_ids.length > 0 && (
            <p className="text-xs text-warm-500 mt-1">
              {t('config.companiesSelected').replace('{n}', formData.empresa_ids.length)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, activo: !formData.activo })}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              formData.activo
                ? 'bg-success-100 text-success-700 ring-1 ring-success-300 hover:bg-success-200'
                : 'bg-warm-100 text-warm-500 ring-1 ring-warm-200 hover:bg-warm-200'
            }`}
          >
            {formData.activo ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {t('config.channelActive')}
          </button>

          <button
            type="button"
            onClick={() => setFormData({ ...formData, es_default: !formData.es_default })}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              formData.es_default
                ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300 hover:bg-primary-200'
                : 'bg-warm-100 text-warm-500 ring-1 ring-warm-200 hover:bg-warm-200'
            }`}
          >
            {formData.es_default ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {t('config.channelDefault')}
          </button>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-warm-200 text-warm-700 font-medium hover:bg-warm-50 transition-colors"
            disabled={isLoading}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="flex-1 btn-primary"
            disabled={isLoading}
          >
            {isLoading ? t('config.saving') : canal ? t('config.update') : t('config.createChannel')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ==================== PARAMETROS GENERALES TAB ====================

function ParametrosTab({ canEdit }) {
  const { t } = useI18nStore()
  const qc = useQueryClient()
  const [guiasPorTarima, setGuiasPorTarima] = useState(null)
  const [pesoHabilitado, setPesoHabilitado] = useState(null)
  const [unidadPeso, setUnidadPeso] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const toast = useToastStore.getState()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data: parametros, isLoading } = useQuery({
    queryKey: ['dropscan-parametros'],
    queryFn: async () => {
      const { data } = await api.get('/DropScan/config/parametros')
      return data
    },
    enabled: backendOnline,
  })

  useEffect(() => {
    if (parametros && guiasPorTarima === null) {
      setGuiasPorTarima(parametros.guias_por_tarima ?? 100)
      setPesoHabilitado(parametros.peso_habilitado ?? false)
      setUnidadPeso(parametros.unidad_peso ?? 'kg')
    }
  }, [parametros])

  const currentValue = parametros?.guias_por_tarima ?? 100
  const currentPeso = parametros?.peso_habilitado ?? false
  const currentUnidad = parametros?.unidad_peso ?? 'kg'

  const handleSave = async () => {
    if (!canEdit) return
    setIsSaving(true)
    try {
      const { data } = await api.put('/DropScan/config/parametros', {
        guias_por_tarima: Number(guiasPorTarima),
        peso_habilitado: pesoHabilitado ?? false,
        unidad_peso: unidadPeso ?? 'kg',
      })
      qc.setQueryData(['dropscan-parametros'], data)
      toast.success(t('config.parametersSaved'))
    } catch (error) {
      toast.error(error.response?.data?.error || t('config.parametersSaveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const hasChanges = Number(guiasPorTarima) !== currentValue || (pesoHabilitado ?? false) !== currentPeso || (unidadPeso ?? 'kg') !== currentUnidad

  if (isLoading) return <LoadingSpinner text={t('config.loadingParams')} />

  return (
    <div className="max-w-5xl mx-auto">
      <ConfigHero
        icon={Sliders}
        title={t('config.parameters')}
        subtitle={t('config.parametersSubtitle')}
        maxWidth="max-w-5xl"
      />
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="card p-6">
          <div className="space-y-6">
            {/* Guias por tarima */}
            <div className="p-4 rounded-xl border border-warm-200 bg-warm-50/50">
              <label className="block text-sm font-semibold text-warm-700 mb-1">
                {t('config.guidesPerPallet')}
              </label>
              <p className="text-xs text-warm-500 mb-3">
                {t('config.guidesPerPalletDesc')}
                {' '}{t('config.currentValue')}: <span className="font-bold text-warm-700">{currentValue}</span>
              </p>
              {canEdit ? (
                <input
                  type="number"
                  value={guiasPorTarima ?? ''}
                  onChange={e => setGuiasPorTarima(e.target.value)}
                  className="input-field w-32 text-center font-mono font-bold text-lg"
                  min={1}
                  max={10000}
                  step={1}
                />
              ) : (
                <div className="px-4 py-2.5 rounded-xl bg-white border border-warm-200 font-mono font-bold text-lg text-warm-700 w-32 text-center">
                  {currentValue}
                </div>
              )}
            </div>

            {/* Bascula y peso */}
            <div className="p-4 rounded-xl border border-warm-200 bg-warm-50/50 space-y-4">
              <p className="text-xs font-bold text-warm-500 uppercase tracking-wider">{t('config.scaleSection')}</p>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-warm-700 mb-1">{t('config.weightPerGuide')}</p>
                  <p className="text-xs text-warm-500">{t('config.weightPerGuideDesc')}</p>
                  <p className="text-xs text-warm-400 mt-1.5 italic">{t('config.weightPerGuideHint')}</p>
                </div>
                <button
                  onClick={() => canEdit && setPesoHabilitado(v => !v)}
                  disabled={!canEdit}
                  className={`shrink-0 transition-colors ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {pesoHabilitado
                    ? <ToggleRight className="w-10 h-10 text-primary-500" />
                    : <ToggleLeft className="w-10 h-10 text-warm-300" />}
                </button>
              </div>

              {pesoHabilitado && (
                <div className="pt-3 border-t border-warm-200">
                  <p className="text-sm font-semibold text-warm-700 mb-1">{t('config.weightUnit')}</p>
                  <p className="text-xs text-warm-500 mb-3">{t('config.weightUnitDesc')}</p>
                  <div className="flex gap-2">
                    {['kg', 'g', 'lb'].map(unit => (
                      <button
                        key={unit}
                        onClick={() => canEdit && setUnidadPeso(unit)}
                        disabled={!canEdit}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${
                          (unidadPeso ?? 'kg') === unit
                            ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                            : 'bg-white text-warm-600 border-warm-200 hover:border-primary-300 hover:text-primary-600'
                        } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {t(`config.weightUnit.${unit}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!canEdit && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-50 border border-warning-200">
                <Settings className="w-4 h-4 text-warning-600 shrink-0" />
                <p className="text-xs text-warning-700">{t('config.noChanges')}</p>
              </div>
            )}

            {canEdit && (
              <motion.button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="w-full btn-primary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={hasChanges ? { scale: 1.01 } : {}}
                whileTap={hasChanges ? { scale: 0.99 } : {}}
              >
                <Save className="w-4 h-4" />
                {isSaving ? t('config.saving') : t('config.saveParams')}
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ==================== OPERADORES INTERNOS TAB ====================

function OperadoresTab({ canEdit, canToggle, canRemove }) {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingOp, setEditingOp] = useState(null)
  const [showPinModal, setShowPinModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const queryClient = useQueryClient()
  const toast = useToastStore.getState()
  const { t } = useI18nStore()
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data: operadoresRaw, isLoading } = useQuery({
    queryKey: ['dropscan-operadores'],
    queryFn: () => operadoresService.getOperadores(),
    enabled: backendOnline,
  })
  const operadores = Array.isArray(operadoresRaw) ? operadoresRaw : []

  const createMutation = useMutation({
    mutationFn: operadoresService.createOperador,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-operadores'] })
      toast.success(t('config.operatorCreated'))
      setShowModal(false)
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Error')
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => operadoresService.updateOperador(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-operadores'] })
      toast.success(t('config.operatorUpdated'))
      setShowModal(false)
      setEditingOp(null)
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Error')
  })

  const deleteMutation = useMutation({
    mutationFn: operadoresService.deleteOperador,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-operadores'] })
      toast.success(t('config.operatorDeleted'))
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Error')
  })

  const pinMutation = useMutation({
    mutationFn: ({ id, pin }) => operadoresService.changePin(id, pin),
    onSuccess: () => {
      toast.success(t('config.pinChanged'))
      setShowPinModal(null)
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Error')
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, activo }) => operadoresService.updateOperador(id, { activo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropscan-operadores'] })
      toast.success(t('config.operatorUpdated'))
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Error')
  })

  const filtered = operadores.filter(o =>
    o.nombre.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) return <LoadingSpinner text={t('config.loadingOperators')} />

  return (
    <>
      <ConfigHero
        icon={Users}
        title={t('config.internalUsers')}
        subtitle={t('config.internalUsersDesc')}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('config.searchOperators')}
        action={canEdit ? (
          <button onClick={() => { setEditingOp(null); setShowModal(true) }} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus className="w-4 h-4" /> {t('config.newOperator')}
          </button>
        ) : null}
      />

      <div className="max-w-6xl mx-auto">

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((op, i) => (
            <motion.div
              key={op.id}
              className="card-interactive p-5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    op.activo ? 'bg-gradient-to-br from-primary-100 to-accent-100' : 'bg-warm-100'
                  }`}>
                    <Users className={`w-6 h-6 ${op.activo ? 'text-primary-600' : 'text-warm-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-warm-800 truncate">{op.nombre}</h3>
                    <span className="text-xs text-warm-400">ID: {op.id}</span>
                  </div>
                </div>

                {(canToggle || canEdit || canRemove) && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {canToggle && (
                      <button
                        onClick={() => toggleMutation.mutate({ id: op.id, activo: !op.activo })}
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                        title={op.activo ? t('config.deactivate') : t('config.activate')}
                        disabled={toggleMutation.isPending}
                      >
                        {op.activo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => { setEditingOp(op); setShowModal(true) }}
                        className="p-1.5 rounded-lg hover:bg-accent-50 text-warm-400 hover:text-accent-600 transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setShowPinModal(op)}
                        className="p-1.5 rounded-lg hover:bg-accent-50 text-warm-400 hover:text-accent-600 transition-colors"
                        title="PIN"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => setDeleteTarget(op)}
                        className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-400">
                  {t('common.created')}: {fmtDate(op.created_at)}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border ${
                  op.activo ? 'border-success-200 bg-success-50 text-success-700' : 'border-warm-200 bg-warm-100 text-warm-500'
                }`}>
                  {op.activo ? t('common.active') : t('common.inactive')}
                </span>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full card p-16 text-center">
              <Users className="w-12 h-12 text-warm-300 mx-auto mb-3" />
              <p className="text-sm text-warm-400">
                {search ? t('common.noResults') : t('config.noOperators')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <OperadorModal
          operador={editingOp}
          onClose={() => { setShowModal(false); setEditingOp(null) }}
          onSubmit={(data) => {
            if (editingOp) {
              updateMutation.mutate({ id: editingOp.id, data: { nombre: data.nombre, activo: data.activo } })
            } else {
              createMutation.mutate(data)
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
          t={t}
        />
      )}

      {/* Change PIN Modal */}
      {showPinModal && (
        <PinChangeModal
          operador={showPinModal}
          onClose={() => setShowPinModal(null)}
          onSubmit={(pin) => pinMutation.mutate({ id: showPinModal.id, pin })}
          isLoading={pinMutation.isPending}
          t={t}
        />
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('common.delete')}
        icon={Trash2}
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn-ghost text-sm">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => deleteTarget?.id && deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
              disabled={deleteMutation.isPending || !deleteTarget?.id}
              className="btn-danger inline-flex items-center gap-2 text-sm"
            >
              {deleteMutation.isPending && <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />}
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-warm-700">
          {t('config.confirmDeleteOperator').replace('{name}', deleteTarget?.nombre || '')}
        </p>
        <p className="mt-2 text-xs text-warm-500">
          Esta acción desactiva definitivamente el escaneador interno en la configuración actual.
        </p>
      </Modal>
    </>
  )
}

function OperadorModal({ operador, onClose, onSubmit, isLoading, t }) {
  const [formData, setFormData] = useState({
    nombre: operador?.nombre || '',
    pin: '',
    activo: operador?.activo !== false
  })

  const isEditing = !!operador

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.nombre.trim().length < 3 || formData.nombre.trim().length > 50) {
      return
    }
    if (!isEditing && (!/^\d{4}$/.test(formData.pin))) {
      return
    }
    onSubmit(formData)
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEditing ? t('config.editOperator') : t('config.newOperator')}
      icon={Users}
      size="md"
      preventBackdropClose
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            {t('config.operatorName')} <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nombre}
            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
            className="input-field"
            placeholder="Ej: Juan Pérez"
            required
            autoFocus
            minLength={3}
            maxLength={50}
          />
          <p className="text-xs text-warm-500 mt-1">{t('config.nameLength')}</p>
        </div>

        {!isEditing && (
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              {t('config.operatorPin')} <span className="text-danger-500">*</span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={formData.pin}
              onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className="input-field font-mono text-center tracking-widest text-lg"
              placeholder="••••"
              maxLength={4}
              required
              autoComplete="off"
            />
            <p className="text-xs text-warm-500 mt-1">{t('config.pinFormat')}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1.5">{t('config.operatorActive')}</label>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, activo: !formData.activo })}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              formData.activo
                ? 'bg-success-100 text-success-700 ring-1 ring-success-300 hover:bg-success-200'
                : 'bg-warm-100 text-warm-500 ring-1 ring-warm-200 hover:bg-warm-200'
            }`}
          >
            {formData.activo ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {formData.activo ? 'Activo' : 'Inactivo'}
          </button>
        </div>

        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-warm-200 text-warm-700 font-medium hover:bg-warm-50 transition-colors"
            disabled={isLoading}
          >
            {t('common.cancel')}
          </button>
          <button type="submit" className="flex-1 btn-primary" disabled={isLoading}>
            {isLoading ? t('config.saving') : isEditing ? t('common.save') : t('config.newOperator')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PinChangeModal({ operador, onClose, onSubmit, isLoading, t }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!/^\d{4}$/.test(pin)) {
      setError(t('config.pinFormat'))
      return
    }
    if (pin !== confirmPin) {
      setError(t('config.pinMismatch'))
      return
    }
    onSubmit(pin)
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t('config.changePinFor').replace('{name}', operador.nombre)}
      icon={Lock}
      size="sm"
      preventBackdropClose
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            {t('config.newPin')} <span className="text-danger-500">*</span>
          </label>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
            className="input-field font-mono text-center tracking-widest text-lg"
            placeholder="••••"
            maxLength={4}
            required
            autoFocus
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">
            {t('config.confirmPin')} <span className="text-danger-500">*</span>
          </label>
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
            className="input-field font-mono text-center tracking-widest text-lg"
            placeholder="••••"
            maxLength={4}
            required
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-warm-200 text-warm-700 font-medium hover:bg-warm-50 transition-colors"
            disabled={isLoading}
          >
            {t('common.cancel')}
          </button>
          <button type="submit" className="flex-1 btn-primary" disabled={isLoading}>
            {isLoading ? t('config.saving') : t('config.changePin')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
