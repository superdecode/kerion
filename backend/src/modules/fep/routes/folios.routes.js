import { Router } from 'express'
import crypto from 'crypto'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { dateInTZ, getToday, CDMX_TZ } from '../../../shared/utils/dateUtils.js'

// Convert a tenant UUID to a stable int8 advisory lock key.
function tenantLockKey(tenantId) {
  const buf = crypto.createHash('sha256').update(tenantId).digest()
  const val = buf.readBigUInt64BE(0) & BigInt('0x7FFFFFFFFFFFFFFF')
  return val.toString()
}

const router = Router()
const TZ = CDMX_TZ

// ─── helpers ────────────────────────────────────────────────────────────────

function isSameDay(tsUTC) {
  const now = new Date()
  const nowMx = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const tsMx = new Date(new Date(tsUTC).toLocaleString('en-US', { timeZone: TZ }))
  return nowMx.toDateString() === tsMx.toDateString()
}

async function recalcTotals(client, folioId) {
  await client.query(
    `UPDATE folios_entrega fe SET
       total_tarimas = (SELECT COUNT(*) FROM folios_entrega_tarimas WHERE folio_id = $1 AND eliminado_en IS NULL),
       total_guias   = (SELECT COALESCE(SUM(t.cantidad_guias),0) FROM folios_entrega_tarimas fet
                        JOIN tarimas t ON t.id = fet.tarima_id
                        WHERE fet.folio_id = $1 AND fet.eliminado_en IS NULL),
       updated_at = now()
     WHERE fe.id = $1`,
    [folioId]
  )
}

async function logAction(client, folioId, accion, detalle, usuarioId, tenantId) {
  await client.query(
    `INSERT INTO folios_entrega_log (folio_id, accion, detalle, usuario_id, tenant_id) VALUES ($1,$2,$3,$4,$5)`,
    [folioId, accion, JSON.stringify(detalle), usuarioId, tenantId]
  )
}

// ─── GET /api/fep/folios/stats/hoy ──────────────────────────────────────────
router.get('/stats/hoy',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'ver'),
  async (req, res) => {
    try {
      const todayDate = getToday(TZ)
      const result = await req.tQuery(
        `SELECT
           COUNT(*) FILTER (WHERE estado = 'ACTIVO')     AS activos,
           COUNT(*) FILTER (WHERE estado = 'CANCELADO')  AS cancelados,
           COUNT(*) FILTER (WHERE estado = 'COMPLETADO') AS completados,
           COALESCE(SUM(total_tarimas),0) AS total_tarimas,
           COALESCE(SUM(total_guias),0)   AS total_guias
         FROM folios_entrega
         WHERE ${dateInTZ('created_at', TZ)} = $1::date AND tenant_id = $2`,
        [todayDate, req.tenantId]
      )
      res.json({ stats: result.rows[0] })
    } catch (err) {
      console.error('FEP stats error:', err)
      res.status(500).json({ error: 'Error obteniendo estadísticas' })
    }
  }
)

// ─── GET /api/fep/folios/preview-tarimas ────────────────────────────────────
router.get('/preview-tarimas',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'ver'),
  async (req, res) => {
    try {
      const { empresa_id, canales, fecha_desde, fecha_hasta, estatus_tarima = 'FINALIZADA', page = 1, limit = 50 } = req.query
      if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

      const safePage = Math.max(1, parseInt(page) || 1)
      const safeLimit = Math.min(200, Math.max(1, parseInt(limit) || 50))
      const offset = (safePage - 1) * safeLimit

      const params = [Number(empresa_id), req.tenantId]
      let where = ['t.empresa_id = $1', 't.tenant_id = $2']
      let pc = 2

      if (canales && canales !== 'all') {
        const ids = String(canales).split(',').map(Number).filter(Boolean)
        if (ids.length) { pc++; where.push(`t.canal_id = ANY($${pc})`); params.push(ids) }
      }

      if (fecha_desde) { pc++; where.push(`${dateInTZ('t.fecha_inicio', TZ)} >= $${pc}::date`); params.push(fecha_desde) }
      if (fecha_hasta) { pc++; where.push(`${dateInTZ('t.fecha_inicio', TZ)} <= $${pc}::date`); params.push(fecha_hasta) }

      if (estatus_tarima === 'FINALIZADA') {
        where.push(`t.estado = 'FINALIZADA'`)
      } else if (estatus_tarima === 'EN_PROCESO') {
        where.push(`t.estado = 'EN_PROCESO'`)
      }

      const whereClause = 'WHERE ' + where.join(' AND ')

      // Tarimas already in an active folio (blocked)
      const blockedQuery = `
        EXISTS (
          SELECT 1 FROM folios_entrega_tarimas fet
          JOIN folios_entrega fe ON fe.id = fet.folio_id
          WHERE fet.tarima_id = t.id AND fet.eliminado_en IS NULL AND fe.estado = 'ACTIVO'
        )`

      const countRes = await req.tQuery(`SELECT COUNT(*) FROM tarimas t ${whereClause}`, params)
      const total = parseInt(countRes.rows[0].count)

      pc++; params.push(safeLimit)
      pc++; params.push(offset)

      const result = await req.tQuery(
        `SELECT t.id, t.codigo, t.estado, t.cantidad_guias,
                t.fecha_inicio, t.fecha_cierre,
                e.nombre AS empresa_nombre, e.codigo AS empresa_codigo,
                c.nombre AS canal_nombre, c.id AS canal_id,
                ${blockedQuery} AS bloqueada,
                (SELECT fe2.folio_numero FROM folios_entrega_tarimas fet2
                 JOIN folios_entrega fe2 ON fe2.id = fet2.folio_id
                 WHERE fet2.tarima_id = t.id AND fet2.eliminado_en IS NULL AND fe2.estado = 'ACTIVO'
                 LIMIT 1) AS folio_asignado
         FROM tarimas t
         JOIN configuraciones e ON t.empresa_id = e.id
         JOIN configuraciones c ON t.canal_id = c.id
         ${whereClause}
         ORDER BY t.fecha_inicio DESC
         LIMIT $${pc-1} OFFSET $${pc}`,
        params
      )

      res.json({
        tarimas: result.rows,
        pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
      })
    } catch (err) {
      console.error('FEP preview tarimas error:', err)
      res.status(500).json({ error: 'Error obteniendo tarimas disponibles' })
    }
  }
)

// ─── GET /api/fep/folios ─────────────────────────────────────────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'ver'),
  async (req, res) => {
    try {
      const { empresa_id, estado, canal_id, fecha_desde, fecha_hasta, q, sort_by, sort_dir, page = 1, limit = 20 } = req.query
      const safePage = Math.max(1, parseInt(page) || 1)
      const safeLimit = Math.min(500, Math.max(1, parseInt(limit) || 20))
      const offset = (safePage - 1) * safeLimit

      const SORT_COLS = {
        folio_numero: 'fe.folio_numero', empresa: 'e.nombre', estado: 'fe.estado',
        created_at: 'fe.created_at', total_tarimas: 'fe.total_tarimas', total_guias: 'fe.total_guias',
      }
      const sortCol = SORT_COLS[sort_by] || 'fe.created_at'
      const sortOrder = sort_dir === 'asc' ? 'ASC' : 'DESC'

      const params = [req.tenantId]
      const where = [`fe.tenant_id = $1`]
      let pc = 1

      if (empresa_id) { pc++; where.push(`fe.empresa_id = $${pc}`); params.push(Number(empresa_id)) }
      if (estado) { pc++; where.push(`fe.estado = $${pc}`); params.push(estado) }
      if (canal_id) { pc++; where.push(`$${pc} = ANY(fe.canales)`); params.push(Number(canal_id)) }

      if (fecha_desde) { pc++; where.push(`${dateInTZ('fe.created_at', TZ)} >= $${pc}::date`); params.push(fecha_desde) }
      if (fecha_hasta) { pc++; where.push(`${dateInTZ('fe.created_at', TZ)} <= $${pc}::date`); params.push(fecha_hasta) }

      if (q?.trim()) {
        pc++
        where.push(`(
          fe.folio_numero ILIKE $${pc}
          OR e.nombre ILIKE $${pc}
          OR EXISTS (
            SELECT 1 FROM folios_entrega_tarimas fet
            JOIN guias g ON g.tarima_id = fet.tarima_id
            WHERE fet.folio_id = fe.id AND fet.eliminado_en IS NULL AND g.codigo_guia ILIKE $${pc}
          )
        )`)
        params.push(`%${q.trim()}%`)
      }

      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''

      const countRes = await req.tQuery(
        `SELECT COUNT(*) FROM folios_entrega fe JOIN configuraciones e ON e.id = fe.empresa_id ${whereClause}`,
        params
      )
      const total = parseInt(countRes.rows[0].count)

      pc++; params.push(safeLimit)
      pc++; params.push(offset)

      const result = await req.tQuery(
        `SELECT fe.id, fe.folio_numero, fe.estado, fe.canales,
                fe.total_tarimas, fe.total_guias, fe.created_at, fe.hora_fin,
                fe.fecha_tarimas_desde, fe.fecha_tarimas_hasta, fe.estatus_tarima_filtro,
                e.nombre AS empresa_nombre, e.codigo AS empresa_codigo, e.id AS empresa_id,
                u.nombre_completo AS creado_por_nombre
         FROM folios_entrega fe
         JOIN configuraciones e ON e.id = fe.empresa_id
         JOIN usuarios u ON u.id = fe.creado_por
         ${whereClause}
         ORDER BY ${sortCol} ${sortOrder}
         LIMIT $${pc-1} OFFSET $${pc}`,
        params
      )

      res.json({
        folios: result.rows,
        pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
      })
    } catch (err) {
      console.error('FEP list error:', err)
      res.status(500).json({ error: 'Error obteniendo folios' })
    }
  }
)

// ─── POST /api/fep/folios ────────────────────────────────────────────────────
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'crear'),
  async (req, res) => {
    const { empresa_id, canales, fecha_desde, fecha_hasta, estatus_tarima, tarima_ids } = req.body

    if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
    if (!tarima_ids?.length) return res.status(400).json({ error: 'Se requiere al menos una tarima' })

    const client = await req.tGetClient()
    try {
      // Tenant-scoped folio number generation.
      // Advisory lock serializes concurrent requests for the same tenant,
      // preventing two transactions from selecting the same MAX before either inserts.
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [tenantLockKey(req.tenantId)])
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(CAST(SPLIT_PART(folio_numero, '-', 2) AS INTEGER)), 0) + 1 AS n
         FROM folios_entrega WHERE tenant_id = $1`,
        [req.tenantId]
      )
      const n = seqRes.rows[0].n
      const folioNumero = `FEP-${String(n).padStart(5, '0')}`

      const canalIds = canales?.length ? canales : null

      const folioRes = await client.query(
        `INSERT INTO folios_entrega
           (folio_numero, empresa_id, canales, fecha_tarimas_desde, fecha_tarimas_hasta,
            estatus_tarima_filtro, estado, hora_inicio, creado_por, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,'ACTIVO',now(),$7,$8)
         RETURNING *`,
        [folioNumero, empresa_id, canalIds, fecha_desde || new Date().toISOString().slice(0,10),
         fecha_hasta || new Date().toISOString().slice(0,10),
         estatus_tarima || 'FINALIZADA', req.fullUser.id, req.tenantId]
      )
      const folio = folioRes.rows[0]

      // Verify tarimas are not already in an active folio
      const conflictRes = await client.query(
        `SELECT t.id, t.codigo, fe.folio_numero
         FROM tarimas t
         JOIN folios_entrega_tarimas fet ON fet.tarima_id = t.id AND fet.eliminado_en IS NULL
         JOIN folios_entrega fe ON fe.id = fet.folio_id AND fe.estado = 'ACTIVO'
         WHERE t.id = ANY($1)`,
        [tarima_ids]
      )
      if (conflictRes.rows.length > 0) {
        const codes = conflictRes.rows.map(r => `${r.codigo} (${r.folio_numero})`).join(', ')
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `Tarimas ya en folio activo: ${codes}` })
      }

      // Insert tarima associations
      for (const tid of tarima_ids) {
        await client.query(
          `INSERT INTO folios_entrega_tarimas (folio_id, tarima_id, agregado_por, tenant_id) VALUES ($1,$2,$3,$4)`,
          [folio.id, tid, req.fullUser.id, req.tenantId]
        )
      }

      await recalcTotals(client, folio.id)
      await logAction(client, folio.id, 'CREACION', { tarima_ids }, req.fullUser.id, req.tenantId)

      await client.query('COMMIT')

      // Return full folio with updated totals
      const fullRes = await req.tQuery(
        `SELECT fe.*, e.nombre AS empresa_nombre, u.nombre_completo AS creado_por_nombre
         FROM folios_entrega fe
         JOIN configuraciones e ON e.id = fe.empresa_id
         JOIN usuarios u ON u.id = fe.creado_por
         WHERE fe.id = $1 AND fe.tenant_id = $2`,
        [folio.id, req.tenantId]
      )
      res.status(201).json({ success: true, folio: fullRes.rows[0] })
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('FEP create error:', err)
      res.status(500).json({ error: 'Error creando folio' })
    } finally {
      client.release()
    }
  }
)

// ─── GET /api/fep/folios/:id ─────────────────────────────────────────────────
router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'ver'),
  async (req, res) => {
    try {
      const { id } = req.params

      const folioRes = await req.tQuery(
        `SELECT fe.*, e.nombre AS empresa_nombre, e.codigo AS empresa_codigo,
                u.nombre_completo AS creado_por_nombre
         FROM folios_entrega fe
         JOIN configuraciones e ON e.id = fe.empresa_id
         JOIN usuarios u ON u.id = fe.creado_por
         WHERE fe.id = $1 AND fe.tenant_id = $2`,
        [id, req.tenantId]
      )
      if (!folioRes.rows.length) return res.status(404).json({ error: 'Folio no encontrado' })
      const folio = folioRes.rows[0]

      const tarimasRes = await req.tQuery(
        `SELECT t.id, t.codigo, t.estado, t.cantidad_guias, t.fecha_inicio, t.fecha_cierre,
                c.nombre AS canal_nombre, c.id AS canal_id,
                fet.agregado_en, fet.eliminado_en
         FROM folios_entrega_tarimas fet
         JOIN tarimas t ON t.id = fet.tarima_id
         JOIN configuraciones c ON c.id = t.canal_id
         WHERE fet.folio_id = $1 AND fet.eliminado_en IS NULL AND fet.tenant_id = $2
         ORDER BY fet.agregado_en ASC`,
        [id, req.tenantId]
      )

      const guiasRes = await req.tQuery(
        `SELECT g.codigo_guia, g.posicion, g.timestamp_escaneo, t.codigo AS tarima_codigo,
                c.nombre AS canal_nombre
         FROM folios_entrega_tarimas fet
         JOIN guias g ON g.tarima_id = fet.tarima_id
         JOIN tarimas t ON t.id = fet.tarima_id
         JOIN configuraciones c ON c.id = t.canal_id
         WHERE fet.folio_id = $1 AND fet.eliminado_en IS NULL AND fet.tenant_id = $2
         ORDER BY g.timestamp_escaneo ASC`,
        [id, req.tenantId]
      )

      res.json({ folio, tarimas: tarimasRes.rows, guias: guiasRes.rows })
    } catch (err) {
      console.error('FEP detail error:', err)
      res.status(500).json({ error: 'Error obteniendo folio' })
    }
  }
)

// ─── PATCH /api/fep/folios/:id ───────────────────────────────────────────────
router.patch('/:id',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'editar'),
  async (req, res) => {
    const { id } = req.params
    const { agregar_tarimas = [], eliminar_tarimas = [] } = req.body

    const client = await req.tGetClient()
    try {
      // BEGIN is already active via tGetClient

      const folioRes = await client.query(`SELECT * FROM folios_entrega WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [id, req.tenantId])
      if (!folioRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Folio no encontrado' }) }
      const folio = folioRes.rows[0]

      if (folio.estado !== 'ACTIVO') { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Solo se pueden editar folios activos' }) }
      if (!isSameDay(folio.created_at) && req.fullUser.rol_nombre !== 'Administrador') {
        await client.query('ROLLBACK')
        return res.status(403).json({ error: 'Solo se pueden editar folios creados hoy' })
      }

      // Remove tarimas
      if (eliminar_tarimas.length) {
        await client.query(
          `UPDATE folios_entrega_tarimas SET eliminado_en = now(), eliminado_por = $1
           WHERE folio_id = $2 AND tarima_id = ANY($3) AND eliminado_en IS NULL`,
          [req.fullUser.id, id, eliminar_tarimas]
        )
      }

      // Add tarimas (check conflicts first)
      if (agregar_tarimas.length) {
        const conflictRes = await client.query(
          `SELECT t.id, t.codigo, fe.folio_numero
           FROM tarimas t
           JOIN folios_entrega_tarimas fet ON fet.tarima_id = t.id AND fet.eliminado_en IS NULL
           JOIN folios_entrega fe ON fe.id = fet.folio_id AND fe.estado = 'ACTIVO'
           WHERE t.id = ANY($1) AND fe.id != $2`,
          [agregar_tarimas, id]
        )
        if (conflictRes.rows.length) {
          const codes = conflictRes.rows.map(r => r.codigo).join(', ')
          await client.query('ROLLBACK')
          return res.status(409).json({ error: `Tarimas ya en otro folio activo: ${codes}` })
        }

        for (const tid of agregar_tarimas) {
          await client.query(
            `INSERT INTO folios_entrega_tarimas (folio_id, tarima_id, agregado_por, tenant_id)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (folio_id, tarima_id) DO UPDATE
               SET eliminado_en = NULL, eliminado_por = NULL, agregado_en = now(), agregado_por = $3`,
            [id, tid, req.fullUser.id, req.tenantId]
          )
        }
      }

      await recalcTotals(client, id)
      await logAction(client, id, 'EDICION',
        { agregar_tarimas, eliminar_tarimas }, req.fullUser.id, req.tenantId)

      await client.query('COMMIT')

      const fullRes = await req.tQuery(
        `SELECT fe.*, e.nombre AS empresa_nombre FROM folios_entrega fe
         JOIN configuraciones e ON e.id = fe.empresa_id WHERE fe.id = $1 AND fe.tenant_id = $2`,
        [id, req.tenantId]
      )
      res.json({ success: true, folio: fullRes.rows[0] })
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('FEP edit error:', err)
      res.status(500).json({ error: 'Error editando folio' })
    } finally {
      client.release()
    }
  }
)

// ─── POST /api/fep/folios/:id/cancelar ──────────────────────────────────────
router.post('/:id/cancelar',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'cancelar'),
  async (req, res) => {
    const { id } = req.params
    const { motivo } = req.body

    const client = await req.tGetClient()
    try {
      const folioRes = await client.query(`SELECT * FROM folios_entrega WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [id, req.tenantId])
      if (!folioRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Folio no encontrado' }) }
      const folio = folioRes.rows[0]

      if (folio.estado !== 'ACTIVO') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Solo se pueden cancelar folios activos' }) }
      if (folio.estado === 'COMPLETADO') { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Los folios completados son inmutables' }) }

      await client.query(
        `UPDATE folios_entrega SET estado = 'CANCELADO', motivo_cancelacion = $1, hora_fin = now(), updated_at = now() WHERE id = $2`,
        [motivo || null, id]
      )
      await logAction(client, id, 'CANCELACION', { motivo }, req.fullUser.id, req.tenantId)

      await client.query('COMMIT')
      res.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('FEP cancel error:', err)
      res.status(500).json({ error: 'Error cancelando folio' })
    } finally {
      client.release()
    }
  }
)

// ─── DELETE /api/fep/folios/:id ──────────────────────────────────────────────
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'eliminar'),
  async (req, res) => {
    const { id } = req.params
    const client = await req.tGetClient()
    try {
      const folioRes = await client.query(`SELECT * FROM folios_entrega WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [id, req.tenantId])
      if (!folioRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Folio no encontrado' }) }
      const folio = folioRes.rows[0]

      if (folio.estado === 'COMPLETADO') { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Los folios completados son inmutables' }) }

      if (!isSameDay(folio.created_at)) {
        await client.query('ROLLBACK')
        return res.status(403).json({ error: 'Solo se pueden eliminar folios del día actual' })
      }
      if (!['ACTIVO', 'CANCELADO'].includes(folio.estado)) {
        await client.query('ROLLBACK')
        return res.status(403).json({ error: 'Estado no permite eliminación' })
      }

      await logAction(client, id, 'ELIMINACION', { folio_numero: folio.folio_numero }, req.fullUser.id, req.tenantId)
      await client.query(`DELETE FROM folios_entrega WHERE id = $1`, [id])

      await client.query('COMMIT')
      res.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('FEP delete error:', err)
      res.status(500).json({ error: 'Error eliminando folio' })
    } finally {
      client.release()
    }
  }
)

// ─── GET /api/fep/folios/:id/log ─────────────────────────────────────────────
router.get('/:id/log',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT l.id, l.accion, l.detalle, l.timestamp, u.nombre_completo AS usuario_nombre
         FROM folios_entrega_log l
         LEFT JOIN usuarios u ON u.id = l.usuario_id
         WHERE l.folio_id = $1 AND l.tenant_id = $2
         ORDER BY l.timestamp ASC`,
        [req.params.id, req.tenantId]
      )
      res.json({ log: result.rows })
    } catch (err) {
      console.error('FEP log error:', err)
      res.status(500).json({ error: 'Error obteniendo log' })
    }
  }
)

// ─── GET /api/fep/folios/:id/pdf ─────────────────────────────────────────────
router.get('/:id/pdf',
  authenticateToken, loadFullUser,
  requirePermission('fep.folios', 'imprimir'),
  async (req, res) => {
    try {
      const { id } = req.params

      const folioRes = await req.tQuery(
        `SELECT fe.*, e.nombre AS empresa_nombre, e.codigo AS empresa_codigo,
                u.nombre_completo AS creado_por_nombre
         FROM folios_entrega fe
         JOIN configuraciones e ON e.id = fe.empresa_id
         JOIN usuarios u ON u.id = fe.creado_por
         WHERE fe.id = $1 AND fe.tenant_id = $2`,
        [id, req.tenantId]
      )
      if (!folioRes.rows.length) return res.status(404).json({ error: 'Folio no encontrado' })
      const folio = folioRes.rows[0]

      const guiasRes = await req.tQuery(
        `SELECT g.codigo_guia, g.posicion, g.timestamp_escaneo,
                t.codigo AS tarima_codigo, c.nombre AS canal_nombre
         FROM folios_entrega_tarimas fet
         JOIN guias g ON g.tarima_id = fet.tarima_id
         JOIN tarimas t ON t.id = fet.tarima_id
         JOIN configuraciones c ON c.id = t.canal_id
         WHERE fet.folio_id = $1 AND fet.eliminado_en IS NULL AND fet.tenant_id = $2
         ORDER BY g.timestamp_escaneo ASC`,
        [id, req.tenantId]
      )

      const tarimasRes = await req.tQuery(
        `SELECT COUNT(*) AS total FROM folios_entrega_tarimas WHERE folio_id = $1 AND eliminado_en IS NULL AND tenant_id = $2`,
        [id, req.tenantId]
      )

      // Log impresion — uses tenant-scoped tQuery so RLS applies
      await req.tQuery(
        `INSERT INTO folios_entrega_log (folio_id, accion, detalle, usuario_id, tenant_id) VALUES ($1,$2,$3,$4,$5)`,
        [id, 'IMPRESION', null, req.fullUser.id, req.tenantId]
      )

      const { default: PDFDocument } = await import('pdfkit')

      // bottom margin intentionally small so pdfkit's maxY (height-20=772)
      // stays above the footer zone (height-42=750), preventing auto page-creation
      // when we render the footer with switchToPage().
      const MARGIN = 50
      const CONTENT_MAX_Y = 715   // manual content limit — well above footer zone
      const FOOTER_Y_OFFSET = 42  // from bottom of page
      const SIG_MIN_SPACE = 80    // points needed for signature block

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: MARGIN, bottom: 20, left: MARGIN, right: MARGIN },
        autoFirstPage: true,
        bufferPages: true,
      })
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${folio.folio_numero}.pdf"`)
      doc.pipe(res)
      doc.on('error', (err) => {
        console.error('PDFDocument error:', err.message)
        if (!res.headersSent) res.status(500).json({ error: 'Error generando PDF' })
      })

      const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('es-MX', { timeZone: TZ }) : '-'
      const generadoEn = fmtDate(new Date())
      const guias = guiasRes.rows
      const PW = doc.page.width   // 612
      const PH = doc.page.height  // 792

      // ── Page 1 header ──────────────────────────────────────────────────────
      doc.fontSize(18).font('Helvetica-Bold').text('FOLIO DE ENTREGA', { align: 'center' })
      doc.fontSize(14).text(folio.folio_numero, { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(10).font('Helvetica')
      doc.text(`Empresa: ${folio.empresa_nombre}   |   Estado: ${folio.estado}`, { align: 'center' })
      doc.text(`Fecha: ${fmtDate(folio.created_at)}`, { align: 'center' })
      if (folio.hora_fin) doc.text(`Cierre: ${fmtDate(folio.hora_fin)}`, { align: 'center' })
      doc.moveDown()
      doc.font('Helvetica-Bold').text(`Total Tarimas: ${tarimasRes.rows[0].total}     Total Guias: ${guias.length}`)
      doc.moveDown()

      // ── Table header ────────────────────────────────────────────────────────
      const tableTop = doc.y
      const cols = { n: 35, fecha: 115, guia: 165, tarima: 100, canal: 90 }
      let x = MARGIN
      doc.font('Helvetica-Bold').fontSize(8)
      doc.rect(MARGIN, tableTop - 2, PW - MARGIN * 2, 14).fill('#f1f5f9').stroke('#e2e8f0')
      doc.fillColor('#374151')
      doc.text('#', x, tableTop, { width: cols.n - 4 }); x += cols.n
      doc.text('Fecha y Hora', x, tableTop, { width: cols.fecha - 5 }); x += cols.fecha
      doc.text('No. Guia', x, tableTop, { width: cols.guia - 5 }); x += cols.guia
      doc.text('Tarima', x, tableTop, { width: cols.tarima - 5 }); x += cols.tarima
      doc.text('Canal', x, tableTop, { width: cols.canal })

      let y = tableTop + 14
      doc.moveTo(MARGIN, y).lineTo(PW - MARGIN, y).strokeColor('#cbd5e1').stroke()
      y += 3
      doc.font('Helvetica').fontSize(8).fillColor('#111827')

      // ── Guide rows ──────────────────────────────────────────────────────────
      const addTableHeader = (startY) => {
        doc.font('Helvetica-Bold').fontSize(8)
        doc.rect(MARGIN, startY - 2, PW - MARGIN * 2, 14).fill('#f1f5f9').stroke('#e2e8f0')
        doc.fillColor('#374151')
        let hx = MARGIN
        doc.text('#', hx, startY, { width: cols.n - 4 }); hx += cols.n
        doc.text('Fecha y Hora', hx, startY, { width: cols.fecha - 5 }); hx += cols.fecha
        doc.text('No. Guia', hx, startY, { width: cols.guia - 5 }); hx += cols.guia
        doc.text('Tarima', hx, startY, { width: cols.tarima - 5 }); hx += cols.tarima
        doc.text('Canal', hx, startY, { width: cols.canal })
        doc.font('Helvetica').fontSize(8).fillColor('#111827')
        const lineY = startY + 14
        doc.moveTo(MARGIN, lineY).lineTo(PW - MARGIN, lineY).strokeColor('#cbd5e1').stroke()
        return lineY + 3
      }

      guias.forEach((g, i) => {
        if (y > CONTENT_MAX_Y) {
          doc.addPage()
          y = MARGIN
          y = addTableHeader(y)
        }
        x = MARGIN
        if (i % 2 === 0) {
          doc.rect(MARGIN, y - 1, PW - MARGIN * 2, 12).fill('#f8fafc').stroke()
        }
        doc.fillColor('#111827')
        doc.text(String(i + 1), x, y, { width: cols.n - 4 }); x += cols.n
        doc.text(fmtDate(g.timestamp_escaneo), x, y, { width: cols.fecha - 5, lineBreak: false }); x += cols.fecha
        doc.text(g.codigo_guia, x, y, { width: cols.guia - 5, lineBreak: false }); x += cols.guia
        doc.text(g.tarima_codigo || '-', x, y, { width: cols.tarima - 5, lineBreak: false }); x += cols.tarima
        doc.text(g.canal_nombre || '-', x, y, { width: cols.canal, lineBreak: false })
        y += 13
      })

      // ── Signature block ──────────────────────────────────────────────────────
      if (y > CONTENT_MAX_Y - SIG_MIN_SPACE) { doc.addPage(); y = MARGIN }
      y += 20
      doc.moveTo(MARGIN, y).lineTo(PW - MARGIN, y).strokeColor('#94a3b8').stroke()
      y += 18
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151')
      doc.text('Firma Responsable de Entrega:', MARGIN, y)
      doc.text('Firma Receptor Paqueteria:', 320, y)
      y += 45
      doc.moveTo(MARGIN, y).lineTo(250, y).strokeColor('#374151').stroke()
      doc.moveTo(320, y).lineTo(520, y).stroke()
      y += 6
      doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
      doc.text('Nombre y Cargo', MARGIN, y, { width: 200, align: 'center' })
      doc.text('Nombre y Cargo', 320, y, { width: 200, align: 'center' })

      // ── Footer on every page ─────────────────────────────────────────────────
      const range = doc.bufferedPageRange()
      const footerText = `${folio.folio_numero}  |  ${folio.empresa_nombre}  |  Generado: ${generadoEn}`
      for (let pi = range.start; pi < range.start + range.count; pi++) {
        doc.switchToPage(pi)
        const fy = PH - FOOTER_Y_OFFSET
        doc.save()
        doc.moveTo(MARGIN, fy - 6).lineTo(PW - MARGIN, fy - 6).strokeColor('#e2e8f0').lineWidth(0.5).stroke()
        doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
        doc.text(footerText, MARGIN, fy, { width: PW - MARGIN * 2, align: 'left', lineBreak: false })
        doc.text(`Pág. ${pi + 1} / ${range.count}`, MARGIN, fy, { width: PW - MARGIN * 2, align: 'right', lineBreak: false })
        doc.restore()
      }

      doc.end()
    } catch (err) {
      console.error('FEP pdf error:', err)
      if (!res.headersSent) res.status(500).json({ error: 'Error generando PDF' })
    }
  }
)

export default router
