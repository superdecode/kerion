import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requireAnyPermission, requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()
const requireDespachoValidar = (action) => requireAnyPermission([
  { modulePath: 'despacho.validar', action },
  { modulePath: 'despacho.folios', action },
])

// ── Conductores ───────────────────────────────────────────────────────────────

router.get('/conductores',
  authenticateToken, loadFullUser,
  requireDespachoValidar('ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT * FROM dispatch_conductores WHERE tenant_id = $1 AND activo = true ORDER BY nombre ASC`,
        [req.tenantId]
      )
      res.json({ conductores: result.rows })
    } catch (error) {
      console.error('List conductores error:', error)
      res.status(500).json({ error: 'Error obteniendo conductores' })
    }
  }
)

router.post('/conductores',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'crear'),
  async (req, res) => {
    try {
      const { nombre, licencia = null, telefono = null } = req.body
      if (!nombre?.trim()) return res.status(400).json({ error: 'nombre es requerido' })
      const result = await req.tQuery(
        `INSERT INTO dispatch_conductores (tenant_id, nombre, licencia, telefono)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.tenantId, nombre.trim(), licencia, telefono]
      )
      res.status(201).json({ conductor: result.rows[0] })
    } catch (error) {
      console.error('Create conductor error:', error)
      res.status(500).json({ error: 'Error creando conductor' })
    }
  }
)

router.put('/conductores/:id',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'actualizar'),
  async (req, res) => {
    try {
      const { nombre, licencia = null, telefono = null, activo = true } = req.body
      const result = await req.tQuery(
        `UPDATE dispatch_conductores
         SET nombre = COALESCE($1, nombre), licencia = $2, telefono = $3, activo = $4, updated_at = now()
         WHERE id = $5 AND tenant_id = $6 RETURNING *`,
        [nombre?.trim(), licencia, telefono, activo, req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Conductor no encontrado' })
      res.json({ conductor: result.rows[0] })
    } catch (error) {
      console.error('Update conductor error:', error)
      res.status(500).json({ error: 'Error actualizando conductor' })
    }
  }
)

router.delete('/conductores/:id',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'eliminar'),
  async (req, res) => {
    try {
      await req.tQuery(
        `UPDATE dispatch_conductores SET activo = false, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      res.json({ ok: true })
    } catch (error) {
      console.error('Delete conductor error:', error)
      res.status(500).json({ error: 'Error eliminando conductor' })
    }
  }
)

// ── Unidades ──────────────────────────────────────────────────────────────────

router.get('/unidades',
  authenticateToken, loadFullUser,
  requireDespachoValidar('ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT * FROM dispatch_unidades WHERE tenant_id = $1 AND activo = true ORDER BY placa ASC`,
        [req.tenantId]
      )
      res.json({ unidades: result.rows })
    } catch (error) {
      console.error('List unidades error:', error)
      res.status(500).json({ error: 'Error obteniendo unidades' })
    }
  }
)

router.post('/unidades',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'crear'),
  async (req, res) => {
    try {
      const { placa, tipo = 'camion' } = req.body
      const capacidad_kg = req.body.capacidad_kg !== '' && req.body.capacidad_kg != null ? req.body.capacidad_kg : null
      if (!placa?.trim()) return res.status(400).json({ error: 'placa es requerida' })
      const result = await req.tQuery(
        `INSERT INTO dispatch_unidades (tenant_id, placa, tipo, capacidad_kg)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.tenantId, placa.trim().toUpperCase(), tipo, capacidad_kg]
      )
      res.status(201).json({ unidad: result.rows[0] })
    } catch (error) {
      console.error('Create unidad error:', error)
      res.status(500).json({ error: 'Error creando unidad' })
    }
  }
)

router.put('/unidades/:id',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'actualizar'),
  async (req, res) => {
    try {
      const { placa, tipo, activo = true } = req.body
      const capacidad_kg = req.body.capacidad_kg !== '' && req.body.capacidad_kg != null ? req.body.capacidad_kg : null
      const result = await req.tQuery(
        `UPDATE dispatch_unidades
         SET placa = COALESCE($1, placa), tipo = COALESCE($2, tipo), capacidad_kg = $3, activo = $4, updated_at = now()
         WHERE id = $5 AND tenant_id = $6 RETURNING *`,
        [placa?.trim()?.toUpperCase(), tipo, capacidad_kg, activo, req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Unidad no encontrada' })
      res.json({ unidad: result.rows[0] })
    } catch (error) {
      console.error('Update unidad error:', error)
      res.status(500).json({ error: 'Error actualizando unidad' })
    }
  }
)

router.delete('/unidades/:id',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'eliminar'),
  async (req, res) => {
    try {
      await req.tQuery(
        `UPDATE dispatch_unidades SET activo = false, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      res.json({ ok: true })
    } catch (error) {
      console.error('Delete unidad error:', error)
      res.status(500).json({ error: 'Error eliminando unidad' })
    }
  }
)

export default router
