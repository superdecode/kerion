import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../../core/services/api'
import { eliminarFolio as deleteFolio } from '../../Fep/services/fepService'
import * as XLSX from 'xlsx'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import TablePagination from '../../../core/components/common/TablePagination'
import MultiSelect from '../../../core/components/common/MultiSelect'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as ds from '../services/dropscanService'
import { fmtTime, fmtTimeShort, fmtDate, fmtDateTime, getToday, subtractDays } from '../../../core/utils/dateFormat'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, Eye, Trash2, Search, Download,
  Package, Clock, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, X,
  RotateCcw, AlertTriangle, Copy, Edit3, Building2, Radio, Lock, Plus, ArrowRight, User
} from 'lucide-react'

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

const TARIMA_CODE_STYLE = {
  color: '#1e3ba8',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  fontWeight: 600,
}

export default function Tarimas() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [pageLimit, setPageLimit] = useState(50)
  const defaultEnd = getToday()
  const defaultStart = subtractDays(defaultEnd, 30)
  const [datePreset, setDatePreset] = useState('30')

  const [filters, setFilters] = useState({
    estados: searchParams.get('estado') ? [searchParams.get('estado')] : [],
    empresa_ids: [],
    canal_ids: [],
    escaneadores: [],
    fecha_inicio: searchParams.get('fecha_inicio') || defaultStart,
    fecha_fin: searchParams.get('fecha_fin') || defaultEnd,
  })
  const autoFilterEndRef = useRef(defaultEnd)
  const isRollingDateRangeRef = useRef(!searchParams.get('fecha_inicio') && !searchParams.get('fecha_fin'))
  const [guiaSearch, setGuiaSearch] = useState('')
  const [guiaSearchInput, setGuiaSearchInput] = useState('')
  const [guiaSearchResults, setGuiaSearchResults] = useState([])
  const [guiaSearchOpen, setGuiaSearchOpen] = useState(false)
  const [guiaSearchLoading, setGuiaSearchLoading] = useState(false)
  const guiaSearchRef = useRef(null)
  const guiaDebounceRef = useRef(null)
  const [copiedGuia, setCopiedGuia] = useState(null)
  const [copiedTarimaCode, setCopiedTarimaCode] = useState(null)
  const [selectedTarima, setSelectedTarima] = useState(null)
  const [deletingTarima, setDeletingTarima] = useState(null)
  const [blockedDeleteTarima, setBlockedDeleteTarima] = useState(null)
  const [blockedEditTarima, setBlockedEditTarima] = useState(null)
  const [confirmingFolioDelete, setConfirmingFolioDelete] = useState(false)
  const [deletingGuia, setDeletingGuia] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportingBulk, setExportingBulk] = useState(false)
  const [sortCol, setSortCol] = useState('fecha_inicio')
  const [sortDir, setSortDir] = useState('desc')
  const [detailTab, setDetailTab] = useState('guias')
  const [newGuiaCode, setNewGuiaCode] = useState('')
  const { canDelete, canView, hasPermission, user } = useAuthStore()
  const backendOnline = useAuthStore(s => s.backendOnline)
  const canViewDetails = canView('dropscan.tarimas')           // ver+
  const canManageStatus = hasPermission('dropscan.tarimas', 'actualizar')
  const canExportTarimas = hasPermission('dropscan.tarimas', 'exportar') // actualizar+
  const canDeleteFolio = hasPermission('fep.folios', 'eliminar')
  const toast = useToastStore.getState()
  const { t } = useI18nStore()
  const qc = useQueryClient()

  const syncRollingDateRange = useCallback(() => {
    const previousEnd = autoFilterEndRef.current
    const today = getToday()
    if (today === previousEnd) return

    if (isRollingDateRangeRef.current) {
      setFilters(current => ({
        ...current,
        fecha_inicio: subtractDays(today, 30),
        fecha_fin: today,
      }))
      setDatePreset('30')
      setPage(1)
    }
    autoFilterEndRef.current = today
  }, [])

  useEffect(() => {
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') syncRollingDateRange()
    }

    window.addEventListener('focus', syncRollingDateRange)
    document.addEventListener('visibilitychange', syncWhenVisible)
    const intervalId = window.setInterval(syncRollingDateRange, 60_000)

    return () => {
      window.removeEventListener('focus', syncRollingDateRange)
      document.removeEventListener('visibilitychange', syncWhenVisible)
      window.clearInterval(intervalId)
    }
  }, [syncRollingDateRange])

  // Fetch empresas/canales/escaneadores for filters
  const { data: empresasData } = useQuery({ queryKey: ['dropscan-empresas'], queryFn: ds.getEmpresas, enabled: backendOnline })
  const { data: canalesData } = useQuery({ queryKey: ['dropscan-canales'], queryFn: ds.getCanales, enabled: backendOnline })
  const { data: escaneadoresListData } = useQuery({
    queryKey: ['dropscan-escaneadores-list', filters.fecha_inicio, filters.fecha_fin, filters.empresa_ids, filters.canal_ids],
    queryFn: () => ds.getEscaneadoresList(filters.fecha_inicio, filters.fecha_fin, filters.empresa_ids.length ? filters.empresa_ids : undefined, filters.canal_ids.length ? filters.canal_ids : undefined),
    enabled: backendOnline && !!filters.fecha_inicio && !!filters.fecha_fin,
  })
  const empresasOpts = (Array.isArray(empresasData) ? empresasData : empresasData?.empresas || [])
    .filter(e => e.activo !== false).map(e => ({ value: e.id, label: e.nombre, color: e.color }))
  const canalesOpts = (Array.isArray(canalesData) ? canalesData : canalesData?.canales || [])
    .filter(c => c.activo !== false).map(c => ({ value: c.id, label: c.nombre }))
  const escaneadoresOpts = (escaneadoresListData?.escaneadores || []).map(e => ({ value: e, label: e }))

  const highlightGuia = searchParams.get('highlight_guia') || ''
  const highlightRowRef = useRef(null)

  // Auto-open tarima detail if navigated from SearchBar with tarima_id param
  useEffect(() => {
    const tarimaId = searchParams.get('tarima_id')
    if (tarimaId) {
      setDetailTab('guias')
      setSelectedTarima(parseInt(tarimaId))
    }
  }, [searchParams])

  // Scroll highlighted guide into view when modal opens
  useEffect(() => {
    if (highlightGuia && selectedTarima && highlightRowRef.current) {
      setTimeout(() => highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400)
    }
  }, [selectedTarima, highlightGuia])

  // Close guide search dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (guiaSearchRef.current && !guiaSearchRef.current.contains(e.target)) setGuiaSearchOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const searchGuias = useCallback(async (q) => {
    if (!q || q.length < 2) { setGuiaSearchResults([]); setGuiaSearchOpen(false); return }
    setGuiaSearchLoading(true)
    setGuiaSearchOpen(true)
    try {
      const { data } = await api.get('/DropScan/dashboard/guias/search', { params: { q } })
      setGuiaSearchResults(data.guias || [])
    } catch { setGuiaSearchResults([]) }
    finally { setGuiaSearchLoading(false) }
  }, [])

  const handleGuiaResultClick = (guia) => {
    setGuiaSearchOpen(false)
    setGuiaSearchInput(guia.codigo_guia)
    setGuiaSearch(guia.codigo_guia)
    setPage(1)
    setDetailTab('guias')
    setSelectedTarima(guia.tarima_id)
    navigate(`/DropScan/tarimas?tarima_id=${guia.tarima_id}&highlight_guia=${encodeURIComponent(guia.codigo_guia)}`, { replace: true })
  }

  const copyGuia = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedGuia(code)
      setTimeout(() => setCopiedGuia(null), 1500)
    })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['dropscan-tarimas', page, filters, pageLimit, guiaSearch],
    queryFn: () => ds.getTarimas({
      estado: filters.estados,
      empresa_id: filters.empresa_ids,
      canal_id: filters.canal_ids,
      escaneador: filters.escaneadores.length ? filters.escaneadores : undefined,
      fecha_inicio: filters.fecha_inicio || undefined,
      fecha_fin: filters.fecha_fin || undefined,
      codigo_guia: guiaSearch || undefined,
      page, limit: pageLimit,
    }),
    enabled: backendOnline,
  })

  const rawTarimasDup = data?.tarimas || []
  const rawTarimas = rawTarimasDup.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 }

  // Client-side sort
  const tarimas = useMemo(() => {
    const sorted = [...rawTarimas]
    sorted.sort((a, b) => {
      let aV = a[sortCol], bV = b[sortCol]
      if (sortCol === 'cantidad_guias') { aV = Number(aV); bV = Number(bV) }
      if (sortCol === 'fecha_inicio') { aV = new Date(aV); bV = new Date(bV) }
      if (typeof aV === 'string') { aV = aV.toLowerCase(); bV = bV?.toLowerCase() || '' }
      if (aV < bV) return sortDir === 'asc' ? -1 : 1
      if (aV > bV) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [rawTarimas, sortCol, sortDir])

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['dropscan-tarima-detail', selectedTarima],
    queryFn: () => ds.getTarimaDetail(selectedTarima),
    enabled: backendOnline && !!selectedTarima,
  })

  const { data: duplicadosData, isLoading: duplicadosLoading } = useQuery({
    queryKey: ['dropscan-tarima-duplicados', selectedTarima],
    queryFn: () => ds.getTarimaDuplicados(selectedTarima),
    enabled: backendOnline && !!selectedTarima && detailTab === 'duplicados',
  })

  const { data: logData } = useQuery({
    queryKey: ['dropscan-tarima-log', selectedTarima],
    queryFn: () => ds.getTarimaLog(selectedTarima),
    enabled: backendOnline && !!selectedTarima && detailTab === 'historial',
  })
  const tarimaLog = logData?.log || []

  const deleteMutation = useMutation({
    mutationFn: (id) => ds.deleteTarima(id),
    onSuccess: () => { toast.success(t('history.palletDeleted')); qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] }); setSelectedTarima(null) },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error'))
  })

  const deleteGuiaMutation = useMutation({
    mutationFn: ({ tarimaId, guiaId }) => ds.deleteGuiaFromTarima(tarimaId, guiaId),
    onSuccess: () => {
      toast.success('Guía eliminada')
      qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail', selectedTarima] })
      qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error'))
  })

  const addGuiaMutation = useMutation({
    mutationFn: ({ tarimaId, codigo_guia }) => ds.addGuiaToTarima(tarimaId, codigo_guia),
    onSuccess: (data) => {
      toast.success('Guía agregada correctamente')
      setNewGuiaCode('')
      qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail', selectedTarima] })
      qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] })
    },
    onError: (err) => {
      if (err.response?.data?.error === 'DUPLICADO') {
        toast.error('Esta guía ya está registrada en esta tarima')
      } else {
        toast.error(err.response?.data?.error || t('toast.error'))
      }
    }
  })

  const reopenMutation = useMutation({
    mutationFn: (id) => ds.reopenTarima(id),
    onSuccess: () => {
      toast.success(t('history.palletReopened'))
      qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] })
      qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error'))
  })

  const finalizeMutation = useMutation({
    mutationFn: (id) => ds.finalizeTarima(id),
    onSuccess: () => {
      toast.success('Tarima cerrada forzosamente')
      qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] })
      qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail', selectedTarima] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error'))
  })

  const deleteFolioMutation = useMutation({
    mutationFn: (folioId) => deleteFolio(folioId),
    onSuccess: () => {
      toast.success(`Folio eliminado — tarima liberada`)
      qc.invalidateQueries({ queryKey: ['dropscan-tarimas'] })
      qc.invalidateQueries({ queryKey: ['dropscan-tarima-detail'] })
      const tarima = blockedEditTarima
      setBlockedEditTarima(null)
      setConfirmingFolioDelete(false)
      if (tarima?.id) handleOpenDetail(tarima.id, true)
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || t('toast.error'))
      setConfirmingFolioDelete(false)
    },
  })

  const estadoColors = {
    'EN_PROCESO': 'bg-warning-100 text-warning-700',
    'FINALIZADA': 'bg-success-100 text-success-700',
    'CANCELADA': 'bg-danger-100 text-danger-700',
    'ENVIADA': 'bg-accent-100 text-accent-700',
  }

  const getEstadoLabels = (t) => ({
    'EN_PROCESO': t('status.EN_PROCESO'),
    'FINALIZADA': t('status.FINALIZADA'),
    'CANCELADA': t('status.CANCELADA'),
    'ENVIADA': t('status.ENVIADA'),
  })
  const estadoLabels = getEstadoLabels(t)

  const getDisplayEstado = (row) => row?.folio_asignado ? 'ENVIADA' : row?.estado

  const copyTarimaCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedTarimaCode(code)
      setTimeout(() => setCopiedTarimaCode(null), 1500)
    })
  }

  const canReopen = user && ['Supervisor', 'Jefe', 'Administrador'].includes(user.rol_nombre)

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-warm-300" />
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary-500" /> : <ArrowDown className="w-3 h-3 text-primary-500" />
  }

  const clearFilters = () => {
    const today = getToday()
    autoFilterEndRef.current = today
    isRollingDateRangeRef.current = true
    setDatePreset('30')
    setFilters({ estados: [], empresa_ids: [], canal_ids: [], escaneadores: [], fecha_inicio: subtractDays(today, 30), fecha_fin: today })
    setGuiaSearch(''); setGuiaSearchInput('')
    setPage(1)
  }
  const hasActiveFilters = !!(filters.estados.length || filters.empresa_ids.length || filters.canal_ids.length || filters.escaneadores.length || guiaSearch)

  const handleExport = () => {
    try {
      const csv = [
        ['Codigo', 'Empresa', 'Canal', 'Operador', 'Guias', 'Estado', 'Fecha'].join(','),
        ...tarimas.map(row => [row.codigo, row.empresa_nombre, row.canal_nombre, row.operador_nombre, row.cantidad_guias, row.estado, fmtDateTime(row.fecha_inicio)].join(','))
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `tarimas_${getToday()}.csv`; a.click()
      toast.success(t('toast.success'))
    } catch { toast.error(t('toast.error')) }
  }

  const handleOpenDetail = (id, withEdit = false) => {
    setDetailTab('guias')
    setEditMode(withEdit)
    setSelectedTarima(id)
  }

  const handleExportTarimaExcel = () => {
    if (!detail) return
    try {
      const wsData = [
        ['Tarima', detail.codigo],
        ['Empresa', detail.empresa_nombre],
        ['Canal', detail.canal_nombre],
        ['Operador', detail.operador_nombre],
        ['Estado', estadoLabels[detail.estado] || detail.estado],
        ['Guías', `${detail.cantidad_guias}/100`],
        ['Inicio', fmtDateTime(detail.fecha_inicio)],
        ['Cierre', detail.fecha_cierre ? fmtDateTime(detail.fecha_cierre) : '--'],
        ['Duración', detail.tiempo_armado_segundos ? `${Math.round(detail.tiempo_armado_segundos / 60)} min` : '--'],
        [],
        ['#', 'Código Guía', 'Operador', 'Hora Escaneo', 'Peso (kg)'],
        ...detailGuias.map(g => [
          g.posicion,
          g.codigo_guia,
          g.operador_nombre,
          fmtDateTime(g.timestamp_escaneo),
          g.peso_kg != null ? Number(g.peso_kg) : ''
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Tarima')
      XLSX.writeFile(wb, `tarima_${detail.codigo}_${getToday()}.xlsx`)
    } catch { toast.error(t('toast.error')) }
  }

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleSelectAll = () => {
    if (selectedIds.size === tarimas.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(tarimas.map(t => t.id)))
  }

  const handleBulkExport = async () => {
    if (selectedIds.size === 0) return
    setExportingBulk(true)
    try {
      const details = await Promise.all(
        [...selectedIds].map(id => ds.getTarimaDetail(id))
      )
      const wb = XLSX.utils.book_new()
      const rows = [['Tarima', 'Empresa', 'Canal', 'Operador', 'Estado', 'Guías', 'Inicio', 'Cierre', 'Duración (min)', 'Código Guía', 'Posición', 'Fecha Escaneo', 'Operador Escaneo', 'Peso (kg)']]
      for (const d of details) {
        const t = d.tarima
        const guias = d.guias || []
        if (guias.length === 0) {
          rows.push([t.codigo, t.empresa_nombre, t.canal_nombre, t.operador_nombre, t.estado, t.cantidad_guias, t.fecha_inicio ? fmtDateTime(t.fecha_inicio) : '', t.fecha_cierre ? fmtDateTime(t.fecha_cierre) : '', t.tiempo_armado_segundos ? Math.round(t.tiempo_armado_segundos / 60) : '', '', '', '', '', ''])
        } else {
          for (const g of guias) {
            rows.push([t.codigo, t.empresa_nombre, t.canal_nombre, t.operador_nombre, t.estado, t.cantidad_guias, t.fecha_inicio ? fmtDateTime(t.fecha_inicio) : '', t.fecha_cierre ? fmtDateTime(t.fecha_cierre) : '', t.tiempo_armado_segundos ? Math.round(t.tiempo_armado_segundos / 60) : '', g.codigo_guia, g.posicion, g.timestamp_escaneo ? fmtDateTime(g.timestamp_escaneo) : '', g.operador_nombre || '', g.peso_kg != null ? Number(g.peso_kg) : ''])
          }
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Tarimas')
      XLSX.writeFile(wb, `tarimas_${getToday()}.xlsx`)
      toast.success('Exportación completada')
      setSelectMode(false)
      setSelectedIds(new Set())
    } catch { toast.error(t('toast.error')) }
    setExportingBulk(false)
  }

  const detail = detailData?.tarima
  const detailGuias = detailData?.guias || []
  const duplicados = duplicadosData?.duplicados || []

  useEffect(() => {
    if (detail?.folio_asignado && editMode) setEditMode(false)
  }, [detail?.folio_asignado, editMode])

  return (
    <div className="flex flex-col h-full">
      <Header title={t('history.title')} subtitle={t('history.subtitle')} showSearch />

      <div className="flex-1 overflow-y-auto">
        {/* Filter bar */}
        <div data-tour="tarimas-filtros" className="sticky top-0 z-[5] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input type="date" value={filters.fecha_inicio}
                onChange={e => { isRollingDateRangeRef.current = false; setDatePreset(''); setFilters(f => ({ ...f, fecha_inicio: e.target.value })); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
              <span className="text-warm-300 text-xs">→</span>
              <input type="date" value={filters.fecha_fin}
                onChange={e => { isRollingDateRangeRef.current = false; setDatePreset(''); setFilters(f => ({ ...f, fecha_fin: e.target.value })); setPage(1) }}
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px]" />
            </div>
            {[
              { k: 'shortcut.today', d: 0 },
              { k: 'shortcut.7days', d: 7 },
              { k: 'shortcut.30days', d: 30 },
            ].map(({ k, d }) => (
              <button key={k} onClick={() => {
                const todayNow = getToday()
                const s = d === 0 ? todayNow : subtractDays(todayNow, d)
                autoFilterEndRef.current = todayNow
                isRollingDateRangeRef.current = true
                setDatePreset(String(d))
                setFilters(f => ({ ...f, fecha_inicio: s, fecha_fin: todayNow })); setPage(1)
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                datePreset === String(d)
                  ? 'bg-primary-50 text-primary-700 border-primary-200'
                  : 'bg-warm-100 text-warm-600 border-warm-200 hover:bg-warm-200'
              }`}
            >{t(k)}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <MultiSelect
              icon={CheckCircle}
              placeholder={t('filter.status')}
              options={[
                { value: 'EN_PROCESO', label: estadoLabels['EN_PROCESO'] },
                { value: 'FINALIZADA', label: estadoLabels['FINALIZADA'] },
                { value: 'CANCELADA', label: estadoLabels['CANCELADA'] },
              ]}
              selected={filters.estados}
              onChange={v => { setFilters(f => ({ ...f, estados: v })); setPage(1) }}
              className="min-w-[180px]"
            />
            <MultiSelect
              icon={Building2}
              placeholder={t('history.company')}
              options={empresasOpts}
              selected={filters.empresa_ids}
              onChange={v => { setFilters(f => ({ ...f, empresa_ids: v })); setPage(1) }}
              className="min-w-[180px]"
            />
            <MultiSelect
              icon={Radio}
              placeholder={t('history.channel')}
              options={canalesOpts}
              selected={filters.canal_ids}
              onChange={v => { setFilters(f => ({ ...f, canal_ids: v })); setPage(1) }}
              className="min-w-[170px]"
            />
            <MultiSelect
              icon={Search}
              placeholder={t('filter.scanner')}
              options={escaneadoresOpts}
              selected={filters.escaneadores}
              onChange={v => { setFilters(f => ({ ...f, escaneadores: v })); setPage(1) }}
              className="min-w-[170px]"
            />
            {hasActiveFilters && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                <X className="w-3 h-3" />{t('common.clear')}
              </button>
            )}
            <div className="flex items-center gap-2">
              <div ref={guiaSearchRef} className="relative">
                <form
                  onSubmit={(e) => { e.preventDefault(); const q = guiaSearchInput.trim(); setGuiaSearch(q); setPage(1); if (q) searchGuias(q) }}
                  className={`flex items-center gap-1.5 h-10 bg-warm-50 border rounded-xl px-3 min-w-[220px] transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm ${guiaSearchOpen ? 'border-primary-400 bg-white' : 'border-warm-200'}`}
                >
                  <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                  <input
                    type="text"
                    value={guiaSearchInput}
                    onChange={e => {
                      const v = e.target.value
                      setGuiaSearchInput(v)
                      clearTimeout(guiaDebounceRef.current)
                      if (!v.trim()) { setGuiaSearch(''); setGuiaSearchOpen(false); setPage(1) }
                      else { guiaDebounceRef.current = setTimeout(() => searchGuias(v), 300) }
                    }}
                    onFocus={() => guiaSearchInput.length >= 2 && guiaSearchResults.length > 0 && setGuiaSearchOpen(true)}
                    onKeyDown={e => { if (e.key === 'Enter') { const q = guiaSearchInput.trim(); setGuiaSearch(q); setPage(1); if (q) searchGuias(q) } if (e.key === 'Escape') setGuiaSearchOpen(false) }}
                    placeholder={t('common.searchGuide')}
                    className="h-full text-xs outline-none bg-transparent text-warm-700 flex-1 min-w-[120px] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  {guiaSearchInput && (
                    <button type="button" onClick={() => { setGuiaSearchInput(''); setGuiaSearch(''); setGuiaSearchOpen(false); setGuiaSearchResults([]); setPage(1) }} className="text-warm-400 hover:text-warm-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </form>
                <AnimatePresence>
                  {guiaSearchOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1 z-[100] bg-white/95 backdrop-blur-xl rounded-xl shadow-depth border border-warm-100 overflow-hidden min-w-[384px]"
                    >
                      {guiaSearchLoading ? (
                        <div className="p-4 text-center"><div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                      ) : guiaSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-xs text-warm-400">{t('common.noResults')}</div>
                      ) : (
                        <div>
                          <div className="px-3 py-1.5 border-b border-warm-100 bg-warm-50/50">
                            <p className="text-[10px] text-warm-400 font-bold uppercase tracking-wider">{guiaSearchResults.length} {t('search.results')}</p>
                          </div>
                          <div className="max-h-60 overflow-y-auto scrollbar-thin">
                            {guiaSearchResults.map((g) => (
                              <div
                                key={g.id}
                                onMouseDown={(e) => { e.preventDefault(); handleGuiaResultClick(g) }}
                                className="px-3 py-2.5 hover:bg-primary-100 cursor-pointer border-b border-warm-50 last:border-b-0 transition-colors group"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="code-main truncate flex-1">{g.codigo_guia}</p>
                                  {(() => {
                                    const ds = g.folio_asignado ? 'ENVIADA' : g.tarima_estado
                                    return (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${estadoColors[ds] || 'bg-warm-100 text-warm-500'}`}>
                                        {estadoLabels[ds] || ds}
                                      </span>
                                    )
                                  })()}
                                  <ArrowRight className="w-3 h-3 text-warm-300 group-hover:text-primary-500 transition-colors shrink-0" />
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-warm-400 flex-wrap">
                                  <span className="code-main">{g.tarima_codigo}</span>
                                  {g.folio_asignado && <>
                                    <span>·</span>
                                    <span className="text-primary-600 font-semibold">{g.folio_asignado}</span>
                                  </>}
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.empresa_color || '#94a3b8' }} />
                                    {g.empresa_nombre}
                                  </span>
                                  <span>·</span>
                                  <span>#{g.posicion}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {canExportTarimas && !selectMode && (
                <button onClick={() => { setSelectMode(true); setSelectedIds(new Set()) }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-success-600 text-white hover:bg-success-700 rounded-xl transition-all duration-200 hover:shadow-glow hover:-translate-y-[1px] active:scale-[0.97]">
                  <Download className="w-4 h-4" /> {t('common.export')}
                </button>
              )}
              {selectMode && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-primary-600">{selectedIds.size} {t('history.selected')}</span>
                  <button onClick={toggleSelectAll}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg transition-colors">
                    {selectedIds.size === tarimas.length ? t('history.deselectAll') : t('history.selectAll')}
                  </button>
                  <button onClick={handleBulkExport} disabled={selectedIds.size === 0 || exportingBulk}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-success-600 text-white hover:bg-success-700 rounded-xl transition-all duration-200 hover:shadow-glow hover:-translate-y-[1px] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0">
                    {exportingBulk ? <div className="w-3 h-3 border-2 border-success-600 border-t-transparent rounded-full animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {t('common.export')} {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                  </button>
                  <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
                    className="p-1 text-warm-400 hover:text-warm-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="max-w-full mx-auto">
            {/* Table */}
            <motion.div
              data-tour="tarimas-tabla"
              className="card overflow-hidden table-shell"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {isLoading ? (
                <LoadingSpinner text={t('common.loading')} />
              ) : tarimas.length === 0 ? (
                <div className="p-16 text-center text-sm text-warm-400">{t('history.noPalletsFound')}</div>
              ) : (
                <div className="overflow-x-auto table-scroll">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-warm-50 border-b border-warm-100">
                        {selectMode && (
                          <th className="table-header w-10 text-center">
                            <input type="checkbox" checked={selectedIds.size === tarimas.length && tarimas.length > 0}
                              onChange={toggleSelectAll} className="cb" />
                          </th>
                        )}
                        <th className="table-header" onClick={() => handleSort('codigo')}>
                          <span className="flex items-center gap-1.5">{t('history.palletCode')} <SortIcon col="codigo" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('empresa_nombre')}>
                          <span className="flex items-center gap-1.5">{t('history.company')} <SortIcon col="empresa_nombre" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('canal_nombre')}>
                          <span className="flex items-center gap-1.5">{t('history.channel')} <SortIcon col="canal_nombre" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('operador_nombre')}>
                          <span className="flex items-center gap-1.5">{t('history.operator')} <SortIcon col="operador_nombre" /></span>
                        </th>
                        <th className="table-header text-center" onClick={() => handleSort('cantidad_guias')}>
                          <span className="flex items-center justify-center gap-1.5">{t('history.guides')} <SortIcon col="cantidad_guias" /></span>
                        </th>
                        <th className="table-header text-center" onClick={() => handleSort('estado')}>
                          <span className="flex items-center justify-center gap-1.5">{t('common.status')} <SortIcon col="estado" /></span>
                        </th>
                        <th className="table-header" onClick={() => handleSort('fecha_inicio')}>
                          <span className="flex items-center gap-1.5">{t('history.date')} <SortIcon col="fecha_inicio" /></span>
                        </th>
                        <th className="table-header text-center">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {tarimas.map(row => (
                        <tr key={row.id}
                          onClick={() => !selectMode && canViewDetails && handleOpenDetail(row.id)}
                          className={`table-row group ${selectMode ? 'cursor-default' : canViewDetails ? 'cursor-pointer' : 'cursor-default'} ${selectMode && selectedIds.has(row.id) ? 'bg-primary-50/40' : ''}`}>
                          {selectMode && (
                            <td className="table-cell text-center">
                              <input type="checkbox" checked={selectedIds.has(row.id)}
                                onChange={() => toggleSelect(row.id)} className="cb" />
                            </td>
                          )}
                          <td className="table-cell tarima-code-cell" data-column="tarima-code">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono" style={TARIMA_CODE_STYLE}>{row.codigo}</span>
                              <button
                                onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(row.codigo) }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-all"
                                title="Copiar código"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="table-cell text-warm-600">{row.empresa_nombre}</td>
                          <td className="table-cell text-warm-600">{row.canal_nombre}</td>
                          <td className="table-cell text-warm-600">{row.operador_nombre}</td>
                          <td className="table-cell text-center">
                            <span className="font-bold text-warm-700">{row.cantidad_guias}</span>
                            <span className="text-warm-400">/100</span>
                          </td>
                          <td className="table-cell text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <span className={`badge text-[10px] ${estadoColors[getDisplayEstado(row)] || 'bg-warm-100 text-warm-600'}`}>
                                {estadoLabels[getDisplayEstado(row)] || getDisplayEstado(row)}
                              </span>
                              {row.forzado_cierre && !row.folio_asignado && (
                                <span className="badge text-[9px] bg-warning-100 text-warning-600 flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Forzado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="table-cell text-warm-500 text-xs">
                            {fmtDate(row.fecha_inicio)}
                            <br /><span className="text-warm-400">{fmtTimeShort(row.fecha_inicio)}</span>
                          </td>
                          <td className="table-cell" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                              {canViewDetails && (
                              <button onClick={() => handleOpenDetail(row.id)}
                                className="p-2 rounded-xl hover:bg-primary-50 text-warm-400 hover:text-primary-600 transition-all" title="Ver detalle">
                                <Eye className="w-4 h-4" />
                              </button>
                              )}
                              {canManageStatus && !row.folio_asignado && (
                                <button
                                  onClick={() => handleOpenDetail(row.id, true)}
                                  className="p-2 rounded-xl hover:bg-warning-50 text-warm-400 hover:text-warning-500 transition-all"
                                  title="Editar">
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete('dropscan.tarimas') && (
                                <button
                                  onClick={() => row.folio_asignado ? setBlockedDeleteTarima(row) : setDeletingTarima(row)}
                                  className="p-2 rounded-xl hover:bg-danger-50 text-warm-400 hover:text-danger-500 transition-all"
                                  title={row.folio_asignado ? `Bloqueado — folio ${row.folio_asignado}` : 'Eliminar'}
                                >
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
              <TablePagination
                page={page}
                totalPages={pagination.pages}
                pageSize={pageLimit}
                totalItems={pagination.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageLimit(size); setPage(1) }}
                itemLabel={t('common.records')}
              />
            </motion.div>
          </div>
        </div>

      </div>

      {/* Detail Modal */}
      <Modal isOpen={!!selectedTarima} onClose={() => { setSelectedTarima(null); setEditMode(false) }} icon={Package}
        title={
          detail ? (
            <div className="flex flex-col gap-0.5 leading-tight">
              <div className="flex items-center gap-2 group/tcode">
                <span className="font-mono" style={TARIMA_CODE_STYLE}>{detail.codigo}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyTarimaCode(detail.codigo) }}
                  className="opacity-0 group-hover/tcode:opacity-100 p-0.5 rounded hover:bg-primary-100/60 text-warm-400 hover:text-primary-600 transition-all"
                  title="Copiar código"
                >
                  {copiedTarimaCode === detail.codigo
                    ? <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                    : <Copy className="w-3.5 h-3.5" />}
                </button>
                <span className={`badge text-xs px-2.5 py-1 ${estadoColors[getDisplayEstado(detail)] || 'bg-warm-100 text-warm-600'}`}>
                  {estadoLabels[getDisplayEstado(detail)] || getDisplayEstado(detail)}
                </span>
              </div>
              {detail.folio_asignado && (
                <button
                  onClick={() => { setSelectedTarima(null); setEditMode(false); navigate(`/DropScan/folios?folio_id=${detail.folio_id}`) }}
                  className="text-[11px] font-semibold text-primary-600 hover:text-primary-800 hover:underline text-left leading-tight"
                >
                  {detail.folio_asignado}
                </button>
              )}
            </div>
          ) : t('common.loading')
        }
        size="xl"
        headerAction={detail && canExportTarimas && (
          <button onClick={handleExportTarimaExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success-50 text-success-700 rounded-lg hover:bg-success-100 font-semibold transition-all border border-success-200">
            <Download className="w-3.5 h-3.5" /> {t('common.export')}
          </button>
        )}
        footer={detail && (
          <>
            {canManageStatus && detail.estado === 'EN_PROCESO' && (
              <button onClick={() => finalizeMutation.mutate(detail.id)}
                disabled={finalizeMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-danger-50 text-danger-700 rounded-xl hover:bg-danger-100 font-semibold transition-all border border-danger-200 disabled:opacity-50">
                <Lock className="w-4 h-4" /> {t('history.finalize')}
              </button>
            )}
            {canManageStatus && !detail.folio_asignado && (
              <button onClick={() => setEditMode(e => !e)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl font-semibold transition-all ${
                  editMode ? 'bg-warning-100 text-warning-700 hover:bg-warning-200' : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                }`}>
                <Edit3 className="w-4 h-4" /> {editMode ? t('common.close') : t('common.edit')}
              </button>
            )}
          </>
        )}>
        {detailLoading ? (
          <LoadingSpinner text={t('common.loading')} />
        ) : detail ? (
          <div className="space-y-5">
            {/* Info grid */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: Package, l: t('history.company'), v: detail.empresa_nombre },
                { icon: Package, l: t('history.channel'), v: detail.canal_nombre },
                { icon: Package, l: t('history.guides'), v: `${detail.cantidad_guias}/100` },
                { icon: Clock, l: t('history.duration'), v: calcDuration(detail) },
                { icon: CheckCircle, l: t('common.status'), v: estadoLabels[detail.estado] || detail.estado },
                { icon: Package, l: t('history.operator'), v: detail.operador_nombre },
                { icon: Clock, l: t('history.startTime'), v: fmtDateTime(detail.fecha_inicio) },
                { icon: Clock, l: t('history.endTime'), v: detail.fecha_cierre ? fmtDateTime(detail.fecha_cierre) : '--' },
              ].map(f => (
                <div key={f.l} className="p-3 rounded-xl bg-warm-50 border border-warm-100/50">
                  <p className="text-[10px] text-warm-400 uppercase tracking-wider font-bold mb-0.5">{f.l}</p>
                  <p className="text-sm font-semibold text-warm-700">{f.v}</p>
                </div>
              ))}
            </div>

            {/* Peso total */}
            {(() => {
              const guiasConPeso = detailGuias.filter(g => g.peso_kg != null)
              if (guiasConPeso.length === 0) return null
              const total = guiasConPeso.reduce((s, g) => s + Number(g.peso_kg), 0)
              const parcial = guiasConPeso.length < detailGuias.length
              return (
                <div className="p-3 rounded-xl bg-primary-50 border border-primary-100/50 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-primary-400 uppercase tracking-wider font-bold">Peso total registrado</p>
                  <p className="text-sm font-bold text-primary-700 font-mono">
                    {total.toFixed(3)} kg
                    {parcial && <span className="ml-1.5 text-[10px] font-semibold text-primary-400 normal-case">(peso parcial)</span>}
                  </p>
                </div>
              )
            })()}

            {/* Force-close banner */}
            {detail.forzado_cierre && (
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-warning-500 shrink-0" />
                <p className="text-xs font-semibold text-warning-700">Cierre forzado — tarima cerrada manualmente antes de completar 100 guías</p>
              </div>
            )}

            {/* Cancellation reason */}
            {detail.estado === 'CANCELADA' && detail.cancelada_razon && (
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-warning-700">{t('history.palletCancelled')}</p>
                  <p className="text-xs text-warning-600 mt-0.5">{detail.cancelada_razon}</p>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-warm-100">
              <button
                onClick={() => setDetailTab('guias')}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px
                  ${detailTab === 'guias'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-warm-400 hover:text-warm-600'}`}
              >
                {t('history.correctGuides')} ({detailGuias.length})
              </button>
              <button
                onClick={() => setDetailTab('duplicados')}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5
                  ${detailTab === 'duplicados'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-warm-400 hover:text-warm-600'}`}
              >
                <Copy className="w-3.5 h-3.5" /> {t('scan.duplicates')}
              </button>
              <button
                onClick={() => setDetailTab('historial')}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-1.5
                  ${detailTab === 'historial'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-warm-400 hover:text-warm-600'}`}
              >
                <Clock className="w-3.5 h-3.5" /> {t('fep.detail.historial')}
              </button>
            </div>

            {/* Tab content: Guias Correctas */}
            {detailTab === 'guias' && (
              <div>
                {detailGuias.length === 0 ? (
                  <div className="p-8 text-center text-sm text-warm-400">{t('history.noGuidesRegistered')}</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
                    <table className="w-full text-xs">
                      <thead className="bg-warm-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">#</th>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('history.guideCode')}</th>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('history.operator')}</th>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('history.scanTime')}</th>
                          <th className="text-right px-3 py-2.5 font-bold text-warm-500">Peso (kg)</th>
                          {editMode && <th className="w-8"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-50">
                        {detailGuias.map(g => {
                          const isHighlighted = highlightGuia && g.codigo_guia === highlightGuia
                          return (
                            <tr key={g.id}
                              ref={isHighlighted ? highlightRowRef : null}
                              className={`transition-colors ${isHighlighted ? 'bg-warning-100 border-l-4 border-warning-500' : 'hover:bg-warm-50'}`}>
                              <td className="px-3 py-2 text-warm-400 font-bold">{g.posicion}</td>
                              <td className={`px-3 py-2 font-mono font-semibold ${isHighlighted ? 'text-warning-700' : 'text-warm-700'}`}>
                                <div className="flex items-center gap-1.5 group/code">
                                  <span className="code-main">{g.codigo_guia}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyGuia(g.codigo_guia)}
                                    className="opacity-0 group-hover/code:opacity-100 transition-opacity p-0.5 rounded hover:bg-warm-100"
                                    title={t('common.copy')}
                                  >
                                    {copiedGuia === g.codigo_guia
                                      ? <CheckCircle className="w-3 h-3 text-success-500" />
                                      : <Copy className="w-3 h-3 text-warm-400" />
                                    }
                                  </button>
                                  {isHighlighted && <span className="text-[9px] bg-warning-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">{t('search.found')}</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-warm-500">{g.operador_nombre}</td>
                              <td className="px-3 py-2 text-warm-400">{fmtTime(g.timestamp_escaneo)}</td>
                              <td className="px-3 py-2 text-right font-mono text-warm-600">
                                {g.peso_kg != null ? Number(g.peso_kg).toFixed(3) : <span className="text-warm-300">—</span>}
                              </td>
                              {editMode && !detail?.folio_asignado && (
                                <td className="px-2 py-1.5">
                                  <button
                                    onClick={() => setDeletingGuia(g)}
                                    disabled={deleteGuiaMutation.isPending}
                                    className="p-1.5 rounded-lg hover:bg-danger-50 text-warm-300 hover:text-danger-500 transition-all disabled:opacity-40">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add guide section (edit mode, only when no folio) */}
                {editMode && canManageStatus && !detail?.folio_asignado && (
                  <div className="mt-5 p-4 rounded-xl bg-primary-50 border border-primary-200">
                    <p className="text-xs font-bold text-primary-700 mb-3 uppercase tracking-wider">{t('history.addNewGuide')}</p>
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      if (newGuiaCode.trim()) {
                        addGuiaMutation.mutate({ tarimaId: detail.id, codigo_guia: newGuiaCode.trim() })
                      }
                    }} className="flex gap-2">
                      <input
                        type="text"
                        value={newGuiaCode}
                        onChange={(e) => setNewGuiaCode(e.target.value)}
                        placeholder={t('history.guideCode')}
                        disabled={addGuiaMutation.isPending}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-primary-200 rounded-lg outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={addGuiaMutation.isPending || !newGuiaCode.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('history.addGuide')}</span>
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* Tab content: Duplicados */}
            {detailTab === 'duplicados' && (
              <div>
                {duplicadosLoading ? (
                  <LoadingSpinner text={t('common.loading')} />
                ) : duplicados.length === 0 ? (
                  <div className="p-8 text-center text-sm text-warm-400">
                    <Copy className="w-8 h-8 text-warm-200 mx-auto mb-2" />
                    {t('history.noDuplicatesFound')}
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-warm-100 scrollbar-thin">
                    <table className="w-full text-xs">
                      <thead className="bg-warm-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('history.duplicateGuide')}</th>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('history.originalGuide')}</th>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('history.operator')}</th>
                          <th className="text-left px-3 py-2.5 font-bold text-warm-500">{t('history.scanTime')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-50">
                        {duplicados.map((d, i) => (
                          <tr key={d.id || i} className="table-row">
                            <td className="px-3 py-2"><span className="code-main">{d.codigo_guia}</span></td>
                              <td className="px-3 py-2"><span className="code-main">{d.guia_original || d.codigo_guia_original || '--'}</span></td>
                            <td className="px-3 py-2 text-warm-500">{d.operador_nombre}</td>
                            <td className="px-3 py-2 text-warm-400">{d.timestamp ? fmtTime(d.timestamp) : '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab content: Historial */}
            {detailTab === 'historial' && (
              <div className="space-y-3">
                {tarimaLog.length === 0 ? (
                  <div className="p-10 text-center text-sm text-warm-400">{t('fep.detail.noHistorial')}</div>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto scrollbar-thin pr-1">
                    {tarimaLog.map((entry, i) => (
                      <div key={entry.id || i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-1.5 shrink-0">
                          <div className="w-2 h-2 rounded-full bg-primary-400" />
                          {i < tarimaLog.length - 1 && <div className="w-px flex-1 bg-warm-100 mt-1" style={{ minHeight: 20 }} />}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-warm-700">
                              {t(`tarima.log.${entry.action?.toLowerCase()}`)}
                            </span>
                            <span className="text-xs text-warm-400">{fmtDateTime(entry.timestamp)}</span>
                            {entry.usuario_nombre && (
                              <span className="text-xs text-warm-500 flex items-center gap-1">
                                <User className="w-3 h-3" /> {entry.usuario_nombre}
                              </span>
                            )}
                          </div>
                          {entry.details && (
                            <p className="text-xs text-warm-400 mt-0.5">
                              {typeof entry.details === 'string'
                                ? entry.details
                                : Object.values(entry.details).filter(Boolean).join(' · ')}
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

      {/* Delete confirmation modal */}
      <Modal isOpen={!!deletingTarima} onClose={() => setDeletingTarima(null)}
        title={t('history.deleteGuide')} icon={Trash2} size="sm"
        footer={<>
          <button onClick={() => setDeletingTarima(null)} className="btn-ghost">{t('history.cancel')}</button>
          <button
            onClick={() => { deleteMutation.mutate(deletingTarima.id); setDeletingTarima(null) }}
            disabled={deleteMutation.isPending}
            className="btn-danger inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            {deleteMutation.isPending ? t('history.deleting') : t('history.delete')}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-danger-800">{t('history.irreversible')}</p>
              <p className="text-xs text-danger-600 mt-1">{t('history.palletWillBeDeleted')}</p>
            </div>
          </div>
          {deletingTarima && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">{t('history.pallet')}</span>
                <span className="font-mono" style={TARIMA_CODE_STYLE}>{deletingTarima.codigo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">{t('history.company')}</span>
                <span className="text-sm font-semibold text-warm-700">{deletingTarima.empresa_nombre}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">{t('history.guides')}</span>
                <span className="text-sm font-semibold text-warm-700">{deletingTarima.cantidad_guias}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Blocked delete modal — tarima tiene folio activo */}
      <Modal isOpen={!!blockedDeleteTarima} onClose={() => setBlockedDeleteTarima(null)}
        title={t('history.cannotDelete')} icon={AlertTriangle} size="sm"
        footer={
          <button onClick={() => setBlockedDeleteTarima(null)} className="btn-ghost">{t('history.understood')}</button>
        }>
        <div className="p-4 rounded-xl bg-warning-50 border border-warning-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-warning-800">{t('history.palletInActiveFolio')}</p>
            <p className="text-xs text-warning-600 mt-1">
              {t('history.palletInFolioDesc')
                .replace('{codigo}', blockedDeleteTarima?.codigo)
                .replace('{folio}', blockedDeleteTarima?.folio_asignado)}
            </p>
          </div>
        </div>
      </Modal>

      {/* Blocked edit modal — tarima tiene folio activo */}
      <Modal isOpen={!!blockedEditTarima} onClose={() => { setBlockedEditTarima(null); setConfirmingFolioDelete(false) }}
        title="Tarima bloqueada" icon={Lock} size="sm"
        footer={
          confirmingFolioDelete ? (
            <>
              <button onClick={() => setConfirmingFolioDelete(false)} className="btn-ghost" disabled={deleteFolioMutation.isPending}>Cancelar</button>
              <button
                onClick={() => deleteFolioMutation.mutate(blockedEditTarima.folio_id)}
                disabled={deleteFolioMutation.isPending}
                className="btn-danger inline-flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                {deleteFolioMutation.isPending ? 'Eliminando...' : `Confirmar eliminación`}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setBlockedEditTarima(null); setConfirmingFolioDelete(false) }} className="btn-secondary">Cerrar</button>
              {canDeleteFolio && blockedEditTarima?.folio_id && (
                <button
                  onClick={() => setConfirmingFolioDelete(true)}
                  className="btn-danger inline-flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Eliminar folio {blockedEditTarima.folio_asignado}
                </button>
              )}
              {!canDeleteFolio && blockedEditTarima?.folio_id && (
                <button
                  onClick={() => { setBlockedEditTarima(null); navigate(`/DropScan/folios?folio_id=${blockedEditTarima.folio_id}`) }}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-semibold text-sm transition-all">
                  <ArrowRight className="w-4 h-4" />
                  Ir al folio
                </button>
              )}
            </>
          )
        }>
        <div className="space-y-4">
          {confirmingFolioDelete ? (
            <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-danger-800">¿Eliminar el folio {blockedEditTarima?.folio_asignado}?</p>
                <p className="text-xs text-danger-600 mt-1">
                  El folio será eliminado permanentemente y la tarima quedará disponible para edición.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
              <Lock className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-danger-800">Esta tarima está bloqueada por un folio activo</p>
                <p className="text-xs text-danger-600 mt-1">
                  Para editar la tarima debes eliminar el folio <span className="font-bold">{blockedEditTarima?.folio_asignado}</span> primero.
                </p>
              </div>
            </div>
          )}
          {blockedEditTarima && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Tarima</span>
                <span className="font-mono" style={TARIMA_CODE_STYLE}>{blockedEditTarima.codigo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Folio asignado</span>
                <span className="text-sm font-bold text-primary-600">{blockedEditTarima.folio_asignado}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete individual guide confirmation modal */}
      <Modal isOpen={!!deletingGuia} onClose={() => setDeletingGuia(null)}
        title={t('history.deleteGuide')} icon={Trash2} size="sm"
        footer={<>
          <button onClick={() => setDeletingGuia(null)} className="btn-ghost">{t('history.cancel')}</button>
          <button
            onClick={() => {
              deleteGuiaMutation.mutate({ tarimaId: detail.id, guiaId: deletingGuia.id })
              setDeletingGuia(null)
            }}
            disabled={deleteGuiaMutation.isPending}
            className="btn-danger inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            {deleteGuiaMutation.isPending ? t('history.deleting') : t('history.delete')}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-danger-800">¿Estás seguro de eliminar esta guía?</p>
              <p className="text-xs text-danger-600 mt-1">
                La guía será eliminada de la tarima permanentemente. Las posiciones de las demás guías se reordenarán automáticamente.
              </p>
            </div>
          </div>
          {deletingGuia && (
            <div className="p-3 rounded-xl bg-warm-50 border border-warm-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Guía</span>
                <span className="code-main">{deletingGuia.codigo_guia}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Posición</span>
                <span className="text-sm font-semibold text-warm-700">#{deletingGuia.posicion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Operador</span>
                <span className="text-sm font-semibold text-warm-700">{deletingGuia.operador_nombre}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-500 font-medium">Hora escaneo</span>
                <span className="text-sm font-semibold text-warm-700">{fmtTime(deletingGuia.timestamp_escaneo)}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
