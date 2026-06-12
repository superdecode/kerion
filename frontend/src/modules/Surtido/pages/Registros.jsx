import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  X, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
  Clock, ScanBarcode, Package2, BadgeCheck, User, Timer,
  Loader2, AlertCircle, Eye, Truck, Calendar, Download, Edit3, Trash2, Search, ChevronRight,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { fmtDateTime, getToday, subtractDays, fmtDate } from '../../../core/utils/dateFormat'
import {
  getScanSessions, getScanSession, getOutboundList, getRecords,
  updateScanEvent, deleteScanEvent, addManualScanEvent, getManualEntryReasons, deleteScanSession,
  getOrderTrackingByOBC, getBoxIncidents, getScanOperators,
} from '../services/surtidoService'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { normalizeCode, generateCodeVariations } from '../../Shared/Wms/normalizeCode'

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
    retry: 0,
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
    retry: 0,
  })

  // Order tracking notes
  const { data: trackingData } = useQuery({
    queryKey: ['surtido-order-tracking-obc', session.outbound_order_no],
    queryFn: () => getOrderTrackingByOBC(session.outbound_order_no),
    enabled: isOpen && !!session.outbound_order_no,
    staleTime: 60000,
    retry: 0,
  })
  const trackingNotes = trackingData?.data?.notes || null
  const wmsOrder = getRecords(wmsData)
    .find(r => r.outboundOrderNo === session.outbound_order_no)
  const { data: reasonsData } = useQuery({
    queryKey: ['wms-manual-entry-reasons'],
    queryFn: getManualEntryReasons,
    enabled: isOpen && !!sessionId,
    staleTime: 60000,
    retry: 0,
  })

  const { data: incidenciasData } = useQuery({
    queryKey: ['surtido-box-incidents', session.outbound_order_no],
    queryFn: () => getBoxIncidents(session.outbound_order_no),
    enabled: isOpen && !!session.outbound_order_no,
    staleTime: 30000,
    retry: 0,
  })
  const incidencias = incidenciasData?.data ?? []

  // Build a map of box_code → matched_box_type from events for the Incidencias tab
  const eventTypeMap = useMemo(() => {
    const m = {}
    events.forEach(e => {
      if (e.normalized_code && e.matched_box_type) m[e.normalized_code] = e.matched_box_type
    })
    return m
  }, [events])

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

          {/* Session notes */}
          {session.notes && (
            <div className="bg-warm-50 rounded-xl px-3 py-2.5 border border-warm-100 flex items-start gap-2">
              <AlertCircle size={13} className="text-warm-400 shrink-0 mt-0.5" />
              <p className="text-xs text-warm-700">{session.notes}</p>
            </div>
          )}

          {/* Order tracking notes */}
          {trackingNotes && (
            <div className="bg-primary-50 rounded-xl px-3 py-2.5 border border-primary-100 flex items-start gap-2">
              <User size={13} className="text-primary-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] text-primary-400 uppercase tracking-wider font-bold mb-0.5">Nota de orden</p>
                <p className="text-xs text-primary-700">{trackingNotes}</p>
              </div>
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
            <button onClick={() => setDetailTab('incidencias')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                detailTab === 'incidencias' ? 'text-primary-600 border-primary-500' : 'text-warm-400 border-transparent hover:text-warm-600'
              }`}>
              <AlertTriangle size={12} /> Incidencias
              {incidencias.length > 0 && (
                <span className="bg-warning-100 text-warning-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case">{incidencias.length}</span>
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
          {detailTab === 'incidencias' && (
            <IncidenciasTable incidencias={incidencias} eventTypeMap={eventTypeMap} t={t} />
          )}

        </div>
      )}
    </Modal>
  )
}

const BOX_INCIDENCE_META = {
  faltante:    { cls: 'bg-danger-100 text-danger-700',   dot: 'bg-danger-500' },
  anormalidad: { cls: 'bg-warning-100 text-warning-700', dot: 'bg-warning-500' },
  reparacion:  { cls: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-500' },
  rastreo:     { cls: 'bg-sky-100 text-sky-700',         dot: 'bg-sky-500' },
}

function IncidenciasTable({ incidencias, eventTypeMap, t }) {
  if (incidencias.length === 0) return (
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
            <th className={`${TH_CLASS} w-[18%]`}><span className={TH_TEXT}>Tipo Caja</span></th>
            <th className={`${TH_CLASS} w-[30%]`}><span className={TH_TEXT}>Código Caja</span></th>
            <th className={`${TH_CLASS} w-[18%]`}><span className={TH_TEXT}>Estatus</span></th>
            <th className={`${TH_CLASS} w-[22%]`}><span className={TH_TEXT}>Fecha Cambio</span></th>
            <th className={`${TH_CLASS}`}><span className={TH_TEXT}>Usuario</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {incidencias.map((inc, i) => {
            const meta = BOX_INCIDENCE_META[inc.estado] ?? BOX_INCIDENCE_META.faltante
            return (
              <tr key={i} className="table-row">
                <td className="px-3 py-2 text-warm-500 text-[11px]">
                  {eventTypeMap[inc.box_code] || '—'}
                </td>
                <td className="px-3 py-2 font-mono font-semibold text-warm-700 truncate">
                  {inc.box_code}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                    <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
                    {t(`surtido.ordenes.box_status.${inc.estado}`) || inc.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-warm-500 tabular-nums text-[11px]">
                  {inc.updated_at ? fmtDt(inc.updated_at) : '—'}
                </td>
                <td className="px-3 py-2 text-warm-600 text-[11px] truncate">
                  {inc.updated_by || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function QuickSearchModal({ isOpen, onClose, onValidate }) {
  const { t } = useI18nStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const inputRef = useRef(null)

  const { data: trackingData } = useQuery({
    queryKey: ['wms-scan-sessions-quick'],
    queryFn: () => getScanSessions({ pageSize: 500 }),
    staleTime: 60000,
    enabled: isOpen,
  })

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults(null)
      setSearchError(null)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  const trackingMap = useMemo(() => {
    const raw = getRecords(trackingData)
    const map = new Map()
    raw.forEach(s => { if (s.outbound_order_no) map.set(s.outbound_order_no, s) })
    return map
  }, [trackingData])

  async function doSearch(q) {
    if (!q.trim()) return
    setIsSearching(true)
    setSearchError(null)
    try {
      const data = await getOutboundList()
      const all = getRecords(data)
      if (all.length === 0) {
        setSearchError('La hoja de salidas no contiene registros. Verifica la configuracion en WmsHub.')
        setResults([])
        return
      }
      const norm = q.trim().toLowerCase()
      const variations = generateCodeVariations(q.trim()).map(v => v.toLowerCase())
      const matchesVariation = (field) => {
        const f = (field || '').toLowerCase()
        return variations.some(v => f.includes(v))
      }
      const filtered = all.filter(r =>
        matchesVariation(r.outboundOrderNo) ||
        matchesVariation(r.thirdOrderNo) ||
        matchesVariation(r.logisticsTrackNo) ||
        (r.receiverName || '').toLowerCase().includes(norm) ||
        matchesVariation(r.customizeCode) ||
        matchesVariation(r.boxType)
      )
      setResults(filtered.slice(0, 20))
    } catch (err) {
      const code = err?.code
      if (code === 'SHEET_NOT_CONFIGURED') {
        setSearchError('La hoja de salidas no esta configurada. Ve a WmsHub -> Configuracion y guarda la URL de salidas.')
      } else if (code === 'SHEET_EMPTY') {
        setSearchError('La hoja de Google Sheets esta vacia o tiene menos de 2 filas. Verifica el contenido.')
      } else if (err?.message?.includes('HTTP')) {
        setSearchError(`Error al obtener la hoja: ${err.message}. Verifica la URL y los permisos de acceso.`)
      } else {
        setSearchError(`Error de conexion: ${err?.message ?? 'desconocido'}. Verifica tu red y la URL configurada en WmsHub.`)
      }
      setResults(null)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.validacion.quick_search_title')} icon={Search} size="lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 h-12 bg-warm-50 border-2 border-warm-200 rounded-2xl px-4 transition-all focus-within:border-primary-400 focus-within:shadow-sm overflow-hidden">
            <ScanBarcode className="w-4 h-4 text-warm-300 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 min-w-0 h-full text-base bg-transparent outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-warm-300 font-mono tracking-wide"
              placeholder={t('surtido.validacion.quick_search_placeholder')}
              value={query}
              onChange={e => { setQuery(e.target.value); setSearchError(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && query.trim()) doSearch(query.trim()) }}
            />
          </div>
          <button
            className="btn-primary px-5 h-12 shadow-glow"
            onClick={() => doSearch(query.trim())}
            disabled={!query.trim() || isSearching}
          >
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </button>
        </div>

        {searchError && (
          <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 flex items-start gap-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
            <p className="text-danger-700 leading-snug">{searchError}</p>
          </div>
        )}

        {!searchError && results === null && (
          <div className="text-center py-10 text-sm text-warm-400">
            {t('surtido.validacion.quick_search_hint')}
          </div>
        )}

        {!searchError && results && results.length === 0 && (
          <div className="text-center py-10 text-sm text-warm-400">
            {t('surtido.validacion.quick_search_empty')}
          </div>
        )}

        {results && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[58vh] overflow-y-auto scrollbar-thin pr-1">
            {results.map(r => {
              const tracking = trackingMap.get(r.outboundOrderNo)
              const pct = tracking && (tracking.total_expected ?? 0) > 0
                ? Math.min(100, Math.round(((tracking.total_scanned ?? 0) / tracking.total_expected) * 100))
                : null
              const isComplete = tracking?.status === 'complete' || tracking?.status === 'partial' || (pct !== null && pct >= 100)
              const isValidating = !isComplete && tracking?.status === 'validating'

              let statusBadge = null
              if (tracking) {
                statusBadge = isComplete
                  ? <span className="badge text-[10px] bg-success-100 text-success-700 shrink-0">Completa</span>
                  : isValidating
                  ? <span className="badge text-[10px] bg-primary-100 text-primary-700 shrink-0">Validando</span>
                  : <span className="badge text-[10px] bg-warm-100 text-warm-600 shrink-0">{tracking.status}</span>
              } else {
                statusBadge = <span className="badge text-[10px] bg-warm-100 text-warm-500 shrink-0">{t('surtido.validacion.card_not_validated')}</span>
              }

              return (
                <div key={r.outboundOrderNo} className="rounded-2xl border border-warm-200 bg-white shadow-sm hover:shadow-md hover:border-primary-200 transition-all overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-gradient-to-r from-primary-50 to-accent-50/40 border-b border-warm-100 flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sm text-warm-900 truncate">{r.outboundOrderNo}</span>
                    {statusBadge}
                  </div>

                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs flex-1">
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_delivery')}</p>
                      <p className="font-medium text-warm-700 mt-0.5 truncate">{r.outboundTime ? fmtDate(r.outboundTime) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_destination')}</p>
                      <p className="font-medium text-warm-700 mt-0.5 truncate">{r.receiverName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_channel')}</p>
                      <p className="font-medium text-warm-700 mt-0.5 truncate">{r.logisticsChannel || '—'}</p>
                    </div>
                    <div>
                      <p className="text-warm-400 uppercase tracking-wide text-[10px]">{t('surtido.validacion.card_boxes')}</p>
                      <p className="font-bold text-warm-800 mt-0.5">{r.outboundBoxCount || '—'}</p>
                    </div>
                  </div>

                  {pct !== null && (
                    <div className="px-4 pb-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-warm-400 uppercase tracking-wide">{t('surtido.validacion.card_progress')}</span>
                        <span className={`font-bold ${isComplete ? 'text-success-600' : 'text-primary-600'}`}>
                          {tracking.total_scanned ?? 0}/{tracking.total_expected ?? '?'} · {pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isComplete ? 'bg-success-400' : 'bg-primary-400'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="px-4 pb-3 pt-1">
                    {isComplete ? (
                      <button
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-warm-100 text-warm-700 text-xs font-semibold hover:bg-warm-200 transition-colors shadow-sm"
                        onClick={() => { onClose(); navigate(`/Surtido/registros?obc=${encodeURIComponent(r.outboundOrderNo)}`) }}>
                        <BadgeCheck size={11} /> Ver Registros
                      </button>
                    ) : (
                      <button
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm"
                        onClick={() => { onValidate(r.outboundOrderNo); onClose() }}>
                        <ScanBarcode size={11} /> {t('surtido.validacion.card_validate')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function SurtidoRegistros() {
  const { t } = useI18nStore()
  const { hasPermission } = useAuthStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const canExport = hasPermission('surtido.registros', 'actualizar')
  const canEdit = hasPermission('surtido.validacion', 'actualizar')
  const canDelete = hasPermission('surtido.validacion', 'eliminar')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [copiedCode, setCopiedCode] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const searchDebounceRef = useRef(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [operatorFilter, setOperatorFilter] = useState([])
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
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const handledDeepLinkRef = useRef('')

  const obcActive = !!search.trim()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['surtido-sessions', { page, pageSize, search: search.trim(), statusFilter, operatorFilter, dateFrom: obcActive ? null : dateFrom, dateTo: obcActive ? null : dateTo }],
    queryFn: () => getScanSessions({
      page,
      pageSize,
      outbound_order_no: search.trim() || undefined,
      status: statusFilter || undefined,
      operator_ids: operatorFilter.length > 0 ? operatorFilter.join(',') : undefined,
      fecha_inicio: obcActive ? undefined : (dateFrom || undefined),
      fecha_fin: obcActive ? undefined : (dateTo || undefined),
    }),
    staleTime: 30000,
    retry: 0,
    enabled: backendOnline,
  })

  const { data: operatorsData } = useQuery({
    queryKey: ['scan-operators'],
    queryFn: getScanOperators,
    staleTime: 300000,
    enabled: backendOnline,
  })
  const surtidoresOptions = (operatorsData?.data ?? []).map(s => ({ value: String(s.id), label: s.nombre || String(s.id) }))

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

  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setStatusFilter('')
    setOperatorFilter([])
    setDateFrom(thirtyDaysAgo)
    setDateTo(today)
    setDatePreset('30')
    setPage(1)
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
      writeExcel(buildRegistrosRows(records.filter(r => selectedIds.has(r.id))), `surtido_registros_${getToday()}.xlsx`)
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

  const openDetail = (sessionId, initialTab = 'validados') => {
    setDetailInitialTab(initialTab)
    setDetailId(sessionId)
  }

  useEffect(() => {
    const sessionId = searchParams.get('sessionId')
    const obc = searchParams.get('obc')
    const tab = searchParams.get('tab') || 'validados'
    const key = `${sessionId || ''}:${obc || ''}:${tab}`
    if ((!sessionId && !obc) || handledDeepLinkRef.current === key) return
    handledDeepLinkRef.current = key

    if (sessionId) {
      openDetail(sessionId, tab)
      return
    }

    let cancelled = false
    setSearchInput(obc)
    setSearch(obc)
    setPage(1)
    setDateFrom('')
    setDateTo('')
    setDatePreset('')

    getScanSessions({ page: 1, pageSize: 1, outbound_order_no: obc })
      .then((payload) => {
        if (cancelled) return
        const session = getRecords(payload)[0]
        if (session?.id) openDetail(session.id, tab)
        else toast.error('No se encontró validación para esta orden')
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.response?.data?.error || t('toast.error'))
      })

    return () => { cancelled = true }
  }, [searchParams, t, toast])

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('surtido.registros.title')}
        subtitle={t('nav.surtido_wms')}
        actions={
          <button
            type="button"
            onClick={() => setShowQuickSearch(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-warm-200 bg-warm-100 text-warm-400 transition-all hover:bg-primary-50 hover:text-primary-600"
            title={t('surtido.validacion.quick_search_title')}
            aria-label={t('surtido.validacion.quick_search_title')}
          >
            <Search className="w-4 h-4" />
          </button>
        }
      />

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
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="h-10 pl-3 pr-8 rounded-xl border border-warm-200 text-sm text-warm-700 bg-warm-50 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:shadow-sm transition-all cursor-pointer"
          >
            <option value="">{t('common.all')}</option>
            <option value="open">{t('surtido.registros.status.open')}</option>
            <option value="complete">{t('surtido.registros.status.complete')}</option>
            <option value="with_discrepancies">{t('surtido.registros.status.with_discrepancies')}</option>
            <option value="cancelled">{t('surtido.registros.status.cancelled')}</option>
          </select>

          {surtidoresOptions.length > 0 && (
            <MultiSelect
              options={surtidoresOptions}
              selected={operatorFilter}
              onChange={v => { setOperatorFilter(v); setPage(1) }}
              placeholder={t('surtido.registros.operator')}
              icon={User}
              className="min-w-[160px]"
            />
          )}

          <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 w-full max-w-sm transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
            <ScanBarcode size={13} className="text-warm-400 shrink-0" />
            <input
              type="text"
              className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder={t('surtido.registros.search_placeholder')}
              value={searchInput}
              onChange={e => {
                const val = e.target.value
                setSearchInput(val)
                clearTimeout(searchDebounceRef.current)
                searchDebounceRef.current = setTimeout(() => {
                  setSearch(val)
                  setPage(1)
                  if (!val.trim()) {
                    setDateFrom(thirtyDaysAgo)
                    setDateTo(today)
                    setDatePreset('30')
                  }
                }, 400)
              }}
            />
          </div>

          {(searchInput || statusFilter || operatorFilter.length > 0 || dateFrom !== thirtyDaysAgo || dateTo !== today) && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
            >
              <X className="w-3 h-3" /> {t('common.clear')}
            </button>
          )}

          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-warm-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
            </span>
          )}

        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="card overflow-hidden shadow-sm table-shell relative">
            <div className="overflow-x-auto table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-warm-50 border-b border-warm-100">
                    <th className="table-header w-10 text-center"><div className="h-4 w-4 rounded bg-warm-200 animate-pulse mx-auto" /></th>
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
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-cell w-10"><div className="h-4 w-4 rounded bg-warm-100 animate-pulse mx-auto" /></td>
                      <td className="table-cell"><div className="h-3 rounded bg-warm-100 animate-pulse font-mono" style={{ width: `${80 + (i % 4) * 20}px` }} /></td>
                      <td className="table-cell hidden lg:table-cell"><div className="h-3 w-24 rounded bg-warm-100 animate-pulse" /></td>
                      <td className="table-cell hidden md:table-cell"><div className="h-3 w-32 rounded bg-warm-100 animate-pulse" /></td>
                      <td className="table-cell hidden lg:table-cell"><div className="h-3 w-12 rounded bg-warm-100 animate-pulse" /></td>
                      <td className="table-cell text-right"><div className="h-3 w-8 rounded bg-warm-100 animate-pulse ml-auto" /></td>
                      <td className="table-cell text-right"><div className="h-3 w-8 rounded bg-warm-100 animate-pulse ml-auto" /></td>
                      <td className="table-cell text-right hidden md:table-cell"><div className="h-3 w-6 rounded bg-warm-100 animate-pulse ml-auto" /></td>
                      <td className="table-cell"><div className="h-5 w-20 rounded-full bg-warm-100 animate-pulse" /></td>
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
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
              <Package2 size={28} className="text-warm-300" />
            </div>
            <p className="text-sm text-warm-400 font-medium">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="card overflow-hidden shadow-sm table-shell">
            {selectedIds.size > 0 && canExport && (
              <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700 flex-wrap">
                <span className="font-semibold">
                  {selectedIds.size} seleccionados
                  {selectedIds.size === records.length && records.length > 0 && (
                    <span className="ml-1 font-normal text-primary-500">(todos de esta página)</span>
                  )}
                </span>
                {selectedIds.size < records.length && (
                  <button
                    className="text-primary-600 hover:text-primary-800 underline font-semibold transition-colors"
                    onClick={toggleSelectAll}>
                    Seleccionar todos ({records.length})
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
                        checked={selectedIds.size === records.length && records.length > 0}
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
                  {records.map(r => {
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
                            {(r.tiene_faltantes || r.tiene_anormalidades) && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.tiene_anormalidades ? 'bg-warning-500' : 'bg-danger-500'}`}
                                title={r.tiene_anormalidades ? 'Con anormalidades' : 'Con faltantes'}
                              />
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
                                <Edit3 size={13} />
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
        onClose={() => {
          setDetailId(null)
          setDetailInitialTab('validados')
          if (searchParams.get('sessionId') || searchParams.get('obc')) {
            handledDeepLinkRef.current = ''
            setSearchParams({}, { replace: true })
          }
        }}
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

      <QuickSearchModal
        isOpen={showQuickSearch}
        onClose={() => setShowQuickSearch(false)}
        onValidate={(obc) => navigate(`/Surtido/validacion?obc=${encodeURIComponent(obc)}&autostart=true`)}
      />
    </div>
  )
}
