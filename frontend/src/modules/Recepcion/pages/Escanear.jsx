import { useRef, useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ScanBarcode, Search, X, Plus, Loader2, ArrowRight } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import StatusPill from '../../../core/components/common/StatusPill'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import RecepcionQuickSearch from '../components/RecepcionQuickSearch'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { listOrders, searchByCode } from '../services/recepcionService'
import { useRecepcionEscanearStore } from '../stores/recepcionEscanearStore'
import ValidacionRecepcion from './ValidacionRecepcion'

/* ─── Helpers ─────────────────────────────────────────────── */

function isInbFolio(value) {
  return /^INB-/i.test(String(value).trim())
}

const ESTADO_META = {
  pendiente_validacion: 'bg-warm-100 text-warm-600',
  en_validacion:        'bg-sky-100 text-sky-700',
  completo:             'bg-success-100 text-success-700',
  parcial:              'bg-warning-100 text-warning-700',
  anormal:              'bg-danger-100 text-danger-700',
  cancelado:            'bg-danger-100 text-danger-700',
}

/* ─── Order result card ────────────────────────────────────── */
function OrderCard({ order, onOpen, alreadyOpen, t }) {
  const estadoCls = ESTADO_META[order.estado] ?? ESTADO_META.pendiente_validacion
  const total = Number(order.total_cajas || 0)
  const validated = Number(order.cajas_registradas || order.cajas_validadas || 0)
  const pct = total > 0 ? Math.min(100, Math.round((validated / total) * 100)) : 0

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-mono font-bold text-primary-700 text-sm truncate">{order.folio}</p>
          <p className="text-xs text-warm-500 truncate mt-0.5">{order.cliente || '—'}</p>
        </div>
        <StatusPill className={`text-[11px] font-semibold ${estadoCls} shrink-0`}>
          {t(`rec.status.${order.estado}`) || order.estado}
        </StatusPill>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-warm-400">{t('rec.progreso')}</span>
          <span className="text-[11px] font-bold text-warm-700">{validated} / {total}</span>
        </div>
        <div className="h-1.5 rounded-full bg-warm-100 overflow-hidden">
          <div className="h-full rounded-full bg-primary-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <button
        onClick={() => onOpen(order)}
        className="btn-primary text-xs flex items-center gap-1.5 justify-center"
      >
        {alreadyOpen
          ? <><ArrowRight size={13} />{t('rec.escanear.go_to_tab')}</>
          : <><ArrowRight size={13} />{t('rec.escanear.open_tab')}</>}
      </button>
    </div>
  )
}

/* ─── Empty tab: search/scan to find an order ─────────────── */
function SearchTab({ tabId, onConfirmOrder, openTabOrderIds, onGoToTab, t }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  function doSearch(q) {
    const trimmed = q.trim()
    if (trimmed.length < 2) { setResults(null); return }
    setSearching(true)

    const fn = isInbFolio(trimmed)
      ? listOrders({ q: trimmed, limit: 10 }).then(r => r?.orders ?? [])
      : searchByCode(trimmed).then(r => {
          const orders = r?.orders ?? []
          if (orders.length === 1) {
            onConfirmOrder(orders[0], tabId)
            return null
          }
          return orders
        })

    fn
      .then(orders => { if (orders !== null) setResults(orders) })
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }

  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 400)
  }

  function handleKey(e) {
    if (e.key === 'Enter') { clearTimeout(debounceRef.current); doSearch(query) }
  }

  function handleCardAction(order) {
    if (openTabOrderIds.has(String(order.id))) {
      onGoToTab(order)
    } else {
      onConfirmOrder(order, tabId)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <motion.div className="text-center"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
          <motion.div
            className="w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-5 shadow-glow"
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.05, rotate: 3 }}>
            <ScanBarcode className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-xl font-bold text-warm-800 mb-1">{t('rec.escanear.start_title')}</h2>
          <p className="text-sm text-warm-500">{t('rec.escanear.start_hint')}</p>
        </motion.div>

        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder={t('rec.escanear.search_placeholder')}
            className="input-field pl-10 pr-10 font-mono w-full"
            autoComplete="off"
            spellCheck={false}
          />
          {searching && (
            <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-warm-400 animate-spin" />
          )}
          {!searching && query && (
            <button
              onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {searching && (
          <div className="min-h-[96px]">
            <LoadingSpinner size="sm" text={t('rec.escanear.searching')} delayMs={1000} className="py-6" />
          </div>
        )}

        {results !== null && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider">
              {t('rec.escanear.search_results')} ({results.length})
            </p>
            {results.length === 0 ? (
              <p className="text-sm text-warm-400 text-center py-6">{t('rec.escanear.no_results')}</p>
            ) : (
              <div className="grid gap-3">
                {results.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    alreadyOpen={openTabOrderIds.has(String(order.id))}
                    onOpen={handleCardAction}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Tab bar ──────────────────────────────────────────────── */
function TabBar({ tabs, activeTabId, onSelect, onClose, onAdd, t }) {
  return (
    <div className="flex items-center px-4 pt-3 pb-0 border-b border-warm-100 bg-white shrink-0 min-w-0 overflow-x-auto overflow-y-hidden">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          const label = tab.folio ?? t('rec.escanear.new_tab')
          return (
            <div key={tab.id} className="relative shrink-0">
              <button
                onClick={() => onSelect(tab.id)}
                className={`relative flex items-center gap-2 pl-3 pr-7 py-2 rounded-t-xl text-sm font-semibold transition-all border-2 border-b-0 ${
                  isActive
                    ? 'bg-white border-warm-200 text-warm-800 shadow-sm -mb-px z-10'
                    : 'bg-warm-50 border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-100'
                }`}
              >
                <ScanBarcode size={12} className={isActive ? 'text-sky-500' : 'text-warm-400'} />
                <span className="text-xs max-w-[110px] truncate">{label}</span>
              </button>
              <button
                onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                className={`absolute top-1 right-0.5 z-20 rounded-full flex items-center justify-center transition-all ${
                  isActive
                    ? 'w-6 h-6 opacity-80 hover:opacity-100 bg-warm-200 text-warm-700 hover:bg-danger-100 hover:text-danger-600'
                    : 'w-5 h-5 opacity-50 hover:opacity-100 bg-warm-200 text-warm-500 hover:bg-danger-100 hover:text-danger-600'
                }`}
              >
                <X size={isActive ? 14 : 12} />
              </button>
            </div>
          )
        })}
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-semibold border-2 border-transparent text-success-600 bg-success-50 hover:bg-success-100 transition-all shrink-0"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">{t('rec.escanear.new_tab')}</span>
        </button>
      </div>
    </div>
  )
}

/* ─── Main page ────────────────────────────────────────────── */
const INACTIVITY_MS = 30 * 60 * 1000

export default function EscanearRecepcion() {
  const { t } = useI18nStore()
  const [actionsSlot, setActionsSlot] = useState(null)
  const qc = useQueryClient()

  const {
    tabs, activeTabId,
    openEmptyTab, setTabOrder,
    closeTab, setActiveTab, touchTab, findTabByOrderId,
  } = useRecepcionEscanearStore()

  const activeTab = tabs.find(tb => tb.id === activeTabId) ?? null
  const openTabOrderIds = new Set(tabs.filter(tb => tb.orderId).map(tb => String(tb.orderId)))

  // Always keep at least one tab
  useEffect(() => {
    if (tabs.length === 0) openEmptyTab()
  }, [tabs.length]) // openEmptyTab is a stable Zustand action

  function handleConfirmOrder(order, tabId) {
    const existingTab = findTabByOrderId(String(order.id))
    if (existingTab && existingTab.id !== tabId) {
      handleSelectTab(existingTab.id)
      return
    }
    setTabOrder(tabId, order.id, order.folio, order.cliente, order)
    touchTab(tabId)
  }

  function handleGoToTab(order) {
    const existing = findTabByOrderId(String(order.id))
    if (existing) handleSelectTab(existing.id)
  }

  function handleValidationBack(tabId) {
    setTabOrder(tabId, null, null, null)
  }

  const handleSelectTab = useCallback((tabId) => {
    // Read from store state directly to avoid stale closure in concurrent mode
    const tab = useRecepcionEscanearStore.getState().tabs.find(t => t.id === tabId)
    if (tab?.orderId && tab.lastActiveAt) {
      const inactive = Date.now() - new Date(tab.lastActiveAt).getTime()
      if (inactive > INACTIVITY_MS) {
        // 2-element prefix invalidates both validation-summary and validation-lines
        qc.invalidateQueries({ queryKey: ['recepcion-order', tab.orderId] })
        qc.invalidateQueries({ queryKey: ['recepcion-scan-events', tab.orderId] })
      }
    }
    touchTab(tabId)
    setActiveTab(tabId)
  }, [qc, touchTab, setActiveTab])

  const subtitle = activeTab?.folio
    ? `${t('nav.recepcion')} · ${activeTab.folio}`
    : t('nav.recepcion')

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('rec.escanear.title')}
        subtitle={subtitle}
        quickSearch={<RecepcionQuickSearch />}
        actions={<div ref={setActionsSlot} className="flex items-center gap-1.5 sm:gap-2" />}
      />

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={handleSelectTab}
        onClose={closeTab}
        onAdd={openEmptyTab}
        t={t}
      />

      <div className="flex-1 overflow-hidden flex flex-col relative">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`absolute inset-0 flex flex-col ${tab.id === activeTabId ? '' : 'hidden'}`}
          >
            {tab.orderId === null ? (
              <SearchTab
                tabId={tab.id}
                onConfirmOrder={handleConfirmOrder}
                openTabOrderIds={openTabOrderIds}
                onGoToTab={handleGoToTab}
                t={t}
              />
            ) : (
              <ValidacionRecepcion
                orderId={tab.orderId}
                initialOrder={tab.orderSnapshot}
                embedded
                onBack={() => handleValidationBack(tab.id)}
                headerActionsSlot={tab.id === activeTabId ? actionsSlot : null}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
