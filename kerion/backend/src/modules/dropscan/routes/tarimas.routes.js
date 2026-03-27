import { Router } from 'express'
import { query } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// GET /api/dropscan/tarimas
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.historial', 'ver'),
  async (req, res) => {
    try {
      const { fecha_inicio, fecha_fin, empresa_id, canal_id, estado, operador_id, page = 1, limit = 20 } = req.query
      const offset = (parseInt(page) - 1) * parseInt(limit)

      let where = []
      let params = []
      let paramCount = 0

      if (fecha_inicio) {
        paramCount++
        where.push(`t.fecha_inicio >= $${paramCount}`)
        params.push(fecha_inicio)
      }
      if (fecha_fin) {
        paramCount++
        where.push(`t.fecha_inicio <= $${paramCount}::date + interval '1 day'`)
        params.push(fecha_fin)
      }
      if (empresa_id) {
        paramCount++
        where.push(`t.empresa_id = $${paramCount}`)
        params.push(empresa_id)
      }
      if (canal_id) {
        paramCount++
        where.push(`t.canal_id = $${paramCount}`)
        params.push(canal_id)
      }
      if (estado) {
        paramCount++
        where.push(`t.estado = $${paramCount}`)
        params.push(estado)
      }
      if (operador_id) {
        paramCount++
        where.push(`t.operador_id = $${paramCount}`)
        params.push(operador_id)
      }

      const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

      // Count total
      const countRes = await query(
        `SELECT COUNT(*) FROM tarimas t ${whereClause}`,
        params
      )
      const total = parseInt(countRes.rows[0].count)

      // Get paginated results
      paramCount++
      params.push(parseInt(limit))
      paramCount++
      params.push(offset)

      const result = await query(
        `SELECT t.id, t.codigo, t.estado, t.cantidad_guias,
                t.fecha_inicio, t.fecha_cierre, t.tiempo_armado_segundos,
                t.bloqueada, t.bloqueada_razon,
                e.nombre as empresa_nombre, e.codigo as empresa_codigo,
                c.nombre as canal_nombre, c.codigo as canal_codigo,
                u.nombre_completo as operador_nombre, u.codigo as operador_codigo
         FROM tarimas t
         JOIN configuraciones e ON t.empresa_id = e.id
         JOIN configuraciones c ON t.canal_id = c.id
         JOIN usuarios u ON t.operador_id = u.id
         ${whereClause}
         ORDER BY t.fecha_inicio DESC
         LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
        params
      )

      res.json({
        tarimas: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
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
  requirePermission('dropscan.historial', 'ver'),
  async (req, res) => {
    try {
      const { id } = req.params

      const tarimaRes = await query(
        `SELECT t.*, e.nombre as empresa_nombre, e.codigo as empresa_codigo,
                c.nombre as canal_nombre, c.codigo as canal_codigo,
                u.nombre_completo as operador_nombre, u.codigo as operador_codigo,
                ub.nombre_completo as bloqueada_por_nombre
         FROM tarimas t
         JOIN configuraciones e ON t.empresa_id = e.id
         JOIN configuraciones c ON t.canal_id = c.id
         JOIN usuarios u ON t.operador_id = u.id
         LEFT JOIN usuarios ub ON t.bloqueada_por = ub.id
         WHERE t.id = $1`,
        [id]
      )

      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }

      const guiasRes = await query(
        `SELECT g.id, g.codigo_guia, g.posicion, g.timestamp_escaneo,
                u.nombre_completo as operador_nombre
         FROM guias g
         JOIN usuarios u ON g.operador_id = u.id
         WHERE g.tarima_id = $1
         ORDER BY g.posicion ASC`,
        [id]
      )

      res.json({
        tarima: tarimaRes.rows[0],
        guias: guiasRes.rows
      })
    } catch (error) {
      console.error('Get tarima detail error:', error)
      res.status(500).json({ error: 'Error obteniendo tarima' })
    }
  }
)

// POST /api/dropscan/tarimas/:id/lock
router.post('/:id/lock',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.historial', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { razon } = req.body

      const result = await query(
        `UPDATE tarimas SET bloqueada = true, bloqueada_por = $1,
                bloqueada_fecha = CURRENT_TIMESTAMP, bloqueada_razon = $2
         WHERE id = $3 RETURNING *`,
        [req.user.id, razon || null, id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }

      res.json({ success: true, tarima: result.rows[0] })
    } catch (error) {
      console.error('Lock tarima error:', error)
      res.status(500).json({ error: 'Error bloqueando tarima' })
    }
  }
)

// POST /api/dropscan/tarimas/:id/unlock
router.post('/:id/unlock',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.historial', 'desbloquear'),
  async (req, res) => {
    try {
      const { id } = req.params

      const result = await query(
        `UPDATE tarimas SET bloqueada = false, bloqueada_por = NULL,
                bloqueada_fecha = NULL, bloqueada_razon = NULL
         WHERE id = $1 RETURNING *`,
        [id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }

      res.json({ success: true, tarima: result.rows[0] })
    } catch (error) {
      console.error('Unlock tarima error:', error)
      res.status(500).json({ error: 'Error desbloqueando tarima' })
    }
  }
)

// DELETE /api/dropscan/tarimas/:id
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.historial', 'eliminar'),
  async (req, res) => {
    try {
      const { id } = req.params

      // Check if blocked
      const tarimaRes = await query('SELECT * FROM tarimas WHERE id = $1', [id])
      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada' })
      }

      const tarima = tarimaRes.rows[0]
      if (tarima.bloqueada) {
        // Only total permission can delete blocked tarimas
        const level = req.fullUser.permisos?.dropscan?.historial
        if (level !== 'total' && req.fullUser.rol_nombre !== 'Administrador') {
          return res.status(403).json({ error: 'Tarima bloqueada, se requiere nivel total' })
        }
      }

      // Cascade deletes guias and alertas
      await query('DELETE FROM tarimas WHERE id = $1', [id])
      res.json({ success: true, message: 'Tarima eliminada' })
    } catch (error) {
      console.error('Delete tarima error:', error)
      res.status(500).json({ error: 'Error eliminando tarima' })
    }
  }
)

export default router
