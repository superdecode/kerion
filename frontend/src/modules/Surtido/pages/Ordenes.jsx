import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  Search, UserCheck, Users, Plus, Trash2, X, ChevronDown, Play, Loader2,
  Package2, Truck, ScanBarcode, Copy, Check, Eye, ClipboardList,
  User, Clock, BarChart3, RefreshCw, Database, CheckCircle2,
  MapPin, Timer, XCircle, AlertCircle, Edit3, BadgeCheck, Download,
  ListFilter, Filter, CalendarClock, Save, ArrowUpDown, ArrowUp, ArrowDown, ShieldAlert, Printer,
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
  getOutboundList, getOutboundDetail,
  getSurtidores, createSurtidor, deleteSurtidor,
  getOrderTracking, upsertOrderTracking, bulkUpsertOrderTracking, getScanSessions, getScanSession,
  getManualEntryReasons, createManualEntryReason, updateManualEntryReason, deleteManualEntryReason,
  forceValidateOrder,
  bulkForceValidateOrders,
  getRecords,
} from '../services/surtidoService'
import api from '../../../core/services/api'
import { getBoxStock } from '../../Inventario/services/inventarioService'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import PrintSurtidoUbicaciones from '../components/PrintSurtidoUbicaciones'
import ModuleLimitBanner from '../../../core/components/common/ModuleLimitBanner'
import { useModuleUsage } from '../../../core/hooks/useModuleUsage'
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

const STATUS_ORDER = { pending_assignment: 0, sorting: 1, validating: 2, complete: 3, partial: 4, cancelled: 5 }
const STATUS_FILTER_KEYS = ['pending_assignment', 'sorting', 'validating', 'complete', 'partial', 'cancelled']
const CLOSED_ORDER_STATUSES = new Set(['complete', 'partial'])
const TH_CLASS = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'

function getStatusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.pending_assignment
}
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

function MultiSelect({ value, onChange, options, placeholder, t }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedCount = value.length
  const label = selectedCount === 0
    ? `${placeholder} — ${t('common.all')}`
    : selectedCount === 1
    ? (options.find(o => o.value === value[0])?.label || value[0])
    : `${placeholder} (${selectedCount})`

  const toggle = (val) => onChange(
    value.includes(val) ? value.filter(v => v !== val) : [...value, val]
  )

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className={`relative h-10 min-w-[180px] pl-3 pr-8 rounded-xl border text-sm text-left outline-none transition-all ${
          open ? 'border-primary-400 ring-2 ring-primary-100' : 'border-warm-200 hover:border-warm-300'
        } ${selectedCount > 0 ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-warm-50 text-warm-700'}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="block truncate pr-2 text-sm">{label}</span>
        <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-[60] min-w-full bg-white rounded-xl border border-warm-200 shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto scrollbar-thin">
            {options.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-warm-700 hover:bg-warm-50 cursor-pointer"
                onMouseDown={e => { e.preventDefault(); toggle(opt.value) }}
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt.value)}
                  readOnly
                  className="cb pointer-events-none"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
          {value.length > 0 && (
            <div className="border-t border-warm-100 px-3 py-2">
              <button
                type="button"
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
                onMouseDown={e => { e.preventDefault(); onChange([]); setOpen(false) }}
              >
                {t('common.clear')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
  const backendOnline = useAuthStore(s => s.backendOnline)

  const { data } = useQuery({ queryKey: ['wms-surtidores'], queryFn: getSurtidores, staleTime: 5 * 60 * 1000, enabled: backendOnline })
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
                    <Edit3 size={14} />
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
  const backendOnline = useAuthStore(s => s.backendOnline)
  const { data } = useQuery({ queryKey: ['wms-surtidores'], queryFn: getSurtidores, staleTime: 5 * 60 * 1000, enabled: backendOnline })
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

function PanelObcCopy({ obc }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="group flex items-center gap-1.5 min-w-0 text-left"
      onClick={() => obc && navigator.clipboard.writeText(obc).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
    >
      <span className="code-main truncate">{obc || '—'}</span>
      <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? <Check size={12} className="text-success-600" /> : <Copy size={12} className="text-warm-400" />}
      </span>
    </button>
  )
}

function QuickEditPanel({ obc, wmsRecord, tracking, surtidores, isOpen, onClose, onSave, isSaving, onForceValidate, t }) {
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
                <PanelObcCopy obc={obc} />
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

              {/* Incidencias summary */}
              {tracking && (() => {
                const hasFaltante    = tracking.tiene_faltantes
                const hasAnormalidad = tracking.tiene_anormalidades
                const hasReparacion  = tracking.tiene_reparacion
                const hasRastreo     = tracking.tiene_rastreo
                const tieneIncidencias = hasFaltante || hasAnormalidad || hasReparacion || hasRastreo
                const typeCount = [hasFaltante, hasAnormalidad, hasReparacion, hasRastreo].filter(Boolean).length
                const badgeCls = tieneIncidencias
                  ? (typeCount > 1 ? 'bg-warning-100 text-warning-700 border-warning-200'
                    : hasFaltante    ? 'bg-danger-100 text-danger-700 border-danger-200'
                    : hasAnormalidad ? 'bg-warning-100 text-warning-700 border-warning-200'
                    : hasReparacion  ? 'bg-violet-100 text-violet-700 border-violet-200'
                    : 'bg-sky-100 text-sky-700 border-sky-200')
                  : 'bg-success-100 text-success-700 border-success-200'
                return (
                  <div className="rounded-xl bg-warm-50 border border-warm-100 px-3 py-2.5 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-warm-400 uppercase tracking-wide font-bold">{t('surtido.ordenes.panel.incidencias')}</p>
                    <div className="flex items-center gap-1.5">
                      {tieneIncidencias && (
                        <>
                          {hasFaltante    && <span className="w-1.5 h-1.5 rounded-full bg-danger-500 shrink-0" title={t('surtido.ordenes.box_status.faltante')} />}
                          {hasAnormalidad && <span className="w-1.5 h-1.5 rounded-full bg-warning-500 shrink-0" title={t('surtido.ordenes.box_status.anormalidad')} />}
                          {hasReparacion  && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" title={t('surtido.ordenes.box_status.reparacion')} />}
                          {hasRastreo     && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" title={t('surtido.ordenes.box_status.rastreo')} />}
                        </>
                      )}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeCls}`}>
                        {tieneIncidencias ? t('surtido.ordenes.panel.incidencias_si') : t('surtido.ordenes.panel.incidencias_no')}
                      </span>
                    </div>
                  </div>
                )
              })()}

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
                <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wider">{t('surtido.ordenes.panel.nota')}</p>
                <textarea
                  rows={3}
                  value={localNotes}
                  onChange={e => setLocalNotes(e.target.value)}
                  placeholder={t('surtido.ordenes.panel.nota_placeholder')}
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
                    <BadgeCheck size={14} className="text-success-600" /> {t('surtido.ordenes.panel.ver_validacion')}
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
              {onForceValidate && (
                <button
                  onClick={() => onForceValidate(obc)}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold border border-danger-200 text-danger-600 hover:bg-danger-50 hover:border-danger-300 transition-colors"
                >
                  <ShieldAlert size={13} /> {t('surtido.ordenes.bulk.force_close_title')}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

const SESSION_STATUS = {
  complete:           { cls: 'bg-success-100 text-success-700',  labelKey: 'surtido.ordenes.session_status.complete' },
  with_discrepancies: { cls: 'bg-warning-100 text-warning-700',  labelKey: 'surtido.ordenes.session_status.with_discrepancies' },
  validating:         { cls: 'bg-primary-100 text-primary-700',  labelKey: 'surtido.ordenes.session_status.validating' },
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
            {showResult && <th className="table-header">{t('surtido.ordenes.events.type')}</th>}
            <th className="table-header text-right">{t('surtido.ordenes.events.scan_time')}</th>
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
  const backendOnline = useAuthStore(s => s.backendOnline)
  const { data: moduleUsage } = useModuleUsage()
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
  const [clientDraft, setClientDraft] = useState([])
  const [filterClient, setFilterClient] = useState([])
  const [surtidorDraft, setSurtidorDraft] = useState([])
  const [filterSurtidor, setFilterSurtidor] = useState([])
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
  const [forceValidateTarget, setForceValidateTarget] = useState(null)
  const [forceReason, setForceReason] = useState('')
  const [bulkForceCloseObcs, setBulkForceCloseObcs] = useState(null)
  const [bulkForceReason, setBulkForceReason] = useState('')
  const [bulkSearchOpen, setBulkSearchOpen] = useState(false)
  const [bulkSearchText, setBulkSearchText] = useState('')
  const [bulkSearchCodes, setBulkSearchCodes] = useState([])
  const [isTransitioning, setIsTransitioning] = useState(false)
  const timeFromInputRef = useRef(null)

  const handleStatusChange = (newStatus) => {
    setIsTransitioning(true)
    setFilterStatus(newStatus)
    setPage(1)
    setTimeout(() => setIsTransitioning(false), 300)
  }

  const [refreshing, setRefreshing] = useState(false)
  const [exportingDetailed, setExportingDetailed] = useState(false)
  const [printData, setPrintData] = useState(null)
  const [printLoading, setPrintLoading] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [sheetTs, setSheetTs] = useState(() => getCacheTimestamp('outbound'))
  const timeFilterKey = `kirion_surtido_ordenes_time_${user?.id || 'guest'}`
  const destinationFilterKey = `kirion_surtido_destination_${user?.id || 'guest'}`
  const filtersKey = `kirion_surtido_ordenes_filters_${user?.id || 'guest'}`

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(filtersKey) || 'null')
      if (saved) {
        if (saved.search !== undefined) { setSearchInput(saved.search); setSearch(saved.search) }
        if (saved.filterStatus !== undefined) setFilterStatus(saved.filterStatus)
        if (saved.filterClient !== undefined) {
          const v = Array.isArray(saved.filterClient) ? saved.filterClient : (saved.filterClient ? [saved.filterClient] : [])
          setClientDraft(v); setFilterClient(v)
        }
        if (saved.filterSurtidor !== undefined) {
          const v = Array.isArray(saved.filterSurtidor) ? saved.filterSurtidor : (saved.filterSurtidor ? [saved.filterSurtidor] : [])
          setSurtidorDraft(v); setFilterSurtidor(v)
        }
        if (saved.filterDestination !== undefined) { setDestinationDraft(saved.filterDestination); setFilterDestination(saved.filterDestination) }
        if (saved.dateFrom) { setDateFromDraft(saved.dateFrom); setDateFrom(saved.dateFrom) }
        if (saved.dateTo) { setDateToDraft(saved.dateTo); setDateTo(saved.dateTo) }
        if (saved.timeFrom || saved.timeTo) {
          setTimeFromDraft(saved.timeFrom || ''); setTimeFrom(saved.timeFrom || '')
          setTimeToDraft(saved.timeTo || ''); setTimeTo(saved.timeTo || '')
          setShowTimeFilters(true)
        }
        return
      }
      // legacy fallback
      const legacyTime = JSON.parse(localStorage.getItem(timeFilterKey) || 'null')
      if (legacyTime) {
        setTimeFromDraft(legacyTime.timeFrom || ''); setTimeToDraft(legacyTime.timeTo || '')
        setTimeFrom(legacyTime.timeFrom || ''); setTimeTo(legacyTime.timeTo || '')
        if (legacyTime.timeFrom || legacyTime.timeTo) setShowTimeFilters(true)
      }
      const legacyDest = sessionStorage.getItem(destinationFilterKey) || ''
      if (legacyDest) {
        const d = legacyDest.trim()
        setDestinationDraft(d); setFilterDestination(d)
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      sessionStorage.setItem(filtersKey, JSON.stringify({
        search, filterStatus, filterClient, filterSurtidor, filterDestination,
        dateFrom, dateTo, timeFrom, timeTo,
      }))
    } catch {}
  }, [filtersKey, search, filterStatus, filterClient, filterSurtidor, filterDestination, dateFrom, dateTo, timeFrom, timeTo])

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
    refetchOnWindowFocus: false,
    retry: 0,
    enabled: backendOnline,
  })

  const { data: trackingData } = useQuery({
    queryKey: ['wms-order-tracking'],
    queryFn: getOrderTracking,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
    enabled: backendOnline,
  })

  const { data: surtidoresData } = useQuery({
    queryKey: ['wms-surtidores'],
    queryFn: getSurtidores,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: 0,
    enabled: backendOnline,
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

  const trackingMap = useMemo(() =>
    trackingList.reduce((m, tr) => { m[tr.outbound_order_no] = tr; return m }, {}),
    [trackingList]
  )

  const wmsMap = useMemo(() =>
    allWmsRecords.reduce((m, r) => { m[r.outboundOrderNo] = r; return m }, {}),
    [allWmsRecords]
  )

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

  const filteredWms = useMemo(() => combinedRecords.filter(r => {
    const tracking = trackingMap[r.outboundOrderNo]
    const currentStatus = tracking?.status || 'pending_assignment'

    const scanned = Number(tracking?.total_scanned ?? 0)
    const expected = Number(r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? tracking?.total_expected ?? 0)
    const is100Percent = expected > 0 && scanned >= expected
    const isExplicitlyComplete = currentStatus === 'complete'
    const isCompleted = is100Percent || isExplicitlyComplete

    if (filterStatus) {
      if (filterStatus === 'complete') {
        if (!isCompleted) return false
      } else if (filterStatus === 'validating') {
        const hasScans = scanned > 0
        if (isCompleted) return false
        if (currentStatus !== 'validating' && !hasScans) return false
      } else if (filterStatus === 'sorting' || filterStatus === 'pending_assignment') {
        if (isCompleted || scanned > 0) return false
        if (currentStatus !== filterStatus) return false
      } else {
        if (currentStatus !== filterStatus) return false
      }
    }

    if (filterClient.length > 0 && !filterClient.includes(r.customerCode || r.customerNo || r.customerName || '')) return false
    if (filterSurtidor.length > 0) {
      const matchesUnassigned = filterSurtidor.includes('__unassigned__') && !tracking?.surtidor_nombre
      const matchesNamed = filterSurtidor.some(v => v !== '__unassigned__' && v === tracking?.surtidor_nombre)
      if (!matchesUnassigned && !matchesNamed) return false
    }
    if (destinationQuery && !(r.receiverName || '').toLowerCase().includes(destinationQuery)) return false

    const skipDateFilter = q || bulkSearchCodes.length > 0
    if (!skipDateFilter && !matchesDateFilter(getFilterDateValue(r))) return false

    if (!withinTimeRange(r.outboundTime || r.expectedTime || r.orderCreateTime, timeFrom, timeTo)) return false
    if (bulkSearchCodes.length > 0 && !bulkSearchCodes.includes(r.outboundOrderNo)) return false
    if (q) {
      const haystack = [r.outboundOrderNo, r.customerCode, r.thirdOrderNo, r.receiverName, r.logisticsChannel].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [combinedRecords, trackingMap, filterStatus, filterClient, filterSurtidor, destinationQuery, q, bulkSearchCodes, dateFrom, dateTo, timeFrom, timeTo])

  const filteredValidacion = useMemo(() => trackingList.filter(tr => {
    if (filterStatus && tr.status !== filterStatus) return false
    const wms = wmsMap[tr.outbound_order_no]
    if (filterClient.length > 0 && !filterClient.includes(wms?.customerCode || wms?.customerNo || wms?.customerName || '')) return false
    if (filterSurtidor.length > 0) {
      const matchesUnassigned = filterSurtidor.includes('__unassigned__') && !tr.surtidor_nombre
      const matchesNamed = filterSurtidor.some(v => v !== '__unassigned__' && v === tr.surtidor_nombre)
      if (!matchesUnassigned && !matchesNamed) return false
    }
    if (destinationQuery && !(wms?.receiverName || '').toLowerCase().includes(destinationQuery)) return false

    const skipDateFilter = q || bulkSearchCodes.length > 0
    if (!skipDateFilter && !matchesDateFilter(getFilterDateValue(wms) || tr.updated_at)) return false

    if (!withinTimeRange(wms?.outboundTime || wms?.expectedTime || wms?.orderCreateTime, timeFrom, timeTo)) return false
    if (bulkSearchCodes.length > 0 && !bulkSearchCodes.includes(tr.outbound_order_no)) return false
    if (q) {
      const haystack = [tr.outbound_order_no, tr.surtidor_nombre, wms?.customerCode, wms?.thirdOrderNo, wms?.receiverName].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trackingList, wmsMap, filterStatus, filterClient, filterSurtidor, destinationQuery, q, bulkSearchCodes, dateFrom, dateTo, timeFrom, timeTo])

  const activeRecords = filteredWms
  const total       = activeRecords.length
  const totalPages  = Math.ceil(total / pageSize) || 1
  const pagedRecords = useMemo(() =>
    activeRecords.slice((page - 1) * pageSize, page * pageSize),
    [activeRecords, page, pageSize]
  )

  function patchTrackingCache(updated) {
    if (!updated) return
    qc.setQueryData(['wms-order-tracking'], (old) => {
      if (!old?.data) return old
      const idx = old.data.findIndex(r => r.outbound_order_no === updated.outbound_order_no)
      if (idx === -1) return { ...old, data: [updated, ...old.data] }
      const next = [...old.data]
      next[idx] = { ...next[idx], ...updated }
      return { ...old, data: next }
    })
  }

  const assignMut = useMutation({
    mutationFn: ({ obc, surtidorId }) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      ...(!surtidorId ? { status: 'pending_assignment' } : {}),
    }),
    onMutate: ({ obc, surtidorId }) => {
      const prev = qc.getQueryData(['wms-order-tracking'])
      const s = surtidores.find(x => x.id === surtidorId || x.id === Number(surtidorId))
      patchTrackingCache({
        outbound_order_no: obc,
        surtidor_id: surtidorId || null,
        surtidor_nombre: s?.nombre || null,
        ...(surtidorId ? {} : { status: 'pending_assignment' }),
      })
      return { prev }
    },
    onSuccess: (data, vars) => {
      patchTrackingCache(data?.data)
      qc.invalidateQueries({ queryKey: ['surtido-order-tracking-obc', vars.obc] })
      toast.success(t('common.save') + ' OK')
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['wms-order-tracking'], context.prev)
      toast.error(t('toast.error'))
    },
  })

  const quickEditMut = useMutation({
    mutationFn: ({ obc, surtidorId, status, notes }) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      status,
      notes,
    }),
    onSuccess: (data, vars) => {
      patchTrackingCache(data?.data)
      qc.invalidateQueries({ queryKey: ['surtido-order-tracking-obc', vars.obc] })
      toast.success(t('common.save') + ' OK')
    },
    onError: () => toast.error(t('toast.error')),
  })

  const forceValidateMut = useMutation({
    mutationFn: ({ obc, reason }) => forceValidateOrder(obc, { reason }),
    onSuccess: (data) => {
      patchTrackingCache(data?.data)
      setForceValidateTarget(null)
      setForceReason('')
      setQuickEditObc(null)
      toast.success('Orden cerrada forzosamente')
    },
    onError: (err) => toast.error(err?.response?.data?.error || t('toast.error')),
  })

  const bulkForceCloseMut = useMutation({
    mutationFn: ({ obcs, reason }) => bulkForceValidateOrders({ obcs, reason }),
    onMutate: ({ obcs }) => {
      const prev = qc.getQueryData(['wms-order-tracking'])
      const obcSet = new Set(obcs)
      qc.setQueryData(['wms-order-tracking'], (old) => {
        if (!old?.data) return old
        return { ...old, data: old.data.map(r => obcSet.has(r.outbound_order_no) ? { ...r, status: 'complete' } : r) }
      })
      return { prev }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      setBulkForceCloseObcs(null)
      setBulkForceReason('')
      toast.success(`${data?.count ?? 0} orden(es) cerrada(s) forzosamente`)
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['wms-order-tracking'], context.prev)
      toast.error(err?.response?.data?.error || t('toast.error'))
    },
  })

  const bulkAssignMut = useMutation({
    mutationFn: ({ obcs, surtidorId }) => bulkUpsertOrderTracking({
      obcs,
      surtidor_id: surtidorId,
      ...(!surtidorId ? { status: 'pending_assignment' } : {}),
    }),
    onMutate: ({ obcs, surtidorId }) => {
      const prev = qc.getQueryData(['wms-order-tracking'])
      const s = surtidores.find(x => x.id === surtidorId || x.id === Number(surtidorId))
      const updateMap = new Map(obcs.map(obc => [obc, { surtidor_id: surtidorId || null, surtidor_nombre: s?.nombre || null }]))
      qc.setQueryData(['wms-order-tracking'], (old) => {
        if (!old?.data) return old
        return {
          ...old,
          data: old.data.map(r =>
            updateMap.has(r.outbound_order_no) ? { ...r, ...updateMap.get(r.outbound_order_no) } : r
          ),
        }
      })
      return { prev }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      toast.success(`${vars.obcs.length} ordenes actualizadas`)
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['wms-order-tracking'], context.prev)
      toast.error(t('toast.error'))
    },
  })

  const statusMut = useMutation({
    mutationFn: ({ obcs, status }) => bulkUpsertOrderTracking({ obcs, status }),
    onMutate: ({ obcs, status }) => {
      const prev = qc.getQueryData(['wms-order-tracking'])
      const obcSet = new Set(obcs)
      qc.setQueryData(['wms-order-tracking'], (old) => {
        if (!old?.data) return old
        return { ...old, data: old.data.map(r => obcSet.has(r.outbound_order_no) ? { ...r, status } : r) }
      })
      return { prev }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
      if (vars.obcs.length > 1) toast.success(`${vars.obcs.length} ${t('surtido.ordenes.item_label')} actualizadas`)
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['wms-order-tracking'], context.prev)
      toast.error(t('toast.error'))
    },
  })

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setClientDraft([])
    setFilterClient([])
    setSurtidorDraft([])
    setFilterSurtidor([])
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
    sessionStorage.removeItem(filtersKey)
  }

  const hasFilters =
    filterClient.length > 0 ||
    filterSurtidor.length > 0 ||
    filterDestination ||
    search ||
    timeFrom ||
    timeTo ||
    bulkSearchCodes.length > 0

  function deduplicateByKey(arr, key) {
    const seen = new Map()
    for (const item of arr) {
      const k = item[key]
      if (!k) continue
      if (!seen.has(k) || (item.updated_at || '') > (seen.get(k).updated_at || '')) seen.set(k, item)
    }
    return Array.from(seen.values())
  }

  function buildWmsRows(records) {
    const deduped = deduplicateByKey(records, 'outboundOrderNo')
    return deduped.map(r => {
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
        t(getStatusMeta(tr.status || 'pending_assignment').labelKey),
        r.orderCreateTime || '',
      ]
    })
  }

  function buildValidacionRows(records) {
    const deduped = deduplicateByKey(records, 'outbound_order_no')
    return deduped.map(tr => {
      const wms = wmsMap[tr.outbound_order_no] ?? {}
      return [
        tr.outbound_order_no || '',
        wms.customerCode || wms.customerName || '',
        tr.surtidor_nombre || '',
        wms.outboundTime || '',
        tr.total_scanned ?? 0,
        tr.total_expected ?? '',
        t(getStatusMeta(tr.status || 'pending_assignment').labelKey),
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

  async function handleExportDetailed() {
    if (filteredValidacion.length === 0) return
    setExportingDetailed(true)
    try {
      const obcSet = new Set(filteredValidacion.map(tr => tr.outbound_order_no).filter(Boolean))
      const sessionsData = await getScanSessions({ pageSize: 5000 })
      const sessions = getRecords(sessionsData).filter(s => obcSet.has(s.outbound_order_no))
      const details = await Promise.all(sessions.map(s => getScanSession(s.id)))
      const HEADERS = ['OBC', 'Operador', 'Tiempo escaneo', 'Código caja', 'Ubicación', 'Resultado', 'Notas sesión']
      const rows = []
      for (const detail of details) {
        const sess = detail?.data?.session ?? {}
        const events = detail?.data?.events ?? []
        for (const e of events) {
          rows.push([
            sess.outbound_order_no || '',
            sess.operator_nombre || '',
            e.scanned_at ? formatDateTimeTz(e.scanned_at) : '',
            e.scanned_code || '',
            e.cell_no || '',
            e.scan_result || '',
            sess.notes || '',
          ])
        }
      }
      exportSheet(HEADERS, rows, 'Detalle Validación', `val_detalle_${getToday()}.xlsx`)
    } catch { toast.error(t('toast.error')) }
    setExportingDetailed(false)
  }

  async function handlePrintUbicaciones(obcs) {
    if (!obcs.length) return
    setPrintModalOpen(true)
    setPrintLoading(true)
    try {
      // Step 1: fetch order details + inventory sheet in parallel
      let detailResults, stockResult
      try {
        ;[detailResults, stockResult] = await Promise.all([
          Promise.all(obcs.map(obc => getOutboundDetail(obc))),
          getBoxStock(),
        ])
      } catch (err) {
        const isConfig = err?.code === 'SHEET_NOT_CONFIGURED'
        toast.error(isConfig
          ? t('surtido.ordenes.print_ub.err_config')
          : t('surtido.ordenes.print_ub.err_sheets'))
        setPrintModalOpen(false)
        return
      }

      // Step 2: collect box codes per order (normalised the same way the scan module does)
      const codeToOrders = {}   // normalisedKey → Set<obc>
      const rawCodeMap = {}     // normalisedKey → originalCode (for display)
      detailResults.forEach((res, i) => {
        const obc = obcs[i]
        const pkgs = res?.data?.packageList || []
        pkgs.forEach(pkg => {
          const raw = (pkg.customizeCode || '').trim()
          if (!raw) return
          const key = normalizeCodeFast(raw)
          if (!key) return
          if (!codeToOrders[key]) { codeToOrders[key] = new Set(); rawCodeMap[key] = raw }
          codeToOrders[key].add(obc)
        })
      })

      if (Object.keys(codeToOrders).length === 0) {
        toast.error(t('surtido.ordenes.print_ub.err_no_boxes'))
        setPrintModalOpen(false)
        return
      }

      // Step 3: build location map from inventory sheet (same codes as outbound, direct match)
      const stockRecords = stockResult?.data?.records || []
      const stockMap = {}
      stockRecords.forEach(item => {
        const loc = (item.cellNo || '').trim()
        if (!loc) return
        const k = normalizeCodeFast(item.customizeBarcode || '')
        if (k) stockMap[k] = loc
      })

      // Step 4: consolidate per-location groups
      const grupos = {}
      const obcsSinUbicacion = new Set()
      let totalCajas = 0
      for (const [key, orders] of Object.entries(codeToOrders)) {
        const location = stockMap[key] || 'SIN UBICACIÓN'
        if (!grupos[location]) grupos[location] = { location, cantCajas: 0, orders: new Set() }
        grupos[location].cantCajas += orders.size
        for (const obc of orders) {
          grupos[location].orders.add(obc)
          if (!stockMap[key]) obcsSinUbicacion.add(obc)
        }
        totalCajas += orders.size
      }

      const gruposArr = Object.values(grupos).map(g => ({
        location: g.location,
        cantCajas: g.cantCajas,
        cantOrdenes: g.orders.size,
      }))

      if (gruposArr.every(g => g.location === 'SIN UBICACIÓN')) {
        toast.warning(t('surtido.ordenes.print_ub.warn_no_loc'))
      }

      setPrintData({
        grupos: gruposArr,
        totalUbicaciones: gruposArr.filter(g => g.location !== 'SIN UBICACIÓN').length,
        totalCajas,
        totalOrdenes: obcs.length,
        obcsSinUbicacion: [...obcsSinUbicacion].sort(),
        generatedAt: new Date(),
        userName: user?.nombre_completo || user?.email || '',
        dateFrom,
        dateTo,
        filterClient,
        filterSurtidor,
        filterDestination,
        timeFrom,
        timeTo,
      })
    } catch (err) {
      console.error('[handlePrintUbicaciones]', err)
      toast.error(t('surtido.ordenes.print_ub.err_unexpected'))
      setPrintModalOpen(false)
    } finally {
      setPrintLoading(false)
    }
  }

  function handleExportUbicaciones() {
    if (!printData) return
    try {
      const headers = ['#', 'Ubicación', 'Cant. Cajas', 'Cant. Órdenes']
      const rows = [...printData.grupos]
        .sort((a, b) => {
          if (a.location === 'SIN UBICACIÓN') return 1
          if (b.location === 'SIN UBICACIÓN') return -1
          return a.location.localeCompare(b.location, 'es')
        })
        .map((g, i) => [i + 1, g.location, g.cantCajas, g.cantOrdenes])
      const summaryRow = ['', 'TOTAL', printData.totalCajas, printData.totalOrdenes]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, [], summaryRow])

      // Column widths
      ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 14 }]

      XLSX.utils.book_append_sheet(wb, ws, 'Ubicaciones')
      const date = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `surtido_ubicaciones_${date}.xlsx`)
      toast.success('Excel exportado')
    } catch {
      toast.error('Error al exportar Excel')
    }
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
      <div className="sticky top-[3.5rem] z-[20] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5">
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
            <MultiSelect
              value={clientDraft}
              onChange={setClientDraft}
              options={customerOptions.map(c => ({ value: c, label: c }))}
              placeholder={t('surtido.ordenes.cliente')}
              t={t}
            />

            <MultiSelect
              value={surtidorDraft}
              onChange={setSurtidorDraft}
              options={[
                { value: '__unassigned__', label: 'Sin asignar' },
                ...surtidores.map(s => ({ value: s.nombre, label: s.nombre }))
              ]}
              placeholder={t('surtido.ordenes.surtidor')}
              t={t}
            />

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
        <StatusTabs selected={filterStatus} onChange={handleStatusChange} t={t} />
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <AnimatePresence mode='wait'>
          {isTransitioning || wmsLoading ? (
             <motion.div
               key="loader"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="relative rounded-2xl overflow-hidden border border-warm-100"
             >
               {/* Skeleton rows */}
               <div className="divide-y divide-warm-100">
                 {Array.from({ length: 8 }).map((_, i) => (
                   <div key={i} className="flex items-center gap-4 px-4 py-3 bg-white">
                     <div className="h-3 w-3 rounded-full bg-warm-100 animate-pulse shrink-0" />
                     <div className="h-3 rounded bg-warm-100 animate-pulse" style={{ width: `${40 + (i % 3) * 15}%` }} />
                     <div className="ml-auto h-3 rounded bg-warm-100 animate-pulse w-16 shrink-0" />
                     <div className="h-5 w-16 rounded-full bg-warm-100 animate-pulse shrink-0" />
                     <div className="h-3 rounded bg-warm-100 animate-pulse w-20 shrink-0" />
                   </div>
                 ))}
               </div>
               {/* Spinner overlay */}
               <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
                 <div className="relative flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-primary-50 shadow-glow animate-bounce-soft">
                   <div className="absolute inset-1 rounded-[1.15rem] bg-white/90" />
                   <Loader2 size={20} className="relative z-10 animate-spin text-primary-500" />
                 </div>
                 <p className="text-sm text-warm-500">{t('common.loading')}</p>
               </div>
             </motion.div>
          ) : pagedRecords.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-64 gap-3 text-warm-400">
              <Package2 size={40} className="opacity-30" />
              <p className="text-sm">{t('common.noData')}</p>
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <WmsTable
                records={pagedRecords} allFilteredObcs={activeRecords.map(r => r.outboundOrderNo)} trackingMap={trackingMap} surtidores={surtidores}
                onBulkForceClose={user?.rol_nombre === 'Administrador' ? (obcs) => { setBulkForceCloseObcs(obcs); setBulkForceReason('') } : undefined}
                onAssign={r => setAssignTarget(r)}
                onBulkAssign={(obcs, surtidorId) => bulkAssignMut.mutate({ obcs, surtidorId })}
                onView={obc => navigate(`/Surtido/ordenes/${encodeURIComponent(obc)}`)}
                onQuickEdit={obc => setQuickEditObc(obc)}
                onValidate={obc => navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`)}
                onBulkStatus={(obcs, status) => statusMut.mutate({ obcs, status })}
                onExportSelected={handleExportWmsSelected}
                onExportAll={handleExportWmsAll}
                onExportDetailed={handleExportDetailed}
                exportingDetailed={exportingDetailed}
                onPrintUbicaciones={handlePrintUbicaciones}
                printLoading={printLoading}
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
            </motion.div>
          )}
        </AnimatePresence>
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
        onForceValidate={user?.rol_nombre === 'Administrador' ? (obc) => { setForceValidateTarget(obc); setForceReason('') } : undefined}
        t={t}
      />

      {printModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!printLoading) { setPrintModalOpen(false); setPrintData(null) } }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <Printer size={18} className="text-sky-600" />
                <span className="font-semibold text-warm-900">{t('surtido.ordenes.print_ub.title')}</span>
              </div>
              {!printLoading && (
                <button onClick={() => { setPrintModalOpen(false); setPrintData(null) }} className="text-warm-400 hover:text-warm-600 transition-colors">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {printLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 size={40} className="animate-spin text-sky-400" />
                  <p className="text-sm text-warm-500">{t('surtido.ordenes.print_ub.loading')}</p>
                </div>
              ) : printData ? (
                <>
                  <PrintSurtidoUbicaciones data={printData} />
                  {printData.obcsSinUbicacion?.length > 0 && (
                    <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white">
                        <AlertCircle size={15} className="flex-shrink-0" />
                        <span className="font-semibold text-sm">
                          {printData.obcsSinUbicacion.length} {printData.obcsSinUbicacion.length === 1 ? 'orden sin' : 'órdenes sin'} ubicación registrada
                        </span>
                        <span className="ml-auto text-blue-200 text-xs font-normal">Solo visible en pantalla — no se imprime</span>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-xs text-blue-700 mb-2">Las siguientes órdenes tienen cajas sin ubicación en el inventario actual:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {printData.obcsSinUbicacion.map(obc => (
                            <span key={obc} className="font-mono text-xs bg-white border border-blue-200 text-blue-800 rounded px-2 py-0.5 font-semibold">
                              {obc}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            {printData && !printLoading && (
              <div className="px-6 py-4 border-t border-warm-100 flex justify-end gap-3 flex-shrink-0">
                <button
                  className="btn-success inline-flex items-center gap-2"
                  onClick={handleExportUbicaciones}
                >
                  <Download size={14} /> {t('surtido.ordenes.print_ub.btn_export')}
                </button>
                <button className="btn-primary inline-flex items-center gap-2" onClick={() => {
                  const el = document.getElementById('print-surtido-ubicaciones')
                  if (!el) return
                  const win = window.open('', '_blank', 'width=900,height=700')
                  win.document.write(`<!DOCTYPE html><html><head><title>Surtido por Ubicaciones</title>
                    <style>
                      *{box-sizing:border-box}
                      body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;margin:0;padding:16px}
                      @page{size:A4 portrait;margin:12mm 14mm}
                      table{width:100%;border-collapse:collapse;page-break-inside:auto}
                      tr{page-break-inside:avoid;page-break-after:auto}
                      thead{display:table-header-group}
                    </style>
                  </head><body>${el.outerHTML}</body></html>`)
                  win.document.close()
                  win.focus()
                  setTimeout(() => { win.print(); win.close() }, 300)
                }}>
                  <Printer size={14} /> {t('surtido.ordenes.print_ub.btn_print')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={!!forceValidateTarget}
        onClose={() => { setForceValidateTarget(null); setForceReason('') }}
        title={t('surtido.ordenes.bulk.force_close_title')}
        icon={ShieldAlert}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => { setForceValidateTarget(null); setForceReason('') }}>{t('common.cancel')}</button>
            <button
              className="btn-danger"
              disabled={!forceReason.trim() || forceValidateMut.isPending}
              onClick={() => forceValidateMut.mutate({ obc: forceValidateTarget, reason: forceReason })}
            >
              {forceValidateMut.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {t('surtido.ordenes.bulk.force_close_btn')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">
            Se marcará la orden <span className="font-mono font-semibold text-warm-900">{forceValidateTarget}</span> como <span className="font-semibold text-success-700">Completa</span>. Esta acción queda registrada en el historial de la orden.
          </p>
          <div>
            <label className="block text-xs font-semibold text-warm-700 mb-1">{t('surtido.ordenes.bulk.force_close_reason')}</label>
            <textarea
              className="input-field text-sm w-full h-20 resize-none"
              placeholder={t('surtido.ordenes.bulk.force_close_placeholder')}
              value={forceReason}
              onChange={e => setForceReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!bulkForceCloseObcs}
        onClose={() => { setBulkForceCloseObcs(null); setBulkForceReason('') }}
        title={t('surtido.ordenes.bulk.force_close_title')}
        icon={ShieldAlert}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => { setBulkForceCloseObcs(null); setBulkForceReason('') }}>{t('common.cancel')}</button>
            <button
              className="btn-danger"
              disabled={!bulkForceReason.trim() || bulkForceCloseMut.isPending}
              onClick={() => bulkForceCloseMut.mutate({ obcs: bulkForceCloseObcs, reason: bulkForceReason })}
            >
              {bulkForceCloseMut.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {t('surtido.ordenes.bulk.force_close_btn')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-600">
            {t('surtido.ordenes.bulk.force_close_body').replace('{n}', bulkForceCloseObcs?.length ?? 0)}
          </p>
          <div className="max-h-32 overflow-y-auto rounded-lg bg-warm-50 border border-warm-100 px-3 py-2 space-y-0.5">
            {bulkForceCloseObcs?.map(obc => (
              <p key={obc} className="font-mono text-xs text-warm-700">{obc}</p>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-700 mb-1">{t('surtido.ordenes.bulk.force_close_reason')}</label>
            <textarea
              className="input-field text-sm w-full h-20 resize-none"
              placeholder={t('surtido.ordenes.bulk.force_close_placeholder')}
              value={bulkForceReason}
              onChange={e => setBulkForceReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

const WmsRow = memo(function WmsRow({ r, tracking, isChecked, onToggle, onView, onAssign, onQuickEdit, onValidate, canAssign, canQuickEdit, canValidate, t, showScannedColumn }) {
  const obc = r.outboundOrderNo
  const scanned = Number(tracking?.total_scanned ?? 0)
  const expected = Number(r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? tracking?.total_expected ?? 0)
  const is100Percent = expected > 0 && scanned >= expected
  const rawStatus = tracking?.status || 'pending_assignment'
  const displayStatus = (is100Percent && rawStatus !== 'complete' && rawStatus !== 'partial' && rawStatus !== 'cancelled') ? 'complete' : rawStatus
  const meta = getStatusMeta(displayStatus)
  const noSurtidor = !tracking?.surtidor_nombre
  const isClosedOrder = CLOSED_ORDER_STATUSES.has(displayStatus)
  const cliente = r.customerCode || r.customerNo || r.customerName || '—'
  const destino = r.receiverName || '—'
  const canal = r.logisticsChannel || '—'
  const referencia = r.thirdOrderNo || r.referenceNo || '—'
  const cajas = r.outboundBoxCount ?? r.packageCount ?? r.packageQty ?? r.totalBoxQty ?? r.totalQty ?? '—'
  const pct = showScannedColumn
    ? (expected > 0 ? Math.min(100, Math.round((scanned / expected) * 100)) : (scanned > 0 ? 100 : 0))
    : 0

  return (
    <tr
      onClick={() => onView(obc)}
      className={`transition-colors cursor-pointer hover:bg-primary-50/50 ${isChecked ? 'bg-primary-50/20' : noSurtidor ? 'bg-warning-50/20' : ''}`}>

      <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
        <input type="checkbox"
          checked={isChecked}
          onChange={() => onToggle(obc)}
          className="cb"
          onClick={e => e.stopPropagation()} />
      </td>

      <td className="table-cell col-code">
        <div className="flex items-center gap-1.5">
          <CopyableObc obc={obc} />
          {(tracking?.tiene_faltantes || tracking?.tiene_anormalidades || tracking?.tiene_reparacion || tracking?.tiene_rastreo) && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                tracking?.tiene_anormalidades ? 'bg-warning-500' :
                tracking?.tiene_faltantes    ? 'bg-danger-500' :
                tracking?.tiene_reparacion   ? 'bg-violet-500' : 'bg-sky-500'
              }`}
              title={
                tracking?.tiene_anormalidades ? t('surtido.ordenes.indicator.anormalidades') :
                tracking?.tiene_faltantes    ? t('surtido.ordenes.indicator.faltantes') :
                tracking?.tiene_reparacion   ? t('surtido.ordenes.indicator.reparacion') : t('surtido.ordenes.indicator.rastreo')
              }
            />
          )}
        </div>
      </td>

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
            <button title={t('surtido.ordenes.quickEdit')}
              className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
              onClick={e => { e.stopPropagation(); onQuickEdit(obc) }}>
              <ClipboardList size={13} />
            </button>
          )}
          {canValidate && (
            isClosedOrder ? (
              <button title={t('surtido.ordenes.viewRecords')}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-100 border border-transparent transition-all"
                onClick={e => { e.stopPropagation(); onView(obc) }}>
                <Database size={13} />
              </button>
            ) : (
              <button title={t('surtido.ordenes.validate_btn')}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 hover:text-primary-800 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                onClick={e => { e.stopPropagation(); onValidate(obc) }}>
                <ScanBarcode size={13} />
              </button>
            )
          )}
        </div>
      </td>
    </tr>
  )
}, (prev, next) =>
  prev.isChecked === next.isChecked &&
  prev.tracking === next.tracking &&
  prev.r === next.r
)

function WmsTable({ records, allFilteredObcs, trackingMap, surtidores, onAssign, onBulkAssign, onView, onQuickEdit, onValidate, onBulkStatus, onExportSelected, onExportAll, onExportDetailed, exportingDetailed, onPrintUbicaciones, printLoading, onBulkForceClose, canAssign, canQuickEdit, canValidate, canExport, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange, showScannedColumn = true }) {
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
      status: (r) => STATUS_ORDER[trackingMap[r.outboundOrderNo]?.status || 'pending_assignment'] ?? 99,
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
  const allFilteredSelected = allFilteredObcs && selected.size === allFilteredObcs.length && allFilteredObcs.every(obc => selected.has(obc))
  const canSelectAllFiltered = someChecked && allFilteredObcs && !allFilteredSelected
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
  const toggleRow = useCallback((obc) => setSelected(prev => {
    const next = new Set(prev)
    next.has(obc) ? next.delete(obc) : next.add(obc)
    return next
  }), [])

  return (
    <motion.div className="card overflow-hidden table-shell"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

      {someChecked && (canExport || canAssign || canQuickEdit) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100 flex-wrap">
          <span className="text-xs text-primary-700 font-semibold tabular-nums">
            {t('surtido.ordenes.bulk.n_selected').replace('{n}', selected.size)}
            {allFilteredSelected && allFilteredObcs && (
              <span className="ml-1 text-primary-500 font-normal">{t('surtido.ordenes.bulk.all_filter_selected').replace('{n}', allFilteredObcs.length)}</span>
            )}
          </span>
          {canSelectAllFiltered && (
            <button
              className="text-xs text-primary-600 hover:text-primary-800 underline font-semibold transition-colors"
              onClick={() => setSelected(new Set(allFilteredObcs))}>
              {t('surtido.ordenes.bulk.select_all_filter').replace('{n}', allFilteredObcs.length)}
            </button>
          )}
          {canAssign && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => setBulkAssignOpen(true)}
              disabled={assignableSelectedObcs.length === 0}>
              <UserCheck size={12} /> {t('surtido.ordenes.bulk.assign')}
            </button>
          )}
          {canQuickEdit && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-primary-700 border border-primary-200 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => setBulkStatusOpen(true)}
              disabled={statusEditableSelectedObcs.length === 0}>
              <ClipboardList size={12} /> {t('surtido.ordenes.bulk.status')}
            </button>
          )}
          {canExport && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 transition-colors"
              onClick={() => { onExportSelected([...selected]); setSelected(new Set()) }}>
              <Download size={12} /> {t('common.export')} ({selected.size})
            </button>
          )}
          {canExport && onExportDetailed && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-violet-700 border border-violet-200 hover:bg-violet-50 disabled:opacity-50 transition-colors"
              onClick={onExportDetailed}
              disabled={exportingDetailed}
              title={t('surtido.ordenes.bulk.export_detail')}>
              {exportingDetailed ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {t('surtido.ordenes.bulk.export_detail')}
            </button>
          )}
          {onPrintUbicaciones && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-sky-700 border border-sky-200 hover:bg-sky-50 disabled:opacity-50 transition-colors"
              onClick={() => { onPrintUbicaciones([...selected]); setSelected(new Set()) }}
              disabled={printLoading || selected.size === 0}
              title={t('surtido.ordenes.bulk.print_locations')}>
              {printLoading ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
              {t('surtido.ordenes.bulk.print_locations')}
            </button>
          )}
          {onBulkForceClose && (
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-danger-700 border border-danger-200 hover:bg-danger-50 transition-colors"
              onClick={() => { onBulkForceClose([...selected]); setSelected(new Set()) }}
              title={t('surtido.ordenes.bulk.force_close_title')}>
              <ShieldAlert size={12} /> {t('surtido.ordenes.bulk.force_close')}
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
                  className="cb"
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
              <th className={`${TH_CLASS} col-actions text-right`}><span className={TH_TEXT}>{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {sortedRecords.map((r) => (
              <WmsRow
                key={r.outboundOrderNo}
                r={r}
                tracking={trackingMap[r.outboundOrderNo]}
                isChecked={selected.has(r.outboundOrderNo)}
                onToggle={toggleRow}
                onView={onView}
                onAssign={onAssign}
                onQuickEdit={onQuickEdit}
                onValidate={onValidate}
                canAssign={canAssign}
                canQuickEdit={canQuickEdit}
                canValidate={canValidate}
                t={t}
                showScannedColumn={showScannedColumn}
              />
            ))}
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
            <p className="text-xs text-warning-600">{t('surtido.ordenes.bulk.assignDisabledHint')}</p>
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
            <p className="text-xs text-warning-600">{t('surtido.ordenes.bulk.statusDisabledHint')}</p>
          )}
          <select className="input-field w-full text-sm" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_FILTER_KEYS.map((key) => <option key={key} value={key}>{t(STATUS_META[key].labelKey)}</option>)}
          </select>
        </div>
      </Modal>
    </motion.div>
  )
}

function ValidacionTable({ records, allFilteredObcs, wmsMap, surtidores, onView, onQuickEdit, onValidate, onStatusChange, onBulkAssign, onExportSelected, onExportAll, canQuickEdit, canValidate, canUpdateStatus, canExport, canAssign, t, page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  const [selected, setSelected] = useState(new Set())
  const [editStatusObc, setEditStatusObc] = useState(null)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [bulkSurtidorId, setBulkSurtidorId] = useState('')
  const [bulkStatus, setBulkStatus] = useState('sorting')

  useEffect(() => { setSelected(new Set()) }, [page])

  const allChecked = records.length > 0 && records.every(r => selected.has(r.outbound_order_no))
  const someChecked = selected.size > 0
  const allFilteredSelected = allFilteredObcs && selected.size === allFilteredObcs.length && allFilteredObcs.length > 0
  const canSelectAllFiltered = someChecked && allFilteredObcs && !allFilteredSelected

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
    <ModuleLimitBanner module="surtido" usage={moduleUsage?.surtido}>
    <motion.div className="card overflow-hidden table-shell"
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

      {someChecked && (canUpdateStatus || canExport || canAssign) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-50 border-b border-primary-100 flex-wrap">
          <span className="text-xs text-primary-700 font-semibold tabular-nums">
            {t('surtido.ordenes.bulk.n_selected').replace('{n}', selected.size)}
            {allFilteredSelected && allFilteredObcs && (
              <span className="ml-1 text-primary-500 font-normal">{t('surtido.ordenes.bulk.all_filter_selected').replace('{n}', allFilteredObcs.length)}</span>
            )}
          </span>
          {canSelectAllFiltered && (
            <button
              className="text-xs text-primary-600 hover:text-primary-800 underline font-semibold transition-colors"
              onClick={() => setSelected(new Set(allFilteredObcs))}>
              {t('surtido.ordenes.bulk.select_all_filter').replace('{n}', allFilteredObcs.length)}
            </button>
          )}
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
                  className="cb"
                  onClick={e => e.stopPropagation()} />
              </th>
              <th className={TH_CLASS}><span className={TH_TEXT}>OBC</span></th>
              <th className={`${TH_CLASS} hidden lg:table-cell col-date`}><span className={TH_TEXT}>{t('surtido.ordenes.fecha_entrega')}</span></th>
              <th className={`${TH_CLASS} hidden lg:table-cell`}><span className={TH_TEXT}>{t('surtido.ordenes.cliente')}</span></th>
              <th className={`${TH_CLASS} col-name`}><span className={TH_TEXT}>{t('surtido.ordenes.surtidor')}</span></th>
              <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('surtido.escaneo.scanned')}</span></th>
              <th className={`${TH_CLASS} col-status`}><span className={TH_TEXT}>{t('surtido.ordenes.status')}</span></th>
              <th className={`${TH_CLASS} col-actions text-right`}><span className={TH_TEXT}>{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {records.map((tr, i) => {
              const obc = tr.outbound_order_no
              const wms = wmsMap[obc]
              const status = tr.status || 'pending_assignment'
              const meta = getStatusMeta(status)
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
                  className={`transition-colors cursor-pointer hover:bg-primary-50/50 ${isChecked ? 'bg-primary-50/20' : ''}`}>

                  <td className="table-cell w-8" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRow(obc)}
                      className="cb"
                      onClick={e => e.stopPropagation()} />
                  </td>

                  <td className="table-cell col-code">
                    <div className="flex items-center gap-1.5">
                      <CopyableObc obc={obc} />
                      {(tr?.tiene_faltantes || tr?.tiene_anormalidades || tr?.tiene_reparacion || tr?.tiene_rastreo) && (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            tr?.tiene_anormalidades ? 'bg-warning-500' :
                            tr?.tiene_faltantes    ? 'bg-danger-500' :
                            tr?.tiene_reparacion   ? 'bg-violet-500' : 'bg-sky-500'
                          }`}
                          title={
                            tr?.tiene_anormalidades ? t('surtido.ordenes.indicator.anormalidades') :
                            tr?.tiene_faltantes    ? t('surtido.ordenes.indicator.faltantes') :
                            tr?.tiene_reparacion   ? t('surtido.ordenes.indicator.reparacion') : t('surtido.ordenes.indicator.rastreo')
                          }
                        />
                      )}
                    </div>
                  </td>
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
                      {tr.surtidor_nombre || t('surtido.ordenes.no_surtidor')}
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
                            title={t('surtido.ordenes.editStatus')}
                            onClick={e => { e.stopPropagation(); setEditStatusObc(obc) }}
                            className="opacity-0 group-hover/statusEdit:opacity-100 p-0.5 rounded text-warm-300 hover:text-warm-600 transition-all">
                            <Edit3 size={10} />
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
                        <button title={t('surtido.ordenes.quickEdit')}
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
    </ModuleLimitBanner>
  )
}
