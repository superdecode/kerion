import { extractBaseCode } from '../../Shared/Wms/extractBaseCode'

function fmtDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function getOrderCodes(order) {
  const scans = order.scans ?? []
  if (scans.length === 0) return []
  const map = new Map()
  for (const s of scans) {
    const base = extractBaseCode(s.codigo_caja) || s.codigo_caja
    if (!base) continue
    map.set(base, (map.get(base) || 0) + 1)
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

export function getOrderTarimas(order) {
  const scans = order.scans ?? []
  const refs = new Set()
  for (const s of scans) {
    if (s.tarima_ref) refs.add(s.tarima_ref)
  }
  return Array.from(refs).sort()
}

function getTarimaScans(order) {
  const scans = order.scans ?? []
  const map = new Map()
  for (const s of scans) {
    const ref = s.tarima_ref || 'Sin tarima'
    if (!map.has(ref)) map.set(ref, [])
    const base = extractBaseCode(s.codigo_caja) || s.codigo_caja
    if (base) map.get(ref).push(base)
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

const TH = {
  background: '#fff7ed',
  color: '#78716c',
  padding: '5px 8px',
  fontSize: '9px',
  fontWeight: '700',
  borderBottom: '1px solid #fed7aa',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const TD = {
  padding: '6px 8px',
  borderBottom: '1px solid #fee2ca',
  fontSize: '10px',
  verticalAlign: 'top',
}

const REJECTION_ROWS = 12

export default function PrintFolioContent({ folio, orders }) {
  if (!folio) return null

  const totalBultos = orders.reduce((s, o) => s + (Number(o.bultos) || 0), 0)
  const totalPeso   = orders.reduce((s, o) => s + (Number(o.peso_kg) || 0), 0)
  const showTarimas = !!folio.validar_por_tarimas

  return (
    <div id="print-folio-content" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: '#1a1a1a' }}>

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div style={{ border: '1px solid #fed7aa', marginBottom: '14px' }}>
        <div style={{ background: '#ffedd5', color: '#9a3412', padding: '7px 10px', textAlign: 'center', fontWeight: '800', fontSize: '13px', letterSpacing: '0.5px' }}>
          FOLIO DE DESPACHO
        </div>
        {/* Row 1 */}
        <div style={{ display: 'flex', borderTop: '1px solid #fed7aa' }}>
          {[
            { label: 'Folio',      value: folio.folio_numero },
            { label: 'Conductor',  value: folio.conductor_nombre || '—' },
            { label: 'Unidad',     value: folio.unidad_placa || '—' },
          ].map(({ label, value }, i, arr) => (
            <div key={label} style={{ flex: 1, padding: '5px 8px', borderRight: i < arr.length - 1 ? '1px solid #fed7aa' : 'none' }}>
              <span style={{ fontWeight: '600', color: '#78716c', fontSize: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
              <span style={{ fontWeight: '700', fontSize: '10px' }}>{value}</span>
            </div>
          ))}
        </div>
        {/* Row 2 */}
        <div style={{ display: 'flex', borderTop: '1px solid #fed7aa' }}>
          {[
            { label: 'Fecha Salida', value: fmtDate(folio.fecha_salida) },
            { label: 'Operador',     value: folio.operador_nombre || '—' },
            { label: 'Estado',       value: folio.estado || '—' },
          ].map(({ label, value }, i, arr) => (
            <div key={label} style={{ flex: 1, padding: '5px 8px', borderRight: i < arr.length - 1 ? '1px solid #fed7aa' : 'none' }}>
              <span style={{ fontWeight: '600', color: '#78716c', fontSize: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
              <span style={{ fontWeight: '700', fontSize: '10px' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabla de órdenes ─────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #fed7aa', marginBottom: '16px' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: '30px', textAlign: 'center' }}>#</th>
            <th style={TH}>Orden</th>
            <th style={TH}>Código</th>
            {showTarimas && <th style={{ ...TH, textAlign: 'center', width: '70px' }}># Tarima</th>}
            <th style={{ ...TH, textAlign: 'center' }}>Bultos</th>
            <th style={{ ...TH, textAlign: 'center' }}>Peso kg</th>
            <th style={TH}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => {
            const codes = getOrderCodes(o)
            const tarimas = showTarimas ? getOrderTarimas(o) : []
            return (
              <tr key={o.id || i} style={{ background: i % 2 === 0 ? '#ffffff' : '#fffbeb' }}>
                <td style={{ ...TD, textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>{i + 1}</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontWeight: '700', color: '#1e3a5f', whiteSpace: 'nowrap' }}>
                  {o.outbound_order_no || '—'}
                </td>
                <td style={TD}>
                  {codes.length > 0
                    ? codes.map(([base, count]) => (
                        <div key={base} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', lineHeight: '1.65' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '9px', fontWeight: '700', color: '#1e3a5f' }}>{base}</span>
                          <span style={{ fontSize: '8.5px', color: '#64748b' }}>({count})</span>
                        </div>
                      ))
                    : <span style={{ color: '#94a3b8' }}>—</span>
                  }
                </td>
                {showTarimas && (
                  <td style={{ ...TD, textAlign: 'center' }}>
                    {tarimas.length > 0
                      ? tarimas.map(ref => (
                          <div key={ref} style={{ fontFamily: 'monospace', fontSize: '9px', fontWeight: '700', color: '#9a3412', lineHeight: '1.6' }}>{ref}</div>
                        ))
                      : <span style={{ color: '#94a3b8' }}>—</span>
                    }
                  </td>
                )}
                <td style={{ ...TD, textAlign: 'center', fontWeight: '600' }}>{o.bultos ?? '—'}</td>
                <td style={{ ...TD, textAlign: 'center', color: '#475569' }}>
                  {o.peso_kg != null ? Number(o.peso_kg).toFixed(2) : '—'}
                </td>
                <td style={{ ...TD, color: '#334155' }}>{o.estado || 'pendiente'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={showTarimas ? 4 : 3} style={{ ...TD, background: '#ffedd5', fontWeight: '800', color: '#9a3412', borderBottom: 'none' }}>
              TOTALES
            </td>
            <td style={{ ...TD, background: '#ffedd5', fontWeight: '800', color: '#9a3412', textAlign: 'center', borderBottom: 'none' }}>
              {totalBultos}
            </td>
            <td style={{ ...TD, background: '#ffedd5', fontWeight: '700', color: '#9a3412', textAlign: 'center', borderBottom: 'none' }}>
              {totalPeso > 0 ? totalPeso.toFixed(2) : '—'}
            </td>
            <td style={{ ...TD, background: '#ffedd5', fontWeight: '600', color: '#9a3412', borderBottom: 'none' }}>
              {orders.length} orden{orders.length !== 1 ? 'es' : ''}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── Detallado por Tarima ─────────────────────────────────────────── */}
      {showTarimas && orders.some(o => getOrderTarimas(o).length > 0) && (
        <>
          <div style={{ background: '#ffedd5', color: '#9a3412', padding: '5px 8px', fontWeight: '700', fontSize: '10px', border: '1px solid #fed7aa', marginBottom: '8px' }}>
            DETALLADO POR TARIMA
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #fed7aa', marginBottom: '16px' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: '80px' }}>Orden</th>
                <th style={{ ...TH, width: '70px', textAlign: 'center' }}># Tarima</th>
                <th style={TH}>Códigos escaneados</th>
                <th style={{ ...TH, textAlign: 'center', width: '50px' }}>Cant</th>
              </tr>
            </thead>
            <tbody>
              {orders.flatMap((o, oi) =>
                getTarimaScans(o).map(([ref, codes], ti) => (
                  <tr key={`${oi}-${ref}`} style={{ background: oi % 2 === 0 ? '#ffffff' : '#fffbeb' }}>
                    {ti === 0
                      ? <td style={{ ...TD, fontFamily: 'monospace', fontWeight: '700', color: '#1e3a5f', whiteSpace: 'nowrap', verticalAlign: 'top' }}
                            rowSpan={getTarimaScans(o).length}>
                          {o.outbound_order_no || '—'}
                        </td>
                      : null
                    }
                    <td style={{ ...TD, textAlign: 'center', fontFamily: 'monospace', fontWeight: '700', color: '#9a3412' }}>
                      {ref}
                    </td>
                    <td style={{ ...TD, fontSize: '9px' }}>
                      {codes.map((c, ci) => (
                        <span key={ci} style={{ fontFamily: 'monospace', marginRight: '6px', color: '#1e3a5f' }}>{c}</span>
                      ))}
                    </td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: '600' }}>{codes.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ── Detallado de rechazos ─────────────────────────────────────────── */}
      <div style={{ background: '#ffedd5', color: '#9a3412', padding: '5px 8px', fontWeight: '700', fontSize: '10px', border: '1px solid #fed7aa', marginBottom: '8px' }}>
        DETALLADO DE RECHAZOS
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #fed7aa', marginBottom: '24px' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: '30px', textAlign: 'center' }}>#</th>
            <th style={{ ...TH, width: '35%' }}>Código</th>
            <th style={{ ...TH, textAlign: 'center', width: '60px' }}>Cant</th>
            <th style={TH}>Observación</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: REJECTION_ROWS }, (_, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#fffbeb' }}>
              <td style={{ ...TD, textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
              <td style={TD}>&nbsp;</td>
              <td style={TD}>&nbsp;</td>
              <td style={TD}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Firmas ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        {['Conductor — ' + (folio.conductor_nombre || ''), 'Recibe'].map(label => (
          <div key={label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #334155', margin: '55px 24px 7px' }} />
            <span style={{ fontSize: '8.5px', color: '#78716c', fontWeight: '600' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '14px', borderTop: '1px solid #fed7aa', textAlign: 'center', fontSize: '8px', color: '#78716c', paddingTop: '7px' }}>
        Generado el {new Date().toLocaleString('es-MX')} · Sistema Kirion WMS
      </div>
    </div>
  )
}
