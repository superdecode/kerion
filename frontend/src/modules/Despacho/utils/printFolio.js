// frontend/src/modules/Despacho/utils/printFolio.js

function esc(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtPrint(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function printFolio({ folio, orders }) {
  if (!folio || !orders?.length) return { success: false, message: 'No hay órdenes para imprimir' }

  const totalBultos = orders.reduce((s, o) => s + (Number(o.bultos) || 0), 0)
  const totalPeso   = orders.reduce((s, o) => s + (Number(o.peso_kg) || 0), 0)

  const orderRows = orders.map((o, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="col-mono">${esc(o.outbound_order_no) || '—'}</td>
      <td>${esc(o.cliente) || '—'}</td>
      <td class="col-center">${o.bultos ?? '—'}</td>
      <td class="col-center">${o.peso_kg != null ? Number(o.peso_kg).toFixed(2) : '—'}</td>
      <td>${esc(o.estado) || 'pendiente'}</td>
    </tr>`).join('')

  const rejectionRows = Array.from({ length: 16 }, (_, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td></td><td></td><td></td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Folio ${esc(folio.folio_numero)}</title>
  <style>
    @page { size: letter; margin: 15mm; }
    body { font-family: 'Segoe UI', sans-serif; font-size: 10pt; color: #334155; }
    .header { border: 1px solid #fed7aa; margin-bottom: 12px; }
    .header-title { background: #ffedd5; color: #9a3412; padding: 6px; text-align: center; font-weight: 700; font-size: 11pt; letter-spacing: .5px; }
    .header-row { display: flex; border-top: 1px solid #fed7aa; }
    .header-cell { flex: 1; padding: 5px 8px; border-right: 1px solid #fed7aa; }
    .header-cell:last-child { border-right: none; }
    .header-label { font-weight: 600; color: #78716c; font-size: 8.5pt; display: block; }
    .header-value { font-weight: 700; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #fed7aa; margin-bottom: 14px; }
    th { background: #fff7ed; color: #78716c; padding: 5px 6px; font-size: 8.5pt; font-weight: 600; border-bottom: 1px solid #fed7aa; text-transform: uppercase; text-align: left; }
    td { padding: 5px 6px; border-bottom: 1px solid #fee2ca; font-size: 9pt; }
    tr:nth-child(even) td { background: #fffbeb; }
    .col-num { width: 28px; text-align: center; }
    .col-mono { font-family: monospace; font-weight: 600; color: #1e3a5f; }
    .col-center { text-align: center; }
    tfoot td { background: #ffedd5 !important; font-weight: 700; font-size: 9pt; padding: 6px; }
    .section-title { background: #ffedd5; color: #9a3412; padding: 5px 8px; font-weight: 700; font-size: 10pt; border: 1px solid #fed7aa; margin-bottom: 8px; }
    .firmas { display: flex; justify-content: space-between; margin-top: 36px; }
    .firma { flex: 1; text-align: center; }
    .firma-line { border-top: 1px solid #334155; margin: 55px 24px 7px; }
    .firma-label { font-size: 8.5pt; color: #78716c; font-weight: 600; }
    .footer { margin-top: 16px; border-top: 1px solid #fed7aa; text-align: center; font-size: 8pt; color: #78716c; padding-top: 8px; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .header-title, .section-title, tfoot td { background: #ffedd5 !important; }
      th { background: #fff7ed !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">FOLIO DE DESPACHO</div>
    <div class="header-row">
      <div class="header-cell"><span class="header-label">Folio</span><span class="header-value">${esc(folio.folio_numero)}</span></div>
      <div class="header-cell"><span class="header-label">Conductor</span><span class="header-value">${esc(folio.conductor_nombre) || '—'}</span></div>
      <div class="header-cell"><span class="header-label">Unidad</span><span class="header-value">${esc(folio.unidad_placa) || '—'}</span></div>
    </div>
    <div class="header-row">
      <div class="header-cell"><span class="header-label">Fecha Salida</span><span class="header-value">${fmtPrint(folio.fecha_salida)}</span></div>
      <div class="header-cell"><span class="header-label">Operador</span><span class="header-value">${esc(folio.operador_nombre) || '—'}</span></div>
      <div class="header-cell"><span class="header-label">Estado</span><span class="header-value">${esc(folio.estado)}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th>Orden</th>
        <th>Cliente</th>
        <th class="col-center">Bultos</th>
        <th class="col-center">Peso kg</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>${orderRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">TOTALES</td>
        <td class="col-center">${totalBultos}</td>
        <td class="col-center">${totalPeso.toFixed(2)}</td>
        <td>${orders.length} orden${orders.length !== 1 ? 'es' : ''}</td>
      </tr>
    </tfoot>
  </table>

  <div class="section-title">DETALLADO DE RECHAZOS</div>
  <table>
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th style="width:35%">Código</th>
        <th class="col-center">Cant</th>
        <th>Observación</th>
      </tr>
    </thead>
    <tbody>${rejectionRows}</tbody>
  </table>

  <div class="firmas">
    <div class="firma"><div class="firma-line"></div><div class="firma-label">Conductor — ${esc(folio.conductor_nombre) || ''}</div></div>
    <div class="firma"><div class="firma-line"></div><div class="firma-label">Recibe</div></div>
  </div>

  <div class="footer">Generado el ${new Date().toLocaleString('es-MX')} • Sistema Kirion WMS</div>
</body>
</html>`

  const popup = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
  if (!popup) return { success: false, message: 'El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.' }
  popup.document.write(html)
  popup.document.close()
  popup.onafterprint = () => popup.close()
  popup.focus()
  popup.print()
  return { success: true }
}
