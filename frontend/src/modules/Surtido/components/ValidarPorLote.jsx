import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, PackageX, AlertTriangle, ChevronDown } from 'lucide-react'
import ScanInputBar from '../../Shared/Wms/ScanInputBar'
import { playSound, initAudio } from '../../Shared/Wms/playSound'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useOfflineStore } from '../../../core/stores/offlineStore'
import { normalizeScanCode } from '../../Shared/Wms/normalizeCode'
import { refreshSheet } from '../../WmsHub/services/googleSheetsService'
import {
  getOutboundBatchByDate, commitPickBatch, getOrdersValidationState, reportPickRejection,
} from '../services/surtidoService'
import { buildLotePool } from '../utils/lotePool'
import { useLoteDraft } from '../hooks/useLoteDraft'
import LoteResumenCards from './LoteResumenCards'
import LoteUbicacionGate from './LoteUbicacionGate'
import LoteTarimaPanel from './LoteTarimaPanel'
import LoteResultBar from './LoteResultBar'
import LoteRechazosPanel from './LoteRechazosPanel'
import LotePoolSidebar from './LotePoolSidebar'
import LoteForzarFechaModal from './LoteForzarFechaModal'
import LoteConfirmarModal from './LoteConfirmarModal'

const RESULT_BAR_MS = 10_000

// Razones que sí se registran para trazabilidad — un duplicado sigue siendo
// una caja real de la orden, así que también cuenta como algo a revisar.
const REJECTION_REASONS = new Set(['not_found', 'ambiguous', 'already_validated', 'duplicate'])

export default function ValidarPorLote({ tabId, fecha, isActive, onSessionChange, onCloseTab }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const hasPermission = useAuthStore(s => s.hasPermission)
  const isOffline = useOfflineStore(s => s.status === 'offline')

  const scanRef = useRef(null)
  const [forzarModal, setForzarModal] = useState(null)
  const [confirmarModal, setConfirmarModal] = useState(null)
  const [notes, setNotes] = useState('')
  // En desktop el panel de órdenes vive "en flujo" y arranca visible; en
  // pantallas <lg pasa a ser un bottom sheet (ver LotePoolSidebar) que
  // taparía el escaneo si arrancara abierto, así que ahí arranca cerrado.
  const [sidebarVisible, setSidebarVisible] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches
  )
  const [rechazosAbiertos, setRechazosAbiertos] = useState(false)
  const [ultimoResultado, setUltimoResultado] = useState(null)
  const resultTimerRef = useRef(null)

  const permission = hasPermission('surtido.validacion', 'eliminar') ? 'eliminar' : 'crear'
  const canCreate = hasPermission('surtido.validacion', 'crear')
  const operadorNombre = user?.nombre_completo || user?.email || ''

  // Un 503/red caída a mitad de carga no debe traducirse en "no hay órdenes
  // hoy": el operador seguiría escaneando contra un pool vacío y cada caja
  // real le saldría "no encontrada". Dos reintentos con backoff cubren un
  // hipo transitorio del backend; si de verdad está caído, isError lo dice.
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['surtido-lote-pool', fecha],
    queryFn: () => getOutboundBatchByDate(fecha),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  })

  const pool = useMemo(
    () => buildLotePool(data?.data?.orders ?? [], fecha),
    [data, fecha]
  )

  // Estado real de cada orden del pool: cuáles ya se validaron (por orden o
  // por lote). Sin esto el operador escanearía cajas que el commit rechazaría.
  const obcs = useMemo(() => pool.orders.map(o => o.outboundOrderNo), [pool])
  const { data: estadoData } = useQuery({
    queryKey: ['surtido-lote-estado', fecha, obcs.length],
    queryFn: () => getOrdersValidationState(obcs),
    enabled: obcs.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const validatedOrders = useMemo(
    () => new Set((estadoData?.data ?? []).filter(o => o.locked).map(o => o.outbound_order_no)),
    [estadoData]
  )
  // Conteos reales (total_scanned/total_expected) de una orden que ya se
  // validó en otra sesión — el panel los usa en vez del progreso de este
  // borrador, que para esas órdenes siempre está vacío.
  const validationSnapshots = useMemo(
    () => new Map((estadoData?.data ?? []).filter(o => o.locked).map(o => [o.outbound_order_no, o])),
    [estadoData]
  )

  const lote = useLoteDraft({
    tabId, dateKey: fecha, pool, operatorId: user?.id, permission, validatedOrders,
  })

  const ubicacionPorTarima = useMemo(
    () => new Map(lote.draft.tarimas.filter(tar => tar.ubicacionNota).map(tar => [tar.ref, tar.ubicacionNota])),
    [lote.draft.tarimas]
  )

  const ordenesConEscaneos = useMemo(
    () => new Set(lote.draft.scans.filter(s => s.result === 'ok' && s.orderNo).map(s => s.orderNo)).size,
    [lote.draft.scans]
  )
  const summaryExtendido = { ...lote.summary, ordenesConEscaneos }

  useEffect(() => {
    if (!isActive) return
    const handler = () => initAudio()
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [isActive])

  useEffect(() => () => { if (resultTimerRef.current) clearTimeout(resultTimerRef.current) }, [])

  const focusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus())
  }, [])

  const mostrarResultado = useCallback((outcome) => {
    setUltimoResultado({ ...outcome, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
    resultTimerRef.current = setTimeout(() => setUltimoResultado(null), RESULT_BAR_MS)
  }, [])

  // Un rechazo se manda al servidor apenas ocurre — no espera a que el lote se
  // confirme, así que sobrevive aunque el operador cancele todo el borrador.
  const registrarRechazo = useCallback((outcome, tarimaRef) => {
    if (!REJECTION_REASONS.has(outcome.result)) return
    reportPickRejection({
      fecha_lote: fecha,
      scanned_code: outcome.code,
      normalized_code: normalizeScanCode(outcome.code) || outcome.code,
      reason: outcome.result,
      related_order_no: outcome.orderNo || null,
      tarima_ref: tarimaRef,
    })
  }, [fecha])

  const aplicarOutcome = useCallback((outcome) => {
    if (outcome.result === 'ok') {
      playSound('success')
    } else if (outcome.result === 'duplicate') {
      playSound('duplicate')
    } else {
      playSound('error')
    }
    mostrarResultado(outcome)
    registrarRechazo(outcome, lote.draft.activeTarimaRef)
    focusScan()
  }, [focusScan, mostrarResultado, registrarRechazo, lote.draft.activeTarimaRef])

  const handleScan = useCallback((rawCode) => {
    if (!canCreate) return
    const outcome = lote.scan(rawCode)
    if (outcome.result === 'needs_force') {
      playSound('suspicious')
      setForzarModal({ ...outcome, rawCode })
      return
    }
    aplicarOutcome(outcome)
  }, [canCreate, lote, aplicarOutcome])

  function confirmarForzado() {
    const pendiente = forzarModal
    setForzarModal(null)
    if (!pendiente) return
    aplicarOutcome(lote.forceScan(pendiente.rawCode))
  }

  function handleSetUbicacion(ubicacion) {
    const error = lote.setUbicacion(ubicacion)
    if (!error) {
      playSound('complete')
      focusScan()
      return null
    }
    playSound('error')
    return error.summary || t('surtido.lote.tarima.ubicacionInvalida')
  }

  function handleNextTarima() {
    const error = lote.nextTarima()
    if (error === 'sin_escaneos') {
      toast.warning(t('surtido.lote.tarima.sinEscaneos'))
    }
  }

  // Encola el commit en la cola offline genérica (misma que usan
  // recepcion/despacho/inventario): sobrevive a un refresh o apagón porque
  // vive en localStorage, y se reenvía sola en cuanto ConnectionBanner
  // detecta que volvió la red. Solo entonces se limpia el borrador local —
  // el payload ya quedó respaldado en la cola, así que no se pierde nada.
  function encolarCommit() {
    useOfflineStore.getState().enqueueModule({ type: 'lote_commit', payload: lote.commitPayload(notes) })
    toast.success(t('surtido.lote.confirmar.encolado'))
    setConfirmarModal(null)
    setNotes('')
    lote.cancelDraft()
  }

  const { mutate: doCommit, isPending: isCommitting } = useMutation({
    mutationFn: () => commitPickBatch(lote.commitPayload(notes)),
    onSuccess: (res) => {
      const loteNumero = res?.data?.batch?.lote_numero || ''
      toast.success(t('surtido.lote.confirmar.exito').replace('{lote}', loteNumero))
      setConfirmarModal(null)
      setNotes('')
      lote.cancelDraft()
      qc.invalidateQueries({ queryKey: ['surtido-scan-sessions'] })
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
    },
    // El borrador NO se borra en un error del servidor (ej. ya validado por
    // otro operador): el operador tiene que revisar y decidir. Pero si la
    // petición nunca llegó al servidor (red caída a media confirmación,
    // err.response viene vacío), no tiene sentido bloquear al operador — se
    // encola para reenvío automático, igual que si hubiera confirmado offline.
    onError: (err) => {
      if (!err?.response) {
        encolarCommit()
        return
      }
      const data = err.response.data
      if (data?.code === 'ORDERS_ALREADY_VALIDATED') {
        const obcsEnConflicto = (data.details?.orders ?? []).map(o => o.outbound_order_no).join(', ')
        toast.error(`${t('surtido.lote.confirmar.yaValidadas')} ${obcsEnConflicto}`)
        // El estado del pool quedó viejo: se refresca para bloquear esas cajas.
        qc.invalidateQueries({ queryKey: ['surtido-lote-estado'] })
        return
      }
      toast.error(data?.error || t('surtido.lote.confirmar.error'))
    },
  })

  // Sin red no se bloquea al operador: puede confirmar igual y el lote se
  // encola para enviarse solo en cuanto vuelva la conexión (ver encolarCommit).
  function abrirConfirmacion() {
    setConfirmarModal('confirmar')
  }

  async function handleRefreshSheet() {
    await refreshSheet('outbound')
    refetch()
  }

  // Los botones de operación (cancelar/confirmar/panel) viven en la cabecera
  // compartida de la página — no en una barra propia de este componente. Mismo
  // mecanismo que ya usa TabSession para el modo por orden (onSessionChange).
  useEffect(() => {
    if (!onSessionChange) return
    if (!isActive || pool.orders.length === 0) { onSessionChange(null); return }
    onSessionChange({
      kind: 'por_lote',
      fecha,
      isOffline,
      // Disponible siempre que haya una sesión de lote abierta — igual que el
      // botón Cancelar del modo por orden, que no depende de haber escaneado
      // nada: sirve para abandonar la operación completa en cualquier momento.
      canCancel: canCreate,
      onCancel: () => setConfirmarModal('cancelar'),
      // Offline ya no bloquea: abrirConfirmacion encola el envío para cuando
      // vuelva la red (ver encolarCommit).
      canConfirm: canCreate && lote.summary.cajasValidadas > 0,
      onConfirm: abrirConfirmacion,
      panelCount: pool.orders.length,
      panelVisible: sidebarVisible,
      onTogglePanel: () => setSidebarVisible(v => !v),
    })
  }, [
    onSessionChange, isActive, pool.orders.length, fecha, isOffline,
    lote.summary.cajasValidadas, canCreate, sidebarVisible,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner />
        <p className="text-xs text-warm-500">{t('surtido.lote.cargando')}</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-danger-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-danger-400" />
        </div>
        <h2 className="text-base font-bold text-warm-800 mb-1">{t('surtido.lote.error.title')}</h2>
        <p className="text-xs text-warm-500 max-w-sm leading-relaxed mb-4">{t('surtido.lote.error.desc')}</p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary inline-flex items-center gap-2 text-sm disabled:opacity-40"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          {t('surtido.lote.vacio.refrescar')}
        </button>
      </div>
    )
  }

  if (pool.orders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mb-4">
          <PackageX className="w-8 h-8 text-warm-400" />
        </div>
        <h2 className="text-base font-bold text-warm-800 mb-1">{t('surtido.lote.vacio.title')}</h2>
        <p className="text-xs text-warm-500 max-w-sm leading-relaxed mb-4">{t('surtido.lote.vacio.desc')}</p>
        <button
          onClick={handleRefreshSheet}
          disabled={isFetching}
          className="btn-secondary inline-flex items-center gap-2 text-sm disabled:opacity-40"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          {t('surtido.lote.vacio.refrescar')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0">
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 space-y-3">
          {/* Fecha del lote — la pestaña ya lleva el mismo dato; esto solo lo
              confirma sin repetir la cabecera de la página. */}
          <p className="text-[11px] font-semibold text-warm-500">
            {t('surtido.lote.borrador')} · <span className="font-mono text-warm-600">{fecha}</span>
          </p>

          <LoteResumenCards summary={lote.summary} />

          {!lote.activeTarimaHasUbicacion ? (
            <LoteUbicacionGate
              tarimaRef={lote.draft.activeTarimaRef}
              onConfirm={handleSetUbicacion}
              isActive={isActive}
            />
          ) : (
            <>
              <ScanInputBar
                inputRef={scanRef}
                onSubmit={handleScan}
                placeholder={t('surtido.lote.scan.placeholder')}
                buttonLabel={t('surtido.lote.scan.boton')}
                disabled={!canCreate}
              />
              <LoteResultBar
                result={ultimoResultado}
                canUndo={Boolean(ultimoResultado) && lote.canRemoveScanById(ultimoResultado.scanId)}
                onUndo={() => { lote.removeScanById(ultimoResultado.scanId); setUltimoResultado(null); focusScan() }}
              />
            </>
          )}

          <LoteTarimaPanel
            draft={lote.draft}
            onNextTarima={handleNextTarima}
            onRemoveTarima={lote.removeTarimaByRef}
            canRemoveTarima={lote.canRemoveTarimaByRef}
          />

          <div className="card overflow-hidden">
            <button
              onClick={() => setRechazosAbiertos(v => !v)}
              className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-warm-50 transition-colors"
            >
              <AlertTriangle size={13} className="text-danger-500 shrink-0" />
              <span className="text-xs font-semibold text-warm-600">{t('surtido.lote.tabs.rechazos')}</span>
              {lote.rejected.length > 0 && (
                <span className="badge text-[10px] font-bold bg-danger-100 text-danger-700">{lote.rejected.length}</span>
              )}
              <ChevronDown size={13} className={`ml-auto text-warm-400 transition-transform ${rechazosAbiertos ? 'rotate-180' : ''}`} />
            </button>
            {rechazosAbiertos && (
              <div className="border-t border-warm-100">
                <LoteRechazosPanel rejected={lote.rejected} />
              </div>
            )}
          </div>
        </div>

        <LotePoolSidebar
          pool={pool}
          progress={lote.progress}
          visible={sidebarVisible}
          onToggle={() => setSidebarVisible(v => !v)}
          operadorNombre={operadorNombre}
          ubicacionPorTarima={ubicacionPorTarima}
          validatedOrders={validatedOrders}
          validationSnapshots={validationSnapshots}
          canRemoveScanById={lote.canRemoveScanById}
          onRemoveScan={lote.removeScanById}
        />
      </div>

      <LoteForzarFechaModal
        isOpen={Boolean(forzarModal)}
        outcome={forzarModal}
        onConfirm={confirmarForzado}
        onCancel={() => { setForzarModal(null); focusScan() }}
      />

      <LoteConfirmarModal
        isOpen={Boolean(confirmarModal)}
        mode={confirmarModal ?? 'confirmar'}
        summary={summaryExtendido}
        notes={notes}
        onNotesChange={setNotes}
        isPending={isCommitting}
        onClose={() => setConfirmarModal(null)}
        onConfirm={() => {
          if (confirmarModal === 'cancelar') {
            setNotes('')
            setConfirmarModal(null)
            // Cancelar borra el borrador y cierra la pestaña — no deja una
            // sesión "vacía" abierta que el operador tendría que cerrar
            // aparte, y evita que los botones de la cabecera queden
            // huérfanos apuntando a un lote que ya no existe.
            if (onCloseTab) onCloseTab()
            else lote.cancelDraft()
            return
          }
          if (isOffline) {
            encolarCommit()
            return
          }
          doCommit()
        }}
      />
    </div>
  )
}
