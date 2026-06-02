import { useRef, useEffect, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, Package, CheckCircle2, AlertTriangle, Ban,
  Loader2, Wifi, WifiOff, Trash2, ArrowRight, MoveRight,
  Square, AlertCircle, ScanBarcode, Clock, Timer,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useInventarioStore } from '../stores/inventarioStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { useBoxStock } from '../hooks/useBoxStock'
import { findCodeInInventory } from '../../_shared/wms/findCodeInInventory'
import { classifyItem, resolveSwap } from '../utils/classify'
import { playSound, initAudio } from '../../_shared/wms/playSound'
import { saveInventorySession } from '../services/inventarioService'
import { getConfig } from '../../wmshub/services/wmsHubService'

const STATUS_META = {
  ok:      { label: 'Disponible', bg: 'bg-success-100 text-success-700',  icon: CheckCircle2, border: 'border-l-success-400', dot: 'bg-success-400', flash: 'bg-success-50/80 border-success-200' },
  blocked: { label: 'Bloqueado',  bg: 'bg-warning-100 text-warning-700',  icon: AlertTriangle, border: 'border-l-warning-400', dot: 'bg-warning-400', flash: 'bg-warning-50/80 border-warning-200' },
  nowms:   { label: 'Sin WMS',    bg: 'bg-danger-100 text-danger-700',    icon: Ban, border: 'border-l-danger-400', dot: 'bg-danger-400', flash: 'bg-danger-50/80 border-danger-200' },
}

const GROUPS = ['ok', 'blocked', 'nowms']

function useSessionTimer(createdAt) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!createdAt) { setElapsed(0); return }
    const start = new Date(createdAt).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt])
  return elapsed
}

const fmtElapsed = (secs) => {
  const m = Math.floor(secs / 60); const s = secs % 60
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

/* ─── Modals ─────────────────────────────────────────────── */

function SessionTypeModal({ isOpen, onStart }) {
  const { t } = useI18nStore()
  const [selected, setSelected] = useState('unificado')
  return (
    <Modal isOpen={isOpen} onClose={() => {}} title={t('inventario.escaneo.session_type_title')} icon={Package}
      footer={
        <div className="flex justify-end">
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => onStart(selected)}>
            <ScanBarcode size={14} /> {t('inventario.escaneo.start_session')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        {[
          { value: 'unificado', label: t('inventario.escaneo.type_unificado'), desc: t('inventario.escaneo.type_unificado_desc') },
          { value: 'clasificacion', label: t('inventario.escaneo.type_clasificacion'), desc: t('inventario.escaneo.type_clasificacion_desc') },
        ].map(opt => (
          <button key={opt.value} onClick={() => setSelected(opt.value)}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
              selected === opt.value ? 'border-primary-500 bg-primary-50' : 'border-warm-200 hover:border-warm-300'
            }`}>
            <p className="font-semibold text-warm-900 text-sm">{opt.label}</p>
            <p className="text-xs text-warm-500 mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function DuplicateModal({ isOpen, code, onConfirm, onDiscard }) {
  const { t } = useI18nStore()
  return (
    <Modal isOpen={isOpen} onClose={onDiscard} title={t('inventario.escaneo.duplicate_title')} icon={AlertCircle}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onDiscard}>{t('inventario.escaneo.descartar')}</button>
          <button className="btn-primary" onClick={onConfirm}>{t('inventario.escaneo.confirmar')}</button>
        </div>
      }
    >
      <p className="text-sm text-warm-700">
        <code className="font-mono bg-warm-100 px-2 py-0.5 rounded">{code}</code>
        <span className="mt-1 block">{t('inventario.escaneo.duplicate_body')}</span>
      </p>
    </Modal>
  )
}

function MoveItemModal({ isOpen, onClose, onMove }) {
  const { t } = useI18nStore()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('inventario.escaneo.move_item')} icon={MoveRight}
      footer={<button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>}
    >
      <div className="space-y-2">
        {GROUPS.map(g => {
          const meta = STATUS_META[g]
          return (
            <button key={g} onClick={() => onMove(g)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border ${meta.bg} border-current/20 hover:opacity-80 text-sm font-medium`}>
              <meta.icon size={14} /> {meta.label}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function SessionSummaryModal({ isOpen, tab, onSave, onContinue, isSaving }) {
  const { t } = useI18nStore()
  if (!tab) return null
  const counts = tab.items.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a }, {})
  const started = new Date(tab.createdAt)
  const durSec = Math.floor((new Date() - started) / 1000)
  const dur = durSec < 60 ? `${durSec}s` : `${Math.floor(durSec/60)}m ${durSec%60}s`
  return (
    <Modal isOpen={isOpen} onClose={onContinue} title={t('inventario.escaneo.session_summary')} icon={Package}
      footer={
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onContinue}>{t('inventario.escaneo.keep_scanning')}</button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('inventario.escaneo.save_registro')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-warm-50 rounded-xl p-3">
            <p className="text-xs text-warm-500 uppercase tracking-wide">{t('inventario.escaneo.tipo_sesion')}</p>
            <p className="font-semibold text-warm-900 mt-0.5 capitalize">{tab.scanType}</p>
          </div>
          <div className="bg-warm-50 rounded-xl p-3">
            <p className="text-xs text-warm-500 uppercase tracking-wide">{t('inventario.escaneo.duration')}</p>
            <p className="font-semibold text-warm-900 mt-0.5">{dur}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GROUPS.map(g => {
            const meta = STATUS_META[g]
            return (
              <div key={g} className={`rounded-xl p-3 text-center ${meta.bg}`}>
                <p className="text-2xl font-bold leading-none">{counts[g] || 0}</p>
                <p className="text-xs mt-1">{meta.label}</p>
              </div>
            )
          })}
        </div>
        <div className="bg-primary-50 rounded-xl px-4 py-2 flex justify-between items-center">
          <span className="text-warm-700">Total</span>
          <span className="font-bold text-primary-700 text-lg">{tab.items.length}</span>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Panels ──────────────────────────────────────────────── */

function UnificadoPanel({ items, onRemove, onMove }) {
  const { t } = useI18nStore()
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-warm-400 gap-3">
        <Package size={40} className="opacity-20" />
        <p className="text-sm">{t('inventario.escaneo.empty_hint')}</p>
      </div>
    )
  }
  return (
    <div className="card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-warm-50/60">
              <th className="table-header">#</th>
              <th className="table-header">{t('inventario.escaneo.code')}</th>
              <th className="table-header">{t('inventario.escaneo.status')}</th>
              <th className="table-header hidden md:table-cell">{t('inventario.escaneo.sku')}</th>
              <th className="table-header hidden md:table-cell">{t('inventario.escaneo.location')}</th>
              <th className="table-header" />
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {[...items].reverse().map((item, revIdx) => {
              const idx = items.length - 1 - revIdx
              const meta = STATUS_META[item.status] ?? STATUS_META.nowms
              const StatusIcon = meta.icon
              return (
                <tr key={idx} className={`border-l-4 ${meta.border} hover:bg-warm-50/40 transition-colors`}>
                  <td className="table-cell text-warm-400 text-xs">{idx + 1}</td>
                  <td className="table-cell font-mono text-xs">
                    <div className="font-semibold">{item.code}</div>
                    {item.code2 && (
                      <div className="text-warm-400">
                        {item.wasSwapped && <span className="text-accent-500 mr-1 text-[10px]">SWAP</span>}
                        {item.code2}
                      </div>
                    )}
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${meta.bg} inline-flex items-center gap-1`}>
                      <StatusIcon size={10} /> {meta.label}
                    </span>
                  </td>
                  <td className="table-cell hidden md:table-cell text-warm-500 text-xs">{item.sku}</td>
                  <td className="table-cell hidden md:table-cell text-warm-500 text-xs">{item.location}</td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-primary-600 transition-colors"
                        onClick={() => onMove(idx)} title={t('inventario.escaneo.move_item')}>
                        <ArrowRight size={12} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                        onClick={() => onRemove(idx)} title={t('common.delete')}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ClasificacionPanel({ items, onRemove, onMove }) {
  const { t } = useI18nStore()
  const grouped = { ok: [], blocked: [], nowms: [] }
  items.forEach((item, idx) => {
    const group = item.groupAssignment && item.groupAssignment !== 'auto' ? item.groupAssignment : item.status
    if (grouped[group]) grouped[group].push({ ...item, _idx: idx })
    else grouped.nowms.push({ ...item, _idx: idx })
  })
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {GROUPS.map(g => {
        const meta = STATUS_META[g]
        const groupItems = grouped[g]
        return (
          <div key={g} className={`card overflow-hidden border-t-4 ${meta.border.replace('border-l-', 'border-t-')}`}>
            <div className={`flex items-center gap-2 px-4 py-2.5 ${meta.bg} border-b border-current/10`}>
              <meta.icon size={14} />
              <span className="font-semibold text-sm">{meta.label}</span>
              <span className="ml-auto font-bold text-lg">{groupItems.length}</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-warm-50">
              {groupItems.length === 0 ? (
                <p className="text-xs text-warm-400 text-center py-4">{t('common.noData')}</p>
              ) : (
                groupItems.map(item => (
                  <div key={item._idx} className="flex items-start gap-2 px-3 py-2 hover:bg-warm-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs truncate font-semibold">{item.code}</p>
                      {item.code2 && (
                        <p className="font-mono text-[10px] text-warm-400 truncate">
                          {item.wasSwapped && <span className="text-accent-500 mr-1">SWAP</span>}{item.code2}
                        </p>
                      )}
                      {item.sku && item.sku !== '-' && <p className="text-[10px] text-warm-500">{item.sku}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button className="p-1 rounded hover:bg-warm-200 text-warm-400 hover:text-primary-600 transition-colors"
                        onClick={() => onMove(item._idx)}><ArrowRight size={11} /></button>
                      <button className="p-1 rounded hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-colors"
                        onClick={() => onRemove(item._idx)}><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function Escaneo() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const scanRef = useRef(null)
  const code2Ref = useRef(null)

  const {
    tabs, activeTabId, pendingCode1,
    openTab, closeTab, setActiveTab,
    addScanItem, removeItem, moveItemGroup,
    setPendingCode1, clearPendingCode1,
    getSummary, inventorySnapshot,
  } = useInventarioStore()

  useBoxStock()
  const { isPending: isSyncing, pendingCount } = useAutoSync()

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const summary = getSummary()
  const sessionElapsed = useSessionTimer(activeTab?.createdAt)

  const [showTypeModal, setShowTypeModal] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [duplicatePending, setDuplicatePending] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)
  const [lastScan, setLastScan] = useState(null) // { status: 'ok'|'blocked'|'nowms'|'duplicate', code }
  const [wmsConfigured, setWmsConfigured] = useState(true)

  const { data: configData } = useQuery({
    queryKey: ['upapex-config'], queryFn: getConfig, staleTime: 60000,
  })
  useEffect(() => {
    if (configData !== undefined) setWmsConfigured(!!configData?.data)
  }, [configData])

  useEffect(() => {
    const handler = () => initAudio()
    document.addEventListener('click', handler, { once: true })
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    if (!pendingCode1) setTimeout(() => scanRef.current?.focus(), 80)
    else setTimeout(() => code2Ref.current?.focus(), 80)
  }, [activeTabId, pendingCode1])

  const saveSessionMut = useMutation({
    mutationFn: () => {
      const tab = useInventarioStore.getState().tabs.find(t => t.id === activeTabId)
      if (!tab) throw new Error('No active tab')
      return saveInventorySession({
        scan_type: tab.scanType,
        scans: tab.items.map(item => ({
          scanned_code: item.raw, normalized_code: item.code, code2: item.code2 || null,
          was_swapped: item.wasSwapped || false, scan_status: item.status,
          sku: item.sku !== '-' ? item.sku : null, product_name: item.product !== '-' ? item.product : null,
          cell_no: item.location !== '-' ? item.location : null, group_assignment: item.groupAssignment || 'auto',
        })),
      })
    },
    onSuccess: () => {
      closeTab(activeTabId); setShowSummaryModal(false)
      toast.success(t('inventario.escaneo.session_started'))
      navigate('/inventario/registros')
    },
    onError: () => toast.error(t('toast.error')),
  })

  function handleAddTab() { setShowTypeModal(true) }

  function handleStartSession(scanType) {
    const res = openTab(scanType)
    setShowTypeModal(false)
    if (res?.error === 'max_tabs') toast.warning(t('inventario.escaneo.max_tabs'))
  }

  function handleCloseTab(tabId) {
    const tab = tabs.find(t => t.id === tabId)
    if (tab?.items.length > 0) {
      if (!window.confirm(t('inventario.escaneo.cancel_confirm'))) return
    }
    closeTab(tabId)
  }

  const doAddItem = useCallback((newItem) => {
    addScanItem(newItem)
    playSound(newItem.status === 'ok' ? 'success' : newItem.status === 'blocked' ? 'warning' : 'error')
    setLastScan({ status: newItem.status, code: newItem.code })
  }, [addScanItem])

  function processScan(rawCode) {
    if (!rawCode.trim()) return
    if (!activeTab) { toast.warning(t('inventario.escaneo.no_tab')); return }
    const inv = inventorySnapshot instanceof Map ? inventorySnapshot : new Map()
    const { code, item } = findCodeInInventory(rawCode, inv)
    if (!item) {
      setPendingCode1({ raw: rawCode, code })
      playSound('error')
      toast.warning(t('inventario.escaneo.enter_code2'))
      setLastScan({ status: 'nowms', code })
      return
    }
    const isDup = activeTab.items.some(i => i.code === code)
    if (isDup) {
      const { status, label } = classifyItem(item)
      const newItem = { raw: rawCode, code, code2: null, wasSwapped: false, status, label,
        sku: item.sku || '-', product: item.productName || '-', location: item.cellNo || '-', groupAssignment: 'auto' }
      setDuplicatePending({ raw: rawCode, code, newItem })
      playSound('warning')
      setLastScan({ status: 'duplicate', code })
      return
    }
    clearPendingCode1()
    const { status, label } = classifyItem(item)
    doAddItem({ raw: rawCode, code, code2: null, wasSwapped: false, status, label,
      sku: item.sku || '-', product: item.productName || '-', location: item.cellNo || '-', groupAssignment: 'auto' })
  }

  function processCode2(rawCode2) {
    if (!rawCode2.trim() || !pendingCode1) return
    clearPendingCode1()
    const inv = inventorySnapshot instanceof Map ? inventorySnapshot : new Map()
    const code2Result = findCodeInInventory(rawCode2, inv)
    if (pendingCode1.code === code2Result.code) {
      toast.warning(t('inventario.escaneo.same_codes')); playSound('warning'); return
    }
    const newItem = { ...resolveSwap(pendingCode1, code2Result, rawCode2), groupAssignment: 'auto' }
    doAddItem(newItem)
    setTimeout(() => scanRef.current?.focus(), 80)
  }

  /* ─── NO SESSION: empty state ─────────────────────────── */
  if (tabs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('inventario.escaneo.title')} subtitle="Inventario" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <motion.div className="text-center mb-8"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
              <motion.div
                className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow-lg"
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.05, rotate: 3 }}>
                <Package className="w-12 h-12 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold text-warm-800 mb-2">{t('inventario.escaneo.start_title')}</h2>
              <p className="text-sm text-warm-500 mb-8 leading-relaxed">{t('inventario.escaneo.no_tab_hint')}</p>

              {!wmsConfigured ? (
                <div className="flex flex-col items-center gap-3">
                  <button onClick={() => navigate('/wmshub')}
                    className="inline-flex items-center gap-2.5 px-8 py-3.5 text-base font-semibold rounded-2xl bg-warning-100 text-warning-700 hover:bg-warning-200 transition-colors">
                    {t('inventario.escaneo.wms_not_configured')}
                  </button>
                </div>
              ) : (
                <motion.button onClick={handleAddTab}
                  className="btn-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-base shadow-glow"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <ScanBarcode className="w-5 h-5" /> {t('inventario.escaneo.new_tab')}
                </motion.button>
              )}
            </motion.div>

            <motion.div className="card overflow-hidden"
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <div className="px-5 py-3.5 border-b border-warm-100 flex items-center justify-between bg-warm-50/50">
                <h4 className="text-sm font-bold text-warm-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-warm-400" /> Tipos de sesión
                </h4>
              </div>
              <div className="divide-y divide-warm-50">
                {[
                  { type: 'unificado', label: t('inventario.escaneo.type_unificado'), desc: t('inventario.escaneo.type_unificado_desc'), color: 'bg-primary-400' },
                  { type: 'clasificacion', label: t('inventario.escaneo.type_clasificacion'), desc: t('inventario.escaneo.type_clasificacion_desc'), color: 'bg-accent-400' },
                ].map(item => (
                  <div key={item.type} className="flex items-center gap-4 px-5 py-3">
                    <div className={`w-9 h-9 rounded-xl ${item.type === 'clasificacion' ? 'bg-accent-100' : 'bg-primary-100'} flex items-center justify-center shrink-0`}>
                      <div className={`w-3 h-3 rounded-full ${item.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-warm-700">{item.label}</p>
                      <p className="text-[11px] text-warm-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
        <SessionTypeModal isOpen={showTypeModal} onStart={handleStartSession} />
      </div>
    )
  }

  /* ─── ACTIVE TABS VIEW ────────────────────────────────── */
  return (
    <div className="flex flex-col h-full">
      <Header title={t('inventario.escaneo.title')} subtitle="Inventario"
        actions={
          <div className="flex items-center gap-1.5">
            {pendingCount > 0 && (
              <span className="px-3 py-2 rounded-xl text-xs font-semibold text-warning-600 bg-warning-50 flex items-center gap-1.5">
                {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <WifiOff size={13} />}
                {pendingCount}
              </span>
            )}
            {activeTab && (
              <button
                className="btn-danger inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={() => setShowSummaryModal(true)}
                disabled={activeTab.items.length === 0}>
                <Square className="w-4 h-4" /> {t('inventario.escaneo.end_session')}
              </button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-0 border-b border-warm-100 bg-white overflow-x-auto">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          const dotColor = tab.scanType === 'clasificacion' ? 'bg-accent-400' : 'bg-primary-400'
          return (
            <div key={tab.id} className="relative shrink-0">
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 pl-3 pr-7 py-2 rounded-t-xl text-sm font-semibold transition-all border-2 border-b-0 ${
                  isActive
                    ? 'bg-white border-warm-200 text-warm-800 shadow-sm -mb-px z-10'
                    : 'bg-warm-50 border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-100'
                }`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                <span className="text-xs">{tab.name}</span>
                <span className="text-[10px] font-bold opacity-60">({tab.items.length})</span>
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleCloseTab(tab.id) }}
                className={`absolute top-1 right-0.5 z-20 rounded-full flex items-center justify-center transition-all shadow-sm ${
                  isActive
                    ? 'w-6 h-6 opacity-80 hover:opacity-100 bg-warm-200 text-warm-700 hover:bg-danger-100 hover:text-danger-600'
                    : 'w-5 h-5 opacity-50 hover:opacity-100 bg-warm-200 text-warm-500 hover:bg-danger-100 hover:text-danger-600'
                }`}>
                <X size={isActive ? 14 : 12} />
              </button>
            </div>
          )
        })}
        {tabs.length < 4 && (
          <button onClick={handleAddTab}
            className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-semibold border-2 border-transparent text-success-600 bg-success-50 hover:bg-success-100 transition-all shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('inventario.escaneo.new_tab')}</span>
          </button>
        )}
      </div>

      {/* Active tab content */}
      {activeTab && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">

            {/* Session info card */}
            <div className="card p-3 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  activeTab.scanType === 'clasificacion' ? 'bg-accent-50' : 'bg-primary-50'
                }`}>
                  <Package className={`w-4 h-4 ${activeTab.scanType === 'clasificacion' ? 'text-accent-600' : 'text-primary-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-warm-800 truncate leading-tight">{activeTab.name}</p>
                  <p className="text-[10px] text-warm-500 leading-tight">
                    {activeTab.scanType === 'clasificacion' ? t('inventario.escaneo.type_clasificacion') : t('inventario.escaneo.type_unificado')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-3xl font-black text-warm-800 tracking-tighter leading-none">
                    {activeTab.items.length}
                    <span className="text-xs font-medium text-warm-400 ml-1">escaneos</span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-warm-100">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success-50">
                  <p className="text-lg font-extrabold text-success-600 leading-none">{summary.ok}</p>
                  <p className="text-[9px] text-success-600 uppercase tracking-wider font-bold leading-tight">Disp.</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warning-50">
                  <p className="text-lg font-extrabold text-warning-600 leading-none">{summary.blocked}</p>
                  <p className="text-[9px] text-warning-600 uppercase tracking-wider font-bold leading-tight">Bloq.</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-danger-50">
                  <p className="text-lg font-extrabold text-danger-600 leading-none">{summary.nowms}</p>
                  <p className="text-[9px] text-danger-600 uppercase tracking-wider font-bold leading-tight">Sin WMS</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/60">
                  <Timer className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-warm-700 font-mono leading-none">{fmtElapsed(sessionElapsed)}</p>
                    <p className="text-[8px] text-warm-400 uppercase tracking-wider font-bold">Tiempo</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scan input */}
            <div>
              {!pendingCode1 ? (
                <div className="relative">
                  <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
                  <input
                    ref={scanRef}
                    type="text"
                    className="w-full pl-14 pr-5 py-5 text-xl bg-white border-2 border-warm-200 rounded-2xl
                      focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:shadow-glow
                      transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                    placeholder={t('inventario.escaneo.scan_placeholder')}
                    onKeyDown={e => { if (e.key === 'Enter') { processScan(e.target.value.trim()); e.target.value = '' } }}
                    autoComplete="off"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-warning-50 border border-warning-200 flex items-center gap-2 text-sm text-warning-700">
                    <AlertCircle size={14} className="shrink-0" />
                    <span className="font-medium flex-1 truncate">
                      {t('inventario.escaneo.code2_waiting')}: <code className="font-mono">{pendingCode1.code}</code>
                    </span>
                    <button className="shrink-0 p-1 hover:bg-warning-200 rounded-lg transition-colors"
                      onClick={() => { clearPendingCode1(); scanRef.current?.focus() }}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="relative">
                    <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warning-400" />
                    <input
                      ref={code2Ref}
                      type="text"
                      className="w-full pl-14 pr-5 py-5 text-xl bg-white border-2 border-warning-300 rounded-2xl
                        focus:border-warning-500 focus:ring-4 focus:ring-warning-100
                        transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                      placeholder={t('inventario.escaneo.code2_placeholder')}
                      onKeyDown={e => { if (e.key === 'Enter') { processCode2(e.target.value.trim()); e.target.value = '' } }}
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Last scan feedback */}
            <AnimatePresence mode="wait">
              {lastScan && (
                <motion.div
                  key={lastScan.code + lastScan.status}
                  initial={{ opacity: 0, y: -10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className={`p-4 rounded-2xl flex items-center gap-3 border ${
                    lastScan.status === 'ok'        ? 'bg-success-50/80 border-success-200' :
                    lastScan.status === 'blocked'   ? 'bg-warning-50/80 border-warning-200' :
                    lastScan.status === 'duplicate' ? 'bg-warning-50/80 border-warning-200' :
                    'bg-danger-50/80 border-danger-200'
                  }`}>
                  {lastScan.status === 'ok'       ? <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" /> :
                   lastScan.status === 'blocked'  ? <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0" /> :
                   lastScan.status === 'duplicate'? <AlertCircle className="w-5 h-5 text-warning-500 shrink-0" /> :
                   <Ban className="w-5 h-5 text-danger-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium opacity-70">Último escaneo</p>
                    <p className="font-mono font-bold text-warm-800 truncate">{lastScan.code}</p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${
                    lastScan.status === 'ok'       ? 'text-success-600' :
                    lastScan.status === 'duplicate'? 'text-warning-600' :
                    lastScan.status === 'blocked'  ? 'text-warning-600' :
                    'text-danger-600'
                  }`}>
                    {STATUS_META[lastScan.status]?.label ?? 'Sin WMS'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Items panel */}
            {activeTab.scanType === 'clasificacion' ? (
              <ClasificacionPanel
                items={activeTab.items}
                onRemove={idx => removeItem(activeTabId, idx)}
                onMove={idx => setMoveTarget(idx)}
              />
            ) : (
              <UnificadoPanel
                items={activeTab.items}
                onRemove={idx => removeItem(activeTabId, idx)}
                onMove={idx => setMoveTarget(idx)}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <SessionTypeModal isOpen={showTypeModal} onStart={handleStartSession} />
      <SessionSummaryModal isOpen={showSummaryModal} tab={activeTab}
        onSave={() => saveSessionMut.mutate()}
        onContinue={() => setShowSummaryModal(false)}
        isSaving={saveSessionMut.isPending} />
      <DuplicateModal isOpen={!!duplicatePending} code={duplicatePending?.code}
        onConfirm={() => {
          if (duplicatePending?.newItem) doAddItem(duplicatePending.newItem)
          setDuplicatePending(null)
          setTimeout(() => scanRef.current?.focus(), 80)
        }}
        onDiscard={() => {
          setDuplicatePending(null)
          setTimeout(() => scanRef.current?.focus(), 80)
        }} />
      <MoveItemModal isOpen={moveTarget !== null} onClose={() => setMoveTarget(null)}
        onMove={newGroup => {
          if (moveTarget !== null && activeTabId) moveItemGroup(activeTabId, moveTarget, newGroup)
          setMoveTarget(null)
        }} />
    </div>
  )
}
