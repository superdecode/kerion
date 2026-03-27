import { Router } from 'express'
import { query, getClient } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// POST /api/dropscan/sessions/start
router.post('/sessions/start',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { empresa_id, canal_id } = req.body
      const userId = req.user.id

      if (!empresa_id || !canal_id) {
        return res.status(400).json({ error: 'empresa_id y canal_id son requeridos' })
      }

      // Check for existing active session
      const existing = await client.query(
        'SELECT id FROM sesiones_escaneo WHERE operador_id = $1 AND activa = true',
        [userId]
      )
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Ya tienes una sesión activa', sesion_id: existing.rows[0].id })
      }

      // Generate tarima code
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const countRes = await client.query(
        `SELECT COUNT(*) FROM tarimas WHERE codigo LIKE $1`,
        [`TAR-${today}-%`]
      )
      const num = parseInt(countRes.rows[0].count) + 1
      const tarimaCodigo = `TAR-${today}-${String(num).padStart(3, '0')}`

      // Create tarima
      const tarimaRes = await client.query(
        `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [tarimaCodigo, empresa_id, canal_id, userId]
      )
      const tarima = tarimaRes.rows[0]

      // Create session
      const sesionRes = await client.query(
        `INSERT INTO sesiones_escaneo (operador_id, empresa_id, canal_id, tarima_actual_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, empresa_id, canal_id, tarima.id]
      )

      await client.query('COMMIT')

      res.status(201).json({
        sesion: sesionRes.rows[0],
        tarima_actual: tarima
      })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Start session error:', error)
      res.status(500).json({ error: 'Error iniciando sesión' })
    } finally {
      client.release()
    }
  }
)

// GET /api/dropscan/sessions/active
router.get('/sessions/active',
  authenticateToken,
  async (req, res) => {
    try {
      const sesionRes = await query(
        `SELECT s.*, e.nombre as empresa_nombre, c.nombre as canal_nombre
         FROM sesiones_escaneo s
         JOIN configuraciones e ON s.empresa_id = e.id
         JOIN configuraciones c ON s.canal_id = c.id
         WHERE s.operador_id = $1 AND s.activa = true
         LIMIT 1`,
        [req.user.id]
      )

      if (sesionRes.rows.length === 0) {
        return res.json({ sesion: null, tarima_actual: null, ultimas_guias: [] })
      }

      const sesion = sesionRes.rows[0]

      // Get current tarima
      let tarima = null
      if (sesion.tarima_actual_id) {
        const tarimaRes = await query('SELECT * FROM tarimas WHERE id = $1', [sesion.tarima_actual_id])
        tarima = tarimaRes.rows[0] || null
      }

      // Get last 10 scanned guides
      let ultimas_guias = []
      if (tarima) {
        const guiasRes = await query(
          `SELECT id, codigo_guia, posicion, timestamp_escaneo
           FROM guias WHERE tarima_id = $1
           ORDER BY posicion DESC LIMIT 10`,
          [tarima.id]
        )
        ultimas_guias = guiasRes.rows
      }

      res.json({ sesion, tarima_actual: tarima, ultimas_guias })
    } catch (error) {
      console.error('Get active session error:', error)
      res.status(500).json({ error: 'Error obteniendo sesión activa' })
    }
  }
)

// POST /api/dropscan/sessions/:id/scan
router.post('/sessions/:id/scan',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const sessionId = req.params.id
      const { codigo_guia } = req.body
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

      // Get current tarima
      const tarimaRes = await client.query(
        'SELECT * FROM tarimas WHERE id = $1 AND estado = $2',
        [sesion.tarima_actual_id, 'EN_PROCESO']
      )
      if (tarimaRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'No hay tarima activa' })
      }
      let tarima = tarimaRes.rows[0]

      // Check for duplicate in current tarima
      const dupInTarima = await client.query(
        'SELECT id FROM guias WHERE codigo_guia = $1 AND tarima_id = $2',
        [code, tarima.id]
      )
      if (dupInTarima.rows.length > 0) {
        await client.query(
          `INSERT INTO alertas_duplicados (codigo_guia, tarima_id, operador_id, guia_original_id, tarima_original_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [code, tarima.id, userId, dupInTarima.rows[0].id, tarima.id]
        )
        await client.query(
          'UPDATE sesiones_escaneo SET alertas_duplicados = alertas_duplicados + 1 WHERE id = $1',
          [sessionId]
        )
        await client.query('COMMIT')
        return res.status(409).json({
          error: 'DUPLICADO',
          message: 'Guía ya escaneada en esta tarima',
          duplicado_en: 'tarima_actual'
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

      // Insert guide
      const newPos = tarima.cantidad_guias + 1
      const guiaRes = await client.query(
        `INSERT INTO guias (codigo_guia, tarima_id, posicion, operador_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [code, tarima.id, newPos, userId]
      )
      const guia = guiaRes.rows[0]

      // Update tarima count
      await client.query(
        'UPDATE tarimas SET cantidad_guias = $1 WHERE id = $2',
        [newPos, tarima.id]
      )

      // Update session total
      await client.query(
        'UPDATE sesiones_escaneo SET total_guias = total_guias + 1 WHERE id = $1',
        [sessionId]
      )

      let nueva_tarima = null
      let tarima_completada = false

      // Check if tarima is complete (100 guides)
      if (newPos >= 100) {
        tarima_completada = true
        await client.query(
          `UPDATE tarimas SET estado = 'COMPLETA', fecha_cierre = CURRENT_TIMESTAMP WHERE id = $1`,
          [tarima.id]
        )
        await client.query(
          'UPDATE sesiones_escaneo SET tarimas_completadas = tarimas_completadas + 1 WHERE id = $1',
          [sessionId]
        )

        // Auto-create new tarima
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const countRes = await client.query(
          `SELECT COUNT(*) FROM tarimas WHERE codigo LIKE $1`,
          [`TAR-${today}-%`]
        )
        const num = parseInt(countRes.rows[0].count) + 1
        const newCodigo = `TAR-${today}-${String(num).padStart(3, '0')}`

        const newTarimaRes = await client.query(
          `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *`,
          [newCodigo, sesion.empresa_id, sesion.canal_id, userId]
        )
        nueva_tarima = newTarimaRes.rows[0]

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
        alerta: newPos >= 90 && newPos < 100
          ? { tipo: 'capacidad', message: `Tarima al ${newPos}%` }
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

// POST /api/dropscan/sessions/:id/end
router.post('/sessions/:id/end',
  authenticateToken,
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

      // Close any open tarima
      const sesion = result.rows[0]
      if (sesion.tarima_actual_id) {
        const openTarima = await query(
          `SELECT id FROM tarimas WHERE id = $1 AND estado = 'EN_PROCESO'`,
          [sesion.tarima_actual_id]
        )
        // Leave it as EN_PROCESO - it can be resumed or completed later
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
