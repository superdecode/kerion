import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

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

  return upper.replace(/[^A-Z0-9-/]/g, '')
}

function normalizeCodeFast(rawCode) {
  if (!rawCode) return ''
  let code = String(rawCode).trim()
  code = code.replace(/／/g, '/').replace(/[－‒–—―]/g, '-')
  return code.toUpperCase().replace(/[^A-Z0-9-/]/g, '')
}

function generateCodeVariations(rawCode, normalize = true) {
  const code = normalize ? normalizeScanCode(rawCode) : String(rawCode || '').toUpperCase()
  if (!code) return []

  const variations = [code]
  if (code.includes('-')) variations.push(code.replace(/-/g, '/'))
  if (code.includes('/')) variations.push(code.replace(/\//g, '-'))
  return [...new Set(variations)]
}

// POST /orders/:id/sessions — start validation session
router.post('/orders/:id/sessions',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
  async (req, res) => {
    try {
      const { tarimas_enabled } = req.body
      const result = await req.tQuery(
        `INSERT INTO inbound_validation_sessions (tenant_id, order_id, user_id, tarimas_enabled)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.tenantId, req.params.id, req.user.id, Boolean(tarimas_enabled)]
      )
      await req.tQuery(
        `UPDATE inbound_orders SET estado='en_validacion', updated_at=now()
         WHERE id=$1 AND tenant_id=$2 AND estado='pendiente_validacion'`,
        [req.params.id, req.tenantId]
      )
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
      if (result.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' })
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
    try {
      const { codigo_escaneado, ubicacion } = req.body
      if (!codigo_escaneado) return res.status(400).json({ error: 'Se requiere el código escaneado' })

      const rawCode = String(codigo_escaneado).trim()
      const normalizedCode = normalizeScanCode(rawCode)
      const scanVariations = new Set(generateCodeVariations(rawCode, true))

      const orderRes = await req.tQuery(
        `SELECT id, estado FROM inbound_orders WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId]
      )
      if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Orden no encontrada' })

      const linesRes = await req.tQuery(
        `SELECT * FROM inbound_lines WHERE order_id=$1 AND tenant_id=$2 ORDER BY created_at ASC`,
        [req.params.id, req.tenantId]
      )

      const lines = linesRes.rows

      const customMatches = lines.filter((line) => {
        const code = normalizeCodeFast(line.custom_box_barcode || '')
        if (!code) return false
        return generateCodeVariations(code, false).some((variant) => scanVariations.has(variant))
      })

      let line = customMatches.find((entry) => entry.estado_validacion === 'pendiente') || customMatches[0] || null
      let matchField = line ? 'custom_box_barcode' : null

      if (!line) {
        const boxTypeMatches = lines.filter((entry) => {
          const code = normalizeCodeFast(entry.box_type || '')
          if (!code) return false
          return generateCodeVariations(code, false).some((variant) => scanVariations.has(variant))
        })

        line = boxTypeMatches.find((entry) => entry.estado_validacion === 'pendiente') || boxTypeMatches[0] || null
        matchField = line ? 'box_type' : null
      }

      if (!line) {
        const eventRes = await req.tQuery(
          `INSERT INTO inbound_scan_events (tenant_id, order_id, codigo_escaneado, resultado, scanned_by, ubicacion)
           VALUES ($1,$2,$3,'no_encontrado',$4,$5)
           RETURNING *`,
          [req.tenantId, req.params.id, normalizedCode || rawCode, req.user.id, ubicacion || null]
        )
        return res.json({
          resultado: 'no_encontrado',
          codigo: normalizedCode || rawCode,
          event: eventRes.rows[0],
        })
      }

      if (line.estado_validacion === 'validada') {
        const eventRes = await req.tQuery(
          `INSERT INTO inbound_scan_events (tenant_id, order_id, line_id, codigo_escaneado, match_field, sku_asociado, resultado, scanned_by, ubicacion)
           VALUES ($1,$2,$3,$4,$5,$6,'duplicado',$7,$8)
           RETURNING *`,
          [req.tenantId, req.params.id, line.id, normalizedCode || rawCode, matchField, line.sku, req.user.id, ubicacion || null]
        )
        return res.json({
          resultado: 'duplicado',
          codigo: normalizedCode || rawCode,
          line,
          event: eventRes.rows[0],
        })
      }

      // Mark validated
      await req.tQuery(
        `UPDATE inbound_lines SET estado_validacion='validada', validated_by=$3, validated_at=now()
         WHERE id=$1 AND tenant_id=$2`,
        [line.id, req.tenantId, req.user.id]
      )
      const eventRes = await req.tQuery(
        `INSERT INTO inbound_scan_events (tenant_id, order_id, line_id, codigo_escaneado, match_field, sku_asociado, resultado, scanned_by, ubicacion)
         VALUES ($1,$2,$3,$4,$5,$6,'correcto',$7,$8)
         RETURNING *`,
        [req.tenantId, req.params.id, line.id, normalizedCode || rawCode, matchField, line.sku, req.user.id, ubicacion || null]
      )

      // Update order counters
      const statsRes = await req.tQuery(
        `SELECT COUNT(*) FILTER (WHERE estado_validacion='validada') AS validadas, COUNT(*) AS total
         FROM inbound_lines WHERE order_id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId]
      )
      const validadas = parseInt(statsRes.rows[0].validadas)
      const total = parseInt(statsRes.rows[0].total)
      const newEstado = validadas === total ? 'completo' : 'en_validacion'

      await req.tQuery(
        `UPDATE inbound_orders SET cajas_validadas=$3, estado=$4, updated_at=now() WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId, validadas, newEstado]
      )

      res.json({
        resultado: 'correcto',
        codigo: normalizedCode || rawCode,
        line,
        cajas_validadas: validadas,
        estado: newEstado,
        event: eventRes.rows[0],
      })
    } catch (err) {
      console.error('[recepcion] scan:', err.message)
      res.status(500).json({ error: 'Error al procesar escaneo' })
    }
  }
)

// GET /orders/:id/scan-events — scan history for this order
router.get('/orders/:id/scan-events',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT e.*, u.nombre_completo AS scanned_by_nombre
         FROM inbound_scan_events e
         LEFT JOIN usuarios u ON u.id = e.scanned_by
         WHERE e.order_id=$1 AND e.tenant_id=$2
         ORDER BY e.scanned_at DESC`,
        [req.params.id, req.tenantId]
      )
      res.json({ events: result.rows })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener eventos de escaneo' })
    }
  }
)

// DELETE /orders/:id/scan-events/last-validation — undo latest successful validation
router.delete('/orders/:id/scan-events/last-validation',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.validacion', 'actualizar'),
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

      const statsRes = await req.tQuery(
        `SELECT
           COUNT(*) FILTER (WHERE estado_validacion='validada') AS validadas,
           COUNT(*) FILTER (WHERE estado_validacion='faltante') AS faltantes,
           COUNT(*) AS total
         FROM inbound_lines
         WHERE order_id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId]
      )

      const validadas = parseInt(statsRes.rows[0].validadas || 0, 10)
      const faltantes = parseInt(statsRes.rows[0].faltantes || 0, 10)
      const total = parseInt(statsRes.rows[0].total || 0, 10)

      let newEstado = 'pendiente_validacion'
      if (validadas > 0 && validadas === total) newEstado = 'completo'
      else if (validadas > 0 || faltantes > 0) newEstado = 'en_validacion'

      await req.tQuery(
        `UPDATE inbound_orders
         SET cajas_validadas=$3, estado=$4, updated_at=now()
         WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId, validadas, newEstado]
      )

      res.json({
        ok: true,
        removedEvent: event,
        lineId: event.line_id,
        cajas_validadas: validadas,
        estado: newEstado,
      })
    } catch (err) {
      console.error('[recepcion] undo last validation:', err.message)
      res.status(500).json({ error: 'Error al eliminar el último registro de validación' })
    }
  }
)

export default router
