import { Router } from 'express'
import { isDatabaseUnavailableError } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { getPermissionLevel, requirePermission, resolvePermission } from '../../../shared/middleware/permissions.js'
import { generateCodeVariations, normalizeScanCode } from '../../../shared/utils/codeNormalization.js'
import { refreshRecepcionOrderState } from '../utils/orderState.js'

const router = Router()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function hasRecepcionValidationDeletePermission(user) {
  return resolvePermission(getPermissionLevel(user?.permisos, 'recepcion.validacion'), 'eliminar')
}

function normalizedCodeSql(column) {
  return `UPPER(REGEXP_REPLACE(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), '／', '/'), '－', '-'), '‒', '-'), '–', '-'), '—', '-'), '―', '-'),
    '[^A-Z0-9_\\-/]',
    '',
    'g'
  ))`
}

function getStoredMatchedCode(line, fallbackCode) {
  const lineCode = String(line?.custom_box_barcode || '').trim()
  return lineCode || fallbackCode
}

// POST /orders/:id/sessions — start validation session
router.post('/orders/:id/sessions',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const { tarimas_enabled } = req.body
      const [result] = await Promise.all([
        req.tQuery(
          `INSERT INTO inbound_validation_sessions (tenant_id, order_id, user_id, tarimas_enabled)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [req.tenantId, req.params.id, req.user.id, Boolean(tarimas_enabled)]
        ),
        req.tQuery(
          `UPDATE inbound_orders SET estado='en_validacion', updated_at=now()
           WHERE id=$1 AND tenant_id=$2 AND estado='pendiente_validacion'`,
          [req.params.id, req.tenantId]
        ),
      ])
      res.status(201).json({ session: result.rows[0] })
    } catch (err) {
      console.error('[recepcion] session create:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
      }
      res.status(500).json({ error: 'Error al crear sesión de validación' })
    }
  }
)

// PATCH /orders/:id/sessions/:sid — close session
router.patch('/orders/:id/sessions/:sid',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const { total_escaneado, ubicacion_nota } = req.body
      const result = await req.tQuery(
        `WITH target_session AS MATERIALIZED (
           SELECT id
           FROM inbound_validation_sessions
           WHERE id=$1 AND order_id=$2 AND tenant_id=$3
         ), validation_count AS MATERIALIZED (
           SELECT
             (SELECT COUNT(*) FROM inbound_scan_events
              WHERE order_id=$2 AND tenant_id=$3 AND resultado='correcto')
             +
             (SELECT COUNT(*) FROM inbound_novedades
              WHERE order_id=$2 AND tenant_id=$3 AND COALESCE(cuenta_conteo, true)=true) AS total
         ), deleted_sessions AS (
           DELETE FROM inbound_validation_sessions
           WHERE order_id=$2 AND tenant_id=$3
             AND EXISTS (SELECT 1 FROM target_session)
             AND (SELECT total FROM validation_count)=0
           RETURNING id
         ), reset_order AS (
           UPDATE inbound_orders
           SET estado='pendiente_validacion',
               validation_config='{}'::jsonb,
               updated_at=now()
           WHERE id=$2 AND tenant_id=$3
             AND EXISTS (SELECT 1 FROM target_session)
             AND (SELECT total FROM validation_count)=0
           RETURNING *
         ), closed_session AS (
           UPDATE inbound_validation_sessions
           SET fin_at=now(),
               total_escaneado=COALESCE($4, total_escaneado),
               ubicacion_nota=COALESCE($5, ubicacion_nota)
           WHERE id=$1 AND order_id=$2 AND tenant_id=$3
             AND (SELECT total FROM validation_count)>0
           RETURNING *
         )
         SELECT
           EXISTS (SELECT 1 FROM target_session) AS session_found,
           (SELECT total FROM validation_count)::int AS validation_records,
           (SELECT row_to_json(reset_order) FROM reset_order) AS reset_order,
           (SELECT row_to_json(closed_session) FROM closed_session) AS closed_session`,
        [req.params.sid, req.params.id, req.tenantId, total_escaneado ?? null, ubicacion_nota || null]
      )
      const row = result.rows[0]
      const payload = !row?.session_found
        ? { session: null, reason: 'already_closed' }
        : row.validation_records === 0
          ? { session: null, order: row.reset_order || null, reset_validation: true }
          : { session: row.closed_session || null, reset_validation: false }
      res.json(payload)
    } catch (err) {
      console.error('[recepcion] session close:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
      }
      res.status(500).json({ error: 'Error al cerrar sesión' })
    }
  }
)

// POST /orders/:id/scan — process a scanned code
router.post('/orders/:id/scan',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    const timingEnabled = process.env.NODE_ENV !== 'production'
    const startedAt = timingEnabled ? process.hrtime.bigint() : null
    try {
      const { codigo_escaneado, ubicacion } = req.body
      if (!codigo_escaneado) return res.status(400).json({ error: 'Se requiere el código escaneado' })

      const rawCode = String(codigo_escaneado).trim()
      const normalizedCode = normalizeScanCode(rawCode)
      const scanVariations = generateCodeVariations(rawCode, true)
      const payload = await req.tTransaction(async (client) => {
        const orderRes = await client.query(
          `SELECT id, estado FROM inbound_orders WHERE id=$1 AND tenant_id=$2`,
          [req.params.id, req.tenantId]
        )
        if (orderRes.rows.length === 0) {
          const error = new Error('Orden no encontrada')
          error.status = 404
          throw error
        }

        const lineRes = await client.query(
          `SELECT l.*, u.nombre_completo AS validated_by_nombre
           FROM inbound_lines l
           LEFT JOIN usuarios u ON u.id = l.validated_by
           WHERE l.order_id=$1
             AND l.tenant_id=$2
             AND ${normalizedCodeSql('l.custom_box_barcode')} = ANY($3::text[])
           ORDER BY CASE WHEN l.estado_validacion = 'pendiente' THEN 0 ELSE 1 END, l.created_at ASC
           LIMIT 1
           FOR UPDATE OF l`,
          [req.params.id, req.tenantId, scanVariations]
        )

        const previousSuccessRes = await client.query(
          `SELECT e.*, u.nombre_completo AS scanned_by_nombre
           FROM inbound_scan_events e
           LEFT JOIN usuarios u ON u.id = e.scanned_by
           WHERE e.order_id=$1
             AND e.tenant_id=$2
             AND e.resultado='correcto'
             AND ${normalizedCodeSql('e.codigo_escaneado')} = ANY($3::text[])
           ORDER BY e.scanned_at DESC, e.id DESC
           LIMIT 1`,
          [req.params.id, req.tenantId, scanVariations]
        )
        const previousSuccess = previousSuccessRes.rows[0] || null

        const line = lineRes.rows[0] || null
        const matchField = line ? 'custom_box_barcode' : null
        const matchedStoredCode = getStoredMatchedCode(line, normalizedCode || rawCode)

        if (!line && previousSuccess) {
          return {
            resultado: 'duplicado',
            codigo: normalizedCode || rawCode,
            line,
            event: {
              resultado: 'duplicado',
              codigo_escaneado: normalizedCode || rawCode,
              ubicacion: ubicacion || null,
              scanned_by_nombre: req.fullUser?.nombre_completo || null,
            },
            motivo: 'codigo_ya_validado',
            mensaje: 'Todas las cajas esperadas para este código ya fueron validadas.',
            previous_event: {
              id: previousSuccess.id,
              codigo_escaneado: previousSuccess.codigo_escaneado,
              ubicacion: previousSuccess.ubicacion || null,
              scanned_at: previousSuccess.scanned_at,
              scanned_by_nombre: previousSuccess.scanned_by_nombre || null,
            },
          }
        }

        if (!line) {
          return {
            resultado: 'no_encontrado',
            codigo: normalizedCode || rawCode,
            event: {
              resultado: 'no_encontrado',
              codigo_escaneado: normalizedCode || rawCode,
              ubicacion: ubicacion || null,
              scanned_by_nombre: req.fullUser?.nombre_completo || null,
            },
            motivo: 'codigo_no_pertenece_orden',
            mensaje: 'El código no existe en las líneas esperadas de esta orden de recepción.',
          }
        }

        if (line.estado_validacion === 'validada') {
          return {
            resultado: 'duplicado',
            codigo: matchedStoredCode,
            line,
            event: {
              resultado: 'duplicado',
              codigo_escaneado: matchedStoredCode,
              ubicacion: ubicacion || null,
              scanned_by_nombre: req.fullUser?.nombre_completo || null,
            },
            motivo: 'codigo_ya_validado',
            mensaje: 'Todas las cajas esperadas para este código ya fueron validadas.',
            previous_event: previousSuccess ? {
              id: previousSuccess.id,
              codigo_escaneado: previousSuccess.codigo_escaneado,
              ubicacion: previousSuccess.ubicacion || null,
              scanned_at: previousSuccess.scanned_at,
              scanned_by_nombre: previousSuccess.scanned_by_nombre || null,
            } : null,
          }
        }

        await client.query(
          `UPDATE inbound_lines SET estado_validacion='validada', validated_by=$3, validated_at=now()
           WHERE id=$1 AND tenant_id=$2`,
          [line.id, req.tenantId, req.user.id]
        )
        const eventRes = await client.query(
          `INSERT INTO inbound_scan_events (tenant_id, order_id, line_id, codigo_escaneado, match_field, sku_asociado, resultado, scanned_by, ubicacion)
           VALUES ($1,$2,$3,$4,$5,$6,'correcto',$7,$8)
           RETURNING *`,
          [req.tenantId, req.params.id, line.id, matchedStoredCode, matchField, line.sku, req.user.id, ubicacion || null]
        )
        const orderState = await refreshRecepcionOrderState(client, req.tenantId, req.params.id)

        return {
          resultado: 'correcto',
          codigo: matchedStoredCode,
          line,
          cajas_validadas: orderState?.cajas_validadas || 0,
          cajas_forzadas: orderState?.cajas_forzadas || 0,
          cajas_registradas: orderState?.cajas_registradas || 0,
          estado: orderState?.estado || 'en_validacion',
          event: eventRes.rows[0],
        }
      })
      if (timingEnabled && startedAt) {
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6
        console.info(`[recepcion] scan ${req.params.id} ${elapsedMs.toFixed(1)}ms`)
      }
      res.json(payload)
    } catch (err) {
      console.error('[recepcion] scan:', err.message)
      if (timingEnabled && startedAt) {
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6
        console.info(`[recepcion] scan ${req.params.id} failed after ${elapsedMs.toFixed(1)}ms`)
      }
      res.status(err.status || 500).json({
        error: 'Error al procesar escaneo',
        detalle: err.message || 'Error interno no especificado',
      })
    }
  }
)

// GET /orders/:id/scan-events — scan history for this order
router.get('/orders/:id/scan-events',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'ver'),
  async (req, res) => {
    try {
      const resultados = String(req.query.resultados || '').trim()
      const compact = req.query.compact === '1'
      const requestedLimit = parseInt(req.query.limit, 10)
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100000)
        : 10000
      const resultList = resultados
        ? resultados.split(',').map(v => v.trim()).filter(v => ['correcto', 'duplicado', 'no_encontrado'].includes(v))
        : []
      const where = ['e.order_id=$1', 'e.tenant_id=$2']
      const params = [req.params.id, req.tenantId]
      if (resultList.length === 1) {
        params.push(resultList[0])
        where.push(`e.resultado = $${params.length}`)
      } else if (resultList.length > 1) {
        params.push(resultList)
        where.push(`e.resultado = ANY($${params.length}::text[])`)
      }
      const result = await req.tQuery(
        `SELECT ${
          compact
            ? 'e.id, e.line_id, e.codigo_escaneado, e.resultado, e.scanned_at, e.ubicacion, u.nombre_completo AS scanned_by_nombre'
            : 'e.*, u.nombre_completo AS scanned_by_nombre'
        }
         FROM inbound_scan_events e
         LEFT JOIN usuarios u ON u.id = e.scanned_by
         WHERE ${where.join(' AND ')}
         ORDER BY e.scanned_at DESC
         LIMIT $${params.length + 1}`,
        [...params, limit]
      )
      res.json({ events: result.rows, truncated: result.rows.length === limit, limit })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener eventos de escaneo' })
    }
  }
)

// DELETE /orders/:id/scan-events/last-validation — undo latest successful validation
// PATCH /orders/:id/scan-events/relocate — rename all scan events from one ubicacion to another
router.patch('/orders/:id/scan-events/relocate',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const { from_ubicacion, to_ubicacion } = req.body
      if (!to_ubicacion) {
        return res.status(400).json({ error: 'to_ubicacion requerido' })
      }
      const toNorm = String(to_ubicacion).trim().toUpperCase()
      const fromNorm = String(from_ubicacion || '').trim().toUpperCase()
      const result = await req.tQuery(
        `UPDATE inbound_scan_events
            SET ubicacion = $1
          WHERE order_id = $2
            AND tenant_id = $3
            AND COALESCE(TRIM(UPPER(ubicacion)), '') = $4`,
        [toNorm, req.params.id, req.tenantId, fromNorm]
      )
      res.json({ success: true, updated: result.rowCount, new_ubicacion: toNorm })
    } catch (err) {
      console.error('PATCH scan-events/relocate error:', err.message)
      res.status(500).json({ error: 'Error actualizando ubicación' })
    }
  }
)

router.patch('/orders/:id/scan-events/:eventId/location',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const toNorm = String(req.body?.ubicacion || '').trim().toUpperCase()
      if (!toNorm) return res.status(400).json({ error: 'ubicacion requerida' })

      const result = await req.tQuery(
        `UPDATE inbound_scan_events
            SET ubicacion = $1
          WHERE id = $2
            AND order_id = $3
            AND tenant_id = $4
          RETURNING id, ubicacion`,
        [toNorm, req.params.eventId, req.params.id, req.tenantId]
      )

      if (!result.rows.length) {
        return res.status(404).json({ error: 'Escaneo no encontrado' })
      }

      res.json({ success: true, event: result.rows[0] })
    } catch (err) {
      console.error('PATCH scan-events/:eventId/location error:', err.message)
      res.status(500).json({ error: 'Error actualizando ubicación del escaneo' })
    }
  }
)

router.delete('/orders/:id/scan-events/last-validation',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const eventRes = await req.tQuery(
        `SELECT e.*, u.nombre_completo AS scanned_by_nombre
         FROM inbound_scan_events e
         LEFT JOIN usuarios u ON u.id = e.scanned_by
         WHERE e.order_id=$1 AND e.tenant_id=$2 AND e.resultado='correcto' AND e.line_id IS NOT NULL
         ORDER BY e.scanned_at DESC, e.id DESC
         LIMIT 1`,
        [req.params.id, req.tenantId]
      )

      if (eventRes.rows.length === 0) {
        return res.status(404).json({ error: 'No hay validaciones para eliminar' })
      }

      const event = eventRes.rows[0]

      const deleteRes = await req.tQuery(
        `DELETE FROM inbound_scan_events
         WHERE tenant_id=$1
           AND order_id=$2
           AND line_id=$3
           AND (
             id=$4
             OR (resultado='duplicado' AND scanned_at >= $5)
           )
         RETURNING id`,
        [req.tenantId, req.params.id, event.line_id, event.id, event.scanned_at]
      )

      await req.tQuery(
        `UPDATE inbound_lines
         SET estado_validacion='pendiente', validated_by=NULL, validated_at=NULL
         WHERE id=$1 AND tenant_id=$2`,
        [event.line_id, req.tenantId]
      )

      const orderState = await refreshRecepcionOrderState(req, req.tenantId, req.params.id)

      res.json({
        ok: true,
        removedEvent: event,
        removedEventIds: deleteRes.rows?.map?.((row) => row.id) || [event.id],
        lineId: event.line_id,
        cajas_validadas: orderState?.cajas_validadas || 0,
        cajas_forzadas: orderState?.cajas_forzadas || 0,
        cajas_registradas: orderState?.cajas_registradas || 0,
        estado: orderState?.estado || 'pendiente_validacion',
      })
    } catch (err) {
      console.error('[recepcion] undo last validation:', err.message)
      res.status(500).json({ error: 'Error al eliminar el último registro de validación' })
    }
  }
)

// DELETE /orders/:id/scan-events/location/:ubicacion — remove a complete location/tarima
router.delete('/orders/:id/scan-events/location/:ubicacion',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const ubicacion = String(req.params.ubicacion || '').trim()
      if (!ubicacion) return res.status(400).json({ error: 'Ubicación requerida' })

      const result = await req.tTransaction(async (client) => {
        const eventsRes = await client.query(
          `SELECT id, line_id, resultado
             FROM inbound_scan_events
            WHERE tenant_id=$1 AND order_id=$2 AND ubicacion=$3
            FOR UPDATE`,
          [req.tenantId, req.params.id, ubicacion]
        )
        if (eventsRes.rows.length === 0) {
          const error = new Error('No hay registros para eliminar en esta ubicación')
          error.status = 404
          throw error
        }

        const eventIds = eventsRes.rows.map(event => event.id)
        const lineIds = [...new Set(eventsRes.rows
          .filter(event => event.resultado === 'correcto' && event.line_id)
          .map(event => event.line_id))]

        await client.query(
          `DELETE FROM inbound_scan_events
            WHERE tenant_id=$1 AND order_id=$2 AND id = ANY($3::uuid[])`,
          [req.tenantId, req.params.id, eventIds]
        )
        if (lineIds.length > 0) {
          await client.query(
            `UPDATE inbound_lines
                SET estado_validacion='pendiente', validated_by=NULL, validated_at=NULL
              WHERE tenant_id=$1 AND order_id=$2 AND id = ANY($3::uuid[])`,
            [req.tenantId, req.params.id, lineIds]
          )
        }

        const orderRes = await client.query(
          `SELECT validation_config FROM inbound_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
          [req.params.id, req.tenantId]
        )
        const config = orderRes.rows[0]?.validation_config
        if (config?.mode === 'tarimas') {
          if (!hasRecepcionValidationDeletePermission(req.fullUser)) {
            const error = new Error('Permiso insuficiente para eliminar una tarima completa')
            error.status = 403
            throw error
          }
          const tarimaNum = parseInt(ubicacion, 10)
          const nextConfig = {
            ...config,
            tarimaAssignments: (config.tarimaAssignments || []).filter(entry => parseInt(entry?.num, 10) !== tarimaNum),
            emptyTarimas: (config.emptyTarimas || []).filter(num => parseInt(num, 10) !== tarimaNum),
          }
          await client.query(
            `UPDATE inbound_orders SET validation_config=$3::jsonb, updated_at=now() WHERE id=$1 AND tenant_id=$2`,
            [req.params.id, req.tenantId, JSON.stringify(nextConfig)]
          )
        }

        const orderState = await refreshRecepcionOrderState(client, req.tenantId, req.params.id)
        return { eventIds, lineIds, order: orderState?.order || null }
      })

      res.json({
        ok: true,
        removedEventIds: result.eventIds,
        lineIds: result.lineIds,
        removedLocation: ubicacion,
        order: result.order,
      })
    } catch (err) {
      console.error('[recepcion] delete location scans:', err.message)
      res.status(err.status || 500).json({ error: err.message || 'Error al eliminar registros de la ubicación' })
    }
  }
)

// DELETE /orders/:id/scan-events/:eventId — delete scan event
router.delete('/orders/:id/scan-events/:eventId',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'eliminar'),
  async (req, res) => {
    try {
      const eventRes = await req.tQuery(
        `SELECT * FROM inbound_scan_events WHERE id=$1 AND order_id=$2 AND tenant_id=$3`,
        [req.params.eventId, req.params.id, req.tenantId]
      )
      if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' })

      const event = eventRes.rows[0]

      await req.tQuery(
        `DELETE FROM inbound_scan_events WHERE id=$1 AND tenant_id=$2`,
        [event.id, req.tenantId]
      )

      if (event.resultado === 'correcto' && event.line_id) {
        await req.tQuery(
          `UPDATE inbound_lines SET estado_validacion='pendiente', validated_by=NULL, validated_at=NULL
           WHERE id=$1 AND tenant_id=$2`,
          [event.line_id, req.tenantId]
        )
      }

      const orderState = await refreshRecepcionOrderState(req, req.tenantId, req.params.id)

      res.json({
        ok: true,
        removedEvent: event,
        lineId: event.line_id,
        cajas_validadas: orderState?.cajas_validadas || 0,
        cajas_forzadas: orderState?.cajas_forzadas || 0,
        cajas_registradas: orderState?.cajas_registradas || 0,
        estado: orderState?.estado || 'pendiente_validacion',
      })
    } catch (err) {
      console.error('[recepcion] delete scan event:', err.message)
      res.status(500).json({ error: 'Error al eliminar registro de escaneo' })
    }
  }
)

// POST /orders/:id/scan-events/:eventId/anormalidad — move a validated scan to novedades
router.post('/orders/:id/scan-events/:eventId/anormalidad',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const { tipo, ubicacion } = req.body
      if (!tipo) return res.status(400).json({ error: 'Tipo requerido' })

      const eventRes = await req.tQuery(
        `SELECT * FROM inbound_scan_events WHERE id=$1 AND order_id=$2 AND tenant_id=$3`,
        [req.params.eventId, req.params.id, req.tenantId]
      )
      if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' })

      const event = eventRes.rows[0]
      if (event.resultado !== 'correcto') {
        return res.status(400).json({ error: 'Solo se pueden mover a anomalías registros validados' })
      }

      const tipoRes = await req.tQuery(
        `SELECT id, nombre
         FROM inbound_novedad_tipos
         WHERE tenant_id=$1 AND activo=true AND LOWER(nombre)=LOWER($2)
         LIMIT 1`,
        [req.tenantId, String(tipo).trim()]
      )
      if (!tipoRes.rows.length) {
        return res.status(400).json({ error: 'Tipo de anomalía inválido para este tenant' })
      }

      const normalizedCodigo = normalizeScanCode(event.codigo_escaneado)
      const novedadRes = await req.tQuery(
        `INSERT INTO inbound_novedades (tenant_id, order_id, tipo, codigo, ubicacion, created_by, es_forzada, cuenta_conteo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          req.tenantId,
          req.params.id,
          tipoRes.rows[0].nombre,
          normalizedCodigo || null,
          ubicacion?.trim() || event.ubicacion || null,
          req.user.id,
          true,
          true,
        ]
      )

      await req.tQuery(
        `DELETE FROM inbound_scan_events WHERE id=$1 AND tenant_id=$2`,
        [event.id, req.tenantId]
      )

      if (event.line_id) {
        await req.tQuery(
          `UPDATE inbound_lines
           SET estado_validacion='pendiente', validated_by=NULL, validated_at=NULL
           WHERE id=$1 AND tenant_id=$2`,
          [event.line_id, req.tenantId]
        )
      }

      const orderState = await refreshRecepcionOrderState(req, req.tenantId, req.params.id)

      res.status(201).json({
        ok: true,
        novedad: novedadRes.rows[0],
        removedEvent: event,
        lineId: event.line_id,
        cajas_validadas: orderState?.cajas_validadas || 0,
        cajas_forzadas: orderState?.cajas_forzadas || 0,
        cajas_registradas: orderState?.cajas_registradas || 0,
        estado: orderState?.estado || 'pendiente_validacion',
        order: orderState?.order || null,
      })
    } catch (err) {
      console.error('[recepcion] move scan event to novedad:', err.message)
      res.status(500).json({ error: 'Error al mover registro a anomalías' })
    }
  }
)

router.post('/orders/:id/scan-events/anormalidad/bulk',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const { tipo, ubicacion, event_ids } = req.body
      if (!tipo) return res.status(400).json({ error: 'Tipo requerido' })

      const requestedIds = Array.from(new Set(
        (Array.isArray(event_ids) ? event_ids : [])
          .map((value) => String(value || '').trim())
          .filter((value) => UUID_RE.test(value))
      ))
      if (requestedIds.length === 0) {
        return res.status(400).json({ error: 'Se requieren eventos para mover a anomalías' })
      }

      const tipoRes = await req.tQuery(
        `SELECT id, nombre
         FROM inbound_novedad_tipos
         WHERE tenant_id=$1 AND activo=true AND LOWER(nombre)=LOWER($2)
         LIMIT 1`,
        [req.tenantId, String(tipo).trim()]
      )
      if (!tipoRes.rows.length) {
        return res.status(400).json({ error: 'Tipo de anomalía inválido para este tenant' })
      }

      const result = await req.tTransaction(async (client) => {
        const eventsRes = await client.query(
          `SELECT *
             FROM inbound_scan_events
            WHERE order_id=$1
              AND tenant_id=$2
              AND id = ANY($3::uuid[])
            ORDER BY scanned_at DESC, id DESC`,
          [req.params.id, req.tenantId, requestedIds]
        )

        const validEvents = eventsRes.rows.filter((event) => event.resultado === 'correcto')
        if (validEvents.length === 0) {
          const error = new Error('No se encontraron escaneos válidos para mover a anomalías')
          error.status = 404
          throw error
        }

        const insertColumns = {
          tenantIds: validEvents.map(() => req.tenantId),
          orderIds: validEvents.map(() => req.params.id),
          tipos: validEvents.map(() => tipoRes.rows[0].nombre),
          codigos: validEvents.map((event) => normalizeScanCode(event.codigo_escaneado) || null),
          ubicaciones: validEvents.map((event) => ubicacion?.trim() || event.ubicacion || null),
          createdBy: validEvents.map(() => req.user.id),
          esForzada: validEvents.map(() => true),
          cuentaConteo: validEvents.map(() => true),
        }

        const novedadRes = await client.query(
          `INSERT INTO inbound_novedades (tenant_id, order_id, tipo, codigo, ubicacion, created_by, es_forzada, cuenta_conteo)
           SELECT * FROM UNNEST(
             $1::uuid[],
             $2::uuid[],
             $3::text[],
             $4::text[],
             $5::text[],
             $6::int[],
             $7::boolean[],
             $8::boolean[]
           )
           RETURNING *`,
          [
            insertColumns.tenantIds,
            insertColumns.orderIds,
            insertColumns.tipos,
            insertColumns.codigos,
            insertColumns.ubicaciones,
            insertColumns.createdBy,
            insertColumns.esForzada,
            insertColumns.cuentaConteo,
          ]
        )

        await client.query(
          `DELETE FROM inbound_scan_events
            WHERE tenant_id=$1
              AND order_id=$2
              AND id = ANY($3::uuid[])`,
          [req.tenantId, req.params.id, validEvents.map((event) => event.id)]
        )

        const lineIds = Array.from(new Set(validEvents.map((event) => event.line_id).filter(Boolean)))
        if (lineIds.length > 0) {
          await client.query(
            `UPDATE inbound_lines
                SET estado_validacion='pendiente', validated_by=NULL, validated_at=NULL
              WHERE tenant_id=$1
                AND id = ANY($2::uuid[])`,
            [req.tenantId, lineIds]
          )
        }

        const orderState = await refreshRecepcionOrderState(client, req.tenantId, req.params.id)
        return {
          novedades: novedadRes.rows,
          removedEventIds: validEvents.map((event) => event.id),
          lineIds,
          orderState,
        }
      })

      res.status(201).json({
        ok: true,
        movedCount: result.removedEventIds.length,
        novedades: result.novedades,
        removedEventIds: result.removedEventIds,
        lineIds: result.lineIds,
        cajas_validadas: result.orderState?.cajas_validadas || 0,
        cajas_forzadas: result.orderState?.cajas_forzadas || 0,
        cajas_registradas: result.orderState?.cajas_registradas || 0,
        estado: result.orderState?.estado || 'pendiente_validacion',
        order: result.orderState?.order || null,
      })
    } catch (err) {
      console.error('[recepcion] bulk move scan events to novedad:', err.message)
      res.status(err.status || 500).json({ error: err.message || 'Error al mover registros a anomalías' })
    }
  }
)

// GET /orders/:id/novedades
router.get('/orders/:id/novedades',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT n.*, u.nombre_completo AS created_by_nombre
         FROM inbound_novedades n
         LEFT JOIN usuarios u ON u.id = n.created_by
         WHERE n.order_id=$1 AND n.tenant_id=$2
         ORDER BY n.created_at DESC`,
        [req.params.id, req.tenantId]
      )
      res.json({ novedades: result.rows })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener novedades' })
    }
  }
)

// POST /orders/:id/novedades
router.post('/orders/:id/novedades',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'crear'),
  async (req, res) => {
    try {
      const { tipo, codigo, ubicacion } = req.body
      if (!tipo) return res.status(400).json({ error: 'Tipo requerido' })
      const normalizedCodigo = normalizeScanCode(codigo)
      const tipoRes = await req.tQuery(
        `SELECT id, nombre
         FROM inbound_novedad_tipos
         WHERE tenant_id=$1 AND activo=true AND LOWER(nombre)=LOWER($2)
         LIMIT 1`,
        [req.tenantId, String(tipo).trim()]
      )
      if (!tipoRes.rows.length) {
        return res.status(400).json({ error: 'Tipo de anomalía inválido para este tenant' })
      }
      const result = await req.tQuery(
        `INSERT INTO inbound_novedades (tenant_id, order_id, tipo, codigo, ubicacion, created_by, es_forzada, cuenta_conteo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.tenantId, req.params.id, tipoRes.rows[0].nombre, normalizedCodigo || null, ubicacion?.trim() || null, req.user.id, true, true]
      )
      const orderState = await refreshRecepcionOrderState(req, req.tenantId, req.params.id)
      res.status(201).json({ novedad: result.rows[0], order: orderState?.order || null })
    } catch (err) {
      console.error('[recepcion] novedad create:', err.message, '\n', err.stack)
      res.status(500).json({ error: 'Error al registrar novedad' })
    }
  }
)

// DELETE /orders/:id/novedades/:nid
router.delete('/orders/:id/novedades/:nid',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
  async (req, res) => {
    try {
      await req.tQuery(
        `DELETE FROM inbound_novedades WHERE id=$1 AND order_id=$2 AND tenant_id=$3`,
        [req.params.nid, req.params.id, req.tenantId]
      )
      const orderState = await refreshRecepcionOrderState(req, req.tenantId, req.params.id)
      res.json({ ok: true, order: orderState?.order || null })
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar novedad' })
    }
  }
)

// GET /novedad-tipos — list active tipos for this tenant
router.get('/novedad-tipos',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT id, nombre, created_at FROM inbound_novedad_tipos
         WHERE tenant_id=$1 AND activo=true ORDER BY nombre ASC`,
        [req.tenantId]
      )
      res.json({ tipos: result.rows })
    } catch (err) {
      console.error('[recepcion] novedad-tipos get:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
      }
      res.status(500).json({ error: 'Error al obtener tipos' })
    }
  }
)

// POST /novedad-tipos — create a tipo
router.post('/novedad-tipos',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
  async (req, res) => {
    try {
      const nombre = (req.body.nombre || '').trim()
      if (!nombre) return res.status(400).json({ error: 'Nombre requerido' })
      const result = await req.tQuery(
        `INSERT INTO inbound_novedad_tipos (tenant_id, nombre)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, lower(nombre)) DO UPDATE SET activo=true
         RETURNING id, nombre, created_at`,
        [req.tenantId, nombre]
      )
      res.status(201).json({ tipo: result.rows[0] })
    } catch (err) {
      console.error('[recepcion] novedad-tipos create:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
      }
      res.status(500).json({ error: 'Error al crear tipo' })
    }
  }
)

// PUT /novedad-tipos/:id — rename a tipo
router.put('/novedad-tipos/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
  async (req, res) => {
    const nombre = (req.body.nombre || '').trim()
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' })
    try {
      const { rows } = await req.tQuery(
        `UPDATE inbound_novedad_tipos SET nombre=$1 WHERE id=$2 AND tenant_id=$3 AND activo=true RETURNING id, nombre`,
        [nombre, req.params.id, req.tenantId]
      )
      if (!rows.length) return res.status(404).json({ error: 'Tipo no encontrado' })
      res.json({ tipo: rows[0] })
    } catch (err) {
      console.error('[recepcion] novedad-tipos update:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
      }
      res.status(500).json({ error: 'Error al actualizar tipo' })
    }
  }
)

// DELETE /novedad-tipos/:id — soft delete a tipo
router.delete('/novedad-tipos/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
  async (req, res) => {
    try {
      await req.tQuery(
        `UPDATE inbound_novedad_tipos SET activo=false WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId]
      )
      res.json({ ok: true })
    } catch (err) {
      console.error('[recepcion] novedad-tipos delete:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
      }
      res.status(500).json({ error: 'Error al eliminar tipo' })
    }
  }
)

export default router
