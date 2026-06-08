import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  Search, UserCheck, Users, Plus, Trash2, X, ChevronDown, Play, Loader2,
  Package2, Truck, ScanBarcode, Copy, Check, Eye, ClipboardList,
  User, Clock, BarChart3, RefreshCw, Database, CheckCircle2,
  MapPin, Timer, XCircle, AlertCircle, Pencil, BadgeCheck, Download,
  ListFilter, Filter, CalendarClock, Save, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import DataSyncStatus from '../../../core/components/common/DataSyncStatus'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import {
  getOutboundList,
  getSurtidores, createSurtidor, deleteSurtidor,
  getOrderTracking, upsertOrderTracking, bulkUpsertOrderTracking, getScanSessions,
  getManualEntryReasons, createManualEntryReason, updateManualEntryReason, deleteManualEntryReason,
  getRecords,
} from '../services/surtidoService'
import { refreshSheet, getCacheTimestamp, subscribeSheetCache } from '../../WmsHub/services/googleSheetsService'
import { fmtDateTime as formatDateTimeTz, fmtDate as formatDateTz, fmtTimeShort, getToday, subtractDays, toDateKey } from '../../../core/utils/dateFormat'

const STATUS_META = {
  pending_assignment: { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  sorting:            { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-primary-100 text-primary-700' },
  validating:         { labelKey: 'surtido.ordenes.status.validating',         cls: 'bg-accent-100 text-accent-700' },
  complete:           { labelKey: 'surtido.ordenes.status.complete',           cls: 'bg-success-100 text-success-700' },
  partial:            { labelKey: 'surtido.ordenes.status.partial',            cls: 'bg-warning-100 text-warning-700' },
  cancelled:          { labelKey: 'surtido.ordenes.status.cancelled',          cls: 'bg-danger-100 text-danger-700' },
  // legacy — kept for existing DB records
  assigned:           { labelKey: 'surtido.ordenes.status.assigned',           cls: 'bg-warm-100 text-warm-600' },
  pending_validation: { labelKey: 'surtido.ordenes.status.pending_validation', cls: 'bg-primary-100 text-primary-700' },
}

const STATUS_FILTER_KEYS = ['pending_assignment', 'sorting', 'validating', 'complete', 'partial', 'cancelled']
const CLOSED_ORDER_STATUSES = new Set(['complete', 'partial'])
const TH_CLASS = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'
function parseBulkCodes(text) {
  return Array.from(new Set(
    String(text || '')
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  ))
}

function getHourPart(value) {
  if (!value) return ''
  try {
    const raw = String(value)
    if (/T\d{2}:\d{2}/.test(raw)) return raw.slice(11, 16)
    if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5)
    return fmtTimeShort(value).slice(0, 5)
  } catch {
    return ''
  }
}

function withinTimeRange(value, from, to) {
  if (!from && !to) return true
  const time = getHourPart(value)
  if (!time) return false
  if (from && time < from) return false
  if (to && time > to) return false
  return true
}

function getFilterDateValue(record) {
  return record?.outboundTime || record?.expectedTime || record?.orderCreateTime || record?.updated_at || ''
}

function SortableHeader({ label, sortKey, currentKey, direction, onSort, className = '', textClassName = '' }) {
  const active = currentKey === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 ${textClassName} ${active ? 'text-primary-700' : ''}`}
    >
      <span>{label}</span>
      {active ? (
        direction === 'asc' ? <ArrowUp size={11} className="shrink-0" /> : <ArrowDown size={11} className="shrink-0" />
      ) : (
        <ArrowUpDown size={11} className="shrink-0 opacity-70" />
      )}
    </button>
  )
}

function normalizeComparable(value) {
  return String(value ?? '').trim().toLowerCase()
}

function compareValues(a, b) {
  const aNum = Number(a)
  const bNum = Number(b)
  const aIsNum = Number.isFinite(aNum) && String(a).trim() !== ''
  const bIsNum = Number.isFinite(bNum) && String(b).trim() !== ''
  if (aIsNum && bIsNum) return aNum - bNum
  return normalizeComparable(a).localeCompare(normalizeComparable(b), 'es', { sensitivity: 'base', numeric: true })
}

function sortByDirection(valueA, valueB, direction) {
  const result = compareValues(valueA, valueB)
  return direction === 'asc' ? result : -result
}

function DestinationSearch({ value, onChange, onEnter, options, t }) {
  const wrapperRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const term = value.trim().toLowerCase()
  const filtered = term
    ? options.filter((option) => option.toLowerCase().includes(term)).slice(0, 12)
    : []

  const showPanel = open && term.length > 0

  const handleSelect = (destination) => {
    onChange(destination)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative min-w-[220px] flex-1 sm:flex-none sm:w-[260px]">
      <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
        <MapPin size={13} className="text-warm-400 shrink-0" />
        <input
          type="text"
          className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder={t('surtido.ordenes.receiver')}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) onEnter()
          }}
          onPaste={() => setOpen(true)}
        />
        {value && (
          <button
            type="button"
            className="rounded-lg p-1 text-warm-400 hover:bg-warm-100 hover:text-primary-600"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            title={t('common.clear')}
          >
            <X size={13} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full left-0 right-0 z-[100] mt-1 overflow-hidden rounded-xl border border-warm-100 bg-white shadow-depth"
          >
            <div className="flex items-center justify-between border-b border-warm-100 bg-warm-50/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">
                {t('surtido.ordenes.destination_results')}
              </p>
              <span className="text-[10px] font-semibold text-warm-400">
                {filtered.length} {t('surtido.ordenes.destination_matches')}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto scrollbar-thin">
              {filtered.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-sm font-medium text-warm-700">{t('surtido.ordenes.destination_empty_state')}</p>
                  <p className="mt-1 text-xs text-warm-400">{t('surtido.ordenes.destination_empty_hint')}</p>
                </div>
              ) : (
                filtered.map((destination) => (
                  <button
                    key={destination}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleSelect(destination)
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-warm-700 transition-colors hover:bg-primary-50 hover:text-primary-700"
                  >
                    <Search size={12} className="shrink-0 text-warm-300" />
                    <span className="truncate">{destination}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SurtidoresModal({ isOpen, onClose, canUpdate, canDelete }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')

  const { data } = useQuery({ queryKey: ['wms-surtidores'], queryFn: getSurtidores, staleTime: 30000, enabled: isOpen })
  const surtidores = getRecords(data)

  const addMut = useMutation({
    mutationFn: createSurtidor,
    onSuccess: () => { setNombre(''); qc.invalidateQueries({ queryKey: ['wms-surtidores'] }) },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })
  const delMut = useMutation({
    mutationFn: deleteSurtidor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wms-surtidores'] }),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.surtidores_title')} icon={Users}
      footer={<button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>}
    >
      <div className="space-y-3">
        {canUpdate && (
          <div className="flex gap-2">
            <input className="input-field flex-1 text-sm" placeholder={t('surtido.ordenes.surtidor_name')}
              value={nombre} onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && nombre.trim()) addMut.mutate({ nombre: nombre.trim() }) }} />
            <button className="btn-primary inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap" onClick={() => addMut.mutate({ nombre: nombre.trim() })}
              disabled={!nombre.trim() || addMut.isPending}>
              {addMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('surtido.ordenes.add_surtidor')}
            </button>
          </div>
        )}
        <div className="divide-y divide-warm-100 max-h-60 overflow-y-auto">
          {surtidores.length === 0 ? (
            <p className="text-sm text-warm-400 text-center py-6">{t('common.noData')}</p>
          ) : surtidores.map(s => (
            <div key={s.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                  {s.nombre[0]?.toUpperCase()}
                </div>
                <span className="text-sm text-warm-800 font-medium">{s.nombre}</span>
              </div>
              {canDelete && (
                <button className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                  onClick={() => delMut.mutate(s.id)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function ManualReasonsModal({ isOpen, onClose, canUpdate, canDelete }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const { data } = useQuery({
    queryKey: ['wms-manual-entry-reasons'],
    queryFn: getManualEntryReasons,
    staleTime: 30000,
    enabled: isOpen,
  })
  const reasons = getRecords(data)

  const createMut = useMutation({
    mutationFn: createManualEntryReason,
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: ['wms-manual-entry-reasons'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, nombre }) => updateManualEntryReason(id, { nombre }),
    onSuccess: () => {
      setEditingId(null)
      setEditingName('')
      qc.invalidateQueries({ queryKey: ['wms-manual-entry-reasons'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const deleteMut = useMutation({
    mutationFn: deleteManualEntryReason,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wms-manual-entry-reasons'] }),
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('surtido.ordenes.manage_motivos')}
      icon={ClipboardList}
      footer={<button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>}
    >
      <div className="space-y-3">
        {canUpdate && (
          <div className="flex gap-2">
            <input
              className="input-field flex-1 text-sm"
              placeholder={t('surtido.ordenes.reason_placeholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) createMut.mutate({ nombre: draft.trim() }) }}
            />
            <button
              className="btn-primary inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              onClick={() => createMut.mutate({ nombre: draft.trim() })}
              disabled={!draft.trim() || createMut.isPending}
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('surtido.ordenes.add_surtidor')}
            </button>
          </div>
        )}
        <div className="divide-y divide-warm-100 max-h-72 overflow-y-auto">
          {reasons.length === 0 ? (
            <p className="py-6 text-center text-sm text-warm-400">{t('common.noData')}</p>
          ) : reasons.map((reason) => (
            <div key={reason.id} className="flex items-center gap-2 py-2.5">
              {editingId === reason.id ? (
                <input
                  className="input-field flex-1 text-sm"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editingName.trim()) updateMut.mutate({ id: reason.id, nombre: editingName.trim() })
                  }}
                />
              ) : (
                <span className="flex-1 text-sm font-medium text-warm-800">{reason.nombre}</span>
              )}
              {canUpdate && (
                editingId === reason.id ? (
                  <button
                    className="rounded-lg p-2 text-primary-600 hover:bg-primary-50"
                    onClick={() => updateMut.mutate({ id: reason.id, nombre: editingName.trim() })}
                    disabled={!editingName.trim() || updateMut.isPending}
                  >
                    <Save size={14} />
                  </button>
                ) : (
                  <button
                    className="rounded-lg p-2 text-warm-400 hover:bg-warm-100 hover:text-primary-600"
                    onClick={() => { setEditingId(reason.id); setEditingName(reason.nombre) }}
                  >
                    <Pencil size={14} />
                  </button>
                )
              )}
              {canDelete && (
                <button
                  className="rounded-lg p-2 text-warm-400 hover:bg-danger-50 hover:text-danger-600"
                  onClick={() => deleteMut.mutate(reason.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function BulkSearchModal({ isOpen, onClose, onApply, initialValue }) {
  const { t } = useI18nStore()
  const [value, setValue] = useState(initialValue || '')
  useEffect(() => { if (isOpen) setValue(initialValue || '') }, [isOpen, initialValue])
  const codes = useMemo(() => parseBulkCodes(value), [value])
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('surtido.ordenes.bulk_search_title')}
      icon={ListFilter}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={() => setValue('')}>{t('common.clear')}</button>
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => { onApply(value, codes); onClose() }} disabled={codes.length === 0}>
            {t('surtido.ordenes.bulk_search_apply')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <textarea
          className="input-field min-h-48 w-full resize-none text-sm font-mono"
          placeholder={t('surtido.ordenes.bulk_search_placeholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-xs font-semibold text-warm-500">
          {codes.length} {t('surtido.ordenes.bulk_search_detected')}
        </p>
      </div>
    </Modal>
  )
}

function AssignModal({ isOpen, order, onClose, onAssign }) {
  const { t } = useI18nStore()
  const { data } = useQuery({ queryKey: ['wms-surtidores'], queryFn: getSurtidores, staleTime: 30000, enabled: isOpen })
  const surtidores = getRecords(data)
  const [selected, setSelected] = useState(null)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.assign_surtidor')} icon={UserCheck}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={() => { onAssign(selected); onClose() }}>{t('common.save')}</button>
        </div>
      }
    >
      <p className="text-xs text-warm-500 mb-3">
        OBC: <strong className="font-mono text-warm-800">{order?.outboundOrderNo || order?.outbound_order_no}</strong>
      </p>
      <div className="space-y-1.5">
        <button onClick={() => setSelected(null)}
          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
            selected === null ? 'border-warm-300 bg-warm-50 text-warm-600' : 'border-warm-200 hover:border-warm-300 text-warm-500'
          }`}>
          {t('surtido.ordenes.no_surtidor')}
        </button>
        {surtidores.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
              selected === s.id ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700' : 'border-warm-200 hover:border-warm-300 text-warm-700'
            }`}>
            {s.nombre}
          </button>
        ))}
      </div>
    </Modal>
  )
}

function QuickEditPanel({ obc, wmsRecord, tracking, surtidores, isOpen, onClose, onSave, isSaving, t }) {
  const navigate = useNavigate()
  const [localSurtidorId, setLocalSurtidorId] = useState('')
  const [localNotes, setLocalNotes] = useState('')
  const [localStatus, setLocalStatus] = useState('pending_assignment')

  useEffect(() => {
    if (isOpen) {
      const current = surtidores.find(s => s.nombre === tracking?.surtidor_nombre)
      setLocalSurtidorId(current?.id ? String(current.id) : '')
      setLocalNotes(tracking?.notes || '')
      setLocalStatus(tracking?.status || 'pending_assignment')
    }
  }, [isOpen, tracking, surtidores])

  const meta = STATUS_META[localStatus] ?? STATUS_META.pending_assignment
  const cliente = wmsRecord?.customerCode || wmsRecord?.customerName || '—'
  const destino = wmsRecord?.receiverName || '—'
  const cajas = wmsRecord?.outboundBoxCount ?? wmsRecord?.packageCount ?? '—'
  const canal = wmsRecord?.logisticsChannel || '—'
  const referencia = wmsRecord?.thirdOrderNo || wmsRecord?.referenceNo || '—'
  const trackingNo = wmsRecord?.logisticsTrackNo || '—'
  const isClosedOrder = CLOSED_ORDER_STATUSES.has(tracking?.status)
  const hasValidationRecord = isClosedOrder || Number(tracking?.session_count ?? 0) > 0

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed top-16 inset-x-0 bottom-0 z-[30] bg-black/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            className="fixed top-16 right-0 bottom-0 w-[400px] bg-white shadow-depth z-[35] flex flex-col border-l border-warm-200"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-warm-100 bg-warm-50/60 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                <ClipboardList size={17} className="text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="code-main truncate">{obc || '—'}</p>
                <span className={`badge text-[10px] font-semibold mt-0.5 inline-block ${meta.cls}`}>{t(meta.labelKey)}</span>
              </div>
              <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Key info */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t('surtido.ordenes.cliente'),         value: cliente },
                  { label: t('surtido.ordenes.receiver'),        value: destino },
                  { label: t('surtido.ordenes.cajas'),           value: String(cajas) },
                  { label: t('surtido.ordenes.canal'),           value: canal },
                  { label: t('surtido.ordenes.referencia'),      value: referencia },
                  { label: t('surtido.ordenes.detail.tracking'), value: trackingNo, mono: true },
                ].map(item => (
                  <div key={item.label} className="rounded-xl bg-warm-50 border border-warm-100 px-3 py-2.5">
                    <p className="text-[10px] text-warm-400 uppercase tracking-wide font-bold mb-0.5">{item.label}</p>
                    <p className={`text-xs font-semibold text-warm-800 truncate ${item.mono ? 'font-mono' : ''}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Assign surtidor */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wider">{t('surtido.ordenes.surtidor')}</p>
                <select
                  value={localSurtidorId}
                  onChange={e => setLocalSurtidorId(e.target.value)}
                  disabled={isClosedOrder}
                  className="w-full h-10 pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all cursor-pointer"
                >
                  <option value="">{t('surtido.ordenes.no_surtidor')}</option>
                  {surtidores.map(s => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
                </select>
              </div>

              {/* Change status */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wider">{t('surtido.ordenes.status')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_FILTER_KEYS.map(k => {
                    const m = STATUS_META[k]
                    return (
                      <button
                        key={k}
                        onClick={() => setLocalStatus(k)}
                        disabled={isClosedOrder && k !== localStatus}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          localStatus === k
                            ? `${m.cls} border-current ring-1 ring-current/30`
                            : 'bg-warm-50 text-warm-500 border-warm-200 hover:border-warm-300 hover:text-warm-700'
                        }`}
                      >
                        {t(m.labelKey)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wider">Nota</p>
                <textarea
                  rows={3}
                  value={localNotes}
                  onChange={e => setLocalNotes(e.target.value)}
                  placeholder="Agregar nota sobre esta orden..."
                  className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-xs text-warm-700 outline-none resize-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
                />
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-warm-100 bg-warm-50/40 shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onClose(); navigate(`/Surtido/ordenes/${encodeURIComponent(obc)}`) }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-warm-200 bg-white text-sm font-semibold text-violet-700 hover:bg-violet-50 hover:border-violet-200 transition-colors"
                >
                  <Eye size={14} className="text-violet-600" /> {t('admin.view')}
                </button>
                {hasValidationRecord ? (
                  <button
                    onClick={() => { onClose(); navigate(`/Surtido/registros?obc=${encodeURIComponent(obc)}`) }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-success-200 bg-white text-sm font-semibold text-success-700 hover:bg-success-50 hover:border-success-300 transition-colors"
                  >
                    <BadgeCheck size={14} className="text-success-600" /> Ver Validación
                  </button>
                ) : (
                  <button
                    onClick={() => { onClose(); navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`) }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-primary-200 bg-white text-sm font-semibold text-primary-700 hover:bg-primary-50 hover:border-primary-300 transition-colors"
                  >
                    <ScanBarcode size={14} className="text-primary-600" /> {t('surtido.ordenes.validate_btn')}
                  </button>
                )}
              </div>
              <button
                onClick={() => onSave({
                  surtidorId: localSurtidorId ? Number(localSurtidorId) : null,
                  canChangeSurtidor: !isClosedOrder,
                  status: localStatus,
                  notes: localNotes,
                })}
                disabled={isSaving}
                className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {t('common.save')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

const SESSION_STATUS = {
  complete:           { cls: 'bg-success-100 text-success-700',  label: 'Completa' },
  with_discrepancies: { cls: 'bg-warning-100 text-warning-700',  label: 'Con diferencias' },
  validating:         { cls: 'bg-primary-100 text-primary-700',  label: 'En curso' },
}

function fmtDateTime(value) {
  if (!value) return '—'
  return formatDateTimeTz(value)
}

function ObcCopyHeader({ obc, meta, t }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono font-black text-warm-900 text-xl leading-none truncate">{obc}</span>
        <button
          onClick={() => navigator.clipboard.writeText(obc).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
          className="shrink-0 p-1 rounded-md text-warm-300 hover:text-primary-600 transition-colors">
          {copied ? <Check size={14} className="text-success-600" /> : <Copy size={14} />}
        </button>
      </div>
      <span className={`badge text-[11px] font-semibold shrink-0 ${meta.cls}`}>{t(meta.labelKey)}</span>
    </div>
  )
}

function EventsTable({ events, t, showResult = false }) {
  if (events.length === 0) return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-warm-400">
      <CheckCircle2 size={32} className="opacity-30" />
      <p className="text-sm">{t('common.noData')}</p>
    </div>
  )
  return (
    <div className="max-h-80 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
      <table className="w-full text-xs">
        <thead className="bg-warm-50 sticky top-0 z-10 border-b border-warm-100">
          <tr>
            <th className="table-header">#</th>
            <th className="table-header">{t('surtido.validacion.code_header')}</th>
            {showResult && <th className="table-header">Tipo</th>}
            <th className="table-header text-right">Hora escaneo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {events.map((e, i) => (
            <tr key={e.id || i} className={`table-row ${
              showResult && e.scan_result === 'duplicate' ? 'bg-warning-50/30' : ''
            }`}>
              <td className="px-3 py-2 text-warm-400 tabular-nums font-bold">{i + 1}</td>
              <td className="px-3 py-2 font-mono font-semibold text-warm-700">{e.normalized_code || e.scanned_code}</td>
              {showResult && (
                <td className="px-3 py-2">
                  <span className={`badge text-[10px] ${
                    e.scan_result === 'duplicate' ? 'bg-warning-100 text-warning-700' : 'bg-danger-100 text-danger-700'
                  }`}>
                    {e.scan_result === 'duplicate' ? t('surtido.escaneo.match_duplicate') : t('surtido.escaneo.match_rejected')}
                  </span>
                </td>
              )}
              <td className="px-3 py-2 text-right text-warm-400 tabular-nums">
                {String(e.scanned_at || '').slice(11, 19)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CopyableObc({ obc }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(obc).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="flex items-center gap-1 group/obc">
      <span className="code-main">{obc || '—'}</span>
      {obc && (
        <button onClick={handleCopy}
          className="opacity-0 group-hover/obc:opacity-100 p-0.5 rounded text-warm-400 hover:text-primary-600 transition-all">
          {copied ? <Check size={11} className="text-success-600" /> : <Copy size={11} />}
        </button>
      )}
    </div>
  )
}

function StatusTabs({ selected, onChange, t }) {
  return (
    <div className="flex gap-0 border-b border-warm-100 bg-white/60">
      <button
        onClick={() => onChange('')}
        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
          !selected
            ? 'border-primary-500 text-primary-700'
            : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
        }`}>
        {t('common.all')}
      </button>
      {STATUS_FILTER_KEYS.map(k => {
        const v = STATUS_META[k]
        return (
          <button key={k} onClick={() => onChange(k === selected ? '' : k)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
              selected === k
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
            }`}>
            {t(v.labelKey)}
          </button>
        )
      })}
    </div>
  )
}



export default function Ordenes() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission, user } = useAuthStore()
  const canCreateValidation = hasPermission('surtido.validacion', 'crear')
  const canUpdateOrders = hasPermission('surtido.ordenes', 'actualizar')
  const canDeleteOrders = hasPermission('surtido.ordenes', 'eliminar')
  const canExportOrders = canUpdateOrders

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusDraft, setStatusDraft] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [clientDraft, setClientDraft] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [surtidorDraft, setSurtidorDraft] = useState('')
  const [filterSurtidor, setFilterSurtidor] = useState('')
  const [destinationDraft, setDestinationDraft] = useState('')
  const [filterDestination, setFilterDestination] = useState('')
  const [dateFromDraft, setDateFromDraft] = useState(() => subtractDays(getToday(), 30))
  const [dateToDraft, setDateToDraft] = useState(() => getToday())
  const [dateFrom, setDateFrom] = useState(dateFromDraft)
  const [dateTo, setDateTo] = useState(dateToDraft)
  const [autoDateAnchor, setAutoDateAnchor] = useState(() => getToday())
  const [timeFromDraft, setTimeFromDraft] = useState('')
  const [timeToDraft, setTimeToDraft] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [showTimeFilters, setShowTimeFilters] = useState(false)
  const [showSurtidoresModal, setShowSurtidoresModal] = useState(false)
  const [showReasonsModal, setShowReasonsModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)
  const [quickEditObc, setQuickEditObc] = useState(null)
  const [bulkSearchOpen, setBulkSearchOpen] = useState(false)
  const [bulkSearchText, setBulkSearchText] = useState('')
  const [bulkSearchCodes, setBulkSearchCodes] = useState([])
  const timeFromInputRef = useRef(null)

  const [refreshing, setRefreshing] = useState(false)
  const [sheetTs, setSheetTs] = useState(() => getCacheTimestamp('outbound'))
  const timeFilterKey = `kirion_surtido_ordenes_time_${user?.id || 'guest'}`
  const destinationFilterKey = `kirion_surtido_destination_${user?.id || 'guest'}`

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(timeFilterKey) || 'null')
      if (saved) {
        setTimeFromDraft(saved.timeFrom || '')
        setTimeToDraft(saved.timeTo || '')
        setTimeFrom(saved.timeFrom || '')
        setTimeTo(saved.timeTo || '')
        if (saved.timeFrom || saved.timeTo) setShowTimeFilters(true)
      }
      const savedDestination = sessionStorage.getItem(destinationFilterKey) || ''
      if (savedDestination) {
        const normalizedDestination = savedDestination.trim()
        setDestinationDraft(normalizedDestination)
        setFilterDestination(normalizedDestination)
      }
    } catch {}
  }, [timeFilterKey, destinationFilterKey])

  useEffect(() => {
    const syncAutoDateWindow = () => {
      const today = getToday()
      if (today === autoDateAnchor) return

      const previousAutoTo = autoDateAnchor
      const previousAutoFrom = subtractDays(previousAutoTo, 30)
      const nextAutoTo = today
      const nextAutoFrom = subtractDays(nextAutoTo, 30)

      const draftMatchesPreviousAuto = dateFromDraft === previousAutoFrom && dateToDraft === previousAutoTo
      const appliedMatchesPreviousAuto = dateFrom === previousAutoFrom && dateTo === previousAutoTo

      if (draftMatchesPreviousAuto) {
        setDateFromDraft(nextAutoFrom)
        setDateToDraft(nextAutoTo)
      }

      if (appliedMatchesPreviousAuto) {
        setDateFrom(nextAutoFrom)
        setDateTo(nextAutoTo)
      }

      setAutoDateAnchor(today)
    }

    syncAutoDateWindow()
    const intervalId = window.setInterval(syncAutoDateWindow, 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [autoDateAnchor, dateFrom, dateTo, dateFromDraft, dateToDraft])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refreshSheet('outbound')
      setSheetTs(getCacheTimestamp('outbound'))
      qc.invalidateQueries({ queryKey: ['wms-outbound'] })
    } finally {
      setRefreshing(false)
    }
  }

  const { data: wmsData, isLoading: wmsLoading } = useQuery({
    queryKey: ['wms-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  })

  const { data: trackingData } = useQuery({
    queryKey: ['wms-order-tracking'],
    queryFn: getOrderTracking,
    staleTime: 30000,
    retry: 0,
  })

  const { data: surtidoresData } = useQuery({
    queryKey: ['wms-surtidores'],
    queryFn: getSurtidores,
    staleTime: 60000,
    retry: 0,
  })

  const allWmsRecords = getRecords(wmsData)
  const trackingList  = getRecords(trackingData)
  const surtidores    = getRecords(surtidoresData)
  const isPartial     = wmsData?.data?.partial ?? false
  const fromPersistentCache = wmsData?.data?.fromPersistentCache ?? false

  useEffect(() => {
    if (!isPartial) return undefined
    return subscribeSheetCache((type, status) => {
      if (type !== 'outbound') return
      if (status.partial && !fromPersistentCache) return
      setSheetTs(status.ts)
      qc.invalidateQueries({ queryKey: ['wms-outbound'] })
    })
  }, [fromPersistentCache, isPartial, qc])

  const trackingMap = trackingList.reduce((m, tr) => {
    m[tr.outbound_order_no] = tr; return m
  }, {})

  const wmsMap = allWmsRecords.reduce((m, r) => {
    m[r.outboundOrderNo] = r; return m
  }, {})

  const combinedRecords = useMemo(() => {
    const records = [...allWmsRecords]
    const seen = new Set(records.map(r => r.outboundOrderNo))
    
    trackingList.forEach(tr => {
      if (!seen.has(tr.outbound_order_no)) {
        if (tr.status && tr.status !== 'pending_assignment') {
          records.push({
            outboundOrderNo: tr.outbound_order_no,
            customerName: '—',
            receiverName: '—',
            outboundTime: tr.updated_at,
            outboundBoxCount: tr.total_expected,
            _fromTracking: true
          })
        }
      }
    })
    return records
  }, [allWmsRecords, trackingList])

  const destinationOptions = useMemo(() => (
    allWmsRecords.length > 0
      ? Array.from(new Set(
          allWmsRecords
            .map((record) => record.receiverName || '')
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'es'))
      : []
  ), [allWmsRecords])

  const customerOptions = useMemo(() => (
    allWmsRecords.length > 0
      ? Array.from(new Set(
          allWmsRecords
            .map((record) => record.customerCode || record.customerNo || record.customerName || '')
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'es'))
      : []
  ), [allWmsRecords])

  const q = search.trim().toLowerCase()

  function matchesDateFilter(dateStr) {
    if (!dateStr) return true
    const d = toDateKey(dateStr)
    if (dateFrom && d < dateFrom) return false
    if (dateTo   && d > dateTo)   return false
    return true
  }

  function applyFilters() {
    setSearch(searchInput.trim())
    setFilterStatus(statusDraft)
    setFilterClient(clientDraft)
    setFilterSurtidor(surtidorDraft)
    setFilterDestination(destinationDraft.trim())
    setTimeFrom(timeFromDraft)
    setTimeTo(timeToDraft)
    setPage(1)
    localStorage.setItem(timeFilterKey, JSON.stringify({ timeFrom: timeFromDraft, timeTo: timeToDraft }))
    if (destinationDraft.trim()) {
      sessionStorage.setItem(destinationFilterKey, destinationDraft.trim())
    } else {
      sessionStorage.removeItem(destinationFilterKey)
    }
  }

  function applyDateFilters(nextDateFrom = dateFromDraft, nextDateTo = dateToDraft) {
    setDateFrom(nextDateFrom)
    setDateTo(nextDateTo)
    setPage(1)
  }

  function applyTimeFilters(nextTimeFrom = timeFromDraft, nextTimeTo = timeToDraft) {
    setTimeFrom(nextTimeFrom)
    setTimeTo(nextTimeTo)
    setPage(1)
    localStorage.setItem(timeFilterKey, JSON.stringify({ timeFrom: nextTimeFrom, timeTo: nextTimeTo }))
  }

  const destinationQuery = filterDestination.trim().toLowerCase()

  const filteredWms = combinedRecords.filter(r => {
    const tracking = trackingMap[r.outboundOrderNo]
    const currentStatus = tracking?.status || 'pending_assignment'

    // Calculate effective completion
    const scanned = Number(tracking?.total_scanned ?? 0)
    const expected = Number(r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? tracking?.total_expected ?? 0)
    const is100Percent = expected > 0 && scanned >= expected
    const isExplicitlyComplete = currentStatus === 'complete'
    const isCompleted = is100Percent || isExplicitlyComplete

    if (filterStatus) {
      if (filterStatus === 'complete') {
        // Show only if it is completed (100% or explicit complete)
        if (!isCompleted) return false
      } else if (filterStatus === 'validating') {
        // Validando tab: show if (status is validating OR has scans) AND is NOT completed
        const hasScans = scanned > 0
        if (isCompleted) return false
        if (currentStatus !== 'validating' && !hasScans) return false
      } else if (filterStatus === 'sorting' || filterStatus === 'pending_assignment') {
        // Sorting/Pending: show if status matches AND it has NO scans AND is NOT completed
        if (isCompleted || scanned > 0) return false
        if (currentStatus !== filterStatus) return false
      } else {
        // For 'partial' or 'cancelled', we show them even if 100% (though partial shouldn't be 100%)
        if (currentStatus !== filterStatus) return false
      }
    }

    if (filterClient && (r.customerCode || r.customerNo || r.customerName || '') !== filterClient) return false
    if (filterSurtidor && tracking?.surtidor_nombre !== filterSurtidor) return false
    if (destinationQuery && !(r.receiverName || '').toLowerCase().includes(destinationQuery)) return false
    
    // Ignore date filter if searching by OBC/Code or using bulk filter
    const skipDateFilter = q || bulkSearchCodes.length > 0
    if (!skipDateFilter && !matchesDateFilter(getFilterDateValue(r))) return false
    
    if (!withinTimeRange(r.outboundTime || r.expectedTime || r.orderCreateTime, timeFrom, timeTo)) return false
    if (bulkSearchCodes.length > 0 && !bulkSearchCodes.includes(r.outboundOrderNo)) return false
    if (q) {
      const haystack = [r.outboundOrderNo, r.customerCode, r.thirdOrderNo, r.receiverName, r.logisticsChannel].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const filteredValidacion = trackingList.filter(tr => {
    if (filterStatus && tr.status !== filterStatus) return false
    const wms = wmsMap[tr.outbound_order_no]
    if (filterClient && (wms?.customerCode || wms?.customerNo || wms?.customerName || '') !== filterClient) return false
    if (filterSurtidor && tr.surtidor_nombre !== filterSurtidor) return false
    if (destinationQuery && !(wms?.receiverName || '').toLowerCase().includes(destinationQuery)) return false
    
    // Ignore date filter if searching by OBC/Code or using bulk filter
    const skipDateFilter = q || bulkSearchCodes.length > 0
    if (!skipDateFilter && !matchesDateFilter(getFilterDateValue(wms) || tr.updated_at)) return false
    
    if (!withinTimeRange(wms?.outboundTime || wms?.expectedTime || wms?.orderCreateTime, timeFrom, timeTo)) return false
    if (bulkSearchCodes.length > 0 && !bulkSearchCodes.includes(tr.outbound_order_no)) return false
    if (q) {
      const haystack = [tr.outbound_order_no, tr.surtidor_nombre, wms?.customerCode, wms?.thirdOrderNo, wms?.receiverName].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const activeRecords = filteredWms
  const total       = activeRecords.length
  const totalPages  = Math.ceil(total / pageSize) || 1
  const pagedRecords = activeRecords.slice((page - 1) * pageSize, page * pageSize)

  const assignMut = useMutation({
    mutationFn: ({ obc, surtidorId }) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      ...(!surtidorId ? { status: 'pending_assignment' } : {}),
    }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      qc.invalidateQueries({ queryKey: ['surtido-order-tracking-obc', vars.obc] })
      toast.success(t('common.save') + ' OK')
    },
    onError: () => toast.error(t('toast.error')),
  })

  const quickEditMut = useMutation({
    mutationFn: ({ obc, surtidorId, status, notes }) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      status,
      notes,
    }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      qc.invalidateQueries({ queryKey: ['surtido-order-tracking-obc', vars.obc] })
      toast.success(t('common.save') + ' OK')
    },
    onError: () => toast.error(t('toast.error')),
  })

  const bulkAssignMut = useMutation({
    mutationFn: ({ obcs, surtidorId }) => bulkUpsertOrderTracking({
      obcs,
      surtidor_id: surtidorId,
      ...(!surtidorId ? { status: 'pending_assignment' } : {}),
    }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      toast.success(`${vars.obcs.length} ordenes actualizadas`)
    },
    onError: () => toast.error(t('toast.error')),
  })

  const statusMut = useMutation({
    mutationFn: ({ obcs, status }) => bulkUpsertOrderTracking({ obcs, status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      if (vars.obcs.length > 1) toast.success(`${vars.obcs.length} ${t('surtido.ordenes.item_label')} actualizadas`)
    },
    onError: () => toast.error(t('toast.error')),
  })

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setClientDraft('')
    setFilterClient('')
    setSurtidorDraft('')
    setFilterSurtidor('')
    setDestinationDraft('')
    setFilterDestination('')
    const today = getToday()
    setAutoDateAnchor(today)
    setDateToDraft(today)
    setDateTo(today)
    const baseDate = subtractDays(today, 30)
    setDateFromDraft(baseDate)
    setDateFrom(baseDate)
    setTimeFromDraft('')
    setTimeToDraft('')
    setTimeFrom('')
    setTimeTo('')
    setBulkSearchText('')
    setBulkSearchCodes([])
    localStorage.removeItem(timeFilterKey)
    sessionStorage.removeItem(destinationFilterKey)
  }

  const hasFilters =
    filterClient ||
    filterSurtidor ||
    filterDestination ||
    search ||
    timeFrom ||
    timeTo ||
    bulkSearchCodes.length > 0

  function buildWmsRows(records) {
    return records.map(r => {
      const tr = trackingMap[r.outboundOrderNo] ?? {}
      return [
        r.outboundOrderNo || '',
        r.customerCode || r.customerName || '',
        r.receiverName || '',
        r.logisticsChannel || '',
        r.thirdOrderNo || r.referenceNo || '',
        r.logisticsTrackNo || r.trackingNo || '',
        r.outboundBoxCount ?? r.packageCount ?? '',
        tr.total_scanned ?? 0,
        r.outboundTime || '',
        tr.surtidor_nombre || '',
        tr.status || 'pending_assignment',
        r.orderCreateTime || '',
      ]
    })
  }

  function buildValidacionRows(records) {
    return records.map(tr => {
      const wms = wmsMap[tr.outbound_order_no] ?? {}
      return [
        tr.outbound_order_no || '',
        wms.customerCode || wms.customerName || '',
        tr.surtidor_nombre || '',
        wms.outboundTime || '',
        tr.total_scanned ?? 0,
        tr.total_expected ?? '',
        tr.status || '',
        tr.updated_at || '',
      ]
    })
  }

  const WMS_HEADERS = [
    'OBC',
    t('surtido.ordenes.cliente'),
    t('surtido.ordenes.detail.destination'),
    t('surtido.ordenes.canal'),
    t('surtido.ordenes.referencia'),
    t('surtido.ordenes.detail.tracking'),
    t('surtido.ordenes.cajas'),
    t('surtido.ordenes.validated_qty'),
    t('surtido.ordenes.fecha_entrega'),
    t('surtido.ordenes.surtidor'),
    t('surtido.ordenes.status'),
    t('surtido.ordenes.fecha_creacion'),
  ]
  const VAL_HEADERS = [
    'OBC',
    t('surtido.ordenes.cliente'),
    t('surtido.ordenes.surtidor'),
    t('surtido.ordenes.fecha_entrega'),
    t('surtido.escaneo.scanned'),
    t('surtido.escaneo.expected'),
    t('surtido.ordenes.status'),
    t('config.updated'),
  ]

  function exportSheet(headers, rows, sheetName, filename) {
    try {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, filename)
      toast.success(t('common.export') + ' OK')
    } catch { toast.error(t('toast.error')) }
  }

  function handleExportWmsSelected(obcs) {
    const rows = buildWmsRows(allWmsRecords.filter(r => obcs.includes(r.outboundOrderNo)))
    exportSheet(WMS_HEADERS, rows, 'Órdenes WMS', `ordenes_wms_${getToday()}.xlsx`)
  }

  function handleExportWmsAll() {
    exportSheet(WMS_HEADERS, buildWmsRows(filteredWms), 'Órdenes WMS', `ordenes_wms_${getToday()}.xlsx`)
  }

  function handleExportValSelected(obcs) {
    const rows = buildValidacionRows(filteredValidacion.filter(tr => obcs.includes(tr.outbound_order_no)))
    exportSheet(VAL_HEADERS, rows, 'Validación', `validacion_${getToday()}.xlsx`)
  }

  function handleExportValAll() {
    exportSheet(VAL_HEADERS, buildValidacionRows(filteredValidacion), 'Validación', `validacion_${getToday()}.xlsx`)
  }

  if (wmsLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.ordenes.title')} subtitle={t('nav.surtido_wms')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('surtido.ordenes.title')} subtitle={t('nav.surtido_wms')}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <DataSyncStatus
              records={allWmsRecords.length}
              updatedAt={sheetTs}
              partial={isPartial}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
            {canUpdateOrders && (
              <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => setShowSurtidoresModal(true)}>
                <Users size={14} /> {t('surtido.ordenes.manage_surtidores')}
              </button>
            )}
            {canUpdateOrders && (
              <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => setShowReasonsModal(true)}>
                <ClipboardList size={14} /> {t('surtido.ordenes.manage_motivos')}
              </button>
            )}
          </div>
        }
      />

      {/* Partial data banner */}
      {isPartial && (
        <div className="flex items-center gap-2 px-5 py-1.5 bg-warning-50 border-b border-warning-100 text-warning-700 text-[11px]">
          <Loader2 size={11} className="animate-spin shrink-0" />
          <span>{t('wmshub.partial_loading')}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="sticky top-[3.5rem] z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
              <Clock size={13} className="text-warm-400 shrink-0" />
              <input type="date" value={dateFromDraft}
                onChange={e => {
                  const next = e.target.value
                  setDateFromDraft(next)
                  applyDateFilters(next, dateToDraft)
                }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={dateToDraft}
                onChange={e => {
                  const next = e.target.value
                  setDateToDraft(next)
                  applyDateFilters(dateFromDraft, next)
                }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
            </div>

            <button
              type="button"
              className={`inline-flex h-10 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                showTimeFilters || timeFromDraft || timeToDraft
                  ? 'border-primary-300 bg-primary-50 text-primary-700'
                  : 'border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100'
              }`}
              onClick={() => {
                setShowTimeFilters((prev) => {
                  const next = !prev
                  if (next) {
                    window.setTimeout(() => timeFromInputRef.current?.focus(), 0)
                  }
                  return next
                })
              }}
              title={t('surtido.ordenes.time_filter')}
            >
              <Clock size={14} />
              <span>{t('surtido.ordenes.time_filter')}</span>
            </button>

            <AnimatePresence initial={false}>
              {showTimeFilters && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-2 flex-wrap"
                >
                  <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
                    <input ref={timeFromInputRef} type="time" value={timeFromDraft} onChange={e => {
                      const next = e.target.value
                      setTimeFromDraft(next)
                      applyTimeFilters(next, timeToDraft)
                    }}
                      className="text-xs outline-none bg-transparent text-warm-700 w-[84px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                    <span className="text-warm-300 text-xs">→</span>
                    <input type="time" value={timeToDraft} onChange={e => {
                      const next = e.target.value
                      setTimeToDraft(next)
                      applyTimeFilters(timeFromDraft, next)
                    }}
                      className="text-xs outline-none bg-transparent text-warm-700 w-[84px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                  </div>

                  {[
                    { label: t('surtido.ordenes.time_morning'), from: '06:00', to: '12:00' },
                    { label: t('surtido.ordenes.time_afternoon'), from: '12:00', to: '18:00' },
                    { label: t('surtido.ordenes.time_night'), from: '18:00', to: '23:59' },
                  ].map((preset) => {
                    const isActive = timeFromDraft === preset.from && timeToDraft === preset.to
                    return (
                      <button
                        key={preset.label}
                        className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition-all ${
                          isActive
                            ? 'border-primary-300 bg-primary-50 text-primary-700'
                            : 'border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100'
                        }`}
                        onClick={() => {
                          setTimeFromDraft(preset.from)
                          setTimeToDraft(preset.to)
                          applyTimeFilters(preset.from, preset.to)
                        }}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {bulkSearchCodes.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[11px] font-semibold text-primary-700">
                <ListFilter size={12} /> {bulkSearchCodes.length} {t('surtido.ordenes.bulk_codes')}
                <button type="button" onClick={() => { setBulkSearchText(''); setBulkSearchCodes([]) }}>
                  <X size={12} />
                </button>
              </span>
            )}

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {canCreateValidation && (
                <button
                  className="btn-primary inline-flex items-center gap-2 text-sm py-2 px-4 h-10"
                  onClick={() => navigate('/Surtido/validacion')}
                >
                  <BadgeCheck size={15} />
                  {t('surtido.ordenes.validate_btn')}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
              <select
                className="h-10 min-w-[180px] pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:shadow-sm transition-all cursor-pointer"
                value={clientDraft}
                onChange={e => setClientDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
              >
              <option value="">{t('surtido.ordenes.cliente')} — {t('common.all')}</option>
              {customerOptions.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
            </select>

              <select
                className="h-10 min-w-[180px] pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:shadow-sm transition-all cursor-pointer"
                value={surtidorDraft}
                onChange={e => setSurtidorDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
              >
              <option value="">{t('surtido.ordenes.surtidor')} — {t('common.all')}</option>
              {surtidores.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
            </select>

            <DestinationSearch
              value={destinationDraft}
                onChange={(nextValue) => {
                  setDestinationDraft(nextValue)
                  const normalized = nextValue.trim()
                  if (normalized) {
                    sessionStorage.setItem(destinationFilterKey, normalized)
                  } else {
                    sessionStorage.removeItem(destinationFilterKey)
                  }
                }}
                onEnter={applyFilters}
                options={destinationOptions}
                t={t}
              />

            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[240px] flex-1 transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
              <Search size={13} className="text-warm-400 shrink-0" />
              <input
                type="text"
                className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder={t('surtido.ordenes.search_placeholder')}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
              />
              <button
                type="button"
                className="rounded-lg p-1 text-warm-400 hover:bg-warm-100 hover:text-primary-600"
                onClick={() => setBulkSearchOpen(true)}
                title={t('surtido.ordenes.bulk_search_title')}
              >
                <ListFilter size={14} />
              </button>
            </div>

            {hasFilters && (
              <button
                className="inline-flex items-center gap-1 h-10 px-3 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                onClick={clearFilters}
              >
                <X className="w-3 h-3" /> {t('common.clear')}
              </button>
            )}

            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-100 px-4 text-xs font-semibold text-violet-700 hover:bg-violet-200"
              onClick={applyFilters}
            >
              <Filter size={13} /> {t('common.apply')}
            </button>
          </div>
        </div>
      </div>

      <div className="sticky top-[8.7rem] z-[4] bg-white/70 backdrop-blur-2xl border-b border-warm-100/40 px-6">
        <StatusTabs selected={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1) }} t={t} />
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {pagedRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-warm-400">
            <Package2 size={40} className="opacity-30" />
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        ) : (
          <WmsTable
            records={pagedRecords} trackingMap={trackingMap} surtidores={surtidores}
            onAssign={r => setAssignTarget(r)}
            onBulkAssign={(obcs, surtidorId) => bulkAssignMut.mutate({ obcs, surtidorId })}
            onView={obc => navigate(`/Surtido/ordenes/${encodeURIComponent(obc)}`)}
            onQuickEdit={obc => setQuickEditObc(obc)}
            onValidate={obc => navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`)}
            onBulkStatus={(obcs, status) => statusMut.mutate({ obcs, status })}
            onExportSelected={handleExportWmsSelected}
            onExportAll={handleExportWmsAll}
            canAssign={canUpdateOrders}
            canQuickEdit={canUpdateOrders}
            canValidate={canCreateValidation}
            canExport={canExportOrders}
            t={t}
            page={page} totalPages={totalPages} pageSize={pageSize} total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
            showScannedColumn={filterStatus !== '' && filterStatus !== 'pending_assignment'}
          />
        )}
      </div>

      <SurtidoresModal
        isOpen={showSurtidoresModal}
        onClose={() => setShowSurtidoresModal(false)}
        canUpdate={canUpdateOrders}
        canDelete={canDeleteOrders}
      />

      <ManualReasonsModal
        isOpen={showReasonsModal}
        onClose={() => setShowReasonsModal(false)}
        canUpdate={canUpdateOrders}
        canDelete={canDeleteOrders}
      />

      <BulkSearchModal
        isOpen={bulkSearchOpen}
        onClose={() => setBulkSearchOpen(false)}
        initialValue={bulkSearchText}
        onApply={(value, codes) => {
          setBulkSearchText(value)
          setBulkSearchCodes(codes)
          setPage(1)
        }}
      />

      <AssignModal
        isOpen={!!assignTarget} order={assignTarget}
        onClose={() => setAssignTarget(null)}
        onAssign={(surtidorId) => {
          if (!assignTarget) return
          assignMut.mutate({ obc: assignTarget.outboundOrderNo || assignTarget.outbound_order_no, surtidorId })
        }}
      />

      <QuickEditPanel
        obc={quickEditObc}
        wmsRecord={wmsMap[quickEditObc]}
        tracking={trackingMap[quickEditObc]}
        surtidores={surtidores}
        isOpen={!!quickEditObc}
        onClose={() => setQuickEditObc(null)}
        onSave={({ surtidorId, canChangeSurtidor, status, notes }) => {
          if (!quickEditObc) return
          quickEditMut.mutate({ obc: quickEditObc, surtidorId: canChangeSurtidor ? surtidorId : undefined, status, notes })
        }}
        isSaving={quickEditMut.isPending}
        t={t}
      />
    </div>
  )
}

function WmsTable({ records, trackingMap, surtidores, onAssign, onBulkAssign, onView, onQuickEdit, onValidate, onBulkStatus, onExportSelected, onExportAll, canAssign, canQuickEdit, canValidate, canExport, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange, showScannedColumn = true }) {
  const [selected, setSelected] = useState(new Set())
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [bulkSurtidorId, setBulkSurtidorId] = useState('')
  const [bulkStatus, setBulkStatus] = useState('sorting')
  const [sortKey, setSortKey] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
  useEffect(() => { setSelected(new Set()) }, [page])

  const sortedRecords = useMemo(() => {
    const next = [...records]
    const sorters = {
      obc: (r) => r.outboundOrderNo,
      date: (r) => r.outboundTime || r.expectedTime || r.orderCreateTime,
      client: (r) => r.customerCode || r.customerNo || r.customerName,
      receiver: (r) => r.receiverName,
      channel: (r) => r.logisticsChannel,
      reference: (r) => r.thirdOrderNo || r.referenceNo,
      cajas: (r) => Number(r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? 0),
      scanned: (r) => trackingMap[r.outboundOrderNo]?.total_scanned || 0,
      surtidor: (r) => trackingMap[r.outboundOrderNo]?.surtidor_nombre,
      status: (r) => trackingMap[r.outboundOrderNo]?.status || 'pending_assignment',
    }
    const sorter = sorters[sortKey] || sorters.date
    next.sort((a, b) => sortByDirection(sorter(a), sorter(b), sortDirection))
    return next
  }, [records, trackingMap, sortKey, sortDirection])

  const handleSort = (key) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDir) => (currentDir === 'asc' ? 'desc' : 'asc'))
        return currentKey
      }
      setSortDirection(key === 'date' ? 'desc' : 'asc')
      return key
    })
  }

  const allChecked = sortedRecords.length > 0 && sortedRecords.every(r => selected.has(r.outboundOrderNo))
  const someChecked = selected.size > 0
  const selectedRecords = sortedRecords.filter(r => selected.has(r.outboundOrderNo))
  const assignableSelected = selectedRecords.filter(r => !CLOSED_ORDER_STATUSES.has(trackingMap[r.outboundOrderNo]?.status || 'pending_assignment'))
  const assignableSelectedObcs = assignableSelected.map(r => r.outboundOrderNo)
  const statusEditableSelectedObcs = assignableSelectedObcs
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allChecked) sortedRecords.forEach(r => next.delete(r.outboundOrderNo))
    else sortedRecords.forEach(r => next.add(r.outboundOrderNo))
    return next
  })
  const toggleRow = (obc) => setSelected(prev => {
    const next = new Set(prev)
    next.has(obc) ? next.delete(obc) : next.add(obc)
    return next
  })

  return (
    <motion.div className="card overflow-hidden table-shell h-full"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

      {someChecked && (canExport || canAssign || canQuickEdit) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100">
          <span className="text-xs text-primary-700 font-semibold tabular-nums">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          {canAssign && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => setBulkAssignOpen(true)}
              disabled={assignableSelectedObcs.length === 0}>
              <UserCheck size={12} /> Asignar
            </button>
          )}
          {canQuickEdit && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-primary-700 border border-primary-200 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => setBulkStatusOpen(true)}
              disabled={statusEditableSelectedObcs.length === 0}>
              <ClipboardList size={12} /> Estado
            </button>
          )}
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors"
            onClick={() => { onExportSelected([...selected]); setSelected(new Set()) }}>
            <Download size={12} /> {t('common.export')} ({selected.size})
          </button>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-success-700 border border-success-200 hover:bg-success-50 transition-colors"
            onClick={onExportAll}>
            <Download size={12} /> {t('common.export')} {t('common.all')}
          </button>
          <button
            className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors ml-auto"
            onClick={() => setSelected(new Set())}>
            <X className="w-3 h-3" /> {t('common.clear')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto table-scroll">
        <table className="w-full text-sm">
          <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
            <tr>
              <th className={`${TH_CLASS} w-8`}>
                <input type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                  onChange={toggleAll}
                  className="rounded border-warm-300 text-primary-600 cursor-pointer"
                  onClick={e => e.stopPropagation()} />
              </th>
              <th className={TH_CLASS}>
                <SortableHeader label="OBC" sortKey="obc" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} hidden xl:table-cell col-date`}>
                <SortableHeader label={t('surtido.ordenes.fecha_entrega')} sortKey="date" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} hidden lg:table-cell`}>
                <SortableHeader label={t('surtido.ordenes.cliente')} sortKey="client" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} hidden xl:table-cell`}>
                <SortableHeader label={t('surtido.ordenes.receiver')} sortKey="receiver" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} hidden xl:table-cell`}>
                <SortableHeader label={t('surtido.ordenes.canal')} sortKey="channel" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} hidden 2xl:table-cell`}>
                <SortableHeader label={t('surtido.ordenes.referencia')} sortKey="reference" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} text-right`}>
                <SortableHeader label={t('surtido.ordenes.cajas')} sortKey="cajas" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              {showScannedColumn && (
                <th className={`${TH_CLASS} text-right`}>
                  <SortableHeader label={t('surtido.ordenes.validated_qty')} sortKey="scanned" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
                </th>
              )}
              <th className={`${TH_CLASS} col-name`}>
                <SortableHeader label={t('surtido.ordenes.surtidor')} sortKey="surtidor" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} col-status`}>
                <SortableHeader label={t('surtido.ordenes.status')} sortKey="status" currentKey={sortKey} direction={sortDirection} onSort={handleSort} textClassName={TH_TEXT} />
              </th>
              <th className={`${TH_CLASS} col-actions text-right`}><span className={TH_TEXT}>Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {sortedRecords.map((r, i) => {
              const obc = r.outboundOrderNo
              const tracking = trackingMap[obc]
              
              const scanned = Number(tracking?.total_scanned ?? 0)
              const expected = Number(r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? tracking?.total_expected ?? 0)
              const is100Percent = expected > 0 && scanned >= expected
              
              const rawStatus = tracking?.status || 'pending_assignment'
              const displayStatus = (is100Percent && rawStatus !== 'complete' && rawStatus !== 'partial' && rawStatus !== 'cancelled') ? 'complete' : rawStatus
              const meta = STATUS_META[displayStatus] ?? STATUS_META.pending_assignment
              
              const status = rawStatus
              const noSurtidor = !tracking?.surtidor_nombre
              const isClosedOrder = CLOSED_ORDER_STATUSES.has(displayStatus)
              const cliente = r.customerCode || r.customerNo || r.customerName || '—'
              const destino = r.receiverName || '—'
              const canal = r.logisticsChannel || '—'
              const referencia = r.thirdOrderNo || r.referenceNo || '—'
              const cajas = r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? '—'
              const isChecked = selected.has(obc)
              return (
                <tr key={obc || i}
                  onClick={() => onView(obc)}
                  className={`transition-colors cursor-pointer hover:bg-primary-50/30 ${isChecked ? 'bg-primary-50/20' : noSurtidor ? 'bg-warning-50/20' : ''}`}>

                  <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRow(obc)}
                      className="rounded border-warm-300 text-primary-600 cursor-pointer"
                      onClick={e => e.stopPropagation()} />
                  </td>

                  <td className="table-cell col-code"><CopyableObc obc={obc} /></td>

                  <td className="table-cell hidden xl:table-cell col-date">
                    <div className="leading-none" title={r.outboundTime ? formatDateTimeTz(r.outboundTime) : '—'}>
                      <span className="block text-xs text-warm-700">{r.outboundTime ? formatDateTz(r.outboundTime) : '—'}</span>
                      <span className="mt-1 block text-[10px] text-warm-400">{r.outboundTime ? fmtTimeShort(r.outboundTime) : ''}</span>
                    </div>
                  </td>

                  <td className="table-cell hidden lg:table-cell col-name">
                    <span className="block truncate font-mono text-xs font-semibold text-primary-700" title={cliente}>{cliente}</span>
                  </td>

                  <td className="table-cell hidden xl:table-cell col-name">
                    <span className="text-warm-600 text-xs flex items-center gap-1">
                      <MapPin size={10} className="text-warm-300" />
                      <span className="block max-w-[160px] truncate" title={destino}>{destino}</span>
                    </span>
                  </td>

                  <td className="table-cell hidden xl:table-cell col-name">
                    <span className="text-warm-600 text-xs flex items-center gap-1">
                      <Truck size={10} className="text-warm-300" />
                      <span className="block max-w-[120px] truncate" title={canal}>{canal}</span>
                    </span>
                  </td>

                  <td className="table-cell hidden 2xl:table-cell col-name">
                    <span className="block truncate font-mono text-xs text-warm-600" title={referencia}>{referencia}</span>
                  </td>

                  <td className="table-cell text-right">
                    <span className="font-semibold text-warm-700">{cajas}</span>
                  </td>

                  {showScannedColumn && (
                    <td className="table-cell">
                      {(() => {
                        const pct = expected > 0
                          ? Math.min(100, Math.round((scanned / expected) * 100))
                          : (scanned > 0 ? 100 : 0)

                        return (
                          <div className="flex items-center justify-end gap-2 min-w-[88px]">
                            <span className="font-semibold text-success-700 tabular-nums leading-none min-w-[1.25rem] text-right">
                              {scanned}
                            </span>
                            {scanned > 0 && (
                              <div
                                className="h-2 w-20 overflow-hidden rounded-full bg-success-100/80 shadow-inner"
                                title={`${scanned}/${expected || '—'}`}
                              >
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-success-400 to-success-500 transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                  )}

                  <td className="table-cell col-name">
                    {canAssign && !isClosedOrder ? (
                      <button
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all hover:shadow-sm ${
                          noSurtidor
                            ? 'border-warning-300 text-warning-700 bg-warning-50 hover:border-warning-400'
                            : 'border-warm-200 text-warm-700 hover:border-primary-300 hover:text-primary-700'
                        }`}
                        onClick={e => { e.stopPropagation(); onAssign(r) }}>
                        <UserCheck size={11} />
                        <span className="max-w-[110px] truncate" title={tracking?.surtidor_nombre || t('surtido.ordenes.no_surtidor')}>
                          {tracking?.surtidor_nombre || t('surtido.ordenes.no_surtidor')}
                        </span>
                        <ChevronDown size={9} />
                      </button>
                    ) : (
                      <span className="text-warm-600 text-xs">{tracking?.surtidor_nombre || '—'}</span>
                    )}
                  </td>

                  <td className="table-cell">
                    <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                  </td>

                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title={t('admin.view')}
                        className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                        onClick={e => { e.stopPropagation(); onView(obc) }}>
                        <Eye size={13} />
                      </button>
                      {canQuickEdit && (
                        <button title="Edición rápida"
                          className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onQuickEdit(obc) }}>
                          <ClipboardList size={13} />
                        </button>
                      )}
                      {canValidate && !isClosedOrder && (
                        <button title={t('surtido.ordenes.validate_btn')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 hover:text-primary-800 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onValidate(obc) }}>
                          <ScanBarcode size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page} totalPages={totalPages} pageSize={pageSize} totalItems={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel={t('surtido.ordenes.item_label')}
      />
      <Modal
        isOpen={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        title={t('surtido.ordenes.bulk_assign_title')}
        icon={UserCheck}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setBulkAssignOpen(false)}>{t('common.cancel')}</button>
              <button
                className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
                onClick={() => {
                  onBulkAssign(assignableSelectedObcs, bulkSurtidorId ? Number(bulkSurtidorId) : null)
                  setSelected(new Set())
                  setBulkAssignOpen(false)
                }}
                disabled={assignableSelectedObcs.length === 0}
              >
              {t('common.apply')}
              </button>
            </div>
          }
        >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">{assignableSelectedObcs.length} {t('surtido.ordenes.bulk_affected')}</p>
          {assignableSelectedObcs.length < selected.size && (
            <p className="text-xs text-warning-600">Las órdenes completadas o parciales no permiten cambio de surtidor.</p>
          )}
          <select className="input-field w-full text-sm" value={bulkSurtidorId} onChange={(e) => setBulkSurtidorId(e.target.value)}>
            <option value="">{t('surtido.ordenes.no_surtidor')}</option>
            {surtidores.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
          </select>
        </div>
      </Modal>
      <Modal
        isOpen={bulkStatusOpen}
        onClose={() => setBulkStatusOpen(false)}
        title={t('surtido.ordenes.bulk_status_title')}
        icon={ClipboardList}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setBulkStatusOpen(false)}>{t('common.cancel')}</button>
            <button
              className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
              onClick={() => {
                onBulkStatus(statusEditableSelectedObcs, bulkStatus)
                setSelected(new Set())
                setBulkStatusOpen(false)
              }}
              disabled={statusEditableSelectedObcs.length === 0}
            >
              {t('common.apply')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">{statusEditableSelectedObcs.length} {t('surtido.ordenes.bulk_affected')}</p>
          {statusEditableSelectedObcs.length < selected.size && (
            <p className="text-xs text-warning-600">Las órdenes completadas o parciales no permiten cambio de estatus.</p>
          )}
          <select className="input-field w-full text-sm" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_FILTER_KEYS.map((key) => <option key={key} value={key}>{t(STATUS_META[key].labelKey)}</option>)}
          </select>
        </div>
      </Modal>
    </motion.div>
  )
}

function ValidacionTable({ records, wmsMap, surtidores, onView, onQuickEdit, onValidate, onStatusChange, onBulkAssign, onExportSelected, onExportAll, canQuickEdit, canValidate, canUpdateStatus, canExport, canAssign, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  const [selected, setSelected] = useState(new Set())
  const [editStatusObc, setEditStatusObc] = useState(null)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [bulkSurtidorId, setBulkSurtidorId] = useState('')
  const [bulkStatus, setBulkStatus] = useState('sorting')

  useEffect(() => { setSelected(new Set()) }, [page])

  const allChecked = records.length > 0 && records.every(r => selected.has(r.outbound_order_no))
  const someChecked = selected.size > 0

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) records.forEach(r => next.delete(r.outbound_order_no))
      else records.forEach(r => next.add(r.outbound_order_no))
      return next
    })
  }

  const toggleRow = (obc) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(obc)) next.delete(obc); else next.add(obc)
      return next
    })
  }

  return (
    <motion.div className="card overflow-hidden table-shell h-full"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

      {someChecked && (canUpdateStatus || canExport || canAssign) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100">
          <span className="text-xs text-primary-700 font-semibold tabular-nums">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          {canAssign && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
              onClick={() => setBulkAssignOpen(true)}>
              <UserCheck size={12} /> Asignar
            </button>
          )}
          {canUpdateStatus && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
              onClick={() => setBulkStatusOpen(true)}>
              <ScanBarcode size={12} /> Estado
            </button>
          )}
          {canExport && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors"
              onClick={() => { onExportSelected([...selected]); setSelected(new Set()) }}>
              <Download size={12} /> {t('common.export')} ({selected.size})
            </button>
          )}
          {canExport && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-success-700 border border-success-200 hover:bg-success-50 transition-colors"
              onClick={onExportAll}>
              <Download size={12} /> {t('common.export')} {t('common.all')}
            </button>
          )}
          <button
            className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700 transition-colors ml-auto"
            onClick={() => setSelected(new Set())}>
            <X className="w-3 h-3" /> {t('common.clear')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto table-scroll">
        <table className="w-full text-sm">
          <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
            <tr>
              <th className={`${TH_CLASS} w-8`}>
                <input type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                  onChange={toggleAll}
                  className="rounded border-warm-300 text-primary-600 cursor-pointer"
                  onClick={e => e.stopPropagation()} />
              </th>
              <th className={TH_CLASS}><span className={TH_TEXT}>OBC</span></th>
              <th className={`${TH_CLASS} hidden lg:table-cell col-date`}><span className={TH_TEXT}>{t('surtido.ordenes.fecha_entrega')}</span></th>
              <th className={`${TH_CLASS} hidden lg:table-cell`}><span className={TH_TEXT}>{t('surtido.ordenes.cliente')}</span></th>
              <th className={`${TH_CLASS} col-name`}><span className={TH_TEXT}>{t('surtido.ordenes.surtidor')}</span></th>
              <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('surtido.escaneo.scanned')}</span></th>
              <th className={`${TH_CLASS} col-status`}><span className={TH_TEXT}>{t('surtido.ordenes.status')}</span></th>
              <th className={`${TH_CLASS} col-actions text-right`}><span className={TH_TEXT}>Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {records.map((tr, i) => {
              const obc = tr.outbound_order_no
              const wms = wmsMap[obc]
              const status = tr.status || 'pending_assignment'
              const meta = STATUS_META[status] ?? STATUS_META.pending_assignment
              const total_expected = wms?.outboundBoxCount ?? wms?.packageCount ?? wms?.totalQty ?? tr.total_expected ?? '?'
              const scanned = tr.total_scanned ?? 0
              const pct = total_expected !== '?' && total_expected > 0
                ? Math.min(100, Math.round((scanned / total_expected) * 100))
                : null
              const isChecked = selected.has(obc)
              const isEditingStatus = editStatusObc === obc

              return (
                <tr key={obc || i}
                  onClick={() => onView(obc)}
                  className={`transition-colors cursor-pointer hover:bg-primary-50/30 ${isChecked ? 'bg-primary-50/20' : ''}`}>

                  <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRow(obc)}
                      className="rounded border-warm-300 text-primary-600 cursor-pointer"
                      onClick={e => e.stopPropagation()} />
                  </td>

                  <td className="table-cell col-code"><CopyableObc obc={obc} /></td>
                  <td className="table-cell hidden lg:table-cell col-date">
                    <div className="leading-none" title={wms?.outboundTime ? formatDateTimeTz(wms.outboundTime) : '—'}>
                      <span className="block text-xs text-warm-700">{wms?.outboundTime ? formatDateTz(wms.outboundTime) : '—'}</span>
                      <span className="mt-1 block text-[10px] text-warm-400">{wms?.outboundTime ? fmtTimeShort(wms.outboundTime) : ''}</span>
                    </div>
                  </td>
                  <td className="table-cell hidden lg:table-cell col-name">
                    <span className="block truncate font-mono text-xs font-semibold text-primary-700" title={wms?.customerCode || wms?.customerName || '—'}>
                      {wms?.customerCode || wms?.customerName || '—'}
                    </span>
                  </td>
                  <td className="table-cell col-name">
                    <span className="text-warm-700 text-xs flex items-center gap-1">
                      <User size={10} className="text-warm-300" />
                      {tr.surtidor_nombre || '—'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-semibold text-warm-700 tabular-nums">{scanned}/{total_expected}</span>
                      {pct !== null && (
                        <div className="w-16 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? 'bg-success-500' : 'bg-primary-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    {canUpdateStatus && isEditingStatus ? (
                      <select
                        autoFocus
                        defaultValue={status}
                        onChange={e => { onStatusChange([obc], e.target.value); setEditStatusObc(null) }}
                        onBlur={() => setEditStatusObc(null)}
                        className="text-xs rounded-lg border border-primary-300 outline-none focus:border-primary-500 px-1.5 py-1 text-warm-700 bg-white">
                        {STATUS_FILTER_KEYS.map(k => (
                          <option key={k} value={k}>{t(STATUS_META[k].labelKey)}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1.5 group/statusEdit">
                        <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                        {canUpdateStatus && (
                          <button
                            title="Editar estado"
                            onClick={e => { e.stopPropagation(); setEditStatusObc(obc) }}
                            className="opacity-0 group-hover/statusEdit:opacity-100 p-0.5 rounded text-warm-300 hover:text-warm-600 transition-all">
                            <Pencil size={10} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title={t('admin.view')}
                        className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                        onClick={e => { e.stopPropagation(); onView(obc) }}>
                        <Eye size={13} />
                      </button>
                      {canQuickEdit && (
                        <button title="Edición rápida"
                          className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onQuickEdit(obc) }}>
                          <ClipboardList size={13} />
                        </button>
                      )}
                      {canValidate && status !== 'complete' && (
                        <button title={t('surtido.ordenes.validate_btn')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 hover:text-primary-800 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                          onClick={e => { e.stopPropagation(); onValidate(obc) }}>
                          <ScanBarcode size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page} totalPages={totalPages} pageSize={pageSize} totalItems={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel={t('surtido.ordenes.item_label')}
      />
      <Modal
        isOpen={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        title={t('surtido.ordenes.bulk_assign_title')}
        icon={UserCheck}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setBulkAssignOpen(false)}>{t('common.cancel')}</button>
            <button
              className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
              onClick={() => { onBulkAssign([...selected], bulkSurtidorId ? Number(bulkSurtidorId) : null); setSelected(new Set()); setBulkAssignOpen(false) }}
            >
              {t('common.apply')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">{selected.size} {t('surtido.ordenes.bulk_affected')}</p>
          <select className="input-field w-full text-sm" value={bulkSurtidorId} onChange={(e) => setBulkSurtidorId(e.target.value)}>
            <option value="">{t('surtido.ordenes.no_surtidor')}</option>
            {surtidores.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
          </select>
        </div>
      </Modal>
      <Modal
        isOpen={bulkStatusOpen}
        onClose={() => setBulkStatusOpen(false)}
        title={t('surtido.ordenes.bulk_status_title')}
        icon={ClipboardList}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setBulkStatusOpen(false)}>{t('common.cancel')}</button>
            <button
              className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap"
              onClick={() => { onStatusChange([...selected], bulkStatus); setSelected(new Set()); setBulkStatusOpen(false) }}
            >
              {t('common.apply')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">{selected.size} {t('surtido.ordenes.bulk_affected')}</p>
          <select className="input-field w-full text-sm" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_FILTER_KEYS.map((key) => <option key={key} value={key}>{t(STATUS_META[key].labelKey)}</option>)}
          </select>
        </div>
      </Modal>
    </motion.div>
  )
}
