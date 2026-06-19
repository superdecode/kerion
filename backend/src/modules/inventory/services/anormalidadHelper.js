import { format } from 'date-fns'
import { query } from '../../../config/database.js'
import { getNivelMeta } from '../../anormalidades/utils/niveles.js'

export async function crearAnormalidadRastreo(tQuery, tenantId, { boxCode, ordenFolio, outboundOrderNo, userId, userName }) {
  try {
    // Lookup codigo_id for INV-07 without RLS (schema-level query)
    const codeRes = await query(
      `SELECT id, nombre_es AS nombre, nivel_sugerido FROM anormalidades_codigos
       WHERE tenant_id = $1 AND codigo = 'INV-07' AND activo = true LIMIT 1`,
      [tenantId]
    )
    const codeRow = codeRes.rows[0]
    if (!codeRow) return null

    // Generate INC folio for the anormalidad
    const today = format(new Date(), 'yyyyMMdd')
    const cntRes = await tQuery(
      `SELECT COUNT(*) AS cnt FROM anormalidades
       WHERE tenant_id = $1
         AND to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD') = $2`,
      [tenantId, today]
    )
    const seq = parseInt(cntRes.rows[0].cnt, 10) + 1
    const folio = `INC-${today}-${String(seq).padStart(4, '0')}`

    const nivel = codeRow.nivel_sugerido || 'L3'
    const nivelMeta = await getNivelMeta(tQuery, tenantId, nivel)
    const horas = Number(nivelMeta?.horas_limite || 4)
    const fecha_limite = new Date(Date.now() + horas * 3600000)

    const insertRes = await tQuery(
      `INSERT INTO anormalidades
         (tenant_id, folio, fecha_ocurrencia, proceso, codigo_id, codigo, nombre, nivel,
          contenedor_orden, sku, descripcion,
          detectado_por_id, detectado_por_nombre, evidencia, fecha_limite, created_by)
       VALUES ($1,$2,now(),'Inventario',$3,'INV-07',$4,$5,$6,$7,$8,$9,$10,'[]',$11,$12)
       RETURNING id`,
      [
        tenantId, folio,
        codeRow.id, codeRow.nombre, nivel,
        outboundOrderNo || null,
        boxCode,
        `Caja ${boxCode} no localizada en rastreo ${ordenFolio}`,
        userId || null, userName || null,
        fecha_limite, userId || null,
      ]
    )

    const anormId = insertRes.rows[0].id

    // Historial entry
    await tQuery(
      `INSERT INTO anormalidades_historial
         (anormalidad_id, tenant_id, usuario_id, usuario_nombre, estado_anterior, estado_nuevo, nota)
       VALUES ($1,$2,$3,$4,NULL,'nuevo','Generada automáticamente desde Rastreo')`,
      [anormId, tenantId, userId || null, userName || null]
    )

    return anormId
  } catch (err) {
    console.error('[anormalidadHelper.crearAnormalidadRastreo]', err.message)
    return null
  }
}

export async function crearAnormalidadRastreoConsolidada(tQuery, tenantId, { boxCodes, ordenFolio, outboundOrderNo, userId, userName }) {
  try {
    const codeRes = await query(
      `SELECT id, nombre_es AS nombre, nivel_sugerido FROM anormalidades_codigos
       WHERE tenant_id = $1 AND codigo = 'INV-07' AND activo = true LIMIT 1`,
      [tenantId]
    )
    const codeRow = codeRes.rows[0]
    if (!codeRow) return null

    const today = format(new Date(), 'yyyyMMdd')
    const cntRes = await tQuery(
      `SELECT COUNT(*) AS cnt FROM anormalidades
       WHERE tenant_id = $1
         AND to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD') = $2`,
      [tenantId, today]
    )
    const seq = parseInt(cntRes.rows[0].cnt, 10) + 1
    const folio = `INC-${today}-${String(seq).padStart(4, '0')}`

    const nivel = codeRow.nivel_sugerido || 'L3'
    const nivelMeta = await getNivelMeta(tQuery, tenantId, nivel)
    const horas = Number(nivelMeta?.horas_limite || 4)
    const fecha_limite = new Date(Date.now() + horas * 3600000)

    const n = boxCodes.length
    const preview = boxCodes.slice(0, 5).join(', ') + (n > 5 ? ` y ${n - 5} más` : '')
    const descripcion = `${n} caja${n !== 1 ? 's' : ''} no localizada${n !== 1 ? 's' : ''} en rastreo ${ordenFolio}: ${preview}`

    const insertRes = await tQuery(
      `INSERT INTO anormalidades
         (tenant_id, folio, fecha_ocurrencia, proceso, codigo_id, codigo, nombre, nivel,
          contenedor_orden, sku, descripcion,
          detectado_por_id, detectado_por_nombre, evidencia, fecha_limite, created_by)
       VALUES ($1,$2,now(),'Inventario',$3,'INV-07',$4,$5,$6,$7,$8,$9,$10,'[]',$11,$12)
       RETURNING id`,
      [
        tenantId, folio,
        codeRow.id, codeRow.nombre, nivel,
        outboundOrderNo || null,
        null,
        descripcion,
        userId || null, userName || null,
        fecha_limite, userId || null,
      ]
    )

    const anormId = insertRes.rows[0].id

    await tQuery(
      `INSERT INTO anormalidades_historial
         (anormalidad_id, tenant_id, usuario_id, usuario_nombre, estado_anterior, estado_nuevo, nota)
       VALUES ($1,$2,$3,$4,NULL,'nuevo','Generada automáticamente desde Rastreo')`,
      [anormId, tenantId, userId || null, userName || null]
    )

    return anormId
  } catch (err) {
    console.error('[anormalidadHelper.crearAnormalidadRastreoConsolidada]', err.message)
    return null
  }
}
