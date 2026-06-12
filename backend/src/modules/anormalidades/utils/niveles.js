export async function listNiveles(tQuery, tenantId, { activeOnly = false } = {}) {
  const params = [tenantId]
  let sql = `
    SELECT codigo, nombre, descripcion, activo, config_json
    FROM configuraciones
    WHERE tenant_id = $1
      AND modulo = 'anormalidades'
      AND tipo = 'nivel'
  `
  if (activeOnly) sql += ` AND activo = true`
  sql += ` ORDER BY COALESCE((config_json->>'prioridad')::int, 0) ASC, nombre ASC`
  const res = await tQuery(sql, params)
  return res.rows.map(row => ({
    codigo: row.codigo,
    nombre: row.nombre,
    descripcion: row.descripcion,
    activo: row.activo,
    prioridad: Number(row.config_json?.prioridad || 0),
    horas_limite: Number(row.config_json?.horas_limite || 24),
  }))
}

export async function getNivelMeta(tQuery, tenantId, codigo) {
  const niveles = await listNiveles(tQuery, tenantId)
  return niveles.find(item => item.codigo === codigo || item.nombre === codigo) || null
}

export async function getNivelCriticoCodigo(tQuery, tenantId) {
  const niveles = await listNiveles(tQuery, tenantId, { activeOnly: true })
  const sorted = [...niveles].sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0))
  return sorted[0]?.codigo || 'L3'
}
