import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  Eye, Trash2, CheckCircle2, AlertTriangle, Ban, X, Package2, Loader2,
  User, Timer, Clock, ScanBarcode, Boxes, ChevronDown, ChevronUp,
  Search, XCircle, Download, Copy, Check,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { getInventorySessions, getInventorySession, deleteInventorySession } from '../services/inventarioService'

const STATUS_META_KEYS = {
  ok:      { labelKey: 'inventario.escaneo.group_disponible', icon: CheckCircle2, bg: 'bg-success-100 text-success-700' },
  blocked: { labelKey: 'inventario.escaneo.group_bloqueado',  icon: AlertTriangle, bg: 'bg-warning-100 text-warning-700' },
  nowms:   { labelKey: 'inventario.escaneo.group_nowms',      icon: Ban, bg: 'bg-danger-100 text-danger-700' },
}
const TH_CLASS = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'
const DETAIL_TAB_CLASS = 'flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px'

const dateKeyFromTimestamp = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return String(value).slice(0, 10).replace(/-/g, '')
}
const formatSectionCode = (code, fallbackDate) => {
  const clean = String(code || '').trim()
  if (/^SEC-\d{8}M\d{2,}$/.test(clean)) return clean
  if (/^\d{8}M\d{2,}$/.test(clean)) return `SEC-${clean}`
  return `SEC-${dateKeyFromTimestamp(fallbackDate)}M00`
}
const getToday = () => new Date().toISOString().slice(0, 10)
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

function DetailModal({ session, isOpen, onClose }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const [detailTab, setDetailTab] = useState('tarimas')
  const [expandedTarimaCode, setExpandedTarimaCode] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['upapex-inventory-session', session?.id],
    queryFn: () => getInventorySession(session.id),
    enabled: isOpen && !!session?.id,
    staleTime: 30000,
  })

  const sessionData = data?.data?.session ?? {}
  const scans = data?.data?.scans ?? []
  const isClasificacion = (sessionData.scan_type ?? session?.scan_type) === 'clasificacion'
  const sectionCode = formatSectionCode(
    sessionData.tarima_code || session?.tarima_code,
    sessionData.completed_at || session?.completed_at || sessionData.created_at || session?.created_at
  )

  const duration = (() => {
    if (!sessionData.started_at || !sessionData.completed_at) return '—'
    const ms = new Date(sessionData.completed_at) - new Date(sessionData.started_at)
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
    if (!isOpen) {
      setDetailTab('tarimas')
      setExpandedTarimaCode(null)
    }
  }, [isOpen])

  const handleExportDetail = () => {
    try {
      const wb = XLSX.utils.book_new()
      const info = [
        ['Sección', sectionCode],
        ['Tipo', isClasificacion ? 'Clasificación' : 'Unificado'],
        ['Operador', sessionData.operator_nombre || ''],
        ['Inicio', sessionData.started_at ? new Date(sessionData.started_at).toLocaleString('es-MX') : ''],
        ['Final', sessionData.completed_at ? new Date(sessionData.completed_at).toLocaleString('es-MX') : ''],
        ['Tarimas', totals.tarimas],
        ['Disponible', totals.ok],
        ['Bloqueado', totals.blocked],
        ['No WMS', totals.nowms],
        ['Total', totals.total],
        [],
        ['Tarima', 'Código 1', 'Código 2', 'Estado', 'Fecha escaneo'],
        ...scans.map(sc => [
          tarimaCodeByRaw[normalizeTarimaGroupKey(sc.group_assignment, sectionCode)] || formatTarimaCode(sc.group_assignment, sectionCode, 0),
          sc.normalized_code || '',
          sc.code2 || '',
          sc.scan_status || '',
          sc.scanned_at ? new Date(sc.scanned_at).toLocaleString('es-MX') : '',
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(info)
      ws['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 22 }]
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
        <div className="flex justify-end">
          <button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {[
              { label: t('inventario.registros.operator'), value: sessionData.operator_nombre || '—', Icon: User },
              { label: 'Fecha inicio', value: (sessionData.started_at || sessionData.created_at) ? new Date(sessionData.started_at || sessionData.created_at).toLocaleString('es-MX') : '—', Icon: Clock },
              { label: 'Fecha final', value: sessionData.completed_at ? new Date(sessionData.completed_at).toLocaleString('es-MX') : '—', Icon: Clock },
              { label: 'Tarimas', value: totals.tarimas, Icon: Boxes },
              { label: t('inventario.registros.total'), value: totals.total, Icon: Package2 },
              { label: t('inventario.escaneo.time_label'), value: duration, Icon: Timer },
            ].map(card => (
              <div key={card.label} className="p-3 rounded-xl bg-warm-50 border border-warm-100/50">
                <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
                  <card.Icon className="w-3 h-3" /> {card.label}
                </p>
                <p className="text-sm font-semibold text-warm-700 truncate">{card.value}</p>
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
                  <span className="inline-flex items-center rounded-full border border-success-200 bg-success-50 px-2.5 py-1 text-[10px] font-semibold text-success-700">
                    Disponible {totals.ok}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-warning-200 bg-warning-50 px-2.5 py-1 text-[10px] font-semibold text-warning-700">
                    Bloqueado {totals.blocked}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-danger-200 bg-danger-50 px-2.5 py-1 text-[10px] font-semibold text-danger-700">
                    No WMS {totals.nowms}
                  </span>
                </div>
              </div>

              {detailTab === 'tarimas' && (
                <div className="max-h-96 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
                  <table className="w-full text-xs">
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
                                                  <span className={`badge inline-flex items-center gap-1 ${meta.bg}`}>
                                                    <Icon size={9} /> {t(meta.labelKey)}
                                                  </span>
                                                </td>
                                                <td className="text-right text-warm-400 tabular-nums">
                                                  {sc.scanned_at ? new Date(sc.scanned_at).toLocaleString('es-MX') : '—'}
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
              )}

              {detailTab === 'detallado' && (
                <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="bg-warm-50 sticky top-0">
                      <tr>
                        <th className={TH_CLASS}><span className={TH_TEXT}>#</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Tarima</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Código 1</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>Código 2</span></th>
                        <th className={TH_CLASS}><span className={TH_TEXT}>{t('common.status')}</span></th>
                        <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>Fecha escaneo</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {scans.map((sc, i) => {
                        const meta = STATUS_META_KEYS[sc.scan_status] ?? STATUS_META_KEYS.nowms
                        const Icon = meta.icon
                        return (
                          <tr key={sc.id || i} className="table-row">
                            <td className="table-cell text-warm-400">{i + 1}</td>
                            <td className="table-cell">
                              <span className="font-mono text-xs font-semibold text-warm-700">
                                {tarimaCodeByRaw[normalizeTarimaGroupKey(sc.group_assignment, sectionCode)] || formatTarimaCode(sc.group_assignment, sectionCode, 0)}
                              </span>
                            </td>
                            <td className="table-cell">
                              <span className="font-mono text-xs font-semibold text-warm-700">{sc.normalized_code}</span>
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
                              <span className={`badge inline-flex items-center gap-1 ${meta.bg}`}>
                                <Icon size={9} /> {t(meta.labelKey)}
                              </span>
                            </td>
                            <td className="table-cell text-right text-warm-400 tabular-nums">
                              {sc.scanned_at ? new Date(sc.scanned_at).toLocaleString('es-MX') : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </Modal>
  )
}

const today = new Date().toISOString().slice(0, 10)
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)

export default function InventarioRegistros() {
  const { t } = useI18nStore()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const canCreate = hasPermission('inventario.escaneo', 'crear')
  const canExport = hasPermission('inventario.registros', 'actualizar')
  const canDelete = hasPermission('inventario.registros', 'eliminar')
  const searchDebounce = useRef(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [copiedCode, setCopiedCode] = useState('')
  const [detailSession, setDetailSession] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [scanTypeFilter, setScanTypeFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportingBulk, setExportingBulk] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(null)
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [datePreset, setDatePreset] = useState('30')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const filters = {
    scan_type: scanTypeFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    q: search || undefined,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['upapex-inventory-sessions', { page, pageSize, ...filters }],
    queryFn: () => getInventorySessions({ page, pageSize, ...filters }),
    staleTime: 30000,
  })

  const records = data?.data?.records ?? []
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize) || 1
  const mostRecentId = records[0]?.id

  const deleteMut = useMutation({
    mutationFn: deleteInventorySession,
    onSuccess: () => {
      toast.success(t('common.delete') + ' OK')
      setDeleteConfirmId(null)
      qc.invalidateQueries({ queryKey: ['upapex-inventory-sessions'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  useEffect(() => () => clearTimeout(searchDebounce.current), [])

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('inventario.registros.title')} subtitle={t('nav.inventario')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  const hasActiveFilters = scanTypeFilter || dateFrom !== thirtyDaysAgo || dateTo !== today || !!search
  const resetFilters = () => {
    setScanTypeFilter('')
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
      : new Date(new Date(`${end}T00:00:00`).getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
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
    if (selectedIds.size === records.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(records.map(r => r.id)))
  }
  const INV_HEADERS = ['Sección', 'Tipo', 'Fecha', 'Operador', 'Disponible', 'Bloqueado', 'No WMS', 'Total']
  const INV_COLS = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }]
  const buildInvRows = (rows) => rows.map(r => [
    formatSectionCode(r.tarima_code, r.completed_at || r.created_at),
    r.scan_type === 'clasificacion' ? 'Clasificación' : 'Unificado',
    (r.completed_at || r.created_at || '').slice(0, 16).replace('T', ' '),
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

  const doExportAll = () => {
    try {
      writeInvExcel(buildInvRows(records), `inventario_registros_${getToday()}.xlsx`)
    } catch { toast.error(t('toast.error')) }
  }

  const handleExportAll = () => {
    if (!records.length) return
    setExportConfirm({ count: records.length, onConfirm: doExportAll })
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

  return (
    <div className="flex flex-col h-full">
      <Header title={t('inventario.registros.title')} subtitle={t('nav.inventario')} />

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
              {canExport && (
                <button
                  onClick={handleExportAll}
                  disabled={records.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-semibold bg-success-50 border border-success-200 text-success-700 hover:bg-success-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <Download className="w-3.5 h-3.5" /> {t('common.export') || 'Exportar'}
                </button>
              )}
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
          {records.length === 0 ? (
            <div className="card overflow-hidden shadow-sm min-h-64 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
                <Package2 size={28} className="text-warm-300" />
              </div>
              <p className="text-sm text-warm-400 font-medium">{t('inventario.registros.no_registros')}</p>
            </div>
          ) : (
            <div className="card overflow-hidden shadow-sm table-shell">
              {selectedIds.size > 0 && canExport && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700">
                  <span className="font-semibold">{selectedIds.size} seleccionados</span>
                  <button onClick={handleBulkExport} disabled={exportingBulk}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success-600 text-white font-semibold hover:bg-success-700 transition-colors disabled:opacity-50">
                    {exportingBulk ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-3 h-3" />}
                    Exportar selección
                  </button>
                  <button onClick={handleExportAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-success-200 text-success-700 font-semibold hover:bg-success-50 transition-colors">
                    <Download className="w-3 h-3" /> Exportar todo
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
                          checked={selectedIds.size === records.length && records.length > 0}
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
                    {records.map(r => {
                      const isSelected = selectedIds.has(r.id)
                      return (
                        <tr key={r.id}
                          onClick={() => setDetailSession(r)}
                          className={`table-row group cursor-pointer ${isSelected ? 'bg-primary-50/40' : ''}`}>
                          <td className="table-cell text-center" onClick={e => { e.stopPropagation(); toggleSelect(r.id) }}>
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleSelect(r.id)}
                              className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                          </td>
                          <td className="table-cell">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="code-main truncate">{formatSectionCode(r.tarima_code, r.completed_at || r.created_at)}</span>
                              <button
                                type="button"
                                onClick={(event) => handleCopyCode(event, formatSectionCode(r.tarima_code, r.completed_at || r.created_at))}
                                className="shrink-0 rounded-md p-0.5 text-warm-400 opacity-0 transition-all hover:bg-primary-100/70 hover:text-primary-600 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
                                title={t('common.copy')}
                              >
                                {copiedCode === formatSectionCode(r.tarima_code, r.completed_at || r.created_at)
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
                              {(r.completed_at || r.created_at || '').slice(0, 16).replace('T', ' ')}
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
                                onClick={e => { e.stopPropagation(); setDetailSession(r) }}
                                title={t('inventario.registros.detail')}>
                                <Eye size={13} />
                              </button>
                              {r.id === mostRecentId && canDelete && (
                                <button
                                  className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                                  onClick={e => { e.stopPropagation(); setDeleteConfirmId(r.id) }}
                                  title={t('inventario.registros.delete_last')}>
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
        onClose={() => setDetailSession(null)}
      />

      <Modal
        isOpen={!!exportConfirm && canExport}
        onClose={() => setExportConfirm(null)}
        title="Confirmar exportación"
        icon={Download}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setExportConfirm(null)}
              className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600 hover:bg-warm-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => { exportConfirm?.onConfirm(); setExportConfirm(null) }}
              className="px-4 py-2 rounded-xl bg-success-600 text-white text-sm font-semibold hover:bg-success-700 transition-colors">
              Exportar
            </button>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-sm text-warm-600">Se exportará la información visible en la tabla con los filtros actuales.</p>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-success-50 border border-success-100">
            <div className="w-9 h-9 rounded-xl bg-success-100 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-success-700" />
            </div>
            <div>
              <p className="text-[11px] text-success-600 font-semibold uppercase tracking-wide">Registros a exportar</p>
              <p className="text-2xl font-bold text-success-700 tabular-nums leading-tight">{exportConfirm?.count}</p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t('inventario.registros.delete_last')}
        icon={Trash2}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary" onClick={() => setDeleteConfirmId(null)}>{t('common.cancel')}</button>
            <button
              className="btn-primary bg-danger-600 hover:bg-danger-700"
              onClick={() => deleteMut.mutate(deleteConfirmId)}
              disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('common.delete')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-600">{t('inventario.registros.delete_confirm')}</p>
      </Modal>
    </div>
  )
}
