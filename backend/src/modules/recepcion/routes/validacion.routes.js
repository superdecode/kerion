import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { refreshRecepcionOrderState } from '../utils/orderState.js'

const router = Router()

function normalizeScanCode(rawCode) {
  if (!rawCode) return ''

  let code = String(rawCode).trim()
  code = code.replace(/[\x00-\x1F\x7F]/g, '')
  code = code.replace(/^GS1:|^\]C1|^\]E0|^\]d2/i, '')
  code = code.replace(/／/g, '/')
  code = code.replace(/[－‒–—―]/g, '-')

  const jsonMatch = code.match(/"ID"\s*:\s*"(\d+[/-]\d+)"/i)
  if (jsonMatch?.[1]) return jsonMatch[1]

  code = code.replace(/ö/gi, 'o')
  code = code.replace(/ï/gi, 'i')
  code = code.replace(/Ñ/g, ':')
  code = code.replace(/ñ/g, ':')
  code = code.replace(/\^/g, '')
  code = code.replace(/¨/g, '"')
  // Some scanners emit GS1 AIs with square brackets in their human-readable form.
  // We normalize [ and ] to " so the downstream JSON/ID regex patterns match correctly.
  // Note: this transform is intentional and specific to the scanner hardware in use.
  code = code.replace(/\[/g, '"')
  code = code.replace(/\]/g, '"')
  code = code.replace(/\'/g, '/')
  code = code.replace(/\*/g, '')
  code = code.replace(/&/g, '/')
  code = code.replace(/[""«»„‟‚‛''¨]/g, '"')
  code = code.replace(/\?/g, '_')

  const upper = code.toUpperCase()
  const patterns = [
    /"ID"\s*:\s*"?(\d+[/-]\d+)"?/i,
    /"REFERENCE_ID"\s*:\s*"?(\d+[/-]\d+)"?/i,
    /\[ID\[N\s*\[([\d]+[/-][\d]+)/i,
    /\[ID\[.*?\[([\d]+[/-][\d]+)/i,
    /"\[ID"N"([\d]+[/-][\d]+)/i,
    /"\[ID".*?"([\d]+[/-][\d]+)/i,
    /"ID"\s*[N:"]+\s*"([\d]+[/-][\d]+)"/i,
    /"CODE"\s*:\s*"([^"]+)"/i,
    /\bID\s*:\s*"?(\d+[/-]\d+)/i,
    /\bID"?"?(\d+[/-]\d+)/i,
    /^"?(\d+[/-]\d+)"?/,
  ]

  for (const pattern of patterns) {
    const match = upper.match(pattern)
    if (match?.[1]) {
      const extracted = match[1].replace(/"/g, '')
      if (/^\d{6,}[/-]\d{1,4}$/.test(extracted)) return extracted
    }
  }

  const idMatch = upper.match(/^ID(\d+[-/]\d+)/i)
  if (idMatch) return idMatch[1]

  return upper.replace(/[^A-Z0-9_\/-]/g, '')
}

function generateCodeVariations(rawCode, normalize = true) {
  const code = normalize ? normalizeScanCode(rawCode) : String(rawCode || '').toUpperCase()
  if (!code) return []

  const variations = [code]
  if (code.includes('-')) variations.push(code.replace(/-/g, '/'))
  if (code.includes('/')) variations.push(code.replace(/\//g, '-'))
  return [...new Set(variations)]
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
  requirePermission('recepcion.validacion', 'actualizar'),
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
      res.status(500).json({ error: 'Error al crear sesión de validación' })
    }
  }
)

// PATCH /orders/:id/sessions/:sid — close session
router.patch('/orders/:id/sessions/:sid',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
  async (req, res) => {
    try {
      const { total_escaneado, ubicacion_nota } = req.body
      const result = await req.tQuery(
        `UPDATE inbound_validation_sessions
         SET fin_at=now(),
             total_escaneado=COALESCE($3, total_escaneado),
             ubicacion_nota=COALESCE($4, ubicacion_nota)
         WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        [req.params.sid, req.tenantId, total_escaneado || null, ubicacion_nota || null]
      )
      if (result.rows.length === 0) return res.json({ session: null, reason: 'already_closed' })
      res.json({ session: result.rows[0] })
    } catch (err) {
      res.status(500).json({ error: 'Error al cerrar sesión' })
    }
  }
)

// POST /orders/:id/scan — process a scanned code
router.post('/orders/:id/scan',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
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
         LIMIT 5000`,
        params
      )
      res.json({ events: result.rows, truncated: result.rows.length === 5000 })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener eventos de escaneo' })
    }
  }
)

// DELETE /orders/:id/scan-events/last-validation — undo latest successful validation
// PATCH /orders/:id/scan-events/relocate — rename all scan events from one ubicacion to another
router.patch('/orders/:id/scan-events/relocate',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
  async (req, res) => {
    try {
      const { from_ubicacion, to_ubicacion } = req.body
      if (!from_ubicacion || !to_ubicacion) {
        return res.status(400).json({ error: 'from_ubicacion y to_ubicacion requeridos' })
      }
      const toNorm = String(to_ubicacion).trim().toUpperCase()
      const result = await req.tQuery(
        `UPDATE inbound_scan_events SET ubicacion = $1
         WHERE order_id = $2 AND tenant_id = $3 AND ubicacion = $4`,
        [toNorm, req.params.id, req.tenantId, from_ubicacion]
      )
      res.json({ success: true, updated: result.rowCount, new_ubicacion: toNorm })
    } catch (err) {
      console.error('PATCH scan-events/relocate error:', err.message)
      res.status(500).json({ error: 'Error actualizando ubicación' })
    }
  }
)

router.delete('/orders/:id/scan-events/last-validation',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'eliminar'),
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

      await req.tQuery(
        `DELETE FROM inbound_scan_events
         WHERE tenant_id=$1
           AND order_id=$2
           AND line_id=$3
           AND (
             id=$4
             OR (resultado='duplicado' AND scanned_at >= $5)
           )`,
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
  requirePermission('recepcion.validacion', 'actualizar'),
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
  requirePermission('recepcion.validacion', 'actualizar'),
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
      res.status(500).json({ error: 'Error al eliminar tipo' })
    }
  }
)

export default router
