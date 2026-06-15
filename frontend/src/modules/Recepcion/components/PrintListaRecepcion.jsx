const TH = {
  padding: '6px 10px',
  fontWeight: '700',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  border: '1px solid #cbd5e1',
  whiteSpace: 'nowrap',
}

const TD = {
  padding: '6px 10px',
  border: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
}

function fmtFull(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function PrintListaRecepcion({ data }) {
  if (!data) return null

  return (
    <div id="print-lista-recepcion" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11px', color: '#1a1a1a' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '900', letterSpacing: '0.04em', color: '#0f172a' }}>{data.title}</div>
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#475569', lineHeight: '1.5' }}>
              <div>Folio: <strong>{data.order.folio}</strong></div>
              <div>Cliente: <strong>{data.order.cliente || '—'}</strong></div>
              <div>Orden WMS: <strong>{data.order.inbound_order_no || '—'}</strong></div>
              <div>Tracking: <strong>{data.order.tracking_no || '—'}</strong></div>
              <div>Referencia: <strong>{data.order.reference_no || '—'}</strong></div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px', color: '#64748b', lineHeight: '1.5' }}>
            <div>Generado: <strong>{fmtFull(data.generatedAt)}</strong></div>
            <div>Fecha orden: <strong>{data.fecha || '—'}</strong></div>
            <div>Grupos: <strong>{data.totalGrupos}</strong></div>
            <div>Cajas: <strong>{data.totalCajas}</strong></div>
          </div>
        </div>
        <hr style={{ margin: '8px 0 0', borderColor: '#cbd5e1', borderWidth: '1px 0 0' }} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eff6ff' }}>
            <th style={{ ...TH, width: '44px', textAlign: 'center' }}>#</th>
            <th style={{ ...TH, textAlign: 'left' }}>Código base</th>
            <th style={{ ...TH, textAlign: 'right' }}>Cajas</th>
            <th style={{ ...TH, textAlign: 'left' }}>SKU</th>
            <th style={{ ...TH, textAlign: 'right' }}>Qty/Caja</th>
            {data.withTarimas && <th style={{ ...TH, textAlign: 'right' }}># Tarima</th>}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={`${row.base}-${index}`} style={{ background: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
              <td style={{ ...TD, textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>{index + 1}</td>
              <td style={{ ...TD, fontFamily: 'Courier New, monospace', fontWeight: '700', color: '#0f172a' }}>{row.base || '—'}</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: '700', color: '#1d4ed8' }}>{row.cajas}</td>
              <td style={{ ...TD, color: '#334155' }}>{row.sku || '—'}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#475569' }}>{row.qty_per_box || '—'}</td>
              {data.withTarimas && <td style={{ ...TD, textAlign: 'right', color: '#475569' }}>{row.tarima || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{
        marginTop: '14px',
        padding: '10px 14px',
        background: '#eff6ff',
        border: '1.5px solid #bfdbfe',
        borderRadius: '6px',
        display: 'flex',
        gap: '28px',
        fontSize: '12px',
        fontWeight: '700',
        color: '#1e40af',
      }}>
        <span>Total grupos: {data.totalGrupos}</span>
        <span>Total cajas: {data.totalCajas}</span>
      </div>
    </div>
  )
}
