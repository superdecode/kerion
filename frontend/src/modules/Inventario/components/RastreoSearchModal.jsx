import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Search, Loader2, Package, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, BarChart2, ShoppingCart, AlertCircle, ClipboardList, Crosshair, Truck, Send,
} from 'lucide-react'
import CopyableCell from '../../../core/components/common/CopyableCell'
import { buscarCaja } from '../../../core/services/rastreoService'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getInventoryList, getOutboundList } from '../../WmsHub/services/googleSheetsService'
import { fmtDateTime } from '../../../core/utils/dateFormat'
import { normalizeCodeFast, extractBaseCode } from '../../Shared/Wms/normalizeCode'

const BOX_STATUS_LABELS = {
  pendiente: 'rastreo.caja.pendiente',
  localizada: 'rastreo.caja.localizada',
  no_encontrada: 'rastreo.caja.no_encontrada',
  cancelada: 'rastreo.caja.cancelada',
}

const ORDER_STATUS_LABELS = {
  abierta: 'rastreo.estado.abierta',
  en_proceso: 'rastreo.estado.en_proceso',
  parcial: 'rastreo.estado.parcial',
  completada: 'rastreo.estado.completada',
  cancelada: 'rastreo.estado.cancelada',
}

const INVENTORY_STATUS_LABELS = {
  OK: 'rastreo.searchModal.status.ok',
  BLOCKED: 'rastreo.searchModal.status.blocked',
  Bloqueado: 'rastreo.searchModal.status.blocked',
  NoWMS: 'rastreo.searchModal.status.nowms',
}

// Two sources feed this section's rows (see rastreo.routes.js /buscar):
// real pick_events plus selected pick_box_status incident rows. Box statuses
// sent to rastreo (estado='rastreo') are intentionally excluded there so they
// only appear in the rastreo section, not as fake surtido validations.
const SCAN_RESULT_LABELS = {
  ok: 'rastreo.searchModal.result.ok',
  duplicate: 'rastreo.searchModal.result.duplicate',
  rejected: 'rastreo.searchModal.result.rejected',
  not_found: 'rastreo.searchModal.result.not_found',
  unexpected: 'rastreo.searchModal.result.unexpected',
}

const SCAN_STATUS_LABELS = {
  ok: 'rastreo.searchModal.status.ok',
  blocked: 'rastreo.searchModal.status.blocked',
  nowms: 'rastreo.searchModal.status.nowms',
}

function compactCode(raw) {
  const normalized = normalizeCodeFast(raw || '')
  const embedded = normalized.match(/\d{6,}[-/]\d+/)
  return (embedded?.[0] || normalized).replace(/[-\/]/g, '')
}

function dedupeRecords(records, keyFn) {
  const seen = new Set()
  return (records || []).filter(record => {
    const key = keyFn(record)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function SectionHeader({ icon: Icon, title, count, color, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
        open ? `${color.border} ${color.bg}` : 'border-warm-200 bg-warm-50 hover:bg-warm-100'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color.icon}`}>
        <Icon size={15} />
      </div>
      <span className="font-semibold text-sm text-warm-800 flex-1 text-left">{title}</span>
      {count != null && (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color.badge}`}>{count}</span>
      )}
      {open ? <ChevronDown size={14} className="text-warm-400" /> : <ChevronRight size={14} className="text-warm-400" />}
    </button>
  )
}

function InventarioSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={Package}
        title={t('rastreo.searchModal.section.invActual')}
        count={records?.length}
        color={{ border: 'border-primary-200', bg: 'bg-primary-50/50', icon: 'bg-primary-100 text-primary-600', badge: 'bg-primary-100 text-primary-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-primary-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.invActual')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-primary-50/60 border-b border-primary-100">
                    <tr>
                      {[t('rastreo.searchModal.col.codigoCaja'), t('rastreo.searchModal.col.ubicacion'), t('rastreo.searchModal.col.medidas'), t('rastreo.searchModal.col.disponible'), t('rastreo.searchModal.col.bloqueado'), t('rastreo.searchModal.col.producto'), t('common.status')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-primary-600 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-primary-100 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.customizeBarcode || r.barcode || '—'} className="font-mono font-medium text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.cellNo || r.cell_no || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-600">{r.measures || r.dimensions || r.size || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-700">{r.availableAmount ?? r.available_stock ?? '—'}</td>
                        <td className="px-3 py-2.5 text-warm-500">{r.lockAmount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-warm-600 max-w-[160px] truncate">{r.productName || r.product_name || '—'}</td>
                        <td className="px-3 py-2.5">
                          {r.status && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                              ${r.status === 'OK' ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-600'}`}>
                              {t(INVENTORY_STATUS_LABELS[r.status] || 'common.status')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SurtidoSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={ShoppingCart}
        title={t('rastreo.searchModal.section.ordenesSalida')}
        count={records?.length}
        color={{ border: 'border-accent-200', bg: 'bg-accent-50/50', icon: 'bg-accent-100 text-accent-600', badge: 'bg-accent-100 text-accent-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-accent-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.ordenesSalida')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-accent-50/60 border-b border-accent-100">
                    <tr>
                      {[t('rastreo.searchModal.col.codigoCaja'), t('rastreo.searchModal.col.numeroOrden'), t('rastreo.searchModal.col.destinatario'), t('rastreo.searchModal.col.fechaEntrega'), t('rastreo.searchModal.col.referencia'), t('rastreo.searchModal.col.servicio')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-accent-600 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-primary-100 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.customizeCode || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.outboundOrderNo || '—'} className="font-mono font-semibold text-primary-700" />
                        </td>
                        <td className="px-3 py-2.5 text-warm-600">{r.customerCode || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-500">
                          {r.expectedTime || r.outboundTime
                            ? fmtDateTime(r.expectedTime || r.outboundTime)
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-500">{r.thirdOrderNo || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-500 max-w-[160px] truncate">{r.logisticsChannel || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EscaneoSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={BarChart2}
        title={t('rastreo.searchModal.section.invEscaneo')}
        count={records?.length}
        color={{ border: 'border-warning-200', bg: 'bg-warning-50/50', icon: 'bg-warning-100 text-warning-600', badge: 'bg-warning-100 text-warning-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-warning-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.invEscaneo')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-warning-50/60 border-b border-warning-100">
                    <tr>
                      {[t('rastreo.detalle.col.codigo'), t('rastreo.detalle.col.ubicacion'), t('common.status'), t('rastreo.searchModal.col.operador'), t('common.date')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-warning-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warning-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-primary-100 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.barcode || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.origin_location || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                            ${r.status === 'OK' ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-600'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-warm-600">{r.operador || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-400">
                          {new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ValidacionSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={CheckCircle2}
        title={t('rastreo.searchModal.section.validacion')}
        count={records?.length}
        color={{ border: 'border-success-200', bg: 'bg-success-50/50', icon: 'bg-success-100 text-success-600', badge: 'bg-success-100 text-success-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-success-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.validacion')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-success-50/60 border-b border-success-100">
                    <tr>
                      {[t('rastreo.searchModal.col.codigoEscaneado'), t('rastreo.col.ordenSalida'), t('rastreo.searchModal.col.resultado'), t('rastreo.detalle.col.ubicacion'), t('rastreo.searchModal.col.operador'), t('common.date')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-success-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-success-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-primary-100 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.normalized_code || r.scanned_code || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.outbound_order_no || '—'} className="font-mono font-semibold text-primary-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                            r.scan_result === 'ok' ? 'bg-success-100 text-success-700'
                              : r.scan_result === 'duplicate' ? 'bg-warning-100 text-warning-700'
                                : 'bg-danger-100 text-danger-600'
                          }`}>
                            {r.scan_result === 'ok' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            {t(SCAN_RESULT_LABELS[r.scan_result] || 'common.status')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.ubicacion_codigo || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-600">{r.operador || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-400">
                          {new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function InventarioRegistrosSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={ClipboardList}
        title={t('rastreo.searchModal.section.invRegistros')}
        count={records?.length}
        color={{ border: 'border-sky-200', bg: 'bg-sky-50/60', icon: 'bg-sky-100 text-sky-600', badge: 'bg-sky-100 text-sky-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-sky-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.invRegistros')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-sky-50/70 border-b border-sky-100">
                    <tr>
                      {[t('rastreo.detalle.col.codigo'), t('rastreo.searchModal.col.code2'), t('rastreo.detalle.col.ubicacion'), t('common.status'), t('rastreo.searchModal.col.operador'), t('common.date')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-sky-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-50">
                    {records.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-primary-100 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.normalized_code || r.scanned_code || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.code2 || '—'} className="font-mono text-warm-500" />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.cell_no || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                            r.scan_status === 'ok' ? 'bg-success-100 text-success-700'
                              : r.scan_status === 'blocked' ? 'bg-warning-100 text-warning-700'
                                : 'bg-danger-100 text-danger-600'
                          }`}>
                            {r.scan_status ? t(SCAN_STATUS_LABELS[r.scan_status] || 'common.status') : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-warm-600">{r.operator_nombre || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-400">
                          {r.scanned_at ? new Date(r.scanned_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RastreoSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={Crosshair}
        title={t('rastreo.searchModal.section.rastreo')}
        count={records?.length}
        color={{ border: 'border-rose-200', bg: 'bg-rose-50/60', icon: 'bg-rose-100 text-rose-600', badge: 'bg-rose-100 text-rose-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-rose-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.rastreo')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-rose-50/70 border-b border-rose-100">
                    <tr>
                      {[t('rastreo.searchModal.col.caja'), t('rastreo.col.folio'), t('rastreo.col.ordenSalida'), t('rastreo.searchModal.col.estadoCaja'), t('rastreo.detalle.col.ubicacion'), t('rastreo.searchModal.col.estadoOrden')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-rose-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-50">
                    {records.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-primary-100 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.box_code || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.folio || '—'} className="font-mono font-semibold text-primary-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.outbound_order_no || '—'} className="font-mono text-warm-600" />
                        </td>
                        <td className="px-3 py-2.5 text-warm-700">{r.estado_caja ? t(BOX_STATUS_LABELS[r.estado_caja] || 'rastreo.detalle.col.estadoCaja') : '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.ubicacion || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-500">{r.orden_estado ? t(ORDER_STATUS_LABELS[r.orden_estado] || 'rastreo.col.estado') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const INBOUND_ESTADO_LABELS = {
  pendiente: 'rastreo.searchModal.recepcion.pendiente',
  validada: 'rastreo.searchModal.recepcion.validada',
  faltante: 'rastreo.searchModal.recepcion.faltante',
}

const ANORM_ESTADO_LABELS = {
  nuevo: 'rastreo.searchModal.anorm.nuevo',
  en_proceso: 'rastreo.searchModal.anorm.en_proceso',
  resuelto: 'rastreo.searchModal.anorm.resuelto',
  cerrado: 'rastreo.searchModal.anorm.cerrado',
}

function DespachoSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={Package}
        title={t('rastreo.searchModal.section.despacho')}
        count={records?.length}
        color={{ border: 'border-orange-200', bg: 'bg-orange-50/50', icon: 'bg-orange-100 text-orange-600', badge: 'bg-orange-100 text-orange-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-orange-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.despacho')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-orange-50/70 border-b border-orange-100">
                    <tr>
                      {['Cód. caja', 'Folio despacho', 'OBC', 'Cliente', t('common.date')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-50">
                    {records.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-orange-50 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.codigo_caja || '—'} className="font-mono font-semibold text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.folio_numero || '—'} className="font-mono text-orange-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.outbound_order_no || r.matched_order_no || '—'} className="font-mono text-warm-600" />
                        </td>
                        <td className="px-3 py-2.5 text-warm-600 max-w-[120px] truncate">{r.cliente || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-400">
                          {r.created_at ? new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const DESP_ORDEN_ESTADO_LABELS = {
  pendiente: 'Pendiente',
  cargado: 'Cargado',
  entregado: 'Entregado',
  devolucion: 'Devolucion',
}

const DESP_FOLIO_ESTADO_LABELS = {
  borrador: 'Borrador',
  en_proceso: 'En proceso',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

function DespachoOrdenesSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={Send}
        title="Ordenes en Despacho"
        count={records?.length}
        color={{ border: 'border-teal-200', bg: 'bg-teal-50/50', icon: 'bg-teal-100 text-teal-600', badge: 'bg-teal-100 text-teal-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-teal-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">Sin resultados en ordenes de despacho</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-teal-50/70 border-b border-teal-100">
                    <tr>
                      {['OBC / Orden', 'Folio despacho', 'Cliente', 'Bultos', 'Estado orden', 'Estado folio', t('common.date')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-teal-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-50">
                    {records.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-teal-50 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.outbound_order_no || '—'} className="font-mono font-semibold text-teal-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.folio_numero || '—'} className="font-mono text-warm-600" />
                        </td>
                        <td className="px-3 py-2.5 text-warm-600 max-w-[120px] truncate">{r.cliente || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-600">{r.bultos ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                            r.orden_estado === 'entregado' ? 'bg-success-100 text-success-700'
                              : r.orden_estado === 'cargado' ? 'bg-primary-100 text-primary-700'
                                : r.orden_estado === 'devolucion' ? 'bg-danger-100 text-danger-600'
                                  : 'bg-warm-100 text-warm-600'
                          }`}>
                            {DESP_ORDEN_ESTADO_LABELS[r.orden_estado] || r.orden_estado || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                            r.folio_estado === 'cerrado' ? 'bg-success-100 text-success-700'
                              : r.folio_estado === 'en_proceso' ? 'bg-warning-100 text-warning-700'
                                : r.folio_estado === 'cancelado' ? 'bg-danger-100 text-danger-600'
                                  : 'bg-warm-100 text-warm-600'
                          }`}>
                            {DESP_FOLIO_ESTADO_LABELS[r.folio_estado] || r.folio_estado || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-warm-400">
                          {r.created_at ? new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AnormalidadesSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={AlertCircle}
        title={t('rastreo.searchModal.section.anormalidades')}
        count={records?.length}
        color={{ border: 'border-red-200', bg: 'bg-red-50/50', icon: 'bg-red-100 text-red-600', badge: 'bg-red-100 text-red-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-red-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.anormalidades')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-red-50/70 border-b border-red-100">
                    <tr>
                      {['Folio', 'Código', 'Descripción', 'OBC/Orden', t('common.status'), t('common.date')].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {records.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-red-50 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.folio || '—'} className="font-mono font-semibold text-red-700" />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.codigo || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-700 max-w-[200px]">
                          <span className="block truncate">{r.descripcion || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.contenedor_orden || '—'} className="font-mono text-warm-500" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                            r.estado === 'resuelto' || r.estado === 'cerrado' ? 'bg-success-100 text-success-700'
                              : r.estado === 'en_proceso' ? 'bg-warning-100 text-warning-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {t(ANORM_ESTADO_LABELS[r.estado] || 'common.status')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-warm-400">
                          {r.fecha_ocurrencia || r.created_at
                            ? new Date(r.fecha_ocurrencia || r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RecepcionSection({ records, open, onToggle }) {
  const { t } = useI18nStore()
  return (
    <div>
      <SectionHeader
        icon={Truck}
        title={t('rastreo.searchModal.section.recepcion')}
        count={records?.length}
        color={{ border: 'border-violet-200', bg: 'bg-violet-50/50', icon: 'bg-violet-100 text-violet-600', badge: 'bg-violet-100 text-violet-700' }}
        open={open}
        onToggle={onToggle}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-violet-100 overflow-x-auto">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">{t('rastreo.searchModal.empty.recepcion')}</p>
              ) : (
                <table className="min-w-max w-full text-xs whitespace-nowrap">
                  <thead className="bg-violet-50/70 border-b border-violet-100">
                    <tr>
                      {['Cód. caja', 'SKU', 'Folio entrada', t('common.status'), 'Validador', 'Validación'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-violet-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-50">
                    {records.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-primary-100 transition-colors">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.custom_box_barcode || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5 text-warm-600">{r.sku || '—'}</td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.folio || r.inbound_order_no || '—'} className="font-mono font-semibold text-primary-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                            r.estado_validacion === 'validada' ? 'bg-success-100 text-success-700'
                              : r.estado_validacion === 'faltante' ? 'bg-danger-100 text-danger-600'
                                : 'bg-warm-100 text-warm-600'
                          }`}>
                            {t(INBOUND_ESTADO_LABELS[r.estado_validacion] || 'common.status')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-warm-600">
                          {r.estado_validacion === 'validada'
                            ? (r.validated_by_nombre || '—')
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-warm-500 whitespace-nowrap">
                          {r.estado_validacion === 'validada' && r.validated_at
                            ? fmtDateTime(r.validated_at)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function RastreoSearchModal({ isOpen, onClose }) {
  const { t } = useI18nStore()
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState('exact')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [gsInv, setGsInv] = useState(null)
  const [gsSurtido, setGsSurtido] = useState(null)
  const [openSections, setOpenSections] = useState({ inv: true, surtido: true, escaneo: true, registros: true, validacion: true, rastreo: true, recepcion: true, anormalidades: true, despacho: true, despachoOrdenes: true })
  const inputRef = useRef(null)

  function toggleSection(key) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSearch() {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setResults(null)
    setGsInv(null)
    setGsSurtido(null)

    try {
      const [dbRes, invRes, outRes] = await Promise.all([
        buscarCaja(q, searchMode),
        getInventoryList().catch(() => ({ data: { records: [] } })),
        getOutboundList
          ? getOutboundList().catch(() => ({ data: { records: [] } }))
          : Promise.resolve({ data: { records: [] } }),
      ])

      // Prepare query variants for selected mode
      const qn = normalizeCodeFast(q)
      const qStripped = qn.replace(/[-\/]/g, '')
      const qBase = extractBaseCode(qn)
      const qBaseStripped = qBase.replace(/[-\/]/g, '')

      function codeMatches(raw) {
        if (!raw) return false
        const n = normalizeCodeFast(raw)
        const ns = n.replace(/[-\/]/g, '')
        if (searchMode === 'exact') return n === qn || ns === qStripped
        return ns.includes(qStripped) || (qBase.length >= 6 && (n.includes(qBase) || ns.startsWith(qBaseStripped)))
      }

      // Filter GS inventory
      const invRecords = dedupeRecords(
        ((invRes?.data?.records || invRes?.data || [])).filter(r =>
          codeMatches(r.customizeBarcode) || codeMatches(r.customizeCode) || codeMatches(r.boxType)
        ),
        r => [compactCode(r.customizeBarcode || r.customizeCode || r.boxType), normalizeCodeFast(r.cellNo || r.cell_no), r.status || ''].join('|')
      )
      setGsInv(invRecords)

      // getOutboundList returns order-level records with allCustomizeCodes (array),
      // NOT packageList. Match by order number or individual box code.
      const surtRecords = []
      ;(outRes?.data?.records || []).forEach(order => {
        const boxCodes = order.allCustomizeCodes || []

        if (
          codeMatches(order.outboundOrderNo) ||
          codeMatches(order.thirdOrderNo) ||
          codeMatches(order.logisticsTrackNo)
        ) {
          if (boxCodes.length > 0) {
            boxCodes.forEach(code => {
              surtRecords.push({ ...order, customizeCode: code, boxType: null })
            })
          } else {
            surtRecords.push({ ...order, customizeCode: order.customizeCode || null, boxType: null })
          }
          return
        }

        boxCodes.forEach(code => {
          if (codeMatches(code)) {
            surtRecords.push({ ...order, customizeCode: code, boxType: null })
          }
        })
      })
      const dedupedSurtRecords = dedupeRecords(
        surtRecords,
        r => [compactCode(r.customizeCode || r.boxType), normalizeCodeFast(r.outboundOrderNo), normalizeCodeFast(r.thirdOrderNo)].join('|')
      )
      setGsSurtido(dedupedSurtRecords)

      const dbData = dbRes?.data || { inventario_escaneo: [], inventario_registros: [], surtido_validacion: [], surtido_validacion_estado: [], rastreo: [], recepcion: [], anormalidades: [], despacho: [], despacho_ordenes: [], meta: null }
      const dedupedDbData = {
        ...dbData,
        inventario_escaneo: dedupeRecords(dbData.inventario_escaneo, r => [compactCode(r.barcode), normalizeCodeFast(r.cell_no), r.status || ''].join('|')),
        inventario_registros: dedupeRecords(dbData.inventario_registros, r => [compactCode(r.normalized_code || r.scanned_code), compactCode(r.code2), normalizeCodeFast(r.cell_no), r.scan_status || ''].join('|')),
        surtido_validacion: dedupeRecords(dbData.surtido_validacion, r => [compactCode(r.scanned_code || r.normalized_code || r.matched_box_type), normalizeCodeFast(r.outbound_order_no), r.scan_result || ''].join('|')),
        surtido_validacion_estado: dedupeRecords(dbData.surtido_validacion_estado, r => [compactCode(r.scanned_code || r.normalized_code || r.matched_box_type), normalizeCodeFast(r.outbound_order_no), r.box_status || r.scan_result || ''].join('|')),
        rastreo: dedupeRecords(dbData.rastreo, r => [compactCode(r.box_code || r.box_code_normalized || r.box_type), normalizeCodeFast(r.folio), normalizeCodeFast(r.outbound_order_no)].join('|')),
        recepcion: dedupeRecords(dbData.recepcion, r => [compactCode(r.custom_box_barcode || r.box_type), normalizeCodeFast(r.folio || r.inbound_order_no), normalizeCodeFast(r.sku)].join('|')),
        anormalidades: dedupeRecords(dbData.anormalidades, r => [normalizeCodeFast(r.folio), compactCode(r.codigo || r.sku || r.contenedor_orden), normalizeCodeFast(r.estado)].join('|')),
        despacho: dedupeRecords(dbData.despacho, r => [compactCode(r.codigo_caja), normalizeCodeFast(r.folio_numero), normalizeCodeFast(r.outbound_order_no || r.matched_order_no)].join('|')),
        despacho_ordenes: dedupeRecords(dbData.despacho_ordenes, r => [normalizeCodeFast(r.outbound_order_no), normalizeCodeFast(r.folio_numero)].join('|')),
      }
      const validationKeys = new Set(dedupedDbData.surtido_validacion.map(r => [
        compactCode(r.normalized_code || r.scanned_code || r.matched_box_type),
        normalizeCodeFast(r.outbound_order_no),
        r.scan_result || '',
      ].join('|')))
      dedupedDbData.surtido_validacion_estado = dedupedDbData.surtido_validacion_estado.filter(r => !validationKeys.has([
        compactCode(r.normalized_code || r.scanned_code || r.matched_box_type),
        normalizeCodeFast(r.outbound_order_no),
        r.scan_result || '',
      ].join('|')))
      setResults(dedupedDbData)

      // Auto-expand first section that has data
      const escaneoLen = dedupedDbData.inventario_escaneo?.length || 0
      const registrosLen = dedupedDbData.inventario_registros?.length || 0
      const validLen = (dedupedDbData.surtido_validacion?.length || 0) + (dedupedDbData.surtido_validacion_estado?.length || 0)
      const rastreoLen = dedupedDbData.rastreo?.length || 0
      const recepcionLen = dedupedDbData.recepcion?.length || 0
      const anormLen = dedupedDbData.anormalidades?.length || 0
      const despLen = dedupedDbData.despacho?.length || 0
      const despOrdenesLen = dedupedDbData.despacho_ordenes?.length || 0
      const firstKey =
        invRecords.length ? 'inv' :
        dedupedSurtRecords.length ? 'surtido' :
        despOrdenesLen ? 'despachoOrdenes' :
        recepcionLen ? 'recepcion' :
        escaneoLen ? 'escaneo' :
        registrosLen ? 'registros' :
        validLen ? 'validacion' :
        rastreoLen ? 'rastreo' :
        despLen ? 'despacho' :
        anormLen ? 'anormalidades' : null
      setOpenSections({ inv: false, surtido: false, escaneo: false, registros: false, validacion: false, rastreo: false, recepcion: false, anormalidades: false, despacho: false, despachoOrdenes: false, ...(firstKey ? { [firstKey]: true } : {}) })
    } catch (err) {
      setResults({ inventario_escaneo: [], inventario_registros: [], surtido_validacion: [], surtido_validacion_estado: [], rastreo: [], recepcion: [], anormalidades: [], despacho: [], despacho_ordenes: [], meta: null })
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setQuery('')
    setSearchMode('exact')
    setResults(null)
    setGsInv(null)
    setGsSurtido(null)
    setOpenSections({ inv: true, surtido: true, escaneo: true, registros: true, validacion: true, rastreo: true, recepcion: true, anormalidades: true, despacho: true, despachoOrdenes: true })
    onClose()
  }

  const totalResults = (gsInv?.length || 0) + (gsSurtido?.length || 0) +
    (results?.inventario_escaneo?.length || 0) + (results?.inventario_registros?.length || 0) +
    (results?.surtido_validacion?.length || 0) + (results?.surtido_validacion_estado?.length || 0) + (results?.rastreo?.length || 0) +
    (results?.recepcion?.length || 0) + (results?.anormalidades?.length || 0) + (results?.despacho?.length || 0) +
    (results?.despacho_ordenes?.length || 0)

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 backdrop-blur-sm pt-8 pb-4 px-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-warm-100 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center">
              <Search size={16} className="text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-warm-900">{t('rastreo.searchModal.title')}</h2>
              <p className="text-[11px] text-warm-400">{t('rastreo.searchModal.subtitle')}</p>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Search input */}
          <div className="px-5 py-4 border-b border-warm-100 shrink-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="inline-flex w-fit rounded-2xl border border-primary-200/70 bg-gradient-to-b from-primary-50 to-white p-1 shadow-[0_16px_28px_-24px_rgba(59,130,246,0.45)]">
                {[
                  { key: 'exact', label: t('rastreo.searchModal.exacta') },
                  { key: 'flexible', label: t('rastreo.searchModal.flexible') },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setSearchMode(tab.key)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                      searchMode === tab.key
                        ? 'border-primary-200 bg-white text-primary-700 shadow-[0_10px_24px_-18px_rgba(37,99,235,0.65)]'
                        : 'border-transparent text-warm-500 hover:border-primary-100 hover:bg-white/80 hover:text-warm-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 flex-1 gap-2">
                <div className="relative min-w-0 flex-1 rounded-full border border-warm-200 bg-white shadow-sm transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
                  <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-warm-400" />
                  <input
                    ref={inputRef}
                    autoFocus
                    className="block w-full rounded-full border-0 bg-transparent py-3 pl-12 pr-44 text-sm text-warm-700 outline-none placeholder-warm-300"
                    placeholder={t('rastreo.searchModal.placeholder')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  />
                  {(query.trim() || results) && (
                    <button
                      onClick={() => {
                        setQuery('')
                        setResults(null)
                        setGsInv(null)
                        setGsSurtido(null)
                        setOpenSections({ inv: true, surtido: true, escaneo: true, registros: true, validacion: true, rastreo: true, recepcion: true, anormalidades: true, despacho: true, despachoOrdenes: true })
                        inputRef.current?.focus()
                      }}
                      className="absolute right-[7.25rem] top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
                      aria-label={t('common.clear')}
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    onClick={handleSearch}
                    disabled={loading || !query.trim()}
                    className="absolute right-1 top-1/2 inline-flex h-10 -translate-y-1/2 items-center gap-1.5 rounded-full bg-primary-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    {t('common.search')}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4 text-[11px] text-warm-400">
              <p className="min-w-0 truncate">
                {searchMode === 'exact'
                  ? t('rastreo.searchModal.exactaHint')
                  : t('rastreo.searchModal.flexibleHint')}
              </p>
              <p className="min-w-0 truncate text-right">
                {searchMode === 'exact'
                  ? t('rastreo.searchModal.tipExacta')
                  : t('rastreo.searchModal.tipFlexible')}
              </p>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {!results && !loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-warm-300">
                <Search size={32} />
                <p className="text-sm">{t('rastreo.searchModal.emptyIdle')}</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 size={24} className="animate-spin text-primary-400" />
                <p className="text-sm text-warm-400">{t('rastreo.searchModal.loading')}</p>
              </div>
            )}

            {results && !loading && (
              <>
                {totalResults === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <AlertCircle size={28} className="text-warm-300" />
                    <p className="text-sm text-warm-500">{t('rastreo.searchModal.emptyQuery')} <span className="font-mono font-semibold">"{query}"</span></p>
                  </div>
                )}

                {gsInv?.length > 0 && (
                  <InventarioSection
                    records={gsInv}
                    open={openSections.inv}
                    onToggle={() => toggleSection('inv')}
                  />
                )}
                {gsSurtido?.length > 0 && (
                  <SurtidoSection
                    records={gsSurtido}
                    open={openSections.surtido}
                    onToggle={() => toggleSection('surtido')}
                  />
                )}
                {results.inventario_escaneo?.length > 0 && (
                  <EscaneoSection
                    records={results.inventario_escaneo}
                    open={openSections.escaneo}
                    onToggle={() => toggleSection('escaneo')}
                  />
                )}
                {results.inventario_registros?.length > 0 && (
                  <InventarioRegistrosSection
                    records={results.inventario_registros}
                    open={openSections.registros}
                    onToggle={() => toggleSection('registros')}
                  />
                )}
                {((results.surtido_validacion?.length || 0) + (results.surtido_validacion_estado?.length || 0)) > 0 && (
                  <ValidacionSection
                    records={[...(results.surtido_validacion || []), ...(results.surtido_validacion_estado || [])]}
                    open={openSections.validacion}
                    onToggle={() => toggleSection('validacion')}
                  />
                )}
                {results.recepcion?.length > 0 && (
                  <RecepcionSection
                    records={results.recepcion}
                    open={openSections.recepcion}
                    onToggle={() => toggleSection('recepcion')}
                  />
                )}
                {results.rastreo?.length > 0 && (
                  <RastreoSection
                    records={results.rastreo}
                    open={openSections.rastreo}
                    onToggle={() => toggleSection('rastreo')}
                  />
                )}
                {results.anormalidades?.length > 0 && (
                  <AnormalidadesSection
                    records={results.anormalidades}
                    open={openSections.anormalidades}
                    onToggle={() => toggleSection('anormalidades')}
                  />
                )}
                {results.despacho?.length > 0 && (
                  <DespachoSection
                    records={results.despacho}
                    open={openSections.despacho}
                    onToggle={() => toggleSection('despacho')}
                  />
                )}
                {results.despacho_ordenes?.length > 0 && (
                  <DespachoOrdenesSection
                    records={results.despacho_ordenes}
                    open={openSections.despachoOrdenes}
                    onToggle={() => toggleSection('despachoOrdenes')}
                  />
                )}
                {searchMode === 'flexible' && results.meta?.used_base_code && (
                  <div className="flex justify-end pt-1">
                    <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[11px] font-semibold text-primary-700">
                      {t('rastreo.searchModal.baseChip')}{results.meta?.base_code ? `: ${results.meta.base_code}` : ''}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
