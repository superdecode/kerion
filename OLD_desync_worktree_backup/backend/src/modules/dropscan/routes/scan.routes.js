import { Router } from 'express'
import { query, getClient } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getTodayMX } from '../../../shared/utils/dateUtils.js'

const router = Router()

// Helper: generate a unique tarima code using MAX sequence number (not COUNT)
async function generateTarimaCodigo(dbClient) {
  const today = getTodayMX().replace(/-/g, '')
  const prefix = `TAR-${today}-`
  const maxRes = await dbClient.query(
    `SELECT MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)) AS max_seq
     FROM tarimas WHERE codigo LIKE $1`,
    [`${prefix}%`]
  )
  const next = (maxRes.rows[0].max_seq || 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

// POST /api/dropscan/sessions/start — any authenticated user can start scanning
router.post('/sessions/start',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { empresa_id, canal_id, usuario_operador, usuario_interno_id, nivel_usuario } = req.body
      const userId = req.user.id
      const empId = parseInt(empresa_id)
      const canId = parseInt(canal_id)

      if (!empId || !canId) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'empresa_id y canal_id son requeridos' })
      }

      // Verify empresa and canal exist in configuraciones
      const empCheck = await client.query('SELECT id FROM configuraciones WHERE id = $1', [empId])
      const canCheck = await client.query('SELECT id FROM configuraciones WHERE id = $1', [canId])
      if (empCheck.rows.length === 0 || canCheck.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Empresa o canal no encontrado' })
      }

      // Auto-close stale sessions older than 24h to prevent orphans
      await client.query(
        `UPDATE sesiones_escaneo SET activa = false, fecha_fin = CURRENT_TIMESTAMP
         WHERE operador_id = $1 AND activa = true AND fecha_inicio < NOW() - INTERVAL '24 hours'`,
        [userId]
      )

      // Auto-close zombie sessions whose active tarima is no longer EN_PROCESO.
      // This prevents orphan sessions from blocking new tabs after unexpected crashes.
      await client.query(
        `UPDATE sesiones_escaneo s
         SET activa = false, fecha_fin = CURRENT_TIMESTAMP
         FROM tarimas t
         WHERE s.operador_id = $1
           AND s.activa = true
           AND s.tarima_actual_id = t.id
           AND t.estado <> 'EN_PROCESO'`,
        [userId]
      )

      // Check for existing active sessions (max 3 allowed)
      const existing = await client.query(
        'SELECT id FROM sesiones_escaneo WHERE operador_id = $1 AND activa = true',
        [userId]
      )
      if (existing.rows.length >= 3) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Máximo 3 sesiones activas permitidas', sesion_id: existing.rows[0].id })
      }

      // Generate tarima code and create tarima (retry on unique collision)
      let tarima
      for (let attempt = 0; attempt < 5; attempt++) {
        const tarimaCodigo = await generateTarimaCodigo(client)
        try {
          const tarimaRes = await client.query(
            `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             RETURNING *`,
            [tarimaCodigo, empId, canId, userId]
          )
          tarima = tarimaRes.rows[0]
          break
        } catch (e) {
          if (e.code === '23505' && e.constraint === 'tarimas_codigo_key' && attempt < 4) continue
          throw e
        }
      }

      // Create session
      const sesionRes = await client.query(
        `INSERT INTO sesiones_escaneo (operador_id, empresa_id, canal_id, tarima_actual_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, empId, canId, tarima.id]
      )
      const sesion = sesionRes.rows[0]

      await client.query('COMMIT')

      // Try to set operator context columns OUTSIDE transaction (non-fatal if columns don't exist)
      const operadorNombre = usuario_operador || req.fullUser?.nombre_completo || null
      try {
        await query(
          `UPDATE sesiones_escaneo SET usuario_operador = $1, nivel_usuario = $2, usuario_interno_id = $3
           WHERE id = $4`,
          [operadorNombre, nivel_usuario || null, usuario_interno_id || null, sesion.id]
        )
      } catch {
        // Operator columns don't exist yet — non-fatal
      }

      res.status(201).json({
        sesion,
        tarima_actual: tarima,
        tarimas_activas: [tarima]
      })
    } catch (error) {
      try { await client.query('ROLLBACK') } catch {}
      console.error('Start session error:', error.message, error.detail || '')
      res.status(500).json({ error: 'Error iniciando sesión', detail: error.message })
    } finally {
      client.release()
    }
  }
)

// GET /api/dropscan/sessions/active
router.get('/sessions/active',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'ver'),
  async (req, res) => {
    try {
      const sesionRes = await query(
        `SELECT s.*, e.nombre as empresa_nombre, c.nombre as canal_nombre
         FROM sesiones_escaneo s
         LEFT JOIN configuraciones e ON s.empresa_id = e.id
         LEFT JOIN configuraciones c ON s.canal_id = c.id
         WHERE s.operador_id = $1 AND s.activa = true
         ORDER BY s.fecha_inicio DESC`,
        [req.user.id]
      )

      if (sesionRes.rows.length === 0) {
        return res.json({ sesion: null, tarima_actual: null, tarimas_activas: [], ultimas_guias: [] })
      }

      const sesion = sesionRes.rows[0]

      // Get current tarima for this session
      let tarima = null
      if (sesion.tarima_actual_id) {
        const tarimaRes = await query(
          `SELECT * FROM tarimas WHERE id = $1`,
          [sesion.tarima_actual_id]
        )
        tarima = tarimaRes.rows[0] || null
      }

      // Get all scanned guides for current tarima (max 100 — no artificial limit)
      let ultimas_guias = []
      if (tarima) {
        const guiasRes = await query(
          `SELECT id, codigo_guia, posicion, timestamp_escaneo
           FROM guias WHERE tarima_id = $1
           ORDER BY posicion DESC`,
          [tarima.id]
        )
        ultimas_guias = guiasRes.rows
      }

      res.json({ sesion, tarima_actual: tarima, tarimas_activas: [tarima].filter(Boolean), ultimas_guias })
    } catch (error) {
      console.error('Get active session error:', error)
      res.status(500).json({ error: 'Error obteniendo sesión activa' })
    }
  }
)

// GET /api/dropscan/sessions/all-active
// Returns all active sessions for the current operator so frontend can restore all tabs.
router.get('/sessions/all-active',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'ver'),
  async (req, res) => {
    try {
      const sesionRes = await query(
        `SELECT s.*, e.nombre as empresa_nombre, c.nombre as canal_nombre
         FROM sesiones_escaneo s
         LEFT JOIN configuraciones e ON s.empresa_id = e.id
         LEFT JOIN configuraciones c ON s.canal_id = c.id
         WHERE s.operador_id = $1 AND s.activa = true
         ORDER BY s.fecha_inicio ASC`,
        [req.user.id]
      )

      if (sesionRes.rows.length === 0) {
        return res.json({ sesiones: [] })
      }

      const sesiones = await Promise.all(sesionRes.rows.map(async (sesion) => {
        let tarima = null
        if (sesion.tarima_actual_id) {
          const tarimaRes = await query(
            `SELECT * FROM tarimas WHERE id = $1 AND estado = 'EN_PROCESO'`,
            [sesion.tarima_actual_id]
          )
          tarima = tarimaRes.rows[0] || null
        }

        // Skip sessions that point to invalid/non-active tarimas.
        if (!tarima) return null

        const guiasRes = await query(
          `SELECT id, codigo_guia, posicion, timestamp_escaneo
           FROM guias WHERE tarima_id = $1
           ORDER BY posicion DESC`,
          [tarima.id]
        )

        return {
          sesion,
          tarima_actual: tarima,
          tarimas_activas: [tarima],
          ultimas_guias: guiasRes.rows
        }
      }))

      res.json({ sesiones: sesiones.filter(Boolean) })
    } catch (error) {
      console.error('Get all active sessions error:', error)
      res.status(500).json({ error: 'Error obteniendo sesiones activas' })
    }
  }
)

// POST /api/dropscan/sessions/:id/scan — any authenticated user can scan
router.post('/sessions/:id/scan',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const sessionId = req.params.id
      const { codigo_guia, tarima_id } = req.body // tarima_id is optional for multi-tarima support
      const userId = req.user.id

      if (!codigo_guia || !codigo_guia.trim()) {
        return res.status(400).json({ error: 'codigo_guia es requerido' })
      }

      const code = codigo_guia.trim().toUpperCase()

      // Get active session
      const sesionRes = await client.query(
        'SELECT * FROM sesiones_escaneo WHERE id = $1 AND operador_id = $2 AND activa = true',
        [sessionId, userId]
      )
      if (sesionRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Sesión no encontrada o inactiva' })
      }
      const sesion = sesionRes.rows[0]

      // Get target tarima — FOR UPDATE locks the row to prevent concurrent position conflicts
      const targetTarimaId = tarima_id || sesion.tarima_actual_id
      const tarimaRes = await client.query(
        'SELECT * FROM tarimas WHERE id = $1 AND estado = $2 AND operador_id = $3 FOR UPDATE',
        [targetTarimaId, 'EN_PROCESO', userId]
      )
      if (tarimaRes.rows.length === 0) {
        // Check what happened to the tarima for a better error message
        const deadTarimaRes = await client.query(
          'SELECT id, estado, codigo FROM tarimas WHERE id = $1 AND operador_id = $2',
          [targetTarimaId, userId]
        )
        const deadTarima = deadTarimaRes.rows[0]
        // Auto-close orphan session so the frontend can start a fresh one
        await client.query(
          'UPDATE sesiones_escaneo SET activa = false, fecha_fin = CURRENT_TIMESTAMP WHERE id = $1',
          [sessionId]
        )
        await client.query('COMMIT')
        return res.status(400).json({
          error: deadTarima
            ? `Tarima ${deadTarima.codigo} está ${deadTarima.estado} (no se pueden agregar más guías)`
            : 'No hay tarima activa',
          code: 'TARIMA_NO_ACTIVA',
          tarima_estado: deadTarima?.estado || null,
        })
      }
      let tarima = tarimaRes.rows[0]

      // Check for duplicate in current tarima
      const dupInTarima = await client.query(
        'SELECT id, posicion, timestamp_escaneo FROM guias WHERE codigo_guia = $1 AND tarima_id = $2',
        [code, tarima.id]
      )
      if (dupInTarima.rows.length > 0) {
        const origLocal = dupInTarima.rows[0]
        await client.query(
          `INSERT INTO alertas_duplicados (codigo_guia, tarima_id, operador_id, guia_original_id, tarima_original_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [code, tarima.id, userId, origLocal.id, tarima.id]
        )
        await client.query(
          'UPDATE sesiones_escaneo SET alertas_duplicados = alertas_duplicados + 1 WHERE id = $1',
          [sessionId]
        )
        await client.query('COMMIT')
        return res.status(409).json({
          error: 'DUPLICADO',
          message: 'Guía ya escaneada en esta tarima',
          duplicado_en: 'tarima_actual',
          tarima_original: tarima.codigo,
          posicion_original: origLocal.posicion,
          timestamp_original: origLocal.timestamp_escaneo
        })
      }

      // Check for duplicate in other tarimas
      const dupGlobal = await client.query(
        `SELECT g.id, g.tarima_id, g.posicion, g.timestamp_escaneo, t.codigo as tarima_codigo
         FROM guias g JOIN tarimas t ON g.tarima_id = t.id
         WHERE g.codigo_guia = $1 AND g.tarima_id != $2
         LIMIT 1`,
        [code, tarima.id]
      )
      if (dupGlobal.rows.length > 0) {
        const orig = dupGlobal.rows[0]
        await client.query(
          `INSERT INTO alertas_duplicados (codigo_guia, tarima_id, operador_id, guia_original_id, tarima_original_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [code, tarima.id, userId, orig.id, orig.tarima_id]
        )
        await client.query(
          'UPDATE sesiones_escaneo SET alertas_duplicados = alertas_duplicados + 1 WHERE id = $1',
          [sessionId]
        )
        await client.query('COMMIT')
        return res.status(409).json({
          error: 'DUPLICADO',
          message: `Guía ya escaneada en tarima ${orig.tarima_codigo}`,
          duplicado_en: 'otra_tarima',
          tarima_original: orig.tarima_codigo,
          posicion_original: orig.posicion
        })
      }

      // Calculate position from real DB count (accurate with FOR UPDATE lock)
      const countRes = await client.query(
        'SELECT COUNT(*) AS cnt FROM guias WHERE tarima_id = $1',
        [tarima.id]
      )
      const newPos = parseInt(countRes.rows[0].cnt) + 1
      const guiaOperador = sesion.usuario_operador || null
      const guiaNivel = sesion.nivel_usuario || null
      const guiaInternoId = sesion.usuario_interno_id || null
      const guiaRes = await client.query(
        `INSERT INTO guias (codigo_guia, tarima_id, posicion, operador_id, usuario_operador, nivel_usuario, usuario_interno_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [code, tarima.id, newPos, userId, guiaOperador, guiaNivel, guiaInternoId]
      )
      const guia = guiaRes.rows[0]

      // Update tarima count atomically — avoids stale-value overwrite
      await client.query(
        'UPDATE tarimas SET cantidad_guias = cantidad_guias + 1 WHERE id = $1',
        [tarima.id]
      )

      // Update session total
      await client.query(
        'UPDATE sesiones_escaneo SET total_guias = total_guias + 1 WHERE id = $1',
        [sessionId]
      )

      // Fetch guias_por_tarima from config (default 100)
      let gpt = 100
      try {
        const gptRes = await client.query(
          `SELECT config_json FROM configuraciones
           WHERE modulo = 'dropscan' AND tipo = 'parametros' AND codigo = 'default' LIMIT 1`
        )
        if (gptRes.rows.length > 0 && gptRes.rows[0].config_json?.guias_por_tarima) {
          gpt = parseInt(gptRes.rows[0].config_json.guias_por_tarima) || 100
        }
      } catch (_) { /* keep default */ }

      let nueva_tarima = null
      let tarima_completada = false

      // Check if tarima is complete
      if (newPos >= gpt) {
        tarima_completada = true
        await client.query(
          `UPDATE tarimas SET estado = 'FINALIZADA', fecha_cierre = CURRENT_TIMESTAMP,
             tiempo_armado_segundos = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fecha_inicio))::INTEGER
           WHERE id = $1`,
          [tarima.id]
        )
        await client.query(
          'UPDATE sesiones_escaneo SET tarimas_completadas = tarimas_completadas + 1 WHERE id = $1',
          [sessionId]
        )

        // Auto-create new tarima (retry on unique collision)
        for (let attempt = 0; attempt < 5; attempt++) {
          const newCodigo = await generateTarimaCodigo(client)
          try {
            const newTarimaRes = await client.query(
              `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio)
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *`,
              [newCodigo, sesion.empresa_id, sesion.canal_id, userId]
            )
            nueva_tarima = newTarimaRes.rows[0]
            break
          } catch (e) {
            if (e.code === '23505' && e.constraint === 'tarimas_codigo_key' && attempt < 4) continue
            throw e
          }
        }

        await client.query(
          'UPDATE sesiones_escaneo SET tarima_actual_id = $1 WHERE id = $2',
          [nueva_tarima.id, sessionId]
        )
      }

      // Refresh tarima data
      const updatedTarima = await client.query('SELECT * FROM tarimas WHERE id = $1', [tarima.id])

      await client.query('COMMIT')

      res.status(201).json({
        success: true,
        guia,
        tarima: updatedTarima.rows[0],
        nueva_tarima,
        tarima_completada,
        guias_por_tarima: gpt,
        alerta: newPos >= (gpt - 10) && newPos < gpt
          ? { tipo: 'capacidad', message: `Quedan ${gpt - newPos} posiciones`, remaining: gpt - newPos, guias_por_tarima: gpt }
          : null
      })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Scan error:', error)
      res.status(500).json({ error: 'Error escaneando guía' })
    } finally {
      client.release()
    }
  }
)

// POST /api/dropscan/sessions/:id/add-tarima - Create additional tarima for multi-tarima support
router.post('/sessions/:id/add-tarima',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const sessionId = req.params.id
      const userId = req.user.id
      const maxTarimas = 3 // Maximum simultaneous tarimas

      // Get active session
      const sesionRes = await client.query(
        'SELECT * FROM sesiones_escaneo WHERE id = $1 AND operador_id = $2 AND activa = true',
        [sessionId, userId]
      )
      if (sesionRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Sesión no encontrada o inactiva' })
      }
      const sesion = sesionRes.rows[0]

      // Count current active tarimas for this session
      const countRes = await client.query(
        `SELECT COUNT(*) FROM tarimas 
         WHERE operador_id = $1 AND estado = 'EN_PROCESO' 
         AND fecha_inicio >= $2`,
        [userId, sesion.fecha_inicio]
      )
      const currentCount = parseInt(countRes.rows[0].count)

      if (currentCount >= maxTarimas) {
        await client.query('ROLLBACK')
        return res.status(400).json({ 
          error: `Máximo ${maxTarimas} tarimas simultáneas permitidas`,
          current_count: currentCount,
          max_allowed: maxTarimas
        })
      }

      // Generate tarima code and create (retry on unique collision)
      let tarimaRes
      for (let attempt = 0; attempt < 5; attempt++) {
        const tarimaCodigo = await generateTarimaCodigo(client)
        try {
          tarimaRes = await client.query(
            `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             RETURNING *`,
            [tarimaCodigo, sesion.empresa_id, sesion.canal_id, userId]
          )
          break
        } catch (e) {
          if (e.code === '23505' && e.constraint === 'tarimas_codigo_key' && attempt < 4) continue
          throw e
        }
      }
      if (!tarimaRes) throw new Error('Failed to generate unique tarima code')
      const newTarima = tarimaRes.rows[0]

      // Update session to point to new tarima as current
      await client.query(
        'UPDATE sesiones_escaneo SET tarima_actual_id = $1 WHERE id = $2',
        [newTarima.id, sessionId]
      )

      // Get all active tarimas
      const allTarimasRes = await client.query(
        `SELECT * FROM tarimas 
         WHERE operador_id = $1 AND estado = 'EN_PROCESO' 
         AND fecha_inicio >= $2
         ORDER BY fecha_inicio ASC`,
        [userId, sesion.fecha_inicio]
      )

      await client.query('COMMIT')

      res.status(201).json({
        success: true,
        nueva_tarima: newTarima,
        tarimas_activas: allTarimasRes.rows,
        total_activas: allTarimasRes.rows.length
      })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Add tarima error:', error)
      res.status(500).json({ error: 'Error creando tarima adicional' })
    } finally {
      client.release()
    }
  }
)

// POST /api/dropscan/sessions/:id/switch-tarima - Switch active tarima
router.post('/sessions/:id/switch-tarima',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    try {
      const sessionId = req.params.id
      const { tarima_id } = req.body
      const userId = req.user.id

      if (!tarima_id) {
        return res.status(400).json({ error: 'tarima_id es requerido' })
      }

      // Verify session and tarima belong to user
      const sesionRes = await query(
        'SELECT * FROM sesiones_escaneo WHERE id = $1 AND operador_id = $2 AND activa = true',
        [sessionId, userId]
      )
      if (sesionRes.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada' })
      }

      const tarimaRes = await query(
        `SELECT * FROM tarimas WHERE id = $1 AND operador_id = $2 AND estado = 'EN_PROCESO'`,
        [tarima_id, userId]
      )
      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada o no activa' })
      }

      // Update session to point to selected tarima
      await query(
        'UPDATE sesiones_escaneo SET tarima_actual_id = $1 WHERE id = $2',
        [tarima_id, sessionId]
      )

      // Get guides for the switched tarima
      const guiasRes = await query(
        `SELECT id, codigo_guia, posicion, timestamp_escaneo
         FROM guias WHERE tarima_id = $1
         ORDER BY posicion DESC LIMIT 10`,
        [tarima_id]
      )

      res.json({
        success: true,
        tarima_actual: tarimaRes.rows[0],
        ultimas_guias: guiasRes.rows
      })
    } catch (error) {
      console.error('Switch tarima error:', error)
      res.status(500).json({ error: 'Error cambiando tarima' })
    }
  }
)

// POST /api/dropscan/sessions/:id/end
router.post('/sessions/:id/end',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    try {
      const sessionId = req.params.id
      const userId = req.user.id

      const result = await query(
        `UPDATE sesiones_escaneo SET activa = false, fecha_fin = CURRENT_TIMESTAMP
         WHERE id = $1 AND operador_id = $2 AND activa = true
         RETURNING *`,
        [sessionId, userId]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada' })
      }

      const sesion = result.rows[0]

      // Only finalize/delete the tarima linked to THIS session (not all operator tarimas)
      if (sesion.tarima_actual_id) {
        const tarimaCheck = await query(
          'SELECT id, cantidad_guias, estado FROM tarimas WHERE id = $1 AND estado = $2',
          [sesion.tarima_actual_id, 'EN_PROCESO']
        )
        if (tarimaCheck.rows.length > 0) {
          const t = tarimaCheck.rows[0]
          if (t.cantidad_guias > 0) {
            await query(
              `UPDATE tarimas SET estado = 'FINALIZADA', fecha_cierre = CURRENT_TIMESTAMP,
                   tiempo_armado_segundos = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fecha_inicio))::INTEGER
               WHERE id = $1`,
              [t.id]
            )
          } else {
            await query('DELETE FROM tarimas WHERE id = $1', [t.id])
          }
        }
      }

      res.json({ success: true, sesion: result.rows[0] })
    } catch (error) {
      console.error('End session error:', error)
      res.status(500).json({ error: 'Error finalizando sesión' })
    }
  }
)

// DELETE /api/dropscan/sessions/:sessionId/guia/:guiaId
router.delete('/sessions/:sessionId/guia/:guiaId',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'eliminar'),
  async (req, res) => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { sessionId, guiaId } = req.params

      const guiaRes = await client.query('SELECT * FROM guias WHERE id = $1', [guiaId])
      if (guiaRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Guía no encontrada' })
      }

      const guia = guiaRes.rows[0]
      await client.query('DELETE FROM guias WHERE id = $1', [guiaId])

      // Reorder positions
      await client.query(
        `UPDATE guias SET posicion = posicion - 1
         WHERE tarima_id = $1 AND posicion > $2`,
        [guia.tarima_id, guia.posicion]
      )

      // Update tarima count
      await client.query(
        'UPDATE tarimas SET cantidad_guias = cantidad_guias - 1 WHERE id = $1',
        [guia.tarima_id]
      )

      // Update session count
      await client.query(
        'UPDATE sesiones_escaneo SET total_guias = total_guias - 1 WHERE id = $1',
        [sessionId]
      )

      await client.query('COMMIT')
      res.json({ success: true, message: 'Guía eliminada' })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Delete guia error:', error)
      res.status(500).json({ error: 'Error eliminando guía' })
    } finally {
      client.release()
    }
  }
)

export default router
