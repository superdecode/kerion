import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ScanBarcode, CheckCircle2, XCircle, AlertCircle,
  Layers, PackageCheck, X, Square, ArrowUp, ArrowDown, ArrowUpDown, Trash2,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { getOrder, createSession, updateSession, scanCode, deleteLastValidationRecord } from '../services/recepcionService'

const RESULT_CFG = {
  correcto:      { bg: 'bg-success-50/90 border-success-200', icon: CheckCircle2, iconCls: 'text-success-500', label: 'text-success-600' },
  duplicado:     { bg: 'bg-warning-50/90 border-warning-200', icon: AlertCircle,  iconCls: 'text-warning-500', label: 'text-warning-600' },
  no_encontrado: { bg: 'bg-danger-50/90  border-danger-200',  icon: XCircle,      iconCls: 'text-danger-500',  label: 'text-danger-600'  },
}

export default function ValidacionRecepcion() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18nStore()
  const toast = useToastStore()
  const qc = useQueryClient()

  const scanRef = useRef(null)
  const [sessionId, setSessionId] = useState(null)
  const [withTarimas, setWithTarimas] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [history, setHistory] = useState([])
  const [scanning, setScanning] = useState(true)
  const [bootingSession, setBootingSession] = useState(true)
  const [historySortKey, setHistorySortKey] = useState('scannedAt')
  const [historySortDir, setHistorySortDir] = useState('desc')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const { data: orderData, isLoading } = useQuery({
    queryKey: ['recepcion-order', id],
    queryFn: () => getOrder(id),
    refetchInterval: scanning ? 4000 : false,
  })

  const order  = orderData?.order  ?? null
  const lines  = orderData?.lines  ?? []
  const totalFromOrder = Number(order?.total_cajas || 0)
  const totalFromLines = lines.length
  const total = Math.max(totalFromOrder, totalFromLines)
  const validadasFromLines = lines.filter((l) => l.estado_validacion === 'validada').length
  const validadasFromOrder = Number(order?.cajas_validadas || 0)
  const validadas = Math.max(validadasFromLines, validadasFromOrder)
  const faltantes = lines.filter((l) => l.estado_validacion === 'faltante').length
  const pendientes = Math.max(total - validadas - faltantes, 0)
  const progressPct = total > 0 ? Math.min(100, Math.round((validadas / total) * 100)) : 0

  const refocus = useCallback(() => {
    setTimeout(() => scanRef.current?.focus(), 80)
  }, [])

  useEffect(() => { if (scanning) refocus() }, [scanning, refocus])

  useEffect(() => {
    let cancelled = false

    async function bootstrapSession() {
      try {
        const res = await createSession(id)
        if (cancelled) return
        setSessionId(res.session?.id ?? 'local')
        setScanning(true)
        refocus()
      } catch {
        if (!cancelled) toast.error('Error al iniciar sesión de validación')
      } finally {
        if (!cancelled) setBootingSession(false)
      }
    }

    bootstrapSession()
    return () => { cancelled = true }
  }, [id, refocus, toast])

  const startSession = async () => {
    try {
      const res = await createSession(id)
      setSessionId(res.session?.id ?? 'local')
      setScanning(true)
      refocus()
    } catch {
      toast.error('Error al iniciar sesión de validación')
    }
  }

  const endSession = async () => {
    if (sessionId && sessionId !== 'local') {
      try { await updateSession(id, sessionId) } catch { /* best-effort */ }
    }
    setSessionId(null)
    setScanning(false)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] }),
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] }),
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] }),
    ])
    navigate(`/recepcion/recibir/${id}`)
  }

  const scanMut = useMutation({
    mutationFn: (codigo) => scanCode(id, { codigo_escaneado: codigo, session_id: sessionId, tarimas_enabled: withTarimas }),
    onSuccess: (data) => {
      const ev = data.event
      setLastResult({ result: ev.resultado, code: ev.codigo_escaneado, sku: ev.sku_asociado })
      if (ev.resultado === 'correcto') {
        setHistory(prev => [{
          id: ev.id,
          result: ev.resultado,
          code: ev.codigo_escaneado,
          sku: ev.sku_asociado,
          scannedAt: ev.scanned_at,
          scannedBy: ev.scanned_by_nombre || '—',
        }, ...prev.slice(0, 49)])
      }
      if (ev.resultado === 'correcto' && data.line) {
        qc.setQueryData(['recepcion-order', id], (current) => {
          if (!current) return current
          const nextLines = (current.lines || []).map((line) => (
            line.id === data.line.id
              ? {
                  ...line,
                  estado_validacion: 'validada',
                  validated_at: ev.scanned_at,
                  validated_by_nombre: ev.scanned_by_nombre || line.validated_by_nombre,
                }
              : line
          ))
          return {
            ...current,
            order: {
              ...current.order,
              cajas_validadas: data.cajas_validadas ?? current.order?.cajas_validadas ?? 0,
              estado: data.estado || current.order?.estado,
            },
            lines: nextLines,
          }
        })

        qc.setQueryData(['recepcion-orders'], (current) => current)
      }
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = ev.resultado === 'correcto' ? 880 : ev.resultado === 'duplicado' ? 440 : 220
        gain.gain.value = ev.resultado === 'no_encontrado' ? 0.2 : 0.15
        osc.start(); osc.stop(ctx.currentTime + 0.12)
      } catch { /* audio not available */ }
    },
    onError: () => toast.error('Error al procesar escaneo'),
    onSettled: () => refocus(),
  })

  const deleteLastMut = useMutation({
    mutationFn: () => deleteLastValidationRecord(id),
    onSuccess: (data) => {
      setHistory((prev) => prev.filter((item) => item.id !== data.removedEvent?.id))
      qc.setQueryData(['recepcion-order', id], (current) => {
        if (!current) return current
        const nextLines = (current.lines || []).map((line) => (
          line.id === data.lineId
            ? { ...line, estado_validacion: 'pendiente', validated_at: null, validated_by_nombre: null }
            : line
        ))
        return {
          ...current,
          order: {
            ...current.order,
            cajas_validadas: data.cajas_validadas ?? current.order?.cajas_validadas ?? 0,
            estado: data.estado || current.order?.estado,
          },
          lines: nextLines,
        }
      })
      qc.invalidateQueries({ queryKey: ['recepcion-order', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-scan-events', id] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      toast.success('Último registro de validación eliminado')
      setConfirmDeleteOpen(false)
      refocus()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar último registro'),
  })

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      scanMut.mutate(e.target.value.trim())
      e.target.value = ''
    }
  }

  const handleHistorySort = (key) => {
    if (historySortKey === key) setHistorySortDir((dir) => dir === 'asc' ? 'desc' : 'asc')
    else {
      setHistorySortKey(key)
      setHistorySortDir(key === 'scannedAt' ? 'desc' : 'asc')
    }
  }

  const sortedHistory = [...history].sort((a, b) => {
    const av = a?.[historySortKey] ?? ''
    const bv = b?.[historySortKey] ?? ''
    let cmp = 0
    if (historySortKey === 'scannedAt') cmp = new Date(av).getTime() - new Date(bv).getTime()
    else cmp = String(av).localeCompare(String(bv), 'es')
    return historySortDir === 'asc' ? cmp : -cmp
  })

  if (isLoading || bootingSession || !order) return (
    <div className="flex flex-col h-full">
      <Header title="Validación" icon={PackageCheck} />
      <div className="flex-1 flex items-center justify-center text-warm-400 text-sm">{t('common.loading')}</div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-warm-50 overflow-hidden">
      <Header
        title={
          <div className="flex items-center gap-3">
            <button
              onClick={endSession}
              className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono font-black text-base text-warm-900 leading-none truncate">{order.folio}</span>
              {order.cliente && (
                <span className="text-sm text-warm-400 truncate hidden sm:inline">· {order.cliente}</span>
              )}
            </div>
          </div>
        }
        icon={PackageCheck}
        actions={
          scanning ? (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <div
                  onClick={() => setWithTarimas(p => !p)}
                  className={`relative w-8 h-4 rounded-full transition-colors ${withTarimas ? 'bg-sky-500' : 'bg-warm-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${withTarimas ? 'translate-x-4' : ''}`} />
                </div>
                <Layers className={`w-3.5 h-3.5 ${withTarimas ? 'text-sky-600' : 'text-warm-400'}`} />
                <span className="text-xs text-warm-600 hidden sm:inline">{t('rec.tarimas.toggle')}</span>
              </label>
              <button
                onClick={endSession}
                className="btn-ghost flex items-center gap-1.5 text-sm text-danger-600 border-danger-200 hover:bg-danger-50"
              >
                <Square className="w-3.5 h-3.5" />
                {t('rec.scan.terminar')}
              </button>
            </div>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 max-w-4xl mx-auto space-y-4 w-full">

          {/* Order progress card */}
          <motion.div
            className="card p-4 shadow-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                <PackageCheck className="w-5 h-5 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-warm-900 font-mono text-lg leading-none truncate">{order.folio}</p>
                {order.cliente && <p className="text-xs text-warm-500 mt-0.5 truncate">{order.cliente}</p>}
                {order.tracking_no && (
                  <p className="text-[10px] font-mono text-warm-400 mt-0.5 truncate">{order.tracking_no}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-4xl font-black text-warm-900 tabular-nums leading-none">{validadas}</p>
                <p className="text-xs font-medium text-warm-400">/{total}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative w-full h-2.5 bg-warm-100 rounded-full overflow-hidden shadow-inner mb-2">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
                  progressPct >= 100 ? 'bg-gradient-to-r from-success-400 to-success-500' :
                  progressPct >= 80  ? 'bg-gradient-to-r from-primary-400 to-sky-500' :
                  'bg-gradient-to-r from-sky-500 to-primary-500'
                } ${progressPct > 0 ? 'min-w-[8px]' : ''}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Counters */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: t('rec.total_cajas'),     value: total,      cls: 'text-warm-700' },
                { label: t('rec.cajas_validadas'),  value: validadas,  cls: 'text-success-700' },
                { label: t('rec.cajas_pendientes'), value: pendientes, cls: 'text-warm-500' },
                { label: t('rec.cajas_error'),      value: faltantes,  cls: 'text-danger-600' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="text-center rounded-xl border border-warm-100 bg-warm-50 py-2 px-1">
                  <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
                  <p className="text-[9px] text-warm-400 font-semibold uppercase tracking-wide mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>

            {progressPct >= 100 && (
              <div className="mt-3 flex items-center gap-2 bg-success-50 border border-success-200 text-success-700 rounded-xl px-3 py-2 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {t('rec.status.completo')} — todas las cajas validadas
              </div>
            )}
          </motion.div>

          {scanning ? (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              {/* Scan input */}
              <div className="relative">
                <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-warm-300" />
                <input
                  ref={scanRef}
                  type="text"
                  className="w-full pl-14 pr-5 py-4 text-xl bg-white border-2 border-warm-200 rounded-2xl
                    focus:border-primary-500 focus:shadow-glow
                    transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                  placeholder={t('rec.scan.placeholder') || 'Escanear código...'}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="none"
                />
              </div>
              <p className="text-center text-[11px] text-warm-400">{t('rec.scan.enter_hint')}</p>

              {/* Last scan feedback */}
              <AnimatePresence mode="wait">
                {lastResult && (() => {
                  const cfg = RESULT_CFG[lastResult.result] || RESULT_CFG.no_encontrado
                  const Icon = cfg.icon
                  return (
                    <motion.div
                      key={lastResult.code + lastResult.result}
                      initial={{ opacity: 0, y: -10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className={`p-4 rounded-2xl flex items-center gap-3 border backdrop-blur-sm ${cfg.bg}`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${cfg.iconCls}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-warm-400">Último escaneo</p>
                        <p className="font-mono font-bold text-warm-800 truncate">{lastResult.code}</p>
                        {lastResult.sku && <p className="text-xs text-warm-500 font-mono">SKU: {lastResult.sku}</p>}
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${cfg.label}`}>
                        {lastResult.result === 'correcto'      ? 'Correcto' :
                         lastResult.result === 'duplicado'     ? 'Duplicado' : 'No encontrado'}
                      </span>
                    </motion.div>
                  )
                })()}
              </AnimatePresence>

              {/* Scan history */}
              {history.length > 0 && (
                <div className="card overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 border-b border-warm-100 bg-warm-50 flex items-center justify-between">
                    <p className="text-xs font-bold text-warm-600 uppercase tracking-wide">Registro de escaneos</p>
                    <button
                      onClick={() => setHistory([])}
                      className="text-[11px] text-warm-400 hover:text-warm-600 flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3 h-3" /> Limpiar
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full min-w-[920px] text-xs table-fixed">
                      <colgroup>
                        <col style={{ width: '4rem' }} />
                        <col style={{ width: '22rem' }} />
                        <col style={{ width: '12rem' }} />
                        <col style={{ width: '12rem' }} />
                        <col style={{ width: '14rem' }} />
                        <col style={{ width: '4.5rem' }} />
                      </colgroup>
                      <thead className="bg-warm-50 sticky top-0 border-b border-warm-100">
                        <tr>
                          <th className="table-header">#</th>
                          {[
                            ['code', 'Código'],
                            ['sku', 'SKU'],
                            ['scannedBy', 'Usuario'],
                            ['scannedAt', 'Fecha y hora'],
                          ].map(([key, label]) => (
                            <th key={key} className="table-header">
                              <button
                                type="button"
                                onClick={() => handleHistorySort(key)}
                                className="inline-flex items-center gap-1 hover:text-primary-700 transition-colors"
                              >
                                {label}
                                {historySortKey === key
                                  ? historySortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                                  : <ArrowUpDown size={10} className="opacity-40" />}
                              </button>
                            </th>
                          ))}
                          <th className="table-header text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-50">
                        {sortedHistory.map((h, i) => (
                          <tr key={h.id || i} className="hover:bg-warm-50/50">
                            <td className="px-3 py-2 text-warm-400 tabular-nums">{sortedHistory.length - i}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-warm-800 truncate" title={h.code}>{h.code}</td>
                            <td className="px-3 py-2 text-warm-500 font-mono truncate" title={h.sku || '—'}>{h.sku || '—'}</td>
                            <td className="px-3 py-2 text-warm-600 truncate" title={h.scannedBy || '—'}>{h.scannedBy || '—'}</td>
                            <td className="px-3 py-2 text-warm-500 whitespace-nowrap">{h.scannedAt ? new Date(h.scannedAt).toLocaleString('es-MX') : '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOpen(true)}
                                disabled={i !== 0 || deleteLastMut.isPending}
                                className="inline-flex rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-30"
                                title="Eliminar último registro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          ) : null}
        </div>
      </div>

      <Modal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Eliminar último registro"
        icon={AlertCircle}
        size="md"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setConfirmDeleteOpen(false)} className="btn-ghost">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => deleteLastMut.mutate()}
              disabled={deleteLastMut.isPending}
              className="btn-danger disabled:opacity-50"
            >
              {deleteLastMut.isPending ? t('common.loading') : 'Confirmar'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-warm-700">
          Se eliminará el último registro correcto de validación y la caja volverá a estado pendiente.
        </p>
      </Modal>
    </div>
  )
}
