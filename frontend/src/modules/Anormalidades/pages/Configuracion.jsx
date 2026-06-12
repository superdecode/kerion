import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Plus, RefreshCw, Edit3, Trash2, CheckCircle2, XCircle,
  AlertCircle, Workflow, Route, SlidersHorizontal, Search, BookOpen,
  ToggleLeft, ToggleRight, ArrowUpDown, ArrowUp, ArrowDown,
  AlertTriangle, ShieldAlert,
} from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import {
  getCodigos, createCodigo, updateCodigo, deleteCodigo,
  getProcesosConfig, createProcesoConfig, updateProcesoConfig, deleteProcesoConfig,
  getNivelesConfig, createNivelConfig, updateNivelConfig, deleteNivelConfig,
  getOrigenesConfig, createOrigenConfig, updateOrigenConfig, deleteOrigenConfig,
} from '../services/anormalidadesService'

const CATALOGO_EMPTY = { codigo: '', nombre: '', descripcion: '', activo: true }
const NIVEL_EMPTY = { codigo: '', nombre: '', descripcion: '', activo: true, prioridad: 1, horas_limite: 24 }
const CODIGO_EMPTY = { codigo: '', nombre: '', proceso: '', nivel_sugerido: '', descripcion: '' }
const SOFT_PANEL = 'rounded-3xl border border-warm-100/80 bg-white shadow-[0_20px_48px_-28px_rgba(15,23,42,0.24),0_12px_24px_-18px_rgba(59,130,246,0.18)]'
const SOFT_PANEL_TINT = 'rounded-3xl border border-warm-100/80 bg-gradient-to-br from-white via-white to-primary-50/35 shadow-[0_22px_54px_-30px_rgba(15,23,42,0.24),0_16px_28px_-20px_rgba(59,130,246,0.16)]'

function getNivelMeta(prioridad) {
  if (prioridad >= 3) return {
    Icon: ShieldAlert,
    iconBg: 'bg-danger-100', iconText: 'text-danger-600',
    cardBorder: 'border-danger-200/70',
    badgeBg: 'bg-danger-100', badgeText: 'text-danger-700', badgeBorder: 'border-danger-200',
  }
  if (prioridad === 2) return {
    Icon: AlertTriangle,
    iconBg: 'bg-warning-100', iconText: 'text-warning-600',
    cardBorder: 'border-warning-200/70',
    badgeBg: 'bg-warning-100', badgeText: 'text-warning-700', badgeBorder: 'border-warning-200',
  }
  return {
    Icon: CheckCircle2,
    iconBg: 'bg-success-100', iconText: 'text-success-600',
    cardBorder: 'border-success-200/70',
    badgeBg: 'bg-success-100', badgeText: 'text-success-700', badgeBorder: 'border-success-200',
  }
}

export default function AnormConfiguracion() {
  const toast = useToastStore()
  const { t } = useI18nStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState('niveles')
  const [procesoFilter, setProcesoFilter] = useState('')
  const inp = 'w-full text-sm border border-warm-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300'

  const { data: procesosData, isLoading: loadingProcesos } = useQuery({ queryKey: ['anorm-procesos-config'], queryFn: getProcesosConfig })
  const { data: nivelesData, isLoading: loadingNiveles } = useQuery({ queryKey: ['anorm-niveles-config'], queryFn: getNivelesConfig })
  const { data: origenesData, isLoading: loadingOrigenes } = useQuery({ queryKey: ['anorm-origenes-config'], queryFn: getOrigenesConfig })
  const { data: codigosData, isLoading: loadingCodigos } = useQuery({ queryKey: ['anorm-codigos-config'], queryFn: getCodigos })

  const procesos = procesosData?.data || []
  const niveles = nivelesData?.data || []
  const origenes = origenesData?.data || []
  const codigos = codigosData?.data || []
  const procesosActivos = procesos.filter(item => item.activo)
  const nivelesActivos = niveles.filter(item => item.activo)
  const codigosFiltrados = procesoFilter ? codigos.filter(item => item.proceso === procesoFilter) : codigos

  const invalidateConfig = () => {
    qc.invalidateQueries({ queryKey: ['anorm-procesos-config'] })
    qc.invalidateQueries({ queryKey: ['anorm-niveles-config'] })
    qc.invalidateQueries({ queryKey: ['anorm-origenes-config'] })
    qc.invalidateQueries({ queryKey: ['anorm-codigos-config'] })
    qc.invalidateQueries({ queryKey: ['anorm-codigos'] })
  }

  const createProcesoMut = useMutation({
    mutationFn: createProcesoConfig,
    onSuccess: () => { invalidateConfig(); toast.success(t('anorm.config.procesoCreado')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const updateProcesoMut = useMutation({
    mutationFn: ({ id, data }) => updateProcesoConfig(id, data),
    onSuccess: () => { invalidateConfig(); toast.success(t('common.saved')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const deleteProcesoMut = useMutation({
    mutationFn: deleteProcesoConfig,
    onSuccess: () => { invalidateConfig(); toast.success(t('common.deleted')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const createOrigenMut = useMutation({
    mutationFn: createOrigenConfig,
    onSuccess: () => { invalidateConfig(); toast.success(t('anorm.config.origenCreado')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const updateOrigenMut = useMutation({
    mutationFn: ({ id, data }) => updateOrigenConfig(id, data),
    onSuccess: () => { invalidateConfig(); toast.success(t('common.saved')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const deleteOrigenMut = useMutation({
    mutationFn: deleteOrigenConfig,
    onSuccess: () => { invalidateConfig(); toast.success(t('common.deleted')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const createCodigoMut = useMutation({
    mutationFn: createCodigo,
    onSuccess: () => { invalidateConfig(); toast.success(t('anorm.config.codigoCreado')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const updateCodigoMut = useMutation({
    mutationFn: ({ id, data }) => updateCodigo(id, data),
    onSuccess: () => { invalidateConfig(); toast.success(t('common.saved')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const deleteCodigoMut = useMutation({
    mutationFn: deleteCodigo,
    onSuccess: () => { invalidateConfig(); toast.success(t('common.deleted')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.config.errorDeleteBase')),
  })

  const createNivelMut = useMutation({
    mutationFn: createNivelConfig,
    onSuccess: () => { invalidateConfig(); toast.success(t('anorm.config.nivelCreado')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const updateNivelMut = useMutation({
    mutationFn: ({ codigo, data }) => updateNivelConfig(codigo, data),
    onSuccess: () => { invalidateConfig(); toast.success(t('common.saved')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })
  const deleteNivelMut = useMutation({
    mutationFn: deleteNivelConfig,
    onSuccess: () => { invalidateConfig(); toast.success(t('common.deleted')) },
    onError: e => toast.error(e?.response?.data?.error || t('anorm.toast.errorGeneric')),
  })

  const tabs = [
    { key: 'niveles', label: t('anorm.field.nivel'), icon: SlidersHorizontal },
    { key: 'procesos', label: t('anorm.field.proceso'), icon: Workflow },
    { key: 'origenes', label: t('anorm.field.origen'), icon: Route },
    { key: 'codigos', label: t('anorm.config.catalogoTitle'), icon: BookOpen },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header title={t('anorm.config.title')} subtitle={t('anorm.config.subtitle')} icon={<Settings className="w-5 h-5 text-warm-500" />} />

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-[5] bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6">
          <div className="flex gap-1">
            {tabs.map(item => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-200 ${
                  tab === item.key
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

        <div className="p-6">
          {tab === 'procesos' && (
            <CatalogoConfigTab
              tipo="proceso"
              title={t('anorm.config.procesosTitle')}
              subtitle={t('anorm.config.procesosSubtitle')}
              icon={Workflow}
              loading={loadingProcesos}
              items={procesos}
              emptyLabel={t('anorm.config.emptyProcesos')}
              createLabel={t('anorm.config.nuevoProceso')}
              inp={inp}
              onCreate={data => createProcesoMut.mutate(data)}
              onUpdate={(id, data) => updateProcesoMut.mutate({ id, data })}
              onDelete={id => deleteProcesoMut.mutate(id)}
              onToggle={item => updateProcesoMut.mutate({ id: item.id, data: { ...item, activo: !item.activo } })}
              busy={createProcesoMut.isPending || updateProcesoMut.isPending || deleteProcesoMut.isPending}
            />
          )}

          {tab === 'origenes' && (
            <CatalogoConfigTab
              tipo="origen"
              title={t('anorm.config.origenesTitle')}
              subtitle={t('anorm.config.origenesSubtitle')}
              icon={Route}
              loading={loadingOrigenes}
              items={origenes}
              emptyLabel={t('anorm.config.emptyOrigenes')}
              createLabel={t('anorm.config.nuevoOrigen')}
              inp={inp}
              onCreate={data => createOrigenMut.mutate(data)}
              onUpdate={(id, data) => updateOrigenMut.mutate({ id, data })}
              onDelete={id => deleteOrigenMut.mutate(id)}
              onToggle={item => updateOrigenMut.mutate({ id: item.id, data: { ...item, activo: !item.activo } })}
              busy={createOrigenMut.isPending || updateOrigenMut.isPending || deleteOrigenMut.isPending}
            />
          )}

          {tab === 'niveles' && (
            <NivelesTab
              inp={inp}
              niveles={niveles}
              loading={loadingNiveles}
              onCreate={data => createNivelMut.mutate(data)}
              onUpdate={(codigo, data) => updateNivelMut.mutate({ codigo, data })}
              onDelete={codigo => deleteNivelMut.mutate(codigo)}
              busy={createNivelMut.isPending || updateNivelMut.isPending || deleteNivelMut.isPending}
            />
          )}

          {tab === 'codigos' && (
            <CodigosTab
              inp={inp}
              codigos={codigosFiltrados}
              procesos={procesosActivos}
              niveles={nivelesActivos}
              procesoFilter={procesoFilter}
              setProcesoFilter={setProcesoFilter}
              loading={loadingCodigos}
              onCreate={data => createCodigoMut.mutate(data)}
              onUpdate={(id, data) => updateCodigoMut.mutate({ id, data })}
              onDelete={id => deleteCodigoMut.mutate(id)}
              busy={createCodigoMut.isPending || updateCodigoMut.isPending || deleteCodigoMut.isPending}
            />
          )}

        </div>
      </div>
    </div>
  )
}

function CatalogoConfigTab({ title, subtitle, icon: Icon, items, loading, emptyLabel, createLabel, inp, onCreate, onUpdate, onDelete, onToggle, busy, tipo }) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter(item =>
      item.nombre?.toLowerCase().includes(query) ||
      item.codigo?.toLowerCase().includes(query) ||
      item.descripcion?.toLowerCase().includes(query)
    )
  }, [items, search])

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className={`${SOFT_PANEL_TINT} p-6`}>
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
            <div className="flex items-center gap-3">
              <div className="relative min-w-[260px]">
                <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-warm-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} className={`${inp} pl-10`} placeholder={t('common.search')} />
              </div>
              <button onClick={() => setCreateOpen(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" />
                {createLabel}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-warm-200 bg-white p-16 text-center text-sm text-warm-400">{emptyLabel}</div>
        ) : (
          <div className="space-y-4">
            {filtered.map(item => (
              <div key={item.id} className="rounded-2xl border border-warm-100/80 bg-white p-5 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.28),0_10px_22px_-20px_rgba(59,130,246,0.16)] transition-shadow hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.3),0_16px_28px_-20px_rgba(59,130,246,0.18)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-warm-100 text-warm-600">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-warm-900 truncate">{item.nombre}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-primary-700">{item.codigo}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {onToggle && (
                          <button
                            onClick={() => onToggle(item)}
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                            title={item.activo ? t('config.deactivate') : t('config.activate')}
                          >
                            {item.activo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => setEditItem(item)}
                          className="p-1.5 rounded-lg hover:bg-accent-50 text-warm-400 hover:text-accent-600 transition-colors"
                          title={t('common.edit')}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteItem(item)}
                          className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3 mt-1">
                      <p className="text-sm text-warm-500 flex-1 min-w-0">{item.descripcion || '—'}</p>
                      <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border shrink-0 ${
                        item.activo
                          ? 'border-success-200 bg-success-50 text-success-700'
                          : 'border-warm-200 bg-warm-100 text-warm-500'
                      }`}>
                        {item.activo ? t('common.active') : t('common.inactive')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CatalogoFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={createLabel}
        inp={inp}
        tipo={tipo}
        onSubmit={data => { onCreate(data); setCreateOpen(false) }}
        loading={busy}
      />

      {editItem && (
        <CatalogoFormModal
          isOpen
          onClose={() => setEditItem(null)}
          title={`${t('common.edit')} ${editItem.nombre}`}
          initialData={editItem}
          inp={inp}
          tipo={tipo}
          onSubmit={data => { onUpdate(editItem.id, data); setEditItem(null) }}
          loading={busy}
        />
      )}

      <DeleteConfirmModal
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => { onDelete(deleteItem.id); setDeleteItem(null) }}
        loading={busy}
      />
    </>
  )
}

function CodigosTab({ codigos, procesos, niveles, procesoFilter, setProcesoFilter, loading, onCreate, onUpdate, onDelete, busy, inp }) {
  const { t } = useI18nStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [editCodigo, setEditCodigo] = useState(null)
  const [deleteCod, setDeleteCod] = useState(null)
  const [search, setSearch] = useState('')
  const [nivelFilter, setNivelFilter] = useState('')
  const [sortKey, setSortKey] = useState('codigo')
  const [sortDir, setSortDir] = useState('asc')

  const filteredCodigos = useMemo(() => {
    const query = search.trim().toLowerCase()
    const base = codigos.filter(item => {
      const matchesSearch = !query || item.codigo?.toLowerCase().includes(query) || item.nombre?.toLowerCase().includes(query) || item.descripcion?.toLowerCase().includes(query)
      const matchesNivel = !nivelFilter || item.nivel_sugerido === nivelFilter
      return matchesSearch && matchesNivel
    })
    const sorted = [...base].sort((a, b) => {
      const aVal = String(a?.[sortKey] ?? '').toLowerCase()
      const bVal = String(b?.[sortKey] ?? '').toLowerCase()
      if (aVal === bVal) return 0
      const result = aVal > bVal ? 1 : -1
      return sortDir === 'asc' ? result : -result
    })
    return sorted
  }, [codigos, search, nivelFilter, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ field }) => {
    if (sortKey !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-warm-300" />
    return sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-primary-500" /> : <ArrowDown className="w-3.5 h-3.5 text-primary-500" />
  }

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className={`${SOFT_PANEL_TINT} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-warm-900">{t('anorm.config.catalogoTitle')}</h2>
              <p className="mt-1 text-sm text-warm-500">{t('anorm.config.catalogoSubtitle')}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={procesoFilter} onChange={e => setProcesoFilter(e.target.value)} className={`${inp} min-w-[220px] max-w-[260px]`}>
              <option value="">{t('common.all')}</option>
              {procesos.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
            </select>
            <select value={nivelFilter} onChange={e => setNivelFilter(e.target.value)} className={`${inp} min-w-[160px] max-w-[180px]`}>
              <option value="">{t('anorm.field.nivel')}</option>
              {niveles.map(n => <option key={n.codigo} value={n.codigo}>{n.nombre}</option>)}
            </select>
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-warm-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} className={`${inp} pl-10`} placeholder={t('common.search')} />
            </div>
            <button onClick={() => setCreateOpen(true)} className="btn-primary inline-flex items-center gap-2 text-sm" disabled={!procesos.length}>
              <Plus className="w-4 h-4" />
              {t('anorm.config.nuevoCodigo')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className={`${SOFT_PANEL} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100 bg-warm-50/70">
                  <th className="table-header">
                    <button onClick={() => handleSort('codigo')} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-warm-500">{t('anorm.field.codigo')} <SortIcon field="codigo" /></button>
                  </th>
                  <th className="table-header">
                    <button onClick={() => handleSort('nombre')} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-warm-500">{t('common.name')} <SortIcon field="nombre" /></button>
                  </th>
                  <th className="table-header">
                    <button onClick={() => handleSort('proceso')} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-warm-500">{t('anorm.field.proceso')} <SortIcon field="proceso" /></button>
                  </th>
                  <th className="table-header">
                    <button onClick={() => handleSort('nivel_sugerido')} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-warm-500">{t('anorm.field.nivel')} <SortIcon field="nivel_sugerido" /></button>
                  </th>
                  <th className="table-header">
                    <button onClick={() => handleSort('activo')} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-warm-500">{t('common.status')} <SortIcon field="activo" /></button>
                  </th>
                  <th className="table-header"><span className="text-xs font-semibold uppercase tracking-wider text-warm-500">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {filteredCodigos.length === 0 ? (
                  <tr><td colSpan={6} className="py-14 text-center text-sm text-warm-400">{t('common.noData')}</td></tr>
                ) : filteredCodigos.map(c => (
                  <tr key={c.id} className="hover:bg-warm-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary-700">{c.codigo}</span>
                      {c.es_default && <span className="ml-2 rounded-md bg-warm-100 px-1.5 py-0.5 text-[10px] text-warm-500">{t('anorm.config.baseCode')}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-warm-800">{c.nombre}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-warm-600">{c.proceso}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        c.nivel_sugerido === 'L3' ? 'bg-danger-100 text-danger-700 border-danger-200'
                        : c.nivel_sugerido === 'L2' ? 'bg-warning-100 text-warning-700 border-warning-200'
                        : 'bg-success-100 text-success-700 border-success-200'
                      }`}>{c.nivel_sugerido}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        c.activo ? 'border-success-200 bg-success-50 text-success-700' : 'border-warm-200 bg-warm-100 text-warm-500'
                      }`}>
                        {c.activo ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onUpdate(c.id, { activo: !c.activo })}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.activo
                              ? 'text-success-500 hover:bg-success-50'
                              : 'text-warm-400 hover:bg-warm-100'
                          }`}
                          title={c.activo ? t('config.deactivate') : t('config.activate')}
                        >
                          {c.activo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setEditCodigo(c)} className="p-1.5 rounded-lg hover:bg-accent-100 text-warm-400 hover:text-accent-600 transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => !c.es_default && setDeleteCod(c)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.es_default
                              ? 'text-warm-200 cursor-not-allowed'
                              : 'hover:bg-danger-100 text-warm-400 hover:text-danger-600'
                          }`}
                          title={c.es_default ? 'Código base no eliminable' : t('common.delete')}
                          disabled={c.es_default}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CodigoFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('anorm.config.nuevoCodigo')}
        procesos={procesos}
        niveles={niveles}
        onSubmit={data => { onCreate(data); setCreateOpen(false) }}
        loading={busy}
        inp={inp}
      />

      {editCodigo && (
        <CodigoFormModal
          isOpen
          onClose={() => setEditCodigo(null)}
          title={`${t('common.edit')} ${editCodigo.codigo}`}
          initialData={{ ...editCodigo }}
          procesos={procesos}
          niveles={niveles}
          onSubmit={data => { onUpdate(editCodigo.id, data); setEditCodigo(null) }}
          loading={busy}
          inp={inp}
        />
      )}

      <DeleteConfirmModal
        item={deleteCod}
        onClose={() => setDeleteCod(null)}
        onConfirm={() => { onDelete(deleteCod.id); setDeleteCod(null) }}
        loading={busy}
        warning={t('anorm.config.deleteCodigoWarning')}
      />
    </>
  )
}

function NivelesTab({ niveles, loading, onCreate, onUpdate, onDelete, busy, inp }) {
  const { t } = useI18nStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [editNivel, setEditNivel] = useState(null)
  const [deleteNivel, setDeleteNivel] = useState(null)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className={`${SOFT_PANEL_TINT} p-6`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-warm-900">{t('anorm.config.nivelesTitle')}</h2>
            <p className="mt-1 text-sm text-warm-500">{t('anorm.config.nivelesSubtitle')}</p>
          </div>
          <button onClick={() => setCreateOpen(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            {t('anorm.config.nuevoNivel')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {niveles.map((nivel) => {
            const meta = getNivelMeta(nivel.prioridad)
            const LevelIcon = meta.Icon
            return (
              <div key={nivel.codigo} className={`rounded-2xl border p-5 bg-white shadow-[0_16px_32px_-24px_rgba(15,23,42,0.28),0_10px_22px_-20px_rgba(59,130,246,0.16)] transition-shadow hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.3),0_16px_28px_-20px_rgba(59,130,246,0.18)] ${meta.cardBorder}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                    <LevelIcon className={`w-5 h-5 ${meta.iconText}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-warm-900">{nivel.nombre}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-primary-700">{nivel.codigo}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => onUpdate(nivel.codigo, { ...nivel, activo: !nivel.activo })}
                          className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                          title={nivel.activo ? t('config.deactivate') : t('config.activate')}
                        >
                          {nivel.activo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setEditNivel(nivel)}
                          className="p-1.5 rounded-lg hover:bg-accent-50 text-warm-400 hover:text-accent-600 transition-colors"
                          title={t('common.edit')}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteNivel(nivel)}
                          className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-400 hover:text-danger-600 transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-warm-600 mb-4">
                      <p>{t('anorm.config.horasLimite')}: <span className="font-semibold text-warm-800">{nivel.horas_limite}h</span></p>
                      {nivel.descripcion && <p className="text-warm-500">{nivel.descripcion}</p>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border ${
                        nivel.activo ? 'border-success-200 bg-success-50 text-success-700' : 'border-warm-200 bg-warm-100 text-warm-500'
                      }`}>
                        {nivel.activo ? t('common.active') : t('common.inactive')}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}>
                        P{nivel.prioridad}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NivelFormModal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('anorm.config.nuevoNivel')} inp={inp} onSubmit={data => { onCreate(data); setCreateOpen(false) }} loading={busy} />
      {editNivel && <NivelFormModal isOpen onClose={() => setEditNivel(null)} title={`${t('common.edit')} ${editNivel.codigo}`} initialData={editNivel} inp={inp} onSubmit={data => { onUpdate(editNivel.codigo, data); setEditNivel(null) }} loading={busy} />}
      <DeleteConfirmModal item={deleteNivel} onClose={() => setDeleteNivel(null)} onConfirm={() => { onDelete(deleteNivel.codigo); setDeleteNivel(null) }} loading={busy} />
    </div>
  )
}

function NivelFormModal({ isOpen, onClose, title, initialData, onSubmit, loading, inp }) {
  const { t } = useI18nStore()
  const [form, setForm] = useState(initialData ? { ...initialData } : { ...NIVEL_EMPTY })

  useEffect(() => {
    setForm(initialData ? { ...initialData } : { ...NIVEL_EMPTY })
  }, [initialData])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const isActive = form.activo !== false

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={SlidersHorizontal} size="lg">
      <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, activo: isActive, prioridad: Number(form.prioridad || 1), horas_limite: Number(form.horas_limite || 24) }) }} className="space-y-5">
        <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-br from-white via-white to-primary-50/25 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.28)]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.codigo')} *</label>
              <input value={form.codigo} onChange={e => set('codigo', e.target.value.toUpperCase())} className={inp} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.name')} *</label>
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)} className={inp} required />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-warm-100/80 bg-white p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.config.prioridad')}</label>
              <input type="number" min="1" value={form.prioridad} onChange={e => set('prioridad', e.target.value)} className={inp} />
              <p className="mt-1 text-xs text-warm-500">Numero mas alto = mayor prioridad y mayor severidad.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.config.horasLimite')}</label>
              <input type="number" min="1" value={form.horas_limite} onChange={e => set('horas_limite', e.target.value)} className={inp} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-warm-100/80 bg-white p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.description')}</label>
          <textarea value={form.descripcion || ''} onChange={e => set('descripcion', e.target.value)} className={`${inp} resize-none`} rows={3} />
        </div>
        <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-r from-white via-white to-success-50/40 p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
          <label className="block text-xs font-medium text-warm-700 mb-2">{t('common.status')}</label>
          <button
            type="button"
            onClick={() => set('activo', !isActive)}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isActive
                ? 'bg-success-100 text-success-700 ring-1 ring-success-300 hover:bg-success-200'
                : 'bg-warm-100 text-warm-500 ring-1 ring-warm-200 hover:bg-warm-200'
            }`}
          >
            {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {isActive ? t('common.active') : t('common.inactive')}
          </button>
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-warm-100">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary text-sm inline-flex items-center gap-2">
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CatalogoFormModal({ isOpen, onClose, title, initialData, onSubmit, loading, inp, tipo }) {
  const { t } = useI18nStore()
  const [form, setForm] = useState(initialData ? { ...initialData } : { ...CATALOGO_EMPTY })
  const isProceso = tipo === 'proceso'

  useEffect(() => {
    setForm(initialData ? { ...initialData } : { ...CATALOGO_EMPTY })
  }, [initialData])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const isActive = form.activo !== false

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={Settings} size="lg">
      <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, activo: isActive }) }} className="space-y-5">
        <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-br from-white via-white to-primary-50/25 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.28)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">General</p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.name')} *</label>
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)} className={inp} required />
            </div>
            {isProceso && (
              <div>
                <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.codigo')} *</label>
                <input value={form.codigo} onChange={e => set('codigo', e.target.value.toUpperCase())} className={inp} required maxLength={24} />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-warm-100/80 bg-white p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.description')}</label>
          <textarea value={form.descripcion || ''} onChange={e => set('descripcion', e.target.value)} className={`${inp} resize-none`} rows={3} />
        </div>

        <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-r from-white via-white to-success-50/40 p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
          <label className="block text-xs font-medium text-warm-700 mb-2">{t('common.status')}</label>
          <button
            type="button"
            onClick={() => set('activo', !isActive)}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isActive
                ? 'bg-success-100 text-success-700 ring-1 ring-success-300 hover:bg-success-200'
                : 'bg-warm-100 text-warm-500 ring-1 ring-warm-200 hover:bg-warm-200'
            }`}
          >
            {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {isActive ? t('common.active') : t('common.inactive')}
          </button>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-warm-100">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary text-sm inline-flex items-center gap-2">
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CodigoFormModal({ isOpen, onClose, title, initialData, onSubmit, loading, inp, procesos, niveles = [] }) {
  const { t } = useI18nStore()
  const [form, setForm] = useState(initialData || { ...CODIGO_EMPTY })

  useEffect(() => {
    setForm(initialData || { ...CODIGO_EMPTY })
  }, [initialData])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={Settings} size="lg">
      <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="space-y-5">
        <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-br from-white via-white to-primary-50/25 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.28)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">General</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.codigo')} *</label>
              <input value={form.codigo} onChange={e => set('codigo', e.target.value.toUpperCase())} className={inp} required maxLength={20} />
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.proceso')} *</label>
              <select value={form.proceso} onChange={e => set('proceso', e.target.value)} className={inp} required>
                <option value="">{t('common.select')}</option>
                {procesos.map(item => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-warm-100/80 bg-white p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)]">
          <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.name')} *</label>
          <input value={form.nombre || ''} onChange={e => set('nombre', e.target.value)} className={inp} required />
        </div>
        <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-r from-white via-white to-accent-50/30 p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)] space-y-4">
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('anorm.field.nivel')}</label>
            <select value={form.nivel_sugerido} onChange={e => set('nivel_sugerido', e.target.value)} className={inp}>
              <option value="">{t('common.select')}</option>
              {niveles.map(n => <option key={n.codigo} value={n.codigo}>{n.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-700 mb-1">{t('common.description')}</label>
            <textarea value={form.descripcion || ''} onChange={e => set('descripcion', e.target.value)} className={`${inp} resize-none`} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-warm-100">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary text-sm inline-flex items-center gap-2">
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteConfirmModal({ item, onClose, onConfirm, loading, warning }) {
  const { t } = useI18nStore()

  return (
    <Modal isOpen={!!item} onClose={onClose} title={t('anorm.delete.title')} icon={Trash2} size="sm">
      <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-3 mb-4">
        <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-warning-700">{warning || t('anorm.config.deleteCatalogWarning')}</p>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
        <button onClick={onConfirm} disabled={loading} className="btn-danger text-sm inline-flex items-center gap-2">
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {t('common.delete')}
        </button>
      </div>
    </Modal>
  )
}
