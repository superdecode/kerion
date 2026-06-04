import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, ChevronLeft, ChevronRight, UserCheck,
  Users, Plus, Trash2, X, ChevronDown, Play, Loader2,
  Package2, MapPin, Calendar, Truck, ScanBarcode,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import Modal from '../../../core/components/common/Modal'
import TablePagination from '../../../core/components/common/TablePagination'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import {
  getOutboundList, getOutboundDetail,
  getSurtidores, createSurtidor, deleteSurtidor,
  getOrderTracking, upsertOrderTracking,
} from '../services/surtidoService'

const STATUS_META = {
  pending_assignment: { labelKey: 'surtido.ordenes.status.pending_assignment', cls: 'bg-warm-100 text-warm-600' },
  assigned:           { labelKey: 'surtido.ordenes.status.assigned',           cls: 'bg-accent-100 text-accent-700' },
  sorting:            { labelKey: 'surtido.ordenes.status.sorting',            cls: 'bg-warning-100 text-warning-700' },
  pending_validation: { labelKey: 'surtido.ordenes.status.pending_validation', cls: 'bg-primary-100 text-primary-700' },
  validating:         { labelKey: 'surtido.ordenes.status.validating',         cls: 'bg-success-100 text-success-700' },
  complete:           { labelKey: 'surtido.ordenes.status.complete',           cls: 'bg-success-200 text-success-800' },
}

const fmtDate = (v) => {
  if (!v) return '—'
  const s = String(v).slice(0, 10)
  return s || '—'
}

function SurtidoresModal({ isOpen, onClose }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')

  const { data } = useQuery({ queryKey: ['upapex-surtidores'], queryFn: getSurtidores, staleTime: 30000, enabled: isOpen })
  const surtidores = data?.data ?? []

  const addMut = useMutation({
    mutationFn: createSurtidor,
    onSuccess: () => { setNombre(''); qc.invalidateQueries({ queryKey: ['upapex-surtidores'] }) },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })
  const delMut = useMutation({
    mutationFn: deleteSurtidor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upapex-surtidores'] }),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.surtidores_title')} icon={Users}
      footer={<button className="btn-ghost" onClick={onClose}><X size={14} /> {t('common.close')}</button>}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="input-field flex-1 text-sm"
            placeholder={t('surtido.ordenes.surtidor_name')}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nombre.trim()) addMut.mutate({ nombre: nombre.trim() }) }}
          />
          <button className="btn-primary shrink-0" onClick={() => addMut.mutate({ nombre: nombre.trim() })}
            disabled={!nombre.trim() || addMut.isPending}>
            {addMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('surtido.ordenes.add_surtidor')}
          </button>
        </div>
        <div className="divide-y divide-warm-100 max-h-60 overflow-y-auto">
          {surtidores.length === 0 ? (
            <p className="text-sm text-warm-400 text-center py-6">{t('common.noData')}</p>
          ) : (
            surtidores.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                    {s.nombre[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-warm-800 font-medium">{s.nombre}</span>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                  onClick={() => delMut.mutate(s.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}

function AssignModal({ isOpen, order, onClose, onAssign }) {
  const { t } = useI18nStore()
  const { data } = useQuery({ queryKey: ['upapex-surtidores'], queryFn: getSurtidores, staleTime: 30000, enabled: isOpen })
  const surtidores = data?.data ?? []
  const [selected, setSelected] = useState(null)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('surtido.ordenes.assign_surtidor')} icon={UserCheck}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={() => { onAssign(selected); onClose() }}>
            {t('common.save')}
          </button>
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
              selected === s.id
                ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700'
                : 'border-warm-200 hover:border-warm-300 text-warm-700'
            }`}>
            {s.nombre}
          </button>
        ))}
      </div>
    </Modal>
  )
}

function DetailPanel({ order, tracking, onClose }) {
  const { t } = useI18nStore()
  if (!order) return null
  const detail = order._detail
  const packageList = detail?.packageList ?? detail?.details ?? detail?.items ?? []
  const productList = detail?.productList ?? []

  return (
    <div className="w-80 shrink-0 border-l border-warm-200 bg-white overflow-y-auto flex flex-col shadow-xl">
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-primary-200 uppercase tracking-wider">{t('surtido.ordenes.detail_panel')}</p>
          <p className="font-mono text-white font-bold text-sm mt-0.5">{order.outboundOrderNo}</p>
        </div>
        <button className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Key info grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t('surtido.ordenes.detail.warehouse'), value: detail?.warehouseCode },
            { label: t('surtido.ordenes.detail.channel'), value: detail?.logisticsChannelCode || detail?.logisticsChannel },
            { label: t('surtido.ordenes.detail.tracking'), value: detail?.trackingNumber || detail?.thirdWaybillCode, mono: true },
            { label: t('surtido.ordenes.surtidor'), value: tracking?.surtidor_nombre },
          ].filter(i => i.value).map((item, i) => (
            <div key={i} className="bg-warm-50 rounded-lg px-2.5 py-2">
              <p className="text-warm-400 text-[10px] uppercase tracking-wide">{item.label}</p>
              <p className={`font-semibold text-warm-800 truncate ${item.mono ? 'font-mono' : ''}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {packageList.length > 0 && (
          <div>
            <p className="font-semibold text-warm-500 mb-2 uppercase tracking-wider text-[10px] flex items-center gap-1">
              <Package2 size={10} /> {t('surtido.escaneo.tab_cajas')} ({packageList.length})
            </p>
            <div className="space-y-1.5">
              {packageList.map((p, i) => (
                <div key={i} className="bg-warm-50 rounded-lg px-3 py-2 border border-warm-100">
                  <p className="font-mono font-semibold text-warm-800">{p.boxType || p.boxCode || '—'}</p>
                  {p.customizeCode && <p className="text-warm-400 text-[10px]">Ref: {p.customizeCode}</p>}
                  <p className="text-warm-500 text-[10px]">Cant: {p.totalPackageQty ?? p.qty ?? '?'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {productList.length > 0 && (
          <div>
            <p className="font-semibold text-warm-500 mb-2 uppercase tracking-wider text-[10px] flex items-center gap-1">
              <ScanBarcode size={10} /> {t('surtido.escaneo.tab_productos')} ({productList.length})
            </p>
            <div className="space-y-1.5">
              {productList.map((p, i) => (
                <div key={i} className="bg-warm-50 rounded-lg px-3 py-2 border border-warm-100">
                  <p className="font-mono font-semibold text-warm-800">{p.sku || '—'}</p>
                  {p.productName && <p className="text-warm-500 text-[10px] truncate">{p.productName}</p>}
                  <p className="text-warm-500 text-[10px]">Cant: {p.qty ?? p.totalProductQty ?? '?'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Ordenes() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSurtidor, setFilterSurtidor] = useState('')
  const [showSurtidoresModal, setShowSurtidoresModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)

  const wmsParams = { page, pageSize }
  if (search.trim()) wmsParams.outboundOrderNos = search.trim()

  const { data: wmsData, isLoading: wmsLoading } = useQuery({
    queryKey: ['upapex-outbound', wmsParams],
    queryFn: () => getOutboundList(wmsParams),
    staleTime: 30000,
  })

  const { data: trackingData } = useQuery({
    queryKey: ['upapex-order-tracking'],
    queryFn: getOrderTracking,
    staleTime: 30000,
  })

  const { data: surtidoresData } = useQuery({
    queryKey: ['upapex-surtidores'],
    queryFn: getSurtidores,
    staleTime: 60000,
  })

  const records = wmsData?.data?.records ?? wmsData?.data ?? []
  const total = wmsData?.data?.total ?? records.length
  const totalPages = Math.ceil(total / pageSize) || 1

  const trackingMap = (trackingData?.data ?? []).reduce((m, t) => {
    m[t.outbound_order_no] = t; return m
  }, {})

  const surtidores = surtidoresData?.data ?? []

  const filteredRecords = records.filter(r => {
    const tracking = trackingMap[r.outboundOrderNo]
    if (filterStatus) {
      const status = tracking?.status || 'pending_assignment'
      if (status !== filterStatus) return false
    }
    if (filterSurtidor) {
      if (tracking?.surtidor_nombre !== filterSurtidor) return false
    }
    return true
  })

  const assignMut = useMutation({
    mutationFn: ({ obc, surtidorId }) => upsertOrderTracking(obc, {
      surtidor_id: surtidorId,
      status: surtidorId ? 'assigned' : 'pending_assignment',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upapex-order-tracking'] })
      toast.success(t('common.save') + ' OK')
    },
    onError: () => toast.error(t('toast.error')),
  })

  const loadDetailMut = useMutation({
    mutationFn: (obc) => getOutboundDetail(obc),
    onSuccess: (data, obc) => {
      const row = records.find(r => r.outboundOrderNo === obc)
      setDetailOrder(row ? { ...row, _detail: data?.data } : null)
    },
  })

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
          <button className="btn-ghost text-xs flex items-center gap-1.5"
            onClick={() => setShowSurtidoresModal(true)}>
            <Users size={14} /> {t('surtido.ordenes.manage_surtidores')}
          </button>
        }
      />

      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-lg border-b border-warm-100 px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <div className="relative flex-1 min-w-44 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input type="text" className="input-field pl-8 text-sm h-9"
            placeholder={t('surtido.ordenes.search_placeholder')}
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        <select className="input-field text-sm h-9 w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{t('surtido.ordenes.status')} — {t('common.all')}</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{t(v.labelKey)}</option>
          ))}
        </select>

        {surtidores.length > 0 && (
          <select className="input-field text-sm h-9 w-auto" value={filterSurtidor} onChange={e => setFilterSurtidor(e.target.value)}>
            <option value="">{t('surtido.ordenes.surtidor')} — {t('common.all')}</option>
            {surtidores.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
          </select>
        )}

        {(filterStatus || filterSurtidor || search) && (
          <button className="btn-ghost text-xs h-9 px-2" onClick={() => { setFilterStatus(''); setFilterSurtidor(''); setSearch('') }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-warm-400">
              <Package2 size={40} className="opacity-30" />
              <p className="text-sm">{t('common.noData')}</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-50/60">
                      <th className="table-header font-semibold">OBC</th>
                      <th className="table-header hidden md:table-cell font-semibold">{t('surtido.ordenes.fecha_creacion')}</th>
                      <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.ordenes.fecha_entrega')}</th>
                      <th className="table-header hidden lg:table-cell font-semibold">{t('surtido.ordenes.destino')}</th>
                      <th className="table-header font-semibold">{t('surtido.ordenes.surtidor')}</th>
                      <th className="table-header font-semibold">{t('surtido.ordenes.status')}</th>
                      <th className="table-header text-right font-semibold">{t('surtido.ordenes.total_qty')}</th>
                      <th className="table-header" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {filteredRecords.map((r, i) => {
                      const obc = r.outboundOrderNo
                      const tracking = trackingMap[obc]
                      const status = tracking?.status || 'pending_assignment'
                      const meta = STATUS_META[status] ?? STATUS_META.pending_assignment
                      const noSurtidor = !tracking?.surtidor_nombre

                      return (
                        <tr key={obc || i}
                          onClick={() => loadDetailMut.mutate(obc)}
                          className={`cursor-pointer transition-colors hover:bg-primary-50/30 ${noSurtidor ? 'bg-warning-50/20' : ''} ${detailOrder?.outboundOrderNo === obc ? 'bg-primary-50/50' : ''}`}>

                          <td className="table-cell">
                            <span className="font-mono font-bold text-primary-700 text-xs">{obc || '—'}</span>
                          </td>

                          <td className="table-cell hidden md:table-cell">
                            <span className="text-warm-500 text-xs flex items-center gap-1">
                              <Calendar size={10} className="text-warm-300" />
                              {fmtDate(r.createTime)}
                            </span>
                          </td>

                          <td className="table-cell hidden lg:table-cell">
                            <span className="text-warm-600 text-xs flex items-center gap-1">
                              <Truck size={10} className="text-warm-300" />
                              {fmtDate(r.expectedArrivalDate || r.expectedFinishDate || r.planArrivalDate)}
                            </span>
                          </td>

                          <td className="table-cell hidden lg:table-cell">
                            <span className="text-warm-600 text-xs flex items-center gap-1">
                              <MapPin size={10} className="text-warm-300" />
                              {r.warehouseCode || r.logisticsChannelCode || '—'}
                            </span>
                          </td>

                          <td className="table-cell">
                            <button
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all hover:shadow-sm ${
                                noSurtidor
                                  ? 'border-warning-300 text-warning-700 bg-warning-50 hover:border-warning-400'
                                  : 'border-warm-200 text-warm-700 hover:border-primary-300 hover:text-primary-700'
                              }`}
                              onClick={e => { e.stopPropagation(); setAssignTarget(r) }}
                            >
                              <UserCheck size={11} />
                              <span className="max-w-[90px] truncate">
                                {tracking?.surtidor_nombre || t('surtido.ordenes.no_surtidor')}
                              </span>
                              <ChevronDown size={9} />
                            </button>
                          </td>

                          <td className="table-cell">
                            <span className={`badge text-[11px] font-medium ${meta.cls}`}>{t(meta.labelKey)}</span>
                          </td>

                          <td className="table-cell text-right">
                            <span className="font-semibold text-warm-700">{r.totalQty ?? '—'}</span>
                          </td>

                          <td className="table-cell text-right">
                            <button
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all"
                              onClick={e => { e.stopPropagation(); navigate(`/surtido/validacion?obc=${encodeURIComponent(obc)}`) }}
                            >
                              <Play size={11} /> {t('surtido.ordenes.validate_btn')}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={total}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                  itemLabel={t('surtido.ordenes.item_label')}
                />
              )}
            </div>
          )}
        </div>

        {detailOrder && (
          <DetailPanel
            order={detailOrder}
            tracking={trackingMap[detailOrder.outboundOrderNo]}
            onClose={() => setDetailOrder(null)}
          />
        )}
      </div>

      <SurtidoresModal isOpen={showSurtidoresModal} onClose={() => setShowSurtidoresModal(false)} />

      <AssignModal
        isOpen={!!assignTarget}
        order={assignTarget}
        onClose={() => setAssignTarget(null)}
        onAssign={(surtidorId) => {
          if (!assignTarget) return
          const obc = assignTarget.outboundOrderNo || assignTarget.outbound_order_no
          assignMut.mutate({ obc, surtidorId })
        }}
      />
    </div>
  )
}
