import api from '../../../core/services/api'

// ==================== OPERADORES INTERNOS ====================

export const getOperadores = async () => {
  const { data } = await api.get('/dropscan/operadores')
  return data
}

export const getOperadoresActivos = async () => {
  const { data } = await api.get('/dropscan/operadores/activos')
  return data
}

export const createOperador = async (operadorData) => {
  const { data } = await api.post('/dropscan/operadores', operadorData)
  return data
}

export const updateOperador = async (id, operadorData) => {
  const { data } = await api.put(`/dropscan/operadores/${id}`, operadorData)
  return data
}

export const changePin = async (id, pin) => {
  const { data } = await api.put(`/dropscan/operadores/${id}/pin`, { pin })
  return data
}

export const deleteOperador = async (id) => {
  const { data } = await api.delete(`/dropscan/operadores/${id}`)
  return data
}

export const validarPin = async (usuario_interno_id, pin) => {
  const { data } = await api.post('/dropscan/operadores/validar-pin', { usuario_interno_id, pin })
  return data
}
