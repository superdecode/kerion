import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { listNiveles } from '../utils/niveles.js'

const router = Router()

function sanitizeConfigPayload(body = {}) {
  return {
    codigo: String(body.codigo || '').trim().toUpperCase(),
    nombre: String(body.nombre || '').trim(),
    descripcion: body.descripcion?.trim?.() || null,
    activo: body.activo !== false,
  }
}

function makeConfigCode(nombre, fallbackPrefix) {
  const base = String(nombre || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return `${fallbackPrefix}-${base || Date.now()}`
}

async function listCatalog(req, res, tipo) {
  try {
    const result = await req.tQuery(
      `SELECT id, codigo, nombre, descripcion, activo, created_at, updated_at
       FROM configuraciones
       WHERE tenant_id = $1
         AND modulo = 'anormalidades'
         AND tipo = $2
       ORDER BY activo DESC, nombre ASC`,
      [req.tenantId, tipo]
    )
    res.json({ success: true, data: result.rows })
  } catch {
    res.status(500).json({ error: 'Error al obtener configuración' })
  }
}

async function createCatalog(req, res, tipo, prefix) {
  try {
    const payload = sanitizeConfigPayload(req.body)
    if (!payload.nombre) return res.status(400).json({ error: 'nombre es requerido' })

    const codigo = payload.codigo || makeConfigCode(payload.nombre, prefix)
    const result = await req.tQuery(
      `INSERT INTO configuraciones
         (tenant_id, modulo, tipo, codigo, nombre, descripcion, activo, config_json)
       VALUES ($1, 'anormalidades', $2, $3, $4, $5, $6, '{}'::jsonb)
       RETURNING id, codigo, nombre, descripcion, activo, created_at, updated_at`,
      [req.tenantId, tipo, codigo, payload.nombre, payload.descripcion, payload.activo]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese código' })
    res.status(500).json({ error: 'Error al crear configuración' })
  }
}

async function updateCatalog(req, res, tipo) {
  try {
    const payload = sanitizeConfigPayload(req.body)
    if (!payload.nombre) return res.status(400).json({ error: 'nombre es requerido' })

    const codigo = payload.codigo || makeConfigCode(payload.nombre, tipo.toUpperCase())
    const result = await req.tQuery(
      `UPDATE configuraciones
       SET codigo = $3,
           nombre = $4,
           descripcion = $5,
           activo = $6,
           updated_at = now()
       WHERE id = $1
         AND tenant_id = $2
         AND modulo = 'anormalidades'
         AND tipo = $7
       RETURNING id, codigo, nombre, descripcion, activo, created_at, updated_at`,
      [req.params.id, req.tenantId, codigo, payload.nombre, payload.descripcion, payload.activo, tipo]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese código' })
    res.status(500).json({ error: 'Error al actualizar configuración' })
  }
}

async function deleteCatalog(req, res, tipo) {
  try {
    const result = await req.tQuery(
      `DELETE FROM configuraciones
       WHERE id = $1
         AND tenant_id = $2
         AND modulo = 'anormalidades'
         AND tipo = $3
       RETURNING id`,
      [req.params.id, req.tenantId, tipo]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Error al eliminar configuración' })
  }
}

async function listNivelesConfig(req, res) {
  try {
    const niveles = await listNiveles(req.tQuery, req.tenantId)
    res.json({ success: true, data: niveles })
  } catch {
    res.status(500).json({ error: 'Error al obtener niveles' })
  }
}

// ── GET /api/anormalidades/config/codigos ────────────────────────────────────
router.get('/codigos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT id, tenant_id, codigo, nombre_es AS nombre, proceso, nivel_sugerido, descripcion, activo, es_default, created_at, updated_at
         FROM anormalidades_codigos
         WHERE tenant_id = $1
         ORDER BY proceso, codigo`,
        [req.tenantId]
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener códigos' })
    }
  }
)

// ── POST /api/anormalidades/config/codigos — crear código personalizado ───────
router.post('/codigos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => {
    try {
      const { codigo, proceso, nivel_sugerido, descripcion } = req.body
      const nombre = String(req.body.nombre || req.body.nombre_es || '').trim()
      if (!codigo || !nombre || !proceso)
        return res.status(400).json({ error: 'codigo, nombre y proceso son requeridos' })

      const result = await req.tQuery(
        `INSERT INTO anormalidades_codigos
           (tenant_id, codigo, nombre_es, nombre_zh, proceso, nivel_sugerido, descripcion, es_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false)
         RETURNING *`,
        [req.tenantId, codigo.toUpperCase(), nombre, '', proceso, nivel_sugerido || 'L2', descripcion || null]
      )
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Código ya existe' })
      res.status(500).json({ error: 'Error al crear código' })
    }
  }
)

// ── PUT /api/anormalidades/config/codigos/:id ────────────────────────────────
router.put('/codigos/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => {
    try {
      const { codigo, descripcion, activo, nivel_sugerido, proceso } = req.body
      const nombre = req.body.nombre !== undefined ? String(req.body.nombre || '').trim() : (req.body.nombre_es || null)

      const result = await req.tQuery(
        `UPDATE anormalidades_codigos SET
           codigo         = COALESCE($3, codigo),
           nombre_es      = COALESCE($4, nombre_es),
           nombre_zh      = '',
           descripcion    = COALESCE($6, descripcion),
           activo         = COALESCE($7, activo),
           nivel_sugerido = COALESCE($8, nivel_sugerido),
           proceso        = COALESCE($9, proceso),
           updated_at     = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [req.params.id, req.tenantId,
         codigo ? codigo.toUpperCase() : null,
         nombre || null, null, descripcion ?? null,
         activo !== undefined ? activo : null, nivel_sugerido || null, proceso || null]
      )
      if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' })
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Código ya existe' })
      res.status(500).json({ error: 'Error al actualizar código' })
    }
  }
)

// ── DELETE /api/anormalidades/config/codigos/:id — solo custom ───────────────
router.delete('/codigos/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => {
    try {
      const existing = await req.tQuery(
        'SELECT es_default FROM anormalidades_codigos WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'No encontrado' })
      if (existing.rows[0].es_default)
        return res.status(403).json({ error: 'Los códigos base no pueden eliminarse' })

      await req.tQuery(
        'DELETE FROM anormalidades_codigos WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar código' })
    }
  }
)

// ── GET /api/anormalidades/config/tiempos ────────────────────────────────────
router.get('/tiempos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        'SELECT * FROM anormalidades_config WHERE tenant_id = $1',
        [req.tenantId]
      )
      res.json({
        success: true,
        data: result.rows[0] || { horas_limite_l1: 48, horas_limite_l2: 24, horas_limite_l3: 4 },
      })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener configuración' })
    }
  }
)

router.get('/procesos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'ver'),
  async (req, res) => listCatalog(req, res, 'proceso')
)

router.get('/niveles',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'ver'),
  listNivelesConfig
)

router.post('/niveles',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => {
    try {
      const { codigo, nombre, descripcion, activo, horas_limite, prioridad } = req.body
      if (!codigo || !nombre) return res.status(400).json({ error: 'codigo y nombre son requeridos' })
      const result = await req.tQuery(
        `INSERT INTO configuraciones
           (tenant_id, modulo, tipo, codigo, nombre, descripcion, activo, config_json)
         VALUES ($1, 'anormalidades', 'nivel', $2, $3, $4, $5, $6::jsonb)
         RETURNING codigo, nombre, descripcion, activo, config_json`,
        [req.tenantId, String(codigo).trim().toUpperCase(), String(nombre).trim(), descripcion || null, activo !== false, JSON.stringify({
          prioridad: Number(prioridad || 1),
          horas_limite: Number(horas_limite || 24),
        })]
      )
      const row = result.rows[0]
      res.status(201).json({ success: true, data: { ...row, prioridad: Number(row.config_json?.prioridad || 0), horas_limite: Number(row.config_json?.horas_limite || 24) } })
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un nivel con ese código' })
      res.status(500).json({ error: 'Error al crear nivel' })
    }
  }
)

router.put('/niveles/:codigo',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => {
    try {
      const { nombre, descripcion, activo, horas_limite, prioridad } = req.body
      if (!nombre) return res.status(400).json({ error: 'nombre es requerido' })
      const result = await req.tQuery(
        `UPDATE configuraciones
         SET nombre = $3,
             descripcion = $4,
             activo = $5,
             config_json = $6::jsonb,
             updated_at = now()
         WHERE tenant_id = $1
           AND modulo = 'anormalidades'
           AND tipo = 'nivel'
           AND codigo = $2
         RETURNING codigo, nombre, descripcion, activo, config_json`,
        [req.tenantId, String(req.params.codigo).trim().toUpperCase(), String(nombre).trim(), descripcion || null, activo !== false, JSON.stringify({
          prioridad: Number(prioridad || 1),
          horas_limite: Number(horas_limite || 24),
        })]
      )
      if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' })
      const row = result.rows[0]
      res.json({ success: true, data: { ...row, prioridad: Number(row.config_json?.prioridad || 0), horas_limite: Number(row.config_json?.horas_limite || 24) } })
    } catch {
      res.status(500).json({ error: 'Error al actualizar nivel' })
    }
  }
)

router.delete('/niveles/:codigo',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => {
    try {
      await req.tQuery(
        `DELETE FROM configuraciones
         WHERE tenant_id = $1
           AND modulo = 'anormalidades'
           AND tipo = 'nivel'
           AND codigo = $2`,
        [req.tenantId, String(req.params.codigo).trim().toUpperCase()]
      )
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'Error al eliminar nivel' })
    }
  }
)

router.post('/procesos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => createCatalog(req, res, 'proceso', 'PROC')
)

router.put('/procesos/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => updateCatalog(req, res, 'proceso')
)

router.delete('/procesos/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => deleteCatalog(req, res, 'proceso')
)

router.get('/origenes',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'ver'),
  async (req, res) => listCatalog(req, res, 'origen')
)

router.post('/origenes',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => createCatalog(req, res, 'origen', 'ORIG')
)

router.put('/origenes/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => updateCatalog(req, res, 'origen')
)

router.delete('/origenes/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => deleteCatalog(req, res, 'origen')
)

// ── PUT /api/anormalidades/config/tiempos ────────────────────────────────────
router.put('/tiempos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'actualizar'),
  async (req, res) => {
    try {
      const { horas_limite_l1, horas_limite_l2, horas_limite_l3 } = req.body
      const result = await req.tQuery(
        `INSERT INTO anormalidades_config (tenant_id, horas_limite_l1, horas_limite_l2, horas_limite_l3)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id) DO UPDATE SET
           horas_limite_l1 = EXCLUDED.horas_limite_l1,
           horas_limite_l2 = EXCLUDED.horas_limite_l2,
           horas_limite_l3 = EXCLUDED.horas_limite_l3,
           updated_at = now()
         RETURNING *`,
        [req.tenantId, horas_limite_l1 || 48, horas_limite_l2 || 24, horas_limite_l3 || 4]
      )
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar tiempos' })
    }
  }
)

export default router
