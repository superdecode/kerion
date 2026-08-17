// @ts-check
import { test, expect } from '@playwright/test'

/**
 * Validación de surtido por lote — flujo crítico.
 *
 * El backend y el Google Sheet van mockeados con page.route: la prueba verifica
 * el cableado real de la pantalla (pool por fecha, autoasignación a la orden,
 * duplicados, rechazos, tarima con ubicación y confirmación) sin depender de una
 * base de datos ni de datos vivos en el sheet.
 */

const FECHA = '2026-08-17'
const FECHA_AYER = '2026-08-16'

// Cada fila del sheet es una caja. Encabezados con los alias reales del export.
const SHEET_CSV = [
  'Outbound_出库单号,Recipient_收件人,Expected Arrival Time _ 期望到仓时间,Box type No_箱类型号,Custom box barcode_自定义箱条码',
  `OBC-1001,Cliente Uno,${FECHA} 10:00:00,CAJA-A,AAA-1`,
  `OBC-1001,Cliente Uno,${FECHA} 10:00:00,CAJA-B,AAA-2`,
  `OBC-1002,Cliente Dos,${FECHA} 11:00:00,CAJA-C,BBB-1`,
  `OBC-0999,Cliente Viejo,${FECHA_AYER} 09:00:00,CAJA-D,CCC-1`,
].join('\n')

async function injectTenantAuth(page) {
  await page.addInitScript(() => {
    localStorage.setItem('wms-auth', JSON.stringify({
      state: {
        token: 'fake-tenant-e2e-token',
        isAuthenticated: true,
        enabledModules: ['surtido'],
        user: {
          id: 1,
          nombre_completo: 'E2E Operador',
          email: 'e2e@tenant.test',
          rol_nombre: 'Administrador',
          es_admin_tenant: true,
        },
      },
      version: 0,
    }))
    // Cada corrida arranca sin borrador previo. El guard es imprescindible:
    // addInitScript corre en CADA navegación, y sin él un page.reload() borraría
    // justo el borrador que la prueba quiere verificar que sobrevive.
    if (!sessionStorage.getItem('e2e-lote-limpio')) {
      sessionStorage.setItem('e2e-lote-limpio', '1')
      Object.keys(localStorage)
        .filter(k => k.startsWith('kirion_surtido_lote_') || k === 'kirion_surtido_tabs')
        .forEach(k => localStorage.removeItem(k))
    }
  })
}

/** @type {{ body: any } | null} */
let commitRecibido = null

async function mockBackend(page) {
  commitRecibido = null

  // Playwright evalúa las rutas en orden inverso al de registro, así que el
  // catch-all va PRIMERO para que las específicas de abajo lo tapen a él.
  await page.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
  )

  await page.route('**/api/wmshub/sheets-urls', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { sheet_outbound_url: 'https://sheet.test/outbound', sheet_inventory_url: null } }),
    })
  )

  await page.route('**/api/wmshub/proxy/sheet**', route =>
    route.fulfill({ status: 200, contentType: 'text/csv', body: SHEET_CSV })
  )

  await page.route('**/api/wmshub/pick-batch/commit', async (route) => {
    commitRecibido = { body: JSON.parse(route.request().postData() || '{}') }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { batch: { id: 'batch-e2e' }, sessions: [] } }),
    })
  })
}

async function abrirLote(page) {
  await page.goto('/surtido/validacion', { waitUntil: 'domcontentloaded' })
  // La pestaña por defecto también se llama "Nueva Sesión"; el botón de agregar
  // es el único que lleva ese texto en su title.
  await page.locator('button[title="Nueva Sesión"]').click()
  await page.getByText('Validación por Lote').click()
  await page.locator('input[type="date"]').fill(FECHA)
  await page.getByRole('button', { name: /Iniciar lote/i }).click()
  await expect(page.getByText('Órdenes completas')).toBeVisible({ timeout: 15000 })
}

async function escanear(page, codigo) {
  const input = page.getByPlaceholder('Escanea una caja del lote')
  await input.fill(codigo)
  await input.press('Enter')
}

test.describe('Surtido — validación por lote', () => {
  test.beforeEach(async ({ page }) => {
    await injectTenantAuth(page)
    await mockBackend(page)
  })

  test('carga el pool de la fecha elegida', async ({ page }) => {
    await abrirLote(page)
    // Dos órdenes de la fecha; la del día anterior no entra al pool activo.
    await expect(page.getByText('OBC-1001')).toBeVisible()
    await expect(page.getByText('OBC-1002')).toBeVisible()
    await expect(page.getByText('OBC-0999')).toHaveCount(0)
  })

  test('asigna una caja a su orden y detecta el duplicado', async ({ page }) => {
    await abrirLote(page)

    await escanear(page, 'AAA-1')
    await expect(page.getByText(/Caja asignada a OBC-1001/)).toBeVisible()

    await escanear(page, 'AAA-1')
    await expect(page.getByText(/ya fue validada en este lote/)).toBeVisible()
  })

  test('rechaza un codigo ajeno explicando el motivo', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'ZZZ-9')
    await expect(page.getByText(/no pertenece a ninguna orden del lote/)).toBeVisible()
  })

  test('ofrece forzar una caja del dia anterior', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'CCC-1')

    await expect(page.getByText('La caja no corresponde a la fecha del lote')).toBeVisible()
    await expect(page.getByText(new RegExp(`orden OBC-0999.*${FECHA_AYER}`))).toBeVisible()

    await page.getByRole('button', { name: 'Forzar entrada' }).click()
    await expect(page.getByText(/Caja asignada a OBC-0999/)).toBeVisible()
  })

  test('cerrar una tarima pide ubicacion y abre la siguiente', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'AAA-1')

    await page.getByRole('button', { name: 'Cerrar tarima' }).click()
    await page.getByLabel('Ubicación de la tarima').fill('A1-01-01-01')
    await page.getByRole('button', { name: 'Guardar' }).click()

    // T02 aparece en la tarjeta de resumen y en el panel de tarima.
    await expect(page.getByText('T02').first()).toBeVisible()
    await expect(page.getByText('A1-01-01-01').first()).toBeVisible()
  })

  test('confirmar manda el lote con tarima, ubicacion y orden asignada', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'AAA-1')
    await escanear(page, 'BBB-1')

    await page.getByRole('button', { name: 'Cerrar tarima' }).click()
    await page.getByLabel('Ubicación de la tarima').fill('A1-01-01-01')
    await page.getByRole('button', { name: 'Guardar' }).click()

    await page.getByRole('button', { name: 'Confirmar lote' }).click()
    await page.getByRole('button', { name: 'Confirmar lote' }).last().click()

    await expect(page.getByText('Lote confirmado')).toBeVisible({ timeout: 10000 })

    expect(commitRecibido).not.toBeNull()
    const body = commitRecibido.body
    expect(body.fecha_lote).toBe(FECHA)
    expect(body.tarimas).toHaveLength(1)
    expect(body.tarimas[0]).toMatchObject({ tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01' })

    const obcs = body.orders.map(o => o.outbound_order_no).sort()
    expect(obcs).toEqual(['OBC-1001', 'OBC-1002'])

    const evento = body.orders.find(o => o.outbound_order_no === 'OBC-1001').events[0]
    expect(evento).toMatchObject({
      scan_result: 'ok', tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01', forced_date_mismatch: false,
    })
  })

  test('el borrador sobrevive un refresh', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'AAA-1')
    await expect(page.getByText(/Caja asignada a OBC-1001/)).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Órdenes completas')).toBeVisible({ timeout: 15000 })
    // La caja escaneada sigue contada tras recargar.
    await expect(page.getByText('1/3')).toBeVisible()
  })

  test('sin confirmar no se manda nada al servidor', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'AAA-1')
    await page.waitForTimeout(500)
    expect(commitRecibido).toBeNull()
  })
})
