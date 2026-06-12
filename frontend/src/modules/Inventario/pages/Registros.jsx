import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  Eye, Trash2, CheckCircle2, AlertTriangle, Ban, X, Package2, Loader2, AlertCircle,
  User, Timer, Clock, ScanBarcode, Boxes, ChevronDown, ChevronUp,
  Search, XCircle, Download, Copy, Check, Edit3, LayoutGrid, MapPin,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { fmtDateTime, getToday, subtractDays, toDateKey } from '../../../core/utils/dateFormat'
import { getTimeBounds } from '../utils/timeBounds'
import {
  getInventorySessions, getInventorySession, deleteInventorySession,
  createInventoryScan, updateInventoryScan, deleteInventoryScan, checkInventoryDuplicates,
} from '../services/inventarioService'
import { generateCodeVariations } from '../../Shared/Wms/normalizeCode'
import QuickCodeSearchModal from '../components/QuickCodeSearchModal'
import InventarioUbicacionesModal from '../../Devoluciones/components/InventarioUbicacionesModal'
import { getUbicacionesAdmin, createUbicacion, updateUbicacion, deleteUbicacion } from '../../WmsHub/services/wmsHubService'

const STATUS_META_KEYS = {
  ok: {
    labelKey: 'inventario.escaneo.group_disponible',
    icon: CheckCircle2,
    bg: 'bg-success-100 text-success-700',
    card: 'border-success-200/80 bg-gradient-to-br from-success-50 via-white to-success-100/70 text-success-700 shadow-[0_16px_32px_-24px_rgba(34,197,94,0.55)]',
    pill: 'border-success-200/90 bg-gradient-to-r from-success-50 via-white to-success-100/75 text-success-700 shadow-[0_10px_22px_-18px_rgba(34,197,94,0.5)]',
  },
  blocked: {
    labelKey: 'inventario.escaneo.group_bloqueado',
    icon: AlertTriangle,
    bg: 'bg-warning-100 text-warning-700',
    card: 'border-warning-200/80 bg-gradient-to-br from-warning-50 via-white to-warning-100/75 text-warning-700 shadow-[0_16px_32px_-24px_rgba(245,158,11,0.5)]',
    pill: 'border-warning-200/90 bg-gradient-to-r from-warning-50 via-white to-warning-100/75 text-warning-700 shadow-[0_10px_22px_-18px_rgba(245,158,11,0.5)]',
  },
  nowms: {
    labelKey: 'inventario.escaneo.group_nowms',
    icon: Ban,
    bg: 'bg-danger-100 text-danger-700',
    card: 'border-danger-200/80 bg-gradient-to-br from-danger-50 via-white to-danger-100/75 text-danger-700 shadow-[0_16px_32px_-24px_rgba(239,68,68,0.5)]',
    pill: 'border-danger-200/90 bg-gradient-to-r from-danger-50 via-white to-danger-100/75 text-danger-700 shadow-[0_10px_22px_-18px_rgba(239,68,68,0.5)]',
  },
}
const TH_CLASS = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'
const DETAIL_TAB_CLASS = 'flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px'

const dateKeyFromTimestamp = (value) => {
  if (!value) return getToday().replace(/-/g, '')
  return toDateKey(value).replace(/-/g, '')
}
const formatSectionCode = (code, fallbackDate) => {
  const clean = String(code || '').trim()
  if (/^SEC-\d{8}M\d{2,}$/.test(clean)) return clean
  if (/^\d{8}M\d{2,}$/.test(clean)) return `SEC-${clean}`
  return `SEC-${dateKeyFromTimestamp(fallbackDate)}M00`
}
const LEGACY_TARIMA_KEYS = new Set(['auto', 'ok', 'blocked', 'nowms'])
const normalizeTarimaGroupKey = (value, sectionCode) => String(value || sectionCode || 'auto').trim()
const formatTarimaCode = (rawCode, sectionCode, index) => {
  const code = String(rawCode || '').trim()
  if (/^TAR-/i.test(code)) return code.replace(/^TAR-/i, 'PAL-')
  if (code && code !== sectionCode && !LEGACY_TARIMA_KEYS.has(code.toLowerCase())) return code
  const dayMatch = String(sectionCode || '').match(/^(?:SEC-)?(\d{8})M\d+$/)
  const dayKey = dayMatch ? dayMatch[1] : dateKeyFromTimestamp()
  return `PAL-${dayKey}-${String(index + 1).padStart(2, '0')}`
}

const buildCodeVariantSet = (...codes) => {
  const variants = new Set()
  codes.filter(Boolean).forEach((code) => {
    generateCodeVariations(code).forEach((variant) => variants.add(variant))
  })
  return variants
}

const scanMatchesDuplicateSet = (scan, variantSet) => {
  const codes = [scan?.normalized_code, scan?.code2].filter(Boolean)
  return codes.some((code) => generateCodeVariations(code).some((variant) => variantSet.has(variant)))
}

function DuplicateConfirmModal({ isOpen, code, conflicts = [], onConfirm, onClose, t }) {
  const sessionConflicts = conflicts.filter((item) => item.source === 'session')
  const dbConflicts = conflicts.filter((item) => item.source === 'database')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('inventario.escaneo.duplicate_title')}
      icon={AlertCircle}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('inventario.escaneo.descartar')}</button>
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
                  <span>{t('inventario.escaneo.duplicate_label_time')}: <strong>{conflict.scanned_at ? fmtDateTime(conflict.scanned_at) : '—'}</strong></span>
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
                  <span>{t('inventario.escaneo.duplicate_label_time')}: <strong>{conflict.scanned_at ? fmtDateTime(conflict.scanned_at) : '—'}</strong></span>
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

function MultiSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const count = value.length
  const label = count === 0
    ? `${placeholder} — Todos`
    : count === 1
    ? (options.find(o => o === value[0]) || value[0])
    : `${placeholder} (${count})`

  const toggle = useCallback((val) => onChange(
    value.includes(val) ? value.filter(v => v !== val) : [...value, val]
  ), [value, onChange])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className={`relative h-10 min-w-[180px] pl-3 pr-8 rounded-xl border text-sm text-left outline-none transition-all ${
          open ? 'border-primary-400 ring-2 ring-primary-100' : 'border-warm-200 hover:border-warm-300'
        } ${count > 0 ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-warm-50 text-warm-700'}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="block truncate pr-2 text-sm">{label}</span>
        <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-[20] min-w-full bg-white rounded-xl border border-warm-200 shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto scrollbar-thin">
            {options.map(opt => (
              <label
                key={opt}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-warm-700 hover:bg-warm-50 cursor-pointer"
                onMouseDown={e => { e.preventDefault(); toggle(opt) }}
              >
                <input type="checkbox" checked={value.includes(opt)} readOnly className="rounded border-warm-300 text-primary-600 pointer-events-none" />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
          {count > 0 && (
            <div className="border-t border-warm-100 px-3 py-2">
              <button type="button" className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
                onMouseDown={e => { e.preventDefault(); onChange([]); setOpen(false) }}>
                Limpiar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailModal({ session, isOpen, onClose, initialTab = 'tarimas', initialReadOnly = true }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { hasPermission } = useAuthStore()
  const [detailTab, setDetailTab] = useState('tarimas')
  const [isReadOnly, setIsReadOnly] = useState(initialReadOnly)
  const [expandedTarimaCode, setExpandedTarimaCode] = useState(null)
  const [editingScanId, setEditingScanId] = useState(null)
  const [editingCode, setEditingCode] = useState('')
  const [newScan, setNewScan] = useState({ scanned_code: '', scan_status: 'ok', group_assignment: 'auto' })
  const [duplicatePending, setDuplicatePending] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['wms-inventory-session', session?.id],
    queryFn: () => getInventorySession(session.id),
    enabled: isOpen && !!session?.id,
    staleTime: 30000,
  })

  const sessionData = data?.data?.session ?? {}
  const scans = data?.data?.scans ?? []
  const isClasificacion = (sessionData.scan_type ?? session?.scan_type) === 'clasificacion'
  const canEditScans = hasPermission('inventario.registros', 'actualizar')
  const canDeleteScans = hasPermission('inventario.registros', 'eliminar')
  const scanBounds = getTimeBounds(scans, {
    timestampKey: 'scanned_at',
    fallbackStart: sessionData.started_at || sessionData.created_at || session?.started_at || session?.created_at,
    fallbackEnd: sessionData.completed_at || sessionData.created_at || session?.completed_at || session?.created_at,
  })
  const sectionCode = formatSectionCode(
    sessionData.tarima_code || session?.tarima_code,
    scanBounds.start || sessionData.started_at || session?.started_at || sessionData.created_at || session?.created_at
  )

  const duration = (() => {
    if (!scanBounds.start || !scanBounds.end) return '—'
    const ms = new Date(scanBounds.end) - new Date(scanBounds.start)
    const min = Math.floor(ms / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    return `${min}m ${sec}s`
  })()

  const tarimas = useMemo(() => {
    const map = {}
    scans.forEach(sc => {
      const key = normalizeTarimaGroupKey(sc.group_assignment, sectionCode)
      if (!map[key]) map[key] = []
      map[key].push(sc)
    })
    return Object.entries(map).map(([rawCode, items], index) => {
      const counts = items.reduce((acc, item) => {
        acc.total++
        if (item.scan_status === 'ok') acc.ok++
        else if (item.scan_status === 'blocked') acc.blocked++
        else acc.nowms++
        return acc
      }, { total: 0, ok: 0, blocked: 0, nowms: 0 })
      return { rawCode, code: formatTarimaCode(rawCode, sectionCode, index), items, counts }
    })
  }, [scans, sectionCode])

  const tarimaCodeByRaw = useMemo(() => (
    tarimas.reduce((acc, tarima) => {
      acc[tarima.rawCode] = tarima.code
      return acc
    }, {})
  ), [tarimas])

  const totals = useMemo(() => tarimas.reduce((acc, tarima) => {
    acc.tarimas++
    acc.total += tarima.counts.total
    acc.ok += tarima.counts.ok
    acc.blocked += tarima.counts.blocked
    acc.nowms += tarima.counts.nowms
    return acc
  }, { tarimas: 0, total: 0, ok: 0, blocked: 0, nowms: 0 }), [tarimas])

  useEffect(() => {
    setIsReadOnly(initialReadOnly)
    setDetailTab(initialTab)
    setExpandedTarimaCode(null)
    setEditingScanId(null)
    setEditingCode('')
    setDuplicatePending(null)
  }, [initialTab, initialReadOnly, isOpen])

  const confirmPotentialDuplicate = async ({ codes, displayCode, excludeScanId = null, onAccept }) => {
    const variantSet = buildCodeVariantSet(...codes)
    const sessionConflicts = scans
      .filter((scan) => scan.id !== excludeScanId)
      .map((scan) => {
        if (!scanMatchesDuplicateSet(scan, variantSet)) return null
        return {
          id: `session-${scan.id}`,
          source: 'session',
          primary_code: scan.normalized_code || scan.scanned_code || '',
          code2: scan.code2 || null,
          scanned_at: scan.scanned_at || null,
        }
      })
      .filter(Boolean)

    let dbConflicts = []
    try {
      const response = await checkInventoryDuplicates({ codes: [...variantSet] })
      dbConflicts = (response?.data?.matches || []).filter((scan) => scan.id !== excludeScanId)
    } catch (err) {
      toast.error(err.response?.data?.error || t('toast.error'))
      return
    }

    const conflicts = [...sessionConflicts, ...dbConflicts]
    if (conflicts.length === 0) {
      onAccept()
      return
    }

    setDuplicatePending({ code: displayCode, conflicts, onConfirm: onAccept })
  }

  const updateScanMut = useMutation({
    mutationFn: ({ id, code }) => updateInventoryScan(id, {
      scanned_code: code,
      normalized_code: code,
    }),
    onSuccess: () => {
      setEditingScanId(null)
      setEditingCode('')
      qc.invalidateQueries({ queryKey: ['wms-inventory-session', session?.id] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const deleteScanMut = useMutation({
    mutationFn: deleteInventoryScan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wms-inventory-session', session?.id] }),
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const createScanMut = useMutation({
    mutationFn: () => createInventoryScan({
      session_id: session?.id,
      scanned_code: newScan.scanned_code,
      normalized_code: newScan.scanned_code,
      scan_status: newScan.scan_status,
      cell_no: null,
      group_assignment: newScan.group_assignment,
    }),
    onSuccess: () => {
      setNewScan({ scanned_code: '', scan_status: 'ok', group_assignment: 'auto' })
      qc.invalidateQueries({ queryKey: ['wms-inventory-session', session?.id] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const handleExportDetail = () => {
    try {
      const wb = XLSX.utils.book_new()
      const info = [
        ['Sección', sectionCode],
        ['Tipo', isClasificacion ? 'Clasificación' : 'Unificado'],
        ['Operador', sessionData.operator_nombre || ''],
        ['Inicio', scanBounds.start ? fmtDateTime(scanBounds.start) : ''],
        ['Final', scanBounds.end ? fmtDateTime(scanBounds.end) : ''],
        ['Tarimas', totals.tarimas],
        ['Disponible', totals.ok],
        ['Bloqueado', totals.blocked],
        ['No WMS', totals.nowms],
        ['Total', totals.total],
        [],
        ['Tarima', 'Código 1', 'Código 2', 'Ubicación', 'Estado', 'Fecha escaneo'],
        ...scans.map(sc => [
          tarimaCodeByRaw[normalizeTarimaGroupKey(sc.group_assignment, sectionCode)] || formatTarimaCode(sc.group_assignment, sectionCode, 0),
          sc.normalized_code || '',
          sc.code2 || '',
          sc.cell_no || '',
          sc.scan_status || '',
          sc.scanned_at ? fmtDateTime(sc.scanned_at) : '',
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(info)
      ws['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 22 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
      XLSX.writeFile(wb, `inventario_${sectionCode}_${getToday()}.xlsx`)
      toast.success('Exportación completada')
    } catch { toast.error(t('toast.error')) }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="code-main">{sectionCode}</span>
          <span className={`badge shrink-0 ${isClasificacion ? 'bg-accent-100 text-accent-700' : 'bg-primary-100 text-primary-700'}`}>
            {isClasificacion ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')}
          </span>
        </div>
      }
      icon={ScanBarcode}
      size="xl"
      headerAction={!isLoading && scans.length > 0 && (
        <button
          onClick={handleExportDetail}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success-50 text-success-700 rounded-lg hover:bg-success-100 font-semibold transition-all border border-success-200">
          <Download className="w-3.5 h-3.5" /> {t('common.export')}
        </button>
      )}
      footer={
        <div className="flex justify-between items-center">
          <div>
            {!isLoading && isReadOnly && (canEditScans || canDeleteScans) && (
              <button
                onClick={() => setIsReadOnly(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-warning-50 text-warning-700 rounded-lg hover:bg-warning-100 font-semibold transition-all border border-warning-200">
                <Edit3 className="w-3.5 h-3.5" /> {t('common.edit')}
              </button>
            )}
          </div>
          <button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('inventario.registros.operator'), value: sessionData.operator_nombre || '—', Icon: User },
              { label: 'Fecha inicio', value: scanBounds.start ? fmtDateTime(scanBounds.start) : '—', Icon: Clock },
              { label: 'Fecha final', value: scanBounds.end ? fmtDateTime(scanBounds.end) : '—', Icon: Clock },
              { label: 'Tarimas', value: totals.tarimas, Icon: Boxes },
              { label: t('inventario.registros.total'), value: totals.total, Icon: Package2 },
              { label: t('inventario.escaneo.time_label'), value: duration, Icon: Timer },
              { label: 'Ubic. trabajo', value: sessionData.origin_location || '—', Icon: MapPin },
              { label: 'Ubic. destino', value: sessionData.ubicacion_codigo || sessionData.ubicacion_code || '—', Icon: MapPin },
            ].map(card => (
              <div key={card.label} className="rounded-2xl border border-warm-100/70 bg-gradient-to-br from-white via-warm-50/70 to-warm-100/60 p-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.5)]">
                <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
                  <card.Icon className="w-3 h-3" /> {card.label}
                </p>
                <p className={`${card.label.includes('Fecha') ? 'font-mono text-xs font-medium text-warm-600' : 'text-sm font-semibold text-warm-700'} truncate`}>{card.value}</p>
              </div>
            ))}
          </div>

          {tarimas.length === 0 ? (
            <p className="text-sm text-warm-400 text-center py-10">{t('common.noData')}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-warm-100">
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setDetailTab('tarimas')}
                    className={`${DETAIL_TAB_CLASS} whitespace-nowrap ${detailTab === 'tarimas' ? 'border-primary-500 text-primary-600' : 'border-transparent text-warm-400 hover:text-warm-600'}`}
                  >
                    <Boxes className="w-3.5 h-3.5" /> Tarimas
                  </button>
                  <button
                    onClick={() => setDetailTab('detallado')}
                    className={`${DETAIL_TAB_CLASS} whitespace-nowrap ${detailTab === 'detallado' ? 'border-primary-500 text-primary-600' : 'border-transparent text-warm-400 hover:text-warm-600'}`}
                  >
                    <ScanBarcode className="w-3.5 h-3.5" /> Detallado
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pb-2 shrink-0">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_META_KEYS.ok.pill}`}>
                    Disponible {totals.ok}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_META_KEYS.blocked.pill}`}>
                    Bloqueado {totals.blocked}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_META_KEYS.nowms.pill}`}>
                    No WMS {totals.nowms}
                  </span>
                </div>
              </div>

              {detailTab === 'tarimas' && (
                <div className="overflow-x-auto rounded-xl border border-warm-100">
                  <div className="max-h-96 overflow-y-auto scrollbar-thin">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead className="bg-warm-50 sticky top-0">
                      <tr>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Tarima</span></th>
                        <th className={`${TH_CLASS} text-center`}><span className={TH_TEXT}>Disponible</span></th>
                        <th className={`${TH_CLASS} text-center`}><span className={TH_TEXT}>Bloqueado</span></th>
                        <th className={`${TH_CLASS} text-center`}><span className={TH_TEXT}>No WMS</span></th>
                        <th className={`${TH_CLASS} text-center`}><span className={TH_TEXT}>{t('inventario.registros.total')}</span></th>
                        <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT} /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {tarimas.map(tarima => {
                        const isExpanded = expandedTarimaCode === tarima.code
                        return (
                          <tr key={tarima.code} className="align-top">
                            <td colSpan={6} className="p-0">
                              <button
                                onClick={() => setExpandedTarimaCode(isExpanded ? null : tarima.code)}
                                className="w-full grid grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_6rem_2rem] items-center gap-2 px-4 py-3 hover:bg-primary-50/30 text-left transition-colors"
                              >
                                <span className="font-mono text-xs font-semibold text-warm-700 truncate">{tarima.code}</span>
                                <span className="text-center text-xs font-bold text-success-600">{tarima.counts.ok}</span>
                                <span className="text-center text-xs font-bold text-warning-600">{tarima.counts.blocked}</span>
                                <span className="text-center text-xs font-bold text-danger-600">{tarima.counts.nowms}</span>
                                <span className="text-center text-xs font-bold text-warm-700">{tarima.counts.total}</span>
                                {isExpanded
                                  ? <ChevronUp className="w-4 h-4 text-warm-400 justify-self-end" />
                                  : <ChevronDown className="w-4 h-4 text-warm-400 justify-self-end" />}
                              </button>
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                    <div className="px-4 pb-3 bg-warm-50/40">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-warm-400 border-b border-warm-100">
                                            <th className="text-left py-1.5 pr-3 font-semibold">#</th>
                                            <th className="text-left pr-3 font-semibold">Código 1</th>
                                            <th className="text-left pr-3 font-semibold">Código 2</th>
                                            <th className="text-left pr-3 font-semibold">Ubicación</th>
                                            <th className="text-left pr-3 font-semibold">{t('common.status')}</th>
                                            <th className="text-right font-semibold">Fecha escaneo</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {tarima.items.map((sc, i) => {
                                            const meta = STATUS_META_KEYS[sc.scan_status] ?? STATUS_META_KEYS.nowms
                                            const Icon = meta.icon
                                            return (
                                              <tr key={sc.id || i} className="border-b border-warm-50 last:border-0">
                                                <td className="py-1.5 pr-3 text-warm-400">{i + 1}</td>
                                                <td className="pr-3">
                                                  <span className="font-mono text-xs font-semibold text-warm-700">{sc.normalized_code}</span>
                                                </td>
                                                <td className="pr-3">
                                                  {sc.code2 ? (
                                                    <span className="font-mono text-xs text-warm-500">
                                                      {sc.was_swapped && <span className="text-accent-600 font-bold mr-1">SWAP</span>}
                                                      {sc.code2}
                                                    </span>
                                                  ) : (
                                                    <span className="text-warm-300">—</span>
                                                  )}
                                                </td>
                                                <td className="pr-3">
                                                  <span className="text-xs text-warm-500">{sc.cell_no || '—'}</span>
                                                </td>
                                                <td className="pr-3">
                                                  <span className={`badge inline-flex items-center gap-1 ${meta.bg}`}>
                                                    <Icon size={9} /> {t(meta.labelKey)}
                                                  </span>
                                                </td>
                                                <td className="text-right text-warm-400 tabular-nums">
                                                  {sc.scanned_at ? fmtDateTime(sc.scanned_at) : '—'}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {detailTab === 'detallado' && (
                <div className="overflow-x-auto rounded-xl border border-warm-100">
                  <div className="max-h-[28rem] overflow-y-auto scrollbar-thin">
                  <table className="w-full min-w-[680px] text-xs">
                    <thead className="bg-warm-50 sticky top-0">
                      <tr>
                        <th className={TH_CLASS}><span className={TH_TEXT}>#</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Tarima</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Código 1</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Código 2</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Ubicación</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>{t('common.status')}</span></th>
                        <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>Fecha escaneo</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Acciones</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {scans.map((sc, i) => {
                        const meta = STATUS_META_KEYS[sc.scan_status] ?? STATUS_META_KEYS.nowms
                        const Icon = meta.icon
                        return (
                          <tr key={sc.id || i} className="table-row whitespace-nowrap">
                            <td className="table-cell text-warm-400">{i + 1}</td>
                            <td className="table-cell">
                              <span className="font-mono text-xs font-semibold text-warm-700">
                                {tarimaCodeByRaw[normalizeTarimaGroupKey(sc.group_assignment, sectionCode)] || formatTarimaCode(sc.group_assignment, sectionCode, 0)}
                              </span>
                            </td>
                            <td className="table-cell">
                              {editingScanId === sc.id ? (
                                <input
                                  className="input-field h-8 text-xs font-mono"
                                  value={editingCode}
                                  onChange={(event) => setEditingCode(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key !== 'Enter') return
                                    const nextCode = editingCode.trim()
                                    if (!nextCode) return
                                    confirmPotentialDuplicate({
                                      codes: [nextCode, sc.code2 || ''],
                                      displayCode: nextCode,
                                      excludeScanId: sc.id,
                                      onAccept: () => updateScanMut.mutate({ id: sc.id, code: nextCode }),
                                    })
                                  }}
                                />
                              ) : (
                                <span className="font-mono text-xs font-semibold text-warm-700">{sc.normalized_code}</span>
                              )}
                            </td>
                            <td className="table-cell">
                              {sc.code2 ? (
                                <p className="font-mono text-xs text-warm-500">
                                  {sc.was_swapped && <span className="text-accent-600 font-bold mr-1">SWAP</span>}
                                  {sc.code2}
                                </p>
                              ) : (
                                <span className="text-warm-300">—</span>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className="text-xs text-warm-500">{sc.cell_no || '—'}</span>
                            </td>
                            <td className="table-cell">
                              <span className={`badge inline-flex items-center gap-1 ${meta.bg}`}>
                                <Icon size={9} /> {t(meta.labelKey)}
                              </span>
                            </td>
                            <td className="table-cell text-right text-warm-400 tabular-nums">
                              {sc.scanned_at ? fmtDateTime(sc.scanned_at) : '—'}
                            </td>
                            <td className="table-cell">
                              {!isReadOnly && (
                              <div className="flex items-center gap-1">
                                {canEditScans && editingScanId === sc.id ? (
                                  <button
                                    className="rounded-lg bg-primary-600 px-2 py-1 text-[10px] font-semibold text-white"
                                    onClick={() => {
                                      const nextCode = editingCode.trim()
                                      if (!nextCode) return
                                      confirmPotentialDuplicate({
                                        codes: [nextCode, sc.code2 || ''],
                                        displayCode: nextCode,
                                        excludeScanId: sc.id,
                                        onAccept: () => updateScanMut.mutate({ id: sc.id, code: nextCode }),
                                      })
                                    }}
                                  >
                                    Guardar
                                  </button>
                                ) : canEditScans ? (
                                  <button className="rounded-lg bg-warm-100 px-2 py-1 text-[10px] font-semibold text-warm-700" onClick={() => { setEditingScanId(sc.id); setEditingCode(sc.normalized_code || sc.scanned_code || '') }}>
                                    Editar
                                  </button>
                                ) : null}
                                {canDeleteScans && (
                                  <button className="rounded-lg bg-danger-50 px-2 py-1 text-[10px] font-semibold text-danger-700" onClick={() => deleteScanMut.mutate(sc.id)}>
                                    Eliminar
                                  </button>
                                )}
                              </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {!isReadOnly && canEditScans && (
                      <tr className="bg-warm-50/70">
                        <td className="table-cell text-warm-400">+</td>
                        <td className="table-cell">
                          <input className="input-field h-8 text-xs" value={newScan.group_assignment} onChange={(event) => setNewScan((prev) => ({ ...prev, group_assignment: event.target.value }))} />
                        </td>
                        <td className="table-cell">
                          <input className="input-field h-8 text-xs font-mono" value={newScan.scanned_code} onChange={(event) => setNewScan((prev) => ({ ...prev, scanned_code: event.target.value }))} />
                        </td>
                        <td className="table-cell"><span className="text-warm-300">—</span></td>
                        <td className="table-cell"><span className="text-warm-300">—</span></td>
                        <td className="table-cell">
                          <select className="input-field h-8 text-xs" value={newScan.scan_status} onChange={(event) => setNewScan((prev) => ({ ...prev, scan_status: event.target.value }))}>
                            <option value="ok">Disponible</option>
                            <option value="blocked">Bloqueado</option>
                            <option value="nowms">No WMS</option>
                          </select>
                        </td>
                        <td className="table-cell text-right text-warm-300">—</td>
                        <td className="table-cell">
                          <button
                            className="rounded-lg bg-primary-600 px-2 py-1 text-[10px] font-semibold text-white"
                            disabled={!newScan.scanned_code.trim() || createScanMut.isPending}
                            onClick={() => {
                              const nextCode = newScan.scanned_code.trim()
                              if (!nextCode) return
                              confirmPotentialDuplicate({
                                codes: [nextCode],
                                displayCode: nextCode,
                                onAccept: () => createScanMut.mutate(),
                              })
                            }}
                          >
                            Agregar
                          </button>
                        </td>
                      </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
      <DuplicateConfirmModal
        isOpen={!!duplicatePending}
        code={duplicatePending?.code}
        conflicts={duplicatePending?.conflicts || []}
        t={t}
        onConfirm={() => {
          duplicatePending?.onConfirm?.()
          setDuplicatePending(null)
        }}
        onClose={() => setDuplicatePending(null)}
      />
    </Modal>
  )
}

const today = getToday()
const thirtyDaysAgo = subtractDays(today, 30)

export default function InventarioRegistros() {
  const { t } = useI18nStore()
  const { hasPermission } = useAuthStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const canCreate = hasPermission('inventario.escaneo', 'crear')
  const canExport = hasPermission('inventario.registros', 'actualizar')
  const canEdit = hasPermission('inventario.registros', 'actualizar')
  const canDelete = hasPermission('inventario.registros', 'eliminar')
  const searchDebounce = useRef(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [copiedCode, setCopiedCode] = useState('')
  const [detailSession, setDetailSession] = useState(null)
  const [detailInitialTab, setDetailInitialTab] = useState('tarimas')
  const [detailReadOnly, setDetailReadOnly] = useState(true)
  const [deleteConfirmSession, setDeleteConfirmSession] = useState(null)
  const [scanTypeFilter, setScanTypeFilter] = useState('')
  const [filterOperators, setFilterOperators] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportingBulk, setExportingBulk] = useState(false)
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [datePreset, setDatePreset] = useState('30')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [showManageUbicaciones, setShowManageUbicaciones] = useState(false)

  const filters = {
    scan_type: scanTypeFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    q: search || undefined,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['wms-inventory-sessions', { page, pageSize, ...filters }],
    queryFn: () => getInventorySessions({ page, pageSize, ...filters }),
    staleTime: 30000,
    enabled: backendOnline,
  })

  const records = data?.data?.records ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize) || 1

  const operatorOptions = useMemo(() =>
    [...new Set(records.map(r => r.operator_nombre).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
  [records])

  const filteredRecords = useMemo(() =>
    filterOperators.length === 0 ? records : records.filter(r => filterOperators.includes(r.operator_nombre)),
  [records, filterOperators])
  const { data: ubicacionesAdminData } = useQuery({
    queryKey: ['wms-ubicaciones-admin', 'inventario'],
    queryFn: () => getUbicacionesAdmin('inventario'),
    staleTime: 120000,
    enabled: showManageUbicaciones,
  })

  const deleteMut = useMutation({
    mutationFn: deleteInventorySession,
    onSuccess: () => {
      toast.success(t('common.delete') + ' OK')
      setDeleteConfirmSession(null)
      setDetailSession(null)
      qc.invalidateQueries({ queryKey: ['wms-inventory-sessions'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  useEffect(() => () => clearTimeout(searchDebounce.current), [])

  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <button
        type="button"
        onClick={() => setShowManageUbicaciones(true)}
        className="btn-ghost text-xs flex items-center gap-1.5"
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Gestionar ubicaciones
      </button>
      <button
        type="button"
        onClick={() => setShowQuickSearch(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-warm-200 bg-warm-100 text-warm-400 transition-all duration-200 hover:bg-primary-50 hover:text-primary-600"
        title="Búsqueda rápida"
        aria-label="Búsqueda rápida"
      >
        <Search className="w-4 h-4" />
      </button>
    </div>
  )

  const hasActiveFilters = scanTypeFilter || filterOperators.length > 0 || dateFrom !== thirtyDaysAgo || dateTo !== today || !!search
  const resetFilters = () => {
    setScanTypeFilter('')
    setFilterOperators([])
    setDateFrom(thirtyDaysAgo)
    setDateTo(today)
    setDatePreset('30')
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  const setQuickRange = (days) => {
    const end = today
    const start = days === 0
      ? end
      : subtractDays(end, days)
    setDateFrom(start)
    setDateTo(end)
    setDatePreset(String(days))
    setPage(1)
  }

  const handleSearch = (value) => {
    setSearchInput(value)
    clearTimeout(searchDebounce.current)
    if (!value.trim()) {
      setSearch('')
      setPage(1)
      return
    }
    searchDebounce.current = setTimeout(() => {
      setSearch(value.trim())
      setPage(1)
    }, 300)
  }

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredRecords.map(r => r.id)))
  }
  const INV_HEADERS = ['Sección', 'Tipo', 'Fecha', 'Operador', 'Disponible', 'Bloqueado', 'No WMS', 'Total']
  const INV_COLS = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }]
  const buildInvRows = (rows) => rows.map(r => [
    formatSectionCode(r.tarima_code, r.started_at || r.created_at),
    r.scan_type === 'clasificacion' ? 'Clasificación' : 'Unificado',
    (r.started_at || r.created_at) ? fmtDateTime(r.started_at || r.created_at) : '',
    r.operator_nombre || '',
    r.total_ok ?? 0,
    r.total_blocked ?? 0,
    r.total_nowms ?? 0,
    r.total_scans ?? 0,
  ])
  const writeInvExcel = (dataRows, filename) => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([INV_HEADERS, ...dataRows])
    ws['!cols'] = INV_COLS
    XLSX.utils.book_append_sheet(wb, ws, 'Registros Inventario')
    XLSX.writeFile(wb, filename)
    toast.success('Exportación completada')
  }

  const handleBulkExport = () => {
    if (selectedIds.size === 0) return
    setExportingBulk(true)
    try {
      writeInvExcel(buildInvRows(records.filter(r => selectedIds.has(r.id))), `inventario_registros_${getToday()}.xlsx`)
      setSelectedIds(new Set())
    } catch { toast.error(t('toast.error')) }
    setExportingBulk(false)
  }

  const handleCopyCode = async (event, code) => {
    event.stopPropagation()
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      window.setTimeout(() => {
        setCopiedCode(current => (current === code ? '' : current))
      }, 1500)
    } catch {
      toast.error(t('toast.error'))
    }
  }

  const openDetail = (session, initialTab = 'tarimas', readOnly = true) => {
    setDetailInitialTab(initialTab)
    setDetailReadOnly(readOnly)
    setDetailSession(session)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('inventario.registros.title')}
        subtitle={t('nav.inventario')}
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Filter bar */}
        <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDatePreset(''); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDatePreset(''); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
            </div>

            {[{ label: 'Hoy', d: 0 }, { label: '7 Días', d: 7 }, { label: '30 Días', d: 30 }].map(({ label, d }) => (
              <button
                key={label}
                type="button"
                onClick={() => setQuickRange(d)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  datePreset === String(d)
                    ? 'bg-primary-50 text-primary-700 border-primary-200'
                    : 'bg-warm-50 text-warm-600 border-warm-200 hover:bg-warm-100'
                }`}
              >
                {label}
              </button>
            ))}

            {hasActiveFilters && (
              <button type="button" onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                <X className="w-3 h-3" /> {t('common.clear')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-0.5 w-full justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={scanTypeFilter}
                onChange={e => { setScanTypeFilter(e.target.value); setPage(1) }}
                className="h-10 pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:shadow-sm transition-all cursor-pointer"
              >
                <option value="">{t('common.all')}</option>
                <option value="unificado">{t('inventario.escaneo.type_unificado')}</option>
                <option value="clasificacion">{t('inventario.escaneo.type_clasificacion')}</option>
              </select>

              {operatorOptions.length > 0 && (
                <MultiSelect
                  value={filterOperators}
                  onChange={v => { setFilterOperators(v); setPage(1) }}
                  options={operatorOptions}
                  placeholder={t('inventario.registros.operator')}
                />
              )}

              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[240px] max-w-sm transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
                <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Buscar por sección, operador..."
                  className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 placeholder:text-warm-400 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {searchInput && (
                  <button type="button" onClick={() => handleSearch('')} className="text-warm-400 hover:text-warm-600">
                    <XCircle className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canCreate && (
                <Link
                  to="/inventario/escaneo"
                  className="h-10 px-4 rounded-xl bg-primary-600 text-white flex items-center gap-2 text-sm font-semibold hover:bg-primary-700 transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                  <ScanBarcode className="w-4 h-4" />
                  Escanear
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-3 space-y-3">
          {isLoading ? (
            <div className="card overflow-hidden shadow-sm table-shell relative">
              <div className="overflow-x-auto table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-50 border-b border-warm-100">
                      <th className="table-header w-10 text-center"><div className="h-4 w-4 rounded bg-warm-200 animate-pulse mx-auto" /></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>Sección</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>{t('inventario.registros.type')}</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>{t('inventario.registros.date')}</span></th>
                      <th className={`${TH_CLASS} hidden md:table-cell`}><span className={TH_TEXT}>{t('inventario.registros.operator')}</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>Disponible</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>Bloqueado</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>No WMS</span></th>
                      <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('inventario.registros.total')}</span></th>
                      <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="table-row">
                        <td className="table-cell w-10"><div className="h-4 w-4 rounded bg-warm-100 animate-pulse mx-auto" /></td>
                        <td className="table-cell"><div className="h-3 rounded bg-warm-100 animate-pulse" style={{ width: `${60 + (i % 3) * 20}px` }} /></td>
                        <td className="table-cell"><div className="h-5 w-16 rounded-full bg-warm-100 animate-pulse" /></td>
                        <td className="table-cell"><div className="h-3 w-32 rounded bg-warm-100 animate-pulse" /></td>
                        <td className="table-cell hidden md:table-cell"><div className="h-3 w-20 rounded bg-warm-100 animate-pulse" /></td>
                        <td className="table-cell"><div className="h-3 w-6 rounded bg-warm-100 animate-pulse mx-auto" /></td>
                        <td className="table-cell"><div className="h-3 w-6 rounded bg-warm-100 animate-pulse mx-auto" /></td>
                        <td className="table-cell"><div className="h-3 w-6 rounded bg-warm-100 animate-pulse mx-auto" /></td>
                        <td className="table-cell text-right"><div className="h-3 w-6 rounded bg-warm-100 animate-pulse ml-auto" /></td>
                        <td className="table-cell text-right"><div className="h-3 w-12 rounded bg-warm-100 animate-pulse ml-auto" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-primary-50 shadow-glow animate-bounce-soft">
                  <div className="absolute inset-1 rounded-[1.15rem] bg-white/90" />
                  <Loader2 size={20} className="relative z-10 animate-spin text-primary-500" />
                </div>
                <p className="text-sm text-warm-500">{t('common.loading')}</p>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="card overflow-hidden shadow-sm min-h-64 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
                <Package2 size={28} className="text-warm-300" />
              </div>
              <p className="text-sm text-warm-400 font-medium">{t('inventario.registros.no_registros')}</p>
            </div>
          ) : (
            <div className="card overflow-hidden shadow-sm table-shell">
              {selectedIds.size > 0 && canExport && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700 flex-wrap">
                  <span className="font-semibold">
                    {selectedIds.size} seleccionados
                    {selectedIds.size === filteredRecords.length && filteredRecords.length > 0 && (
                      <span className="ml-1 font-normal text-primary-500">(todos del filtro)</span>
                    )}
                  </span>
                  {selectedIds.size < filteredRecords.length && (
                    <button
                      className="text-primary-600 hover:text-primary-800 underline font-semibold transition-colors"
                      onClick={() => setSelectedIds(new Set(filteredRecords.map(r => r.id)))}>
                      Seleccionar todos ({filteredRecords.length})
                    </button>
                  )}
                  <button onClick={handleBulkExport} disabled={exportingBulk}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success-600 text-white font-semibold hover:bg-success-700 transition-colors disabled:opacity-50">
                    {exportingBulk ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-3 h-3" />}
                    Exportar ({selectedIds.size})
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-primary-500 hover:text-primary-700 font-semibold">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="overflow-x-auto table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-50 border-b border-warm-100">
                      <th className="table-header w-10 text-center">
                        <input type="checkbox"
                          checked={selectedIds.size === filteredRecords.length && filteredRecords.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                      </th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>Sección</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>{t('inventario.registros.type')}</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>{t('inventario.registros.date')}</span></th>
                      <th className={`${TH_CLASS} hidden md:table-cell`}><span className={TH_TEXT}>{t('inventario.registros.operator')}</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>Disponible</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>Bloqueado</span></th>
                      <th className={TH_CLASS}><span className={TH_TEXT}>No WMS</span></th>
                      <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('inventario.registros.total')}</span></th>
                      <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {filteredRecords.map(r => {
                      const isSelected = selectedIds.has(r.id)
                      return (
                        <tr key={r.id}
                          onClick={() => openDetail(r)}
                          className={`table-row group cursor-pointer ${isSelected ? 'bg-primary-50/40' : ''}`}>
                          <td className="table-cell text-center" onClick={e => { e.stopPropagation(); toggleSelect(r.id) }}>
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleSelect(r.id)}
                              className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                          </td>
                          <td className="table-cell">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="code-main truncate">{formatSectionCode(r.tarima_code, r.started_at || r.created_at)}</span>
                              <button
                                type="button"
                                onClick={(event) => handleCopyCode(event, formatSectionCode(r.tarima_code, r.started_at || r.created_at))}
                                className="shrink-0 rounded-md p-0.5 text-warm-400 opacity-0 transition-all hover:bg-primary-100/70 hover:text-primary-600 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
                                title={t('common.copy')}
                              >
                                {copiedCode === formatSectionCode(r.tarima_code, r.started_at || r.created_at)
                                  ? <Check size={13} className="text-success-600" />
                                  : <Copy size={13} />}
                              </button>
                            </div>
                          </td>
                          <td className="table-cell">
                            <span className={`badge text-xs font-semibold ${
                              r.scan_type === 'clasificacion'
                                ? 'bg-accent-100 text-accent-700'
                                : 'bg-primary-100 text-primary-700'
                            }`}>
                              {r.scan_type === 'clasificacion' ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')}
                            </span>
                          </td>
                          <td className="table-cell">
                            <span className="text-warm-600 text-xs tabular-nums">
                              {(r.started_at || r.created_at) ? fmtDateTime(r.started_at || r.created_at) : '—'}
                            </span>
                          </td>
                          <td className="table-cell hidden md:table-cell text-warm-600 text-xs">
                            {r.operator_nombre || '—'}
                          </td>
                          <td className="table-cell text-center text-xs tabular-nums">
                            <span className="text-success-600 font-bold">{r.total_ok ?? 0}</span>
                          </td>
                          <td className="table-cell text-center text-xs tabular-nums">
                            <span className="text-warning-600 font-bold">{r.total_blocked ?? 0}</span>
                          </td>
                          <td className="table-cell text-center text-xs tabular-nums">
                            <span className="text-danger-600 font-bold">{r.total_nowms ?? 0}</span>
                          </td>
                          <td className="table-cell text-right">
                            <span className="font-bold text-primary-700 text-sm">{r.total_scans ?? 0}</span>
                          </td>
                          <td className="table-cell text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                className="p-1.5 rounded-lg hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-colors"
                                onClick={e => { e.stopPropagation(); openDetail(r, 'tarimas', true) }}
                                title={t('inventario.registros.detail')}>
                                <Eye size={13} />
                              </button>
                              {canEdit && (
                                <button
                                  className="p-1.5 rounded-lg hover:bg-warning-50 text-warm-400 hover:text-warning-600 transition-colors"
                                  onClick={e => { e.stopPropagation(); openDetail(r, 'detallado', false) }}
                                  title={t('common.edit')}>
                                  <Edit3 size={13} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                                  onClick={e => { e.stopPropagation(); setDeleteConfirmSession(r) }}
                                  title={t('common.delete')}>
                                  <Trash2 size={13} />
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
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                itemLabel={t('inventario.registros.title').toLowerCase()}
              />
            </div>
          )}
        </div>
      </div>

      <DetailModal
        session={detailSession}
        isOpen={!!detailSession}
        onClose={() => { setDetailSession(null); setDetailInitialTab('tarimas'); setDetailReadOnly(true) }}
        initialTab={detailInitialTab}
        initialReadOnly={detailReadOnly}
      />

      <Modal
        isOpen={!!deleteConfirmSession}
        onClose={() => setDeleteConfirmSession(null)}
        title={t('inventario.registros.delete_section_title')}
        icon={Trash2}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary" onClick={() => setDeleteConfirmSession(null)}>{t('common.cancel')}</button>
            <button
              className="btn-primary inline-flex items-center gap-2 whitespace-nowrap bg-danger-600 hover:bg-danger-700"
              onClick={() => deleteMut.mutate(deleteConfirmSession.id)}
              disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('common.delete')}
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-warm-600">
          <p>{t('inventario.registros.delete_section_confirm')}</p>
          <div className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2">
            <p className="font-semibold text-danger-700">
              {deleteConfirmSession ? formatSectionCode(deleteConfirmSession.tarima_code, deleteConfirmSession.started_at || deleteConfirmSession.created_at) : '—'}
            </p>
            <p className="text-xs text-danger-600">
              {(deleteConfirmSession?.total_scans ?? 0)} {t('inventario.registros.scanned_boxes')}
              {' · '}
              {t('inventario.registros.type')}: {deleteConfirmSession?.scan_type || '—'}
            </p>
          </div>
        </div>
      </Modal>
      <QuickCodeSearchModal
        isOpen={showQuickSearch}
        onClose={() => setShowQuickSearch(false)}
        onOpenSession={(sessionId) => {
          setShowQuickSearch(false)
          setDetailInitialTab('detallado')
          setDetailSession({ id: sessionId })
        }}
      />
      <InventarioUbicacionesModal
        isOpen={showManageUbicaciones}
        onClose={() => setShowManageUbicaciones(false)}
        ubicaciones={ubicacionesAdminData?.data ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['wms-ubicaciones-admin'] })
        }}
        serviceOverrides={{ createUbicacion, updateUbicacion, deleteUbicacion }}
      />
    </div>
  )
}
