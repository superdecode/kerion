import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as ds from '../services/dropscanService'
import api from '../../../core/services/api'
import OperadorAuthModal from '../components/OperadorAuthModal'
import RecountModal from '../components/RecountModal'
import { useOperadorStore } from '../stores/operadorStore'
import { fmtTime, fmtTimeShort, fmtDateTime, getToday } from '../../../core/utils/dateFormat'
import {
  ScanBarcode, Play, Square, Package, Trash2, Search,
  CheckCircle, XCircle, Volume2, VolumeX,
  PanelRightClose, PanelRightOpen, Clock, Ban, AlertTriangle, Plus, X, Building2, Radio, RotateCcw,
  Download, Pencil, Lock, ShieldAlert, Timer, Zap
} from 'lucide-react'
import { scoreTrackingCode } from '../utils/trackingValidator'
import { useOfflineStore } from '../../../core/stores/offlineStore'

/* ─── session timer hook ─────────────────────────────── */
function useSessionTimer(sessionStartTime) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!sessionStartTime) { setElapsed(0); return }
    const start = new Date(sessionStartTime).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sessionStartTime])
  return elapsed
}

const fmtElapsed = (secs) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/* ─── helpers ─────────────────────────────────────────── */
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination); gain.gain.value = 0.15
    if (type === 'success') { osc.frequency.value = 880; osc.type = 'sine'; osc.start(); osc.stop(ctx.currentTime + 0.1) }
    else if (type === 'error') { osc.frequency.value = 220; osc.type = 'square'; osc.start(); osc.stop(ctx.currentTime + 0.3) }
    else if (type === 'complete') { osc.frequency.value = 1200; osc.type = 'sine'; osc.start(); setTimeout(() => { osc.frequency.value = 1500 }, 100); osc.stop(ctx.currentTime + 0.25) }
    else if (type === 'warning') { osc.frequency.value = 600; osc.type = 'triangle'; osc.start(); osc.stop(ctx.currentTime + 0.2) }
    else if (type === 'suspicious') {
      // double-beep: two short pulses at 440Hz sawtooth — distinct "wait, check this" alert
      osc.frequency.value = 440; osc.type = 'sawtooth'
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.01)
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.16)
      gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.26)
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.42)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45)
    }
  } catch (e) { /* silent */ }
}

const getTodayDateStr = getToday

const calcDuration = (tarima) => {
  if (!tarima) return '--'
  if (tarima.tiempo_armado_segundos) return `${Math.round(tarima.tiempo_armado_segundos / 60)} min`
  if (tarima.fecha_inicio) {
    const end = tarima.fecha_cierre ? new Date(tarima.fecha_cierre) : new Date()
    const secs = Math.round((new Date(end) - new Date(tarima.fecha_inicio)) / 1000)
    return secs > 0 ? `${Math.round(secs / 60)} min` : '--'
  }
  return '--'
}

const estadoBadgeClass = (estado) => {
  switch (estado) {
    case 'EN_PROCESO': return 'bg-primary-100 text-primary-700'
    case 'FINALIZADA': return 'bg-success-100 text-success-700'
    case 'CANCELADA': return 'bg-danger-100 text-danger-700'
    default: return 'bg-warm-200 text-warm-600'
  }
}
const formatEstado = (e) => e ? e.replace(/_/g, ' ') : e

/* ─── initial tab state ───────────────────────────────── */
const newTabState = (id) => ({
  tabId: id,                // local unique id for React key
  session: null,
  tarima: null,
  guias: [],
  duplicados: [],
  guiasCount: 0,           // total scanned in this tab session
  duplicadosCount: 0,      // total duplicates in this tab session
  completedTarimas: [],
  scanInput: '',
  lastScan: null,
  flashType: null,
  historyTab: 'guias',
  panelSearch: '',
  panelDetailId: null,
  empresa: null,           // full empresa object
  canal: null,             // full canal object
  isStarting: false,
})

let tabCounter = 0

/* ═══════════════════════════════════════════════════════ */
export default function Escaneo() {
  const [tabs, setTabs] = useState([])                   // array of tab states
  const [activeTabId, setActiveTabId] = useState(null)   // which tab is focused
  const [showOperadorAuth, setShowOperadorAuth] = useState(false) // operator auth before session
  const [showStartModal, setShowStartModal] = useState(false) // first session start
  const [showAddTabModal, setShowAddTabModal] = useState(false) // add new tab
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelTargetTabId, setCancelTargetTabId] = useState(null)
  const [showPanel, setShowPanel] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showRecount, setShowRecount] = useState(false)
  const [completionPrompt, setCompletionPrompt] = useState(null) // { tabId, tarima, nuevaTarima }
  const [panelEditMode, setPanelEditMode] = useState(false)
  const [suspiciousModal, setSuspiciousModal] = useState(null)      // { code, tabId, score, level }
  const [deleteLastGuideModal, setDeleteLastGuideModal] = useState(null) // { tabId, guia }
  const [deleteGuiaModal, setDeleteGuiaModal] = useState(null)          // { tabId, guiaId, guiaCodigo, posicion }
  const [deleteTarimaGuiaModal, setDeleteTarimaGuiaModal] = useState(null) // { guia } for valid tarima guide deletion
  const [endSessionModal, setEndSessionModal] = useState(null)      // { tabId }
  const [reopenConfirmModal, setReopenConfirmModal] = useState(null) // { pallet }

  // empresa/canal pickers for modals
  const [pickerEmpresa, setPickerEmpresa] = useState('')
  const [pickerCanal, setPickerCanal] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  const inputRef = useRef(null)
  const scanInFlight = useRef(new Set()) // tracks tabId:code pairs currently in flight
  const location = useLocation()
  const qc = useQueryClient()
  const { canDelete, canWrite, hasPermission, user } = useAuthStore()
  const toast = useToastStore.getState()
  const { t } = useI18nStore()
  const { isAuthenticated: operadorAuthed, getSessionPayload, clearOperador } = useOperadorStore()
  const isSupervisor = ['Supervisor', 'Jefe', 'Administrador'].includes(user?.rol_nombre)
  // crear+: can scan but needs internal operator PIN authentication
  const canScanWithPin = hasPermission('dropscan.escaneo', 'crear')
  // actualizar+: can scan directly with own profile, skips PIN
  const canScanDirect = hasPermission('dropscan.escaneo', 'desbloquear')
  const MAX_ACTIVE_TABS = 3

  const deleteGuiaFromTarimaMutation = useMutation({
    mutationFn: ({ tarimaId, guiaId }) => ds.deleteGuiaFromTarima(tarimaId, guiaId),
    onSuccess: (data, { tarimaId }) => {
      toast.success('Guía eliminada')
      qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail', tarimaId] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error'))
  })

  const finalizePanelTarimaMutation = useMutation({
    mutationFn: (id) => ds.finalizeTarima(id),
    onSuccess: () => {
      toast.success('Tarima finalizada')
      qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail', panelDetailId] })
      qc.invalidateQueries({ queryKey: ['dropscan-today-history'] })
      updateTab(activeTabId, { panelDetailId: null })
      setPanelEditMode(false)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al finalizar tarima')
  })

  const handleExportPanelDetailExcel = () => {
    if (!panelDetailData?.tarima) return
    const td = panelDetailData.tarima
    const guias = panelDetailData.guias || []
    try {
      const wsData = [
        ['Tarima', td.codigo],
        ['Empresa', td.empresa_nombre],
        ['Canal', td.canal_nombre],
        ['Operador', td.operador_nombre],
        ['Guías', `${td.cantidad_guias}/${gpt}`],
        ['Estado', td.estado],
        ['Inicio', td.fecha_inicio ? fmtDateTime(td.fecha_inicio) : '--'],
        ['Cierre', td.fecha_cierre ? fmtDateTime(td.fecha_cierre) : '--'],
        ['Duración', td.tiempo_armado_segundos ? `${Math.round(td.tiempo_armado_segundos / 60)} min` : '--'],
        [],
        ['#', 'Código Guía', 'Operador', 'Hora Escaneo'],
        ...guias.map(g => [g.posicion, g.codigo_guia, g.operador_nombre, fmtDateTime(g.timestamp_escaneo)])
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Tarima')
      XLSX.writeFile(wb, `tarima_${td.codigo}_${getToday()}.xlsx`)
    } catch { toast.error(t('toast.error')) }
  }

  const { data: empresasData } = useQuery({ queryKey: ['dropscan-empresas'], queryFn: ds.getEmpresas })
  const { data: canalesData } = useQuery({ queryKey: ['dropscan-canales'], queryFn: ds.getCanales })
  const { data: parametrosData } = useQuery({ queryKey: ['dropscan-parametros'], queryFn: ds.getParametros })
  const gpt = parametrosData?.guias_por_tarima || 100
  const empresas = (Array.isArray(empresasData) ? empresasData : empresasData?.items || empresasData?.empresas || []).filter(e => e.activo !== false)
  const allCanales = Array.isArray(canalesData) ? canalesData : canalesData?.items || canalesData?.canales || []
  const pickerCanales = pickerEmpresa
    ? allCanales.filter(c => c.activo !== false && c.empresas?.some(e => e.id === parseInt(pickerEmpresa)))
    : allCanales.filter(c => c.activo !== false)

  // Today's history (shown when no tabs)
  const todayStr = getTodayDateStr()
  const { data: todayHistoryData } = useQuery({
    queryKey: ['dropscan-today-history', todayStr],
    queryFn: () => ds.getTarimas({ fecha_inicio: todayStr, fecha_fin: todayStr }),
    enabled: tabs.length === 0,
  })
  const todayTarimasDup = todayHistoryData?.items || todayHistoryData?.tarimas || []
  const todayTarimas = todayTarimasDup.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)

  // Today's tarimas for side panel (always fetched when session active)
  const { data: panelTodayData } = useQuery({
    queryKey: ['dropscan-panel-today', todayStr],
    queryFn: () => ds.getTarimas({ fecha_inicio: todayStr, fecha_fin: todayStr, limit: 100 }),
    enabled: tabs.length > 0,
    refetchInterval: 15000,
  })

  /* panel detail query for active tab */
  const activeTab = tabs.find(t => t.tabId === activeTabId) || null
  const panelDetailId = activeTab?.panelDetailId || null
  const { data: panelDetailData } = useQuery({
    queryKey: ['dropscan-tarima-detail', panelDetailId],
    queryFn: () => ds.getTarimaDetail(panelDetailId),
    enabled: !!panelDetailId,
  })

  /* restore active backend sessions on mount (multi-tab) */
  useEffect(() => {
    ds.getAllActiveSessions().then((data) => {
      const sessions = data?.sesiones || []
      if (sessions.length > 0) {
        const nextTabs = sessions.slice(0, MAX_ACTIVE_TABS).map((item) => {
          const tabId = ++tabCounter
          const emp = empresas.find(e => e.id === item.sesion.empresa_id)
          const can = allCanales.find(c => c.id === item.sesion.canal_id)
          return {
            ...newTabState(tabId),
            session: item.sesion,
            tarima: item.tarima_actual,
            guias: item.ultimas_guias || [],
            guiasCount: item.tarima_actual?.cantidad_guias || 0,
            empresa: emp || { id: item.sesion.empresa_id, nombre: item.sesion.empresa_nombre, color: '#8b5cf6' },
            canal: can || { id: item.sesion.canal_id, nombre: item.sesion.canal_nombre },
          }
        })
        setTabs(nextTabs)
        setActiveTabId(nextTabs[0].tabId)
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasData, canalesData])

  /* resume scan from Historial navigation */
  useEffect(() => {
    const resume = location.state?.resumeScan
    if (resume) {
      setPickerEmpresa(String(resume.empresa_id))
      setPickerCanal(String(resume.canal_id))
      if (tabs.length === 0) setShowStartModal(true)
      else setShowAddTabModal(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* focus input when active tab changes */
  useEffect(() => {
    if (activeTab?.session && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [activeTabId, activeTab?.session])

  /* ── tab state helpers ─────────────────────────────── */
  const updateTab = useCallback((tabId, patchOrFn) => {
    setTabs(prev => prev.map(t => t.tabId === tabId
      ? { ...t, ...(typeof patchOrFn === 'function' ? patchOrFn(t) : patchOrFn) }
      : t
    ))
  }, [])

  const removeTab = useCallback((tabId) => {
    setTabs(prev => {
      const next = prev.filter(t => t.tabId !== tabId)
      if (next.length > 0 && activeTabId === tabId) {
        setActiveTabId(next[next.length - 1].tabId)
      } else if (next.length === 0) {
        setActiveTabId(null)
      }
      return next
    })
  }, [activeTabId])

  /* ── operator auth flow ────────────────────────────── */
  const [authTarget, setAuthTarget] = useState('start') // 'start' or 'addTab'

  const handleRequestNewSession = () => {
    if (canScanDirect) {
      // actualizar+: skip PIN, start directly with own profile
      setPickerEmpresa(''); setPickerCanal(''); setShowStartModal(true)
    } else if (operadorAuthed) {
      setPickerEmpresa(''); setPickerCanal(''); setShowStartModal(true)
    } else {
      setAuthTarget('start')
      setShowOperadorAuth(true)
    }
  }

  const handleRequestAddTab = () => {
    if (tabs.length >= MAX_ACTIVE_TABS) {
      toast.warning(t('scan.reopenLimitReached'))
      return
    }
    if (canScanDirect) {
      setPickerEmpresa(''); setPickerCanal(''); setShowAddTabModal(true)
    } else if (operadorAuthed) {
      setPickerEmpresa(''); setPickerCanal(''); setShowAddTabModal(true)
    } else {
      setAuthTarget('addTab')
      setShowOperadorAuth(true)
    }
  }

  const handleOperadorAuthenticated = () => {
    setShowOperadorAuth(false)
    setPickerEmpresa(''); setPickerCanal('')
    if (authTarget === 'addTab') {
      setShowAddTabModal(true)
    } else {
      setShowStartModal(true)
    }
  }

  /* ── start session (first tab or add-tab) ─────────── */
  const handleStartSession = async (isNew = false) => {
    if (tabs.length >= MAX_ACTIVE_TABS) {
      toast.warning(t('scan.reopenLimitReached'))
      return
    }
    if (!pickerEmpresa || !pickerCanal) return
    setIsStarting(true)
    try {
      const operadorPayload = getSessionPayload()
      const data = await ds.startSession(parseInt(pickerEmpresa), parseInt(pickerCanal), operadorPayload)
      const emp = empresas.find(e => e.id === parseInt(pickerEmpresa))
      const can = allCanales.find(c => c.id === parseInt(pickerCanal))
      const tabId = ++tabCounter
      const tab = {
        ...newTabState(tabId),
        session: data.sesion,
        tarima: data.tarima_actual,
        empresa: emp || null,
        canal: can || null,
      }
      setTabs(prev => [...prev, tab])
      setActiveTabId(tabId)
      setShowStartModal(false)
      setShowAddTabModal(false)
      setPickerEmpresa('')
      setPickerCanal('')
      toast.success(t('scan.sessionStarted'))
    } catch (err) {
      const msg = err.response?.data?.detail
        ? `${err.response.data.error}: ${err.response.data.detail}`
        : err.response?.data?.error || t('toast.error')
      toast.error(msg)
    } finally {
      setIsStarting(false)
    }
  }

  /* ── end session for a tab ─────────────────────────── */
  const handleEndSession = (tabId) => {
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab?.session) return
    setEndSessionModal({ tabId })
  }

  const handleConfirmEndSession = async () => {
    if (!endSessionModal) return
    const { tabId } = endSessionModal
    setEndSessionModal(null)
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab?.session) return
    try {
      await ds.endSession(tab.session.id)
      removeTab(tabId)
      toast.info(t('scan.sessionEnded'))
      qc.invalidateQueries({ queryKey: ['dropscan-today-history'] })
    } catch { toast.error(t('toast.error')) }
  }

  const handleRequestReopenFromPanel = (pallet) => {
    if (!pallet || pallet.estado !== 'EN_PROCESO') return
    const alreadyOpen = tabs.find(tb => tb.tarima?.id === pallet.id)
    if (alreadyOpen) {
      setActiveTabId(alreadyOpen.tabId)
      toast.info(t('scan.reopenAlreadyOpen'))
      return
    }
    if (tabs.length >= MAX_ACTIVE_TABS) {
      toast.warning(t('scan.reopenLimitReached'))
      return
    }
    setReopenConfirmModal({ pallet })
  }

  const handleConfirmReopenFromPanel = async () => {
    const pallet = reopenConfirmModal?.pallet
    if (!pallet) return
    setReopenConfirmModal(null)
    if (tabs.length >= MAX_ACTIVE_TABS) {
      toast.warning(t('scan.reopenLimitReached'))
      return
    }
    try {
      const data = await ds.adoptTarima(pallet.id)
      const tabId = ++tabCounter
      const emp = empresas.find(e => e.id === data.sesion.empresa_id)
      const can = allCanales.find(c => c.id === data.sesion.canal_id)
      const tab = {
        ...newTabState(tabId),
        session: data.sesion,
        tarima: data.tarima_actual,
        guias: data.ultimas_guias || [],
        guiasCount: data.tarima_actual?.cantidad_guias || 0,
        empresa: emp || { id: data.sesion.empresa_id, nombre: data.sesion.empresa_nombre, color: '#8b5cf6' },
        canal: can || { id: data.sesion.canal_id, nombre: data.sesion.canal_nombre },
      }
      setTabs(prev => [...prev, tab])
      setActiveTabId(tabId)
      toast.success(t('scan.reopenSuccess'))
      qc.invalidateQueries({ queryKey: ['dropscan-panel-today'] })
      qc.invalidateQueries({ queryKey: ['dropscan-today-history'] })
    } catch (err) {
      toast.error(err.response?.data?.error || t('toast.error'))
    }
  }

  /* ── perform actual scan (after validation passes) ── */
  const performActualScan = useCallback(async (tabId, code) => {
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return

    // Offline mode: queue locally and show optimistic feedback
    const isOffline = useOfflineStore.getState().status === 'offline'
    if (isOffline) {
      useOfflineStore.getState().enqueue(tab.session.id, code, tab.tarima?.id)
      if (soundEnabled) playSound('warning')
      const nextPos = (tab.tarima?.cantidad_guias || 0) + 1
      updateTab(tabId, {
        tarima: tab.tarima ? { ...tab.tarima, cantidad_guias: nextPos } : tab.tarima,
        guias: [{ id: `offline-${Date.now()}`, codigo_guia: code, posicion: nextPos, timestamp_escaneo: new Date().toISOString(), offline: true }, ...tab.guias],
        lastScan: { type: 'success', code, pos: nextPos },
        flashType: 'success',
      })
      toast.info(`Guardado offline: ${code}`)
      setTimeout(() => updateTab(tabId, { flashType: null }), 500)
      return
    }

    try {
      const data = await ds.scanGuia(tab.session.id, code, tab.tarima?.id)
      if (soundEnabled) playSound('success')
      if (data.tarima_completada) {
        updateTab(tabId, (t) => {
          const completedCount = data.tarima?.cantidad_guias || (t.tarima?.cantidad_guias || 0) + 1
          return {
            tarima: data.nueva_tarima,
            guias: [],
            lastScan: { type: 'success', code: data.guia.codigo_guia, pos: data.guia.posicion },
            flashType: 'success',
            guiasCount: (t.guiasCount || 0) + completedCount,
            completedTarimas: [{ ...data.tarima, estado: 'FINALIZADA', completedAt: new Date() }, ...t.completedTarimas],
          }
        })
        if (soundEnabled) playSound('complete')
        setCompletionPrompt({ tabId, tarima: data.tarima, nuevaTarima: data.nueva_tarima })
      } else {
        updateTab(tabId, (t) => ({
          tarima: data.tarima,
          guias: [data.guia, ...t.guias],
          lastScan: { type: 'success', code: data.guia.codigo_guia, pos: data.guia.posicion },
          flashType: 'success',
        }))
      }
      if (data.alerta) { if (soundEnabled) playSound('warning'); if (data.guia.posicion >= (gpt - 5)) toast.warning(data.alerta.message) }
    } catch (err) {
      const d = err.response?.data
      if (d?.error === 'DUPLICADO') {
        let msg = d.message
        if (d.posicion_original) {
          msg = d.duplicado_en === 'tarima_actual'
            ? t('scan.alreadyScannedInPallet').replace('{pos}', d.posicion_original)
            : t('scan.alreadyScannedInOtherPallet').replace('{pallet}', d.tarima_original).replace('{pos}', d.posicion_original)
        }
        if (soundEnabled) playSound('error')
        toast.error(msg)
        updateTab(tabId, (t) => ({
          lastScan: { type: 'duplicate', message: msg },
          flashType: 'error',
          duplicadosCount: (t.duplicadosCount || 0) + 1,
          duplicados: [{ codigo_guia: code, message: msg, tarima_original: d.tarima_original, posicion_original: d.posicion_original, duplicado_en: d.duplicado_en, timestamp: new Date() }, ...t.duplicados],
        }))
      } else if (d?.code === 'TARIMA_NO_ACTIVA') {
        // Session's tarima is finalized/cancelled — session was auto-closed by backend.
        // Show clear error and auto-close the tab after a short delay.
        if (soundEnabled) playSound('error')
        toast.error(d.error || 'La tarima ya no está activa. Inicia una nueva sesión.')
        updateTab(tabId, {
          lastScan: { type: 'error', message: d.error },
          flashType: 'error',
          sessionEnded: true, // Mark tab as ended so UI shows "start new session"
        })
        // Don't close the tab immediately — let the user read the message
      } else {
        if (soundEnabled) playSound('error')
        toast.error(d?.error || t('toast.error'))
        updateTab(tabId, { flashType: 'error' })
      }
    }
    setTimeout(() => updateTab(tabId, { flashType: null }), 500)
  }, [tabs, soundEnabled, updateTab, t, toast])

  /* ── scan ─────────────────────────────────────────── */
  const handleScan = useCallback(async (e, tabId) => {
    e.preventDefault()
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return
    const code = tab.scanInput.trim()
    if (!code) return

    // Validate if the code looks like a real tracking guide
    const validation = scoreTrackingCode(code)
    if (validation.score < 70) {
      if (soundEnabled) playSound('suspicious')
      updateTab(tabId, { scanInput: '' })
      setSuspiciousModal({ code, tabId, score: validation.score, level: validation.level })
      return
    }

    const key = `${tabId}:${code}`
    if (scanInFlight.current.has(key)) return
    scanInFlight.current.add(key)
    updateTab(tabId, { scanInput: '' })
    try {
      await performActualScan(tabId, code)
    } finally {
      scanInFlight.current.delete(key)
    }
  }, [tabs, soundEnabled, updateTab, performActualScan])

  /* ── confirm suspicious scan ────────────────────── */
  const handleConfirmSuspicious = useCallback(async () => {
    if (!suspiciousModal) return
    const { code, tabId } = suspiciousModal
    setSuspiciousModal(null)
    updateTab(tabId, { scanInput: '' })
    await performActualScan(tabId, code)
  }, [suspiciousModal, updateTab, performActualScan])

  /* ── delete guide (any position, supervisor flow) ── */
  const handleDeleteGuia = (tabId, guiaId) => {
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return
    const guia = tab.guias.find(g => g.id === guiaId)
    if (!guia) return
    setDeleteGuiaModal({ tabId, guiaId, guiaCodigo: guia.codigo_guia, posicion: guia.posicion })
  }

  /* ── delete guide confirmation (executes after modal confirm) ── */
  const handleDeleteGuiaConfirm = useCallback(async () => {
    if (!deleteGuiaModal) return
    const { tabId, guiaId } = deleteGuiaModal
    setDeleteGuiaModal(null)
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return
    try {
      await ds.deleteGuia(tab.session.id, guiaId)
      updateTab(tabId, {
        guias: tab.guias.filter(g => g.id !== guiaId),
        tarima: tab.tarima ? { ...tab.tarima, cantidad_guias: Math.max(0, tab.tarima.cantidad_guias - 1) } : null,
      })
      toast.success(t('scan.guideDeleted'))
    } catch { toast.error(t('toast.error')) }
  }, [deleteGuiaModal, tabs, updateTab, t, toast])

  /* ── delete last guide (operador+ with modal confirm) */
  const handleDeleteLastGuide = useCallback(async () => {
    if (!deleteLastGuideModal) return
    const { tabId, guia } = deleteLastGuideModal
    setDeleteLastGuideModal(null)
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return
    try {
      await ds.deleteGuia(tab.session.id, guia.id)
      updateTab(tabId, {
        guias: tab.guias.filter(g => g.id !== guia.id),
        tarima: tab.tarima ? { ...tab.tarima, cantidad_guias: Math.max(0, tab.tarima.cantidad_guias - 1) } : null,
      })
      toast.success(t('scan.guideDeleted'))
    } catch { toast.error(t('toast.error')) }
  }, [deleteLastGuideModal, tabs, updateTab, t, toast])

  /* ── close tab (X button) ─────────────────────────── */
  const handleCloseTab = async (tabId) => {
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return
    if (!tab.session) { removeTab(tabId); return }
    const hasData = (tab.tarima?.cantidad_guias || 0) > 0
    if (!hasData) {
      // empty tarima → endSession auto-deletes empty tarimas on the backend
      try { await ds.endSession(tab.session.id) } catch {}
      removeTab(tabId)
      toast.info(t('scan.sessionEnded'))
      qc.invalidateQueries({ queryKey: ['dropscan-today-history'] })
      qc.invalidateQueries({ queryKey: ['dropscan-panel-today'] })
    } else {
      // switch to this tab and show cancel modal
      setActiveTabId(tabId)
      setCancelTargetTabId(tabId)
      setCancelReason('')
      setShowCancelModal(true)
    }
  }

  /* ── cancel tarima ────────────────────────────────── */
  const handleCancelTarima = async () => {
    const tab = tabs.find(t => t.tabId === cancelTargetTabId)
    if (!tab || !cancelReason.trim()) { toast.warning(t('scan.cancelReasonRequired')); return }
    try {
      await api.post(`/dropscan/tarimas/${tab.tarima.id}/cancel`, { razon: cancelReason.trim() })
      toast.success(t('scan.palletCancelled'))
      setShowCancelModal(false)
      setCancelReason('')
      // End the session too and remove tab
      await ds.endSession(tab.session.id).catch(() => {})
      removeTab(cancelTargetTabId)
      qc.invalidateQueries({ queryKey: ['dropscan-today-history'] })
    } catch (err) { toast.error(err.response?.data?.error || t('toast.error')) }
  }

  /* ── tarima completion prompt handlers ───────────── */
  const handleCompletionContinue = () => setCompletionPrompt(null)

  const handleCompletionNewEmpresa = async () => {
    const tabId = completionPrompt?.tabId
    setCompletionPrompt(null)
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return
    try { await ds.endSession(tab.session.id) } catch {}
    removeTab(tabId)
    qc.invalidateQueries({ queryKey: ['dropscan-today-history'] })
    setPickerEmpresa(''); setPickerCanal(''); setShowStartModal(true)
  }

  const handleCompletionFinish = async () => {
    const tabId = completionPrompt?.tabId
    setCompletionPrompt(null)
    const tab = tabs.find(t => t.tabId === tabId)
    if (!tab) return
    try { await ds.endSession(tab.session.id) } catch {}
    removeTab(tabId)
    qc.invalidateQueries({ queryKey: ['dropscan-today-history'] })
    toast.info(t('scan.sessionEnded'))
  }

  /* ── session timer & live stats ──────────────────── */
  const sessionElapsed = useSessionTimer(activeTab?.session?.fecha_inicio)
  const scanRate = useMemo(() => {
    if (!activeTab?.tarima) return 0
    const mins = sessionElapsed / 60
    if (mins < 0.5) return 0
    const totalGuias = (activeTab.guiasCount || 0) + (activeTab.tarima?.cantidad_guias || 0)
    return (totalGuias / mins).toFixed(1)
  }, [sessionElapsed, activeTab?.guiasCount, activeTab?.tarima?.cantidad_guias])

  /* ── derived values for active tab ───────────────── */
  const tab = activeTab
  const empresaColor = tab?.empresa?.color || '#8b5cf6'
  const currentGuias = tab?.tarima?.cantidad_guias || 0
  const progressPercent = (currentGuias / gpt) * 100
  const progressGradient = progressPercent >= 95 ? 'from-danger-400 to-danger-600'
    : progressPercent >= 90 ? 'from-warning-400 to-warning-600'
    : 'from-primary-400 to-accent-500'

  // Deduplicate by id — LATERAL-join fix is on backend, this is a safety net
  const panelTarimaDups = panelTodayData?.items || panelTodayData?.tarimas || []
  const panelTarimas = panelTarimaDups.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
  const allPanelTarimas = tab
    ? panelTarimas.map(p => ({ ...p, isCurrent: p.id === tab.tarima?.id }))
    : []
  const filteredPanel = tab?.panelSearch
    ? allPanelTarimas.filter(p => p?.codigo?.toLowerCase().includes(tab.panelSearch.toLowerCase()))
    : allPanelTarimas

  /* ══════════════════════════════════════════════════ */
  /* NO SESSION: empty state + start                   */
  /* ══════════════════════════════════════════════════ */
  if (tabs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <Header title={t('scan.title')} subtitle="DropScan" showSearch />
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
                <ScanBarcode className="w-12 h-12 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold text-warm-800 mb-2">{t('scan.startSession')}</h2>
              <p className="text-sm text-warm-500 mb-8 leading-relaxed">{t('scan.startDesc')}</p>
              {canScanWithPin ? (
                <motion.button onClick={handleRequestNewSession}
                  className="btn-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-base shadow-glow"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Play className="w-5 h-5" /> {t('scan.start')}
                </motion.button>
              ) : (
                <button
                  disabled
                  title="No tienes permisos para iniciar un escaneo"
                  className="inline-flex items-center gap-2.5 px-8 py-3.5 text-base font-semibold rounded-2xl bg-warm-200 text-warm-400 cursor-not-allowed opacity-70">
                  <Lock className="w-5 h-5" /> {t('scan.start')}
                </button>
              )}
            </motion.div>

            {/* Today history */}
            <motion.div className="card overflow-hidden"
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <div className="px-5 py-3.5 border-b border-warm-100 flex items-center justify-between bg-warm-50/50">
                <h4 className="text-sm font-bold text-warm-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-warm-400" />{t('history.todayHistory')}
                </h4>
                <span className="badge bg-warm-100 text-warm-500">{todayTarimas.length}</span>
              </div>
              {todayTarimas.length === 0
                ? <div className="p-10 text-center text-sm text-warm-400">{t('history.noPalletsToday')}</div>
                : <div className="divide-y divide-warm-50">
                    {todayTarimas.map(p => (
                      <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-warm-50/50 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-semibold text-warm-700 truncate">{p.codigo}</p>
                          <p className="text-[10px] text-warm-400 font-medium">{p.cantidad_guias} {t('dashboard.guides')}</p>
                        </div>
                        <span className={`badge text-[9px] ${estadoBadgeClass(p.estado)}`}>{formatEstado(p.estado)}</span>
                      </div>
                    ))}
                  </div>
              }
            </motion.div>
          </div>
        </div>

        {/* Operator auth modal */}
        <OperadorAuthModal
          isOpen={showOperadorAuth}
          onClose={() => setShowOperadorAuth(false)}
          onAuthenticated={handleOperadorAuthenticated}
        />

        {/* Start modal */}
        <EmpresaCanalModal
          isOpen={showStartModal} onClose={() => { setShowStartModal(false); setPickerEmpresa(''); setPickerCanal('') }}
          empresas={empresas} canales={pickerCanales}
          empresa={pickerEmpresa} canal={pickerCanal}
          onEmpresaChange={(v) => { setPickerEmpresa(v); setPickerCanal('') }}
          onCanalChange={setPickerCanal}
          onConfirm={() => handleStartSession(false)}
          isLoading={isStarting} t={t}
        />
      </div>
    )
  }

  /* ══════════════════════════════════════════════════ */
  /* ACTIVE TABS VIEW                                  */
  /* ══════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full">
      {/* Global header */}
      <Header title={t('scan.activeTitle')}
        subtitle={tab ? `${tab.empresa?.nombre || ''} · ${tab.canal?.nombre || ''}` : 'DropScan'}
        showSearch
        actions={
          <div className="flex items-center gap-1.5">
            <button onClick={() => setSoundEnabled(!soundEnabled)}
              className={`px-3 py-2 rounded-xl transition-all inline-flex items-center gap-2 text-sm font-semibold ${soundEnabled ? 'text-primary-600 bg-primary-50 shadow-sm' : 'text-warm-500 bg-warm-100 hover:bg-warm-200'}`}>
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">{soundEnabled ? t('scan.sound') : t('scan.mute')}</span>
            </button>
            <button onClick={() => setShowPanel(!showPanel)}
              className="px-3 py-2 rounded-xl text-warm-500 bg-warm-100 hover:bg-warm-200 transition-all hidden lg:inline-flex items-center gap-2 text-sm font-semibold">
              {showPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              <span>{t('scan.panel')}</span>
            </button>
            {tab && tab.tarima && (tab.tarima.cantidad_guias || 0) > 0 && (
              <button onClick={() => setShowRecount(true)}
                className="px-3 py-2 rounded-xl text-primary-600 bg-primary-50 hover:bg-primary-100 transition-all inline-flex items-center gap-2 text-sm font-semibold">
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">{t('recount.btnTitle')}</span>
              </button>
            )}
            {tab && (
              <button onClick={() => {
                if ((tab.tarima?.cantidad_guias || 0) === 0) {
                  handleCloseTab(activeTabId)
                } else {
                  setCancelTargetTabId(activeTabId); setCancelReason(''); setShowCancelModal(true)
                }
              }}
                disabled={!tab.tarima}
                className="px-3 py-2 rounded-xl text-warning-600 bg-warning-50 hover:bg-warning-100 transition-all inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                <Ban className="w-4 h-4" />
                <span className="hidden sm:inline">{t('common.cancel')}</span>
              </button>
            )}
            {tab && (
              <button onClick={() => handleEndSession(activeTabId)}
                className="btn-danger inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold">
                <Square className="w-4 h-4" /> {t('scan.end')}
              </button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-0 border-b border-warm-100 bg-white overflow-x-auto">
        {tabs.map((tb, idx) => {
          const isActive = tb.tabId === activeTabId
          const empColor = tb.empresa?.color || '#8b5cf6'
          return (
            <div key={tb.tabId} className="relative shrink-0 group">
              <button
                onClick={() => setActiveTabId(tb.tabId)}
                className={`relative flex items-center gap-2 pl-3 pr-7 py-2 rounded-t-xl text-sm font-semibold transition-all border-2 border-b-0 ${
                  isActive
                    ? 'bg-white border-warm-200 text-warm-800 shadow-sm -mb-px z-10'
                    : 'bg-warm-50 border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-100'
                }`}
              >
                {/* empresa color dot */}
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: empColor }} />
                <span className="font-mono text-xs">{tb.tarima?.codigo?.split('-').pop() || `#${idx + 1}`}</span>
                <span className="text-xs opacity-70">{tb.empresa?.nombre || '?'}</span>
                <span className="text-[10px] font-bold opacity-60">({tb.tarima?.cantidad_guias || 0}/{gpt})</span>
                {/* counters badges */}
                {tb.duplicados.length > 0 && (
                  <span className="badge bg-danger-100 text-danger-600 text-[9px] ml-1">{tb.duplicados.length} dup</span>
                )}
              </button>
              {/* X close button — always visible, bigger on active tab */}
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tb.tabId) }}
                className={`absolute top-1 right-0.5 z-20 rounded-full flex items-center justify-center transition-all shadow-sm ${
                  isActive
                    ? 'w-6 h-6 opacity-80 hover:opacity-100 bg-warm-200 text-warm-700 hover:bg-danger-100 hover:text-danger-600'
                    : 'w-5 h-5 opacity-50 hover:opacity-100 bg-warm-200 text-warm-500 hover:bg-danger-100 hover:text-danger-600'
                }`}
                title={t('scan.closeTab')}
              >
                <X className={isActive ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
              </button>
            </div>
          )
        })}

        {/* Add new tab button */}
        {tabs.length < MAX_ACTIVE_TABS && (
          <button
            onClick={handleRequestAddTab}
            className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-sm font-semibold text-success-600 bg-success-50 hover:bg-success-100 border-2 border-transparent transition-all shrink-0"
            title={t('scan.addPallet')}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Nueva tab</span>
          </button>
        )}
      </div>

      {/* Active tab content */}
      {tab && (
        <div className="flex-1 flex overflow-hidden">
          {/* Main scan area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">

              {/* Tarima status card */}
              <motion.div className="card p-3 mb-3 shadow-sm overflow-hidden relative"
                key={`card-${tab.tabId}-${tab.tarima?.id}`}
                style={{
                  borderWidth: '2px',
                  borderColor: empresaColor + '40',
                  background: `linear-gradient(135deg, white 0%, ${empresaColor}08 50%, ${empresaColor}12 100%)`
                }}
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

                {/* Empresa/Canal + tarima code + count — single row */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: empresaColor + '18' }}>
                    <Building2 className="w-3.5 h-3.5" style={{ color: empresaColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-warm-800 truncate leading-tight">{tab.empresa?.nombre || '—'}</p>
                    <p className="text-[10px] text-warm-500 truncate flex items-center gap-1 leading-tight">
                      <Radio className="w-2.5 h-2.5" />{tab.canal?.nombre || '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wider leading-none">{tab.tarima?.codigo || '—'}</p>
                    <p className="text-3xl font-black text-warm-800 tracking-tighter leading-none">{currentGuias}<span className="text-xs font-medium text-warm-400">/{gpt}</span></p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2.5 bg-warm-100 rounded-full overflow-hidden border border-warm-200/50">
                  <div className={`h-full bg-gradient-to-r ${progressGradient} rounded-full transition-all duration-500 ease-out ${progressPercent > 0 ? 'min-w-[6px]' : ''}`}
                    style={{ width: `${progressPercent}%` }} />
                </div>
                {progressPercent >= 90 && (
                  <p className="text-[10px] text-danger-500 font-bold animate-pulse mt-0.5 text-right">
                    {progressPercent >= 95 ? t('scan.almostFull') : t('scan.reachingCapacity')}
                  </p>
                )}

                {/* Per-tab counters */}
                <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t" style={{ borderColor: empresaColor + '25' }}>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/60">
                    <p className="text-lg font-extrabold text-warm-800 leading-none">{currentGuias}</p>
                    <p className="text-[9px] text-warm-400 uppercase tracking-wider font-bold leading-tight">{t('scan.totalGuides')}</p>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/60">
                    <p className="text-lg font-extrabold text-danger-500 leading-none">{tab.duplicados.length}</p>
                    <p className="text-[9px] text-warm-400 uppercase tracking-wider font-bold leading-tight">{t('scan.duplicates')}</p>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/60">
                    <Timer className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-warm-700 font-mono leading-none">{fmtElapsed(sessionElapsed)}</p>
                      <p className="text-[8px] text-warm-400 uppercase tracking-wider font-bold">Tiempo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/60">
                    <Zap className="w-3.5 h-3.5 text-accent-500 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-warm-700 leading-none">{scanRate}<span className="text-[8px] text-warm-400 ml-0.5">/min</span></p>
                      <p className="text-[8px] text-warm-400 uppercase tracking-wider font-bold">Ritmo</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Scan input */}
              <form onSubmit={(e) => handleScan(e, activeTabId)} className="mb-5">
                <div className="relative">
                  <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={tab.scanInput}
                    onChange={(e) => updateTab(activeTabId, { scanInput: e.target.value })}
                    placeholder={canWrite('dropscan.escaneo') ? t('scan.placeholder') : 'Solo lectura — sin permiso para escanear'}
                    autoComplete="off"
                    disabled={!canWrite('dropscan.escaneo')}
                    className={`w-full pl-14 pr-5 py-5 text-xl bg-white border-2 border-warm-200 rounded-2xl
                      focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:shadow-glow
                      transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide
                      disabled:bg-warm-50 disabled:text-warm-400 disabled:cursor-not-allowed
                      ${tab.flashType === 'success' ? 'animate-scan-success' : tab.flashType === 'error' ? 'animate-scan-error' : ''}`}
                  />
                </div>
              </form>

              {/* Last scan feedback */}
              <AnimatePresence mode="wait">
                {tab.lastScan && (
                  <motion.div
                    key={tab.lastScan.code || tab.lastScan.message}
                    initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={`mb-5 p-4 rounded-2xl flex items-center gap-3 ${
                      tab.lastScan.type === 'success' ? 'bg-success-50/80 border border-success-200 backdrop-blur-sm' : 'bg-danger-50/80 border border-danger-200 backdrop-blur-sm'
                    }`}>
                    {tab.lastScan.type === 'success'
                      ? <CheckCircle className="w-5 h-5 text-success-500 shrink-0" />
                      : <XCircle className="w-5 h-5 text-danger-500 shrink-0" />}
                    <p className={`text-sm font-semibold ${tab.lastScan.type === 'success' ? 'text-success-700' : 'text-danger-700'}`}>
                      {tab.lastScan.type === 'success'
                        ? `${t('scan.guideRegistered')} ${tab.lastScan.code} · ${t('scan.position')} ${tab.lastScan.pos}`
                        : tab.lastScan.message}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Guias / duplicados history */}
              <div className="card overflow-hidden">
                <div className="flex border-b border-warm-100">
                  <button onClick={() => updateTab(activeTabId, { historyTab: 'guias' })}
                    className={`flex-1 px-4 py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                      tab.historyTab === 'guias' ? 'text-primary-700 bg-primary-50/50 border-b-2 border-primary-500' : 'text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                    }`}>
                    <CheckCircle className="w-4 h-4" />
                    {t('scan.correctGuides')}
                    <span className={`badge text-xs ${tab.historyTab === 'guias' ? 'bg-primary-100 text-primary-700' : 'bg-warm-100 text-warm-500'}`}>{currentGuias}</span>
                  </button>
                  <button onClick={() => updateTab(activeTabId, { historyTab: 'duplicados' })}
                    className={`flex-1 px-4 py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                      tab.historyTab === 'duplicados' ? 'text-danger-700 bg-danger-50/50 border-b-2 border-danger-500' : 'text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                    }`}>
                    <AlertTriangle className="w-4 h-4" />
                    {t('scan.duplicates')}
                    <span className={`badge text-xs ${tab.historyTab === 'duplicados' ? 'bg-danger-100 text-danger-600' : 'bg-warm-100 text-warm-500'}`}>{tab.duplicados.length}</span>
                  </button>
                </div>
                <AnimatePresence mode="wait">
                  {tab.historyTab === 'guias' ? (
                    <motion.div key="guias" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>
                      {tab.guias.length === 0
                        ? <div className="p-10 text-center text-sm text-warm-400">{t('scan.firstScan')}</div>
                        : <div className="divide-y divide-warm-50 max-h-[50vh] overflow-y-auto scrollbar-thin">
                            {tab.guias.map((g, i) => (
                              <div key={g.id} className={`flex items-center gap-4 px-5 py-3 hover:bg-warm-50/50 transition-colors ${i === 0 ? 'bg-primary-50/30' : ''}`}>
                                <span className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">{g.posicion}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-mono font-semibold text-warm-700 truncate">{g.codigo_guia}</p>
                                  <p className="text-[10px] text-warm-400 font-medium">{fmtTime(g.timestamp_escaneo)}</p>
                                </div>
                                {/* Last guide: any user with write permission can delete via modal */}
                                {i === 0 && canWrite('dropscan.escaneo') && (
                                  <button onClick={() => setDeleteLastGuideModal({ tabId: activeTabId, guia: g })}
                                    title="Eliminar última guía"
                                    className="p-2 rounded-xl hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {/* Other guides: supervisor+gestion only */}
                                {i !== 0 && canDelete('dropscan.escaneo') && isSupervisor && (
                                  <button onClick={() => handleDeleteGuia(activeTabId, g.id)}
                                    className="p-2 rounded-xl hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                      }
                    </motion.div>
                  ) : (
                    <motion.div key="dups" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                      {tab.duplicados.length === 0
                        ? <div className="p-10 text-center text-sm text-warm-400">{t('scan.noDuplicates')}</div>
                        : <div className="divide-y divide-warm-50 max-h-[50vh] overflow-y-auto scrollbar-thin">
                            {tab.duplicados.map((d, i) => (
                              <div key={`dup-${i}`} className="flex items-center gap-4 px-5 py-3 hover:bg-danger-50/30 transition-colors">
                                <span className="w-9 h-9 rounded-xl bg-danger-100 text-danger-600 flex items-center justify-center shrink-0">
                                  {d.posicion_original ? <span className="text-xs font-bold">#{d.posicion_original}</span> : <XCircle className="w-4 h-4" />}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-mono font-semibold text-warm-700 truncate">{d.codigo_guia}</p>
                                  <p className="text-[10px] text-danger-500 font-medium truncate">{d.message}</p>
                                  <p className="text-[10px] text-warm-400 font-medium">{fmtTime(d.timestamp)}</p>
                                </div>
                                {(isSupervisor || i === 0) && (
                                  <button onClick={() => updateTab(activeTabId, { duplicados: tab.duplicados.filter((_, j) => j !== i) })}
                                    className="p-2 rounded-xl hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                      }
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right panel */}
          {showPanel && (
            <div className="hidden lg:flex w-80 border-l border-warm-100 bg-white flex-col shrink-0 animate-fade-in">
              <div className="px-4 py-3.5 border-b border-warm-100 bg-warm-50/50">
                <h4 className="text-sm font-bold text-warm-700 mb-2">{t('scan.sessionPallets')}</h4>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-400" />
                  <input value={tab.panelSearch} onChange={e => updateTab(activeTabId, { panelSearch: e.target.value })}
                    placeholder={t('scan.searchPallet')} className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-warm-200 outline-none focus:border-primary-400" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
                {filteredPanel.filter(Boolean).length === 0
                  ? <div className="py-8 text-center text-xs text-warm-400">{t('scan.noPalletsYet')}</div>
                  : filteredPanel.filter(Boolean).map(pallet => (
                      <div key={pallet.id} onClick={() => updateTab(activeTabId, { panelDetailId: pallet.id })}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          pallet.isCurrent ? 'border-primary-200 bg-primary-50/50 shadow-sm'
                          : pallet.estado === 'CANCELADA' ? 'border-danger-100 bg-danger-50/30 hover:border-danger-200'
                          : 'border-warm-100 hover:border-warm-200 hover:bg-warm-50'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-warm-700 font-mono">{pallet.codigo}</span>
                          {pallet.isCurrent
                            ? <span className="badge bg-primary-100 text-primary-700 text-[9px]">ACTIVA</span>
                            : <span className={`badge text-[9px] ${estadoBadgeClass(pallet.estado)}`}>{formatEstado(pallet.estado)}</span>
                          }
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-warm-400 font-medium">{pallet.cantidad_guias}/{gpt} guias</span>
                          {pallet.completedAt && (
                            <span className="text-[10px] text-warm-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />{fmtTimeShort(pallet.completedAt)}
                            </span>
                          )}
                        </div>
                        <div className="w-full h-1.5 bg-warm-100 rounded-full mt-2 overflow-hidden">
                          <div className={`h-full rounded-full ${pallet.isCurrent ? 'bg-gradient-to-r from-primary-400 to-accent-500' : pallet.estado === 'CANCELADA' ? 'bg-danger-400' : 'bg-success-400'}`}
                            style={{ width: `${(pallet.cantidad_guias / gpt) * 100}%` }} />
                        </div>
                        {pallet.estado === 'EN_PROCESO' && !pallet.isCurrent && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRequestReopenFromPanel(pallet) }}
                            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-all font-semibold"
                            title={t('scan.reopenFromHistory')}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {t('scan.reopenFromHistory')}
                          </button>
                        )}
                      </div>
                    ))
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panel detail modal */}
      <Modal isOpen={!!panelDetailId} onClose={() => { updateTab(activeTabId, { panelDetailId: null }); setPanelEditMode(false) }}
        title={panelDetailData?.tarima ? panelDetailData.tarima.codigo : t('common.loading')} icon={Package} size="xl"
        headerAction={panelDetailData?.tarima && canDelete('dropscan.escaneo') && (
          <button onClick={handleExportPanelDetailExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success-50 text-success-700 rounded-lg hover:bg-success-100 font-semibold transition-all border border-success-200">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
        )}
        footer={panelDetailData?.tarima && (
          <>
            {canWrite('dropscan.escaneo') && panelDetailData.tarima.estado === 'EN_PROCESO' && (() => {
              const matchTab = tabs.find(tb => tb.empresa?.id === panelDetailData.tarima.empresa_id && tb.canal?.id === panelDetailData.tarima.canal_id)
              return (
                <button onClick={() => {
                  updateTab(activeTabId, { panelDetailId: null }); setPanelEditMode(false)
                  if (matchTab) setActiveTabId(matchTab.tabId)
                }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-500 text-white rounded-xl hover:bg-primary-600 font-semibold transition-all">
                  <ScanBarcode className="w-4 h-4" /> Continuar escaneando
                </button>
              )
            })()}
            {hasPermission('dropscan.escaneo', 'cancelar') && panelDetailData.tarima.estado === 'EN_PROCESO' && (
              <button onClick={() => finalizePanelTarimaMutation.mutate(panelDetailData.tarima.id)}
                disabled={finalizePanelTarimaMutation?.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-danger-50 text-danger-700 rounded-xl hover:bg-danger-100 font-semibold transition-all border border-danger-200 disabled:opacity-50">
                <Lock className="w-4 h-4" /> Finalizar
              </button>
            )}
            {canDelete('dropscan.escaneo') && (
              <button onClick={() => setPanelEditMode(e => !e)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl font-semibold transition-all ${
                  panelEditMode ? 'bg-warning-100 text-warning-700 hover:bg-warning-200' : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                }`}>
                <Pencil className="w-4 h-4" /> {panelEditMode ? 'Finalizar edición' : 'Editar'}
              </button>
            )}
          </>
        )}>
        {panelDetailData?.tarima && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { l: t('history.guides'), v: `${panelDetailData.tarima.cantidad_guias}/${gpt}` },
                { l: t('common.status'), v: formatEstado(panelDetailData.tarima.estado) },
                { l: t('history.startTime'), v: panelDetailData.tarima.fecha_inicio ? fmtTimeShort(panelDetailData.tarima.fecha_inicio) : '--' },
                { l: t('history.duration'), v: calcDuration(panelDetailData.tarima) },
              ].map(f => (
                <div key={f.l} className="p-3 rounded-xl bg-warm-50 border border-warm-100">
                  <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold">{f.l}</p>
                  <p className="text-sm font-semibold text-warm-700 mt-0.5">{f.v}</p>
                </div>
              ))}
            </div>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-warm-200 shadow-inner">
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-10 border-b border-warm-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-warm-600">#</th>
                    <th className="text-left px-4 py-3 font-bold text-warm-600">{t('history.guideCode')}</th>
                    <th className="text-left px-4 py-3 font-bold text-warm-600">{t('history.operator')}</th>
                    <th className="text-left px-4 py-3 font-bold text-warm-600">{t('history.scanTime')}</th>
                    {panelEditMode && <th className="w-8"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-100">
                  {(panelDetailData.guias || []).map(g => (
                    <tr key={g.id} className="hover:bg-warm-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-warm-500 font-medium">{g.posicion}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-warm-700">{g.codigo_guia}</td>
                      <td className="px-4 py-2.5 text-warm-400 text-xs">{g.operador_nombre}</td>
                      <td className="px-4 py-2.5 text-warm-500 text-xs">{fmtTime(g.timestamp_escaneo)}</td>
                      {panelEditMode && (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => setDeleteTarimaGuiaModal({ guia: g })}
                            disabled={deleteGuiaFromTarimaMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-all disabled:opacity-40">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Tarima completion prompt */}
      <Modal isOpen={!!completionPrompt} onClose={handleCompletionContinue}
        title="Tarima Completada" icon={CheckCircle} size="sm">
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-success-50 border border-success-200 text-center">
            <p className="text-sm font-bold text-success-800 font-mono">
              {completionPrompt?.tarima?.codigo}
            </p>
            <p className="text-xs text-success-600 mt-0.5">100 guías registradas exitosamente</p>
          </div>
          <p className="text-xs text-warm-500 text-center font-medium">¿Cómo desea continuar?</p>
          <div className="grid gap-2">
            <button onClick={handleCompletionContinue}
              className="w-full px-4 py-3 rounded-xl bg-primary-50 border-2 border-primary-200 text-primary-700 font-semibold text-sm hover:bg-primary-100 transition-all text-left flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0 text-primary-500" />
              <div>
                <p className="font-bold text-sm">Continuar</p>
                <p className="text-xs font-normal opacity-70">Mismo canal y empresa · Nueva tarima lista</p>
              </div>
            </button>
            <button onClick={handleCompletionNewEmpresa}
              className="w-full px-4 py-3 rounded-xl bg-warm-50 border-2 border-warm-200 text-warm-700 font-semibold text-sm hover:bg-warm-100 transition-all text-left flex items-center gap-3">
              <Building2 className="w-5 h-5 shrink-0 text-warm-400" />
              <div>
                <p className="font-bold text-sm">Nueva empresa o canal</p>
                <p className="text-xs font-normal opacity-70">Seleccionar empresa / canal diferente</p>
              </div>
            </button>
            <button onClick={handleCompletionFinish}
              className="w-full px-4 py-3 rounded-xl bg-danger-50 border-2 border-danger-200 text-danger-700 font-semibold text-sm hover:bg-danger-100 transition-all text-left flex items-center gap-3">
              <Square className="w-5 h-5 shrink-0 text-danger-500" />
              <div>
                <p className="font-bold text-sm">Finalizar</p>
                <p className="text-xs font-normal opacity-70">Terminar esta sesión de escaneo</p>
              </div>
            </button>
          </div>
        </div>
      </Modal>

      {/* Cancel tarima modal */}
      <Modal isOpen={showCancelModal} onClose={() => { setShowCancelModal(false); setCancelReason('') }}
        title={t('scan.cancelPalletTitle')} icon={Ban}
        footer={<>
          <button onClick={() => { setShowCancelModal(false); setCancelReason('') }} className="btn-ghost">{t('common.back')}</button>
          <button onClick={handleCancelTarima} disabled={!cancelReason.trim()}
            className="btn-danger inline-flex items-center gap-2">
            <Ban className="w-4 h-4" /> {t('scan.cancelPallet')}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-warning-50 border border-warning-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-warning-800">{t('scan.cancelPalletWarning')}</p>
              {cancelTargetTabId && (() => { const ct = tabs.find(t => t.tabId === cancelTargetTabId); return ct ? (
                <p className="text-xs text-warning-600 mt-1">
                  {t('history.palletCode')}: <span className="font-mono font-bold">{ct.tarima?.codigo}</span> ({ct.tarima?.cantidad_guias || 0} {t('dashboard.guides')})
                </p>
              ) : null })()}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5">{t('scan.cancelReason')} *</label>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              placeholder={t('scan.cancelReasonPlaceholder')} rows={3}
              className="w-full px-4 py-3 text-sm bg-white border-2 border-warm-200 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-100 transition-all outline-none placeholder:text-warm-300 resize-none" />
          </div>
        </div>
      </Modal>

      {/* End session confirmation modal */}
      {(() => {
        const esTab = endSessionModal ? tabs.find(t => t.tabId === endSessionModal.tabId) : null
        return (
          <Modal isOpen={!!endSessionModal} onClose={() => setEndSessionModal(null)}
            title="Finalizar sesión de escaneo" icon={Square} size="sm"
            footer={<>
              <button onClick={() => setEndSessionModal(null)} className="btn-ghost">Cancelar</button>
              <button onClick={handleConfirmEndSession} className="btn-danger inline-flex items-center gap-2">
                <Square className="w-4 h-4" /> Finalizar sesión
              </button>
            </>}>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-warning-50 border border-warning-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-warning-800">¿Finalizar esta sesión de escaneo?</p>
                  <p className="text-xs text-warning-700 mt-1">
                    La tarima activa se marcará como <span className="font-bold">FINALIZADA</span> con la hora actual. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
              {esTab?.tarima && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-warm-50 border border-warm-100">
                    <p className="text-[10px] text-warm-400 font-medium uppercase tracking-wider mb-0.5">Tarima activa</p>
                    <p className="text-sm font-mono font-bold text-warm-800">{esTab.tarima.codigo}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-warm-50 border border-warm-100">
                    <p className="text-[10px] text-warm-400 font-medium uppercase tracking-wider mb-0.5">Guías escaneadas</p>
                    <p className="text-sm font-bold text-warm-800">{esTab.tarima.cantidad_guias} <span className="text-warm-400 font-normal">/ {gpt}</span></p>
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* Suspicious scan confirmation modal */}
      <Modal isOpen={!!suspiciousModal} onClose={() => setSuspiciousModal(null)}
        title="Código sospechoso" icon={ShieldAlert} size="sm"
        footer={<>
          <button onClick={() => setSuspiciousModal(null)} className="btn-ghost">Cancelar</button>
          <button onClick={handleConfirmSuspicious}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors">
            <CheckCircle className="w-4 h-4" /> Sí, agregar de todas formas
          </button>
        </>}>
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Este código no parece una guía de paquetería</p>
              <p className="text-xs text-amber-700 mt-1">
                El código escaneado tiene baja similitud con guías de rastreo conocidas.
                Podría ser un SKU, código de producto u otro código no relacionado con envíos.
              </p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-warm-50 border border-warm-100">
            <p className="text-[10px] text-warm-400 font-medium uppercase tracking-wider mb-1">Código escaneado</p>
            <p className="text-sm font-mono font-bold text-warm-800 break-all">{suspiciousModal?.code}</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-warm-500 font-medium">Similitud con guías de paquetería</p>
              <span className={`text-xs font-bold ${suspiciousModal?.level === 'medium' ? 'text-amber-600' : 'text-danger-600'}`}>
                {suspiciousModal?.score}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-warm-100 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${suspiciousModal?.level === 'medium' ? 'bg-amber-400' : 'bg-danger-400'}`}
                style={{ width: `${suspiciousModal?.score || 0}%` }} />
            </div>
          </div>
          <p className="text-xs text-warm-500 text-center">¿Está seguro de que desea agregar este registro?</p>
        </div>
      </Modal>

      {/* Delete last guide confirmation modal */}
      <Modal isOpen={!!deleteLastGuideModal} onClose={() => setDeleteLastGuideModal(null)}
        title="Eliminar última guía" icon={Trash2} size="sm"
        footer={<>
          <button onClick={() => setDeleteLastGuideModal(null)} className="btn-ghost">Cancelar</button>
          <button onClick={handleDeleteLastGuide} className="btn-danger inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </>}>
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
            <Trash2 className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-danger-800">¿Eliminar la última guía escaneada?</p>
              <p className="text-xs text-danger-600 mt-1">Esta acción elimina el registro del escaneo y no se puede deshacer.</p>
            </div>
          </div>
          {deleteLastGuideModal?.guia && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100">
              <p className="text-[10px] text-warm-400 font-medium uppercase tracking-wider mb-1">Guía a eliminar</p>
              <p className="text-sm font-mono font-bold text-warm-800">{deleteLastGuideModal.guia.codigo_guia}</p>
              <p className="text-xs text-warm-400 mt-0.5">Posición #{deleteLastGuideModal.guia.posicion}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete guide confirmation modal (supervisor) */}
      <Modal isOpen={!!deleteGuiaModal} onClose={() => setDeleteGuiaModal(null)}
        title="Eliminar guía" icon={Trash2} size="sm"
        footer={<>
          <button onClick={() => setDeleteGuiaModal(null)} className="btn-ghost">Cancelar</button>
          <button onClick={handleDeleteGuiaConfirm} className="btn-danger inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </>}>
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-danger-800">¿Eliminar esta guía de la tarima?</p>
              <p className="text-xs text-danger-600 mt-1">Esta acción elimina el registro del escaneo y no se puede deshacer.</p>
            </div>
          </div>
          {deleteGuiaModal && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100">
              <p className="text-[10px] text-warm-400 font-medium uppercase tracking-wider mb-1">Guía a eliminar</p>
              <p className="text-sm font-mono font-bold text-warm-800">{deleteGuiaModal.guiaCodigo}</p>
              <p className="text-xs text-warm-400 mt-0.5">Posición #{deleteGuiaModal.posicion}</p>
            </div>
          )}
        </div>
      </Modal>
      {/* Delete guide from valid tarima confirmation modal */}
      <Modal isOpen={!!deleteTarimaGuiaModal} onClose={() => setDeleteTarimaGuiaModal(null)}
        title="Eliminar Guía" icon={Trash2} size="sm"
        footer={<>
          <button onClick={() => setDeleteTarimaGuiaModal(null)} className="btn-ghost">Cancelar</button>
          <button
            onClick={() => {
              deleteGuiaFromTarimaMutation.mutate({ tarimaId: panelDetailData.tarima.id, guiaId: deleteTarimaGuiaModal.guia.id })
              setDeleteTarimaGuiaModal(null)
            }}
            disabled={deleteGuiaFromTarimaMutation.isPending}
            className="btn-danger inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            {deleteGuiaFromTarimaMutation.isPending ? 'Eliminando...' : 'Eliminar guía'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-danger-800">¿Estás seguro de eliminar esta guía?</p>
              <p className="text-xs text-danger-600 mt-1">La guía será eliminada de la tarima permanentemente. Las posiciones de las demás guías se reordenarán automáticamente.</p>
            </div>
          </div>
          {deleteTarimaGuiaModal && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Guía</span>
                <span className="text-sm font-bold font-mono text-warm-800">{deleteTarimaGuiaModal.guia.codigo_guia}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Posición</span>
                <span className="text-sm font-semibold text-warm-700">#{deleteTarimaGuiaModal.guia.posicion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Operador</span>
                <span className="text-sm font-semibold text-warm-700">{deleteTarimaGuiaModal.guia.operador_nombre}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>


      {/* Recount mode modal */}
      <RecountModal
        isOpen={showRecount}
        onClose={() => setShowRecount(false)}
        tarima={tab?.tarima}
        sessionId={tab?.session?.id}
        onGuideAdded={() => {
          if (tab?.session?.id) {
            ds.getActiveSession().then(sessions => {
              const s = sessions.find(ses => ses.id === tab.session.id)
              if (s) {
                updateTab(activeTabId, {
                  tarima: s.tarima_actual,
                  guias: s.tarima_actual?.guias || tab.guias,
                  guiasCount: s.tarima_actual?.cantidad_guias || tab.guiasCount
                })
              }
            }).catch(() => {})
          }
        }}
      />

      {/* Add-tab modal (new session) */}
      <EmpresaCanalModal
        isOpen={showAddTabModal}
        onClose={() => { setShowAddTabModal(false); setPickerEmpresa(''); setPickerCanal('') }}
        empresas={empresas} canales={pickerCanales}
        empresa={pickerEmpresa} canal={pickerCanal}
        onEmpresaChange={(v) => { setPickerEmpresa(v); setPickerCanal('') }}
        onCanalChange={setPickerCanal}
        onConfirm={() => handleStartSession(true)}
        isLoading={isStarting} t={t}
      />

      <Modal
        isOpen={!!reopenConfirmModal}
        onClose={() => setReopenConfirmModal(null)}
        title={t('scan.reopenConfirmTitle')}
        icon={RotateCcw}
        size="sm"
        footer={<>
          <button onClick={() => setReopenConfirmModal(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={handleConfirmReopenFromPanel} className="btn-primary inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> {t('common.confirm')}
          </button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-warm-700">{t('scan.reopenConfirmBody')}</p>
          {reopenConfirmModal?.pallet && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-100">
              <p className="text-[10px] text-warm-400 font-medium uppercase tracking-wider mb-1">{t('history.palletCode')}</p>
              <p className="text-sm font-mono font-bold text-warm-800">{reopenConfirmModal.pallet.codigo}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

/* ── reusable empresa/canal picker modal ─────────────── */
function EmpresaCanalModal({ isOpen, onClose, empresas, canales, empresa, canal, onEmpresaChange, onCanalChange, onConfirm, isLoading, t }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('scan.newScanSession')} icon={ScanBarcode}
      footer={<>
        <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
        <button onClick={onConfirm} disabled={!empresa || !canal || isLoading} className="btn-primary inline-flex items-center gap-2">
          {isLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('scan.starting')}</> : <><Play className="w-4 h-4" />{t('scan.start')}</>}
        </button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-warm-400" />{t('scan.company')}
          </label>
          <select value={empresa} onChange={e => onEmpresaChange(e.target.value)} className="select-field">
            <option value="">{t('scan.selectCompany')}</option>
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5 flex items-center gap-2">
            <Radio className="w-4 h-4 text-warm-400" />{t('scan.channel')}
          </label>
          {empresa && canales.length === 0 ? (
            <div className="p-3 rounded-xl bg-warning-50 border border-warning-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
              <p className="text-xs text-warning-700 font-medium">
                Esta empresa no tiene canales asignados. Ve a <span className="font-bold">Configuración → Canales</span> y asigna al menos un canal.
              </p>
            </div>
          ) : (
            <select value={canal} onChange={e => onCanalChange(e.target.value)} className="select-field" disabled={!empresa}>
              <option value="">{t('scan.selectChannel')}</option>
              {canales.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>
        {empresa && (
          <div className="p-3 rounded-xl bg-primary-50 border border-primary-100 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: empresas.find(e => String(e.id) === String(empresa))?.color || '#8b5cf6' }} />
            <p className="text-xs text-primary-700 font-medium">
              {empresas.find(e => String(e.id) === String(empresa))?.nombre}
              {canal && canales.find(c => String(c.id) === String(canal)) ? ` · ${canales.find(c => String(c.id) === String(canal))?.nombre}` : ''}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
