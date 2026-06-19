import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, X, ScanBarcode, List, MapPin, Layers } from 'lucide-react'
import { motion } from 'framer-motion'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import UserMenu from '../../../core/components/layout/UserMenu'
import FolioTypeModal from '../components/FolioTypeModal'
import ValidarPorOrden from '../components/ValidarPorOrden'
import ValidarPorDestino from '../components/ValidarPorDestino'
import { createFolio, bulkAddOrders, getConductores, getUnidades, getOutboundList } from '../services/despachoService'

const TABS_KEY = 'kirion_despacho_tabs'
const ACTIVE_TAB_KEY = 'kirion_despacho_active_tab'
const MAX_TABS = 3

function genId() { return Math.random().toString(36).slice(2, 9) }

function TabBar({ tabs, activeTabId, onSelect, onClose, onAdd, canAdd, t }) {
  return (
    <div className="flex h-full min-w-max items-end gap-1.5 overflow-x-auto overflow-y-hidden scrollbar-hide pr-1 whitespace-nowrap">
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        const dotColor = tab.tipo === 'por_destino' ? 'bg-accent-400' : 'bg-primary-400'
        return (
          <div key={tab.id} className="relative shrink-0">
            <button
              onClick={() => onSelect(tab.id)}
              className={`relative flex items-center gap-2 pl-3 pr-7 py-2 rounded-t-xl text-sm font-semibold transition-all border-2 border-b-0 ${
                isActive
                  ? 'bg-white border-warm-200 text-warm-800 shadow-sm -mb-px z-10'
                  : 'bg-warm-50 border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-100'
              }`}>
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="max-w-[120px] truncate text-xs">{tab.label}</span>
            </button>
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                className={`absolute top-1 right-0.5 z-20 rounded-full flex items-center justify-center transition-all shadow-sm ${
                  isActive
                    ? 'w-6 h-6 opacity-80 hover:opacity-100 bg-warm-200 text-warm-700 hover:bg-danger-100 hover:text-danger-600'
                    : 'w-5 h-5 opacity-50 hover:opacity-100 bg-warm-200 text-warm-500 hover:bg-danger-100 hover:text-danger-600'
                }`}>
                <X size={isActive ? 14 : 12} />
              </button>
            )}
          </div>
        )
      })}
      {canAdd && tabs.length < MAX_TABS && (
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-semibold border-2 border-transparent text-success-600 bg-success-50 hover:bg-success-100 transition-all shrink-0"
          title="Iniciar nueva validación">
          <Plus size={14} />
          <span className="hidden sm:inline">{t('desp.validar.nuevaSesion')}</span>
        </button>
      )}
    </div>
  )
}

export default function Validar() {
  const { addToast } = useToastStore()
  const { t } = useI18nStore()
  const { canWrite } = useAuthStore()
  const canCreate = canWrite('despacho.folios')
  const location = useLocation()

  const [tabs, setTabs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TABS_KEY) || 'null')
      if (Array.isArray(saved) && saved.length > 0) return saved
    } catch {}
    return []
  })

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY)
      if (saved && tabs.find(t => t.id === saved)) return saved
    } catch {}
    return tabs[0]?.id ?? null
  })

  const [showTypeModal, setShowTypeModal] = useState(false)

  // Keep a ref of current tabs to avoid stale closures in the navigation effect
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  // Warm up the Google Sheets cache as soon as the module is opened
  useQuery({
    queryKey: ['despacho-outbound-list'],
    queryFn: getOutboundList,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const { data: conductoresData } = useQuery({
    queryKey: ['despacho-conductores'],
    queryFn: getConductores,
    enabled: showTypeModal,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const { data: unidadesData } = useQuery({
    queryKey: ['despacho-unidades'],
    queryFn: getUnidades,
    enabled: showTypeModal,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const conductores = conductoresData?.conductores ?? []
  const unidades = unidadesData?.unidades ?? []

  const saveTabs = useCallback((next) => {
    setTabs(next)
    try { localStorage.setItem(TABS_KEY, JSON.stringify(next)) } catch {}
  }, [])

  const saveActiveTab = useCallback((id) => {
    setActiveTabId(id)
    try { localStorage.setItem(ACTIVE_TAB_KEY, id) } catch {}
  }, [])

  // Pre-load a folio navigated from FolioDetalle → Validar button
  useEffect(() => {
    const s = location.state
    if (!s?.folioId) return
    window.history.replaceState({}, document.title)
    const currentTabs = tabsRef.current
    const existing = currentTabs.find(tab => tab.folioId === s.folioId)
    if (existing) {
      saveActiveTab(existing.id)
      return
    }
    if (currentTabs.length >= MAX_TABS) {
      addToast(`${t('desp.validar.maxSesiones')} ${MAX_TABS}`, 'warning')
      return
    }
    const newTab = { id: genId(), folioId: s.folioId, tipo: s.tipo, label: s.label }
    saveTabs([...currentTabs, newTab])
    saveActiveTab(newTab.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  function closeTab(tabId) {
    const next = tabs.filter(t => t.id !== tabId)
    saveTabs(next)
    if (activeTabId === tabId) {
      saveActiveTab(next[next.length - 1]?.id ?? null)
    }
  }

  function openAdd() {
    if (tabs.length >= MAX_TABS) {
      addToast(`${t('desp.validar.maxSesiones')} ${MAX_TABS}`, 'warning')
      return
    }
    setShowTypeModal(true)
  }

  const { mutate: doCreate, isPending: isCreating } = useMutation({
    mutationFn: async (payload) => {
      const created = await createFolio({
        tipo: payload.tipo,
        conductor_id: payload.conductor_id,
        unidad_id: payload.unidad_id,
        fecha_salida: payload.fecha_salida,
        destino: payload.destino ?? null,
      })
      const folio = created.folio
      if (payload.tipo === 'por_destino' && payload.orders?.length > 0) {
        await bulkAddOrders(folio.id, payload.orders)
      }
      return folio
    },
    onSuccess: (folio) => {
      const newTab = {
        id: genId(),
        folioId: folio.id,
        tipo: folio.tipo,
        label: folio.folio_numero,
      }
      const next = [...tabs, newTab]
      saveTabs(next)
      saveActiveTab(newTab.id)
      setShowTypeModal(false)
      addToast(`Folio ${folio.folio_numero} creado`, 'success')
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Error creando folio', 'error'),
  })

  return (
    <div className="flex flex-col h-full bg-warm-50">
      {/* Page header */}
      <header className="bg-white/70 backdrop-blur-2xl border-b border-warm-100/40 px-5 py-3 flex items-center gap-4 shrink-0 sticky top-0 z-10 overflow-hidden">
        <div className="flex items-center gap-3 shrink-0 min-w-fit">
          <ScanBarcode className="w-5 h-5 text-primary-600 shrink-0" />
          <h1 className="text-base font-bold text-warm-800 whitespace-nowrap">{t('desp.validar.title')}</h1>
        </div>

        <div className="flex-1 min-w-0 h-11 overflow-hidden">
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={saveActiveTab}
              onClose={closeTab}
              onAdd={openAdd}
              canAdd={canCreate}
              t={t}
            />
          )}
        </div>

        <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-warm-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-warm-500">
          <span className="inline-flex h-2 w-2 rounded-full bg-primary-500" />
          {tabs.length > 0 ? `${tabs.length}/${MAX_TABS} sesiones` : t('desp.validar.empty.modos')}
        </div>

        <UserMenu compact />
      </header>

      {tabs.length === 0 ? (
        /* Empty state — matches Inventario Escaneo pattern */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <motion.div
              className="text-center mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow-lg"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.05, rotate: 3 }}
              >
                <ScanBarcode className="w-12 h-12 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold text-warm-800 mb-2">{t('desp.validar.empty.title')}</h2>
              <p className="text-sm text-warm-500 mb-8 leading-relaxed">
                {t('desp.validar.empty.desc')}
              </p>
              {canCreate && (
                <motion.button
                  onClick={openAdd}
                  className="btn-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-base shadow-glow"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Plus className="w-5 h-5" />
                  {t('desp.validar.iniciarValidacion')}
                </motion.button>
              )}
            </motion.div>

            <motion.div
              className="card overflow-hidden"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="px-5 py-4 border-b border-warm-100 flex items-center gap-2">
                <Layers size={14} className="text-primary-500 shrink-0" />
                <span className="text-sm font-semibold text-warm-700">{t('desp.validar.empty.modos')}</span>
              </div>
              <div className="divide-y divide-warm-100">
                <div className="px-5 py-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                    <List size={14} className="text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-warm-800">{t('desp.validar.tipo.porOrden.label')}</p>
                    <p className="text-xs text-warm-500 mt-0.5 leading-relaxed">{t('desp.validar.tipo.porOrden.desc')}</p>
                  </div>
                </div>
                <div className="px-5 py-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={14} className="text-accent-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-warm-800">{t('desp.validar.tipo.porDestino.label')}</p>
                    <p className="text-xs text-warm-500 mt-0.5 leading-relaxed">{t('desp.validar.tipo.porDestino.desc')}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      ) : (
        /* Tab layout */
        <div className="flex-1 min-h-0 overflow-hidden">
          {tabs.map(tab => (
            <div key={tab.id} className={tab.id === activeTabId ? 'h-full flex flex-col' : 'hidden'}>
              {tab.tipo === 'por_destino' ? (
                <ValidarPorDestino folioId={tab.folioId} />
              ) : (
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <ValidarPorOrden folioId={tab.folioId} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <FolioTypeModal
        isOpen={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        onCreate={doCreate}
        conductores={conductores}
        unidades={unidades}
        isCreating={isCreating}
      />
    </div>
  )
}
