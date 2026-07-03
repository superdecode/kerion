import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { updateOrder } from '../services/recepcionService'
import { useRecepcionEscanearStore } from '../stores/recepcionEscanearStore'
import ValidationModeSelectorModal from '../components/ValidationModeSelectorModal'
import {
  buildInitialRecepcionValidationConfig,
  needsRecepcionValidationModeSelection,
} from '../utils/validationMode'

export function useRecepcionValidationLauncher() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useI18nStore()
  const toast = useToastStore()
  const beforeNavigateRef = useRef(null)
  const [selectorState, setSelectorState] = useState({
    isOpen: false,
    order: null,
    mode: 'ubicacion',
    groupSmallCodes: false,
    minCajasParaAgrupar: 3,
    maxCajasEnGrupo: 10,
  })

  const openEscanear = useCallback((order) => {
    useRecepcionEscanearStore.getState().openOrderTab(order.id, order.folio, order.cliente, order)
    navigate('/recepcion/escanear', { state: { fromExternal: String(order.id) } })
  }, [navigate])

  const closeSelector = useCallback(() => {
    beforeNavigateRef.current = null
    setSelectorState({ isOpen: false, order: null, mode: 'ubicacion' })
  }, [])

  const prepareModeMutation = useMutation({
    mutationFn: async ({ order, mode, groupSmallCodes, minCajasParaAgrupar, maxCajasEnGrupo }) => {
      const validation_config = buildInitialRecepcionValidationConfig(mode, {
        groupSmallCodes,
        minCajasParaAgrupar,
        maxCajasEnGrupo,
      })
      await updateOrder(order.id, { validation_config })
      return { ...order, validation_config }
    },
    onSuccess: (preparedOrder) => {
      const orderId = String(preparedOrder.id)
      const mergePreparedOrder = (current) => current
        ? { ...current, order: { ...current.order, ...preparedOrder } }
        : current

      // Escanear has separate summary/lines caches. Update both before navigating so
      // the embedded validator never sees the stale order without a selected mode.
      qc.setQueryData(['recepcion-order', orderId, 'validation-summary'], mergePreparedOrder)
      qc.setQueryData(['recepcion-order', orderId, 'validation-lines'], mergePreparedOrder)
      qc.invalidateQueries({ queryKey: ['recepcion-orders'] })
      qc.invalidateQueries({ queryKey: ['recepcion-orders-active'] })
      qc.invalidateQueries({ queryKey: ['recepcion-order', orderId] })
      qc.invalidateQueries({ queryKey: ['recepcion-order', preparedOrder.id] })
      beforeNavigateRef.current?.()
      openEscanear(preparedOrder)
      closeSelector()
    },
    onError: (error) => {
      toast.error(error?.response?.data?.error || t('toast.error'))
    },
  })

  const openValidationFlow = useCallback((order, options = {}) => {
    const { onBeforeNavigate } = options
    if (!order?.id) return

    beforeNavigateRef.current = onBeforeNavigate || null

    if (needsRecepcionValidationModeSelection(order)) {
      setSelectorState({
        isOpen: true,
        order,
        mode: 'ubicacion',
        groupSmallCodes: false,
        minCajasParaAgrupar: 3,
        maxCajasEnGrupo: 10,
      })
      return
    }

    beforeNavigateRef.current?.()
    openEscanear(order)
    beforeNavigateRef.current = null
  }, [openEscanear])

  const validationModeModal = (
    <ValidationModeSelectorModal
      isOpen={selectorState.isOpen}
      mode={selectorState.mode}
      onModeChange={(mode) => setSelectorState(prev => ({ ...prev, mode }))}
      groupSmallCodes={selectorState.groupSmallCodes}
      onGroupSmallCodesChange={(groupSmallCodes) => setSelectorState(prev => ({ ...prev, groupSmallCodes }))}
      minCajasParaAgrupar={selectorState.minCajasParaAgrupar}
      onMinCajasChange={(minCajasParaAgrupar) => setSelectorState(prev => ({
        ...prev,
        minCajasParaAgrupar,
        maxCajasEnGrupo: Math.max(minCajasParaAgrupar, prev.maxCajasEnGrupo),
      }))}
      maxCajasEnGrupo={selectorState.maxCajasEnGrupo}
      onMaxCajasChange={(maxCajasEnGrupo) => setSelectorState(prev => ({ ...prev, maxCajasEnGrupo }))}
      onClose={closeSelector}
      onConfirm={() => {
        if (!selectorState.order) return
        prepareModeMutation.mutate({
          order: selectorState.order,
          mode: selectorState.mode,
          groupSmallCodes: selectorState.groupSmallCodes,
          minCajasParaAgrupar: selectorState.minCajasParaAgrupar,
          maxCajasEnGrupo: selectorState.maxCajasEnGrupo,
        })
      }}
      isSubmitting={prepareModeMutation.isPending}
      t={t}
    />
  )

  return {
    openValidationFlow,
    validationModeModal,
  }
}
