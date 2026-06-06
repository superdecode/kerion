import { useRef, useEffect, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, Package, CheckCircle2, AlertTriangle, Ban,
  Loader2, Wifi, WifiOff, Trash2, ArrowRight, MoveRight,
  Square, AlertCircle, ScanBarcode, Clock, Timer,
  RefreshCw, PanelRightClose, PanelRightOpen, Search, Maximize2,
  MapPin, Pencil,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import DataSyncStatus from '../../../core/components/common/DataSyncStatus'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useInventarioStore } from '../stores/inventarioStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { useBoxStock } from '../hooks/useBoxStock'
import { findCodeInInventory } from '../../Shared/Wms/findCodeInInventory'
import { generateCodeVariations } from '../../Shared/Wms/normalizeCode'
import { classifyItem, resolveSwap } from '../utils/classify'
import { playSound, initAudio } from '../../Shared/Wms/playSound'
import { checkInventoryDuplicates, saveInventorySession } from '../services/inventarioService'
import { getConfig, getUbicaciones, createUbicacion } from '../../WmsHub/services/wmsHubService'
import { refreshSheet, getCacheTimestamp, getCacheStatus } from '../../WmsHub/services/googleSheetsService'
import { fmtDateTime } from '../../../core/utils/dateFormat'

const STATUS_META = {
  ok:      { labelKey: 'inventario.escaneo.group_disponible', bg: 'bg-success-100 text-success-700',  icon: CheckCircle2, border: 'border-l-success-400', dot: 'bg-success-400', flash: 'bg-success-50/80 border-success-200' },
  blocked: { labelKey: 'inventario.escaneo.group_bloqueado',  bg: 'bg-warning-100 text-warning-700',  icon: AlertTriangle, border: 'border-l-warning-400', dot: 'bg-warning-400', flash: 'bg-warning-50/80 border-warning-200' },
  nowms:   { labelKey: 'inventario.escaneo.group_nowms',      bg: 'bg-danger-100 text-danger-700',    icon: Ban, border: 'border-l-danger-400', dot: 'bg-danger-400', flash: 'bg-danger-50/80 border-danger-200' },
}

const GROUPS = ['ok', 'blocked', 'nowms']
const GROUP_SHORT_LABEL = {
  ok: 'Disp.',
  blocked: 'Bloq.',
  nowms: 'NO WMS',
}

const getItemGroup = (item) => (
  item.groupAssignment && item.groupAssignment !== 'auto'
    ? item.groupAssignment
    : item.status
)

function useSessionTimer(createdAt) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!createdAt) { setElapsed(0); return }
    const start = new Date(createdAt).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt])
  return elapsed
}

const fmtElapsed = (secs) => {
  const m = Math.floor(secs / 60); const s = secs % 60
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

const buildCodeVariantSet = (...codes) => {
  const variants = new Set()
  codes.filter(Boolean).forEach((code) => {
    generateCodeVariations(code).forEach((variant) => variants.add(variant))
  })
  return variants
}

const itemMatchesDuplicateSet = (item, variantSet) => {
  const itemCodes = [item?.code, item?.code2].filter(Boolean)
  return itemCodes.some((code) => generateCodeVariations(code).some((variant) => variantSet.has(variant)))
}

const formatConflictDate = (value, locale = 'es') => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(locale === 'zh' ? 'zh-CN' : 'es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/* ─── Modals ─────────────────────────────────────────────── */

function SessionTypeModal({ isOpen, onStart, onClose }) {
  const { t } = useI18nStore()
  const [selected, setSelected] = useState('unificado')
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.session_type_title')} icon={Package}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => onStart(selected)}>
            <ScanBarcode size={14} /> {t('inventario.escaneo.start_session')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        {[
          { value: 'unificado', label: t('inventario.escaneo.type_unificado'), desc: t('inventario.escaneo.type_unificado_desc') },
          { value: 'clasificacion', label: t('inventario.escaneo.type_clasificacion'), desc: t('inventario.escaneo.type_clasificacion_desc') },
        ].map(opt => (
          <button key={opt.value} onClick={() => setSelected(opt.value)}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
              selected === opt.value ? 'border-primary-500 bg-primary-50' : 'border-warm-200 hover:border-warm-300'
            }`}>
            <p className="font-semibold text-warm-900 text-sm">{opt.label}</p>
            <p className="text-xs text-warm-500 mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function DuplicateModal({ isOpen, code, conflicts = [], onConfirm, onDiscard }) {
  const { t, locale } = useI18nStore()
  const sessionConflicts = conflicts.filter((item) => item.source === 'session')
  const dbConflicts = conflicts.filter((item) => item.source === 'database')

  return (
    <Modal isOpen={isOpen} onClose={onDiscard} title={t('inventario.escaneo.duplicate_title')} icon={AlertCircle}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onDiscard}>{t('inventario.escaneo.descartar')}</button>
          <button className="btn-primary" onClick={onConfirm}>{t('inventario.escaneo.confirmar')}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-warm-700">
          <code className="font-mono bg-warm-100 px-2 py-0.5 rounded">{code}</code>
          <span className="mt-1 block">{t('inventario.escaneo.duplicate_body')}</span>
        </p>

        {sessionConflicts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning-700">
              {t('inventario.escaneo.duplicate_session_matches')}
            </p>
            {sessionConflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-xl border border-warning-200 bg-warning-50/70 px-3 py-2.5 text-sm text-warning-900">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono font-semibold">{conflict.primary_code || '—'}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-warning-700">{t('inventario.escaneo.duplicate_source_session')}</span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-warning-800 sm:grid-cols-2">
                  <span>{t('inventario.escaneo.duplicate_label_code2')}: <strong className="font-mono">{conflict.code2 || '—'}</strong></span>
                  <span>{t('inventario.escaneo.duplicate_label_time')}: <strong>{formatConflictDate(conflict.scanned_at, locale)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}

        {dbConflicts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-danger-700">
              {t('inventario.escaneo.duplicate_db_matches')}
            </p>
            {dbConflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-xl border border-danger-200 bg-danger-50/70 px-3 py-2.5 text-sm text-danger-900">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono font-semibold">{conflict.normalized_code || '—'}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-danger-700">{t('inventario.escaneo.duplicate_source_db')}</span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-danger-800 sm:grid-cols-2">
                  <span>{t('inventario.escaneo.duplicate_label_code2')}: <strong className="font-mono">{conflict.code2 || '—'}</strong></span>
                  <span>{t('inventario.escaneo.duplicate_label_user')}: <strong>{conflict.operator_nombre || '—'}</strong></span>
                  <span>{t('inventario.escaneo.duplicate_label_time')}: <strong>{formatConflictDate(conflict.scanned_at, locale)}</strong></span>
                  <span>{t('inventario.escaneo.duplicate_label_tarima')}: <strong>{conflict.tarima_code || conflict.group_assignment || '—'}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function MoveItemModal({ isOpen, onClose, onMove }) {
  const { t } = useI18nStore()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.move_item')} icon={MoveRight}
      footer={<button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>}
    >
      <div className="space-y-2">
        {GROUPS.map(g => {
          const meta = STATUS_META[g]
          return (
            <button key={g} onClick={() => onMove(g)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border ${meta.bg} border-current/20 hover:opacity-80 text-sm font-medium`}>
              <meta.icon size={14} /> {t(meta.labelKey)}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function CloseTabModal({ isOpen, count, onConfirm, onClose }) {
  const { t } = useI18nStore()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.close_tab_title')} icon={AlertTriangle}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-danger inline-flex items-center gap-2" onClick={onConfirm}>
            <Trash2 size={14} /> {t('inventario.escaneo.close_tab_confirm')}
          </button>
        </div>
      }
    >
      <p className="text-sm text-warm-700">
        {t('inventario.escaneo.close_tab_body').replace('{{count}}', count)}
      </p>
    </Modal>
  )
}

function SessionSummaryModal({ isOpen, tab, onSave, onContinue, isSaving, ubicacionValidated, onChangeUbicacion }) {
  const { t } = useI18nStore()
  if (!tab) return null
  const counts = tab.items.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a }, {})
  const started = new Date(tab.createdAt)
  const durSec = Math.floor((new Date() - started) / 1000)
  const dur = durSec < 60 ? `${durSec}s` : `${Math.floor(durSec/60)}m ${durSec%60}s`
  return (
    <Modal isOpen={isOpen} onClose={onContinue} title={t('inventario.escaneo.session_summary')} icon={Package}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onContinue}>{t('inventario.escaneo.keep_scanning')}</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('inventario.escaneo.save_registro')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-warm-50 rounded-xl p-3">
            <p className="text-xs text-warm-500 uppercase tracking-wide">{t('inventario.escaneo.tipo_sesion')}</p>
            <p className="font-semibold text-warm-900 mt-0.5 capitalize">{tab.scanType}</p>
          </div>
          <div className="bg-warm-50 rounded-xl p-3">
            <p className="text-xs text-warm-500 uppercase tracking-wide">{t('inventario.escaneo.duration')}</p>
            <p className="font-semibold text-warm-900 mt-0.5">{dur}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GROUPS.map(g => {
            const meta = STATUS_META[g]
            return (
              <div key={g} className={`rounded-xl p-3 text-center ${meta.bg}`}>
                <p className="text-2xl font-bold leading-none">{counts[g] || 0}</p>
                <p className="text-xs mt-1">{t(meta.labelKey)}</p>
              </div>
            )
          })}
        </div>
        <div className="bg-primary-50 rounded-xl px-4 py-2 flex justify-between items-center">
          <span className="text-warm-700">{t('inventario.escaneo.total')}</span>
          <span className="font-bold text-primary-700 text-lg">{tab.items.length}</span>
        </div>
        {ubicacionValidated ? (
          <div className="flex items-center gap-2 bg-accent-50 rounded-xl px-3 py-2.5 border border-accent-100">
            <MapPin size={13} className="text-accent-600 shrink-0" />
            <span className="font-mono font-semibold text-accent-700 text-xs">{ubicacionValidated.codigo}</span>
            {ubicacionValidated.nombre && ubicacionValidated.nombre !== ubicacionValidated.codigo && (
              <span className="text-accent-500 text-xs truncate">{ubicacionValidated.nombre}</span>
            )}
            <button className="ml-auto p-1 rounded-lg hover:bg-accent-200 text-accent-400 hover:text-accent-700 transition-colors"
              onClick={onChangeUbicacion} title={t('inventario.escaneo.ubicacion_edit')}>
              <Pencil size={10} />
            </button>
          </div>
        ) : (
          <button
            className="w-full text-left px-3 py-2.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-accent-300 hover:text-accent-600 transition-colors flex items-center gap-2"
            onClick={onChangeUbicacion}>
            <MapPin size={11} />
            {t('inventario.escaneo.ubicacion_scan_title')}
          </button>
        )}
      </div>
    </Modal>
  )
}

function UbicacionInputModal({ isOpen, onClose, onSkip, ubicaciones, onUbicacionConfirmed, onCreateRequest }) {
  const { t } = useI18nStore()
  const [inputValue, setInputValue] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [notFoundCode, setNotFoundCode] = useState('')
  const locationRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setInputValue('')
      setNotFound(false)
      setNotFoundCode('')
      setTimeout(() => locationRef.current?.focus(), 80)
    }
  }, [isOpen])

  function handleConfirm() {
    const val = inputValue.trim()
    if (!val) return
    const norm = val.toLowerCase()
    const found = (ubicaciones ?? []).find(u =>
      (u.codigo || '').toLowerCase() === norm || (u.nombre || '').toLowerCase() === norm
    )
    if (found) {
      onUbicacionConfirmed({ id: found.id, codigo: found.codigo, nombre: found.nombre })
    } else {
      setNotFoundCode(val)
      setNotFound(true)
    }
  }

  const suggestions = (inputValue.trim() && !notFound)
    ? (ubicaciones ?? []).filter(u =>
        (u.codigo || '').toLowerCase().includes(inputValue.toLowerCase()) ||
        (u.nombre || '').toLowerCase().includes(inputValue.toLowerCase())
      ).slice(0, 5)
    : []

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.ubicacion_scan_title')} icon={MapPin}
      footer={
        <div className="flex gap-3 justify-between w-full">
          <button className="btn-ghost text-sm" onClick={onSkip}>{t('inventario.escaneo.ubicacion_skip')}</button>
          <button className="btn-primary text-sm inline-flex items-center gap-2" onClick={handleConfirm} disabled={!inputValue.trim()}>
            <CheckCircle2 size={14} /> {t('inventario.escaneo.ubicacion_continue')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-warm-500">{t('inventario.escaneo.ubicacion_scan_label')}</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-300" />
            <input
              ref={locationRef}
              type="text"
              className="w-full pl-10 pr-4 py-3 text-base bg-white border-2 border-accent-200 rounded-2xl
                focus:border-accent-500 focus:shadow-md
                transition-all outline-none placeholder:text-warm-300 font-mono"
              placeholder="UB-XXX"
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setNotFound(false) }}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
              autoComplete="off"
            />
          </div>
          <button className="btn-primary px-4 py-3 rounded-2xl" onClick={handleConfirm} disabled={!inputValue.trim()}>
            <CheckCircle2 size={16} />
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {suggestions.map(u => (
              <button key={u.id}
                className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-accent-100 transition-colors text-xs flex items-center gap-2"
                onClick={() => onUbicacionConfirmed({ id: u.id, codigo: u.codigo, nombre: u.nombre })}>
                <MapPin size={10} className="text-accent-500 shrink-0" />
                <span className="font-mono font-semibold text-accent-700">{u.codigo}</span>
                {u.nombre && u.nombre !== u.codigo && (
                  <span className="text-warm-500 truncate">{u.nombre}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {notFound && (
          <motion.div className="rounded-2xl border border-warning-200 bg-warning-50 p-4 space-y-3"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warning-700">{t('inventario.escaneo.ubicacion_not_found_title')}</p>
                <p className="text-xs text-warning-600 mt-0.5">
                  <strong className="font-mono">{notFoundCode}</strong> — {t('inventario.escaneo.ubicacion_not_found_body')}
                </p>
              </div>
            </div>
            <button
              className="w-full btn-primary text-sm inline-flex items-center justify-center gap-2"
              onClick={() => onCreateRequest(notFoundCode)}>
              <Plus size={14} /> {t('inventario.escaneo.ubicacion_create_btn')}
            </button>
          </motion.div>
        )}
      </div>
    </Modal>
  )
}

function UbicacionCreateConfirmModal({ isOpen, onClose, onConfirm, code, isCreating }) {
  const { t } = useI18nStore()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.ubicacion_confirm_title')} icon={MapPin}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose} disabled={isCreating}>{t('common.cancel')}</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={onConfirm} disabled={isCreating}>
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {t('inventario.escaneo.ubicacion_create_btn')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-warm-700">
          {t('inventario.escaneo.ubicacion_confirm_body').replace('{{code}}', code)}
        </p>
        <div className="bg-accent-50 rounded-xl px-4 py-3 flex items-center gap-2 border border-accent-100">
          <MapPin size={14} className="text-accent-600 shrink-0" />
          <span className="font-mono font-bold text-accent-700">{code}</span>
        </div>
      </div>
    </Modal>
  )
}


function GroupDetailModal({
  isOpen,
  group,
  items,
  onClose,
  onToggleMarked,
  onMarkVisible,
  onClearVisible,
}) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')
  const [markedOnly, setMarkedOnly] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setMarkedOnly(false)
    }
  }, [isOpen])

  if (!group) return null

  const meta = STATUS_META[group] ?? STATUS_META.nowms
  const normalizedSearch = search.trim().toLowerCase()
  const baseItems = items.filter(item => getItemGroup(item) === group)
  const filtered = baseItems.filter(item => {
    if (markedOnly && !item.marked) return false
    if (!normalizedSearch) return true
    return [
      item.code,
      item.code2,
      item.sku,
      item.product,
      item.location,
    ].some(value => (value || '').toLowerCase().includes(normalizedSearch))
  })
  const markedCount = baseItems.filter(item => item.marked).length
  const visibleMarkedCount = filtered.filter(item => item.marked).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t(meta.labelKey)} · ${baseItems.length}`}
      icon={meta.icon}
      size="full"
      headerAction={
        <div className="hidden md:flex items-center gap-2 text-[11px] font-medium text-warm-500">
          <span>{t('inventario.escaneo.total')}: {baseItems.length}</span>
          <span>{t('inventario.escaneo.marked_count')}: {markedCount}</span>
          <span>{t('inventario.escaneo.filtered_count')}: {filtered.length}</span>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('inventario.escaneo.group_search_placeholder')}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-warm-200 bg-white text-sm outline-none focus:border-primary-400"
            />
          </div>
          <button
            className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
              markedOnly
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-warm-200 bg-white text-warm-600 hover:bg-warm-50'
            }`}
            onClick={() => setMarkedOnly(value => !value)}
          >
            {markedOnly ? t('inventario.escaneo.show_all_items') : t('inventario.escaneo.show_marked_only')}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`rounded-2xl px-4 py-3 border border-current/10 ${meta.bg}`}>
            <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">{t('inventario.escaneo.total')}</p>
            <p className="text-xl font-bold leading-none mt-1">{baseItems.length}</p>
          </div>
          <div className="rounded-2xl px-4 py-3 border border-primary-100 bg-primary-50 text-primary-700">
            <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">{t('inventario.escaneo.filtered_count')}</p>
            <p className="text-xl font-bold leading-none mt-1">{filtered.length}</p>
          </div>
          <div className="rounded-2xl px-4 py-3 border border-emerald-100 bg-emerald-50 text-emerald-700">
            <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">{t('inventario.escaneo.marked_count')}</p>
            <p className="text-xl font-bold leading-none mt-1">{markedCount}</p>
          </div>
          <div className="rounded-2xl px-4 py-3 border border-warm-200 bg-warm-50 text-warm-700">
            <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">{t('inventario.escaneo.marked_visible')}</p>
            <p className="text-xl font-bold leading-none mt-1">{visibleMarkedCount}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-warm-200 overflow-hidden">
          <div className="grid grid-cols-[auto_minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-4 py-3 bg-warm-50/80 text-[11px] font-semibold uppercase tracking-[0.12em] text-warm-500">
            <span>#</span>
            <span>{t('inventario.escaneo.scan_datetime')}</span>
            <span>{t('inventario.escaneo.code_1')}</span>
            <span>{t('inventario.escaneo.code_2')}</span>
            <span>{t('inventario.escaneo.location')}</span>
            <span>{t('common.actions')}</span>
          </div>
          <div className="max-h-[58vh] overflow-y-auto divide-y divide-warm-100">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-warm-400">{t('common.noData')}</div>
            ) : (
              [...filtered].reverse().map((item, index) => (
                <div key={item._idx} className={`grid grid-cols-[auto_minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-4 py-3 items-start text-sm ${item.marked ? 'bg-primary-50/55' : 'bg-white'}`}>
                  <div className="w-6 h-6 rounded-full bg-warm-100 text-warm-500 flex items-center justify-center shrink-0 text-[11px] font-bold">
                    {index + 1}
                  </div>
                  <div className="text-[11px] text-warm-500 whitespace-nowrap">
                    {item.ts ? fmtDateTime(item.ts) : '—'}
                  </div>
                  <div className="font-mono text-xs font-normal text-warm-700 truncate">{item.code}</div>
                  <div className="font-mono text-xs text-warm-500 truncate">{item.code2 || '—'}</div>
                  <div className="text-xs text-warm-600 truncate">{item.location || '—'}</div>
                  <button
                    type="button"
                    onClick={() => onToggleMarked(item._idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      item.marked
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                    }`}
                  >
                    {item.marked ? t('inventario.escaneo.marked_tag') : t('inventario.escaneo.mark_action')}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Panels ──────────────────────────────────────────────── */

function UnificadoPanel({ items, onRemove, onMove }) {
  const { t } = useI18nStore()
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-warm-400 gap-3">
        <Package size={40} className="opacity-20" />
        <p className="text-sm">{t('inventario.escaneo.empty_hint')}</p>
      </div>
    )
  }
  return (
    <div className="card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-warm-50/60">
              <th className="table-header">#</th>
              <th className="table-header">{t('inventario.escaneo.scan_datetime')}</th>
              <th className="table-header">{t('inventario.escaneo.code_1')}</th>
              <th className="table-header">{t('inventario.escaneo.code_2')}</th>
              <th className="table-header">{t('inventario.escaneo.location')}</th>
              <th className="table-header">{t('inventario.escaneo.status')}</th>
              <th className="table-header" />
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {[...items].reverse().map((item, revIdx) => {
              const idx = items.length - 1 - revIdx
              const meta = STATUS_META[item.status] ?? STATUS_META.nowms
              const StatusIcon = meta.icon
              return (
                <tr key={idx} className={`border-l-4 ${meta.border} table-row`}>
                  <td className="table-cell text-warm-400 text-xs">{idx + 1}</td>
                  <td className="table-cell text-warm-500 text-xs whitespace-nowrap">
                    {item.ts ? fmtDateTime(item.ts) : '—'}
                  </td>
                  <td className="table-cell font-mono text-xs text-warm-700">{item.code}</td>
                  <td className="table-cell font-mono text-xs text-warm-500">{item.code2 || '—'}</td>
                  <td className="table-cell text-warm-500 text-xs">{item.location || '—'}</td>
                  <td className="table-cell">
                    <span className={`badge ${meta.bg} inline-flex items-center gap-1`}>
                      <StatusIcon size={10} /> {t(meta.labelKey)}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-primary-600 transition-colors"
                        onClick={() => onMove(idx)} title={t('inventario.escaneo.move_item')}>
                        <ArrowRight size={12} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                        onClick={() => onRemove(idx)} title={t('common.delete')}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ClasificacionPanel({
  items,
  onRemove,
  onMove,
  onOpenDetail,
  ubicaciones,
  groupUbicacion,
  onGroupUbicacionChange,
  onCreateRequest,
  onSend,
}) {
  const { t } = useI18nStore()
  const [activeInputGroup, setActiveInputGroup] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [notFoundCode, setNotFoundCode] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (activeInputGroup) setTimeout(() => inputRef.current?.focus(), 50)
  }, [activeInputGroup])

  const grouped = { ok: [], blocked: [], nowms: [] }
  items.forEach((item, idx) => {
    const group = getItemGroup(item)
    if (grouped[group]) grouped[group].push({ ...item, _idx: idx })
    else grouped.nowms.push({ ...item, _idx: idx })
  })

  function openInput(g) {
    setActiveInputGroup(g)
    setInputValue('')
    setNotFound(false)
    setNotFoundCode('')
  }

  function closeInput() {
    setActiveInputGroup(null)
    setInputValue('')
    setNotFound(false)
    setNotFoundCode('')
  }

  function confirmInput(g) {
    const val = inputValue.trim()
    if (!val) return
    const norm = val.toLowerCase()
    const found = (ubicaciones ?? []).find(u =>
      (u.codigo || '').toLowerCase() === norm || (u.nombre || '').toLowerCase() === norm
    )
    if (found) {
      onGroupUbicacionChange(g, { id: found.id, codigo: found.codigo, nombre: found.nombre })
      closeInput()
    } else {
      setNotFoundCode(val)
      setNotFound(true)
    }
  }

  const suggestions = (activeInputGroup && inputValue.trim() && !notFound)
    ? (ubicaciones ?? []).filter(u =>
        (u.codigo || '').toLowerCase().includes(inputValue.toLowerCase()) ||
        (u.nombre || '').toLowerCase().includes(inputValue.toLowerCase())
      ).slice(0, 4)
    : []

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-5">
      {GROUPS.map(g => {
        const meta = STATUS_META[g]
        const groupItems = grouped[g]
        const hasItems = groupItems.length > 0
        const ub = groupUbicacion[g]
        const isInputActive = activeInputGroup === g
        return (
          <div
            key={g}
            className={`card overflow-hidden border-t-4 flex flex-col min-h-[22rem] sm:min-h-[24rem] lg:min-h-[26rem] xl:min-h-0 xl:h-[clamp(24rem,52vh,32rem)] ${meta.border.replace('border-l-', 'border-t-')}`}
          >
            <div className={`flex items-center gap-2 px-4 py-2.5 ${meta.bg} border-b border-current/10 shrink-0`}>
              <meta.icon size={14} />
              <span className="font-semibold text-sm">{t(meta.labelKey)}</span>
              <span className="inline-flex items-center justify-center min-w-[2.2rem] px-2.5 py-1 rounded-full bg-current/10 border border-current/10 text-xs font-bold">
                {groupItems.length}
              </span>
              <button
                type="button"
                onClick={() => onOpenDetail(g)}
                className="ml-auto p-1.5 rounded-lg bg-current/10 text-current hover:bg-current/15 transition-colors"
                title={t('inventario.escaneo.expand_group')}
              >
                <Maximize2 size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-warm-50">
              {groupItems.length === 0 ? (
                <p className="text-xs text-warm-400 text-center py-4">{t('common.noData')}</p>
              ) : (
                groupItems.map((item, index) => (
                  <div key={item._idx} className={`flex items-start gap-2 px-3 py-2 hover:bg-warm-50 ${item.marked ? 'bg-primary-50/50' : ''}`}>
                    <div className="mt-0.5 w-6 h-6 rounded-full bg-warm-100 text-warm-500 flex items-center justify-center shrink-0 text-[11px] font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs font-semibold text-warm-900 truncate">
                        {item.code}{item.code2 ? ` / ${item.code2}` : ''}
                      </p>
                      <p className="text-[10px] text-warm-400 mt-0.5 truncate">
                        {item.ts ? fmtDateTime(item.ts) : '—'}
                        {' / '}
                        {item.location || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button className="p-1 rounded hover:bg-warm-200 text-warm-400 hover:text-primary-600 transition-colors"
                        onClick={() => onMove(item._idx)}><ArrowRight size={11} /></button>
                      <button className="p-1 rounded hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                        onClick={() => onRemove(item._idx)}><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Footer: inline ubicación input or action button — no marked count */}
            <div className="shrink-0 border-t border-warm-100 bg-warm-50/40">
              {isInputActive ? (
                <div className="px-2 py-2 space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-warm-300" />
                      <input
                        ref={inputRef}
                        type="text"
                        className="w-full pl-6 pr-2 py-1.5 text-[11px] bg-white border border-accent-200 rounded-lg
                          focus:border-accent-500 focus:ring-1 focus:ring-accent-200
                          outline-none placeholder:text-warm-300 font-mono"
                        placeholder="UB-XXX"
                        value={inputValue}
                        onChange={e => { setInputValue(e.target.value); setNotFound(false) }}
                        onKeyDown={e => { if (e.key === 'Enter') confirmInput(g) }}
                        autoComplete="off"
                      />
                    </div>
                    <button
                      onClick={() => confirmInput(g)}
                      disabled={!inputValue.trim()}
                      className="p-1.5 rounded-lg bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      <CheckCircle2 size={12} />
                    </button>
                    <button
                      onClick={closeInput}
                      className="p-1.5 rounded-lg bg-warm-200 text-warm-600 hover:bg-warm-300 transition-colors shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="space-y-0.5 max-h-[4.5rem] overflow-y-auto">
                      {suggestions.map(u => (
                        <button key={u.id}
                          className="w-full text-left px-2 py-0.5 rounded hover:bg-accent-50 transition-colors text-[10px] flex items-center gap-1"
                          onClick={() => {
                            onGroupUbicacionChange(g, { id: u.id, codigo: u.codigo, nombre: u.nombre })
                            closeInput()
                          }}>
                          <MapPin size={8} className="text-accent-400 shrink-0" />
                          <span className="font-mono font-semibold text-accent-700">{u.codigo}</span>
                          {u.nombre && u.nombre !== u.codigo && (
                            <span className="text-warm-400 truncate">{u.nombre}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {notFound && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warning-50 border border-warning-200">
                      <AlertTriangle size={10} className="text-warning-500 shrink-0" />
                      <span className="text-[10px] text-warning-700 flex-1 truncate font-mono">{notFoundCode}</span>
                      <button
                        className="text-[10px] text-primary-600 hover:underline font-semibold shrink-0 whitespace-nowrap"
                        onClick={() => onCreateRequest(notFoundCode, g)}
                      >
                        + {t('inventario.escaneo.ubicacion_create_btn')}
                      </button>
                    </div>
                  )}
                </div>
              ) : ub ? (
                <div className="px-2 py-2 flex items-center gap-2">
                  <div className="flex items-center gap-1 flex-1 min-w-0 px-2 py-1 rounded-lg bg-accent-50 border border-accent-100">
                    <MapPin size={9} className="text-accent-500 shrink-0" />
                    <span className="font-mono text-[11px] font-semibold text-accent-700 truncate">{ub.codigo}</span>
                    <button
                      onClick={() => onGroupUbicacionChange(g, null)}
                      className="ml-auto p-0.5 rounded hover:bg-accent-200 text-accent-400 transition-colors shrink-0"
                      title={t('inventario.escaneo.ubicacion_edit')}
                    >
                      <Pencil size={9} />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!hasItems}
                    onClick={() => onSend(g, ub)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-[11px] font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Square size={10} /> {t('inventario.escaneo.clasificacion_send')}
                  </button>
                </div>
              ) : (
                <div className="px-2 py-2 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={!hasItems}
                    onClick={() => openInput(g)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <CheckCircle2 size={11} /> {t('inventario.escaneo.clasificacion_confirm')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Right side panel ────────────────────────────────────── */

function SidePanel({ items }) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? items.filter(item => item.code.toLowerCase().includes(search.toLowerCase()) || (item.code2 || '').toLowerCase().includes(search.toLowerCase()))
    : items

  const counts = items.reduce((a, i) => {
    const group = getItemGroup(i)
    a[group] = (a[group] || 0) + 1
    return a
  }, {})

  return (
    <div className="hidden lg:flex w-72 border-l border-warm-100 bg-white flex-col shrink-0">
      <div className="px-4 py-3 border-b border-warm-100 bg-warm-50/50">
        <h4 className="text-xs font-bold text-warm-700 mb-2 uppercase tracking-wider">{t('inventario.escaneo.panel_title')}</h4>
        <div className="flex gap-2 mb-2.5">
          {GROUPS.map(g => {
            const meta = STATUS_META[g]
            return (
              <div key={g} className={`flex-1 rounded-lg px-2 py-1.5 text-center ${meta.bg}`}>
                <p className="text-base font-bold leading-none">{counts[g] || 0}</p>
                <p className="text-[9px] mt-0.5 font-semibold uppercase tracking-wide">
                  {GROUP_SHORT_LABEL[g]}
                </p>
              </div>
            )
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-warm-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('inventario.escaneo.panel_search')}
            className="input-field pl-7 pr-2 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-warm-400">{t('inventario.escaneo.panel_empty')}</div>
        ) : (
          [...filtered].reverse().map((item, i) => {
            const meta = STATUS_META[getItemGroup(item)] ?? STATUS_META.nowms
            return (
              <div key={i} className={`px-3 py-2 rounded-xl border ${meta.flash || 'bg-warm-50 border-warm-100'} transition-all ${item.marked ? 'ring-1 ring-primary-200' : ''}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-semibold text-warm-900 truncate">{item.code}</span>
                  <span className={`badge text-[9px] shrink-0 ${meta.bg}`}>{GROUP_SHORT_LABEL[getItemGroup(item)] || t(meta.labelKey)}</span>
                </div>
                {item.code2 && (
                  <p className="font-mono text-[10px] text-warm-400 truncate mt-0.5">
                    {item.wasSwapped && <span className="text-accent-500 mr-1">SWAP</span>}{item.code2}
                  </p>
                )}
                <p className="text-[10px] text-warm-400 truncate mt-0.5">
                  {item.ts ? fmtDateTime(item.ts) : '—'}
                  {' / '}
                  {item.location || '—'}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function Escaneo() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const scanRef = useRef(null)
  const code2Ref = useRef(null)

  const {
    tabs, activeTabId, pendingCode1,
    openTab, closeTab, setActiveTab,
    addScanItem, removeItem, moveItemGroup, toggleItemMarked, setItemsMarkedByGroup,
    setPendingCode1, clearPendingCode1,
    inventorySnapshot,
  } = useInventarioStore()

  const boxStockQuery = useBoxStock()
  const { isPending: isSyncing, pendingCount } = useAutoSync()
  const [sheetTs, setSheetTs] = useState(() => getCacheTimestamp('inventory'))

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const sessionElapsed = useSessionTimer(activeTab?.createdAt)
  const summary = activeTab?.items.reduce((acc, item) => {
    const group = getItemGroup(item)
    acc[group] = (acc[group] || 0) + 1
    acc.total++
    if (item.marked) acc.marked++
    return acc
  }, { ok: 0, blocked: 0, nowms: 0, total: 0, marked: 0 }) ?? { ok: 0, blocked: 0, nowms: 0, total: 0, marked: 0 }
  const inventoryRecords = boxStockQuery.data?.data?.records?.length ?? 0
  const inventoryPartial = getCacheStatus('inventory').partial
  const inventoryHeaderSummary = (
    <DataSyncStatus
      records={inventoryRecords}
      updatedAt={sheetTs}
      partial={inventoryPartial}
      onRefresh={handleSheetRefresh}
      refreshing={boxStockQuery.isFetching}
    />
  )

  const [showTypeModal, setShowTypeModal] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [showUbicacionModal, setShowUbicacionModal] = useState(false)
  const [ubicacionValidated, setUbicacionValidated] = useState(null)
  const [ubicacionToCreate, setUbicacionToCreate] = useState('')
  const [showCreateConfirm, setShowCreateConfirm] = useState(false)
  const [groupUbicacion, setGroupUbicacion] = useState({ ok: null, blocked: null, nowms: null })
  const [pendingInlineGroup, setPendingInlineGroup] = useState(null)
  const [duplicatePending, setDuplicatePending] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)
  const [lastScan, setLastScan] = useState(null)
  const [wmsConfigured, setWmsConfigured] = useState(true)
  const [ubicacionId, setUbicacionId] = useState(null)
  const [showPanel, setShowPanel] = useState(false)
  const [closeTabPending, setCloseTabPending] = useState(null) // { tabId, count }
  const [groupDetail, setGroupDetail] = useState(null)

  const buildSessionDuplicateConflicts = useCallback((codes) => {
    if (!activeTab) return []
    const variantSet = buildCodeVariantSet(...codes)
    return activeTab.items
      .map((item, index) => {
        if (!itemMatchesDuplicateSet(item, variantSet)) return null
        return {
          id: `session-${index}-${item.code}-${item.code2 || 'none'}`,
          source: 'session',
          primary_code: item.code,
          code2: item.code2 || null,
          scanned_at: item.ts ? new Date(item.ts).toISOString() : null,
        }
      })
      .filter(Boolean)
  }, [activeTab])

  const confirmPotentialDuplicate = useCallback(async ({ codes, displayCode, onAccept }) => {
    const sessionConflicts = buildSessionDuplicateConflicts(codes)
    let dbConflicts = []

    try {
      const response = await checkInventoryDuplicates({ codes: [...buildCodeVariantSet(...codes)] })
      dbConflicts = response?.data?.matches || []
    } catch {
      toast.error(t('toast.error'))
      return
    }

    const conflicts = [...sessionConflicts, ...dbConflicts]
    if (conflicts.length === 0) {
      onAccept()
      return
    }

    playSound('warning')
    setLastScan({ status: 'duplicate', code: displayCode })
    setDuplicatePending({ code: displayCode, conflicts, onConfirm: onAccept })
  }, [buildSessionDuplicateConflicts, t, toast])

  const { data: configData } = useQuery({
    queryKey: ['upapex-config'], queryFn: getConfig, staleTime: 60000,
  })
  const { data: ubicacionesData } = useQuery({
    queryKey: ['upapex-ubicaciones', 'inventario'],
    queryFn: () => getUbicaciones('inventario'),
    staleTime: 120000,
  })
  useEffect(() => {
    if (configData !== undefined) setWmsConfigured(!!configData?.data)
  }, [configData])

  useEffect(() => {
    const handler = () => initAudio()
    document.addEventListener('click', handler, { once: true })
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    if (!pendingCode1) setTimeout(() => scanRef.current?.focus(), 80)
    else setTimeout(() => code2Ref.current?.focus(), 80)
  }, [activeTabId, pendingCode1])

  useEffect(() => {
    setUbicacionValidated(null)
    setUbicacionId(null)
    setGroupUbicacion({ ok: null, blocked: null, nowms: null })
    setPendingInlineGroup(null)
  }, [activeTabId])

  const saveSessionMut = useMutation({
    mutationFn: () => {
      const tab = useInventarioStore.getState().tabs.find(t => t.id === activeTabId)
      if (!tab) throw new Error('No active tab')
      const isClasificacion = tab.scanType === 'clasificacion'

      return saveInventorySession({
        scan_type: tab.scanType,
        ubicacion_id: ubicacionId || null,
        tarima_code: null,
        scans: tab.items.map(item => ({
          scanned_code: item.raw, normalized_code: item.code, code2: item.code2 || null,
          was_swapped: item.wasSwapped || false, scan_status: item.status,
          sku: item.sku !== '-' ? item.sku : null, product_name: item.product !== '-' ? item.product : null,
          cell_no: item.location !== '-' ? item.location : null,
          group_assignment: isClasificacion ? getItemGroup(item) : 'unificado',
        })),
      })
    },
    onSuccess: () => {
      closeTab(activeTabId); setShowSummaryModal(false); setUbicacionId(null)
      toast.success(t('inventario.escaneo.session_started'))
      navigate('/Inventario/registros')
    },
    onError: () => toast.error(t('toast.error')),
  })

  const createUbicacionMut = useMutation({
    mutationFn: ({ codigo }) => createUbicacion({ codigo, nombre: codigo }),
    onSuccess: (data) => {
      const u = data.ubicacion
      const newUbicacion = { id: u.id, codigo: u.codigo, nombre: u.nombre }
      qc.invalidateQueries({ queryKey: ['upapex-ubicaciones'] })
      setShowCreateConfirm(false)
      if (pendingInlineGroup) {
        setGroupUbicacion(prev => ({ ...prev, [pendingInlineGroup]: newUbicacion }))
        setPendingInlineGroup(null)
      } else {
        setUbicacionValidated(newUbicacion)
        setUbicacionId(u.id)
        setShowSummaryModal(true)
      }
    },
    onError: () => toast.error(t('toast.error')),
  })

  function handleFinalize() {
    setUbicacionValidated(null)
    setUbicacionId(null)
    setShowUbicacionModal(true)
  }

  function handleUbicacionConfirmed(ubicacion) {
    setUbicacionValidated(ubicacion)
    setUbicacionId(ubicacion.id)
    setShowUbicacionModal(false)
    setShowSummaryModal(true)
  }

  function handleUbicacionSkip() {
    setUbicacionValidated(null)
    setUbicacionId(null)
    setShowUbicacionModal(false)
    setShowSummaryModal(true)
  }

  function handleCreateRequest(code) {
    setUbicacionToCreate(code)
    setShowUbicacionModal(false)
    setShowCreateConfirm(true)
  }

  function handleClasificacionCreateRequest(code, group) {
    setPendingInlineGroup(group)
    setUbicacionToCreate(code)
    setShowCreateConfirm(true)
  }

  function handleClasificacionSend(group, ubicacion) {
    setUbicacionValidated(ubicacion)
    setUbicacionId(ubicacion?.id ?? null)
    setShowSummaryModal(true)
  }

  function handleAddTab() { setShowTypeModal(true) }

  function handleStartSession(scanType) {
    const res = openTab(scanType)
    setShowTypeModal(false)
    if (res?.error === 'max_tabs') toast.warning(t('inventario.escaneo.max_tabs'))
  }

  function handleCloseTab(tabId) {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return
    if (tab.items.length === 0) {
      closeTab(tabId)
    } else {
      setCloseTabPending({ tabId, count: tab.items.length })
    }
  }

  function handleCancelSession() {
    if (!activeTab) return
    if (activeTab.items.length === 0) {
      closeTab(activeTabId)
    } else {
      setCloseTabPending({ tabId: activeTabId, count: activeTab.items.length })
    }
  }

  async function handleSheetRefresh() {
    await refreshSheet('inventory')
    setSheetTs(getCacheTimestamp('inventory'))
    await boxStockQuery.refetch()
  }

  function confirmCloseTab() {
    if (closeTabPending) {
      closeTab(closeTabPending.tabId)
      setCloseTabPending(null)
    }
  }

  const doAddItem = useCallback((newItem) => {
    addScanItem(newItem)
    playSound(newItem.status === 'ok' ? 'success' : newItem.status === 'blocked' ? 'warning' : 'error')
    setLastScan({ status: newItem.status, code: newItem.code })
  }, [addScanItem])

  async function processScan(rawCode) {
    if (!rawCode.trim()) return
    if (!activeTab) { toast.warning(t('inventario.escaneo.no_tab')); return }
    const inv = inventorySnapshot instanceof Map ? inventorySnapshot : new Map()
    const { code, item } = findCodeInInventory(rawCode, inv)
    const acceptScan = () => {
      if (!item) {
        setPendingCode1({ raw: rawCode, code })
        playSound('error')
        toast.warning(t('inventario.escaneo.enter_code2'))
        setLastScan({ status: 'nowms', code })
        return
      }
      const { status, label } = classifyItem(item)
      doAddItem({ raw: rawCode, code, code2: null, wasSwapped: false, status, label,
        sku: item.sku || '-', product: item.productName || '-', location: item.cellNo || '-', groupAssignment: 'auto' })
    }

    if (!item) {
      await confirmPotentialDuplicate({ codes: [code], displayCode: code, onAccept: acceptScan })
      return
    }
    await confirmPotentialDuplicate({ codes: [code], displayCode: code, onAccept: acceptScan })
  }

  async function processCode2(rawCode2) {
    if (!rawCode2.trim() || !pendingCode1) return
    const inv = inventorySnapshot instanceof Map ? inventorySnapshot : new Map()
    const code2Result = findCodeInInventory(rawCode2, inv)
    if (pendingCode1.code === code2Result.code) {
      toast.warning(t('inventario.escaneo.same_codes')); playSound('warning'); return
    }
    const newItem = { ...resolveSwap(pendingCode1, code2Result, rawCode2), groupAssignment: 'auto' }
    await confirmPotentialDuplicate({
      codes: [pendingCode1.code, code2Result.code],
      displayCode: `${newItem.code}${newItem.code2 ? ` / ${newItem.code2}` : ''}`,
      onAccept: () => {
        clearPendingCode1()
        doAddItem(newItem)
        setTimeout(() => scanRef.current?.focus(), 80)
      },
    })
  }

  /* ─── NO SESSION: empty state ─────────────────────────── */
  if (tabs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('inventario.escaneo.title')} subtitle={t('nav.inventario')} actions={inventoryHeaderSummary} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <motion.div className="text-center mb-8"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
              <motion.div
                className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow-lg"
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.05, rotate: 3 }}>
                <Package className="w-12 h-12 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold text-warm-800 mb-2">{t('inventario.escaneo.start_title')}</h2>
              <p className="text-sm text-warm-500 mb-8 leading-relaxed">{t('inventario.escaneo.no_tab_hint')}</p>

              {!wmsConfigured ? (
                <div className="flex flex-col items-center gap-3">
                  <button onClick={() => navigate('/wmshub')}
                    className="inline-flex items-center gap-2.5 px-8 py-3.5 text-base font-semibold rounded-2xl bg-warning-100 text-warning-700 hover:bg-warning-200 transition-colors">
                    {t('inventario.escaneo.wms_not_configured')}
                  </button>
                </div>
              ) : (
                <motion.button onClick={handleAddTab}
                  className="btn-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-base shadow-glow"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <ScanBarcode className="w-5 h-5" /> {t('inventario.escaneo.new_tab')}
                </motion.button>
              )}
            </motion.div>

            <motion.div className="card overflow-hidden"
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <div className="px-5 py-3.5 border-b border-warm-100 flex items-center justify-between bg-warm-50/50">
                <h4 className="text-sm font-bold text-warm-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-warm-400" /> {t('inventario.escaneo.session_types_card')}
                </h4>
              </div>
              <div className="divide-y divide-warm-50">
                {[
                  { type: 'unificado', label: t('inventario.escaneo.type_unificado'), desc: t('inventario.escaneo.type_unificado_desc'), color: 'bg-primary-400' },
                  { type: 'clasificacion', label: t('inventario.escaneo.type_clasificacion'), desc: t('inventario.escaneo.type_clasificacion_desc'), color: 'bg-accent-400' },
                ].map(item => (
                  <div key={item.type} className="flex items-center gap-4 px-5 py-3">
                    <div className={`w-9 h-9 rounded-xl ${item.type === 'clasificacion' ? 'bg-accent-100' : 'bg-primary-100'} flex items-center justify-center shrink-0`}>
                      <div className={`w-3 h-3 rounded-full ${item.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-warm-700">{item.label}</p>
                      <p className="text-[11px] text-warm-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
        <SessionTypeModal isOpen={showTypeModal} onStart={handleStartSession} onClose={() => setShowTypeModal(false)} />
      </div>
    )
  }

  /* ─── ACTIVE TABS VIEW ────────────────────────────────── */
  return (
    <div className="flex flex-col h-full">
      <Header title={t('inventario.escaneo.title')} subtitle={t('nav.inventario')}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {inventoryHeaderSummary}
            {pendingCount > 0 && (
              <span className="px-3 py-2 rounded-xl text-xs font-semibold text-warning-600 bg-warning-50 flex items-center gap-1.5">
                {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <WifiOff size={13} />}
                {pendingCount}
              </span>
            )}
            {/* Panel toggle */}
            <button
              onClick={() => setShowPanel(v => !v)}
              className={`px-3 py-2 rounded-xl transition-all hidden lg:inline-flex items-center gap-2 text-sm font-semibold ${
                showPanel ? 'text-primary-600 bg-primary-50' : 'text-warm-500 bg-warm-100 hover:bg-warm-200'
              }`}
            >
              {showPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              <span>{t('inventario.escaneo.panel_btn')}</span>
            </button>
            {/* Cancel session */}
            {activeTab && (
              <button
                onClick={handleCancelSession}
                className="px-3 py-2 rounded-xl text-warning-600 bg-warning-50 hover:bg-warning-100 transition-all inline-flex items-center gap-2 text-sm font-semibold"
              >
                <Ban size={14} />
                <span className="hidden sm:inline">{t('common.cancel')}</span>
              </button>
            )}
            {/* Finalizar session */}
            {activeTab && (
              <button
                className="btn-danger inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={handleFinalize}
                disabled={activeTab.items.length === 0}>
                <Square className="w-4 h-4" /> {t('common.finalize')}
              </button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-0 border-b border-warm-100 bg-white overflow-x-auto">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          const dotColor = tab.scanType === 'clasificacion' ? 'bg-accent-400' : 'bg-primary-400'
          return (
            <div key={tab.id} className="relative shrink-0">
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 pl-3 pr-7 py-2 rounded-t-xl text-sm font-semibold transition-all border-2 border-b-0 ${
                  isActive
                    ? 'bg-white border-warm-200 text-warm-800 shadow-sm -mb-px z-10'
                    : 'bg-warm-50 border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-100'
                }`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                <span className="text-xs">{tab.name}</span>
                <span className="text-[10px] font-bold opacity-60">({tab.items.length})</span>
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleCloseTab(tab.id) }}
                className={`absolute top-1 right-0.5 z-20 rounded-full flex items-center justify-center transition-all shadow-sm ${
                  isActive
                    ? 'w-6 h-6 opacity-80 hover:opacity-100 bg-warm-200 text-warm-700 hover:bg-danger-100 hover:text-danger-600'
                    : 'w-5 h-5 opacity-50 hover:opacity-100 bg-warm-200 text-warm-500 hover:bg-danger-100 hover:text-danger-600'
                }`}>
                <X size={isActive ? 14 : 12} />
              </button>
            </div>
          )
        })}
        {tabs.length < 4 && (
          <button onClick={handleAddTab}
            className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-semibold border-2 border-transparent text-success-600 bg-success-50 hover:bg-success-100 transition-all shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('inventario.escaneo.new_tab')}</span>
          </button>
        )}
      </div>

      {/* Active tab content + optional side panel */}
      {activeTab && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 p-6">
            <div className="max-w-6xl 2xl:max-w-7xl mx-auto space-y-4">

              {/* Session info card */}
              <motion.div className="card p-3 shadow-sm overflow-hidden relative"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    activeTab.scanType === 'clasificacion' ? 'bg-accent-50' : 'bg-primary-50'
                  }`}>
                    <Package className={`w-4 h-4 ${activeTab.scanType === 'clasificacion' ? 'text-accent-600' : 'text-primary-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-warm-800 truncate leading-tight">{activeTab.name}</p>
                    <p className="text-[10px] text-warm-500 leading-tight">
                      {activeTab.scanType === 'clasificacion' ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-3xl font-black text-warm-800 tracking-tighter leading-none">
                      {activeTab.items.length}
                      <span className="text-xs font-medium text-warm-400 ml-1">{t('inventario.escaneo.scans_label')}</span>
                    </p>
                  </div>
                </div>
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-warm-100">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-success-50 border border-success-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success-500 shrink-0" />
                    <div>
                      <p className="text-lg font-extrabold text-success-600 leading-none">{summary.ok}</p>
                      <p className="text-[8px] text-success-600 uppercase tracking-wider font-bold">{t('inventario.escaneo.ok_abbr')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-warning-50 border border-warning-100">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning-500 shrink-0" />
                    <div>
                      <p className="text-lg font-extrabold text-warning-600 leading-none">{summary.blocked}</p>
                      <p className="text-[8px] text-warning-600 uppercase tracking-wider font-bold">{t('inventario.escaneo.blocked_abbr')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-danger-50 border border-danger-100">
                    <Ban className="w-3.5 h-3.5 text-danger-500 shrink-0" />
                    <div>
                      <p className="text-lg font-extrabold text-danger-600 leading-none">{summary.nowms}</p>
                      <p className="text-[8px] text-danger-600 uppercase tracking-wider font-bold">{t('inventario.escaneo.nowms_abbr')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-warm-100">
                    <Timer className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-warm-700 font-mono leading-none">{fmtElapsed(sessionElapsed)}</p>
                      <p className="text-[8px] text-warm-400 uppercase tracking-wider font-bold">{t('inventario.escaneo.time_label')}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end text-[11px] text-warm-500">
                  <span>{t('inventario.escaneo.total')}: <strong className="text-warm-700">{summary.total}</strong></span>
                </div>
              </motion.div>

              {/* Scan input */}
              <div>
                {!pendingCode1 ? (
                  <div className="relative">
                    <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
                    <input
                      ref={scanRef}
                      type="text"
                      className="w-full pl-14 pr-5 py-5 text-xl bg-white border-2 border-warm-200 rounded-2xl
                        focus:border-primary-500 focus:shadow-glow
                        transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                      placeholder={t('inventario.escaneo.scan_placeholder')}
                      onKeyDown={e => { if (e.key === 'Enter') { processScan(e.target.value.trim()); e.target.value = '' } }}
                      autoComplete="off"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="p-3 rounded-xl bg-warning-50 border border-warning-200 flex items-center gap-2 text-sm text-warning-700">
                      <AlertCircle size={14} className="shrink-0" />
                      <span className="font-medium flex-1 truncate">
                        {t('inventario.escaneo.code2_waiting')}: <code className="font-mono">{pendingCode1.code}</code>
                      </span>
                      <button className="shrink-0 p-1 hover:bg-warning-200 rounded-lg transition-colors"
                        onClick={() => { clearPendingCode1(); scanRef.current?.focus() }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="relative">
                      <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warning-400" />
                      <input
                        ref={code2Ref}
                        type="text"
                        className="w-full pl-14 pr-5 py-5 text-xl bg-white border-2 border-warning-300 rounded-2xl
                          focus:border-warning-500 focus:shadow-md
                          transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                        placeholder={t('inventario.escaneo.code2_placeholder')}
                        onKeyDown={e => { if (e.key === 'Enter') { processCode2(e.target.value.trim()); e.target.value = '' } }}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Last scan feedback */}
              <AnimatePresence mode="wait">
                {lastScan && (
                  <motion.div
                    key={lastScan.code + lastScan.status}
                    initial={{ opacity: 0, y: -10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={`p-4 rounded-2xl flex items-center gap-3 border backdrop-blur-sm shadow-sm ${
                      lastScan.status === 'ok'        ? 'bg-success-50/90 border-success-200' :
                      lastScan.status === 'blocked'   ? 'bg-warning-50/90 border-warning-200' :
                      lastScan.status === 'duplicate' ? 'bg-warning-50/90 border-warning-200' :
                      'bg-danger-50/90 border-danger-200'
                    }`}>
                    {lastScan.status === 'ok'       ? <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" /> :
                     lastScan.status === 'blocked'  ? <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0" /> :
                     lastScan.status === 'duplicate'? <AlertCircle className="w-5 h-5 text-warning-500 shrink-0" /> :
                     <Ban className="w-5 h-5 text-danger-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium opacity-70">{t('inventario.escaneo.last_scan')}</p>
                      <p className="font-mono font-bold text-warm-800 truncate">{lastScan.code}</p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${
                      lastScan.status === 'ok'       ? 'text-success-600' :
                      lastScan.status === 'duplicate'? 'text-warning-600' :
                      lastScan.status === 'blocked'  ? 'text-warning-600' :
                      'text-danger-600'
                    }`}>
                      {t(STATUS_META[lastScan.status]?.labelKey ?? 'inventario.escaneo.group_nowms')}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Items panel */}
              {activeTab.scanType === 'clasificacion' ? (
                <ClasificacionPanel
                  items={activeTab.items}
                  onRemove={idx => removeItem(activeTabId, idx)}
                  onMove={idx => setMoveTarget(idx)}
                  onOpenDetail={setGroupDetail}
                  ubicaciones={ubicacionesData?.data ?? []}
                  groupUbicacion={groupUbicacion}
                  onGroupUbicacionChange={(g, ub) => setGroupUbicacion(prev => ({ ...prev, [g]: ub }))}
                  onCreateRequest={handleClasificacionCreateRequest}
                  onSend={handleClasificacionSend}
                />
              ) : (
                <UnificadoPanel
                  items={activeTab.items}
                  onRemove={idx => removeItem(activeTabId, idx)}
                  onMove={idx => setMoveTarget(idx)}
                />
              )}
            </div>
          </div>

          {/* Right side panel */}
          {showPanel && (
            <SidePanel items={activeTab.items} />
          )}
        </div>
      )}

      {/* Modals */}
      <SessionTypeModal isOpen={showTypeModal} onStart={handleStartSession} onClose={() => setShowTypeModal(false)} />
      <UbicacionInputModal
        isOpen={showUbicacionModal}
        onClose={() => setShowUbicacionModal(false)}
        onSkip={handleUbicacionSkip}
        ubicaciones={ubicacionesData?.data ?? []}
        onUbicacionConfirmed={handleUbicacionConfirmed}
        onCreateRequest={handleCreateRequest}
      />
      <UbicacionCreateConfirmModal
        isOpen={showCreateConfirm}
        onClose={() => {
          setShowCreateConfirm(false)
          if (pendingInlineGroup) { setPendingInlineGroup(null) } else { setShowUbicacionModal(true) }
        }}
        onConfirm={() => createUbicacionMut.mutate({ codigo: ubicacionToCreate })}
        code={ubicacionToCreate}
        isCreating={createUbicacionMut.isPending}
      />
      <SessionSummaryModal isOpen={showSummaryModal} tab={activeTab}
        onSave={() => saveSessionMut.mutate()}
        onContinue={() => setShowSummaryModal(false)}
        isSaving={saveSessionMut.isPending}
        ubicacionValidated={ubicacionValidated}
        onChangeUbicacion={() => { setShowSummaryModal(false); setShowUbicacionModal(true) }}
      />
      <DuplicateModal isOpen={!!duplicatePending} code={duplicatePending?.code} conflicts={duplicatePending?.conflicts || []}
        onConfirm={() => {
          duplicatePending?.onConfirm?.()
          setDuplicatePending(null)
          setTimeout(() => scanRef.current?.focus(), 80)
        }}
        onDiscard={() => {
          setDuplicatePending(null)
          setTimeout(() => scanRef.current?.focus(), 80)
        }} />
      <MoveItemModal isOpen={moveTarget !== null} onClose={() => setMoveTarget(null)}
        onMove={newGroup => {
          if (moveTarget !== null && activeTabId) moveItemGroup(activeTabId, moveTarget, newGroup)
          setMoveTarget(null)
        }} />
      <CloseTabModal
        isOpen={!!closeTabPending}
        count={closeTabPending?.count ?? 0}
        onConfirm={confirmCloseTab}
        onClose={() => setCloseTabPending(null)}
      />
      <GroupDetailModal
        isOpen={!!groupDetail && !!activeTab}
        group={groupDetail}
        items={activeTab?.items.map((item, index) => ({ ...item, _idx: index })) ?? []}
        onClose={() => setGroupDetail(null)}
        onToggleMarked={idx => activeTabId && toggleItemMarked(activeTabId, idx)}
        onMarkVisible={indices => activeTabId && groupDetail && setItemsMarkedByGroup(activeTabId, groupDetail, true, indices)}
        onClearVisible={indices => activeTabId && groupDetail && setItemsMarkedByGroup(activeTabId, groupDetail, false, indices)}
      />
    </div>
  )
}
