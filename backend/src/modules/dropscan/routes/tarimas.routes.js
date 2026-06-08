import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { dateInTZ } from '../../../shared/utils/dateUtils.js'
import { query } from '../../../config/database.js'

const router = Router()

// GET /api/dropscan/tarimas
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'ver'),
  async (req, res) => {
    try {
      const { fecha_inicio, fecha_fin, empresa_id, canal_id, estado, operador_id, escaneador, codigo_guia, page = 1, limit = 20 } = req.query
      const safePage = Math.max(1, parseInt(page) || 1)
      const safeLimit = Math.min(500, Math.max(1, parseInt(limit) || 20))
      const offset = (safePage - 1) * safeLimit

      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      let where = [`t.tenant_id = $1`]
      let params = [req.tenantId]
      let paramCount = 1

      if (fecha_inicio) {
        paramCount++
        where.push(`${dateInTZ('t.fecha_inicio', tz)} >= $${paramCount}::date`)
        params.push(fecha_inicio)
      }
      if (fecha_fin) {
        paramCount++
        where.push(`${dateInTZ('t.fecha_inicio', tz)} <= $${paramCount}::date`)
        params.push(fecha_fin)
      }
      if (empresa_id) {
        const ids = String(empresa_id).split(',').map(Number).filter(Boolean)
        if (ids.length) { paramCount++; where.push(`t.empresa_id = ANY($${paramCount})`); params.push(ids) }
      }
      if (canal_id) {
        const ids = String(canal_id).split(',').map(Number).filter(Boolean)
        if (ids.length) { paramCount++; where.push(`t.canal_id = ANY($${paramCount})`); params.push(ids) }
      }
      if (estado) {
        const estados = String(estado).split(',').filter(Boolean)
        if (estados.length === 1) {
          paramCount++; where.push(`t.estado = $${paramCount}`); params.push(estados[0])
        } else if (estados.length > 1) {
          paramCount++; where.push(`t.estado = ANY($${paramCount})`); params.push(estados)
        }
      }
      if (operador_id) {
        paramCount++
        where.push(`t.operador_id = $${paramCount}`)
        params.push(operador_id)
      }
      if (escaneador) {
        const names = String(escaneador).split(',').map(n => n.trim()).filter(Boolean)
        if (names.length === 1) {
          paramCount++
          where.push(`EXISTS (
            SELECT 1 FROM guias g2
            LEFT JOIN usuarios_internos ui2 ON g2.usuario_interno_id = ui2.id
            LEFT JOIN usuarios ue ON g2.operador_id = ue.id
            WHERE g2.tarima_id = t.id AND COALESCE(ui2.nombre, g2.usuario_operador, ue.nombre_completo) ILIKE $${paramCount}
          )`)
          params.push(`%${names[0]}%`)
        } else if (names.length > 1) {
          paramCount++
          where.push(`EXISTS (
            SELECT 1 FROM guias g2
            LEFT JOIN usuarios_internos ui2 ON g2.usuario_interno_id = ui2.id
            LEFT JOIN usuarios ue ON g2.operador_id = ue.id
            WHERE g2.tarima_id = t.id AND COALESCE(ui2.nombre, g2.usuario_operador, ue.nombre_completo) = ANY($${paramCount})
          )`)
          params.push(names)
        }
      }

      if (codigo_guia && codigo_guia.trim()) {
        paramCount++
        where.push(`EXISTS (SELECT 1 FROM guias g3 WHERE g3.tarima_id = t.id AND g3.codigo_guia ILIKE $${paramCount})`)
        params.push(`%${codigo_guia.trim()}%`)
      }

      const whereClause = 'WHERE ' + where.join(' AND ')

      // Count total
      const countRes = await req.tQuery(
        `SELECT COUNT(*) FROM tarimas t ${whereClause}`,
        params
      )
      const total = parseInt(countRes.rows[0].count)

      // Get paginated results
      paramCount++
      params.push(safeLimit)
      paramCount++
      params.push(offset)

      const result = await req.tQuery(
        `SELECT t.id, t.codigo, t.estado, t.cantidad_guias,
                t.fecha_inicio, t.fecha_cierre, t.tiempo_armado_segundos,
                e.nombre as empresa_nombre, e.codigo as empresa_codigo,
                c.nombre as canal_nombre, c.codigo as canal_codigo,
                COALESCE(ui.nombre, s.usuario_operador, u.nombre_completo) as operador_nombre, u.codigo as operador_codigo,
                (SELECT fe2.folio_numero FROM folios_entrega_tarimas fet2
                 JOIN folios_entrega fe2 ON fe2.id = fet2.folio_id
                 WHERE fet2.tarima_id = t.id AND fet2.eliminado_en IS NULL AND fe2.estado = 'ACTIVO'
                 LIMIT 1) AS folio_asignado,
                (SELECT fe2.id FROM folios_entrega_tarimas fet2
                 JOIN folios_entrega fe2 ON fe2.id = fet2.folio_id
                 WHERE fet2.tarima_id = t.id AND fet2.eliminado_en IS NULL AND fe2.estado = 'ACTIVO'
                 LIMIT 1) AS folio_id
         FROM tarimas t
         JOIN configuraciones e ON t.empresa_id = e.id
         JOIN configuraciones c ON t.canal_id = c.id
         JOIN usuarios u ON t.operador_id = u.id
         LEFT JOIN LATERAL (
           SELECT usuario_operador, usuario_interno_id FROM sesiones_escaneo
           WHERE tarima_actual_id = t.id
              OR (operador_id = t.operador_id AND empresa_id = t.empresa_id AND canal_id = t.canal_id AND ${dateInTZ('fecha_inicio', tz)} = ${dateInTZ('t.fecha_inicio', tz)})
           ORDER BY (tarima_actual_id = t.id) DESC, fecha_inicio DESC
           LIMIT 1
         ) s ON true
         LEFT JOIN usuarios_internos ui ON s.usuario_interno_id = ui.id
         ${whereClause}
         ORDER BY t.fecha_inicio DESC
         LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
        params
      )

      res.json({
        tarimas: result.rows,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit)
        }
      })
    } catch (error) {
      console.error('Get tarimas error:', error)
      res.status(500).json({ error: 'Error obteniendo tarimas' })
    }
  }
)

// GET /api/dropscan/tarimas/:id
router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'ver'),
  async (req, res) => {
    try {
      const { id } = req.params
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'

      const tarimaRes = await req.tQuery(
        `SELECT t.*, e.nombre as empresa_nombre, e.codigo as empresa_codigo,
                c.nombre as canal_nombre, c.codigo as canal_codigo,
                COALESCE(ui.nombre, s.usuario_operador, u.nombre_completo) as operador_nombre, u.codigo as operador_codigo,
                (SELECT fe2.folio_numero FROM folios_entrega_tarimas fet2
                 JOIN folios_entrega fe2 ON fe2.id = fet2.folio_id
                 WHERE fet2.tarima_id = t.id AND fet2.eliminado_en IS NULL AND fe2.estado = 'ACTIVO'
                 LIMIT 1) AS folio_asignado,
                (SELECT fe2.id FROM folios_entrega_tarimas fet2
                 JOIN folios_entrega fe2 ON fe2.id = fet2.folio_id
                 WHERE fet2.tarima_id = t.id AND fet2.eliminado_en IS NULL AND fe2.estado = 'ACTIVO'
                 LIMIT 1) AS folio_id
         FROM tarimas t
         JOIN configuraciones e ON t.empresa_id = e.id
         JOIN configuraciones c ON t.canal_id = c.id
         JOIN usuarios u ON t.operador_id = u.id
         LEFT JOIN LATERAL (
           SELECT usuario_operador, usuario_interno_id FROM sesiones_escaneo
           WHERE tarima_actual_id = t.id
              OR (operador_id = t.operador_id AND empresa_id = t.empresa_id AND canal_id = t.canal_id AND ${dateInTZ('fecha_inicio', tz)} = ${dateInTZ('t.fecha_inicio', tz)})
           ORDER BY (tarima_actual_id = t.id) DESC, fecha_inicio DESC
           LIMIT 1
         ) s ON true
         LEFT JOIN usuarios_internos ui ON s.usuario_interno_id = ui.id
         WHERE t.id = $1 AND t.tenant_id = $2`,
        [id, req.tenantId]
      )

      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }

      const guiasRes = await req.tQuery(
        `SELECT g.id, g.codigo_guia, g.posicion, g.timestamp_escaneo, g.peso_kg,
                COALESCE(ui.nombre, g.usuario_operador, u.nombre_completo) as operador_nombre
         FROM guias g
         JOIN usuarios u ON g.operador_id = u.id
         LEFT JOIN usuarios_internos ui ON g.usuario_interno_id = ui.id
         WHERE g.tarima_id = $1 AND g.tenant_id = $2
         ORDER BY g.posicion ASC`,
        [id, req.tenantId]
      )

      const duplicadosRes = await req.tQuery(
        `SELECT COUNT(*) FROM alertas_duplicados WHERE tarima_id = $1 AND tenant_id = $2`,
        [id, req.tenantId]
      )

      res.json({
        tarima: tarimaRes.rows[0],
        guias: guiasRes.rows,
        duplicados_count: parseInt(duplicadosRes.rows[0].count) || 0
      })
    } catch (error) {
      console.error('Get tarima detail error:', error)
      res.status(500).json({ error: 'Error obteniendo tarima' })
    }
  }
)

// POST /api/dropscan/tarimas/:id/finalize
router.post('/:id/finalize',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'actualizar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const result = await req.tQuery(
        `UPDATE tarimas SET estado = 'FINALIZADA', fecha_cierre = CURRENT_TIMESTAMP,
           tiempo_armado_segundos = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fecha_inicio))::INTEGER
         WHERE id = $1 AND estado = 'EN_PROCESO' AND tenant_id = $2 RETURNING *`,
        [id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Tarima no encontrada o no está en proceso' })
      auditLog(req, 'FINALIZAR_TARIMA', 'tarima', id, { codigo: result.rows[0].codigo })
      res.json({ success: true, tarima: result.rows[0] })
    } catch (error) {
      console.error('Finalize tarima error:', error)
      res.status(500).json({ error: 'Error finalizando tarima' })
    }
  }
)

// POST /api/dropscan/tarimas/:id/cancel
router.post('/:id/cancel',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { razon } = req.body
      if (!razon || !razon.trim()) return res.status(400).json({ error: 'La razón de cancelación es requerida' })
      const exists = await req.tQuery(
        `SELECT estado FROM tarimas WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId]
      )
      if (exists.rows.length === 0) return res.status(404).json({ error: 'Tarima no encontrada' })
      if (exists.rows[0].estado !== 'EN_PROCESO') return res.status(409).json({ error: 'La tarima no está en proceso' })
      const result = await req.tQuery(
        `UPDATE tarimas SET estado = 'CANCELADA', fecha_cierre = CURRENT_TIMESTAMP, cancelada_razon = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
        [razon.trim(), id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Tarima no encontrada' })
      auditLog(req, 'CANCELAR_TARIMA', 'tarima', id, { codigo: result.rows[0].codigo, razon: razon.trim() })
      res.json({ success: true, tarima: result.rows[0] })
    } catch (error) {
      console.error('Cancel tarima error:', error)
      res.status(500).json({ error: 'Error cancelando tarima' })
    }
  }
)

// POST /api/dropscan/tarimas/:id/reopen
router.post('/:id/reopen',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'desbloquear'),
  async (req, res) => {
    try {
      const { id } = req.params
      const result = await req.tQuery(
        `UPDATE tarimas SET estado = 'EN_PROCESO', fecha_cierre = NULL WHERE id = $1 AND estado = 'FINALIZADA' AND tenant_id = $2 RETURNING *`,
        [id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Tarima no encontrada o no está finalizada' })
      auditLog(req, 'REABRIR_TARIMA', 'tarima', id, { codigo: result.rows[0].codigo })
      res.json({ success: true, tarima: result.rows[0] })
    } catch (error) {
      console.error('Reopen tarima error:', error)
      res.status(500).json({ error: 'Error reabriendo tarima' })
    }
  }
)

// POST /api/dropscan/tarimas/:id/adopt
// Reopen an EN_PROCESO tarima into a new active scan session so operator can continue scanning.
router.post('/:id/adopt',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'desbloquear'),
  async (req, res) => {
    try {
      const { id } = req.params
      const userId = req.user.id

      const tarimaRes = await req.tQuery(
        `SELECT * FROM tarimas WHERE id = $1 AND estado = 'EN_PROCESO' AND tenant_id = $2`,
        [id, req.tenantId]
      )
      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada o no está en proceso' })
      }
      const tarima = tarimaRes.rows[0]

      const activeCountRes = await req.tQuery(
        'SELECT COUNT(*) AS count FROM sesiones_escaneo WHERE operador_id = $1 AND activa = true AND tenant_id = $2',
        [userId, req.tenantId]
      )
      const activeCount = parseInt(activeCountRes.rows[0].count || 0)
      if (activeCount >= 3) {
        return res.status(409).json({ error: 'Máximo 3 sesiones activas permitidas' })
      }

      const existingSessionRes = await req.tQuery(
        `SELECT * FROM sesiones_escaneo
         WHERE operador_id = $1 AND activa = true AND tarima_actual_id = $2 AND tenant_id = $3
         ORDER BY fecha_inicio DESC
         LIMIT 1`,
        [userId, tarima.id, req.tenantId]
      )

      let sesion = existingSessionRes.rows[0] || null

      if (!sesion) {
        const insertRes = await req.tQuery(
          `INSERT INTO sesiones_escaneo (operador_id, empresa_id, canal_id, tarima_actual_id, activa, tenant_id)
           VALUES ($1, $2, $3, $4, true, $5)
           RETURNING *`,
          [userId, tarima.empresa_id, tarima.canal_id, tarima.id, req.tenantId]
        )
        sesion = insertRes.rows[0]
      } else {
        await req.tQuery(
          `UPDATE sesiones_escaneo
           SET empresa_id = $1, canal_id = $2, tarima_actual_id = $3
           WHERE id = $4 AND tenant_id = $5`,
          [tarima.empresa_id, tarima.canal_id, tarima.id, sesion.id, req.tenantId]
        )
      }

      const guiasRes = await req.tQuery(
        `SELECT id, codigo_guia, posicion, timestamp_escaneo
         FROM guias
         WHERE tarima_id = $1 AND tenant_id = $2
         ORDER BY posicion DESC`,
        [tarima.id, req.tenantId]
      )

      res.json({
        success: true,
        sesion,
        tarima_actual: tarima,
        tarimas_activas: [tarima],
        ultimas_guias: guiasRes.rows
      })
    } catch (error) {
      console.error('Adopt tarima error:', error)
      res.status(500).json({ error: 'Error reabriendo tarima para escaneo' })
    }
  }
)

// GET /api/dropscan/tarimas/:id/duplicados
router.get('/:id/duplicados',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'ver'),
  async (req, res) => {
    try {
      const { id } = req.params
      const result = await req.tQuery(
        `SELECT ad.id, ad.codigo_guia, ad.timestamp_alerta,
                g.codigo_guia as guia_original_codigo, g.posicion as guia_original_posicion,
                COALESCE(g.usuario_operador, u.nombre_completo) as operador_nombre
         FROM alertas_duplicados ad
         LEFT JOIN guias g ON ad.guia_original_id = g.id
         JOIN usuarios u ON ad.operador_id = u.id
         WHERE ad.tarima_id = $1 AND ad.tenant_id = $2
         ORDER BY ad.timestamp_alerta DESC`,
        [id, req.tenantId]
      )
      res.json({ duplicados: result.rows })
    } catch (error) {
      console.error('Get duplicados error:', error)
      res.status(500).json({ error: 'Error obteniendo duplicados' })
    }
  }
)

// POST /api/dropscan/tarimas/:tarimaId/guias (add a guide to existing tarima)
router.post('/:tarimaId/guias',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'editar'),
  async (req, res) => {
    try {
      const { tarimaId } = req.params
      const { codigo_guia, peso_kg } = req.body

      if (!codigo_guia || typeof codigo_guia !== 'string') {
        return res.status(400).json({ error: 'codigo_guia requerido' })
      }
      const pesoVal = peso_kg != null ? parseFloat(peso_kg) : null
      if (pesoVal !== null && (isNaN(pesoVal) || pesoVal < 0.001 || pesoVal > 9999.999)) {
        return res.status(400).json({ error: 'peso_kg debe estar entre 0.001 y 9999.999' })
      }

      // Verify tarima exists and is not locked by a folio
      const tarimaRes = await req.tQuery(
        `SELECT id, cantidad_guias,
                (SELECT fe.folio_numero FROM folios_entrega_tarimas fet
                 JOIN folios_entrega fe ON fe.id = fet.folio_id
                 WHERE fet.tarima_id = $1 AND fet.eliminado_en IS NULL AND fe.estado = 'ACTIVO'
                 LIMIT 1) AS folio_asignado
         FROM tarimas WHERE id = $1 AND tenant_id = $2`,
        [tarimaId, req.tenantId]
      )
      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }
      if (tarimaRes.rows[0].folio_asignado) {
        return res.status(409).json({ error: 'FOLIO_BLOQUEADO', message: `Tarima bloqueada por folio ${tarimaRes.rows[0].folio_asignado}` })
      }

      // Check for duplicates
      const dupRes = await req.tQuery(
        'SELECT id FROM guias WHERE tarima_id = $1 AND codigo_guia = $2 AND tenant_id = $3',
        [tarimaId, codigo_guia, req.tenantId]
      )
      if (dupRes.rows.length > 0) {
        return res.status(400).json({ error: 'DUPLICADO', message: 'Esta guía ya está registrada en esta tarima' })
      }

      // Get next position
      const posRes = await req.tQuery(
        'SELECT MAX(CAST(posicion AS INTEGER)) as max_pos FROM guias WHERE tarima_id = $1 AND tenant_id = $2',
        [tarimaId, req.tenantId]
      )
      const nextPos = (parseInt(posRes.rows[0]?.max_pos || 0) || 0) + 1

      // Insert new guide
      const guiaRes = await req.tQuery(
        `INSERT INTO guias (tarima_id, codigo_guia, posicion, operador_id, timestamp_escaneo, peso_kg, tenant_id)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6)
         RETURNING id, codigo_guia, posicion, timestamp_escaneo, operador_id, peso_kg`,
        [tarimaId, codigo_guia, nextPos, req.fullUser.id, pesoVal, req.tenantId]
      )
      const newGuia = guiaRes.rows[0]

      // Update guide count (but don't touch fecha_cierre or tiempo_armado)
      const newCount = (parseInt(tarimaRes.rows[0].cantidad_guias) || 0) + 1
      await req.tQuery('UPDATE tarimas SET cantidad_guias = $1 WHERE id = $2 AND tenant_id = $3', [newCount, tarimaId, req.tenantId])

      // Return new guide with operator name
      const operRes = await req.tQuery('SELECT nombre_completo FROM usuarios WHERE id = $1 AND tenant_id = $2', [req.fullUser.id, req.tenantId])
      const operadorNombre = operRes.rows[0]?.nombre_completo || req.fullUser.nombre_completo || 'Desconocido'

      res.json({
        success: true,
        guia: {
          id: newGuia.id,
          codigo_guia: newGuia.codigo_guia,
          posicion: newGuia.posicion,
          timestamp_escaneo: newGuia.timestamp_escaneo,
          operador_nombre: operadorNombre,
          peso_kg: newGuia.peso_kg,
        },
        cantidad_guias: newCount,
      })
    } catch (error) {
      console.error('Add guia to tarima error:', error)
      res.status(500).json({ error: 'Error agregando guía' })
    }
  }
)

// DELETE /api/dropscan/tarimas/:tarimaId/guias/:guiaId
router.delete('/:tarimaId/guias/:guiaId',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'actualizar'),
  async (req, res) => {
    try {
      const { tarimaId, guiaId } = req.params

      // Check tarima is not locked by a folio
      const tarimaRes = await req.tQuery(
        `SELECT (SELECT fe.folio_numero FROM folios_entrega_tarimas fet
                 JOIN folios_entrega fe ON fe.id = fet.folio_id
                 WHERE fet.tarima_id = $1 AND fet.eliminado_en IS NULL AND fe.estado = 'ACTIVO'
                 LIMIT 1) AS folio_asignado
         FROM tarimas WHERE id = $1 AND tenant_id = $2`,
        [tarimaId, req.tenantId]
      )
      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }
      if (tarimaRes.rows[0].folio_asignado) {
        return res.status(409).json({ error: 'FOLIO_BLOQUEADO', message: `Tarima bloqueada por folio ${tarimaRes.rows[0].folio_asignado}` })
      }

      const guiaRes = await req.tQuery(
        'SELECT id FROM guias WHERE id = $1 AND tarima_id = $2 AND tenant_id = $3',
        [guiaId, tarimaId, req.tenantId]
      )
      if (guiaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Guía no encontrada en esta tarima' })
      }

      await req.tQuery('DELETE FROM guias WHERE id = $1 AND tenant_id = $2', [guiaId, req.tenantId])

      const countRes = await req.tQuery('SELECT COUNT(*) as cnt FROM guias WHERE tarima_id = $1 AND tenant_id = $2', [tarimaId, req.tenantId])
      const newCount = parseInt(countRes.rows[0].cnt)
      await req.tQuery('UPDATE tarimas SET cantidad_guias = $1 WHERE id = $2 AND tenant_id = $3', [newCount, tarimaId, req.tenantId])

      res.json({ success: true, cantidad_guias: newCount })
    } catch (error) {
      console.error('Delete guia from tarima error:', error)
      res.status(500).json({ error: 'Error eliminando guía' })
    }
  }
)

// GET /api/dropscan/tarimas/:id/log
router.get('/:id/log',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'ver'),
  async (req, res) => {
    try {
      const { id } = req.params
      const numId = parseInt(id, 10)
      if (isNaN(numId)) return res.status(400).json({ error: 'ID inválido' })

      // RLS scopes tarimas to the current tenant automatically via app.tenant_id
      const owns = await req.tQuery(
        `SELECT id FROM tarimas WHERE id = $1`,
        [numId]
      )
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Tarima no encontrada' })

      // Fetch audit log events + synthesize a creation entry from the tarimas row
      const [auditRes, tarimaRes] = await Promise.all([
        req.tQuery(
          `SELECT al.id, al.action, al.details, al.created_at AS timestamp,
                  COALESCE(u.nombre_completo, al.user_email) AS usuario_nombre
           FROM audit_log al
           LEFT JOIN usuarios u ON u.id = al.user_id
           WHERE al.entity_type = 'tarima' AND al.entity_id::text = $1
           ORDER BY al.created_at ASC`,
          [String(numId)]
        ),
        req.tQuery(
          `SELECT t.fecha_inicio, COALESCE(u.nombre_completo, u.email) AS operador_nombre
           FROM tarimas t
           LEFT JOIN usuarios u ON u.id = t.operador_id
           WHERE t.id = $1`,
          [numId]
        ),
      ])

      const creationEntry = tarimaRes.rows[0]
        ? {
            id: `synthetic-creation-${numId}`,
            action: 'CREAR_TARIMA',
            details: null,
            timestamp: tarimaRes.rows[0].fecha_inicio,
            usuario_nombre: tarimaRes.rows[0].operador_nombre,
          }
        : null

      const log = [
        ...(creationEntry ? [creationEntry] : []),
        ...auditRes.rows,
      ]
      res.json({ log })
    } catch (error) {
      console.error('[tarima/log] error:', error.message, '| code:', error.code, '| detail:', error.detail)
      res.status(500).json({ error: 'Error obteniendo historial' })
    }
  }
)

// DELETE /api/dropscan/tarimas/:id
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.tarimas', 'eliminar'),
  async (req, res) => {
    try {
      const { id } = req.params

      const tarimaRes = await req.tQuery('SELECT * FROM tarimas WHERE id = $1 AND tenant_id = $2', [id, req.tenantId])
      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }

      // Cascade deletes guias and alertas
      await req.tQuery('DELETE FROM tarimas WHERE id = $1 AND tenant_id = $2', [id, req.tenantId])
      res.json({ success: true, message: 'Tarima eliminada' })
    } catch (error) {
      console.error('Delete tarima error:', error)
      res.status(500).json({ error: 'Error eliminando tarima' })
    }
  }
)

export default router
