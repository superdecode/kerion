import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getTodayMX } from '../../../shared/utils/dateUtils.js'

const router = Router()

// GET /api/dropscan/guide-usage — monthly guide usage vs plan limit for this tenant
router.get('/guide-usage',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'ver'),
  async (req, res) => {
    try {
      const [planRes, usageRes] = await Promise.all([
        req.tQuery(
          `SELECT p.guide_limit, p.name AS plan_name
           FROM tenants t
           LEFT JOIN plans p ON t.current_plan_id = p.id
           WHERE t.id = $1`,
          [req.tenantId]
        ),
        req.tQuery(
          `SELECT COUNT(*) AS count FROM guias
           WHERE tenant_id = $1
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`,
          [req.tenantId]
        ),
      ])
      const guide_limit = planRes.rows[0]?.guide_limit ?? null
      const plan_name = planRes.rows[0]?.plan_name ?? null
      const used = parseInt(usageRes.rows[0]?.count ?? 0)
      res.json({
        used,
        limit: guide_limit,
        plan_name,
        at_limit: guide_limit !== null && used >= guide_limit,
      })
    } catch (error) {
      console.error('Guide usage error:', error)
      res.status(500).json({ error: 'Error obteniendo uso de guias' })
    }
  }
)

// Helper: generate a tenant-scoped tarima code.
// Runs inside an existing transaction client so the SELECT and subsequent INSERT are atomic.
async function generateTarimaCodigo(client, tenantId) {
  const today = getTodayMX().replace(/-/g, '')
  const prefix = `TAR-${today}-`
  const maxRes = await client.query(
    `SELECT MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)) AS max_seq
     FROM tarimas WHERE codigo LIKE $1 AND tenant_id = $2`,
    [`${prefix}%`, tenantId]
  )
  const next = (maxRes.rows[0].max_seq || 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

// POST /api/dropscan/sessions/start — any authenticated user can start scanning
router.post('/sessions/start',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    if (!req.tenantId) return res.status(400).json({ error: 'Contexto de tenant no disponible' })
    let client
    try {
      client = await req.tGetClient()
      const { empresa_id, canal_id, usuario_operador, usuario_interno_id, nivel_usuario } = req.body
      const userId = req.user.id
      const empId = parseInt(empresa_id)
      const canId = parseInt(canal_id)

      if (!empId || !canId) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'empresa_id y canal_id son requeridos' })
      }

      // Verify empresa and canal exist in configuraciones for this tenant
      const empCheck = await client.query('SELECT id FROM configuraciones WHERE id = $1 AND tenant_id = $2', [empId, req.tenantId])
      const canCheck = await client.query('SELECT id FROM configuraciones WHERE id = $1 AND tenant_id = $2', [canId, req.tenantId])
      if (empCheck.rows.length === 0 || canCheck.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Empresa o canal no encontrado' })
      }

      // Check monthly guide limit against active plan
      const planLimitRes = await client.query(
        `SELECT p.guide_limit FROM tenants t
         LEFT JOIN plans p ON t.current_plan_id = p.id
         WHERE t.id = $1`,
        [req.tenantId]
      )
      const guideLimit = planLimitRes.rows[0]?.guide_limit ?? null
      if (guideLimit !== null) {
        const monthUsageRes = await client.query(
          `SELECT COUNT(*) AS count FROM guias
           WHERE tenant_id = $1
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`,
          [req.tenantId]
        )
        const used = parseInt(monthUsageRes.rows[0]?.count ?? 0)
        if (used >= guideLimit) {
          await client.query('ROLLBACK')
          return res.status(402).json({
            error: 'Limite de guias del plan alcanzado',
            code: 'PLAN_LIMIT_REACHED',
            used,
            limit: guideLimit,
          })
        }
      }

      // Auto-close stale sessions older than 24h to prevent orphans
      await client.query(
        `UPDATE sesiones_escaneo SET activa = false, fecha_fin = CURRENT_TIMESTAMP
         WHERE operador_id = $1 AND tenant_id = $2 AND activa = true AND fecha_inicio < NOW() - INTERVAL '24 hours'`,
        [userId, req.tenantId]
      )

      // Auto-close zombie sessions whose active tarima is no longer EN_PROCESO.
      // This prevents orphan sessions from blocking new tabs after unexpected crashes.
      await client.query(
        `UPDATE sesiones_escaneo s
         SET activa = false, fecha_fin = CURRENT_TIMESTAMP
         FROM tarimas t
         WHERE s.operador_id = $1
           AND s.tenant_id = $2
           AND s.activa = true
           AND s.tarima_actual_id = t.id
           AND t.estado <> 'EN_PROCESO'`,
        [userId, req.tenantId]
      )

      // Check for existing active sessions (max 3 allowed)
      const existing = await client.query(
        'SELECT id FROM sesiones_escaneo WHERE operador_id = $1 AND tenant_id = $2 AND activa = true',
        [userId, req.tenantId]
      )
      if (existing.rows.length >= 3) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Máximo 3 sesiones activas permitidas', sesion_id: existing.rows[0].id })
      }

      // Generate tarima code and create tarima (retry on unique collision within tenant)
      let tarima
      for (let attempt = 0; attempt < 5; attempt++) {
        const tarimaCodigo = await generateTarimaCodigo(client, req.tenantId)
        try {
          const tarimaRes = await client.query(
            `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio, tenant_id)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
             RETURNING *`,
            [tarimaCodigo, empId, canId, userId, req.tenantId]
          )
          tarima = tarimaRes.rows[0]
          break
        } catch (e) {
          if (e.code === '23505' && e.constraint === 'tarimas_tenant_codigo_unique' && attempt < 4) continue
          throw e
        }
      }

      // Create session
      const sesionRes = await client.query(
        `INSERT INTO sesiones_escaneo (operador_id, empresa_id, canal_id, tarima_actual_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, empId, canId, tarima.id, req.tenantId]
      )
      const sesion = sesionRes.rows[0]

      await client.query('COMMIT')

      // Try to set operator context columns OUTSIDE transaction (non-fatal if columns don't exist)
      const operadorNombre = usuario_operador || req.fullUser?.nombre_completo || null
      try {
        await req.tQuery(
          `UPDATE sesiones_escaneo SET usuario_operador = $1, nivel_usuario = $2, usuario_interno_id = $3
           WHERE id = $4 AND tenant_id = $5`,
          [operadorNombre, nivel_usuario || null, usuario_interno_id || null, sesion.id, req.tenantId]
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
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Start session error:', error.message, error.detail || '')
      res.status(500).json({ error: 'Error iniciando sesión', detail: error.message })
    } finally {
      if (client) client.release()
    }
  }
)

// GET /api/dropscan/sessions/active
router.get('/sessions/active',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'ver'),
  async (req, res) => {
    try {
      const sesionRes = await req.tQuery(
        `SELECT s.*, e.nombre as empresa_nombre, c.nombre as canal_nombre
         FROM sesiones_escaneo s
         LEFT JOIN configuraciones e ON s.empresa_id = e.id AND e.tenant_id = s.tenant_id
         LEFT JOIN configuraciones c ON s.canal_id = c.id AND c.tenant_id = s.tenant_id
         WHERE s.operador_id = $1 AND s.activa = true AND s.tenant_id = $2
         ORDER BY s.fecha_inicio DESC`,
        [req.user.id, req.tenantId]
      )

      if (sesionRes.rows.length === 0) {
        return res.json({ sesion: null, tarima_actual: null, tarimas_activas: [], ultimas_guias: [] })
      }

      const sesion = sesionRes.rows[0]

      // Get current tarima for this session
      let tarima = null
      if (sesion.tarima_actual_id) {
        const tarimaRes = await req.tQuery(
          `SELECT * FROM tarimas WHERE id = $1 AND tenant_id = $2`,
          [sesion.tarima_actual_id, req.tenantId]
        )
        tarima = tarimaRes.rows[0] || null
      }

      // Get all scanned guides for current tarima
      let ultimas_guias = []
      if (tarima) {
        const guiasRes = await req.tQuery(
          `SELECT id, codigo_guia, posicion, timestamp_escaneo
           FROM guias WHERE tarima_id = $1 AND tenant_id = $2
           ORDER BY posicion DESC`,
          [tarima.id, req.tenantId]
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
      const sesionRes = await req.tQuery(
        `SELECT s.*, e.nombre as empresa_nombre, c.nombre as canal_nombre
         FROM sesiones_escaneo s
         LEFT JOIN configuraciones e ON s.empresa_id = e.id AND e.tenant_id = s.tenant_id
         LEFT JOIN configuraciones c ON s.canal_id = c.id AND c.tenant_id = s.tenant_id
         WHERE s.operador_id = $1 AND s.activa = true AND s.tenant_id = $2
         ORDER BY s.fecha_inicio ASC`,
        [req.user.id, req.tenantId]
      )

      if (sesionRes.rows.length === 0) {
        return res.json({ sesiones: [] })
      }

      const sesiones = await Promise.all(sesionRes.rows.map(async (sesion) => {
        let tarima = null
        if (sesion.tarima_actual_id) {
          const tarimaRes = await req.tQuery(
            `SELECT * FROM tarimas WHERE id = $1 AND estado = 'EN_PROCESO' AND tenant_id = $2`,
            [sesion.tarima_actual_id, req.tenantId]
          )
          tarima = tarimaRes.rows[0] || null
        }

        // Skip sessions that point to invalid/non-active tarimas.
        if (!tarima) return null

        const guiasRes = await req.tQuery(
          `SELECT id, codigo_guia, posicion, timestamp_escaneo
           FROM guias WHERE tarima_id = $1 AND tenant_id = $2
           ORDER BY posicion DESC`,
          [tarima.id, req.tenantId]
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
    if (!req.tenantId) return res.status(400).json({ error: 'Contexto de tenant no disponible' })
    let client
    try {
      client = await req.tGetClient()
      const sessionId = req.params.id
      const { codigo_guia, tarima_id } = req.body // tarima_id is optional for multi-tarima support
      const userId = req.user.id

      if (!codigo_guia || !codigo_guia.trim()) {
        await client.query('ROLLBACK')
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
          `INSERT INTO alertas_duplicados (codigo_guia, tarima_id, operador_id, guia_original_id, tarima_original_id, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [code, tarima.id, userId, origLocal.id, tarima.id, req.tenantId]
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
         WHERE g.codigo_guia = $1 AND g.tarima_id != $2 AND g.tenant_id = $3
         LIMIT 1`,
        [code, tarima.id, req.tenantId]
      )
      if (dupGlobal.rows.length > 0) {
        const orig = dupGlobal.rows[0]
        await client.query(
          `INSERT INTO alertas_duplicados (codigo_guia, tarima_id, operador_id, guia_original_id, tarima_original_id, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [code, tarima.id, userId, orig.id, orig.tarima_id, req.tenantId]
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
        `INSERT INTO guias (codigo_guia, tarima_id, posicion, operador_id, usuario_operador, nivel_usuario, usuario_interno_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [code, tarima.id, newPos, userId, guiaOperador, guiaNivel, guiaInternoId, req.tenantId]
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
           WHERE modulo = 'dropscan' AND tipo = 'parametros' AND codigo = 'default' AND tenant_id = $1 LIMIT 1`,
          [req.tenantId]
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
          const newCodigo = await generateTarimaCodigo(client, req.tenantId)
          try {
            const newTarimaRes = await client.query(
              `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio, tenant_id)
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
               RETURNING id`,
              [newCodigo, tarima.empresa_id, tarima.canal_id, userId, req.tenantId]
            )
            nueva_tarima = newTarimaRes.rows[0]
            break
          } catch (e) {
            if (e.code === '23505' && e.constraint === 'tarimas_tenant_codigo_unique' && attempt < 4) continue
            throw e
          }
        }

        await client.query(
          'UPDATE sesiones_escaneo SET tarima_actual_id = $1 WHERE id = $2',
          [nueva_tarima.id, sessionId]
        )
      }

      // Refresh tarima data
      const updatedTarima = await client.query('SELECT * FROM tarimas WHERE id = $1 AND tenant_id = $2', [tarima.id, req.tenantId])

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
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Scan error:', error)
      res.status(500).json({ error: 'Error escaneando guía' })
    } finally {
      if (client) client.release()
    }
  }
)

// POST /api/dropscan/sessions/:id/add-tarima - Create additional tarima for multi-tarima support
router.post('/sessions/:id/add-tarima',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    if (!req.tenantId) return res.status(400).json({ error: 'Contexto de tenant no disponible' })
    let client
    try {
      client = await req.tGetClient()
      const sessionId = req.params.id
      const userId = req.user.id
      const maxTarimas = 3 // Maximum simultaneous tarimas

      // Get active session
      const sesionRes = await client.query(
        'SELECT * FROM sesiones_escaneo WHERE id = $1 AND operador_id = $2 AND tenant_id = $3 AND activa = true',
        [sessionId, userId, req.tenantId]
      )
      if (sesionRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Sesión no encontrada o inactiva' })
      }
      const sesion = sesionRes.rows[0]

      // Count current active tarimas for this tenant session
      const countRes = await client.query(
        `SELECT COUNT(*) FROM tarimas
         WHERE operador_id = $1 AND tenant_id = $2 AND estado = 'EN_PROCESO'
         AND fecha_inicio >= $3`,
        [userId, req.tenantId, sesion.fecha_inicio]
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
      const { empresa_id, canal_id } = sesion
      let tarimaRes
      for (let attempt = 0; attempt < 5; attempt++) {
        const tarimaCodigo = await generateTarimaCodigo(client, req.tenantId)
        try {
          tarimaRes = await client.query(
            `INSERT INTO tarimas (codigo, empresa_id, canal_id, operador_id, fecha_inicio, tenant_id)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
             RETURNING id`,
            [tarimaCodigo, empresa_id, canal_id, userId, req.tenantId]
          )
          break
        } catch (e) {
          if (e.code === '23505' && e.constraint === 'tarimas_tenant_codigo_unique' && attempt < 4) continue
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
         WHERE operador_id = $1 AND tenant_id = $2 AND estado = 'EN_PROCESO'
         AND fecha_inicio >= $3
         ORDER BY fecha_inicio ASC`,
        [userId, req.tenantId, sesion.fecha_inicio]
      )

      await client.query('COMMIT')

      res.status(201).json({
        success: true,
        nueva_tarima: newTarima,
        tarimas_activas: allTarimasRes.rows,
        total_activas: allTarimasRes.rows.length
      })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Add tarima error:', error)
      res.status(500).json({ error: 'Error creando tarima adicional' })
    } finally {
      if (client) client.release()
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

      // Verify session and tarima belong to user and tenant
      const sesionRes = await req.tQuery(
        'SELECT * FROM sesiones_escaneo WHERE id = $1 AND operador_id = $2 AND activa = true AND tenant_id = $3',
        [sessionId, userId, req.tenantId]
      )
      if (sesionRes.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada' })
      }

      const tarimaRes = await req.tQuery(
        `SELECT * FROM tarimas WHERE id = $1 AND operador_id = $2 AND estado = 'EN_PROCESO' AND tenant_id = $3`,
        [tarima_id, userId, req.tenantId]
      )
      if (tarimaRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tarima no encontrada o no activa' })
      }

      await req.tQuery(
        'UPDATE sesiones_escaneo SET tarima_actual_id = $1 WHERE id = $2 AND tenant_id = $3',
        [tarima_id, sessionId, req.tenantId]
      )

      const guiasRes = await req.tQuery(
        `SELECT id, codigo_guia, posicion, timestamp_escaneo
         FROM guias WHERE tarima_id = $1 AND tenant_id = $2
         ORDER BY posicion DESC LIMIT 10`,
        [tarima_id, req.tenantId]
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

      const result = await req.tQuery(
        `UPDATE sesiones_escaneo SET activa = false, fecha_fin = CURRENT_TIMESTAMP
         WHERE id = $1 AND operador_id = $2 AND activa = true AND tenant_id = $3
         RETURNING *`,
        [sessionId, userId, req.tenantId]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada' })
      }

      const sesion = result.rows[0]

      // Only finalize/delete the tarima linked to THIS session (not all operator tarimas)
      if (sesion.tarima_actual_id) {
        const tarimaCheck = await req.tQuery(
          'SELECT id, cantidad_guias, estado FROM tarimas WHERE id = $1 AND estado = $2 AND tenant_id = $3',
          [sesion.tarima_actual_id, 'EN_PROCESO', req.tenantId]
        )
        if (tarimaCheck.rows.length > 0) {
          const t = tarimaCheck.rows[0]
          if (t.cantidad_guias > 0) {
            await req.tQuery(
              `UPDATE tarimas SET estado = 'FINALIZADA', fecha_cierre = CURRENT_TIMESTAMP,
                   tiempo_armado_segundos = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fecha_inicio))::INTEGER
               WHERE id = $1 AND tenant_id = $2`,
              [t.id, req.tenantId]
            )
          } else {
            await req.tQuery('DELETE FROM tarimas WHERE id = $1 AND tenant_id = $2', [t.id, req.tenantId])
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
    if (!req.tenantId) return res.status(400).json({ error: 'Contexto de tenant no disponible' })
    let client
    try {
      client = await req.tGetClient()
      const { sessionId, guiaId } = req.params

      const guiaRes = await client.query('SELECT * FROM guias WHERE id = $1 AND tenant_id = $2', [guiaId, req.tenantId])
      if (guiaRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Guía no encontrada' })
      }

      const guia = guiaRes.rows[0]
      await client.query('DELETE FROM guias WHERE id = $1 AND tenant_id = $2', [guiaId, req.tenantId])

      // Reorder positions
      await client.query(
        `UPDATE guias SET posicion = posicion - 1
         WHERE tarima_id = $1 AND posicion > $2 AND tenant_id = $3`,
        [guia.tarima_id, guia.posicion, req.tenantId]
      )

      // Update tarima count
      await client.query(
        'UPDATE tarimas SET cantidad_guias = cantidad_guias - 1 WHERE id = $1 AND tenant_id = $2',
        [guia.tarima_id, req.tenantId]
      )

      // Update session count
      await client.query(
        'UPDATE sesiones_escaneo SET total_guias = total_guias - 1 WHERE id = $1 AND tenant_id = $2',
        [sessionId, req.tenantId]
      )

      await client.query('COMMIT')
      res.json({ success: true, message: 'Guía eliminada' })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Delete guia error:', error)
      res.status(500).json({ error: 'Error eliminando guía' })
    } finally {
      if (client) client.release()
    }
  }
)

// PATCH /api/dropscan/sessions/:sessionId/guia/:guiaId/peso
router.patch('/sessions/:sessionId/guia/:guiaId/peso',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.escaneo', 'crear'),
  async (req, res) => {
    if (!req.tenantId) return res.status(400).json({ error: 'Contexto de tenant no disponible' })
    try {
      const { sessionId, guiaId } = req.params
      const { peso_kg } = req.body

      const pesoVal = parseFloat(peso_kg)
      if (isNaN(pesoVal) || pesoVal < 0.001 || pesoVal > 9999.999) {
        return res.status(400).json({ error: 'peso_kg debe estar entre 0.001 y 9999.999' })
      }

      // Verify session belongs to this operator
      const sesionRes = await req.tQuery(
        'SELECT id FROM sesiones_escaneo WHERE id = $1 AND operador_id = $2 AND activa = true AND tenant_id = $3',
        [sessionId, req.user.id, req.tenantId]
      )
      if (sesionRes.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada o inactiva' })
      }

      const result = await req.tQuery(
        'UPDATE guias SET peso_kg = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, peso_kg',
        [pesoVal, guiaId, req.tenantId]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Guía no encontrada' })
      }

      res.json({ success: true, peso_kg: result.rows[0].peso_kg })
    } catch (error) {
      console.error('Update peso error:', error)
      res.status(500).json({ error: 'Error guardando peso' })
    }
  }
)

export default router
