import { Fragment, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck, User, Loader2, Trash2, CheckCircle2, XCircle, Clock,
  FileText, Edit3, ArrowLeft, CalendarDays, StickyNote, AlertCircle,
  Printer, Layers, MapPin, ScanLine, Package, Copy, Check, Download,
  Search, X, ScanBarcode, RefreshCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import CatalogEmptyHint from '../../../core/components/common/CatalogEmptyHint'
import StatusPill from '../../../core/components/common/StatusPill'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtDate, fmtDateTime } from '../../../core/utils/dateFormat'
import {
  getFolio, getFolioScans, updateFolio, cerrarFolio, reabrirFolio, cancelarFolio, deleteFolio,
  getConductores, getUnidades,
} from '../services/despachoService'
import FolioPreviewModal from '../components/FolioPreviewModal'

const FOLIO_ESTADO_META = {
  borrador:   { label: 'Borrador',   cls: 'bg-warm-100 text-warm-600',       icon: Clock },
  en_proceso: { label: 'En Proceso', cls: 'bg-primary-100 text-primary-700', icon: Truck },
  cerrado:    { label: 'Cerrado',    cls: 'bg-success-100 text-success-700',  icon: CheckCircle2 },
  cancelado:  { label: 'Cancelado',  cls: 'bg-danger-100 text-danger-700',    icon: XCircle },
}

const ORDER_ESTADO_META = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-warm-100 text-warm-600' },
  cargado:    { label: 'Cargado',    cls: 'bg-primary-100 text-primary-700' },
  entregado:  { label: 'Entregado',  cls: 'bg-success-100 text-success-700' },
  devolucion: { label: 'Devolución', cls: 'bg-danger-100 text-danger-700' },
}

const TH = 'table-header whitespace-nowrap'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <button onClick={copy} className="ml-1 p-0.5 text-warm-300 hover:text-warm-600 transition-colors opacity-0 group-hover:opacity-100">
      {copied ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function CopyInline({ value, mono = false }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e) => {
    e.stopPropagation()
    if (!value) return
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <div className="group inline-flex max-w-full items-center gap-1.5">
      <span className={`truncate ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
      {value ? (
        <button type="button" onClick={handleCopy}
          className="shrink-0 rounded p-0.5 text-warm-300 opacity-0 transition-all hover:bg-warm-100 hover:text-primary-600 group-hover:opacity-100">
          {copied ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  )
}

function GeneralInfoBlock({ icon: Icon, label, value, tone = 'warm', mono = false }) {
  const toneCls = {
    warm:    'border-warm-100/80 bg-white/85 text-warm-500',
    primary: 'border-primary-100/80 bg-primary-50/55 text-primary-600',
    sky:     'border-sky-100/80 bg-sky-50/55 text-sky-600',
    success: 'border-success-100/80 bg-success-50/55 text-success-600',
    accent:  'border-accent-100/80 bg-accent-50/55 text-accent-600',
  }
  return (
    <div className={`rounded-xl border px-3 py-3 shadow-sm ${toneCls[tone] || toneCls.warm}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
          <div className="mt-1 text-sm font-bold text-warm-800">
            <CopyInline value={value} mono={mono} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, color = 'warm', progress = null, textMode = false }) {
  const ring = {
    primary: 'border-primary-100 bg-primary-50/60',
    success: 'border-success-100 bg-success-50/60',
    warm:    'border-warm-100 bg-warm-50/60',
    sky:     'border-sky-100 bg-sky-50/60',
    accent:  'border-accent-100 bg-accent-50/60',
  }
  const numCls = {
    primary: 'text-primary-700',
    success: 'text-success-700',
    warm:    'text-warm-700',
    sky:     'text-sky-700',
    accent:  'text-accent-700',
  }
  const iconCls = {
    primary: 'text-primary-400',
    success: 'text-success-400',
    warm:    'text-warm-300',
    sky:     'text-sky-400',
    accent:  'text-accent-400',
  }
  return (
    <div className={`min-w-[80px] flex-1 rounded-xl border px-3 py-2.5 ${ring[color]}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3 h-3 shrink-0 ${iconCls[color]}`} />
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-warm-400 leading-none truncate">{label}</p>
      </div>
      {textMode ? (
        <p className={`text-xs font-bold leading-tight truncate max-w-[120px] ${numCls[color]}`} title={typeof value === 'string' ? value : undefined}>
          {value ?? '—'}
        </p>
      ) : (
        <p className={`text-[18px] font-black tabular-nums leading-none ${numCls[color]}`}>{value ?? '0'}</p>
      )}
      {progress !== null && !textMode && (
        <div className="mt-1.5 h-1 rounded-full bg-sky-100 overflow-hidden">
          <div className="h-full bg-sky-400 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}

export default function FolioDetalle() {
  const { id: folioId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const { canWrite, canDelete } = useAuthStore()
  const canUpdate = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.folios')
    return lvl === 'actualizar' || lvl === 'eliminar'
  })
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState('ordenes')
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [showConfirmCancel, setShowConfirmCancel] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [ordersSearch, setOrdersSearch] = useState('')
  const [scanSearch, setScanSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['despacho-folio', folioId],
    queryFn: () => getFolio(folioId),
    enabled: !!folioId,
    staleTime: 30_000,
  })

  const { data: scansData, isLoading: loadingScans } = useQuery({
    queryKey: ['despacho-folio-scans', folioId],
    queryFn: () => getFolioScans(folioId),
    enabled: !!folioId,
    staleTime: 30_000,
  })

  const { data: conductoresData } = useQuery({ queryKey: ['despacho-conductores'], queryFn: getConductores, staleTime: 10 * 60_000 })
  const { data: unidadesData } = useQuery({ queryKey: ['despacho-unidades'], queryFn: getUnidades, staleTime: 10 * 60_000 })

  const folio = data?.folio
  const orders = data?.orders ?? []
  const scans = scansData?.scans ?? []
  const conductores = conductoresData?.conductores ?? []
  const unidades = unidadesData?.unidades ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['despacho-folio', folioId] })
    qc.invalidateQueries({ queryKey: ['despacho-folios'] })
  }

  const { mutate: doUpdate, isPending: updatingFolio } = useMutation({
    mutationFn: (body) => updateFolio(folioId, body),
    onSuccess: () => { invalidate(); setEditMode(false); addToast('Folio actualizado', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error actualizando folio', 'error'),
  })

  const { mutate: doCerrar, isPending: cerrando } = useMutation({
    mutationFn: () => cerrarFolio(folioId),
    onSuccess: () => { invalidate(); addToast('Folio cerrado', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error cerrando folio', 'error'),
  })

  const { mutate: doReabrir, isPending: reabriendo } = useMutation({
    mutationFn: () => reabrirFolio(folioId),
    onSuccess: () => { invalidate(); addToast('Folio reabierto', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error reabriendo folio', 'error'),
  })

  const { mutate: doCancelar, isPending: cancelando } = useMutation({
    mutationFn: () => cancelarFolio(folioId),
    onSuccess: () => { invalidate(); setShowConfirmCancel(false); addToast('Folio cancelado', 'success') },
    onError: (err) => addToast(err?.response?.data?.error || 'Error cancelando folio', 'error'),
  })

  const { mutate: doEliminar, isPending: eliminando } = useMutation({
    mutationFn: () => deleteFolio(folioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despacho-folios'] })
      addToast('Folio eliminado', 'success')
      navigate('/despacho/folios')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error eliminando folio', 'error'),
  })

  const isActive    = folio && ['borrador', 'en_proceso'].includes(folio.estado)
  const isCancelled = folio?.estado === 'cancelado'
  const isClosed    = folio?.estado === 'cerrado'
  const canEditMeta    = folio && !isCancelled && canUpdate
  const canCancelFolio = !!isActive && canUpdate
  const canDeleteFolio = !!isCancelled && canDelete('despacho.folios')

  const estadoMeta = folio ? (FOLIO_ESTADO_META[folio.estado] ?? FOLIO_ESTADO_META.borrador) : null
  const ordersWithProgress = useMemo(() => orders.map(o => {
    const orderScans = folio?.tipo === 'por_destino'
      ? scans.filter(s => s.folio_order_id === o.id || s.matched_order_no === o.outbound_order_no)
      : (o.scans ?? [])
    const scanCount = orderScans.length
    const dispatchedCount = folio?.tipo === 'por_destino' ? scanCount : (o.bultos || scanCount)
    return { ...o, _scanCount: scanCount, _dispatchCount: dispatchedCount }
  }), [orders, scans, folio?.tipo])

  const totalBultos    = ordersWithProgress.reduce((s, o) => s + (o._dispatchCount || 0), 0)
  const totalEsperadas = orders.reduce((s, o) => s + (o.bultos_esperados || 0), 0)
  const progresoPct    = totalEsperadas > 0 ? Math.min(100, Math.round((totalBultos / totalEsperadas) * 100)) : 0

  const validatedOrdersCount = useMemo(
    () => orders.filter(o => o.estado !== 'pendiente').length,
    [orders]
  )

  const filteredOrders = useMemo(() => ordersSearch
    ? ordersWithProgress.filter(o => [o.outbound_order_no, o.destinatario, o.estado]
        .some(v => String(v || '').toLowerCase().includes(ordersSearch.toLowerCase())))
    : ordersWithProgress
  , [ordersWithProgress, ordersSearch])

  const filteredScans = useMemo(() => scanSearch
    ? scans.filter(s => [s.codigo_caja, s.matched_order_no, s.tarima_ref, s.validated_by_nombre]
        .some(v => String(v || '').toLowerCase().includes(scanSearch.toLowerCase())))
    : scans
  , [scans, scanSearch])

  const scansByTarima = useMemo(() => filteredScans.reduce((acc, s) => {
    const key = s.tarima_ref || 'Sin tarima'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {}), [filteredScans])
  const tarimaKeys = Object.keys(scansByTarima).sort()

  const startEdit = () => {
    setEditForm({
      conductor_id: folio.conductor_id || '',
      unidad_id: folio.unidad_id || '',
      fecha_salida: folio.fecha_salida ? folio.fecha_salida.slice(0, 10) : '',
      notas: folio.notas || '',
    })
    setEditMode(true)
  }

  const handleExportOrders = () => {
    if (!folio || !orders.length) return
    const ws = XLSX.utils.aoa_to_sheet([
      ['#', 'Orden', 'Destinatario', 'Esperadas', 'Escaneadas', 'Despachadas', 'Estado'],
      ...ordersWithProgress.map((o, i) => [
        i + 1, o.outbound_order_no || '', o.destinatario || '',
        o.bultos_esperados ?? '', o._scanCount, o._dispatchCount ?? '',
        ORDER_ESTADO_META[o.estado]?.label ?? 'Pendiente',
      ]),
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Órdenes')
    XLSX.writeFile(wb, `${folio.folio_numero}-ordenes.xlsx`)
  }

  const handleExportScans = () => {
    if (!folio || !scans.length) return
    const ws = XLSX.utils.aoa_to_sheet([
      ['#', 'Tarima', 'Código de caja', 'Orden', 'Usuario', 'Fecha'],
      ...scans.map((s, i) => [
        i + 1, s.tarima_ref || '', s.codigo_caja || '',
        s.matched_order_no || '', s.validated_by_nombre || '',
        s.validated_at ? fmtDateTime(s.validated_at) : '',
      ]),
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Escaneos')
    XLSX.writeFile(wb, `${folio.folio_numero}-escaneos.xlsx`)
  }

  if (isLoading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
  if (!folio) return (
    <div className="flex flex-col h-full">
      <Header title="Folio no encontrado" icon={FileText} />
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-warm-400">Folio no encontrado</p>
        <button onClick={() => navigate('/despacho/folios')} className="btn-ghost text-sm flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
      </div>
    </div>
  )

  const currentSearch    = activeTab === 'ordenes' ? ordersSearch : scanSearch
  const setCurrentSearch = activeTab === 'ordenes' ? setOrdersSearch : setScanSearch

  return (
    <div className="flex flex-col h-full">

      {/* ── HEADER ── */}
      <Header
        title={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/despacho/folios')}
              className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 flex-wrap min-w-0 group">
              <span className="font-mono font-black text-base text-warm-900 leading-none truncate">{folio.folio_numero}</span>
              <CopyButton text={folio.folio_numero} />
              <StatusPill className={`shrink-0 ${estadoMeta.cls}`}>{estadoMeta.label}</StatusPill>
              {folio.tipo === 'por_destino' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-100 border border-accent-200 text-[10px] font-semibold text-accent-700 shrink-0">
                  <MapPin className="w-3 h-3" />Destino
                </span>
              )}
              {folio.validar_por_tarimas && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-100 border border-accent-200 text-[10px] font-semibold text-accent-700 shrink-0">
                  <Layers className="w-3 h-3" />Tarimas
                </span>
              )}
            </div>
          </div>
        }
        icon={Truck}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowPrintModal(true)} disabled={!orders.length}
              className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-50">
              <Printer className="w-4 h-4" />Imprimir
            </button>
            {isActive && canWrite('despacho.folios') && (
              <button
                onClick={() => navigate('/despacho/validar', {
                  state: { folioId: folio.id, tipo: folio.tipo, label: folio.folio_numero }
                })}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <ScanBarcode className="w-4 h-4" />Validar
              </button>
            )}
            {folio.estado === 'en_proceso' && canWrite('despacho.folios') && (
              <button onClick={() => doCerrar()} disabled={cerrando}
                className="btn-success flex items-center gap-1.5 text-sm">
                {cerrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Cerrar Folio
              </button>
            )}
            {isClosed && canUpdate && (
              <button onClick={() => doReabrir()} disabled={reabriendo}
                className="btn-ghost flex items-center gap-1.5 text-sm">
                {reabriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Reabrir
              </button>
            )}
            {canCancelFolio && (
              <button onClick={() => setShowConfirmCancel(true)} disabled={cancelando}
                className="btn-danger flex items-center gap-1.5 text-sm">
                <XCircle className="w-4 h-4" />Cancelar
              </button>
            )}
            {canDeleteFolio && (
              <button onClick={() => setShowConfirmDelete(true)} disabled={eliminando}
                className="btn-danger flex items-center gap-1.5 text-sm">
                {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Eliminar
              </button>
            )}
          </div>
        }
      />

      {/* ── PRIMARY CARD — Conductor / Unidad / Fecha Salida ── */}
      <div className="shrink-0 px-5 pt-4 pb-2">
        <div className="overflow-hidden rounded-2xl border border-warm-100 bg-gradient-to-br from-white to-sky-50/30 shadow-sm">
          {editMode ? (
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-warm-600 mb-1.5">Conductor</label>
                  <select value={editForm.conductor_id}
                    onChange={e => setEditForm(f => ({ ...f, conductor_id: e.target.value }))}
                    className="input-field w-full text-sm">
                    <option value="">Sin conductor</option>
                    {conductores.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}{c.licencia ? ` · ${c.licencia}` : ''}</option>
                    ))}
                  </select>
                  {conductores.length === 0 && <CatalogEmptyHint item={t('desp.validar.modal.conductor').toLowerCase()} section={t('desp.folios.title')} action={t('desp.btn.conductores')} />}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warm-600 mb-1.5">Unidad</label>
                  <select value={editForm.unidad_id}
                    onChange={e => setEditForm(f => ({ ...f, unidad_id: e.target.value }))}
                    className="input-field w-full text-sm">
                    <option value="">Sin unidad</option>
                    {unidades.map(u => (
                      <option key={u.id} value={u.id}>{u.placa} ({u.tipo})</option>
                    ))}
                  </select>
                  {unidades.length === 0 && <CatalogEmptyHint item={t('desp.validar.modal.unidad').toLowerCase()} section={t('desp.folios.title')} action={t('desp.btn.unidades')} />}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warm-600 mb-1.5">Fecha de Salida</label>
                  <input type="date" value={editForm.fecha_salida}
                    onChange={e => setEditForm(f => ({ ...f, fecha_salida: e.target.value }))}
                    className="input-field w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warm-600 mb-1.5">Notas</label>
                  <input value={editForm.notas}
                    onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                    className="input-field w-full text-sm" placeholder="Observaciones..." />
                </div>
              </div>
              {isClosed && (
                <div className="flex items-center gap-2 p-3 bg-warning-50 border border-warning-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-warning-500 shrink-0" />
                  <p className="text-xs text-warning-700">Editando folio cerrado — solo datos de cabecera</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => doUpdate(editForm)} disabled={updatingFolio}
                  className="btn-primary text-sm flex items-center gap-1.5">
                  {updatingFolio && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Guardar cambios
                </button>
                <button onClick={() => setEditMode(false)} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-500">INFORMACIÓN DEL FOLIO</p>
                {canEditMeta && (
                  <button onClick={startEdit} className="btn-ghost text-xs flex items-center gap-1.5 py-1 px-2.5">
                    <Edit3 className="w-3 h-3" />Editar
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <GeneralInfoBlock icon={User} label="Conductor"
                  value={folio.conductor_nombre
                    ? `${folio.conductor_nombre}${folio.conductor_licencia ? ` · ${folio.conductor_licencia}` : ''}`
                    : null}
                />
                <GeneralInfoBlock icon={Truck} label="Unidad"
                  value={folio.unidad_placa
                    ? `${folio.unidad_placa}${folio.unidad_tipo ? ` (${folio.unidad_tipo})` : ''}`
                    : null}
                />
                <GeneralInfoBlock icon={CalendarDays} label="Fecha Salida"
                  value={folio.fecha_salida ? fmtDate(folio.fecha_salida) : null}
                  tone="sky"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI METRIC CARDS ── */}
      {!editMode && (
        <div className="shrink-0 px-5 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <MetricCard icon={User}          label="Usuario"      value={folio.operador_nombre || '—'} color="warm"    textMode />
            <MetricCard icon={MapPin}        label="Destino"      value={folio.destino || '—'}         color="accent"  textMode />
            <div className="w-px shrink-0 self-stretch bg-warm-200/70 mx-0.5" />
            <MetricCard icon={Package}       label="Órdenes"      value={orders.length}   color="primary" />
            <MetricCard icon={CheckCircle2}  label="Desp."        value={totalBultos}     color="success" />
            <MetricCard icon={Clock}         label="Esperadas"    value={totalEsperadas}  color="warm"    />
            <MetricCard icon={Truck}         label="Progreso"     value={`${progresoPct}%`} color="sky" progress={progresoPct} />
            <MetricCard icon={ScanLine}      label="Escaneos"     value={scans.length}    color="accent"  />
          </div>
          {folio.notas && (
            <div className="flex items-center gap-1.5 mt-2 px-1">
              <StickyNote className="w-3 h-3 text-warm-300 shrink-0" />
              <span className="text-[11px] text-warm-500 italic truncate">{folio.notas}</span>
            </div>
          )}
        </div>
      )}

      {/* ── TAB AREA ── */}
      <div className="flex-1 overflow-auto px-4 pb-4 pt-1 space-y-3">

        {/* Tab bar */}
        <div className="flex items-center gap-2 border-b border-warm-100 pb-0 overflow-x-auto">
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('ordenes')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === 'ordenes' ? 'border-primary-500 text-primary-700' : 'border-transparent text-warm-500 hover:text-warm-700'
              }`}
            >
              Resumen de órdenes
              {orders.length > 0 && (
                <span className={`badge text-[9px] border-0 shrink-0 ${
                  validatedOrdersCount === orders.length
                    ? 'bg-success-100 text-success-700'
                    : 'bg-primary-100 text-primary-700'
                }`}>
                  {validatedOrdersCount}/{orders.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('detalle')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === 'detalle' ? 'border-primary-500 text-primary-700' : 'border-transparent text-warm-500 hover:text-warm-700'
              }`}
            >
              Detalle de validación
              {scans.length > 0 && (
                <span className="badge text-[9px] bg-sky-100 text-sky-700 border-0 shrink-0">{scans.length}</span>
              )}
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2 pb-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-300 pointer-events-none" />
              <input
                value={currentSearch}
                onChange={e => setCurrentSearch(e.target.value)}
                placeholder={`${t('common.search')}...`}
                className="pl-8 pr-8 py-1.5 rounded-lg border border-warm-200 text-sm focus:outline-none focus:border-sky-400 w-44 sm:w-52"
              />
              {currentSearch && (
                <button onClick={() => setCurrentSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={activeTab === 'ordenes' ? handleExportOrders : handleExportScans}
              disabled={activeTab === 'ordenes' ? !orders.length : !scans.length}
              className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
          </div>
        </div>

        {/* Tab: Resumen de órdenes */}
        {activeTab === 'ordenes' && (
          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="card overflow-hidden border border-warm-100/80 shadow-soft">
                <div className="py-14 text-center text-warm-300">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Sin órdenes en este folio</p>
                </div>
              </div>
            ) : (
              <div className="card overflow-hidden border border-warm-100/80 shadow-soft">
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={TH}>Orden</th>
                        <th className={TH}>Destinatario</th>
                        <th className={`${TH} text-center`}>Esp.</th>
                        <th className={`${TH} text-center`}>Escaneadas</th>
                        <th className={`${TH} text-center`}>Despachadas</th>
                        <th className={TH}>Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {filteredOrders.map(order => {
                        const pct = order.bultos_esperados > 0
                          ? Math.round((order._scanCount / order.bultos_esperados) * 100)
                          : null
                        return (
                          <Fragment key={`${order.id || order.outbound_order_no}-row`}>
                            <tr key={`${order.id || order.outbound_order_no}`} className="table-row">
                              <td className="px-3 py-2.5">
                                <CopyInline value={order.outbound_order_no} mono />
                              </td>
                              <td className="px-3 py-2.5">
                                {order.destinatario ? (
                                  <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-warm-300 shrink-0" />
                                    <span className="text-xs text-warm-700 font-medium truncate max-w-[160px]">{order.destinatario}</span>
                                  </div>
                                ) : <span className="text-xs text-warm-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="text-xs text-warm-500 tabular-nums">{order.bultos_esperados ?? '—'}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={`text-xs font-semibold tabular-nums ${order._scanCount > 0 ? 'text-success-600' : 'text-warm-300'}`}>
                                    {order._scanCount}
                                  </span>
                                  {pct !== null && (
                                    <span className="text-[10px] text-warm-400">{pct}%</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="text-xs font-semibold text-warm-800 tabular-nums">{order._dispatchCount ?? '—'}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <StatusPill className={ORDER_ESTADO_META[order.estado]?.cls ?? ORDER_ESTADO_META.pendiente.cls}>
                                  {ORDER_ESTADO_META[order.estado]?.label ?? 'Pendiente'}
                                </StatusPill>
                              </td>
                            </tr>
                            {order.notas && (
                              <tr key={`${order.id || order.outbound_order_no}-notas`} className="bg-danger-50/45">
                                <td colSpan={6} className="px-3 py-2 border-t border-danger-100">
                                  <div className="flex items-start gap-2 text-xs text-danger-700">
                                    <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span className="font-semibold shrink-0">Nota:</span>
                                    <span className="leading-relaxed whitespace-pre-wrap break-words">{order.notas}</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                      {filteredOrders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-10 text-center text-warm-400 text-sm">{t('common.noData')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Detalle de validación */}
        {activeTab === 'detalle' && (
          <div className="space-y-3">
            {loadingScans ? (
              <div className="flex justify-center py-10"><LoadingSpinner /></div>
            ) : scans.length === 0 ? (
              <div className="card overflow-hidden border border-warm-100/80 shadow-soft">
                <div className="py-14 text-center text-warm-300">
                  <ScanLine className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Sin escaneos registrados en este folio</p>
                </div>
              </div>
            ) : tarimaKeys.length === 0 ? (
              <div className="card overflow-hidden border border-warm-100/80 shadow-soft">
                <div className="py-10 text-center text-warm-400 text-sm">{t('common.noData')}</div>
              </div>
            ) : (
              tarimaKeys.map(tarima => (
                <div key={tarima} className="card overflow-hidden border border-warm-100/80 shadow-soft">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-warm-100/80 bg-warm-50/60">
                    <Layers className="w-3.5 h-3.5 text-accent-500 shrink-0" />
                    <span className="text-xs font-bold text-accent-700">{tarima}</span>
                    <span className="text-[11px] text-warm-400">— {scansByTarima[tarima].length} caja{scansByTarima[tarima].length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className={TH}>#</th>
                          <th className={TH}>Código de caja</th>
                          <th className={TH}>Orden</th>
                          <th className={TH}>Usuario</th>
                          <th className={TH}>Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-50">
                        {scansByTarima[tarima].map((s, i) => (
                          <tr key={`${tarima}-${s.id || s.codigo_caja}-${i}`} className="table-row">
                            <td className="px-3 py-2.5 text-warm-400 text-xs tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2.5">
                              <CopyInline value={s.codigo_caja} mono />
                            </td>
                            <td className="px-3 py-2.5">
                              {s.matched_order_no ? (
                                <span className="font-mono text-xs text-primary-700">{s.matched_order_no}</span>
                              ) : s.folio_order_id ? (
                                <span className="text-xs text-warm-400 italic">por orden</span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning-100 text-warning-700 text-[10px] font-semibold">
                                  Sin asignar
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-warm-500">{s.validated_by_nombre || '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-warm-500">{fmtDateTime(s.validated_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <FolioPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        folio={folio}
        orders={orders}
      />

      <Modal
        isOpen={showConfirmCancel}
        onClose={() => setShowConfirmCancel(false)}
        title="Cancelar Folio"
        icon={AlertCircle}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowConfirmCancel(false)} className="btn-secondary text-sm">Volver</button>
            <button onClick={() => doCancelar()} disabled={cancelando}
              className="btn-danger text-sm flex items-center gap-1.5">
              {cancelando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirmar Cancelación
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          ¿Cancelar este folio? Un folio cancelado solo puede ser eliminado, no reactivado.
        </p>
      </Modal>

      <Modal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        title="Eliminar Folio Cancelado"
        icon={Trash2}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowConfirmDelete(false)} className="btn-secondary text-sm">Volver</button>
            <button onClick={() => { doEliminar(); setShowConfirmDelete(false) }} disabled={eliminando}
              className="btn-danger text-sm flex items-center gap-1.5">
              {eliminando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Eliminar definitivamente
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          Esta acción eliminará el folio permanentemente. Solo es posible eliminar folios cancelados.
        </p>
      </Modal>
    </div>
  )
}
