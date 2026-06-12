import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Search, Loader2, Package, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, MapPin, Calendar, User, Tag,
  BarChart2, ShoppingCart, AlertCircle,
} from 'lucide-react'
import CopyableCell from '../../../core/components/common/CopyableCell'
import { buscarCaja } from '../../../core/services/rastreoService'
import { getInventoryList, getOutboundList } from '../../WmsHub/services/googleSheetsService'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'

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
  return (
    <div>
      <SectionHeader
        icon={Package}
        title="BD Stock — Inventario Actual"
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
            <div className="mt-2 rounded-xl border border-primary-100 overflow-hidden">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">Sin coincidencias en inventario actual</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-primary-50/60 border-b border-primary-100">
                    <tr>
                      {['Código Caja', 'Ubicación', 'Disponible', 'Bloqueado', 'Producto', 'Estado'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-primary-600 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-primary-50/30">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.customizeBarcode || r.barcode || '—'} className="font-mono font-medium text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.cellNo || r.cell_no || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-700">{r.availableAmount ?? r.available_stock ?? '—'}</td>
                        <td className="px-3 py-2.5 text-warm-500">{r.lockAmount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-warm-600 max-w-[160px] truncate">{r.productName || r.product_name || '—'}</td>
                        <td className="px-3 py-2.5">
                          {r.status && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                              ${r.status === 'OK' ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-600'}`}>
                              {r.status}
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
  return (
    <div>
      <SectionHeader
        icon={ShoppingCart}
        title="OBC BD — Órdenes de Salida"
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
            <div className="mt-2 rounded-xl border border-accent-100 overflow-hidden">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">Sin coincidencias en órdenes de salida</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-accent-50/60 border-b border-accent-100">
                    <tr>
                      {['Código Caja', 'Número Orden', 'Destinatario', 'Fecha Entrega', 'Referencia', 'Servicio'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-accent-600 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-accent-50/30">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.customizeCode || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.outboundOrderNo || '—'} className="font-mono font-semibold text-primary-700" />
                        </td>
                        <td className="px-3 py-2.5 text-warm-600">{r.customerCode || '—'}</td>
                        <td className="px-3 py-2.5 text-warm-500">
                          {r.expectedTime || r.outboundTime
                            ? new Date(r.expectedTime || r.outboundTime).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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
  return (
    <div>
      <SectionHeader
        icon={BarChart2}
        title="Inventario Escaneo — Movimientos"
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
            <div className="mt-2 rounded-xl border border-warning-100 overflow-hidden">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">Sin movimientos de escaneo registrados</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-warning-50/60 border-b border-warning-100">
                    <tr>
                      {['Código', 'Ubicación', 'Estado', 'Operador', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-warning-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warning-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-warning-50/30">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.barcode || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-warm-600">{r.cell_no || '—'}</td>
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
  return (
    <div>
      <SectionHeader
        icon={CheckCircle2}
        title="Surtido Validación — Escaneos"
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
            <div className="mt-2 rounded-xl border border-success-100 overflow-hidden">
              {!records?.length ? (
                <p className="px-4 py-3 text-xs text-warm-400">Sin registros de validación en surtido</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-success-50/60 border-b border-success-100">
                    <tr>
                      {['Código Escaneado', 'Orden Salida', 'Resultado', 'Operador', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-success-700 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-success-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-success-50/30">
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.scanned_code || '—'} className="font-mono text-warm-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <CopyableCell text={r.outbound_order_no || '—'} className="font-mono font-semibold text-primary-700" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                            ${r.scan_result === 'ok' ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-600'}`}>
                            {r.scan_result === 'ok' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            {r.scan_result}
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

export default function RastreoSearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [gsInv, setGsInv] = useState(null)
  const [gsSurtido, setGsSurtido] = useState(null)
  const [openSections, setOpenSections] = useState({ inv: true, surtido: true, escaneo: true, validacion: true })
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
        buscarCaja(q),
        getInventoryList(),
        getOutboundList ? getOutboundList() : Promise.resolve({ data: { records: [] } }),
      ])

      // Filter GS inventory
      const invRecords = (invRes?.data?.records || []).filter(r => {
        const bc = normalizeCodeFast(r.customizeBarcode || '')
        const cc = normalizeCodeFast(r.customizeCode || '')
        const qn = normalizeCodeFast(q)
        return bc.includes(qn) || cc.includes(qn)
      })
      setGsInv(invRecords)

      // Filter GS outbound
      const surtRecords = []
      ;(outRes?.data?.records || []).forEach(order => {
        ;(order.packageList || []).forEach(box => {
          const code = normalizeCodeFast(box.customizeCode || '')
          if (code.includes(normalizeCodeFast(q))) {
            surtRecords.push({ ...box, ...order, customizeCode: box.customizeCode })
          }
        })
      })
      setGsSurtido(surtRecords)
      setResults(dbRes?.data || { inventario_escaneo: [], surtido_validacion: [] })
    } catch (err) {
      setResults({ inventario_escaneo: [], surtido_validacion: [] })
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setQuery('')
    setResults(null)
    setGsInv(null)
    setGsSurtido(null)
    onClose()
  }

  const totalResults = (gsInv?.length || 0) + (gsSurtido?.length || 0) +
    (results?.inventario_escaneo?.length || 0) + (results?.surtido_validacion?.length || 0)

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-8 pb-4 px-4"
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
              <h2 className="text-base font-semibold text-warm-900">Rastreo de Caja</h2>
              <p className="text-[11px] text-warm-400">Busca en inventario escaneo y validación de surtido</p>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Search input */}
          <div className="px-5 py-4 border-b border-warm-100 shrink-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  ref={inputRef}
                  autoFocus
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-warm-300 text-sm bg-warm-50 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:bg-white transition-all"
                  placeholder="Ingresa código de caja o número de orden..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="btn btn-primary h-11 px-5 flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar
              </button>
              {results && (
                <button onClick={() => { setQuery(''); setResults(null); setGsInv(null); setGsSurtido(null) }} className="btn btn-secondary h-11 px-4">
                  Limpiar
                </button>
              )}
            </div>
            <p className="text-[11px] text-warm-400 mt-1.5">
              Tips: busca por código completo (ej: EFI25071567355U010), código base o número de orden
            </p>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {!results && !loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-warm-300">
                <Search size={32} />
                <p className="text-sm">Ingresa un código para comenzar la búsqueda</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 size={24} className="animate-spin text-primary-400" />
                <p className="text-sm text-warm-400">Consultando bases de datos...</p>
              </div>
            )}

            {results && !loading && (
              <>
                {totalResults === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <AlertCircle size={28} className="text-warm-300" />
                    <p className="text-sm text-warm-500">Sin resultados para <span className="font-mono font-semibold">"{query}"</span></p>
                  </div>
                )}

                <InventarioSection
                  records={gsInv}
                  open={openSections.inv}
                  onToggle={() => toggleSection('inv')}
                />
                <SurtidoSection
                  records={gsSurtido}
                  open={openSections.surtido}
                  onToggle={() => toggleSection('surtido')}
                />
                <EscaneoSection
                  records={results.inventario_escaneo}
                  open={openSections.escaneo}
                  onToggle={() => toggleSection('escaneo')}
                />
                <ValidacionSection
                  records={results.surtido_validacion}
                  open={openSections.validacion}
                  onToggle={() => toggleSection('validacion')}
                />
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
