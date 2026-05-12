import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query, getClient } from '../../../config/database.js'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

const SALT_ROUNDS = 10
const WEAK_PINS = ['0000', '1234', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']
const MAX_ATTEMPTS = 3
const LOCKOUT_MINUTES = 5

// In-memory lockout tracking (per usuario_interno_id)
const lockouts = new Map()

function isLockedOut(userId) {
  const entry = lockouts.get(userId)
  if (!entry) return false
  if (entry.attempts >= MAX_ATTEMPTS) {
    const elapsed = (Date.now() - entry.lastAttempt) / 1000 / 60
    if (elapsed < LOCKOUT_MINUTES) {
      return true
    }
    // Lockout expired, reset
    lockouts.delete(userId)
    return false
  }
  return false
}

function recordFailedAttempt(userId) {
  const entry = lockouts.get(userId) || { attempts: 0, lastAttempt: 0 }
  entry.attempts += 1
  entry.lastAttempt = Date.now()
  lockouts.set(userId, entry)
  return MAX_ATTEMPTS - entry.attempts
}

function clearAttempts(userId) {
  lockouts.delete(userId)
}

async function logEvent(evento, usuarioInternoId, usuarioInternoNombre, req, detalles = null) {
  try {
    const userId = req.user?.id || null
    const userEmail = req.user?.email || null
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null
    await query(
      `INSERT INTO logs_usuarios_internos (evento, usuario_interno_id, usuario_interno_nombre, usuario_sistema_id, usuario_sistema_email, detalles, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [evento, usuarioInternoId, usuarioInternoNombre, userId, userEmail, detalles ? JSON.stringify(detalles) : null, ip]
    )
  } catch (err) {
    console.error('Log event error (non-blocking):', err.message)
  }
}

// ─── GET /api/dropscan/operadores — List active internal operators ───
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'ver'),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT id, nombre, activo, created_at, updated_at
         FROM usuarios_internos
         WHERE eliminado = false
         ORDER BY nombre ASC`
      )
      res.json(result.rows)
    } catch (error) {
      console.error('List operadores error:', error)
      res.status(500).json({ error: 'Error listando operadores internos' })
    }
  }
)

// ─── GET /api/dropscan/operadores/activos — List only active (for scan dropdown) ───
router.get('/activos',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'ver'),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT id, nombre
         FROM usuarios_internos
         WHERE activo = true AND eliminado = false
         ORDER BY nombre ASC`
      )
      res.json(result.rows)
    } catch (error) {
      console.error('List active operadores error:', error)
      res.status(500).json({ error: 'Error listando operadores activos' })
    }
  }
)

// ─── POST /api/dropscan/operadores — Create internal operator ───
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'crear'),
  async (req, res) => {
    try {
      const { nombre, pin, activo } = req.body

      // Validate nombre
      if (!nombre || nombre.trim().length < 3 || nombre.trim().length > 50) {
        return res.status(400).json({ error: 'El nombre debe tener entre 3 y 50 caracteres' })
      }

      // Validate PIN
      if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos numéricos' })
      }
      if (WEAK_PINS.includes(pin)) {
        return res.status(400).json({ error: 'PIN demasiado débil. Elija un PIN más seguro' })
      }

      // Check unique nombre
      const existingName = await query(
        'SELECT id FROM usuarios_internos WHERE LOWER(nombre) = LOWER($1) AND eliminado = false',
        [nombre.trim()]
      )
      if (existingName.rows.length > 0) {
        return res.status(409).json({ error: 'Ya existe un operador con ese nombre' })
      }

      // Check unique PIN (compare hashes — we need to check all active users)
      const allUsers = await query(
        'SELECT id, pin_hash FROM usuarios_internos WHERE eliminado = false'
      )
      for (const u of allUsers.rows) {
        if (await bcrypt.compare(pin, u.pin_hash)) {
          return res.status(409).json({ error: 'Este PIN ya está en uso por otro operador' })
        }
      }

      // Hash PIN and create
      const pin_hash = await bcrypt.hash(pin, SALT_ROUNDS)
      const result = await query(
        `INSERT INTO usuarios_internos (nombre, pin_hash, activo, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, nombre, activo, created_at, updated_at`,
        [nombre.trim(), pin_hash, activo !== false, req.user.id]
      )

      await logEvent('USUARIO_CREADO', result.rows[0].id, nombre.trim(), req)
      await auditLog(req, 'create_operador_interno', 'usuarios_internos', result.rows[0].id, { nombre: nombre.trim() })

      res.status(201).json(result.rows[0])
    } catch (error) {
      console.error('Create operador error:', error)
      res.status(500).json({ error: 'Error creando operador interno' })
    }
  }
)

// ─── PUT /api/dropscan/operadores/:id — Update operator (name, active) ───
router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { nombre, activo } = req.body

      // Validate nombre
      if (nombre !== undefined) {
        if (!nombre || nombre.trim().length < 3 || nombre.trim().length > 50) {
          return res.status(400).json({ error: 'El nombre debe tener entre 3 y 50 caracteres' })
        }
        // Check unique nombre (excluding self)
        const existingName = await query(
          'SELECT id FROM usuarios_internos WHERE LOWER(nombre) = LOWER($1) AND eliminado = false AND id != $2',
          [nombre.trim(), id]
        )
        if (existingName.rows.length > 0) {
          return res.status(409).json({ error: 'Ya existe un operador con ese nombre' })
        }
      }

      const fields = []
      const values = []
      let idx = 1

      if (nombre !== undefined) { fields.push(`nombre = $${idx++}`); values.push(nombre.trim()) }
      if (activo !== undefined) { fields.push(`activo = $${idx++}`); values.push(activo) }
      fields.push(`updated_by = $${idx++}`); values.push(req.user.id)

      if (fields.length <= 1) {
        return res.status(400).json({ error: 'No hay campos para actualizar' })
      }

      values.push(id)
      const result = await query(
        `UPDATE usuarios_internos SET ${fields.join(', ')}
         WHERE id = $${idx} AND eliminado = false
         RETURNING id, nombre, activo, created_at, updated_at`,
        values
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Operador no encontrado' })
      }

      await logEvent('USUARIO_ACTUALIZADO', parseInt(id), result.rows[0].nombre, req, { nombre, activo })
      res.json(result.rows[0])
    } catch (error) {
      console.error('Update operador error:', error)
      res.status(500).json({ error: 'Error actualizando operador interno' })
    }
  }
)

// ─── PUT /api/dropscan/operadores/:id/pin — Change PIN ───
router.put('/:id/pin',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { pin } = req.body

      // Validate PIN
      if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos numéricos' })
      }
      if (WEAK_PINS.includes(pin)) {
        return res.status(400).json({ error: 'PIN demasiado débil. Elija un PIN más seguro' })
      }

      // Get current user
      const current = await query(
        'SELECT id, nombre, pin_hash FROM usuarios_internos WHERE id = $1 AND eliminado = false',
        [id]
      )
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Operador no encontrado' })
      }

      // Check same PIN
      if (await bcrypt.compare(pin, current.rows[0].pin_hash)) {
        return res.status(400).json({ error: 'El nuevo PIN debe ser diferente al actual' })
      }

      // Check unique PIN
      const allUsers = await query(
        'SELECT id, pin_hash FROM usuarios_internos WHERE eliminado = false AND id != $1',
        [id]
      )
      for (const u of allUsers.rows) {
        if (await bcrypt.compare(pin, u.pin_hash)) {
          return res.status(409).json({ error: 'Este PIN ya está en uso por otro operador' })
        }
      }

      const pin_hash = await bcrypt.hash(pin, SALT_ROUNDS)
      await query(
        'UPDATE usuarios_internos SET pin_hash = $1, updated_by = $2 WHERE id = $3',
        [pin_hash, req.user.id, id]
      )

      await logEvent('PIN_CAMBIADO', parseInt(id), current.rows[0].nombre, req)
      res.json({ success: true, message: 'PIN actualizado correctamente' })
    } catch (error) {
      console.error('Change PIN error:', error)
      res.status(500).json({ error: 'Error cambiando PIN' })
    }
  }
)

// ─── DELETE /api/dropscan/operadores/:id — Soft delete operator ───
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'eliminar'),
  async (req, res) => {
    try {
      const { id } = req.params

      const current = await query(
        'SELECT id, nombre FROM usuarios_internos WHERE id = $1 AND eliminado = false',
        [id]
      )
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Operador no encontrado' })
      }

      // Check if there are any scan records associated
      const scanRecords = await query(
        'SELECT COUNT(*) FROM sesiones_escaneo WHERE usuario_interno_id = $1',
        [id]
      )
      const hasScans = parseInt(scanRecords.rows[0].count) > 0

      if (hasScans) {
        // Soft delete: mark as eliminado + deactivate
        await query(
          'UPDATE usuarios_internos SET eliminado = true, activo = false, updated_by = $1 WHERE id = $2',
          [req.user.id, id]
        )
        await logEvent('USUARIO_ELIMINADO', parseInt(id), current.rows[0].nombre, req, { soft: true })
      } else {
        // Hard delete: no scan records, safe to remove
        // Log before deleting to avoid FK issues, then clean up
        await logEvent('USUARIO_ELIMINADO', null, current.rows[0].nombre, req, { soft: false, original_id: parseInt(id) })
        await query('DELETE FROM logs_usuarios_internos WHERE usuario_interno_id = $1', [id])
        await query('DELETE FROM usuarios_internos WHERE id = $1', [id])
      }

      await auditLog(req, 'delete_operador_interno', 'usuarios_internos', parseInt(id), { nombre: current.rows[0].nombre })
      res.json({ success: true, message: 'Operador eliminado correctamente' })
    } catch (error) {
      console.error('Delete operador error:', error)
      res.status(500).json({ error: 'Error eliminando operador interno' })
    }
  }
)

// ─── POST /api/dropscan/operadores/validar-pin — Validate PIN for scanning ───
router.post('/validar-pin',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    try {
      const { usuario_interno_id, pin } = req.body

      if (!usuario_interno_id || !pin) {
        return res.status(400).json({ error: 'usuario_interno_id y pin son requeridos' })
      }

      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'El PIN debe ser 4 dígitos' })
      }

      // Check lockout
      if (isLockedOut(usuario_interno_id)) {
        await logEvent('ACCESO_BLOQUEADO', usuario_interno_id, null, req)
        return res.status(429).json({
          error: 'BLOQUEADO',
          message: `Demasiados intentos fallidos. Intente en ${LOCKOUT_MINUTES} minutos`,
          lockout_minutes: LOCKOUT_MINUTES
        })
      }

      // Get operator
      const result = await query(
        'SELECT id, nombre, pin_hash, activo FROM usuarios_internos WHERE id = $1 AND eliminado = false',
        [usuario_interno_id]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Operador no encontrado' })
      }

      const operador = result.rows[0]

      if (!operador.activo) {
        await logEvent('ACCESO_USUARIO_INACTIVO', operador.id, operador.nombre, req)
        return res.status(403).json({ error: 'INACTIVO', message: 'Este usuario está desactivado. Contacte al administrador.' })
      }

      // Compare PIN
      const match = await bcrypt.compare(pin, operador.pin_hash)
      if (!match) {
        const remaining = recordFailedAttempt(usuario_interno_id)
        await logEvent('ACCESO_FALLIDO', operador.id, operador.nombre, req, { intentos_restantes: remaining })
        return res.status(401).json({
          error: 'PIN_INCORRECTO',
          message: 'PIN incorrecto. Intente nuevamente.',
          intentos_restantes: Math.max(0, remaining)
        })
      }

      // Success — clear any lockout
      clearAttempts(usuario_interno_id)
      await logEvent('ACCESO_EXITOSO', operador.id, operador.nombre, req)

      res.json({
        success: true,
        operador: { id: operador.id, nombre: operador.nombre }
      })
    } catch (error) {
      console.error('Validate PIN error:', error)
      res.status(500).json({ error: 'Error validando PIN' })
    }
  }
)

export default router
