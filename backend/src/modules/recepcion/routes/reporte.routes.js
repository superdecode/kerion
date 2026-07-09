import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// GET /orders/:id/lista-recepcion
router.get('/orders/:id/lista-recepcion',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'ver'),
  async (req, res) => {
    try {
      const orderRes = await req.tQuery(
        `SELECT o.*, u.nombre_completo AS responsable_nombre
         FROM inbound_orders o
         LEFT JOIN usuarios u ON u.id = o.responsable_id
         WHERE o.id=$1 AND o.tenant_id=$2`,
        [req.params.id, req.tenantId]
      )
      if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Orden no encontrada' })

      const linesRes = await req.tQuery(
        `SELECT box_type, custom_box_barcode, sku, qty_per_box
         FROM inbound_lines WHERE order_id=$1 AND tenant_id=$2 ORDER BY created_at ASC`,
        [req.params.id, req.tenantId]
      )

      res.json({ order: orderRes.rows[0], lines: linesRes.rows })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener datos del reporte' })
    }
  }
)

export default router
