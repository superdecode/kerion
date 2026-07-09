import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { STALE } from '../../../core/constants/queryConfig'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, Package, CheckCircle2, AlertTriangle, Ban,
  Loader2, Wifi, WifiOff, Trash2, ArrowRight, MoveRight,
  Square, AlertCircle, ScanBarcode, Clock, Timer,
  RefreshCw, PanelRightClose, PanelRightOpen, Search, Maximize2,
  MapPin, Edit3, ChevronDown, ChevronUp, Calendar, Hash, Layers, List,
  Copy, Check,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { ErrorAlertModal } from '../../../core/components/common/ErrorAlertModal'
import DataSyncStatus from '../../../core/components/common/DataSyncStatus'
import StatusPill from '../../../core/components/common/StatusPill'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useInventarioStore } from '../stores/inventarioStore'
import { useAutoSync } from '../hooks/useAutoSync'
import ModuleLimitBanner from '../../../core/components/common/ModuleLimitBanner'
import { useModuleUsage } from '../../../core/hooks/useModuleUsage'
import { useBoxStock } from '../hooks/useBoxStock'
import { findCodeInInventory } from '../../Shared/Wms/findCodeInInventory'
import { generateCodeVariations } from '../../Shared/Wms/normalizeCode'
import { classifyItem, resolveSwap } from '../utils/classify'
import { playSound, initAudio } from '../../Shared/Wms/playSound'
import { checkInventoryDuplicates, saveInventorySession } from '../services/inventarioService'
import { getUbicaciones, createUbicacion } from '../../WmsHub/services/wmsHubService'
import { refreshSheet, getCacheTimestamp, getCacheStatus, getSheetUrls } from '../../WmsHub/services/googleSheetsService'
import { fmtDateTime, toDateKey } from '../../../core/utils/dateFormat'
import QuickCodeSearchModal from '../components/QuickCodeSearchModal'
import { getTimeBounds } from '../utils/timeBounds'
import { useOfflineStore } from '../../../core/stores/offlineStore'

const STATUS_META = {
  ok: {
    labelKey: 'inventario.escaneo.group_disponible',
    bg: 'bg-success-100 text-success-700',
    icon: CheckCircle2,
    flash: 'bg-success-50 border-success-300',
    card: 'border-success-300 bg-gradient-to-br from-success-100 to-success-50/60 text-success-700 shadow-[0_16px_32px_-24px_rgba(34,197,94,0.55)]',
    pill: 'border-success-300 bg-gradient-to-r from-success-100 to-success-50 text-success-700 shadow-[0_10px_22px_-18px_rgba(34,197,94,0.5)]',
    soft: 'bg-gradient-to-br from-success-50 via-white to-success-100/75 border-success-200/80 text-success-700',
    tint: 'from-success-200 to-success-100/70',
    cardBorder: 'border-success-300',
    headerFg: 'text-success-800',
    itemBadge: 'bg-success-200 text-success-800',
    rowHover: 'hover:bg-success-50',
    divider: 'divide-success-100',
    footerBg: 'bg-success-50 border-success-200',
  },
  blocked: {
    labelKey: 'inventario.escaneo.group_bloqueado',
    bg: 'bg-warning-100 text-warning-700',
    icon: AlertTriangle,
    flash: 'bg-warning-50 border-warning-300',
    card: 'border-warning-300 bg-gradient-to-br from-warning-100 to-warning-50/60 text-warning-700 shadow-[0_16px_32px_-24px_rgba(245,158,11,0.5)]',
    pill: 'border-warning-300 bg-gradient-to-r from-warning-100 to-warning-50 text-warning-700 shadow-[0_10px_22px_-18px_rgba(245,158,11,0.5)]',
    soft: 'bg-gradient-to-br from-warning-50 via-white to-warning-100/75 border-warning-200/80 text-warning-700',
    tint: 'from-warning-200 to-warning-100/70',
    cardBorder: 'border-warning-300',
    headerFg: 'text-warning-800',
    itemBadge: 'bg-warning-200 text-warning-800',
    rowHover: 'hover:bg-warning-50',
    divider: 'divide-warning-100',
    footerBg: 'bg-warning-50 border-warning-200',
  },
  nowms: {
    labelKey: 'inventario.escaneo.group_nowms',
    bg: 'bg-danger-100 text-danger-700',
    icon: Ban,
    flash: 'bg-danger-50 border-danger-300',
    card: 'border-danger-300 bg-gradient-to-br from-danger-100 to-danger-50/60 text-danger-700 shadow-[0_16px_32px_-24px_rgba(239,68,68,0.5)]',
    pill: 'border-danger-300 bg-gradient-to-r from-danger-100 to-danger-50 text-danger-700 shadow-[0_10px_22px_-18px_rgba(239,68,68,0.5)]',
    soft: 'bg-gradient-to-br from-danger-50 via-white to-danger-100/75 border-danger-200/80 text-danger-700',
    tint: 'from-danger-200 to-danger-100/70',
    cardBorder: 'border-danger-300',
    headerFg: 'text-danger-800',
    itemBadge: 'bg-danger-200 text-danger-800',
    rowHover: 'hover:bg-danger-50',
    divider: 'divide-danger-100',
    footerBg: 'bg-danger-50 border-danger-200',
  },
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

function useSessionTimer(startAt, endAt = null) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startAt) { setElapsed(0); return }
    const start = new Date(startAt).getTime()
    const tick = () => {
      const end = endAt ? new Date(endAt).getTime() : Date.now()
      setElapsed(Math.max(0, Math.floor((end - start) / 1000)))
    }
    tick()
    if (endAt) return undefined
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startAt, endAt])
  return elapsed
}

const fmtElapsed = (secs) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

const formatPreviewSectionCode = (tab, tabIndex = 0) => {
  const { start } = getTimeBounds(tab?.items ?? [], { fallbackStart: tab?.createdAt || Date.now() })
  const date = new Date(start || tab?.createdAt || Date.now())
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const dayKey = toDateKey(safeDate).replace(/-/g, '')
  return `SEC-${dayKey}M${String(tabIndex + 1).padStart(2, '0')}`
}

const formatPreviewTarimaCode = (sectionCode, index = 0) => {
  const dayKey = String(sectionCode).replace(/^SEC-/, '').split('M')[0] || '00000000'
  return `PAL-${dayKey}-${String(index + 1).padStart(2, '0')}`
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

const SESSION_TYPES = (t) => [
  {
    value: 'unificado',
    icon: List,
    ring: 'border-primary-400',
    gradient: 'from-primary-50/80 to-white',
    iconBg: 'bg-primary-100',
    iconFg: 'text-primary-600',
    dotBg: 'bg-primary-500',
    dotBorder: 'border-primary-400',
    get label() { return t('inventario.escaneo.type_unificado') },
    get desc() { return t('inventario.escaneo.type_unificado_desc') },
  },
  {
    value: 'clasificacion',
    icon: Layers,
    ring: 'border-accent-400',
    gradient: 'from-accent-50/80 to-white',
    iconBg: 'bg-accent-100',
    iconFg: 'text-accent-600',
    dotBg: 'bg-accent-500',
    dotBorder: 'border-accent-400',
    get label() { return t('inventario.escaneo.type_clasificacion') },
    get desc() { return t('inventario.escaneo.type_clasificacion_desc') },
  },
]

function SessionTypeModal({ isOpen, onStart, onClose }) {
  const { t } = useI18nStore()
  const [selected, setSelected] = useState('unificado')
  const types = SESSION_TYPES(t)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.session_type_title')} icon={ScanBarcode}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => onStart(selected)}>
            <ArrowRight size={14} /> {t('inventario.escaneo.start_session')}
          </button>
        </div>
      }
    >
      <div className="space-y-2.5 py-1">
        {types.map(opt => {
          const Icon = opt.icon
          const active = selected === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={`group w-full text-left flex items-center gap-4 px-4 py-4 rounded-2xl border-2 transition-all duration-200
                ${active
                  ? `${opt.ring} bg-gradient-to-br ${opt.gradient} shadow-[0_6px_24px_-6px_rgba(0,0,0,0.13)]`
                  : 'border-warm-200 bg-white hover:border-warm-300 hover:shadow-sm'
                }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200
                shadow-sm ${active ? opt.iconBg : 'bg-warm-100 group-hover:bg-warm-200/60'}`}>
                <Icon className={`w-5 h-5 transition-colors duration-200 ${active ? opt.iconFg : 'text-warm-400'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm leading-tight transition-colors duration-200
                  ${active ? 'text-warm-900' : 'text-warm-600'}`}>
                  {opt.label}
                </p>
                <p className={`text-xs mt-1 leading-relaxed transition-colors duration-200
                  ${active ? 'text-warm-500' : 'text-warm-400'}`}>
                  {opt.desc}
                </p>
              </div>

              <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all duration-200
                ${active ? `${opt.dotBorder} ${opt.dotBg}` : 'border-warm-300 bg-white'}`}>
                {active && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          )
        })}

        <p className="text-[11px] text-warm-400 text-center pt-1 leading-relaxed">
          {t('inventario.escaneo.session_type_locked')}
        </p>
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
              className={`w-full flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-all hover:-translate-y-[1px] ${meta.card}`}>
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

function SessionSummaryModal({ isOpen, tab, onSave, onContinue, isSaving, ubicacionValidated, onChangeUbicacion, originLocation }) {
  const { t } = useI18nStore()
  const [blindCount, setBlindCount] = useState('')
  useEffect(() => { if (isOpen) setBlindCount('') }, [isOpen])

  if (!tab) return null
  const counts = tab.items.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a }, {})
  const bounds = getTimeBounds(tab.items, { fallbackStart: tab.createdAt })
  const started = bounds.start ? new Date(bounds.start) : null
  const ended = bounds.end ? new Date(bounds.end) : null
  const durSec = started && ended ? Math.floor((ended - started) / 1000) : 0
  const dur = durSec < 60 ? `${durSec}s` : `${Math.floor(durSec / 60)}m ${durSec % 60}s`
  const actualCount = tab.items.length
  const blindNum = parseInt(blindCount, 10)
  const countConfirmed = !isNaN(blindNum) && blindNum === actualCount
  return (
    <Modal isOpen={isOpen} onClose={onContinue} title={t('inventario.escaneo.session_summary')} icon={Package}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onContinue}>{t('inventario.escaneo.keep_scanning')}</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={onSave} disabled={isSaving || !countConfirmed}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('inventario.escaneo.save_registro')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-br from-white via-warm-50/70 to-warm-100/60 p-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.5)]">
            <p className="text-xs text-warm-500 uppercase tracking-wide">{t('inventario.escaneo.tipo_sesion')}</p>
            <p className="font-semibold text-warm-900 mt-0.5 capitalize">{tab.scanType}</p>
          </div>
          <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-br from-white via-warm-50/70 to-warm-100/60 p-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.5)]">
            <p className="text-xs text-warm-500 uppercase tracking-wide">Fecha inicio</p>
            <p className="mt-1 font-mono text-xs font-medium text-warm-600">{bounds.start ? fmtDateTime(bounds.start) : '—'}</p>
          </div>
          <div className="rounded-2xl border border-warm-100/80 bg-gradient-to-br from-white via-warm-50/70 to-warm-100/60 p-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.5)]">
            <p className="text-xs text-warm-500 uppercase tracking-wide">Fecha final</p>
            <p className="mt-1 font-mono text-xs font-medium text-warm-600">{bounds.end ? fmtDateTime(bounds.end) : '—'}</p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-primary-100/80 bg-gradient-to-r from-primary-50 via-white to-accent-50/55 px-4 py-2.5 text-xs text-primary-700 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.45)]">
          <span className="font-semibold uppercase tracking-wide">{t('inventario.escaneo.duration')}</span>
          <span className="font-bold">{dur}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GROUPS.map(g => {
            const meta = STATUS_META[g]
            return (
              <div key={g} className={`rounded-2xl border p-3 text-center ${meta.card}`}>
                <p className={`text-2xl font-black leading-none ${countConfirmed ? '' : 'blur-sm select-none'}`}>{counts[g] || 0}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]">{t(meta.labelKey)}</p>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-primary-100/80 bg-gradient-to-r from-primary-50 via-white to-accent-50/55 px-4 py-2.5 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.42)]">
          <span className="text-warm-700">{t('inventario.escaneo.total')}</span>
          <span className={`font-bold text-lg ${countConfirmed ? 'text-primary-700' : 'blur-sm select-none text-primary-300'}`}>{actualCount}</span>
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
              <Edit3 size={10} />
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
        {originLocation && (
          <div className="flex items-center gap-2 bg-warm-50 rounded-xl px-3 py-2 border border-warm-200">
            <MapPin size={11} className="text-warm-400 shrink-0" />
            <span className="text-[10px] text-warm-500 uppercase tracking-wide shrink-0">Origen:</span>
            <span className="font-mono text-xs text-warm-700 truncate">{originLocation}</span>
          </div>
        )}
        <div className="rounded-2xl border border-warning-200 bg-warning-50/70 p-3 space-y-2">
          <p className="text-xs font-semibold text-warning-700">Confirmar conteo de cajas</p>
          <p className="text-[11px] text-warning-600">Ingresa el número de cajas para confirmar el envío:</p>
          <input
            type="number"
            min="0"
            value={blindCount}
            onChange={e => setBlindCount(e.target.value)}
            placeholder="Número de cajas"
            className={`w-full px-3 py-2 rounded-xl border text-sm font-mono outline-none transition-colors ${
              countConfirmed
                ? 'border-success-400 bg-success-50 text-success-700 focus:border-success-500'
                : blindCount
                ? 'border-danger-300 bg-danger-50 text-danger-700 focus:border-danger-400'
                : 'border-warning-300 bg-white text-warm-700 focus:border-warning-400'
            }`}
            autoComplete="off"
          />
          {countConfirmed && (
            <p className="text-[11px] text-success-600 font-semibold flex items-center gap-1">
              <CheckCircle2 size={11} /> Conteo confirmado
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ClasificacionSummaryModal({ isOpen, group, tab, tabIndex, onSave, onClose, isSaving, ubicacionValidated, onChangeUbicacion, originLocation }) {
  const { t } = useI18nStore()
  const [blindCount, setBlindCount] = useState('')
  useEffect(() => { if (isOpen) setBlindCount('') }, [isOpen])

  if (!tab || !group) return null
  const meta = STATUS_META[group] ?? STATUS_META.nowms
  const groupItems = tab.items.filter(item => getItemGroup(item) === group)
  const bounds = getTimeBounds(groupItems.length > 0 ? groupItems : tab.items, { fallbackStart: tab.createdAt })
  const durSec = bounds.start && bounds.end ? Math.floor((new Date(bounds.end) - new Date(bounds.start)) / 1000) : 0
  const dur = durSec < 60
    ? `${durSec}s`
    : durSec < 3600
    ? `${Math.floor(durSec / 60)}m ${durSec % 60}s`
    : `${Math.floor(durSec / 3600)}h ${Math.floor((durSec % 3600) / 60)}m`
  const sectionCode = formatPreviewSectionCode(tab, tabIndex)
  const tarimaCode = formatPreviewTarimaCode(sectionCode, GROUPS.indexOf(group))
  const actualCount = groupItems.length
  const blindNum = parseInt(blindCount, 10)
  const countConfirmed = !isNaN(blindNum) && blindNum === actualCount

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enviar Tarima" icon={Square}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={onSave} disabled={isSaving || !countConfirmed}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
            Enviar Tarima
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {/* General data: Sección, Tarima, Fechas */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-warm-100 bg-warm-50/80 p-3 flex items-start gap-2.5">
            <Hash size={13} className="text-warm-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] text-warm-400 uppercase tracking-wide">Sección</p>
              <p className="font-mono font-bold text-xs text-warm-800 mt-0.5 truncate">{sectionCode}</p>
            </div>
          </div>
          <div className="rounded-xl border border-warm-100 bg-warm-50/80 p-3 flex items-start gap-2.5">
            <Layers size={13} className="text-warm-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] text-warm-400 uppercase tracking-wide">Tarima</p>
              <p className="font-mono font-bold text-xs text-warm-800 mt-0.5 truncate">{tarimaCode}</p>
            </div>
          </div>
          <div className="rounded-xl border border-warm-100 bg-warm-50/80 p-3 flex items-start gap-2.5">
            <Calendar size={13} className="text-warm-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] text-warm-400 uppercase tracking-wide">Fecha inicio</p>
              <p className="font-mono text-[11px] text-warm-700 mt-0.5">{bounds.start ? fmtDateTime(bounds.start) : '—'}</p>
            </div>
          </div>
          <div className="rounded-xl border border-warm-100 bg-warm-50/80 p-3 flex items-start gap-2.5">
            <Calendar size={13} className="text-warm-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] text-warm-400 uppercase tracking-wide">Fecha final</p>
              <p className="font-mono text-[11px] text-warm-700 mt-0.5">{bounds.end ? fmtDateTime(bounds.end) : '—'}</p>
            </div>
          </div>
        </div>

        {/* Tipo + Duración */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${meta.soft}`}>
            <meta.icon size={14} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide opacity-60">Tipo</p>
              <p className="font-bold text-xs mt-0.5 leading-tight">{t(meta.labelKey)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-2xl font-black tabular-nums leading-none ${countConfirmed ? '' : 'blur-sm select-none'}`}>{actualCount}</p>
              <p className="text-[9px] uppercase tracking-wide opacity-50">cajas</p>
            </div>
          </div>
          <div className="rounded-xl border border-primary-100 bg-gradient-to-r from-primary-50 to-white p-3 flex items-center gap-2.5">
            <Clock size={13} className="text-primary-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-primary-400 uppercase tracking-wide">{t('inventario.escaneo.duration')}</p>
              <p className="font-bold text-sm text-primary-700 mt-0.5">{dur}</p>
            </div>
          </div>
        </div>

        {/* Ubicaciones: destino + origen */}
        {ubicacionValidated ? (
          <div className="rounded-xl border border-accent-100 bg-accent-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin size={12} className="text-accent-600 shrink-0" />
              <span className="text-[10px] text-accent-500 uppercase tracking-wide shrink-0">Destino:</span>
              <span className="font-mono font-semibold text-accent-700 text-xs truncate">{ubicacionValidated.codigo}</span>
              {ubicacionValidated.nombre && ubicacionValidated.nombre !== ubicacionValidated.codigo && (
                <span className="text-accent-400 text-xs truncate">{ubicacionValidated.nombre}</span>
              )}
              <button className="ml-auto p-1 rounded-lg hover:bg-accent-200 text-accent-400 hover:text-accent-700 transition-colors"
                onClick={onChangeUbicacion} title={t('inventario.escaneo.ubicacion_edit')}>
                <Edit3 size={10} />
              </button>
            </div>
            {originLocation && (
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-warm-400 shrink-0" />
                <span className="text-[10px] text-warm-500 uppercase tracking-wide shrink-0">Origen:</span>
                <span className="font-mono text-xs text-warm-700 truncate">{originLocation}</span>
              </div>
            )}
          </div>
        ) : (
          <button
            className="w-full text-left px-3 py-2.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-accent-300 hover:text-accent-600 transition-colors flex items-center gap-2"
            onClick={onChangeUbicacion}>
            <MapPin size={11} />
            {t('inventario.escaneo.ubicacion_scan_title')}
          </button>
        )}

        <div className="rounded-2xl border border-warning-200 bg-warning-50/70 p-3 space-y-2">
          <p className="text-xs font-semibold text-warning-700">Confirmar conteo de cajas</p>
          <p className="text-[11px] text-warning-600">Ingresa el número de cajas en esta tarima ({t(meta.labelKey)}):</p>
          <input
            type="number"
            min="0"
            value={blindCount}
            onChange={e => setBlindCount(e.target.value)}
            placeholder="Número de cajas"
            className={`w-full px-3 py-2 rounded-xl border text-sm font-mono outline-none transition-colors ${
              countConfirmed
                ? 'border-success-400 bg-success-50 text-success-700 focus:border-success-500'
                : blindCount
                ? 'border-danger-300 bg-danger-50 text-danger-700 focus:border-danger-400'
                : 'border-warning-300 bg-white text-warm-700 focus:border-warning-400'
            }`}
            autoComplete="off"
          />
          {countConfirmed && (
            <p className="text-[11px] text-success-600 font-semibold flex items-center gap-1">
              <CheckCircle2 size={11} /> Conteo confirmado
            </p>
          )}
        </div>
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
  const inputShellRef = useRef(null)
  const [dropdownStyle, setDropdownStyle] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setInputValue('')
      setNotFound(false)
      setNotFoundCode('')
      setTimeout(() => locationRef.current?.focus(), 80)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !inputValue.trim() || notFound || !inputShellRef.current) {
      setDropdownStyle(null)
      return
    }
    const rect = inputShellRef.current.getBoundingClientRect()
    const dropH = 176
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < dropH && rect.top > dropH
    setDropdownStyle(openUp
      ? { position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left, width: rect.width, zIndex: 99999 }
      : { position: 'fixed', top: rect.bottom + 8, left: rect.left, width: rect.width, zIndex: 99999 }
    )
  }, [isOpen, inputValue, notFound, ubicaciones])

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
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.ubicacion_scan_title')} icon={MapPin} size="sm"
      footer={
        <div className="flex gap-3 justify-between w-full flex-wrap">
          <button className="btn-ghost text-sm shrink-0" onClick={onSkip}>{t('inventario.escaneo.ubicacion_skip')}</button>
          <button className="btn-primary text-sm inline-flex items-center gap-2 shrink-0" onClick={handleConfirm} disabled={!inputValue.trim()}>
            <CheckCircle2 size={14} /> {t('inventario.escaneo.ubicacion_continue')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-warm-500">{t('inventario.escaneo.ubicacion_scan_label')}</p>
        <div className="flex gap-2">
          <div ref={inputShellRef} className="relative flex-1">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-300" />
            <input
              ref={locationRef}
              type="text"
              className="w-full pl-10 pr-4 py-3.5 text-base bg-white border-2 border-accent-200 rounded-2xl
                focus:border-accent-500 focus:shadow-md
                transition-all outline-none placeholder:text-warm-300 font-mono"
              placeholder="UB-XXX"
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setNotFound(false) }}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
              autoComplete="off"
            />
            {suggestions.length > 0 && dropdownStyle && createPortal(
              <div style={dropdownStyle} className="max-h-44 overflow-y-auto rounded-2xl border border-accent-200 bg-white p-1.5 shadow-depth">
                {suggestions.map(u => (
                  <button
                    key={u.id}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-accent-100 transition-colors text-xs flex items-center gap-2"
                    onClick={() => onUbicacionConfirmed({ id: u.id, codigo: u.codigo, nombre: u.nombre })}
                  >
                    <MapPin size={10} className="text-accent-500 shrink-0" />
                    <span className="font-mono font-semibold text-accent-700">{u.codigo}</span>
                    {u.nombre && u.nombre !== u.codigo && (
                      <span className="text-warm-500 truncate">{u.nombre}</span>
                    )}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
          <button className="btn-primary px-4 py-3.5 rounded-2xl" onClick={handleConfirm} disabled={!inputValue.trim()}>
            <CheckCircle2 size={16} />
          </button>
        </div>

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
  originLocation,
  onSend,
  groupUbicacion,
  onChangeUbicacion,
}) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')
  const [detailFilter, setDetailFilter] = useState('all')
  const [copiedField, setCopiedField] = useState(null)
  const [sortConfig, setSortConfig] = useState({ field: 'ts', dir: 'desc' })

  const copyToClipboard = (text, key) => {
    if (!text || text === '—') return
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(key)
      setTimeout(() => setCopiedField(null), 1500)
    })
  }

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setDetailFilter('all')
      setCopiedField(null)
      setSortConfig({ field: 'ts', dir: 'desc' })
    }
  }, [isOpen])

  const meta = group ? (STATUS_META[group] ?? STATUS_META.nowms) : null
  const normalizedSearch = search.trim().toLowerCase()
  const baseItems = useMemo(
    () => group ? items.filter(item => getItemGroup(item) === group) : [],
    [items, group]
  )
  const filtered = useMemo(() => baseItems.filter(item => {
    if (detailFilter === 'marked' && !item.marked) return false
    if (detailFilter === 'unmarked' && item.marked) return false
    if (!normalizedSearch) return true
    return [
      item.code,
      item.code2,
      item.sku,
      item.product,
      item.location,
    ].some(value => (value || '').toLowerCase().includes(normalizedSearch))
  }), [baseItems, detailFilter, normalizedSearch])
  const markedCount = useMemo(() => baseItems.filter(item => item.marked).length, [baseItems])
  const unmarkedCount = Math.max(0, baseItems.length - markedCount)
  const visibleMarkedCount = useMemo(() => filtered.filter(item => item.marked).length, [filtered])
  const visibleIndices = useMemo(() => filtered.map(item => item._idx), [filtered])
  const sortedItems = useMemo(() => {
    const list = [...filtered]
    const { field, dir } = sortConfig
    const factor = dir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      let av
      let bv
      switch (field) {
        case 'code':
          av = a.code || ''
          bv = b.code || ''
          break
        case 'code2':
          av = a.code2 || ''
          bv = b.code2 || ''
          break
        case 'location':
          av = a.location || ''
          bv = b.location || ''
          break
        default:
          av = Number(a.ts || 0)
          bv = Number(b.ts || 0)
          break
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        if (av === bv) return 0
        return av > bv ? factor : -factor
      }
      const cmp = String(av).localeCompare(String(bv), 'es', { sensitivity: 'base' })
      return cmp === 0 ? 0 : cmp * factor
    })
    return list
  }, [filtered, sortConfig])

  if (!group) return null

  function toggleSort(field) {
    setSortConfig((current) => (
      current.field === field
        ? { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: field === 'ts' ? 'desc' : 'asc' }
    ))
  }

  function HeaderSortButton({ field, label }) {
    const active = sortConfig.field === field
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-primary-700' : 'text-warm-500 hover:text-warm-700'}`}
      >
        <span>{label}</span>
        {active ? (
          sortConfig.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
        ) : (
          <ChevronDown size={11} className="opacity-40" />
        )}
      </button>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t(meta.labelKey)} · ${baseItems.length}`}
      icon={meta.icon}
      size="full"
      headerAction={
        <div className="hidden md:flex items-center gap-2 text-[11px] font-medium text-warm-500">
          {originLocation && (
            <span className="flex items-center gap-1 font-mono text-accent-600">
              <MapPin size={10} /> {originLocation}
            </span>
          )}
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
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <button
              type="button"
              onClick={() => onMarkVisible(visibleIndices)}
              disabled={visibleIndices.length === 0}
              className="px-3 py-3 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 text-sm font-semibold hover:bg-primary-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('inventario.escaneo.mark_visible')}
            </button>
            <button
              type="button"
              onClick={() => onClearVisible(visibleIndices)}
              disabled={visibleIndices.length === 0}
              className="px-3 py-3 rounded-xl border border-warm-200 bg-white text-warm-600 text-sm font-semibold hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('inventario.escaneo.clear_visible_marks')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setDetailFilter('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${detailFilter === 'all' ? `${meta.bg} ring-2 ring-primary-200` : 'border-warm-200 bg-white text-warm-600 hover:bg-warm-50'}`}
          >
            {t('inventario.escaneo.total')} <span className="font-bold">{baseItems.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setDetailFilter('marked')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${detailFilter === 'marked' ? 'border-primary-300 bg-primary-50 text-primary-700 ring-2 ring-primary-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            {t('inventario.escaneo.marked_count')} <span className="font-bold">{markedCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setDetailFilter('unmarked')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${detailFilter === 'unmarked' ? 'border-warning-300 bg-warning-50 text-warning-700 ring-2 ring-warning-200' : 'border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100'}`}
          >
            {t('inventario.escaneo.unmarked_count')} <span className="font-bold">{unmarkedCount}</span>
          </button>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-warm-200 bg-warm-50 text-warm-500 text-xs font-semibold">
            {t('inventario.escaneo.filtered_count')} <span className="font-bold text-warm-700">{filtered.length}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary-100 bg-primary-50 text-primary-600 text-xs font-semibold">
            {t('inventario.escaneo.marked_visible')} <span className="font-bold">{visibleMarkedCount}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-warm-200 overflow-hidden">
          <div className="grid grid-cols-[auto_minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-4 py-3 bg-warm-50/80 text-[11px] font-semibold uppercase tracking-[0.12em] text-warm-500">
            <span>#</span>
            <HeaderSortButton field="ts" label={t('inventario.escaneo.scan_datetime')} />
            <HeaderSortButton field="code" label={t('inventario.escaneo.code_1')} />
            <HeaderSortButton field="code2" label={t('inventario.escaneo.code_2')} />
            <HeaderSortButton field="location" label={t('inventario.escaneo.location')} />
            <span>{t('common.actions')}</span>
          </div>
          <div className="max-h-[58vh] overflow-y-auto divide-y divide-warm-100">
            {sortedItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-warm-400">{t('common.noData')}</div>
            ) : (
              sortedItems.map((item, index) => (
                <div key={item._idx} className={`grid grid-cols-[auto_minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-4 py-3 items-center text-sm ${item.marked ? 'bg-primary-100/60 border-l-2 border-primary-400' : 'bg-white'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${item.marked ? 'bg-primary-200 text-primary-700' : 'bg-warm-100 text-warm-500'}`}>
                    {index + 1}
                  </div>
                  <div className="text-[11px] text-warm-500 whitespace-nowrap">
                    {item.ts ? fmtDateTime(item.ts) : '—'}
                  </div>
                  <div className="group relative flex items-center gap-1 min-w-0">
                    <span className="font-mono text-xs font-normal text-warm-700 truncate">{item.code}</span>
                    {item.code && (
                      <button type="button" onClick={() => copyToClipboard(item.code, `code1-${item._idx}`)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-warm-400 hover:text-primary-600">
                        {copiedField === `code1-${item._idx}` ? <Check size={10} className="text-success-600" /> : <Copy size={10} />}
                      </button>
                    )}
                  </div>
                  <div className="group relative flex items-center gap-1 min-w-0">
                    <span className="font-mono text-xs text-warm-500 truncate">{item.code2 || '—'}</span>
                    {item.code2 && (
                      <button type="button" onClick={() => copyToClipboard(item.code2, `code2-${item._idx}`)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-warm-400 hover:text-primary-600">
                        {copiedField === `code2-${item._idx}` ? <Check size={10} className="text-success-600" /> : <Copy size={10} />}
                      </button>
                    )}
                  </div>
                  <div className="group relative flex items-center gap-1 min-w-0">
                    <span className="text-xs text-warm-600 truncate">{item.location || '—'}</span>
                    {item.location && (
                      <button type="button" onClick={() => copyToClipboard(item.location, `loc-${item._idx}`)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-warm-400 hover:text-accent-600">
                        {copiedField === `loc-${item._idx}` ? <Check size={10} className="text-success-600" /> : <Copy size={10} />}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleMarked(item._idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      item.marked
                        ? 'bg-primary-200 text-primary-800'
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

        {/* Send/confirm footer — same logic as outer panel */}
        {onSend && (
          <div className={`flex items-center gap-3 rounded-2xl border p-3 ${meta.soft ?? 'border-warm-200 bg-warm-50'}`}>
            {groupUbicacion?.[group] ? (
              <>
                <div className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-accent-50 border border-accent-100">
                  <MapPin size={11} className="text-accent-500 shrink-0" />
                  <span className="font-mono text-xs font-semibold text-accent-700 truncate">{groupUbicacion[group].codigo}</span>
                  {onChangeUbicacion && (
                    <button onClick={onChangeUbicacion} className="ml-auto p-0.5 rounded hover:bg-accent-200 text-accent-400 transition-colors">
                      <Edit3 size={9} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={baseItems.length === 0}
                  onClick={() => onSend(group, groupUbicacion[group])}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Square size={12} /> {t('inventario.escaneo.clasificacion_send')}
                </button>
              </>
            ) : (
              <>
                {onChangeUbicacion && (
                  <button
                    type="button"
                    onClick={onChangeUbicacion}
                    className="flex-1 text-left px-3 py-2 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-accent-300 hover:text-accent-600 transition-colors flex items-center gap-2"
                  >
                    <MapPin size={11} /> {t('inventario.escaneo.ubicacion_scan_title')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={baseItems.length === 0}
                  onClick={() => onSend(group, null)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-50 text-primary-700 text-sm font-semibold hover:bg-primary-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCircle2 size={12} /> {t('inventario.escaneo.clasificacion_confirm')}
                </button>
              </>
            )}
          </div>
        )}
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
    <div className="card flex flex-col overflow-hidden shadow-sm xl:flex-1 xl:min-h-0">
      <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10">
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
                    <StatusPill className={meta.bg}>{t(meta.labelKey)}</StatusPill>
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
  tab,
  tabIndex,
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
  const [inlineDropStyle, setInlineDropStyle] = useState(null)
  const inputRef = useRef(null)
  const inputWrapperRef = useRef(null)
  const footerRef = useRef(null)

  useEffect(() => {
    if (activeInputGroup) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [activeInputGroup])

  useEffect(() => {
    if (!activeInputGroup || !inputValue.trim() || notFound || !inputWrapperRef.current) {
      setInlineDropStyle(null)
      return
    }
    const rect = inputWrapperRef.current.getBoundingClientRect()
    const dropH = 160
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < dropH && rect.top > dropH
    setInlineDropStyle(openUp
      ? { position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, zIndex: 99999 }
      : { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 99999 }
    )
  }, [activeInputGroup, inputValue, notFound])

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
    setInlineDropStyle(null)
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

  const sectionCode = formatPreviewSectionCode(tab, tabIndex)
  const tarimaCards = GROUPS.map((group, index) => ({
    group,
    code: formatPreviewTarimaCode(sectionCode, index),
  }))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-5 xl:h-full">
      {tarimaCards.map(({ group: g, code: tarimaCode }) => {
        const meta = STATUS_META[g]
        const groupItems = grouped[g]
        const hasItems = groupItems.length > 0
        const markedCount = groupItems.filter((item) => item.marked).length
        const allMarked = hasItems && markedCount === groupItems.length
        const ub = groupUbicacion[g]
        const isInputActive = activeInputGroup === g
        return (
          <div
            key={g}
            className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-soft min-h-[22rem] sm:min-h-[24rem] lg:min-h-[26rem] xl:min-h-0 xl:h-full ${meta.cardBorder}`}
          >
            <div className={`flex items-center gap-2 rounded-t-[calc(1rem-2px)] border-b px-4 py-2.5 shrink-0 bg-gradient-to-r ${meta.tint} ${meta.headerFg} border-current/20`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <meta.icon size={14} />
                  <span className="font-semibold text-sm">{t(meta.labelKey)}</span>
                </div>
                <div className="mt-0.5 text-[10px] font-mono opacity-70">{tarimaCode}</div>
              </div>
              <span className="inline-flex items-center justify-center min-w-[2.2rem] rounded-full border border-current/10 bg-white/55 px-2.5 py-1 text-xs font-bold shadow-sm backdrop-blur-sm">
                {groupItems.length}
              </span>
              <button
                type="button"
                onClick={() => onOpenDetail(g)}
                className="ml-auto rounded-lg border border-current/10 bg-white/55 p-1.5 text-current shadow-sm backdrop-blur-sm transition-colors hover:bg-white/75"
                title={t('inventario.escaneo.expand_group')}
              >
                <Maximize2 size={14} />
              </button>
            </div>
            <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y ${meta.divider} pr-1`}>
              {groupItems.length === 0 ? (
                <p className="text-xs text-warm-400 text-center py-4">{t('common.noData')}</p>
              ) : (
                groupItems.map((item, index) => (
                  <div key={item._idx} className={`flex items-start gap-2 px-3 py-2 ${meta.rowHover} ${item.marked ? 'bg-primary-50/50' : ''}`}>
                    <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${meta.itemBadge}`}>
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
                    <div className="flex items-center gap-1 shrink-0 self-center">
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
            <div ref={footerRef} className={`relative shrink-0 border-t ${meta.footerBg}`}>
              <div className="px-2 pt-2">
                <div className="flex items-center justify-between rounded-lg border border-current/10 bg-white/60 px-2.5 py-1.5 text-[10px]">
                  <span className="font-semibold text-warm-600">{t('inventario.escaneo.marked_count')}</span>
                  <span className="font-mono font-bold text-warm-800">{markedCount}/{groupItems.length}</span>
                </div>
              </div>
              {isInputActive ? (
                <div className="px-2 py-2 space-y-1">
                  <div className="flex items-center gap-1">
                    <div ref={inputWrapperRef} className="relative flex-1">
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
                  {suggestions.length > 0 && inlineDropStyle && createPortal(
                    <div style={inlineDropStyle} className="overflow-hidden rounded-xl border border-accent-200 bg-white shadow-depth">
                      <div className="max-h-40 overflow-y-auto py-1">
                        {suggestions.map(u => (
                          <button key={u.id}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-accent-50 transition-colors text-[10px] flex items-center gap-1.5"
                            onMouseDown={e => e.preventDefault()}
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
                    </div>,
                    document.body
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
                      <Edit3 size={9} />
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

function SidePanel({ tab, items }) {
  const { t } = useI18nStore()
  const [search, setSearch] = useState('')
  const [expandedKey, setExpandedKey] = useState(null)

  const filtered = search.trim()
    ? items.filter(item => item.code.toLowerCase().includes(search.toLowerCase()) || (item.code2 || '').toLowerCase().includes(search.toLowerCase()))
    : items

  const counts = items.reduce((a, i) => {
    const group = getItemGroup(i)
    a[group] = (a[group] || 0) + 1
    return a
  }, {})

  const sectionCode = formatPreviewSectionCode(tab, 0)
  const tarimas = filtered.reduce((acc, item) => {
    const group = tab?.scanType === 'unificado' ? 'unificado' : getItemGroup(item)
    const key = group || 'nowms'
    if (!acc[key]) {
      acc[key] = {
        key,
        label: key === 'unificado' ? 'Unificado' : GROUP_SHORT_LABEL[group] || group,
        status: key === 'unificado' ? 'ok' : group,
        items: [],
      }
    }
    acc[key].items.push(item)
    return acc
  }, {})

  const tarimaCards = Object.values(tarimas)

  return (
    <div className="hidden lg:flex w-80 border-l border-warm-100 bg-gradient-to-b from-white via-white to-primary-50/20 backdrop-blur-2xl flex-col shrink-0 shadow-[-16px_0_34px_-28px_rgba(37,99,235,0.38)]">
      <div className="px-4 py-3 border-b border-warm-100 bg-warm-50/50">
        <h4 className="text-xs font-bold text-warm-700 mb-2 uppercase tracking-wider">{t('inventario.escaneo.panel_title')}</h4>
        <div className="flex gap-2 mb-2.5 rounded-2xl border border-primary-100/70 bg-gradient-to-br from-primary-50/85 via-white to-white p-1.5 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.55)]">
          {GROUPS.map(g => {
            const meta = STATUS_META[g]
            return (
              <div key={g} className={`flex-1 rounded-xl border px-2 py-1.5 text-center ring-1 ring-white/70 ${meta.card}`}>
                <p className="text-base font-bold leading-none">{counts[g] || 0}</p>
                <p className="text-[9px] mt-0.5 font-semibold uppercase tracking-wide">
                  {GROUP_SHORT_LABEL[g]}
                </p>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl border border-primary-100/80 bg-gradient-to-r from-white via-primary-50/55 to-white px-3 h-11 shadow-[0_12px_26px_-24px_rgba(37,99,235,0.6)] transition-all focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100/80 shadow-inner">
            <Search className="w-3.5 h-3.5 text-primary-500 shrink-0" />
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('inventario.escaneo.panel_search')}
            className="flex-1 min-w-0 bg-transparent pr-1 text-xs text-warm-700 outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-warm-50/55 p-3 space-y-2.5">
        {tarimaCards.length === 0 ? (
          <div className="py-8 text-center text-xs text-warm-400">{t('inventario.escaneo.panel_empty')}</div>
        ) : (
          tarimaCards.map((tarima, index) => {
            const meta = STATUS_META[tarima.status] ?? STATUS_META.nowms
            const isExpanded = expandedKey === tarima.key
            const tarimaCode = formatPreviewTarimaCode(sectionCode, index)
            return (
              <div key={tarima.key} className={`rounded-2xl border shadow-[0_14px_30px_-24px_rgba(15,23,42,0.32)] transition-all hover:shadow-[0_20px_38px_-26px_rgba(37,99,235,0.32)] ${meta.flash || 'bg-white border-warm-200/90'}`}>
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : tarima.key)}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-xs text-warm-900 truncate">{tarimaCode}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-warm-500">{sectionCode}</p>
                    <p className="mt-1 text-[10px] text-warm-500">{tarima.items.length} cajas · {tarima.label}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${meta.pill}`}>{GROUP_SHORT_LABEL[tarima.status] || t(meta.labelKey)}</span>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-warm-400" /> : <ChevronDown className="h-3.5 w-3.5 text-warm-400" />}
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-current/10"
                    >
                      <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-1.5">
                        {tarima.items.map((item, itemIndex) => (
                          <div key={`${tarima.key}-${item.code}-${itemIndex}`} className={`rounded-xl border px-2.5 py-2 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.25)] ${meta.card} ${item.marked ? 'ring-1 ring-primary-300' : ''}`}>
                            <p className="font-mono text-[11px] font-semibold text-warm-900 truncate">{item.code}</p>
                            <p className="font-mono text-[10px] text-warm-400 truncate mt-0.5">{item.code2 || '—'}</p>
                            <p className="text-[10px] text-warm-400 truncate mt-0.5">
                              {item.ts ? fmtDateTime(item.ts) : '—'} / {item.location || '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
  const { data: moduleUsage } = useModuleUsage()
  const code2Ref = useRef(null)
  const originLocationRef = useRef(null)

  const {
    tabs, activeTabId, pendingCode1,
    openTab, closeTab, setActiveTab,
    addScanItem, removeItem, removeItems, moveItemGroup, toggleItemMarked, setItemsMarkedByGroup,
    restartTab,
    setPendingCode1, clearPendingCode1,
    inventorySnapshot,
  } = useInventarioStore()

  const isOffline = useOfflineStore((s) => s.status === 'offline')
  const boxStockQuery = useBoxStock()
  const { isPending: isSyncing, pendingCount } = useAutoSync()
  const [sheetTs, setSheetTs] = useState(() => getCacheTimestamp('inventory'))
  const [refreshState, setRefreshState] = useState('idle')
  const [refreshMessage, setRefreshMessage] = useState('')

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const sessionBounds = getTimeBounds(activeTab?.items ?? [], { fallbackStart: activeTab?.createdAt })
  const sessionElapsed = useSessionTimer(sessionBounds.start || activeTab?.createdAt)
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
      refreshState={refreshState}
      refreshMessage={refreshMessage}
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
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [criticalError, setCriticalError] = useState(null)
  const [originLocation, setOriginLocation] = useState(() => sessionStorage.getItem('kirion_work_location') || '')
  const [showClasifSummaryModal, setShowClasifSummaryModal] = useState(false)
  const [pendingClasifGroup, setPendingClasifGroup] = useState(null)
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false)

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

    // Skip DB duplicate check when offline — session-level check is still applied
    if (useOfflineStore.getState().status === 'online') {
      try {
        const response = await checkInventoryDuplicates({ codes: [...buildCodeVariantSet(...codes)] })
        dbConflicts = response?.data?.matches || []
      } catch {
        toast.error(t('toast.error'))
        return
      }
    }

    const conflicts = [...sessionConflicts, ...dbConflicts]
    if (conflicts.length === 0) {
      onAccept()
      return
    }

    playSound('duplicate')
    setLastScan({ status: 'duplicate', code: displayCode })
    setDuplicatePending({ code: displayCode, conflicts, onConfirm: onAccept })
  }, [buildSessionDuplicateConflicts, t, toast])

  const { data: sheetUrls } = useQuery({
    queryKey: ['wms-sheet-urls'], queryFn: getSheetUrls, staleTime: 60000,
  })
  const { data: ubicacionesData } = useQuery({
    queryKey: ['wms-ubicaciones', 'inventario'],
    queryFn: () => getUbicaciones('inventario'),
    staleTime: STALE.CATALOG,
  })
  useEffect(() => {
    if (sheetUrls !== undefined) setWmsConfigured(!!sheetUrls?.inventory)
  }, [sheetUrls])

  useEffect(() => {
    const handler = () => initAudio()
    document.addEventListener('click', handler, { once: true })
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    if (pendingCode1) setTimeout(() => code2Ref.current?.focus(), 80)
    else if (sessionStorage.getItem('kirion_work_location')) setTimeout(() => scanRef.current?.focus(), 80)
    else setTimeout(() => originLocationRef.current?.focus(), 80)
  }, [activeTabId, pendingCode1])

  useEffect(() => {
    setUbicacionValidated(null)
    setUbicacionId(null)
    setGroupUbicacion({ ok: null, blocked: null, nowms: null })
    setPendingInlineGroup(null)
  }, [activeTabId])

  const saveSessionMut = useMutation({
    mutationFn: (vars = {}) => {
      const saveVars = typeof vars === 'string' ? { group: vars } : (vars || {})
      const clasifGroup = saveVars.group || null
      const tab = useInventarioStore.getState().tabs.find(t => t.id === activeTabId)
      if (!tab) throw new Error('No active tab')
      const isClasificacion = tab.scanType === 'clasificacion'
      const itemsToSave = isClasificacion && clasifGroup
        ? tab.items.filter(item => getItemGroup(item) === clasifGroup)
        : tab.items
      if (isClasificacion && clasifGroup && itemsToSave.length === 0) {
        throw new Error('No hay registros para la tarima seleccionada')
      }

      const payload = {
        scan_type: tab.scanType,
        ubicacion_id: saveVars.ubicacionId ?? ubicacionId ?? null,
        tarima_code: null,
        origin_location: originLocation || null,
        scans: itemsToSave.map(item => ({
          scanned_code: item.raw || item.scanned_code || item.code || item.normalized_code || item.code2 || '',
          normalized_code: item.code || item.normalized_code || item.raw || item.scanned_code || item.code2 || '',
          code2: item.code2 || null,
          was_swapped: item.wasSwapped || false, scan_status: item.status,
          sku: item.sku !== '-' ? item.sku : null, product_name: item.product !== '-' ? item.product : null,
          cell_no: item.location !== '-' ? item.location : null,
          scanned_at: item.ts ? new Date(item.ts).toISOString() : null,
          group_assignment: isClasificacion ? getItemGroup(item) : 'unificado',
        })),
      }

      // Offline: queue immediately instead of letting axios hang for its full
      // timeout against a dead connection — that's what made this look "stuck
      // saving" without ever actually persisting anything.
      if (useOfflineStore.getState().status === 'offline') {
        useOfflineStore.getState().enqueueModule({ type: 'inventario_session', payload })
        return Promise.resolve({ queuedOffline: true })
      }

      return saveInventorySession(payload).catch((error) => {
        // Went offline mid-request (no server response) — queue instead of losing the scans.
        if (!error.response) {
          useOfflineStore.getState().enqueueModule({ type: 'inventario_session', payload })
          return { queuedOffline: true }
        }
        throw error
      })
    },
    onSuccess: (result, vars) => {
      playSound('complete')
      const saveVars = typeof vars === 'string' ? { group: vars } : (vars || {})
      const clasifGroup = saveVars.group || null
      setShowSummaryModal(false)
      setShowClasifSummaryModal(false)
      setPendingClasifGroup(null)
      setUbicacionId(null)
      if (clasifGroup) {
        const tab = useInventarioStore.getState().tabs.find(t => t.id === activeTabId)
        if (tab) {
          const indices = tab.items
            .map((item, i) => (getItemGroup(item) === clasifGroup ? i : -1))
            .filter(i => i !== -1)
          if (indices.length === tab.items.length) restartTab(activeTabId)
          else removeItems(activeTabId, indices)
        }
      } else {
        closeTab(activeTabId)
      }
      toast.success(result?.queuedOffline
        ? 'Sin conexión — guardado localmente, se sincronizará al reconectar'
        : t('inventario.escaneo.session_started'))
      setTimeout(() => scanRef.current?.focus(), 80)
    },
    onError: (error) => {
      const message = error?.response?.data?.error || error?.message || t('toast.error')
      toast.error(message)
    },
  })

  const createUbicacionMut = useMutation({
    mutationFn: ({ codigo }) => createUbicacion({ codigo, nombre: codigo }),
    onSuccess: (data) => {
      const u = data.ubicacion
      const newUbicacion = { id: u.id, codigo: u.codigo, nombre: u.nombre }
      qc.invalidateQueries({ queryKey: ['wms-ubicaciones'] })
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
    onError: (error) => {
      const message = error?.response?.data?.error
        || (error?.message === 'Network Error' ? 'No se pudo conectar con el backend en :3002 para crear la ubicación' : null)
        || t('toast.error')
      toast.error(message)
    },
  })

  function handleFinalize() {
    if (!activeTab || activeTab.items.length === 0) {
      if (activeTabId) closeTab(activeTabId)
      setShowUbicacionModal(false)
      setShowSummaryModal(false)
      setUbicacionValidated(null)
      setUbicacionId(null)
      return
    }
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
    setPendingClasifGroup(group)
    setShowClasifSummaryModal(true)
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
    setRefreshState('loading')
    setRefreshMessage('Actualizando inventario...')
    try {
      await refreshSheet('inventory')
      setSheetTs(getCacheTimestamp('inventory'))
      await boxStockQuery.refetch()
      setRefreshState('success')
      setRefreshMessage('Inventario actualizado')
      toast.success('Inventario actualizado')
    } catch (error) {
      setRefreshState('error')
      setRefreshMessage(error?.message || 'Error al actualizar')
      toast.error(error?.message || t('toast.error'))
    } finally {
      window.setTimeout(() => {
        setRefreshState('idle')
        setRefreshMessage('')
      }, 2200)
    }
  }

  function confirmCloseTab() {
    if (closeTabPending) {
      closeTab(closeTabPending.tabId)
      setCloseTabPending(null)
    }
  }

  const doAddItem = useCallback((newItem) => {
    addScanItem(newItem)
    playSound('success')
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
        sku: item.customizeCode || '-', product: item.productName || '-', location: item.cellNo || '-', groupAssignment: 'auto' })
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
      toast.warning(t('inventario.escaneo.same_codes')); playSound('error'); return
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

  async function handleSkipCode2() {
    if (!pendingCode1) return
    const p = pendingCode1
    clearPendingCode1()
    await confirmPotentialDuplicate({
      codes: [p.code],
      displayCode: p.code,
      onAccept: () => {
        doAddItem({ raw: p.raw, code: p.code, code2: null, wasSwapped: false,
          status: 'nowms', label: 'NO WMS', sku: '-', product: '-', location: '-', groupAssignment: 'auto' })
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
                  <button onClick={() => navigate('/sistema/conexion')}
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
    <ModuleLimitBanner module="inventario" usage={moduleUsage?.inventario}>
    <div className="flex flex-col h-full">
      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 border-b border-amber-300 text-amber-800 text-xs font-semibold">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Sin conexión — escaneos guardados localmente. <span className="font-normal">No trabaje en la misma ubicación con otro operador: sin red no hay sincronización y habrá duplicados al guardar.</span></span>
        </div>
      )}
      <Header title={t('inventario.escaneo.title')} subtitle={t('nav.inventario')}
        actions={
          <div className="flex items-center gap-1 md:gap-1.5 flex-nowrap">
            <span className="md:hidden">
              <DataSyncStatus
                records={inventoryRecords}
                updatedAt={sheetTs}
                partial={inventoryPartial}
                onRefresh={handleSheetRefresh}
                refreshing={boxStockQuery.isFetching}
                compact
              />
            </span>
            <span className="hidden md:inline-flex">{inventoryHeaderSummary}</span>
            {pendingCount > 0 && (
              <span className="px-2 py-1.5 rounded-lg text-xs font-semibold text-warning-600 bg-warning-50 flex items-center gap-1">
                {isSyncing ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={11} />}
                <span className="text-[10px]">{pendingCount}</span>
              </span>
            )}
            {activeTab && (
              <button
                onClick={handleCancelSession}
                className="h-8 px-2 rounded-lg text-warning-600 bg-warning-50 hover:bg-warning-100 transition-all inline-flex items-center gap-1.5 text-xs font-semibold"
                title={t('common.cancel')}
              >
                <Ban size={13} />
                <span className="hidden md:inline">{t('common.cancel')}</span>
              </button>
            )}
            {activeTab && activeTab.scanType === 'unificado' && (
              <button
                className="h-8 px-2.5 md:px-4 rounded-lg bg-danger-600 text-white hover:bg-danger-700 inline-flex items-center gap-1.5 text-xs font-semibold"
                onClick={handleFinalize}
                disabled={saveSessionMut.isPending}
                title={t('common.finalize')}
              >
                <Square className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t('common.finalize')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowQuickSearch(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-warm-200 bg-warm-100 text-warm-400 transition-all hover:bg-primary-50 hover:text-primary-600"
              title="Búsqueda rápida"
            >
              <Search size={14} />
            </button>
          </div>
        }
      />

      {/* Desktop tab bar */}
      <div className="hidden md:flex items-center gap-1.5 px-4 pt-3 pb-0 border-b border-warm-100 bg-white overflow-x-auto overflow-y-hidden">
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
            <span>{t('inventario.escaneo.new_tab')}</span>
          </button>
        )}
      </div>

      {/* Mobile session bar */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-warm-100 bg-white shrink-0">
        <ScanBarcode size={13} className="text-teal-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-warm-800 font-mono truncate block">
            {activeTab?.name ?? t('inventario.escaneo.new_tab')}
          </span>
          {activeTab && (
            <span className="text-[10px] text-warm-400">
              {activeTab.scanType === 'clasificacion' ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')} • {activeTab.items.length} {t('inventario.escaneo.scans_label')}
            </span>
          )}
        </div>
        {tabs.length > 1 && (
          <button
            onClick={() => setMobilePickerOpen(true)}
            className="flex items-center gap-1 text-[11px] text-teal-700 bg-teal-50 border border-teal-200 px-2 py-1.5 rounded-lg font-semibold shrink-0 active:scale-95"
          >
            <Layers size={11} /> {tabs.length}
          </button>
        )}
        {tabs.length < 4 && (
          <button
            onClick={handleAddTab}
            className="flex items-center gap-1 text-[11px] text-success-600 bg-success-50 border border-success-200 px-2 py-1.5 rounded-lg font-semibold shrink-0 active:scale-95"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {mobilePickerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobilePickerOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl md:hidden"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              <div className="w-10 h-1 bg-warm-300 rounded-full mx-auto mt-3 mb-1" />
              <div className="px-4 pb-2 pt-1 flex items-center justify-between">
                <span className="text-sm font-bold text-warm-800">{t('inventario.escaneo.new_tab')}</span>
                <button onClick={() => setMobilePickerOpen(false)} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400"><X size={16} /></button>
              </div>
              <div className="px-3 pb-6 space-y-2 max-h-64 overflow-y-auto">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setMobilePickerOpen(false) }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      tab.id === activeTabId
                        ? 'border-teal-300 bg-teal-50'
                        : 'border-warm-200 bg-warm-50 hover:bg-warm-100'
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${tab.scanType === 'clasificacion' ? 'bg-accent-400' : 'bg-teal-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate font-mono ${tab.id === activeTabId ? 'text-teal-700' : 'text-warm-700'}`}>{tab.name}</p>
                      <p className="text-[10px] text-warm-400">{tab.items.length} {t('inventario.escaneo.scans_label')}</p>
                    </div>
                    {tab.id === activeTabId && (
                      <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded shrink-0">Activa</span>
                    )}
                    {tabs.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); handleCloseTab(tab.id) }}
                        className="p-1.5 hover:bg-danger-100 rounded-lg text-warm-300 hover:text-danger-500 transition-colors shrink-0"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Active tab content + optional side panel */}
      {activeTab && (
        <div className="flex flex-1 overflow-hidden relative">
          <div className="flex-1 overflow-y-auto xl:overflow-hidden flex flex-col p-3 md:p-6">
            <div className="max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-4 xl:space-y-0 xl:flex xl:flex-col xl:gap-4 xl:h-full xl:min-h-0">

              {/* Session info card */}
              <motion.div className="card p-3 shadow-sm overflow-hidden relative xl:shrink-0"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                <div className="flex items-start gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    activeTab.scanType === 'clasificacion' ? 'bg-accent-100' : 'bg-primary-100'
                  }`}>
                    <Package className={`w-5 h-5 ${activeTab.scanType === 'clasificacion' ? 'text-accent-600' : 'text-primary-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-warm-900 truncate leading-none font-mono text-xl tracking-tight">{activeTab.name}</p>
                    <p className="text-[10px] text-warm-500 mt-0.5">
                      {activeTab.scanType === 'clasificacion' ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-4xl font-black text-warm-900 tracking-tighter leading-none">{activeTab.items.length}</p>
                    <p className="text-xs font-medium text-warm-400 leading-tight">{t('inventario.escaneo.scans_label')}</p>
                  </div>
                </div>
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-warm-100">
                  <div className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 ${STATUS_META.ok.soft}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success-500 shrink-0" />
                    <div>
                      <p className="text-lg font-extrabold text-success-600 leading-none">{summary.ok}</p>
                      <p className="text-[8px] text-success-600 uppercase tracking-wider font-bold">{t('inventario.escaneo.ok_abbr')}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 ${STATUS_META.blocked.soft}`}>
                    <AlertTriangle className="w-3.5 h-3.5 text-warning-500 shrink-0" />
                    <div>
                      <p className="text-lg font-extrabold text-warning-600 leading-none">{summary.blocked}</p>
                      <p className="text-[8px] text-warning-600 uppercase tracking-wider font-bold">{t('inventario.escaneo.blocked_abbr')}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 ${STATUS_META.nowms.soft}`}>
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
                <div className="mt-2 flex items-center justify-between border-t border-warm-100 pt-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <MapPin size={13} className="text-primary-500 shrink-0" />
                    <span className="text-warm-500 shrink-0 font-medium text-xs">Origen:</span>
                    <input
                      ref={originLocationRef}
                      type="text"
                      value={originLocation}
                      onChange={e => { const v = e.target.value; setOriginLocation(v); if (v) sessionStorage.setItem('kirion_work_location', v); else sessionStorage.removeItem('kirion_work_location') }}
                      placeholder="Ubicación trabajo/origen"
                      className="flex-1 min-w-0 font-mono text-xs bg-transparent border-0 outline-none placeholder:text-warm-300 text-warm-700 focus:text-primary-700"
                      onKeyDown={e => { if (e.key === 'Enter') scanRef.current?.focus() }}
                      autoComplete="off"
                    />
                  </div>
                  <span className="shrink-0 ml-3 text-xs text-warm-500">{t('inventario.escaneo.total')}: <strong className="text-warm-700">{summary.total}</strong></span>
                </div>
              </motion.div>

              {/* Scan input */}
              <div className="xl:shrink-0">
                {!pendingCode1 ? (
                  <div className="relative">
                    <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
                    <input
                      ref={scanRef}
                      type="text"
                      inputMode="none"
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
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={handleSkipCode2}
                        className="text-[11px] text-warm-400 hover:text-warm-600 transition-colors leading-none"
                      >
                        {t('inventario.escaneo.skip_code2')}
                      </button>
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
                    className={`xl:shrink-0 p-4 rounded-2xl flex items-center gap-3 border backdrop-blur-sm shadow-sm ${
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
                <div className="xl:flex-1 xl:min-h-0">
                  <ClasificacionPanel
                    tab={activeTab}
                    tabIndex={tabs.findIndex((tab) => tab.id === activeTab.id)}
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
                </div>
              ) : (
                <UnificadoPanel
                  items={activeTab.items}
                  onRemove={idx => removeItem(activeTabId, idx)}
                  onMove={idx => setMoveTarget(idx)}
                />
              )}
            </div>
          </div>

          {/* Right side panel — wrapper always rendered so toggle stays at panel edge */}
          <div className={`hidden lg:flex shrink-0 relative ${showPanel ? 'w-80' : 'w-0'}`}>
            <button
              type="button"
              onClick={() => setShowPanel(v => !v)}
              title={showPanel ? 'Ocultar panel' : 'Mostrar panel'}
              className="hidden lg:flex absolute -left-5 top-4 z-20 h-10 w-10 items-center justify-center rounded-xl border border-warm-200 bg-white text-warm-500 shadow-sm transition-all hover:bg-warm-50 hover:text-primary-600"
            >
              {showPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
            {showPanel && (
              <SidePanel tab={activeTab} items={activeTab.items} />
            )}
          </div>
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
        originLocation={originLocation}
      />
      <ClasificacionSummaryModal
        isOpen={showClasifSummaryModal}
        group={pendingClasifGroup}
        tab={activeTab}
        tabIndex={activeTab ? tabs.findIndex(t => t.id === activeTab.id) : 0}
        onSave={() => saveSessionMut.mutate({
          group: pendingClasifGroup,
          ubicacionId: ubicacionValidated?.id ?? ubicacionId ?? null,
        })}
        onClose={() => { setShowClasifSummaryModal(false); setPendingClasifGroup(null) }}
        isSaving={saveSessionMut.isPending}
        ubicacionValidated={ubicacionValidated}
        onChangeUbicacion={() => { setShowClasifSummaryModal(false); setShowUbicacionModal(true) }}
        originLocation={originLocation}
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
        originLocation={originLocation}
        onSend={(g, ub) => { setGroupDetail(null); handleClasificacionSend(g, ub) }}
        groupUbicacion={groupUbicacion}
        onChangeUbicacion={() => { setGroupDetail(null); setShowUbicacionModal(true) }}
      />
      <QuickCodeSearchModal
        isOpen={showQuickSearch}
        onClose={() => setShowQuickSearch(false)}
      />
      <ErrorAlertModal
        isOpen={!!criticalError}
        onClose={() => setCriticalError(null)}
        title={criticalError?.title}
        message={criticalError?.message}
      />
    </div>
    </ModuleLimitBanner>
  )
}
