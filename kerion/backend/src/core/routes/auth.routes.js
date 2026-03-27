import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import env from '../../config/env.js'
import { query } from '../../config/database.js'
import { authenticateToken } from '../../shared/middleware/auth.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })
    }

    const result = await query(
      `SELECT u.*, r.nombre as rol_nombre, r.permisos as rol_permisos
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const user = result.rows[0]

    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({ error: 'Usuario inactivo o suspendido' })
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    // Update last access
    await query('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1', [user.id])

    // Build permissions from role or override
    const permisos = user.permisos_override || user.rol_permisos || {}

    const payload = {
      id: user.id,
      codigo: user.codigo,
      email: user.email,
      rol_id: user.rol_id,
      rol_nombre: user.rol_nombre,
    }

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN })

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        codigo: user.codigo,
        nombre_completo: user.nombre_completo,
        email: user.email,
        rol_id: user.rol_id,
        rol_nombre: user.rol_nombre,
        permisos,
        avatar_url: user.avatar_url,
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.codigo, u.nombre_completo, u.email, u.rol_id, u.estado,
              u.avatar_url, u.permisos_override, u.ultimo_acceso,
              r.nombre as rol_nombre, r.permisos as rol_permisos
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       WHERE u.id = $1`,
      [req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const user = result.rows[0]
    const permisos = user.permisos_override || user.rol_permisos || {}

    res.json({
      id: user.id,
      codigo: user.codigo,
      nombre_completo: user.nombre_completo,
      email: user.email,
      rol_id: user.rol_id,
      rol_nombre: user.rol_nombre,
      permisos,
      avatar_url: user.avatar_url,
      estado: user.estado,
      ultimo_acceso: user.ultimo_acceso,
    })
  } catch (error) {
    console.error('Auth/me error:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

export default router
