import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Layers, CheckCircle2, XCircle, AlertCircle, Trash2, RefreshCw, PackageX, X,
} from 'lucide-react'
import ScanInputBar from '../../Shared/Wms/ScanInputBar'
import { playSound, initAudio } from '../../Shared/Wms/playSound'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import OfflineBlockedModal from '../../../core/components/common/OfflineBlockedModal'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useOfflineStore } from '../../../core/stores/offlineStore'
import { fmtTimeShort } from '../../../core/utils/dateFormat'
import { refreshSheet } from '../../WmsHub/services/googleSheetsService'
import { getOutboundBatchByDate, commitPickBatch } from '../services/surtidoService'
import { buildLotePool } from '../utils/lotePool'
import { useLoteDraft } from '../hooks/useLoteDraft'
import LoteResumenCards from './LoteResumenCards'
import LoteTarimaPanel from './LoteTarimaPanel'
import LotePoolSidebar from './LotePoolSidebar'
import LoteForzarFechaModal from './LoteForzarFechaModal'
import LoteConfirmarModal from './LoteConfirmarModal'

const RESULT_STYLES = {
  ok:        { icon: CheckCircle2, fg: 'text-success-600', bg: 'bg-success-50' },
  duplicate: { icon: AlertCircle,  fg: 'text-warning-600', bg: 'bg-warning-50' },
  not_found: { icon: XCircle,      fg: 'text-danger-600',  bg: 'bg-danger-50' },
  ambiguous: { icon: XCircle,      fg: 'text-danger-600',  bg: 'bg-danger-50' },
}

function ScanFeed({ scans, canRemove, onRemove, t }) {
  if (scans.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-warm-400">{t('surtido.lote.scan.sinEscaneos')}</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-warm-100">
      {scans.map(scan => {
        const style = RESULT_STYLES[scan.result] ?? RESULT_STYLES.not_found
        const Icon = style.icon
        return (
          <div key={scan.id} className="px-3 py-2 flex items-center gap-2">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
              <Icon className={`w-3.5 h-3.5 ${style.fg}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-warm-600 truncate">{scan.code}</p>
              {scan.orderNo && (
                <p className="font-mono text-[11px] font-semibold text-primary-700 truncate">{scan.orderNo}</p>
              )}
            </div>
            {scan.forcedDateMismatch && (
              <span className="badge text-[10px] font-semibold bg-warning-50 text-warning-700 shrink-0">
                {t('surtido.lote.forzada')}
              </span>
            )}
            <span className="font-mono text-[11px] text-primary-700 font-semibold shrink-0">{scan.tarimaRef}</span>
            <span className="text-[11px] text-warm-400 tabular-nums shrink-0">
              {fmtTimeShort(new Date(scan.ts))}
            </span>
            {canRemove(scan.id) ? (
              <button
                onClick={() => onRemove(scan)}
                aria-label={t('surtido.lote.scan.eliminar')}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-warm-400 hover:bg-danger-50 hover:text-danger-600 transition-colors shrink-0"
              >
                <Trash2 size={12} />
              </button>
            ) : (
              <span className="w-6 shrink-0" title={t('surtido.lote.sinPermisoEliminar')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ValidarPorLote({ tabId, fecha, isActive }) {
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
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [offlineBlocked, setOfflineBlocked] = useState(false)

  const permission = hasPermission('surtido.validacion', 'eliminar') ? 'eliminar' : 'crear'
  const canCreate = hasPermission('surtido.validacion', 'crear')
  const operadorNombre = user?.nombre_completo || user?.email || ''

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['surtido-lote-pool', fecha],
    queryFn: () => getOutboundBatchByDate(fecha),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const pool = useMemo(
    () => buildLotePool(data?.data?.orders ?? [], fecha),
    [data, fecha]
  )

  const lote = useLoteDraft({ tabId, dateKey: fecha, pool, operatorId: user?.id, permission })

  const ubicacionPorTarima = useMemo(
    () => new Map(lote.draft.tarimas.filter(tar => tar.ubicacionNota).map(tar => [tar.ref, tar.ubicacionNota])),
    [lote.draft.tarimas]
  )

  // La tarima activa con escaneos pero sin cerrar bloquea la confirmación: sus
  // cajas todavía no tienen ubicación que registrar.
  const tarimaAbierta = lote.draft.scans.some(
    s => s.tarimaRef === lote.draft.activeTarimaRef && s.result === 'ok'
  )

  const ordenesConEscaneos = useMemo(
    () => new Set(lote.draft.scans.filter(s => s.result === 'ok' && s.orderNo).map(s => s.orderNo)).size,
    [lote.draft.scans]
  )
  const summaryExtendido = { ...lote.summary, ordenesConEscaneos }

  const feed = useMemo(() => [...lote.draft.scans].reverse().slice(0, 100), [lote.draft.scans])

  useEffect(() => {
    if (!isActive) return
    const handler = () => initAudio()
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [isActive])

  const focusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus())
  }, [])

  const aplicarOutcome = useCallback((outcome) => {
    if (outcome.result === 'ok') {
      playSound('success')
      toast.success(`${t('surtido.lote.scan.ok')} ${outcome.orderNo}`)
    } else if (outcome.result === 'duplicate') {
      playSound('duplicate')
      toast.warning(`${t('surtido.lote.scan.duplicate')}: ${outcome.code}`)
    } else if (outcome.result === 'ambiguous') {
      playSound('error')
      toast.error(t('surtido.lote.scan.ambiguous'))
    } else if (outcome.result === 'not_found') {
      playSound('error')
      toast.error(t('surtido.lote.scan.notFound'))
    }
    focusScan()
  }, [focusScan, t, toast])

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

  function handleCloseTarima(ubicacion) {
    const error = lote.closeActiveTarima(ubicacion)
    if (!error) {
      playSound('complete')
      focusScan()
      return null
    }
    if (error.reason === 'sin_escaneos') {
      toast.warning(t('surtido.lote.tarima.sinEscaneos'))
    } else {
      // summary viene de validateLocationValue: el mismo texto que ya muestra
      // el modo por orden ante una ubicación inválida.
      playSound('error')
      toast.error(error.summary || t('surtido.lote.tarima.sinEscaneos'))
    }
    return error
  }

  const { mutate: doCommit, isPending: isCommitting } = useMutation({
    mutationFn: () => commitPickBatch(lote.commitPayload(notes)),
    onSuccess: () => {
      toast.success(t('surtido.lote.confirmar.exito'))
      setConfirmarModal(null)
      setNotes('')
      lote.cancelDraft()
      qc.invalidateQueries({ queryKey: ['surtido-scan-sessions'] })
      qc.invalidateQueries({ queryKey: ['wms-order-tracking'] })
    },
    // El borrador NO se borra: es el único punto donde el operador podría
    // perder trabajo, así que queda intacto para reintentar.
    onError: (err) => {
      toast.error(err?.response?.data?.error || t('surtido.lote.confirmar.error'))
    },
  })

  function abrirConfirmacion() {
    if (isOffline) { setOfflineBlocked(true); return }
    setConfirmarModal('confirmar')
  }

  async function handleRefreshSheet() {
    await refreshSheet('outbound')
    refetch()
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner />
        <p className="text-xs text-warm-500">{t('surtido.lote.cargando')}</p>
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
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-accent-500 shrink-0" />
            <span className="font-mono font-semibold text-primary-700 text-sm">{fecha}</span>
            <span className="badge text-[11px] font-semibold bg-warm-100 text-warm-600">
              {t('surtido.lote.borrador')}
            </span>
          </div>

          <LoteResumenCards summary={lote.summary} />

          <ScanInputBar
            inputRef={scanRef}
            onSubmit={handleScan}
            placeholder={t('surtido.lote.scan.placeholder')}
            buttonLabel={t('surtido.lote.scan.boton')}
            disabled={!canCreate}
          />

          <LoteTarimaPanel
            draft={lote.draft}
            onCloseTarima={handleCloseTarima}
            onRemoveTarima={lote.removeTarimaByRef}
            canRemoveTarima={lote.canRemoveTarimaByRef}
          />

          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-warm-100">
              <span className="text-xs font-semibold text-warm-600">{t('surtido.lote.scan.feed')}</span>
            </div>
            <ScanFeed
              scans={feed}
              canRemove={lote.canRemoveScanById}
              onRemove={(scan) => lote.removeScanById(scan.id)}
              t={t}
            />
          </div>
        </div>

        <LotePoolSidebar
          pool={pool}
          progress={lote.progress}
          visible={sidebarVisible}
          onToggle={() => setSidebarVisible(v => !v)}
          operadorNombre={operadorNombre}
          ubicacionPorTarima={ubicacionPorTarima}
        />
      </div>

      <div className="shrink-0 border-t border-warm-100 bg-white px-3 py-2.5 sm:px-4 flex items-center gap-2">
        <button
          onClick={() => setConfirmarModal('cancelar')}
          disabled={lote.draft.scans.length === 0}
          className="btn-secondary inline-flex items-center gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X size={14} /> {t('surtido.lote.cancelar')}
        </button>
        <button
          onClick={abrirConfirmacion}
          disabled={!canCreate || lote.summary.tarimasCerradas === 0 || tarimaAbierta}
          title={tarimaAbierta ? t('surtido.lote.confirmar.tarimaAbierta') : undefined}
          className="btn-primary ml-auto inline-flex items-center gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle2 size={14} /> {t('surtido.lote.confirmar')}
        </button>
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
        tarimaAbierta={tarimaAbierta}
        notes={notes}
        onNotesChange={setNotes}
        isPending={isCommitting}
        onClose={() => setConfirmarModal(null)}
        onConfirm={() => {
          if (confirmarModal === 'cancelar') {
            lote.cancelDraft()
            setNotes('')
            setConfirmarModal(null)
            return
          }
          doCommit()
        }}
      />

      <OfflineBlockedModal
        isBlocked={offlineBlocked}
        message={t('surtido.lote.confirmar.error')}
        onRetry={() => { setOfflineBlocked(false); abrirConfirmacion() }}
      />
    </div>
  )
}
