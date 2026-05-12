import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import {
  startSession, closeSession, getActiveSession, scanBarcode, getSessionScans
} from '../services/inventoryService'
import {
  ScanBarcode, Play, Square, CheckCircle, XCircle, AlertTriangle,
  Package, MapPin, Hash, Boxes
} from 'lucide-react'

/* ── session timer ── */
function useSessionTimer(startTime) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) { setElapsed(0); return }
    const t0 = new Date(startTime).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - t0) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime])
  return elapsed
}

const fmtElapsed = (s) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
    : `${m}:${String(ss).padStart(2,'0')}`
}

const STATUS_META = {
  OK:        { label: 'OK',         color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle },
  Bloqueado: { label: 'Bloqueado',  color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    icon: AlertTriangle },
  NoWMS:     { label: 'No en WMS',  color: 'text-red-600',     bg: 'bg-red-50 border-red-200',        icon: XCircle },
}

export default function InvEscaneo() {
  const { t } = useI18nStore()
  const { canWrite } = useAuthStore()
  const canScan = canWrite('inventory.escaneo')
  const toast = useToastStore()
  const queryClient = useQueryClient()
  const inputRef = useRef(null)

  const [barcodeInput, setBarcodeInput] = useState('')
  const [lastScan, setLastScan] = useState(null)

  // Fetch active session on mount
  const { data: activeData, isLoading: sessionLoading } = useQuery({
    queryKey: ['inv-active-session'],
    queryFn: getActiveSession,
    retry: false,
  })
  const session = activeData?.session || null
  const elapsed = useSessionTimer(session?.started_at)

  // Scans list for active session
  const { data: scansData } = useQuery({
    queryKey: ['inv-scans', session?.id],
    queryFn: () => getSessionScans(session.id),
    enabled: !!session?.id,
    refetchInterval: false,
  })
  const scans = scansData?.scans || []

  // Mutations
  const startMutation = useMutation({
    mutationFn: () => startSession(),
    onSuccess: () => {
      queryClient.invalidateQueries(['inv-active-session'])
      toast.success('Sesión iniciada')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error iniciando sesión'),
  })

  const closeMutation = useMutation({
    mutationFn: () => closeSession(session.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['inv-active-session'])
      queryClient.invalidateQueries(['inv-scans'])
      setLastScan(null)
      toast.success('Sesión cerrada')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error cerrando sesión'),
  })

  const scanMutation = useMutation({
    mutationFn: (barcode) => scanBarcode({ session_id: session.id, barcode }),
    onSuccess: ({ scan }) => {
      setLastScan(scan)
      queryClient.invalidateQueries(['inv-scans', session?.id])
      setBarcodeInput('')
      inputRef.current?.focus()
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Error procesando escaneo')
      setBarcodeInput('')
      inputRef.current?.focus()
    },
  })

  // Auto-focus input when session is active
  useEffect(() => {
    if (session && inputRef.current) inputRef.current.focus()
  }, [session])

  const handleScan = useCallback((e) => {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code || !session) return
    scanMutation.mutate(code)
  }, [barcodeInput, session, scanMutation])

  // Count by status
  const counts = scans.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('inventory.title') || 'Escaneo de Inventario'}
        subtitle={t('inventory.subtitle') || 'Escanea y valida el inventario en WMS'}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Session controls */}
        <div className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-5 shadow-sm flex items-center gap-4">
          {session ? (
            <>
              <div className="flex-1">
                <p className="text-xs font-semibold text-warm-500 mb-0.5">Sesión activa</p>
                <p className="text-2xl font-bold text-primary-700 font-mono">{fmtElapsed(elapsed)}</p>
              </div>
              <div className="flex gap-3 text-sm text-warm-600">
                <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-500" />{counts.OK || 0} OK</span>
                <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" />{counts.Bloqueado || 0}</span>
                <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-red-400" />{counts.NoWMS || 0}</span>
              </div>
              {canScan && (
                <button
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200
                    text-red-600 hover:bg-red-100 text-sm font-semibold transition disabled:opacity-50"
                >
                  <Square className="w-4 h-4" />
                  {t('inventory.session.close') || 'Cerrar sesión'}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex-1">
                <p className="text-sm text-warm-500">
                  {sessionLoading ? 'Cargando...' : 'No hay sesión activa'}
                </p>
              </div>
              {canScan && (
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending || sessionLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700
                    text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {t('inventory.session.start') || 'Iniciar sesión'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Barcode input */}
        {session && canScan && (
          <form onSubmit={handleScan} className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-5 shadow-sm">
            <label className="block text-xs font-semibold text-warm-600 mb-2">
              <ScanBarcode className="w-3.5 h-3.5 inline mr-1.5" />
              {t('inventory.scan.barcode') || 'Código de barras'}
            </label>
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Escanea o escribe el código..."
                autoComplete="off"
                className="flex-1 px-4 py-3 rounded-xl border border-warm-200 bg-white text-sm
                  focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition"
              />
              <button
                type="submit"
                disabled={!barcodeInput.trim() || scanMutation.isPending}
                className="px-5 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm
                  font-semibold transition disabled:opacity-40"
              >
                Escanear
              </button>
            </div>
          </form>
        )}

        {/* Last scan result */}
        <AnimatePresence>
          {lastScan && (
            <motion.div
              key={lastScan.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`rounded-2xl border p-5 ${STATUS_META[lastScan.status]?.bg}`}
            >
              <div className="flex items-start gap-3">
                {(() => {
                  const meta = STATUS_META[lastScan.status]
                  const Icon = meta?.icon || Package
                  return <Icon className={`w-6 h-6 flex-shrink-0 mt-0.5 ${meta?.color}`} />
                })()}
                <div className="flex-1">
                  <p className={`text-base font-bold ${STATUS_META[lastScan.status]?.color}`}>
                    {lastScan.barcode}
                  </p>
                  <p className={`text-sm font-semibold mt-0.5 ${STATUS_META[lastScan.status]?.color}`}>
                    {STATUS_META[lastScan.status]?.label}
                  </p>
                  {lastScan.product_name && (
                    <div className="mt-2 space-y-1 text-xs text-warm-600">
                      <p className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />{lastScan.product_name}</p>
                      {lastScan.sku && <p className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />{lastScan.sku}</p>}
                      {lastScan.cell_no && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{lastScan.cell_no}</p>}
                      <p className="flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5" />Stock: {lastScan.available_stock ?? '—'}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scans table */}
        {scans.length > 0 && (
          <div className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-warm-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-warm-700">Escaneos de esta sesión</p>
              <span className="text-xs text-warm-400">{scans.length} registros</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-100 text-xs text-warm-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Código</th>
                    <th className="px-5 py-3 text-left">SKU</th>
                    <th className="px-5 py-3 text-left">Producto</th>
                    <th className="px-5 py-3 text-left">Ubicación</th>
                    <th className="px-5 py-3 text-left">Stock</th>
                    <th className="px-5 py-3 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => {
                    const meta = STATUS_META[scan.status]
                    return (
                      <tr key={scan.id} className="border-b border-warm-50 hover:bg-warm-50/50 transition">
                        <td className="px-5 py-3 font-mono text-xs">{scan.barcode}</td>
                        <td className="px-5 py-3 text-warm-600">{scan.sku || '—'}</td>
                        <td className="px-5 py-3 text-warm-700">{scan.product_name || '—'}</td>
                        <td className="px-5 py-3 text-warm-600">{scan.cell_no || '—'}</td>
                        <td className="px-5 py-3 text-warm-700">{scan.available_stock ?? '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold
                            ${meta?.bg} ${meta?.color}`}>
                            {meta?.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
