import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  X, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
  Clock, ScanBarcode, Package2, BadgeCheck, User, Timer,
  Loader2, AlertCircle, Eye, Truck, Calendar, Download, Pencil, Trash2,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { fmtDateTime, getToday, subtractDays, toDateKey } from '../../../core/utils/dateFormat'
import {
  getScanSessions, getScanSession, getOutboundList, getRecords,
  updateScanEvent, deleteScanEvent, addManualScanEvent, getManualEntryReasons, deleteScanSession,
} from '../services/surtidoService'
import { normalizeCode } from '../../Shared/Wms/normalizeCode'

const TH_CLASS = 'table-header whitespace-nowrap'
const TH_TEXT = 'inline-flex items-center text-xs font-semibold uppercase tracking-wider leading-none text-warm-500'

const STATUS_META = {
  open:               { labelKey: 'surtido.registros.status.open',               cls: 'bg-warning-100 text-warning-700' },
  complete:           { labelKey: 'surtido.registros.status.complete',           cls: 'bg-success-100 text-success-700' },
  with_discrepancies: { labelKey: 'surtido.registros.status.with_discrepancies', cls: 'bg-danger-100 text-danger-700' },
  cancelled:          { labelKey: 'surtido.registros.status.cancelled',          cls: 'bg-warm-100 text-warm-600' },
}

function resolveStatusLabel(t, key, fallbackKey = 'common.status') {
  if (!key) return '—'
  const label = t(key)
  return label === key ? t(fallbackKey) : label
}

function durationLabel(startedAt, endedAt) {
  if (!startedAt) return '—'
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date()
  const secs = Math.max(0, Math.floor((end - start) / 1000))
  const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${secs % 60}s`
  return `${secs}s`
}

function fmtDt(v) {
  if (!v) return '—'
  return fmtDateTime(v)
}

function ObcHeader({ obc, status, t }) {
  const [copied, setCopied] = useState(false)
  const meta = STATUS_META[status] ?? STATUS_META.open
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="code-main truncate">{obc || '—'}</span>
      {obc && (
        <button
          onClick={() => navigator.clipboard.writeText(obc).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
          className="shrink-0 p-0.5 rounded hover:bg-primary-100/60 text-warm-400 hover:text-primary-600 transition-all">
          {copied ? <Check size={13} className="text-success-600" /> : <Copy size={13} />}
        </button>
      )}
      <span className={`badge text-[11px] font-semibold shrink-0 ${meta.cls}`}>{resolveStatusLabel(t, meta.labelKey)}</span>
    </div>
  )
}

function ScanTable({ events, showType = false, t, editable = false, editingId, editingCode, onEditCodeChange, onStartEdit, onSaveEdit, onDelete }) {
  if (events.length === 0) return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-warm-400">
      <CheckCircle2 size={32} className="opacity-30" />
      <p className="text-sm">{t('common.noData')}</p>
    </div>
  )
  return (
    <div className="max-h-80 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
      <table className="w-full table-fixed text-xs">
        <thead className="bg-warm-50 sticky top-0 z-10 border-b border-warm-100">
          <tr>
            <th className={`${TH_CLASS} w-10`}><span className={TH_TEXT}>#</span></th>
            <th className={`${TH_CLASS} w-[44%]`}><span className={TH_TEXT}>{t('surtido.validacion.code_header')}</span></th>
            {showType && <th className={`${TH_CLASS} w-[18%]`}><span className={TH_TEXT}>Tipo</span></th>}
            <th className={`${TH_CLASS} w-[30%]`}><span className={TH_TEXT}>Fecha escaneo</span></th>
            {editable && <th className={`${TH_CLASS} w-[18%]`}><span className={TH_TEXT}>Acciones</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {events.map((e, i) => (
            <tr key={e.id || i} className={`table-row ${
              e.scan_result === 'duplicate' ? 'bg-warning-50/30' : ''
            }`}>
              <td className="px-3 py-2 text-warm-400 tabular-nums font-bold">{i + 1}</td>
              <td className="px-3 py-2 font-mono font-semibold text-warm-700 truncate">
                {editable && editingId === e.id ? (
                  <input
                    className="input-field h-8 w-full text-xs font-mono"
                    value={editingCode}
                    onChange={(event) => onEditCodeChange(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && onSaveEdit(e)}
                  />
                ) : (
                  e.normalized_code || e.scanned_code
                )}
              </td>
              {showType && (
                <td className="px-3 py-2">
                  <span className={`badge text-[10px] ${
                    e.scan_result === 'duplicate' ? 'bg-warning-100 text-warning-700' : 'bg-danger-100 text-danger-700'
                  }`}>
                    {e.scan_result === 'duplicate' ? t('surtido.escaneo.match_duplicate') : t('surtido.escaneo.match_rejected')}
                  </span>
                </td>
              )}
              <td className="px-3 py-2 text-warm-400 tabular-nums">
                {fmtDt(e.scanned_at || e.scan_time)}
              </td>
              {editable && (
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {editingId === e.id ? (
                      <button className="rounded-lg bg-primary-600 px-2 py-1 text-[10px] font-semibold text-white" onClick={() => onSaveEdit(e)}>
                        Guardar
                      </button>
                    ) : (
                      <button className="rounded-lg bg-warm-100 px-2 py-1 text-[10px] font-semibold text-warm-700" onClick={() => onStartEdit(e)}>
                        Editar
                      </button>
                    )}
                    <button className="rounded-lg bg-danger-50 px-2 py-1 text-[10px] font-semibold text-danger-700" onClick={() => onDelete(e)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailModal({ sessionId, isOpen, onClose, canExport, canEdit, canDelete, initialTab = 'validados' }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [detailTab, setDetailTab] = useState('validados')
  const [editingId, setEditingId] = useState(null)
  const [editingCode, setEditingCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newReasonId, setNewReasonId] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['surtido-session-detail', sessionId],
    queryFn: () => getScanSession(sessionId),
    enabled: isOpen && !!sessionId,
    staleTime: 30000,
    onSuccess: () => setDetailTab(initialTab),
  })

  // Correct data shape: { session: {...}, events: [...] }
  const session = data?.data?.session ?? {}
  const events  = data?.data?.events  ?? []

  // WMS data for destino + fecha entrega (uses cached list)
  const { data: wmsData } = useQuery({
    queryKey: ['wms-outbound'],
    queryFn: getOutboundList,
    staleTime: 5 * 60 * 1000,
    enabled: isOpen && !!session.outbound_order_no,
  })
  const wmsOrder = getRecords(wmsData)
    .find(r => r.outboundOrderNo === session.outbound_order_no)
  const { data: reasonsData } = useQuery({
    queryKey: ['wms-manual-entry-reasons'],
    queryFn: getManualEntryReasons,
    enabled: isOpen && !!sessionId,
    staleTime: 60000,
  })

  const validados  = events.filter(e => e.scan_result === 'ok')
  const rechazados = events.filter(e => e.scan_result !== 'ok')

  const totalExpected = session.total_expected ?? 0
  const totalScanned  = session.total_scanned ?? validados.length
  const destino      = wmsOrder?.receiverName || wmsOrder?.consignee || '—'
  const fechaEntrega = (wmsOrder?.expectedTime || wmsOrder?.outboundTime)
    ? fmtDt(wmsOrder?.expectedTime || wmsOrder?.outboundTime)
    : '—'
  const referencia   = wmsOrder?.thirdOrderNo || wmsOrder?.referenceNo || '—'
  const tracking     = wmsOrder?.logisticsTrackNo || '—'
  const editableSession = session.status === 'open'

  const updateMut = useMutation({
    mutationFn: ({ id, code }) => updateScanEvent(id, {
      scanned_code: code,
      normalized_code: normalizeCode(code),
    }),
    onSuccess: () => {
      setEditingId(null)
      setEditingCode('')
      qc.invalidateQueries({ queryKey: ['surtido-session-detail', sessionId] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const deleteMut = useMutation({
    mutationFn: deleteScanEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surtido-session-detail', sessionId] }),
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const createMut = useMutation({
    mutationFn: () => addManualScanEvent({
      session_id: sessionId,
      scanned_code: newCode,
      normalized_code: normalizeCode(newCode),
      quantity: 1,
      manual_reason_id: Number(newReasonId),
      manual_reason_label: getRecords(reasonsData).find((reason) => String(reason.id) === newReasonId)?.nombre || null,
    }),
    onSuccess: () => {
      setNewCode('')
      setNewReasonId('')
      qc.invalidateQueries({ queryKey: ['surtido-session-detail', sessionId] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  useEffect(() => {
    setDetailTab(initialTab)
    setEditingId(null)
    setEditingCode('')
  }, [initialTab, isOpen])

  const handleClose = () => { setDetailTab(initialTab); onClose() }

  const handleExportDetail = () => {
    try {
      const wb = XLSX.utils.book_new()
      const info = [
        ['Orden WMS', session.outbound_order_no || ''],
        ['Destino', destino],
        ['Referencia', referencia],
        ['Tracking', tracking],
        ['Fecha entrega', fechaEntrega],
        ['Validador', session.operator_nombre || ''],
        ['Inicio', fmtDt(session.started_at)],
        ['Final', fmtDt(session.ended_at ?? session.completed_at)],
        ['Duración', durationLabel(session.started_at, session.ended_at ?? session.completed_at)],
        ['Esperado', totalExpected],
        ['Validado', totalScanned],
        ['Estado', session.status || ''],
        [],
        ['#', 'Código', 'Resultado', 'Fecha escaneo'],
        ...events.map((e, i) => [
          i + 1,
          e.normalized_code || e.scanned_code || '',
          e.scan_result || '',
          fmtDt(e.scanned_at || e.scan_time),
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(info)
      ws['!cols'] = [{ wch: 20 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Detalle')
      XLSX.writeFile(wb, `surtido_${session.outbound_order_no || sessionId}_${getToday()}.xlsx`)
      toast.success('Exportación completada')
    } catch { toast.error(t('toast.error')) }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isLoading
        ? <span className="text-warm-400 text-sm">{t('common.loading')}</span>
        : <ObcHeader obc={session.outbound_order_no} status={session.status} t={t} />
      }
      icon={BadgeCheck}
      size="xl"
      headerAction={!isLoading && events.length > 0 && canExport && (
        <button
          onClick={handleExportDetail}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success-50 text-success-700 rounded-lg hover:bg-success-100 font-semibold transition-all border border-success-200">
          <Download className="w-3.5 h-3.5" /> {t('common.export')}
        </button>
      )}
      footer={
        <div className="flex justify-end">
          <button className="btn-secondary" onClick={handleClose}>{t('common.close')}</button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-warm-400">
          <Loader2 size={18} className="animate-spin" /> {t('common.loading')}
        </div>
      ) : (
        <div className="space-y-4">

          {/* Row 1: delivery info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: 'Fecha entrega', v: fechaEntrega },
              { l: 'Destino',       v: destino },
              { l: 'Referencia',    v: referencia },
              { l: 'Tracking',      v: tracking },
            ].map(f => (
              <div key={f.l} className="p-3 rounded-xl bg-warm-50 border border-warm-100/50">
                <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-0.5">{f.l}</p>
                <p className="text-sm font-semibold text-warm-700 truncate">{f.v}</p>
              </div>
            ))}
          </div>

          {/* Row 2: operational info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: 'Validador', v: session.operator_nombre || '—' },
              { l: 'Inicio',    v: fmtDt(session.started_at) },
              { l: 'Final',     v: fmtDt(session.ended_at ?? session.completed_at) },
              { l: 'Duración',  v: durationLabel(session.started_at, session.ended_at ?? session.completed_at) },
            ].map(f => (
              <div key={f.l} className="p-3 rounded-xl bg-warm-50 border border-warm-100/50">
                <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-0.5">{f.l}</p>
                <p className="text-sm font-semibold text-warm-700 truncate">{f.v}</p>
              </div>
            ))}
          </div>

          {/* Notes */}
          {session.notes && (
            <div className="bg-warm-50 rounded-xl px-3 py-2.5 border border-warm-100 flex items-start gap-2">
              <AlertCircle size={13} className="text-warm-400 shrink-0 mt-0.5" />
              <p className="text-xs text-warm-700">{session.notes}</p>
            </div>
          )}

          {/* Discrepancy banner */}
          {rechazados.length > 0 && (
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-danger-700">
                {rechazados.length} {rechazados.length === 1 ? 'caja no validada' : 'cajas no validadas'} (rechazadas o duplicadas)
              </p>
            </div>
          )}

          {/* Tabs — sticky */}
          <div className="sticky top-0 z-10 bg-white -mx-1 px-1 flex gap-1 border-b border-warm-100">
            <button onClick={() => setDetailTab('validados')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                detailTab === 'validados' ? 'text-primary-600 border-primary-500' : 'text-warm-400 border-transparent hover:text-warm-600'
              }`}>
              <CheckCircle2 size={12} /> {t('surtido.registros.detail.validated')}
              <span className="bg-success-100 text-success-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case tabular-nums">{totalScanned}/{totalExpected}</span>
            </button>
            <button onClick={() => setDetailTab('rechazados')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                detailTab === 'rechazados' ? 'text-primary-600 border-primary-500' : 'text-warm-400 border-transparent hover:text-warm-600'
              }`}>
              <XCircle size={12} /> {t('surtido.escaneo.tab_rechazados')}
              {rechazados.length > 0 && (
                <span className="bg-danger-100 text-danger-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case">{rechazados.length}</span>
              )}
            </button>
          </div>

          {/* Tab content */}
          {detailTab === 'validados' && (
            <div className="space-y-3">
              <ScanTable
                events={validados}
                t={t}
                editable={editableSession && canEdit}
                editingId={editingId}
                editingCode={editingCode}
                onEditCodeChange={setEditingCode}
                onStartEdit={(event) => { setEditingId(event.id); setEditingCode(event.normalized_code || event.scanned_code || '') }}
                onSaveEdit={(event) => updateMut.mutate({ id: event.id, code: editingCode.trim() })}
                onDelete={(event) => canDelete && deleteMut.mutate(event.id)}
              />
              {editableSession && canEdit && (
                <div className="grid grid-cols-[minmax(0,1fr)_12rem_auto] gap-2 rounded-xl border border-warm-100 bg-warm-50/70 p-3">
                  <input
                    className="input-field text-sm font-mono"
                    placeholder="Codigo"
                    value={newCode}
                    onChange={(event) => setNewCode(event.target.value)}
                  />
                  <select className="input-field text-sm" value={newReasonId} onChange={(event) => setNewReasonId(event.target.value)}>
                    <option value="">Motivo</option>
                    {getRecords(reasonsData).map((reason) => <option key={reason.id} value={String(reason.id)}>{reason.nombre}</option>)}
                  </select>
                  <button className="btn-primary" disabled={!newCode.trim() || !newReasonId || createMut.isPending} onClick={() => createMut.mutate()}>
                    Agregar
                  </button>
                </div>
              )}
            </div>
          )}
          {detailTab === 'rechazados' && (
            <ScanTable
              events={rechazados}
              t={t}
              showType
              editable={editableSession && canEdit}
              editingId={editingId}
              editingCode={editingCode}
              onEditCodeChange={setEditingCode}
              onStartEdit={(event) => { setEditingId(event.id); setEditingCode(event.normalized_code || event.scanned_code || '') }}
              onSaveEdit={(event) => updateMut.mutate({ id: event.id, code: editingCode.trim() })}
              onDelete={(event) => canDelete && deleteMut.mutate(event.id)}
            />
          )}

        </div>
      )}
    </Modal>
  )
}

export default function SurtidoRegistros() {
  const { t } = useI18nStore()
  const { hasPermission } = useAuthStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const canExport = hasPermission('surtido.registros', 'actualizar')
  const canEdit = hasPermission('surtido.validacion', 'actualizar')
  const canDelete = hasPermission('surtido.validacion', 'eliminar')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [copiedCode, setCopiedCode] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const today = getToday()
  const thirtyDaysAgo = subtractDays(today, 30)
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [datePreset, setDatePreset] = useState('30')
  const [detailId, setDetailId] = useState(null)
  const [detailInitialTab, setDetailInitialTab] = useState('validados')
  const [deleteConfirmSession, setDeleteConfirmSession] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportingBulk, setExportingBulk] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['surtido-sessions', { page, pageSize }],
    queryFn: () => getScanSessions({ page, pageSize }),
    staleTime: 30000,
  })

  const records = getRecords(data)
  const total = data?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize) || 1

  const deleteSessionMut = useMutation({
    mutationFn: deleteScanSession,
    onSuccess: () => {
      toast.success(t('surtido.registros.delete_session_success'))
      setDeleteConfirmSession(null)
      setDetailId(null)
      qc.invalidateQueries({ queryKey: ['surtido-sessions'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const filtered = search.trim()
    ? records.filter(r => {
        const q = search.toLowerCase()
        return (r.outbound_order_no || '').toLowerCase().includes(q)
            || (r.operator_nombre || '').toLowerCase().includes(q)
            || (r.status || '').toLowerCase().includes(q)
      })
    : records

  const matchesDate = (row) => {
    const raw = row?.started_at || row?.created_at || ''
    if (!raw) return true
    const d = toDateKey(raw)
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    return true
  }

  const filteredByStatus = statusFilter
    ? filtered.filter(r => r.status === statusFilter && matchesDate(r))
    : filtered.filter(matchesDate)

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setDateFrom(thirtyDaysAgo)
    setDateTo(today)
    setDatePreset('30')
  }

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredByStatus.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredByStatus.map(r => r.id)))
  }
  function buildRegistrosRows(rows) {
    return rows.map(r => {
      const rejected = Math.max(0, (r.total_expected ?? 0) - (r.total_scanned ?? 0))
      return [
        r.outbound_order_no || '',
        r.operator_nombre || '',
        r.started_at || '',
        r.ended_at || '',
        durationLabel(r.started_at, r.ended_at),
        r.total_expected ?? 0,
        r.total_scanned ?? 0,
        rejected,
        r.status || '',
      ]
    })
  }

  const REGISTROS_HEADERS = ['Orden WMS', 'Operador', 'Inicio', 'Final', 'Duración', 'Esperado', 'Validado', 'Rechazado', 'Estado']
  const COL_WIDTHS = [{ wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }]

  function writeExcel(dataRows, filename) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([REGISTROS_HEADERS, ...dataRows])
    ws['!cols'] = COL_WIDTHS
    XLSX.utils.book_append_sheet(wb, ws, 'Registros Surtido')
    XLSX.writeFile(wb, filename)
    toast.success('Exportación completada')
  }

  const handleBulkExport = () => {
    if (selectedIds.size === 0) return
    setExportingBulk(true)
    try {
      writeExcel(buildRegistrosRows(filteredByStatus.filter(r => selectedIds.has(r.id))), `surtido_registros_${getToday()}.xlsx`)
      setSelectedIds(new Set())
    } catch { toast.error(t('toast.error')) }
    setExportingBulk(false)
  }

  const handleExportAll = () => {
    try {
      writeExcel(buildRegistrosRows(filteredByStatus), `surtido_registros_${getToday()}.xlsx`)
    } catch { toast.error(t('toast.error')) }
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

  const openDetail = (sessionId, initialTab = 'validados') => {
    setDetailInitialTab(initialTab)
    setDetailId(sessionId)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('surtido.registros.title')} subtitle={t('nav.surtido_wms')} />
        <LoadingSpinner text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('surtido.registros.title')} subtitle={t('nav.surtido_wms')} />

      <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDatePreset(''); setDateFrom(e.target.value); setPage(1) }}
              className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <span className="text-warm-300 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDatePreset(''); setDateTo(e.target.value); setPage(1) }}
              className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {[
            { label: t('shortcut.today'), d: 0 },
            { label: t('shortcut.7days'), d: 7 },
            { label: t('shortcut.30days'), d: 30 },
          ].map(({ label, d }) => (
            <button
              key={label}
              onClick={() => {
                const end = today
                const start = d === 0
                  ? today
                  : subtractDays(today, d)
                setDatePreset(String(d))
                setDateFrom(start)
                setDateTo(end)
                setPage(1)
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                datePreset === String(d)
                  ? 'bg-primary-50 text-primary-700 border-primary-200'
                  : 'bg-warm-100 text-warm-600 border-warm-200 hover:bg-warm-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-10 pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:shadow-sm transition-all cursor-pointer"
          >
            <option value="">{t('common.all')}</option>
            <option value="open">{t('surtido.registros.status.open')}</option>
            <option value="complete">{t('surtido.registros.status.complete')}</option>
            <option value="with_discrepancies">{t('surtido.registros.status.with_discrepancies')}</option>
            <option value="cancelled">{t('surtido.registros.status.cancelled')}</option>
          </select>

          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 w-full max-w-sm transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
            <ScanBarcode size={13} className="text-warm-400 shrink-0" />
            <input
              type="text"
              className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder={t('surtido.registros.search_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {(search || statusFilter || dateFrom !== thirtyDaysAgo || dateTo !== today) && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
            >
              <X className="w-3 h-3" /> {t('common.clear')}
            </button>
          )}

          {canExport && (
            <button
              onClick={handleExportAll}
              disabled={filteredByStatus.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 h-9 rounded-xl bg-success-50 text-success-700 border border-success-200 hover:bg-success-100 transition-all disabled:opacity-40"
              title={t('common.export') + ' ' + t('common.all')}
            >
              <Download className="w-3.5 h-3.5" /> {t('common.export')}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filteredByStatus.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
              <Package2 size={28} className="text-warm-300" />
            </div>
            <p className="text-sm text-warm-400 font-medium">{t('common.noData')}</p>
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
                        checked={selectedIds.size === filteredByStatus.length && filteredByStatus.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                    </th>
                    <th className={TH_CLASS}><span className={TH_TEXT}>{t('surtido.registros.order_no')}</span></th>
                    <th className={`${TH_CLASS} hidden lg:table-cell`}><span className={TH_TEXT}>{t('surtido.registros.operator')}</span></th>
                    <th className={`${TH_CLASS} hidden md:table-cell`}><span className={TH_TEXT}>{t('surtido.registros.date')}</span></th>
                    <th className={`${TH_CLASS} hidden lg:table-cell`}><span className={TH_TEXT}>{t('surtido.registros.duration')}</span></th>
                    <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('surtido.registros.expected')}</span></th>
                    <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>{t('surtido.registros.validated')}</span></th>
                    <th className={`${TH_CLASS} text-right hidden md:table-cell`}><span className={TH_TEXT}>{t('surtido.registros.rejected')}</span></th>
                    <th className={TH_CLASS}><span className={TH_TEXT}>{t('surtido.registros.status')}</span></th>
                    <th className={`${TH_CLASS} text-right`}><span className={TH_TEXT}>Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {filteredByStatus.map(r => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.open
                    const rejected = Math.max(0, (r.total_expected ?? 0) - (r.total_scanned ?? 0))
                    const pct = r.total_expected > 0
                      ? Math.min(100, Math.round(((r.total_scanned ?? 0) / r.total_expected) * 100))
                      : null
                    const isSelected = selectedIds.has(r.id)
                    return (
                      <tr key={r.id}
                        onClick={() => openDetail(r.id)}
                        className={`table-row group cursor-pointer ${isSelected ? 'bg-primary-50/40' : ''}`}>
                        <td className="table-cell text-center" onClick={e => { e.stopPropagation(); toggleSelect(r.id) }}>
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleSelect(r.id)}
                            className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                        </td>
                        <td className="table-cell">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-mono font-bold text-primary-700 text-xs">{r.outbound_order_no || '—'}</span>
                            {r.outbound_order_no && (
                              <button
                                type="button"
                                onClick={(event) => handleCopyCode(event, r.outbound_order_no)}
                                className="shrink-0 rounded-md p-0.5 text-warm-400 opacity-0 transition-all hover:bg-primary-100/70 hover:text-primary-600 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
                                title={t('common.copy')}
                              >
                                {copiedCode === r.outbound_order_no
                                  ? <Check size={13} className="text-success-600" />
                                  : <Copy size={13} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="table-cell hidden lg:table-cell text-warm-600 text-xs">{r.operator_nombre || '—'}</td>
                        <td className="table-cell hidden md:table-cell">
                          <span className="text-warm-500 text-xs tabular-nums">
                            {(r.started_at || r.created_at) ? fmtDateTime(r.started_at || r.created_at) : '—'}
                          </span>
                        </td>
                        <td className="table-cell hidden lg:table-cell">
                          <span className="text-warm-500 text-xs inline-flex items-center gap-1">
                            <Clock size={10} className="text-warm-300" />
                            {durationLabel(r.started_at, r.ended_at)}
                          </span>
                        </td>
                        <td className="table-cell text-right">
                          <span className="text-warm-500 text-xs tabular-nums">{r.total_expected ?? 0}</span>
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold text-success-600 text-sm tabular-nums">{r.total_scanned ?? 0}</span>
                            {pct !== null && (
                              <div className="w-12 h-1.5 bg-warm-100 rounded-full overflow-hidden hidden xl:block">
                                <div className={`h-full rounded-full ${pct >= 100 ? 'bg-success-500' : 'bg-primary-400'}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="table-cell text-right hidden md:table-cell">
                          <span className={`font-bold text-xs tabular-nums ${rejected > 0 ? 'text-danger-600' : 'text-warm-300'}`}>
                            {rejected}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className={`badge text-[11px] font-medium ${meta.cls}`}>{resolveStatusLabel(t, meta.labelKey)}</span>
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                              onClick={e => { e.stopPropagation(); openDetail(r.id) }}
                              title={t('common.show')}>
                              <Eye size={13} />
                            </button>
                            {canEdit && (
                              <button
                                className="p-1.5 rounded-lg text-warm-400 hover:text-warning-600 hover:bg-warning-50 border border-transparent hover:border-warning-200 transition-all"
                                onClick={e => { e.stopPropagation(); openDetail(r.id, 'validados') }}
                                title={t('common.edit')}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="p-1.5 rounded-lg text-warm-400 hover:text-danger-600 hover:bg-danger-50 border border-transparent hover:border-danger-200 transition-all"
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
              itemLabel={t('surtido.historial.sessions')}
            />
          </div>
        )}
      </div>

      <DetailModal
        sessionId={detailId}
        isOpen={!!detailId}
        onClose={() => { setDetailId(null); setDetailInitialTab('validados') }}
        canExport={canExport}
        canEdit={canEdit}
        canDelete={canDelete}
        initialTab={detailInitialTab}
      />

      <Modal
        isOpen={!!deleteConfirmSession}
        onClose={() => setDeleteConfirmSession(null)}
        title={t('surtido.registros.delete_session_title')}
        icon={Trash2}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-secondary" onClick={() => setDeleteConfirmSession(null)}>{t('common.cancel')}</button>
            <button
              className="btn-primary inline-flex items-center gap-2 whitespace-nowrap bg-danger-600 hover:bg-danger-700"
              onClick={() => deleteSessionMut.mutate(deleteConfirmSession.id)}
              disabled={deleteSessionMut.isPending}>
              {deleteSessionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('common.delete')}
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-warm-600">
          <p>{t('surtido.registros.delete_session_confirm')}</p>
          <div className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2">
            <p className="font-semibold text-danger-700">{deleteConfirmSession?.outbound_order_no || '—'}</p>
            <p className="text-xs text-danger-600">
              {(deleteConfirmSession?.total_scanned ?? 0)} {t('surtido.registros.delete_session_count')}
              {' · '}
              {resolveStatusLabel(t, `surtido.registros.status.${deleteConfirmSession?.status || ''}`)}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
