import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getPermissionLevel } from '../../../shared/middleware/permissions.js'
import { generateRastreoFolio } from '../services/folioService.js'
import { crearAnormalidadRastreo } from '../services/anormalidadHelper.js'

const router = Router()

const STATUS_ALIASES = {
  resuelta: 'completada',
  cerrada: 'cancelada',
}

const VALID_ESTADOS = ['abierta', 'en_proceso', 'completada', 'cancelada']

const ESTADO_LABELS = {
  abierta: 'Abierta',
  en_proceso: 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const ESTADO_TRANSITIONS = {
  abierta: new Set(['en_proceso', 'completada', 'cancelada']),
  en_proceso: new Set(['completada', 'cancelada']),
  completada: new Set(['cancelada']),
  cancelada: new Set(['completada']),
}

function normalizeEstado(raw) {
  if (!raw) return raw
  return STATUS_ALIASES[raw] || raw
}

function persistEstado(raw) {
  const normalized = normalizeEstado(raw)
  if (normalized === 'completada') return 'resuelta'
  if (normalized === 'cancelada') return 'cerrada'
  return normalized
}

function expandEstadoValues(raw) {
  const normalized = normalizeEstado(raw)
  if (normalized === 'completada') return ['completada', 'resuelta']
  if (normalized === 'cancelada') return ['cancelada', 'cerrada']
  return [normalized]
}

function canTransitionEstado(currentRaw, nextRaw) {
  const current = normalizeEstado(currentRaw)
  const next = normalizeEstado(nextRaw)
  if (!current || !next) return false
  if (current === next) return true
  return ESTADO_TRANSITIONS[current]?.has(next) || false
}

function normalizeCode(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9\-/]/g, '')
}

function stripCode(raw) {
  return normalizeCode(raw).replace(/[^A-Z0-9]/g, '')
}

function extractBaseCode(raw) {
  if (!raw) return ''
  let base = normalizeCode(raw).split('/')[0].split('-')[0]
  const uMatch = base.match(/^(.+?)U\d+$/)
  if (uMatch) base = uMatch[1]
  const zeroMatch = base.match(/^(.+?)0{3,8}\d*$/)
  if (zeroMatch) base = zeroMatch[1]
  return base || normalizeCode(raw)
}

function getSearchTokens(raw) {
  const normalized = normalizeCode(raw)
  const compact = stripCode(raw)
  const baseCode = extractBaseCode(normalized)
  const baseCompact = baseCode && baseCode !== normalized ? stripCode(baseCode) : ''
  return {
    normalized,
    compact,
    baseCode,
    baseCompact: baseCompact.length >= 6 ? baseCompact : '',
    partialLike: `%${normalized}%`,
  }
}

function buildMatchCase(columns, { exactParam, compactParam, baseParam, partialParam }) {
  const upperCols = columns.map(col => `UPPER(COALESCE(${col}, '')) = $${exactParam}`).join(' OR ')
  const compactCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') = $${compactParam}`).join(' OR ')
  const baseCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') LIKE $${baseParam} || '%'`).join(' OR ')
  const partialCols = columns.map(col => `${col} ILIKE $${partialParam}`).join(' OR ')
  return `CASE
    WHEN ${upperCols} THEN 'exact'
    WHEN ${compactCols} THEN 'normalized'
    WHEN $${baseParam} <> '' AND (${baseCols}) THEN 'base'
    WHEN ${partialCols} THEN 'partial'
    ELSE NULL
  END`
}

function buildFlexibleMatchWhere(columns, params) {
  return `(${buildMatchCase(columns, params)}) IS NOT NULL`
}

function buildStrictCodeMatch(columns, { exactParam, compactParam, baseParam }) {
  const upperCols = columns.map(col => `UPPER(COALESCE(${col}, '')) = $${exactParam}`).join(' OR ')
  const compactCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') = $${compactParam}`).join(' OR ')
  const baseCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') LIKE $${baseParam} || '%'`).join(' OR ')
  return `(
    ${upperCols}
    OR ${compactCols}
    OR ($${baseParam} <> '' AND (${baseCols}))
  )`
}

function buildExactOnlyWhere(columns, { exactParam, compactParam }) {
  const upperCols = columns.map(col => `UPPER(COALESCE(${col}, '')) = $${exactParam}`).join(' OR ')
  const compactCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') = $${compactParam}`).join(' OR ')
  return `(${upperCols} OR ${compactCols})`
}

// ── GET /api/rastreo/buscar?q=<boxCode> ──────────────────────────────────────
router.get('/buscar',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const q = (req.query.q || '').trim()
      const mode = req.query.mode === 'exact' ? 'exact' : 'flexible'
      if (!q) return res.status(400).json({ error: 'Parámetro q requerido' })
      const tokens = getSearchTokens(q)
      const matchParams = {
        exactParam: 2,
        compactParam: 3,
        baseParam: 4,
        partialParam: 5,
      }

      const inventoryWhere = mode === 'exact'
        ? buildExactOnlyWhere(['s.barcode'], matchParams)
        : buildFlexibleMatchWhere(['s.barcode'], matchParams)
      const registrosWhere = mode === 'exact'
        ? buildExactOnlyWhere(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)
        : buildFlexibleMatchWhere(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)
      const surtidoWhere = mode === 'exact'
        ? buildExactOnlyWhere(['pe.scanned_code', 'pe.normalized_code'], matchParams)
        : buildFlexibleMatchWhere(['pe.scanned_code', 'pe.normalized_code'], matchParams)
      const rastreoWhere = mode === 'exact'
        ? buildExactOnlyWhere(['rc.box_code', 'rc.box_code_normalized'], matchParams)
        : buildFlexibleMatchWhere(['rc.box_code', 'rc.box_code_normalized'], matchParams)

      const [invRes, invRegRes, pickRes, rastreoRes] = await Promise.all([
        req.tQuery(
          `SELECT s.barcode, s.sku, s.product_name, s.cell_no, s.available_stock,
                  s.status, s.created_at,
                  u.nombre_completo AS operador,
                  sess.origin_location,
                  ${buildMatchCase(['s.barcode'], matchParams)} AS match_type
           FROM inventory_scans s
           JOIN inventory_sessions sess ON sess.id = s.session_id
           JOIN usuarios u ON u.id = s.user_id
           WHERE u.tenant_id = $1
             AND ${inventoryWhere}
           ORDER BY
             CASE ${buildMatchCase(['s.barcode'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             s.created_at DESC
           LIMIT 30`,
          [req.tenantId, tokens.normalized, tokens.compact, tokens.baseCompact, tokens.partialLike]
        ),
        req.tQuery(
          `SELECT sc.id, sc.scanned_code, sc.normalized_code, sc.code2, sc.scan_status, sc.cell_no,
                  sc.group_assignment, sc.scanned_at,
                  sess.id AS session_id, sess.scan_type,
                  u_op.nombre_completo AS operator_nombre,
                  ${buildMatchCase(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)} AS match_type
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id
           LEFT JOIN usuarios u_op ON u_op.id = sess.operator_id
           WHERE sess.tenant_id = $1
             AND ${registrosWhere}
           ORDER BY
             CASE ${buildMatchCase(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             sc.scanned_at DESC
           LIMIT 30`,
          [req.tenantId, tokens.normalized, tokens.compact, tokens.baseCompact, tokens.partialLike]
        ),
        req.tQuery(
          `SELECT pe.scanned_code, pe.scan_result, pe.scanned_at AS created_at,
                  pe.normalized_code,
                  ps.outbound_order_no, ps.status AS session_status,
                  u.nombre_completo AS operador,
                  ${buildMatchCase(['pe.scanned_code', 'pe.normalized_code'], matchParams)} AS match_type
           FROM pick_events pe
           JOIN pick_sessions ps ON ps.id = pe.session_id
           LEFT JOIN usuarios u ON u.id = ps.operator_id
           WHERE ps.tenant_id = $1
             AND ${surtidoWhere}
           ORDER BY
             CASE ${buildMatchCase(['pe.scanned_code', 'pe.normalized_code'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             pe.scanned_at DESC
           LIMIT 30`,
          [req.tenantId, tokens.normalized, tokens.compact, tokens.baseCompact, tokens.partialLike]
        ),
        req.tQuery(
          `SELECT rc.id, rc.box_code, rc.box_code_normalized, rc.estado_caja, rc.ubicacion,
                  rc.producto, rc.validada_en_surtido, rc.created_at, rc.updated_at,
                  ro.folio, ro.outbound_order_no, ro.estado AS orden_estado,
                  ${buildMatchCase(['rc.box_code', 'rc.box_code_normalized'], matchParams)} AS match_type
           FROM rastreo_cajas rc
           JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
           WHERE rc.tenant_id = $1
             AND ${rastreoWhere}
           ORDER BY
             CASE ${buildMatchCase(['rc.box_code', 'rc.box_code_normalized'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             rc.updated_at DESC
           LIMIT 30`,
          [req.tenantId, tokens.normalized, tokens.compact, tokens.baseCompact, tokens.partialLike]
        ),
      ])

      const datasets = [
        ...invRes.rows,
        ...invRegRes.rows,
        ...pickRes.rows,
        ...rastreoRes.rows,
      ]
      const usedBaseCode = datasets.some(row => row.match_type === 'base')

      res.json({
        success: true,
        data: {
          inventario_escaneo: invRes.rows,
          inventario_registros: invRegRes.rows,
          surtido_validacion: pickRes.rows,
          rastreo: rastreoRes.rows,
          meta: {
            query: q,
            mode,
            normalized_query: tokens.normalized,
            base_code: tokens.baseCode || null,
            used_base_code: usedBaseCode,
          },
        },
      })
    } catch (err) {
      console.error('[rastreo.buscar]', err.message)
      res.status(500).json({ error: 'Error en la búsqueda' })
    }
  }
)

// ── GET /api/rastreo/usuarios/asignables — solo usuarios con acceso inventario
router.get('/usuarios/asignables',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const rows = await req.tQuery(
        `SELECT u.id, u.nombre_completo, u.codigo, u.email, u.es_admin_tenant,
                u.permisos_override, r.nombre AS rol_nombre, r.permisos AS rol_permisos
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id AND r.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1
           AND u.estado = 'ACTIVO'
         ORDER BY u.nombre_completo`,
        [req.tenantId]
      )
      const data = rows.rows
        .filter((user) => {
          if (user.es_admin_tenant === true) return true
          const permisos = user.permisos_override || user.rol_permisos || {}
          return getPermissionLevel(permisos, 'inventario.escaneo') !== 'sin_acceso' ||
            getPermissionLevel(permisos, 'inventario.registros') !== 'sin_acceso' ||
            getPermissionLevel(permisos, 'inventario.rastreo') !== 'sin_acceso'
        })
        .map(({ id, nombre_completo, codigo, email }) => ({ id, nombre_completo, codigo, email }))
      res.json({ success: true, data })
    } catch (err) {
      console.error('[rastreo.usuarios]', err.message)
      res.status(500).json({ error: 'Error al obtener usuarios' })
    }
  }
)

// ── GET /api/rastreo — lista paginada ────────────────────────────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const {
        page = 1, limit = 30,
        search, estado, asignado_a,
        estado_caja,
        sort = 'created_at', dir = 'DESC',
      } = req.query

      const offset = (parseInt(page) - 1) * parseInt(limit)
      const SORT_COLUMNS = {
        created_at: 'ro.created_at',
        updated_at: 'ro.updated_at',
        folio: 'ro.folio',
        outbound_order_no: 'ro.outbound_order_no',
        customer_code: 'ro.customer_code',
        estado: 'ro.estado',
        total_cajas: 'total_cajas',
        cajas_localizadas: 'cajas_localizadas',
        cajas_no_encontradas: 'cajas_no_encontradas',
        asignado_nombre: 'asignado_nombre',
      }
      const sortCol = SORT_COLUMNS[sort] || 'ro.created_at'
      const sortDir = dir === 'ASC' ? 'ASC' : 'DESC'

      let where = 'WHERE ro.tenant_id = $1'
      const params = [req.tenantId]
      let p = 2

      if (search) {
        where += ` AND (ro.folio ILIKE $${p} OR ro.outbound_order_no ILIKE $${p} OR ro.customer_code ILIKE $${p})`
        params.push(`%${search}%`)
        p++
      }

      // Support comma-separated estados
      if (estado) {
        const estados = estado.split(',').map(e => normalizeEstado(e.trim())).filter(Boolean)
        if (estados.length === 1) {
          const variants = expandEstadoValues(estados[0])
          if (variants.length === 1) {
            where += ` AND ro.estado = $${p++}`
            params.push(variants[0])
          } else {
            const placeholders = variants.map(() => `$${p++}`).join(',')
            where += ` AND ro.estado IN (${placeholders})`
            params.push(...variants)
          }
        } else if (estados.length > 1) {
          const variants = [...new Set(estados.flatMap(expandEstadoValues))]
          const placeholders = variants.map(() => `$${p++}`).join(',')
          where += ` AND ro.estado IN (${placeholders})`
          params.push(...variants)
        }
      }

      if (asignado_a) {
        if (asignado_a === 'ninguno') {
          where += ` AND ro.asignado_a IS NULL`
        } else {
          // Support comma-separated
          const ids = asignado_a.split(',').map(id => id.trim()).filter(Boolean)
          if (ids.length === 1) {
            where += ` AND ro.asignado_a = $${p++}`
            params.push(ids[0])
          } else {
            const placeholders = ids.map(() => `$${p++}`).join(',')
            where += ` AND ro.asignado_a IN (${placeholders})`
            params.push(...ids)
          }
        }
      }

      // Filter by caja estado
      if (estado_caja) {
        const estadosCaja = estado_caja.split(',').map(v => v.trim()).filter(Boolean)
        if (estadosCaja.length === 1) {
          where += ` AND EXISTS (
            SELECT 1 FROM rastreo_cajas rc2
            WHERE rc2.rastreo_orden_id = ro.id AND rc2.estado_caja = $${p++}
          )`
          params.push(estadosCaja[0])
        } else if (estadosCaja.length > 1) {
          const placeholders = estadosCaja.map(() => `$${p++}`).join(',')
          where += ` AND EXISTS (
            SELECT 1 FROM rastreo_cajas rc2
            WHERE rc2.rastreo_orden_id = ro.id AND rc2.estado_caja IN (${placeholders})
          )`
          params.push(...estadosCaja)
        }
      }

      const [countRes, rowsRes] = await Promise.all([
        req.tQuery(`SELECT COUNT(*) FROM rastreo_ordenes ro ${where}`, params),
        req.tQuery(
          `SELECT ro.*,
                  u.nombre_completo AS asignado_nombre,
                  u2.nombre_completo AS creado_por_nombre,
                  (SELECT COUNT(*) FROM rastreo_cajas rc WHERE rc.rastreo_orden_id = ro.id) AS total_cajas,
                  (SELECT COUNT(*) FROM rastreo_cajas rc WHERE rc.rastreo_orden_id = ro.id AND rc.estado_caja = 'localizada') AS cajas_localizadas,
                  (SELECT COUNT(*) FROM rastreo_cajas rc WHERE rc.rastreo_orden_id = ro.id AND rc.estado_caja = 'no_encontrada') AS cajas_no_encontradas
           FROM rastreo_ordenes ro
           LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
           LEFT JOIN usuarios u2 ON u2.id = ro.creado_por AND u2.tenant_id = ro.tenant_id
           ${where}
           ORDER BY ${sortCol} ${sortDir}
           LIMIT $${p++} OFFSET $${p++}`,
          [...params, parseInt(limit), offset]
        ),
      ])

      const normalizedRows = rowsRes.rows.map((row) => ({
        ...row,
        estado: normalizeEstado(row.estado),
      }))

      res.json({
        success: true,
        data: normalizedRows,
        meta: {
          total: parseInt(countRes.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)) || 1,
        },
      })
    } catch (err) {
      console.error('[rastreo.list]', err.message)
      res.status(500).json({ error: 'Error al obtener órdenes de rastreo' })
    }
  }
)

// ── POST /api/rastreo/bulk/estado — cambio masivo de estado ──────────────────
router.post('/bulk/estado',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { ids, estado } = req.body
      const normalizedEstado = normalizeEstado(estado)
      if (!ids?.length || !VALID_ESTADOS.includes(normalizedEstado) || normalizedEstado === 'abierta') {
        return res.status(400).json({ error: 'Datos inválidos' })
      }
      const userId = req.fullUser.id
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(',')
      const currentRes = await req.tQuery(
        `SELECT id, estado FROM rastreo_ordenes
         WHERE tenant_id = $1 AND id IN (${placeholders})`,
        [req.tenantId, ...ids]
      )
      for (const row of currentRes.rows) {
        if (!canTransitionEstado(row.estado, normalizedEstado)) {
          return res.status(400).json({ error: `Transición inválida para la orden ${row.id}` })
        }
      }
      await req.tQuery(
        `UPDATE rastreo_ordenes SET estado = $1, updated_at = now()
         WHERE tenant_id = $2 AND id IN (${ids.map((_, i) => `$${i + 3}`).join(',')})`,
        [persistEstado(normalizedEstado), req.tenantId, ...ids]
      )
      for (const id of ids) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'estado_cambiado',$3,$4)`,
          [req.tenantId, id, `Cambio masivo de estado a: ${ESTADO_LABELS[normalizedEstado] || normalizedEstado}`, userId]
        )
      }
      res.json({ success: true, updated: ids.length })
    } catch (err) {
      console.error('[rastreo.bulk.estado]', err.message)
      res.status(500).json({ error: 'Error al actualizar estados' })
    }
  }
)

// ── POST /api/rastreo/bulk/responsable — asignación masiva ───────────────────
router.post('/bulk/responsable',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { ids, asignado_a } = req.body
      if (!ids?.length) return res.status(400).json({ error: 'IDs requeridos' })
      const userId = req.fullUser.id
      const newVal = asignado_a ? parseInt(asignado_a) : null
      const placeholders = ids.map((_, i) => `$${i + 3}`).join(',')
      await req.tQuery(
        `UPDATE rastreo_ordenes SET asignado_a = $1, updated_at = now()
         WHERE tenant_id = $2 AND id IN (${placeholders})`,
        [newVal, req.tenantId, ...ids]
      )
      for (const id of ids) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'asignada',$3,$4)`,
          [req.tenantId, id, `Responsable asignado masivo`, userId]
        )
      }
      res.json({ success: true, updated: ids.length })
    } catch (err) {
      console.error('[rastreo.bulk.responsable]', err.message)
      res.status(500).json({ error: 'Error al asignar responsable' })
    }
  }
)

// ── GET /api/rastreo/:folio — detalle ────────────────────────────────────────
router.get('/:folio',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const [ordenRes, cajasRes, histRes] = await Promise.all([
        req.tQuery(
          `SELECT ro.*,
                  u.nombre_completo AS asignado_nombre,
                  u2.nombre_completo AS creado_por_nombre
           FROM rastreo_ordenes ro
           LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
           LEFT JOIN usuarios u2 ON u2.id = ro.creado_por AND u2.tenant_id = ro.tenant_id
           WHERE ro.tenant_id = $1 AND ro.folio = $2`,
          [req.tenantId, req.params.folio]
        ),
        req.tQuery(
          `SELECT rc.*, a.folio AS anormalidad_folio
           FROM rastreo_cajas rc
           LEFT JOIN anormalidades a ON a.id = rc.anormalidad_id
           WHERE rc.tenant_id = $1 AND rc.rastreo_orden_id = (
             SELECT id FROM rastreo_ordenes WHERE tenant_id = $1 AND folio = $2 LIMIT 1
           )
           ORDER BY rc.created_at`,
          [req.tenantId, req.params.folio]
        ),
        req.tQuery(
          `SELECT rh.*, u.nombre_completo AS actor_nombre
           FROM rastreo_historial rh
           LEFT JOIN usuarios u ON u.id = rh.actor_id
           WHERE rh.tenant_id = $1 AND rh.rastreo_orden_id = (
             SELECT id FROM rastreo_ordenes WHERE tenant_id = $1 AND folio = $2 LIMIT 1
           )
           ORDER BY rh.created_at DESC`,
          [req.tenantId, req.params.folio]
        ),
      ])

      if (!ordenRes.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      res.json({
        success: true,
        data: {
          orden: {
            ...ordenRes.rows[0],
            estado: normalizeEstado(ordenRes.rows[0].estado),
          },
          cajas: cajasRes.rows,
          historial: histRes.rows,
        },
      })
    } catch (err) {
      console.error('[rastreo.detail]', err.message)
      res.status(500).json({ error: 'Error al obtener detalle' })
    }
  }
)

// ── POST /api/rastreo — crear orden ──────────────────────────────────────────
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'crear'),
  async (req, res) => {
    try {
      const {
        outbound_order_no,
        customer_code,
        asignado_a,
        notas,
        cajas = [],
      } = req.body

      if (!cajas.length) {
        return res.status(400).json({ error: 'Debe incluir al menos una caja' })
      }

      const folio = await generateRastreoFolio(req.tQuery, req.tenantId)
      const userId = req.fullUser.id

      let asignadoId = null
      if (asignado_a) {
        const uRes = await req.tQuery(
          `SELECT id FROM usuarios WHERE id = $1 AND tenant_id = $2 AND estado = 'ACTIVO'`,
          [asignado_a, req.tenantId]
        )
        if (uRes.rows.length) asignadoId = parseInt(asignado_a)
      }

      const cajasData = await Promise.all(cajas.map(async (c) => {
        const normalized = normalizeCode(c.box_code)
        const compact = stripCode(c.box_code)
        const baseCompact = getSearchTokens(c.box_code).baseCompact
        let validada = false

        if (outbound_order_no) {
          const peRes = await req.tQuery(
            `SELECT 1 FROM pick_events pe
             JOIN pick_sessions ps ON ps.id = pe.session_id
             WHERE ps.tenant_id = $1 AND ps.outbound_order_no = $2
               AND pe.scan_result = 'ok'
               AND ${buildStrictCodeMatch(['pe.scanned_code', 'pe.normalized_code'], {
                 exactParam: 3,
                 compactParam: 4,
                 baseParam: 5,
               })}
             LIMIT 1`,
            [req.tenantId, outbound_order_no, normalized, compact, baseCompact]
          )
          validada = peRes.rows.length > 0
        }

        return {
          box_code: c.box_code,
          box_code_normalized: normalized,
          ubicacion: c.ubicacion || null,
          producto: c.producto || null,
          cantidad_disponible: c.cantidad_disponible != null ? c.cantidad_disponible : null,
          validada_en_surtido: validada,
        }
      }))

      const { tenantTransaction } = await import('../../../config/database.js')
      let ordenId

      await tenantTransaction(req.tenantId, async (client) => {
        const ordenRes = await client.query(
          `INSERT INTO rastreo_ordenes
             (tenant_id, folio, outbound_order_no, customer_code, asignado_a, creado_por, notas)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [req.tenantId, folio, outbound_order_no || null, customer_code || null,
           asignadoId, userId, notas || null]
        )
        ordenId = ordenRes.rows[0].id

        for (const c of cajasData) {
          await client.query(
            `INSERT INTO rastreo_cajas
               (tenant_id, rastreo_orden_id, box_code, box_code_normalized,
                ubicacion, producto, cantidad_disponible, validada_en_surtido)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [req.tenantId, ordenId, c.box_code, c.box_code_normalized,
             c.ubicacion, c.producto, c.cantidad_disponible, c.validada_en_surtido]
          )
        }

        await client.query(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'creada',$3,$4)`,
          [req.tenantId, ordenId, `Orden creada con ${cajasData.length} caja(s)`, userId]
        )
      })

      res.status(201).json({ success: true, data: { folio, id: ordenId } })
    } catch (err) {
      console.error('[rastreo.create]', err.message)
      res.status(500).json({ error: 'Error al crear orden de rastreo' })
    }
  }
)

// ── PATCH /api/rastreo/:id — actualizar orden ────────────────────────────────
router.patch('/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { estado, asignado_a, notas, agregar_nota } = req.body
      const userId = req.fullUser.id
      const normalizedEstado = estado !== undefined ? normalizeEstado(estado) : undefined

      const existing = await req.tQuery(
        `SELECT ro.id, ro.estado, ro.asignado_a, ro.folio, ro.notas,
                u.nombre_completo AS asignado_nombre
         FROM rastreo_ordenes ro
         LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
         WHERE ro.id = $1 AND ro.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      const row = existing.rows[0]
      const currentEstado = normalizeEstado(row.estado)
      const updates = []
      const values = []
      const historyEntries = []
      let nextAsignadoId = row.asignado_a
      let nextAsignadoNombre = row.asignado_nombre || null

      if (normalizedEstado && normalizedEstado !== currentEstado) {
        if (!VALID_ESTADOS.includes(normalizedEstado) || !canTransitionEstado(currentEstado, normalizedEstado)) {
          return res.status(400).json({ error: 'Transición de estado no permitida' })
        }
        values.push(persistEstado(normalizedEstado))
        updates.push(`estado = $${values.length + 2}`)
        historyEntries.push({
          accion: 'estado_cambiado',
          descripcion: `Cambio de estado: ${ESTADO_LABELS[currentEstado] || currentEstado} -> ${ESTADO_LABELS[normalizedEstado] || normalizedEstado}`,
        })
      }
      if (asignado_a !== undefined) {
        nextAsignadoId = asignado_a ? parseInt(asignado_a) : null
        if ((row.asignado_a || null) !== (nextAsignadoId || null)) {
          if (nextAsignadoId) {
            const userRes = await req.tQuery(
              `SELECT nombre_completo
               FROM usuarios
               WHERE id = $1 AND tenant_id = $2 AND estado = 'ACTIVO'
               LIMIT 1`,
              [nextAsignadoId, req.tenantId]
            )
            nextAsignadoNombre = userRes.rows[0]?.nombre_completo || null
          } else {
            nextAsignadoNombre = null
          }
          historyEntries.push({
            accion: 'asignada',
            descripcion: `Responsable: ${row.asignado_nombre || 'Sin responsable'} -> ${nextAsignadoNombre || 'Sin responsable'}`,
          })
        }
        values.push(nextAsignadoId)
        updates.push(`asignado_a = $${values.length + 2}`)
      }
      if (notas !== undefined) {
        values.push(notas)
        updates.push(`notas = $${values.length + 2}`)
        if ((row.notas || '') !== (notas || '')) {
          historyEntries.push({
            accion: 'actualizada',
            descripcion: 'Notas generales actualizadas',
          })
        }
      }

      if (agregar_nota) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'nota',$3,$4)`,
          [req.tenantId, req.params.id, agregar_nota, userId]
        )
        if (!updates.length) return res.json({ success: true })
      }

      if (!updates.length) return res.json({ success: true })

      updates.push(`updated_at = now()`)

      await req.tQuery(
        `UPDATE rastreo_ordenes SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId, ...values]
      )

      for (const entry of historyEntries) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.tenantId, req.params.id, entry.accion, entry.descripcion, userId]
        )
      }

      res.json({ success: true })
    } catch (err) {
      console.error('[rastreo.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar orden' })
    }
  }
)

// ── POST /api/rastreo/cajas/add — agregar caja a orden existente ─────────────
router.post('/cajas/add',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'crear'),
  async (req, res) => {
    try {
      const { orden_id, box_code, ubicacion, producto, cantidad_disponible } = req.body
      if (!orden_id || !box_code) return res.status(400).json({ error: 'orden_id y box_code requeridos' })

      const ordenRes = await req.tQuery(
        'SELECT id, outbound_order_no FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [orden_id, req.tenantId]
      )
      if (!ordenRes.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })
      const orden = ordenRes.rows[0]

      // Check duplicate
      const dupRes = await req.tQuery(
        `SELECT id FROM rastreo_cajas WHERE rastreo_orden_id = $1 AND UPPER(box_code) = UPPER($2) AND tenant_id = $3`,
        [orden_id, box_code, req.tenantId]
      )
      if (dupRes.rows.length) return res.status(409).json({ error: 'La caja ya existe en esta orden' })

      const normalized = normalizeCode(box_code)
      const compact = stripCode(box_code)
      const baseCompact = getSearchTokens(box_code).baseCompact
      let validada = false
      if (orden.outbound_order_no) {
        const peRes = await req.tQuery(
          `SELECT 1 FROM pick_events pe
           JOIN pick_sessions ps ON ps.id = pe.session_id
           WHERE ps.tenant_id = $1 AND ps.outbound_order_no = $2
             AND pe.scan_result = 'ok'
             AND ${buildStrictCodeMatch(['pe.scanned_code', 'pe.normalized_code'], {
               exactParam: 3,
               compactParam: 4,
               baseParam: 5,
             })}
           LIMIT 1`,
          [req.tenantId, orden.outbound_order_no, normalized, compact, baseCompact]
        )
        validada = peRes.rows.length > 0
      }

      const cajaRes = await req.tQuery(
        `INSERT INTO rastreo_cajas
           (tenant_id, rastreo_orden_id, box_code, box_code_normalized, ubicacion, producto, cantidad_disponible, validada_en_surtido)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [req.tenantId, orden_id, box_code, normalized, ubicacion || null, producto || null,
         cantidad_disponible != null ? cantidad_disponible : null, validada]
      )

      await req.tQuery(
        `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, rastreo_caja_id, accion, descripcion, actor_id)
         VALUES ($1,$2,$3,'creada',$4,$5)`,
        [req.tenantId, orden_id, cajaRes.rows[0].id, `Registro agregado: ${box_code}`, req.fullUser.id]
      )

      res.status(201).json({ success: true, data: { id: cajaRes.rows[0].id } })
    } catch (err) {
      console.error('[rastreo.caja.add]', err.message)
      res.status(500).json({ error: 'Error al agregar caja' })
    }
  }
)

// ── PATCH /api/rastreo/cajas/:id — cambiar estado caja ──────────────────────
router.patch('/cajas/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { estado_caja, notas } = req.body
      const userId = req.fullUser.id

      const cajaRes = await req.tQuery(
        `SELECT rc.*, ro.folio AS orden_folio, ro.outbound_order_no, ro.id AS orden_id, ro.estado AS orden_estado
         FROM rastreo_cajas rc
         JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
         WHERE rc.id = $1 AND rc.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!cajaRes.rows.length) return res.status(404).json({ error: 'Caja no encontrada' })

      const caja = cajaRes.rows[0]
      const currentOrdenEstado = normalizeEstado(caja.orden_estado)

      const updates = [`estado_caja = $3`, `updated_at = now()`]
      const params = [req.params.id, req.tenantId, estado_caja]
      let p = 4

      if (notas !== undefined) {
        updates.push(`notas = $${p++}`)
        params.push(notas)
      }

      let anormalidadId = null
      if (estado_caja === 'no_encontrada' && !caja.anormalidad_id) {
        anormalidadId = await crearAnormalidadRastreo(req.tQuery, req.tenantId, {
          boxCode: caja.box_code,
          ordenFolio: caja.orden_folio,
          outboundOrderNo: caja.outbound_order_no,
          userId,
          userName: req.fullUser.nombre_completo,
        })
        if (anormalidadId) {
          updates.push(`anormalidad_id = $${p++}`)
          params.push(anormalidadId)
        }
      }

      await req.tQuery(
        `UPDATE rastreo_cajas SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2`,
        params
      )

      if (currentOrdenEstado === 'abierta') {
        await req.tQuery(
          `UPDATE rastreo_ordenes
           SET estado = 'en_proceso', updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [caja.orden_id, req.tenantId]
        )
        await req.tQuery(
          `INSERT INTO rastreo_historial
             (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'estado_cambiado',$3,$4)`,
          [req.tenantId, caja.orden_id, 'Cambio de estado: Abierta -> En proceso', userId]
        )
      }

      const accion = estado_caja === 'localizada' ? 'caja_localizada'
        : estado_caja === 'no_encontrada' ? 'caja_no_encontrada'
        : 'estado_cambiado'

      await req.tQuery(
        `INSERT INTO rastreo_historial
           (tenant_id, rastreo_orden_id, rastreo_caja_id, accion, descripcion, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.tenantId, caja.orden_id, caja.id, accion,
         `Caja ${caja.box_code}: ${estado_caja}`, userId]
      )

      res.json({ success: true, anormalidad_id: anormalidadId })
    } catch (err) {
      console.error('[rastreo.caja.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar caja' })
    }
  }
)

// ── DELETE /api/rastreo/cajas/:id — eliminar caja ────────────────────────────
router.delete('/cajas/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'eliminar'),
  async (req, res) => {
    try {
      const cajaRes = await req.tQuery(
        `SELECT rc.*, ro.id AS orden_id
         FROM rastreo_cajas rc
         JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
         WHERE rc.id = $1 AND rc.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!cajaRes.rows.length) return res.status(404).json({ error: 'Caja no encontrada' })
      const caja = cajaRes.rows[0]

      // Check if has estado changes in historial (preserve traceability)
      const histRes = await req.tQuery(
        `SELECT COUNT(*) FROM rastreo_historial
         WHERE rastreo_caja_id = $1 AND accion IN ('caja_localizada','caja_no_encontrada','estado_cambiado')`,
        [req.params.id]
      )
      const hasHistory = parseInt(histRes.rows[0].count) > 0

      if (hasHistory) {
        // Mark as cancelled instead of deleting
        await req.tQuery(
          `UPDATE rastreo_cajas SET estado_caja = 'cancelada', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId]
        )
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, rastreo_caja_id, accion, descripcion, actor_id)
           VALUES ($1,$2,$3,'actualizada',$4,$5)`,
          [req.tenantId, caja.orden_id, caja.id, `Registro cancelado: ${caja.box_code} (con historial previo)`, req.fullUser.id]
        )
        return res.json({ success: true, cancelled: true })
      }

      await req.tQuery(
        `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
         VALUES ($1,$2,'actualizada',$3,$4)`,
        [req.tenantId, caja.orden_id, `Registro eliminado: ${caja.box_code}`, req.fullUser.id]
      )

      await req.tQuery(
        'DELETE FROM rastreo_cajas WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true, deleted: true })
    } catch (err) {
      console.error('[rastreo.caja.delete]', err.message)
      res.status(500).json({ error: 'Error al eliminar caja' })
    }
  }
)

// ── DELETE /api/rastreo/:id ───────────────────────────────────────────────────
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'eliminar'),
  async (req, res) => {
    try {
      const existing = await req.tQuery(
        'SELECT id FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      await req.tQuery(
        'DELETE FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )

      res.json({ success: true })
    } catch (err) {
      console.error('[rastreo.delete]', err.message)
      res.status(500).json({ error: 'Error al eliminar orden' })
    }
  }
)

export default router
