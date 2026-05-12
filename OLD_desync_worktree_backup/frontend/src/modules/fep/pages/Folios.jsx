import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Printer, ChevronLeft, ChevronRight, Eye, Trash2,
  X, Clock, CheckCircle, XCircle, AlertTriangle,
  Building2, Search, Plus, ChevronDown, ChevronUp,
  Download, ArrowRight, Filter, Radio, FilePlus, Copy, User, Package
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getEmpresas, getCanales } from '../../dropscan/services/dropscanService'
import {
  getFolios, getFolioStats, previewTarimas,
  createFolio, cancelarFolio, eliminarFolio, downloadPdf,
  getFolio, getFolioLog,
} from '../services/fepService'
import { fmtDateTime, fmtDate, getToday, subtractDays } from '../../../core/utils/dateFormat'
import * as XLSX from 'xlsx'

const ESTADO_COLORS = {
  ACTIVO: 'bg-success-100 text-success-700',
  CANCELADO: 'bg-danger-100 text-danger-700',
  COMPLETADO: 'bg-primary-100 text-primary-700',
}

// Always use Mexico City TZ for FEP wizard dates — matches backend's hardcoded TZ
const getMXToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())

export default function Folios() {
  const qc = useQueryClient()
  const toast = useToastStore.getState()
  const { t } = useI18nStore()
  const { canView, canDelete, getPermissionLevel, user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const defaultEnd = getToday()
  const defaultStart = subtractDays(defaultEnd, 30)

  const [page, setPage] = useState(1)
  const [pageLimit, setPageLimit] = useState(20)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [filters, setFilters] = useState({
    empresa_ids: [],
    estados: [],
    fecha_desde: defaultStart,
    fecha_fin: defaultEnd,
  })
  const [folioSearch, setFolioSearch] = useState('')
  const [folioSearchInput, setFolioSearchInput] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const folioDebounce = useRef(null)

  // Folio detail modal state
  const [selectedFolioId, setSelectedFolioId] = useState(null)
  const [folioDetailTab, setFolioDetailTab] = useState('guias')
  const [expandedDetailTarima, setExpandedDetailTarima] = useState(null)
  const [detailGuiaPage, setDetailGuiaPage] = useState(1)
  const [printingPdf, setPrintingPdf] = useState(false)
  const [copiedDetailCode, setCopiedDetailCode] = useState(null)
  const DETAIL_GUIAS_PER_PAGE = 25

  // Wizard state
  const [wizStep, setWizStep] = useState(1)
  const [wizParams, setWizParams] = useState({
    empresa_id: '', canales: [], fecha_desde: getMXToday(), fecha_hasta: getMXToday(), estatus_tarima: 'FINALIZADA'
  })
  const [wizTarimaPage, setWizTarimaPage] = useState(1)
  const [selectedTarimas, setSelectedTarimas] = useState([])
  const [expandedTarima, setExpandedTarima] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdFolio, setCreatedFolio] = useState(null)

  // Catalogs
  const { data: empresasData } = useQuery({ queryKey: ['dropscan-empresas'], queryFn: getEmpresas })
  const { data: canalesData } = useQuery({ queryKey: ['dropscan-canales'], queryFn: getCanales })
  const empresasOpts = (Array.isArray(empresasData) ? empresasData : empresasData?.empresas || [])
    .filter(e => e.activo !== false).map(e => ({ value: e.id, label: e.nombre }))
  const allCanalesRaw = Array.isArray(canalesData) ? canalesData : canalesData?.canales || []

  // Canales filtered by selected empresa in wizard
  const wizCanalesOpts = (wizParams.empresa_id
    ? allCanalesRaw.filter(c => c.activo !== false && c.empresas?.some(e => e.id === parseInt(wizParams.empresa_id)))
    : allCanalesRaw.filter(c => c.activo !== false)
  ).map(c => ({ value: c.id, label: c.nombre }))

  // Main list
  const toggleSort = (col) => {
    if (sortBy === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortBy(col); setSortDir('asc') }
    setPage(1)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['fep-folios', page, pageLimit, filters, folioSearch, sortBy, sortDir],
    queryFn: () => getFolios({
      empresa_id: filters.empresa_ids[0] || undefined,
      estado: filters.estados[0] || undefined,
      fecha_desde: filters.fecha_desde || undefined,
      fecha_hasta: filters.fecha_fin || undefined,
      q: folioSearch || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
      page, limit: pageLimit,
    }),
  })
  const folios = data?.folios || []
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 }

  // Stats
  const { data: statsData } = useQuery({
    queryKey: ['fep-stats'],
    queryFn: getFolioStats,
    refetchInterval: 30000,
  })
  const stats = statsData?.stats

  // Folio detail queries
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['fep-folio-detail', selectedFolioId],
    queryFn: () => getFolio(selectedFolioId),
    enabled: !!selectedFolioId,
  })
  const { data: logData } = useQuery({
    queryKey: ['fep-folio-log', selectedFolioId],
    queryFn: () => getFolioLog(selectedFolioId),
    enabled: !!selectedFolioId,
  })
  const detailFolio = detailData?.folio
  const detailTarimas = detailData?.tarimas || []
  const detailGuias = detailData?.guias || []
  const detailLog = logData?.log || []
  const detailGuiaPages = Math.max(1, Math.ceil(detailGuias.length / DETAIL_GUIAS_PER_PAGE))
  const detailGuiasPage = detailGuias.slice((detailGuiaPage - 1) * DETAIL_GUIAS_PER_PAGE, detailGuiaPage * DETAIL_GUIAS_PER_PAGE)

  const openFolioDetail = (id) => {
    setSelectedFolioId(id)
    setFolioDetailTab('guias')
    setExpandedDetailTarima(null)
    setDetailGuiaPage(1)
  }

  const handlePrint = async () => {
    if (!detailFolio || !canPrintFolios) return
    setPrintingPdf(true)
    try {
      const blob = await downloadPdf(selectedFolioId)
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (!win) toast.error(t('fep.printError'))
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch { toast.error(t('fep.printError')) }
    finally { setPrintingPdf(false) }
  }

  const handleDetailExcel = () => {
    if (!detailFolio || !canExportFolios) return
    try {
      const wb = XLSX.utils.book_new()
      const wsData = [
        ['Folio', detailFolio.folio_numero],
        ['Empresa', detailFolio.empresa_nombre],
        ['Estado', detailFolio.estado],
        ['Creado por', detailFolio.creado_por_nombre || ''],
        ['Fecha creación', fmtDateTime(detailFolio.created_at)],
        ['Total tarimas', detailFolio.total_tarimas],
        ['Total guías', detailFolio.total_guias],
        [],
        ['#', 'Código Guía', 'Tarima', 'Canal', 'Posición', 'Hora Escaneo'],
        ...detailGuias.map((g, i) => [i + 1, g.codigo_guia, g.tarima_codigo, g.canal_nombre, g.posicion, g.timestamp_escaneo ? fmtDateTime(g.timestamp_escaneo) : '']),
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 22 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Folio')
      XLSX.writeFile(wb, `${detailFolio.folio_numero}_${getToday()}.xlsx`)
    } catch { toast.error(t('fep.excelError')) }
  }

  const copyDetailCode = (text, e) => {
    e?.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDetailCode(text)
      setTimeout(() => setCopiedDetailCode(null), 1500)
    })
  }

  // Wizard tarimas preview
  const { data: wizData, isLoading: wizLoading } = useQuery({
    queryKey: ['fep-preview', wizParams, wizTarimaPage],
    queryFn: () => previewTarimas({
      empresa_id: wizParams.empresa_id,
      canales: wizParams.canales.join(',') || undefined,
      fecha_desde: wizParams.fecha_desde,
      fecha_hasta: wizParams.fecha_hasta,
      estatus_tarima: 'FINALIZADA',
      page: wizTarimaPage,
      limit: 50,
    }),
    enabled: wizStep === 2 && !!wizParams.empresa_id,
  })
  const wizTarimas = wizData?.tarimas || []
  const wizPagination = wizData?.pagination || { page: 1, pages: 1, total: 0 }

  const clearFilters = () => {
    setFilters({ empresa_ids: [], estados: [], fecha_desde: defaultStart, fecha_fin: defaultEnd })
    setFolioSearch(''); setFolioSearchInput(''); setPage(1); setSortBy('created_at'); setSortDir('desc')
  }
  const hasActiveFilters = !!(filters.empresa_ids.length || filters.estados.length || folioSearch)
  const hasAdvancedFilters = !!(filters.empresa_ids.length || filters.estados.length)

  const handleFolioSearch = useCallback((v) => {
    setFolioSearchInput(v)
    clearTimeout(folioDebounce.current)
    if (!v.trim()) { setFolioSearch(''); setPage(1); return }
    folioDebounce.current = setTimeout(() => { setFolioSearch(v.trim()); setPage(1) }, 350)
  }, [])

  const handleDownloadPdf = async (folio) => {
    if (!canPrintFolios) return
    setDownloadingId(folio.id)
    try {
      const blob = await downloadPdf(folio.id)
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (!win) toast.error(t('fep.printError'))
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch { toast.error(t('fep.printError')) }
    finally { setDownloadingId(null) }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      await cancelarFolio(cancelTarget.id, cancelMotivo)
      toast.success(t('fep.cancelSuccess'))
      qc.invalidateQueries({ queryKey: ['fep-folios'] })
      qc.invalidateQueries({ queryKey: ['fep-stats'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error cancelando folio')
    } finally {
      setCancelTarget(null); setCancelMotivo('')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await eliminarFolio(deleteTarget.id)
      toast.success(t('fep.deleteSuccess'))
      qc.invalidateQueries({ queryKey: ['fep-folios'] })
      qc.invalidateQueries({ queryKey: ['fep-stats'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error eliminando folio')
    } finally {
      setDeleteTarget(null)
    }
  }

  const toggleTarima = (t) => {
    if (t.bloqueada) return
    setSelectedTarimas(prev =>
      prev.find(s => s.id === t.id) ? prev.filter(s => s.id !== t.id) : [...prev, t]
    )
  }

  const toggleAllTarimas = () => {
    const available = wizTarimas.filter(t => !t.bloqueada)
    const allSelected = available.every(t => selectedTarimas.find(s => s.id === t.id))
    setSelectedTarimas(prev => {
      if (allSelected) return prev.filter(p => !available.find(a => a.id === p.id))
      const next = [...prev]
      available.forEach(t => { if (!next.find(s => s.id === t.id)) next.push(t) })
      return next
    })
  }

  const handleWizardSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await createFolio({
        empresa_id: wizParams.empresa_id,
        canales: wizParams.canales,
        fecha_desde: wizParams.fecha_desde,
        fecha_hasta: wizParams.fecha_hasta,
        estatus_tarima: 'FINALIZADA',
        tarima_ids: selectedTarimas.map(t => t.id),
      })
      // setCreatedFolio(res.folio)
      // setWizStep(4)
      setShowWizard(false)
      openFolioDetail(res.folio.id)
      qc.invalidateQueries({ queryKey: ['fep-folios'] })
      qc.invalidateQueries({ queryKey: ['fep-stats'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error creando folio')
    } finally {
      setSubmitting(false)
    }
  }

  const openWizard = () => {
    setWizStep(1)
    setWizParams({ empresa_id: '', canales: [], fecha_desde: getMXToday(), fecha_hasta: getMXToday(), estatus_tarima: 'FINALIZADA' })
    setSelectedTarimas([]); setWizTarimaPage(1); setExpandedTarima(null); setCreatedFolio(null)
    setShowWizard(true)
  }

  // Auto-open folio when navigating from Historial with ?folio_id=<id>
  useEffect(() => {
    const folioId = searchParams.get('folio_id')
    if (folioId) {
      openFolioDetail(parseInt(folioId))
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [copiedCode, setCopiedCode] = useState(null)
  const [copiedFolioHeader, setCopiedFolioHeader] = useState(false)
  const copyToClipboard = (text, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(text)
      setTimeout(() => setCopiedCode(null), 1500)
    })
  }
  const copyFolioHeader = (e) => {
    e?.stopPropagation()
    if (!detailFolio) return
    navigator.clipboard.writeText(detailFolio.folio_numero).then(() => {
      setCopiedFolioHeader(true)
      setTimeout(() => setCopiedFolioHeader(false), 1500)
    })
  }

  const SortTh = ({ col, children, className = '' }) => (
    <th
      className={`table-header cursor-pointer select-none hover:bg-warm-100 transition-colors ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortBy === col
          ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary-500" /> : <ChevronDown className="w-3 h-3 text-primary-500" />
          : <span className="w-3 h-3 inline-block opacity-20"><ChevronDown className="w-3 h-3" /></span>}
      </span>
    </th>
  )

  const foliosLevel = getPermissionLevel('fep.folios')
  const canViewFolios = canView('fep.folios')
  const canCreateFolios = ['crear', 'actualizar', 'eliminar'].includes(foliosLevel)
  const canUpdateFolios = ['actualizar', 'eliminar'].includes(foliosLevel)
  const canCancelFolio = user.rol_nombre === 'Administrador' || foliosLevel === 'actualizar'  // ONLY actualizar for canceling
  const canExportFolios = ['actualizar', 'eliminar'].includes(foliosLevel)
  const canPrintFolios = ['crear', 'actualizar', 'eliminar'].includes(foliosLevel)
  const canDel = canDelete('fep.folios')

  return (
    <div className="flex flex-col h-full">
      <Header title={t('fep.title')} subtitle={t('fep.subtitle')} showSearch />

      <div className="flex-1 overflow-y-auto">
        {!canViewFolios && (
          <div className="p-16 text-center text-sm text-warm-400">Sin acceso a este módulo</div>
        )}
        {canViewFolios && <>
        {/* Filter bar */}
        <div className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2.5 space-y-2">
          {/* Row 1: date range + shortcuts + search + Filtros btn + stats + Nuevo btn */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="date" value={filters.fecha_desde}
                onChange={e => { setFilters(f => ({ ...f, fecha_desde: e.target.value })); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={filters.fecha_fin}
                onChange={e => { setFilters(f => ({ ...f, fecha_fin: e.target.value })); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
            </div>
            {[{ label: t('shortcut.today'), d: 0 }, { label: t('shortcut.7days'), d: 7 }, { label: t('shortcut.30days'), d: 30 }].map(({ label, d }) => (
              <button key={label} onClick={() => {
                const today = getToday()
                setFilters(f => ({ ...f, fecha_desde: d === 0 ? today : subtractDays(today, d), fecha_fin: today }))
                setPage(1)
              }} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors">
                {label}
              </button>
            ))}

            {/* Search input — always visible */}
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="text" value={folioSearchInput}
                onChange={e => handleFolioSearch(e.target.value)}
                placeholder={t('fep.searchPlaceholder')}
                className="text-xs outline-none bg-transparent text-warm-700 flex-1" />
              {folioSearchInput && (
                <button onClick={() => handleFolioSearch('')} className="text-warm-400 hover:text-warm-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filtros toggle — same position as Historial */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors border ${
                showFilters
                  ? 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                  : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
              } ${hasAdvancedFilters ? 'ring-1 ring-primary-400' : ''}`}
            >
              <Filter className="w-3.5 h-3.5" />
              {t('history.filters')}
              {hasAdvancedFilters && (
                <span className="w-4 h-4 rounded-full bg-primary-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {filters.empresa_ids.length + filters.estados.length}
                </span>
              )}
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <div className="ml-auto flex items-center gap-2">
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                  <X className="w-3 h-3" />{t('common.clear')}
                </button>
              )}
              {canCreateFolios && (
                <button onClick={openWizard}
                  className="btn-primary inline-flex items-center gap-2">
                  <FilePlus className="w-4 h-4" /> {t('fep.newFolio')}
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Advanced filters — collapsible */}
          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                key="adv-filters"
                initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <MultiSelect
                    icon={Building2}
                    placeholder={t('fep.empresa')}
                    options={empresasOpts}
                    selected={filters.empresa_ids}
                    onChange={v => { setFilters(f => ({ ...f, empresa_ids: v })); setPage(1) }}
                  />
                  <MultiSelect
                    icon={CheckCircle}
                    placeholder={t('fep.estado')}
                    options={[
                      { value: 'ACTIVO', label: t('fep.activo') },
                      { value: 'CANCELADO', label: t('fep.cancelado') },
                      { value: 'COMPLETADO', label: t('fep.completado') },
                    ]}
                    selected={filters.estados}
                    onChange={v => { setFilters(f => ({ ...f, estados: v })); setPage(1) }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-4">
          <motion.div
            className="card overflow-hidden"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {isLoading ? (
              <LoadingSpinner text={t('common.loading')} />
            ) : folios.length === 0 ? (
              <div className="p-16 text-center text-sm text-warm-400">{t('fep.noFolios')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-50 border-b border-warm-100">
                      <SortTh col="folio_numero">{t('fep.folio')}</SortTh>
                      <SortTh col="empresa">{t('fep.empresa')}</SortTh>
                      <SortTh col="total_tarimas" className="text-center">{t('fep.col.tarimas')}</SortTh>
                      <SortTh col="total_guias" className="text-center">{t('fep.col.guias')}</SortTh>
                      <SortTh col="estado" className="text-center">{t('fep.estado')}</SortTh>
                      <SortTh col="created_at">{t('fep.col.fecha')}</SortTh>
                      <th className="table-header">{t('fep.col.creadoPor')}</th>
                      <th className="table-header text-center">{t('fep.col.acciones')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {folios.map(row => (
                      <tr key={row.id}
                        onClick={() => canViewFolios && openFolioDetail(row.id)}
                        className={`hover:bg-warm-50/50 transition-colors group ${canViewFolios ? 'cursor-pointer' : 'cursor-default'}`}>
                        <td className="table-cell">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-warm-700">{row.folio_numero}</span>
                            <button
                              onClick={e => copyToClipboard(row.folio_numero, e)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-all"
                              title="Copiar folio"
                            >
                              {copiedCode === row.folio_numero
                                ? <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                                : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="table-cell text-warm-600">{row.empresa_nombre}</td>
                        <td className="table-cell text-center font-bold text-warm-700">{row.total_tarimas}</td>
                        <td className="table-cell text-center font-bold text-warm-700">{row.total_guias}</td>
                        <td className="table-cell text-center">
                          <span className={`badge text-[10px] ${ESTADO_COLORS[row.estado] || 'bg-warm-100 text-warm-600'}`}>
                            {t(`fep.${row.estado.toLowerCase()}`)}
                          </span>
                        </td>
                        <td className="table-cell text-warm-500 text-xs">
                          {fmtDate(row.created_at)}
                          <br /><span className="text-warm-400">{new Date(row.created_at).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="table-cell text-warm-600 text-xs">{row.creado_por_nombre}</td>
                        <td className="table-cell" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            {canViewFolios && (
                            <button onClick={() => openFolioDetail(row.id)}
                              className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all" title={t('fep.tooltip.verDetalle')}>
                              <Eye className="w-4 h-4" />
                            </button>
                            )}
                            {canPrintFolios && (
                              <button onClick={() => handleDownloadPdf(row)} disabled={downloadingId === row.id}
                              className="p-2 rounded-xl hover:bg-success-50 text-warm-400 hover:text-success-600 transition-all disabled:opacity-40" title={t('fep.detail.imprimir')}>
                              {downloadingId === row.id
                                ? <div className="w-4 h-4 border-2 border-success-500 border-t-transparent rounded-full animate-spin" />
                                : <Printer className="w-4 h-4" />}
                              </button>
                            )}
                            {canCancelFolio && row.estado === 'ACTIVO' && (
                              <button onClick={() => { setCancelTarget(row); setCancelMotivo('') }}
                                className="p-2 rounded-xl hover:bg-warning-50 text-warm-400 hover:text-warning-500 transition-all" title={t('fep.cancel.title')}>
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                            {canDel && row.estado !== 'COMPLETADO' && (
                              <button onClick={() => setDeleteTarget(row)}
                                className="p-2 rounded-xl hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all" title={t('fep.delete.title')}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-warm-100 bg-warm-50/30">
              <div className="flex items-center gap-3">
                <p className="text-xs text-warm-400 font-medium">
                  {pagination.pages > 1 ? `${t('common.page')} ${pagination.page}/${pagination.pages} · ` : ''}{pagination.total} {t('common.records')}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-warm-400">{t('common.show')}</span>
                  <select value={pageLimit} onChange={e => { setPageLimit(parseInt(e.target.value)); setPage(1) }}
                    className="px-2 py-1 rounded-lg border border-warm-200 text-xs text-warm-700 outline-none focus:border-primary-400 bg-white cursor-pointer">
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>
              {pagination.pages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1}
                    className="px-2 py-1.5 rounded-lg text-xs text-warm-500 hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 text-xs text-warm-600 font-semibold">{page}</span>
                  <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}
                    className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(pagination.pages)} disabled={page === pagination.pages}
                    className="px-2 py-1.5 rounded-lg text-xs text-warm-500 hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">»</button>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        </>}
      </div>

      {/* Wizard Modal */}
      <Modal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        title={wizStep === 4 ? t('fep.wizard.titleCreated') : `${t('fep.wizard.titleNew')} — ${t('common.page')} ${wizStep} / 3`}
        icon={FilePlus}
        size="xl"
        footer={wizStep < 4 ? (
          <>
            <button onClick={() => setShowWizard(false)} className="btn-ghost">{t('common.cancel')}</button>
            {wizStep > 1 && (
              <button onClick={() => setWizStep(s => s - 1)} className="btn-ghost">{t('fep.wizard.prev')}</button>
            )}
            {wizStep === 1 && (
              <button disabled={!wizParams.empresa_id}
                onClick={() => { setWizTarimaPage(1); setWizStep(2) }}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {t('fep.wizard.next')} <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {wizStep === 2 && (
              <button disabled={selectedTarimas.length === 0}
                onClick={() => setWizStep(3)}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {t('fep.wizard.reviewBtn')} ({selectedTarimas.length}) <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {wizStep === 3 && (
              <button disabled={submitting} onClick={handleWizardSubmit}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-success-500 text-white rounded-xl font-semibold hover:bg-success-600 transition-all disabled:opacity-50">
                {submitting
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <CheckCircle className="w-4 h-4" />}
                {t('fep.wizard.confirm')}
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => setShowWizard(false)} className="btn-ghost">{t('common.close')}</button>
            {createdFolio && (
              <button onClick={() => { setShowWizard(false); openFolioDetail(createdFolio.id) }}
                className="btn-primary inline-flex items-center gap-2">
                <Eye className="w-4 h-4" /> {t('fep.wizard.viewFolio')}
              </button>
            )}
          </>
        )}
      >
        <WizardContent
          step={wizStep}
          params={wizParams} setParams={setWizParams}
          empresasOpts={empresasOpts}
          canalesOpts={wizCanalesOpts}
          tarimas={wizTarimas} tarimaLoading={wizLoading}
          pagination={wizPagination} page={wizTarimaPage} setPage={setWizTarimaPage}
          selected={selectedTarimas} toggleTarima={toggleTarima} toggleAll={toggleAllTarimas}
          expanded={expandedTarima} setExpanded={setExpandedTarima}
          createdFolio={createdFolio}
          onDownloadPdf={createdFolio ? () => handleDownloadPdf(createdFolio) : null}
          downloadingId={downloadingId}
        />
      </Modal>

      {/* Folio Detail Modal */}
      <Modal
        isOpen={!!selectedFolioId}
        onClose={() => { setSelectedFolioId(null); setExpandedDetailTarima(null) }}
        icon={FileText}
        size="full"
        title={
          <div className="flex items-center gap-2.5 group/fheader">
            <span className="font-mono font-bold">{detailFolio ? detailFolio.folio_numero : 'Cargando...'}</span>
            {detailFolio && (
              <button
                onClick={copyFolioHeader}
                className="opacity-0 group-hover/fheader:opacity-100 p-0.5 rounded hover:bg-primary-100/60 text-warm-400 hover:text-primary-600 transition-all"
                title="Copiar folio"
              >
                {copiedFolioHeader
                  ? <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                  : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
            {detailFolio && (
              <span className={`badge text-xs px-2.5 py-1 ${ESTADO_COLORS[detailFolio.estado] || 'bg-warm-100 text-warm-600'}`}>
                {t(`fep.${detailFolio.estado.toLowerCase()}`)}
              </span>
            )}
          </div>
        }
        headerAction={detailFolio && (
          <div className="flex items-center gap-2">
            {canExportFolios && (
              <button onClick={handleDetailExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-success-50 text-success-700 border border-success-200 rounded-lg hover:bg-success-100 transition-colors">
                <Download className="w-3.5 h-3.5" /> {t('reports.exportExcel')}
              </button>
            )}
            {canPrintFolios && (
              <button onClick={handlePrint} disabled={printingPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50">
                {printingPdf
                  ? <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  : <Printer className="w-3.5 h-3.5" />}
                {printingPdf ? t('fep.detail.generando') : t('fep.detail.imprimir')}
              </button>
            )}
          </div>
        )}
        footer={detailFolio && (
          <>
            {canCancelFolio && detailFolio.estado === 'ACTIVO' && (
              <button onClick={() => { setCancelTarget(detailFolio); setCancelMotivo('') }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-danger-50 text-danger-700 rounded-xl hover:bg-danger-100 font-semibold transition-all border border-danger-200">
                <XCircle className="w-4 h-4" /> {t('fep.detail.cancelarFolio')}
              </button>
            )}
            <button onClick={() => { setSelectedFolioId(null); setExpandedDetailTarima(null) }} className="btn-ghost">
              {t('common.close')}
            </button>
          </>
        )}
      >
        {detailLoading ? (
          <LoadingSpinner text={t('fep.detail.loading')} />
        ) : detailFolio ? (
          <div className="space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Building2, l: t('fep.empresa'), v: detailFolio.empresa_nombre },
                { icon: User, l: t('fep.createdBy'), v: detailFolio.creado_por_nombre || '—' },
                { icon: Package, l: t('fep.col.tarimas'), v: detailFolio.total_tarimas },
                { icon: FileText, l: t('fep.col.guias'), v: detailFolio.total_guias },
                { icon: Clock, l: t('fep.detail.creacion'), v: fmtDateTime(detailFolio.created_at) },
                { icon: Clock, l: t('fep.detail.actualizacion'), v: detailFolio.updated_at ? fmtDateTime(detailFolio.updated_at) : '—' },
              ].map(f => (
                <div key={f.l} className="p-3 rounded-xl bg-warm-50 border border-warm-100/50">
                  <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-0.5 flex items-center gap-1">
                    <f.icon className="w-3 h-3" /> {f.l}
                  </p>
                  <p className="text-sm font-semibold text-warm-700">{f.v}</p>
                </div>
              ))}
            </div>

            {/* Cancellation reason */}
            {detailFolio.motivo_cancelacion && (
              <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0" />
                <p className="text-xs font-semibold text-danger-700">{detailFolio.motivo_cancelacion}</p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-warm-100">
              {[
                { id: 'guias', label: `${t('fep.detail.guias')} (${detailGuias.length})`, icon: FileText },
                { id: 'tarimas', label: `${t('fep.detail.tarimas')} (${detailTarimas.length})`, icon: Package },
                { id: 'historial', label: t('fep.detail.historial'), icon: Clock },
              ].map(tab => (
                <button key={tab.id} onClick={() => setFolioDetailTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
                    folioDetailTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-warm-400 hover:text-warm-600'
                  }`}>
                  <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab: Guías */}
            {folioDetailTab === 'guias' && (
              <div>
                {detailGuias.length === 0 ? (
                  <div className="p-10 text-center text-sm text-warm-400">{t('fep.detail.noGuias')}</div>
                ) : (
                  <>
                    <div className="max-h-80 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
                      <table className="w-full text-xs">
                        <thead className="bg-warm-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2.5 font-bold text-warm-500">#</th>
                            <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('fep.detail.guiaCol')}</th>
                            <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('fep.detail.tarimaCol')}</th>
                            <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('fep.detail.canalCol')}</th>
                            <th className="text-center px-3 py-2.5 font-bold text-warm-500">{t('fep.detail.posicion')}</th>
                            <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('fep.detail.hora')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-warm-50">
                          {detailGuiasPage.map((g, i) => (
                            <tr key={g.codigo_guia + i} className="hover:bg-warm-50 transition-colors">
                              <td className="px-3 py-2 text-warm-400">{(detailGuiaPage - 1) * DETAIL_GUIAS_PER_PAGE + i + 1}</td>
                              <td className="px-3 py-2 font-mono font-semibold text-warm-800">{g.codigo_guia}</td>
                              <td className="px-3 py-2 font-mono text-warm-500 text-[11px]">{g.tarima_codigo}</td>
                              <td className="px-3 py-2 text-warm-500">{g.canal_nombre}</td>
                              <td className="px-3 py-2 text-center text-warm-500">{g.posicion}</td>
                              <td className="px-3 py-2 text-warm-400">{g.timestamp_escaneo ? fmtDateTime(g.timestamp_escaneo) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {detailGuiaPages > 1 && (
                      <div className="flex items-center justify-between px-2 pt-3">
                        <p className="text-xs text-warm-400">Página {detailGuiaPage}/{detailGuiaPages} · {detailGuias.length} guías</p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailGuiaPage(1)} disabled={detailGuiaPage === 1}
                            className="px-2 py-1 rounded text-xs text-warm-500 hover:bg-warm-100 disabled:opacity-30">«</button>
                          <button onClick={() => setDetailGuiaPage(p => Math.max(1, p - 1))} disabled={detailGuiaPage === 1}
                            className="p-1 rounded hover:bg-warm-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                          <span className="px-2 text-xs font-semibold text-warm-600">{detailGuiaPage}</span>
                          <button onClick={() => setDetailGuiaPage(p => Math.min(detailGuiaPages, p + 1))} disabled={detailGuiaPage === detailGuiaPages}
                            className="p-1 rounded hover:bg-warm-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                          <button onClick={() => setDetailGuiaPage(detailGuiaPages)} disabled={detailGuiaPage === detailGuiaPages}
                            className="px-2 py-1 rounded text-xs text-warm-500 hover:bg-warm-100 disabled:opacity-30">»</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Tab: Tarimas */}
            {folioDetailTab === 'tarimas' && (
              <div className="max-h-96 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
                {detailTarimas.length === 0 ? (
                  <div className="p-10 text-center text-sm text-warm-400">{t('fep.detail.noTarimas')}</div>
                ) : (
                  <div className="divide-y divide-warm-50">
                    {detailTarimas.map(tar => {
                      const tGuias = detailGuias.filter(g => g.tarima_codigo === tar.codigo)
                      return (
                        <div key={tar.id}>
                          <button
                            onClick={() => setExpandedDetailTarima(expandedDetailTarima === tar.id ? null : tar.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-warm-50/60 text-left transition-colors group/trow"
                          >
                            <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 gap-3 text-sm min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-primary-700 truncate">{tar.codigo}</span>
                                <button onClick={e => copyDetailCode(tar.codigo, e)}
                                  className="opacity-0 group-hover/trow:opacity-100 p-0.5 rounded hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-all shrink-0"
                                  title="Copiar código">
                                  {copiedDetailCode === tar.codigo
                                    ? <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                                    : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                              <span className="text-warm-500 truncate">{tar.canal_nombre}</span>
                              <span className="text-warm-400 text-xs">{tar.cantidad_guias} {t('fep.guias').toLowerCase()}</span>
                              <span className="text-warm-400 text-xs hidden sm:block">{fmtDate(tar.fecha_inicio)}</span>
                            </div>
                            {expandedDetailTarima === tar.id
                              ? <ChevronUp className="w-4 h-4 text-warm-400 shrink-0" />
                              : <ChevronDown className="w-4 h-4 text-warm-400 shrink-0" />}
                          </button>
                          <AnimatePresence>
                            {expandedDetailTarima === tar.id && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                <div className="px-4 pb-3 bg-warm-50/40 space-y-2">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                                    {[
                                      { icon: Package, l: t('fep.detail.canalCol'), v: tar.canal_nombre },
                                      { icon: FileText, l: t('fep.guias'), v: tar.cantidad_guias },
                                      { icon: Clock, l: t('fep.detail.inicio'), v: fmtDate(tar.fecha_inicio) },
                                      { icon: Clock, l: t('fep.detail.cierre'), v: tar.fecha_cierre ? fmtDate(tar.fecha_cierre) : '—' },
                                    ].map(({ icon: Icon, l, v }) => (
                                      <div key={l} className="flex items-start gap-1.5 p-2 rounded-lg bg-white border border-warm-100">
                                        <Icon className="w-3.5 h-3.5 text-warm-400 mt-0.5 shrink-0" />
                                        <div>
                                          <p className="text-[9px] text-warm-400 font-semibold uppercase">{l}</p>
                                          <p className="text-xs font-semibold text-warm-700">{v}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {tGuias.length > 0 && (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-warm-400 border-b border-warm-100">
                                          <th className="text-left py-1.5 pr-3 font-semibold">#</th>
                                          <th className="text-left pr-3 font-semibold">{t('fep.detail.guiaCol')}</th>
                                          <th className="text-left font-semibold">{t('fep.detail.hora')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tGuias.map((g, i) => (
                                          <tr key={g.codigo_guia + i} className="border-b border-warm-50 last:border-0">
                                            <td className="py-1 pr-3 text-warm-400">{i + 1}</td>
                                            <td className="font-mono pr-3 text-warm-700">{g.codigo_guia}</td>
                                            <td className="text-warm-400">{g.timestamp_escaneo ? fmtDateTime(g.timestamp_escaneo) : '—'}</td>
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
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Historial */}
            {folioDetailTab === 'historial' && (
              <div className="space-y-3">
                {detailLog.length === 0 ? (
                  <div className="p-10 text-center text-sm text-warm-400">{t('fep.detail.noHistorial')}</div>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto scrollbar-thin pr-1">
                    {detailLog.map((entry, i) => (
                      <div key={entry.id || i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-1.5 shrink-0">
                          <div className="w-2 h-2 rounded-full bg-primary-400" />
                          {i < detailLog.length - 1 && <div className="w-px flex-1 bg-warm-100 mt-1" style={{ minHeight: 20 }} />}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-warm-700">{entry.accion}</span>
                            <span className="text-xs text-warm-400">{fmtDateTime(entry.timestamp)}</span>
                            {entry.usuario_nombre && (
                              <span className="text-xs text-warm-500 flex items-center gap-1">
                                <User className="w-3 h-3" /> {entry.usuario_nombre}
                              </span>
                            )}
                          </div>
                          {entry.detalle && (
                            <p className="text-xs text-warm-400 mt-0.5">
                              {typeof entry.detalle === 'string'
                                ? entry.detalle
                                : Object.values(entry.detalle).filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Cancel Modal — Defined after detail to be on top */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)}
        title={t('fep.cancel.title')} icon={XCircle} size="sm"
        footer={<>
          <button onClick={() => setCancelTarget(null)} className="btn-ghost">{t('common.close')}</button>
          <button onClick={handleCancel} className="btn-danger inline-flex items-center gap-2">
            <XCircle className="w-4 h-4" /> {t('fep.cancel.title')}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-warning-50 border border-warning-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-warning-800">{cancelTarget?.folio_numero}</p>
              <p className="text-xs text-warning-600 mt-0.5">{t('fep.cancel.desc')}</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-warm-600 uppercase tracking-wider block mb-1.5">{t('fep.cancel.motivoLabel')}</label>
            <textarea value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} rows={3}
              placeholder={t('fep.cancel.motivoPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-warm-50 border border-warm-200 rounded-xl outline-none focus:border-primary-400 resize-none" />
          </div>
        </div>
      </Modal>

      {/* Delete Modal — Defined after detail to be on top */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title={t('fep.delete.title')} icon={Trash2} size="sm"
        footer={<>
          <button onClick={() => setDeleteTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={handleDelete} className="btn-danger inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> {t('history.deletePermamently')}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-danger-800">{t('fep.delete.warning')}</p>
              <p className="text-xs text-danger-600 mt-1">{t('fep.delete.desc')}</p>
            </div>
          </div>
          {deleteTarget && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500">Folio</span>
                <span className="text-sm font-bold font-mono text-warm-800">{deleteTarget.folio_numero}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500">{t('fep.tarimas')}</span>
                <span className="text-sm font-semibold text-warm-700">{deleteTarget.total_tarimas}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500">{t('fep.guias')}</span>
                <span className="text-sm font-semibold text-warm-700">{deleteTarget.total_guias}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function WizardContent({
  step, params, setParams, empresasOpts, canalesOpts,
  tarimas, tarimaLoading, pagination, page, setPage,
  selected, toggleTarima, toggleAll, expanded, setExpanded,
  createdFolio, onDownloadPdf, downloadingId
}) {
  const { t } = useI18nStore()

  if (step === 1) {
    return (
      <div className="space-y-5">
        {/* Empresa */}
        <div>
          <label className="block text-sm font-semibold text-warm-700 mb-1.5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-warm-400" /> {t('fep.empresa')}
          </label>
          <select value={params.empresa_id}
            onChange={e => setParams(p => ({ ...p, empresa_id: e.target.value, canales: [] }))}
            className="select-field">
            <option value="">{t('fep.wizard.selectEmpresa')}</option>
            {empresasOpts.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>

        {/* Canales — dynamic multi-select */}
        {params.empresa_id && (
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5 flex items-center gap-2">
              <Radio className="w-4 h-4 text-warm-400" /> {t('fep.canales')}
            </label>
            {canalesOpts.length === 0 ? (
              <div className="p-3 rounded-xl bg-warning-50 border border-warning-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
                <p className="text-xs text-warning-700 font-medium">
                  {t('fep.wizard.noTarimas')}
                </p>
              </div>
            ) : (
              <MultiSelect
                placeholder={t('fep.canales')}
                options={canalesOpts}
                selected={params.canales}
                onChange={v => setParams(p => ({ ...p, canales: v }))}
              />
            )}
          </div>
        )}

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5 flex items-center gap-2">
              <Clock className="w-4 h-4 text-warm-400" /> {t('fep.wizard.fechaDesde')}
            </label>
            <input type="date" value={params.fecha_desde}
              onChange={e => setParams(p => ({ ...p, fecha_desde: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-warm-50 border border-warm-200 rounded-xl outline-none focus:border-primary-400" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-1.5 flex items-center gap-2">
              <Clock className="w-4 h-4 text-warm-400" /> {t('fep.wizard.fechaHasta')}
            </label>
            <input type="date" value={params.fecha_hasta}
              onChange={e => setParams(p => ({ ...p, fecha_hasta: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-warm-50 border border-warm-200 rounded-xl outline-none focus:border-primary-400" />
          </div>
        </div>

        {params.empresa_id && (
          <div className="p-3 rounded-xl bg-primary-50 border border-primary-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
            <p className="text-xs text-primary-700 font-medium">
              {empresasOpts.find(e => String(e.value) === String(params.empresa_id))?.label}
              {params.canales.length > 0
                ? ` · ${params.canales.length} ${t('fep.canales').toLowerCase()}`
                : ` · ${t('fep.wizard.allCanales')}`}
            </p>
          </div>
        )}
      </div>
    )
  }

  if (step === 2) {
    const availableOnPage = tarimas.filter(t => !t.bloqueada)
    const allPageSelected = availableOnPage.length > 0 && availableOnPage.every(t => selected.find(s => s.id === t.id))

    return (
      <div className="space-y-3">
        {/* Select all / deselect all — prominent */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-warm-500">
            {t('fep.wizard.selectDesc')}{' '}
            <span className="font-semibold text-primary-600">{selected.length} {t('fep.wizard.selected')}</span>
          </p>
          {availableOnPage.length > 0 && (
            <button
              onClick={toggleAll}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                allPageSelected
                  ? 'bg-warm-100 text-warm-600 border-warm-200 hover:bg-warm-200'
                  : 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {allPageSelected ? t('fep.wizard.deselectAll') : t('fep.wizard.selectAll')}
            </button>
          )}
        </div>

        {tarimaLoading ? (
          <LoadingSpinner text={t('fep.wizard.noTarimas')} />
        ) : tarimas.length === 0 ? (
          <div className="p-8 text-center text-sm text-warm-400">{t('fep.wizard.noTarimasPage')}</div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
            {tarimas.map(t => {
              const isSel = !!selected.find(s => s.id === t.id)
              return (
                <div key={t.id} className={`border-b border-warm-50 last:border-0 ${t.bloqueada ? 'opacity-50' : ''}`}>
                  <div
                    onClick={() => !t.bloqueada && toggleTarima(t)}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors
                      ${t.bloqueada ? 'cursor-not-allowed bg-warm-50/60' : `cursor-pointer ${isSel ? 'bg-primary-50' : 'hover:bg-warm-50'}`}`}
                  >
                    <input type="checkbox" checked={isSel} readOnly disabled={t.bloqueada}
                      className="w-4 h-4 rounded border-warm-300 text-primary-600 shrink-0" />
                    <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 gap-2 text-sm min-w-0">
                      <span className="font-mono font-semibold text-warm-700 truncate">{t.codigo}</span>
                      <span className="text-warm-500 truncate">{t.canal_nombre}</span>
                      <span className="text-warm-500">{t.cantidad_guias} guías</span>
                      <span className="text-warm-400 text-xs hidden sm:block">{fmtDate(t.fecha_inicio)}</span>
                    </div>
                    {t.bloqueada && (
                      <span className="badge bg-warning-100 text-warning-700 text-[10px] shrink-0">{t.folio_asignado}</span>
                    )}
                    <button onClick={e => { e.stopPropagation(); setExpanded(expanded === t.id ? null : t.id) }}
                      className="p-1 text-warm-400 hover:text-warm-600 shrink-0">
                      {expanded === t.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {expanded === t.id && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-12 pb-3 bg-warm-50/60 text-xs text-warm-400">
                          {t.cantidad_guias} guías · {t.estado} · inicio: {fmtDate(t.fecha_inicio)}
                          {t.fecha_cierre ? ` · cierre: ${fmtDate(t.fecha_cierre)}` : ''}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-warm-600">{page}/{pagination.pages} — {pagination.total} tarimas</span>
            <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}
              className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    )
  }

  if (step === 3) {
    const totalGuias = selected.reduce((s, t) => s + (t.cantidad_guias || 0), 0)
    return (
      <div className="space-y-4">
        <p className="text-sm text-warm-500">{t('fep.wizard.reviewDesc')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4 bg-primary-50">
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-1">{t('fep.tarimas')}</p>
            <p className="text-3xl font-bold text-primary-700">{selected.length}</p>
          </div>
          <div className="rounded-xl p-4 bg-success-50">
            <p className="text-xs font-bold text-success-600 uppercase tracking-wider mb-1">{t('fep.wizard.guiasTotal')}</p>
            <p className="text-3xl font-bold text-success-700">{totalGuias}</p>
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
          <table className="w-full text-xs">
            <thead className="bg-warm-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-bold text-warm-500">{t('common.code')}</th>
                <th className="text-left px-3 py-2 font-bold text-warm-500">{t('fep.detail.canalCol')}</th>
                <th className="text-right px-3 py-2 font-bold text-warm-500">{t('fep.guias')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-50">
              {selected.map(tar => (
                <tr key={tar.id} className="hover:bg-warm-50">
                  <td className="px-3 py-2 font-mono font-semibold text-warm-700">{tar.codigo}</td>
                  <td className="px-3 py-2 text-warm-500">{tar.canal_nombre}</td>
                  <td className="px-3 py-2 text-right font-bold text-warm-700">{tar.cantidad_guias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (step === 4 && createdFolio) {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-success-500" />
        </div>
        <div>
          <p className="text-2xl font-bold font-mono text-warm-800">{createdFolio.folio_numero}</p>
          <p className="text-sm text-warm-500 mt-1">{t('fep.wizard.createdOk')}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('fep.tarimas'), value: createdFolio.total_tarimas },
            { label: t('fep.guias'), value: createdFolio.total_guias },
            { label: t('fep.estado'), value: createdFolio.estado },
          ].map(c => (
            <div key={c.label} className="p-3 rounded-xl bg-warm-50">
              <p className="text-xs text-warm-400 mb-0.5">{c.label}</p>
              <p className="text-lg font-bold text-warm-700">{c.value}</p>
            </div>
          ))}
        </div>
        {onDownloadPdf && (
          <button onClick={onDownloadPdf} disabled={downloadingId === createdFolio.id}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-all disabled:opacity-50">
            {downloadingId === createdFolio.id
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Download className="w-4 h-4" />}
            Descargar PDF
          </button>
        )}
      </div>
    )
  }

  return null
}
