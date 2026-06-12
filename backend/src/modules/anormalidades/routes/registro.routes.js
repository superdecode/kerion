import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { format } from 'date-fns'
import { getNivelCriticoCodigo, getNivelMeta } from '../utils/niveles.js'

const router = Router()

const MUTABLE_ESTADOS = ['nuevo', 'en_proceso', 'cerrado']

function coerceRangeStart(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T00:00:00.000`
  return value
}

function coerceRangeEnd(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T23:59:59.999`
  return value
}

async function buildFechaLimite(req, fechaOcurrencia, nivel) {
  const fechaBase = fechaOcurrencia ? new Date(fechaOcurrencia) : new Date()
  const meta = await getNivelMeta(req.tQuery, req.tenantId, nivel)
  const horas = Number(meta?.horas_limite || 24)
  return new Date(fechaBase.getTime() + horas * 3600000)
}

// ── Folio generator ──────────────────────────────────────────────────────────
async function generateFolio(req) {
  const today = format(new Date(), 'yyyyMMdd')
  const res = await req.tQuery(
    `SELECT COUNT(*) AS cnt FROM anormalidades
     WHERE tenant_id = $1
       AND to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD') = $2`,
    [req.tenantId, today]
  )
  const seq = parseInt(res.rows[0].cnt, 10) + 1
  return `INC-${today}-${String(seq).padStart(4, '0')}`
}

// ── GET /api/anormalidades — lista paginada ──────────────────────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'ver'),
  async (req, res) => {
    try {
      const criticalNivel = await getNivelCriticoCodigo(req.tQuery, req.tenantId)
      const {
        page = 1, limit = 20,
        search, estado, proceso, nivel, responsable_id,
        fecha_desde, fecha_hasta, origen, cliente, sku, solo_vencidas, sin_responsable,
        sort = 'fecha_ocurrencia', dir = 'DESC',
      } = req.query

      const offset = (parseInt(page) - 1) * parseInt(limit)
      const ALLOWED_SORT = new Set(['fecha_ocurrencia','estado','nivel','proceso','folio','created_at'])
      const sortCol = ALLOWED_SORT.has(sort) ? sort : 'fecha_ocurrencia'
      const sortDir = dir === 'ASC' ? 'ASC' : 'DESC'

      let where = 'WHERE a.tenant_id = $1'
      const params = [req.tenantId]
      let p = 2

      if (search) {
        where += ` AND (
          a.folio ILIKE $${p}
          OR a.nombre ILIKE $${p}
          OR a.codigo ILIKE $${p}
          OR a.cliente ILIKE $${p}
          OR a.contenedor_orden ILIKE $${p}
          OR a.sku ILIKE $${p}
        )`
        params.push(`%${search}%`)
        p++
      }
      if (estado) {
        if (estado === 'vencido') {
          where += ` AND (a.estado NOT IN ('cerrado') AND a.fecha_limite < now())`
        } else {
          where += ` AND a.estado = $${p++}`
          params.push(estado)
        }
      }
      if (proceso) {
        const vals = String(proceso).split(',').filter(Boolean)
        if (vals.length === 1) { where += ` AND a.proceso = $${p++}`; params.push(vals[0]) }
        else if (vals.length > 1) { where += ` AND a.proceso = ANY($${p++})`; params.push(vals) }
      }
      if (nivel) {
        const vals = String(nivel).split(',').filter(Boolean)
        if (vals.length === 1) { where += ` AND a.nivel = $${p++}`; params.push(vals[0]) }
        else if (vals.length > 1) { where += ` AND a.nivel = ANY($${p++})`; params.push(vals) }
      }
      if (responsable_id) {
        const vals = String(responsable_id).split(',').filter(Boolean)
        if (vals.length === 1) { where += ` AND a.responsable_id = $${p++}`; params.push(vals[0]) }
        else if (vals.length > 1) { where += ` AND a.responsable_id = ANY($${p++}::int[])`; params.push(vals.map(Number).filter(Number.isFinite)) }
      }
      if (fecha_desde) { where += ` AND a.fecha_ocurrencia >= $${p++}`; params.push(coerceRangeStart(fecha_desde)) }
      if (fecha_hasta) { where += ` AND a.fecha_ocurrencia <= $${p++}`; params.push(coerceRangeEnd(fecha_hasta)) }
      if (origen) {
        const vals = String(origen).split(',').filter(Boolean)
        if (vals.length === 1) { where += ` AND a.origen_responsabilidad = $${p++}`; params.push(vals[0]) }
        else if (vals.length > 1) { where += ` AND a.origen_responsabilidad = ANY($${p++})`; params.push(vals) }
      }
      if (cliente) { where += ` AND a.cliente ILIKE $${p++}`; params.push(`%${cliente}%`) }
      if (sku) { where += ` AND a.sku ILIKE $${p++}`; params.push(`%${sku}%`) }
      if (String(solo_vencidas) === 'true') where += ` AND a.estado NOT IN ('cerrado') AND a.fecha_limite < now()`
      if (String(sin_responsable) === 'true') where += ' AND a.responsable_id IS NULL'

      const [countRes, rowsRes, resumenRes] = await Promise.all([
        req.tQuery(`SELECT COUNT(*) FROM anormalidades a ${where}`, params),
        req.tQuery(
          `SELECT a.*,
                  u.nombre_completo AS responsable_nombre,
                  u2.nombre_completo AS detectado_por_nombre_user,
                  CASE WHEN a.fecha_limite IS NOT NULL AND a.fecha_limite < now()
                            AND a.estado NOT IN ('cerrado') THEN true ELSE false END AS vencido,
                  EXTRACT(EPOCH FROM (COALESCE(a.fecha_cierre, now()) - a.created_at))/86400 AS dias_abierto
           FROM anormalidades a
           LEFT JOIN usuarios u ON a.responsable_id = u.id
           LEFT JOIN usuarios u2 ON a.detectado_por_id = u2.id
           ${where}
           ORDER BY a.${sortCol} ${sortDir}
          LIMIT $${p} OFFSET $${p + 1}`,
          [...params, parseInt(limit), offset]
        ),
        req.tQuery(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE a.estado NOT IN ('cerrado')) AS abiertas,
             COUNT(*) FILTER (WHERE a.nivel = $${p} AND a.estado NOT IN ('cerrado')) AS l3_abiertas,
             COUNT(*) FILTER (WHERE a.estado NOT IN ('cerrado') AND a.fecha_limite < now()) AS vencidas,
             COUNT(*) FILTER (WHERE a.responsable_id IS NULL) AS sin_asignar
           FROM anormalidades a
           ${where}`,
          [...params, criticalNivel]
        ),
      ])

      res.json({
        success: true,
        data: rowsRes.rows,
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        resumen: {
          total: parseInt(resumenRes.rows[0].total || 0),
          abiertas: parseInt(resumenRes.rows[0].abiertas || 0),
          l3_abiertas: parseInt(resumenRes.rows[0].l3_abiertas || 0),
          vencidas: parseInt(resumenRes.rows[0].vencidas || 0),
          sin_asignar: parseInt(resumenRes.rows[0].sin_asignar || 0),
        },
      })
    } catch (err) {
      console.error('[anorm.registro.list]', err.message)
      res.status(500).json({ error: 'Error al obtener anormalidades' })
    }
  }
)

// ── GET /api/anormalidades/:id ───────────────────────────────────────────────
router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'ver'),
  async (req, res) => {
    try {
      const [aRes, histRes, vinculosRes] = await Promise.all([
        req.tQuery(
          `SELECT a.*,
                  u.nombre_completo AS responsable_nombre,
                  u2.nombre_completo AS detectado_nombre,
                  ac.nombre_es AS codigo_nombre_es
           FROM anormalidades a
           LEFT JOIN usuarios u ON a.responsable_id = u.id
           LEFT JOIN usuarios u2 ON a.detectado_por_id = u2.id
           LEFT JOIN anormalidades_codigos ac ON a.codigo_id = ac.id
           WHERE a.id = $1 AND a.tenant_id = $2`,
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          `SELECT h.*, u.nombre_completo AS usuario_nombre_full
           FROM anormalidades_historial h
           LEFT JOIN usuarios u ON h.usuario_id = u.id
           WHERE h.anormalidad_id = $1 AND h.tenant_id = $2
           ORDER BY h.created_at DESC`,
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          `SELECT v.mejora_id, m.descripcion_problema, m.estado AS mejora_estado
           FROM anormalidades_mejoras_vinculos v
           JOIN anormalidades_mejoras m ON v.mejora_id = m.id
           WHERE v.anormalidad_id = $1 AND v.tenant_id = $2`,
          [req.params.id, req.tenantId]
        ),
      ])

      if (!aRes.rows.length) return res.status(404).json({ error: 'Anormalidad no encontrada' })

      res.json({
        success: true,
        data: {
          ...aRes.rows[0],
          historial: histRes.rows,
          mejoras_vinculadas: vinculosRes.rows,
        },
      })
    } catch (err) {
      console.error('[anorm.registro.get]', err.message)
      res.status(500).json({ error: 'Error al obtener anormalidad' })
    }
  }
)

// ── POST /api/anormalidades — crear ──────────────────────────────────────────
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'crear'),
  async (req, res) => {
    try {
      const {
        fecha_ocurrencia, proceso, codigo_id, codigo, nombre, nivel,
        cliente, almacen, contenedor_orden, sku, ubicacion,
        cantidad_afectada, monto_impacto, descripcion, evidencia,
        detectado_por_id, detectado_por_nombre, origen_responsabilidad,
        responsable_id,
      } = req.body

      if (!proceso || !codigo || !nombre || !nivel)
        return res.status(400).json({ error: 'proceso, codigo, nombre y nivel son requeridos' })

      const fechaBase = fecha_ocurrencia ? new Date(fecha_ocurrencia) : new Date()
      const fecha_limite = await buildFechaLimite(req, fechaBase, nivel)

      const folio = await generateFolio(req)

      const result = await req.tQuery(
        `INSERT INTO anormalidades
           (tenant_id, folio, fecha_ocurrencia, proceso, codigo_id, codigo, nombre, nivel,
            cliente, almacen, contenedor_orden, sku, ubicacion,
            cantidad_afectada, monto_impacto, descripcion, evidencia,
            detectado_por_id, detectado_por_nombre, origen_responsabilidad,
            responsable_id, fecha_limite, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          req.tenantId, folio, fechaBase, proceso, codigo_id || null, codigo, nombre, nivel,
          cliente || null, almacen || null, contenedor_orden || null, sku || null, ubicacion || null,
          cantidad_afectada || null, monto_impacto || null, descripcion || null,
          JSON.stringify(evidencia || []),
          detectado_por_id || null, detectado_por_nombre || null, origen_responsabilidad || null,
          responsable_id || null, fecha_limite, req.userId,
        ]
      )

      const row = result.rows[0]

      await req.tQuery(
        `INSERT INTO anormalidades_historial
           (anormalidad_id, tenant_id, usuario_id, usuario_nombre, estado_anterior, estado_nuevo, nota)
         VALUES ($1,$2,$3,$4,NULL,$5,'Anormalidad registrada')`,
        [row.id, req.tenantId, req.userId, req.fullUser?.nombre_completo || null, 'nuevo']
      )

      await auditLog(req.tenantId, req.userId, 'CREATE', 'anormalidades', String(row.id), { folio })

      res.status(201).json({ success: true, data: row })
    } catch (err) {
      console.error('[anorm.registro.create]', err.message)
      res.status(500).json({ error: 'Error al crear anormalidad' })
    }
  }
)

// ── PUT /api/anormalidades/:id — editar ──────────────────────────────────────
router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'actualizar'),
  async (req, res) => {
    try {
      const existing = await req.tQuery(
        'SELECT id, estado, fecha_ocurrencia, nivel FROM anormalidades WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'No encontrada' })

      const {
        fecha_ocurrencia, proceso, codigo_id, codigo, nombre, nivel,
        cliente, almacen, contenedor_orden, sku, ubicacion,
        cantidad_afectada, monto_impacto, descripcion, evidencia,
        detectado_por_id, detectado_por_nombre, origen_responsabilidad,
        responsable_id, accion_inmediata, causa_raiz, accion_preventiva,
      } = req.body

      const nextFecha = fecha_ocurrencia || existing.rows[0].fecha_ocurrencia
      const nextNivel = nivel || existing.rows[0].nivel
      const fecha_limite = await buildFechaLimite(req, nextFecha, nextNivel)

      const result = await req.tQuery(
        `UPDATE anormalidades SET
           fecha_ocurrencia     = COALESCE($3, fecha_ocurrencia),
           proceso              = COALESCE($4, proceso),
           codigo_id            = COALESCE($5, codigo_id),
           codigo               = COALESCE($6, codigo),
           nombre               = COALESCE($7, nombre),
           nivel                = COALESCE($8, nivel),
           cliente              = COALESCE($9, cliente),
           almacen              = COALESCE($10, almacen),
           contenedor_orden     = COALESCE($11, contenedor_orden),
           sku                  = COALESCE($12, sku),
           ubicacion            = COALESCE($13, ubicacion),
           cantidad_afectada    = COALESCE($14, cantidad_afectada),
           monto_impacto        = COALESCE($15, monto_impacto),
           descripcion          = COALESCE($16, descripcion),
           evidencia            = COALESCE($17::jsonb, evidencia),
           detectado_por_id     = COALESCE($18, detectado_por_id),
           detectado_por_nombre = COALESCE($19, detectado_por_nombre),
           origen_responsabilidad = COALESCE($20, origen_responsabilidad),
           responsable_id       = COALESCE($21, responsable_id),
           accion_inmediata     = COALESCE($22, accion_inmediata),
           causa_raiz           = COALESCE($23, causa_raiz),
           accion_preventiva    = COALESCE($24, accion_preventiva),
           fecha_limite         = $25,
           updated_at           = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [
          req.params.id, req.tenantId,
          fecha_ocurrencia || null, proceso || null,
          codigo_id !== undefined ? codigo_id : null,
          codigo || null, nombre || null, nivel || null,
          cliente !== undefined ? cliente : null,
          almacen !== undefined ? almacen : null,
          contenedor_orden !== undefined ? contenedor_orden : null,
          sku !== undefined ? sku : null,
          ubicacion !== undefined ? ubicacion : null,
          cantidad_afectada !== undefined ? cantidad_afectada : null,
          monto_impacto !== undefined ? monto_impacto : null,
          descripcion !== undefined ? descripcion : null,
          evidencia !== undefined ? JSON.stringify(evidencia) : null,
          detectado_por_id !== undefined ? detectado_por_id : null,
          detectado_por_nombre !== undefined ? detectado_por_nombre : null,
          origen_responsabilidad !== undefined ? origen_responsabilidad : null,
          responsable_id !== undefined ? responsable_id : null,
          accion_inmediata !== undefined ? accion_inmediata : null,
          causa_raiz !== undefined ? causa_raiz : null,
          accion_preventiva !== undefined ? accion_preventiva : null,
          fecha_limite,
        ]
      )

      await auditLog(req.tenantId, req.userId, 'UPDATE', 'anormalidades', req.params.id, {})
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('[anorm.registro.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar anormalidad' })
    }
  }
)

// ── POST /api/anormalidades/:id/estado — cambiar estado ──────────────────────
router.post('/:id/estado',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'actualizar'),
  async (req, res) => {
    try {
      const { estado, nota } = req.body
      if (!MUTABLE_ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' })

      const existing = await req.tQuery(
        'SELECT estado FROM anormalidades WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'No encontrada' })

      const estadoAnterior = existing.rows[0].estado
      const fechaCierre = estado === 'cerrado' ? 'now()' : 'NULL'

      const result = await req.tQuery(
        `UPDATE anormalidades SET
           estado = $3,
           fecha_cierre = ${fechaCierre},
           updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [req.params.id, req.tenantId, estado]
      )

      await req.tQuery(
        `INSERT INTO anormalidades_historial
           (anormalidad_id, tenant_id, usuario_id, usuario_nombre, estado_anterior, estado_nuevo, nota)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, req.tenantId, req.userId, req.fullUser?.nombre_completo || null, estadoAnterior, estado, nota || null]
      )

      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('[anorm.registro.estado]', err.message)
      res.status(500).json({ error: 'Error al cambiar estado' })
    }
  }
)

// ── POST /api/anormalidades/:id/crear-mejora ────────────────────────────────
router.post('/:id/crear-mejora',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'actualizar'),
  async (req, res) => {
    try {
      const existing = await req.tQuery(
        `SELECT id, nombre, descripcion, causa_raiz, accion_preventiva, responsable_id
         FROM anormalidades
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'No encontrada' })

      const anorm = existing.rows[0]
      const descripcionProblema = req.body?.descripcion_problema || anorm.descripcion || anorm.nombre
      const accionMejora = req.body?.accion_mejora || anorm.accion_preventiva || `Definir accion preventiva para ${anorm.nombre}`
      if (!descripcionProblema || !accionMejora) {
        return res.status(400).json({ error: 'No hay suficiente informacion para generar mejora' })
      }

      const mejoraRes = await req.tQuery(
        `INSERT INTO anormalidades_mejoras
           (tenant_id, descripcion_problema, ocurrencias, causa_raiz_principal,
            accion_mejora, responsable_id, fecha_limite, proceso, origen, created_by)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          req.tenantId,
          descripcionProblema,
          anorm.causa_raiz || null,
          accionMejora,
          req.body?.responsable_id || anorm.responsable_id || null,
          req.body?.fecha_limite || null,
          req.body?.proceso || anorm.proceso,
          req.body?.origen || anorm.origen_responsabilidad || null,
          req.userId,
        ]
      )

      await req.tQuery(
        `INSERT INTO anormalidades_mejoras_vinculos (mejora_id, anormalidad_id, tenant_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [mejoraRes.rows[0].id, req.params.id, req.tenantId]
      )

      await auditLog(req.tenantId, req.userId, 'CREATE', 'anormalidades_mejoras', String(mejoraRes.rows[0].id), {
        desde_anormalidad_id: Number(req.params.id),
      })

      res.status(201).json({ success: true, data: mejoraRes.rows[0] })
    } catch (err) {
      console.error('[anorm.registro.crearMejora]', err.message)
      res.status(500).json({ error: 'Error al crear mejora desde anormalidad' })
    }
  }
)

// ── DELETE /api/anormalidades/:id ────────────────────────────────────────────
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'eliminar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        'DELETE FROM anormalidades WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [req.params.id, req.tenantId]
      )
      if (!result.rows.length) return res.status(404).json({ error: 'No encontrada' })
      await auditLog(req.tenantId, req.userId, 'DELETE', 'anormalidades', req.params.id, {})
      res.json({ success: true })
    } catch (err) {
      console.error('[anorm.registro.delete]', err.message)
      res.status(500).json({ error: 'Error al eliminar' })
    }
  }
)

// ── GET /api/anormalidades/usuarios — para selectores ───────────────────────
router.get('/meta/usuarios',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT id, nombre_completo FROM usuarios
         WHERE tenant_id = $1 AND estado = 'ACTIVO'
         ORDER BY nombre_completo`,
        [req.tenantId]
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      res.status(500).json({ error: 'Error' })
    }
  }
)

export default router
