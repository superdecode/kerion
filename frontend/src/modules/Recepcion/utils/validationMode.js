export function getRecepcionValidationCounts(order) {
  return {
    registradas: Number(order?.cajas_registradas ?? order?.cajas_validadas ?? 0),
    forzadas: Number(order?.cajas_forzadas ?? 0),
  }
}

export function hasRecepcionValidationRecords(order) {
  const { registradas, forzadas } = getRecepcionValidationCounts(order)
  return registradas + forzadas > 0
}

export function needsRecepcionValidationModeSelection(order) {
  return !order?.validation_config?.mode && !hasRecepcionValidationRecords(order)
}

export function buildInitialRecepcionValidationConfig(mode, options = {}) {
  const resolvedMode = mode === 'tarimas' ? 'tarimas' : 'ubicacion'
  const minCajas = Math.max(1, Number.parseInt(options.minCajasParaAgrupar, 10) || 3)
  const maxCajas = Math.max(minCajas, Number.parseInt(options.maxCajasEnGrupo, 10) || 10)
  return {
    mode: resolvedMode,
    locked: resolvedMode === 'tarimas',
    groupSmallCodes: resolvedMode === 'tarimas' && options.groupSmallCodes === true,
    minCajasParaAgrupar: minCajas,
    maxCajasEnGrupo: maxCajas,
    tarimaAssignments: [],
    emptyTarimas: [],
  }
}
