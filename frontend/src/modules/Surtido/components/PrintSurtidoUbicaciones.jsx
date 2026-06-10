const TH = {
  padding: '6px 10px',
  fontWeight: '700',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  border: '1px solid #c8c8c8',
  whiteSpace: 'nowrap',
}

const TD = {
  padding: '5px 10px',
  border: '1px solid #e0e0e0',
  whiteSpace: 'nowrap',
}

function sortByLocation(a, b) {
  const NO_LOC = '\xFF'
  const parse = (s) => {
    if (!s || s === 'SIN UBICACIÓN') return [NO_LOC]
    return s.split(/[-\/]/).map(p => {
      const n = parseInt(p, 10)
      return Number.isNaN(n) ? p.toUpperCase() : n
    })
  }
  const pa = parse(a.location)
  const pb = parse(b.location)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? ''
    const vb = pb[i] ?? ''
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return va - vb
    } else {
      const cmp = String(va).localeCompare(String(vb), 'es')
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

function fmt(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtFull(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  return date.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function PrintSurtidoUbicaciones({ data }) {
  if (!data) return null

  const sorted = [...data.grupos].sort(sortByLocation)

  return (
    <div id="print-surtido-ubicaciones" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11px', color: '#1a1a1a' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="print-page-header" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '900', letterSpacing: '0.04em', color: '#0f172a' }}>Reporte Surtido por Ubicaciones</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px', color: '#64748b', lineHeight: '1.5' }}>
            <div>Generado: <strong>{fmtFull(data.generatedAt)}</strong></div>
            {data.userName && <div>Usuario: {data.userName}</div>}
            {data.tenantName && <div>Almacén: {data.tenantName}</div>}
          </div>
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px',
          borderTop: '1px solid #cbd5e1', paddingTop: '6px',
          fontSize: '10px', color: '#475569',
        }}>
          {data.dateFrom && data.dateTo && (
            <span>Órdenes: <strong>{fmt(data.dateFrom)} – {fmt(data.dateTo)}</strong></span>
          )}
          {data.filterClient?.length > 0 && (
            <span>Cliente: <strong>{data.filterClient.join(', ')}</strong></span>
          )}
          {data.filterSurtidor?.filter(v => v !== '__unassigned__').length > 0 && (
            <span>Surtidor: <strong>{data.filterSurtidor.filter(v => v !== '__unassigned__').join(', ')}</strong></span>
          )}
          {data.filterDestination && (
            <span>Destino: <strong>{data.filterDestination}</strong></span>
          )}
          {data.timeFrom && data.timeTo && (
            <span>Horario: <strong>{data.timeFrom} – {data.timeTo}</strong></span>
          )}
          <span style={{ fontWeight: '700', color: '#1e40af' }}>
            Órdenes seleccionadas: {data.totalOrdenes}
          </span>
        </div>

        <hr style={{ margin: '8px 0 0', borderColor: '#cbd5e1', borderWidth: '1px 0 0' }} />
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
          No hay cajas registradas para las órdenes seleccionadas.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ ...TH, width: '40px', textAlign: 'center' }}>#</th>
              <th style={{ ...TH, textAlign: 'left', width: '45%' }}>Ubicación</th>
              <th style={{ ...TH, textAlign: 'right' }}>Cant. Cajas</th>
              <th style={{ ...TH, textAlign: 'right' }}>Cant. Órdenes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.location} style={{ background: i % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                <td style={{ ...TD, textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>{i + 1}</td>
                <td style={{
                  ...TD,
                  fontFamily: 'Courier New, monospace',
                  fontWeight: row.location === 'SIN UBICACIÓN' ? '400' : '700',
                  color: row.location === 'SIN UBICACIÓN' ? '#dc2626' : '#0f172a',
                }}>{row.location}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: '700', color: '#1e40af' }}>{row.cantCajas}</td>
                <td style={{ ...TD, textAlign: 'right', color: '#475569' }}>{row.cantOrdenes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Summary footer ─────────────────────────────── */}
      <div style={{
        marginTop: '14px', padding: '10px 14px',
        background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '6px',
        display: 'flex', gap: '28px', fontSize: '12px', fontWeight: '700', color: '#1e40af',
      }}>
        <span>Total Ubicaciones: {data.totalUbicaciones}</span>
        <span>Total Cajas: {data.totalCajas}</span>
        <span>Total Órdenes: {data.totalOrdenes}</span>
      </div>
    </div>
  )
}
