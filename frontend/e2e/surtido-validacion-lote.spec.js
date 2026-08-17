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
/** @type {any[]} */
let ordenesValidadas = []
/** @type {any[]} */
let rechazosRecibidos = []

async function mockBackend(page) {
  commitRecibido = null
  ordenesValidadas = []
  rechazosRecibidos = []

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

  await page.route('**/api/wmshub/pick-batch/estado-ordenes', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: ordenesValidadas }),
    })
  )

  await page.route('**/api/wmshub/pick-batch/rejection', async (route) => {
    rechazosRecibidos.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })

  await page.route('**/api/wmshub/pick-batch/commit', async (route) => {
    commitRecibido = { body: JSON.parse(route.request().postData() || '{}') }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { batch: { id: 'batch-e2e' }, sessions: [] } }),
    })
  })
}

// La ubicación se pide ANTES de poder escanear — no hay input de escaneo hasta
// confirmarla, igual que en el modo por orden.
async function capturarUbicacion(page, texto) {
  await page.getByLabel('Ubicación de la tarima').fill(texto)
  await page.getByRole('button', { name: 'Guardar' }).click()
}

async function abrirLote(page, { ubicacion = 'A1-01-01-01' } = {}) {
  await page.goto('/surtido/validacion', { waitUntil: 'domcontentloaded' })
  // Sin sesiones abiertas la pantalla es el estado vacío con el botón central.
  await page.getByRole('button', { name: 'Iniciar validación' }).click()
  // "Validación por Lote" aparece también en la tarjeta de modos del estado
  // vacío; el del modal es el que es un botón.
  await page.getByRole('button', { name: /^Validación por Lote/ }).click()
  await page.locator('input[type="date"]').fill(FECHA)
  await page.getByRole('button', { name: /Iniciar lote/i }).click()
  await expect(page.getByText('Órdenes completas')).toBeVisible({ timeout: 15000 })
  if (ubicacion) await capturarUbicacion(page, ubicacion)
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

  test('arranca sin pestanas y con boton central', async ({ page }) => {
    await page.goto('/surtido/validacion', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('button', { name: 'Iniciar validación' })).toBeVisible()
    await expect(page.getByText('Modos de validación')).toBeVisible()
    // Ninguna pestaña: ni la barra de sesiones ni el botón de agregar.
    await expect(page.locator('button[title="Nueva Sesión"]')).toHaveCount(0)
  })

  test('cerrar la ultima sesion devuelve a la pantalla de inicio', async ({ page }) => {
    await abrirLote(page)
    await expect(page.locator('button[title="Nueva Sesión"]')).toHaveCount(1)

    // La X de cerrar vive dentro de la pestaña y solo se ve al pasar el cursor.
    const pestana = page.locator('button', { hasText: 'Lote 2026-08-17' }).first()
    await pestana.hover()
    await pestana.getByRole('button', { name: 'Cerrar' }).click()

    await expect(page.getByRole('button', { name: 'Iniciar validación' })).toBeVisible({ timeout: 10000 })
  })

  test('el modal muestra el resumen de ordenes y cajas al elegir la fecha', async ({ page }) => {
    await page.goto('/surtido/validacion', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Iniciar validación' }).click()
    await page.getByRole('button', { name: /^Validación por Lote/ }).click()
    await page.locator('input[type="date"]').fill(FECHA)

    // Dos órdenes, 3 cajas (AAA-1, AAA-2, BBB-1) — antes de darle Iniciar lote.
    const pillOrdenes = page.locator('div', { hasText: 'órdenes' }).last()
    await expect(pillOrdenes).toContainText('2', { timeout: 10000 })
    const pillCajas = page.locator('div', { hasText: 'cajas' }).last()
    await expect(pillCajas).toContainText('3')
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

  test('la ubicacion se pide antes de poder escanear', async ({ page }) => {
    await abrirLote(page, { ubicacion: null })
    // Sin ubicación no hay input de escaneo — solo la puerta que la pide.
    await expect(page.getByPlaceholder('Escanea una caja del lote')).toHaveCount(0)
    await expect(page.getByLabel('Ubicación de la tarima')).toBeVisible()

    await capturarUbicacion(page, 'A1-01-01-01')
    await expect(page.getByPlaceholder('Escanea una caja del lote')).toBeVisible()
  })

  test('siguiente tarima cierra la actual y vuelve a pedir ubicacion', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'AAA-1')

    await page.getByRole('button', { name: 'Siguiente tarima' }).click()
    // T02 todavía no tiene ubicación: vuelve a aparecer la puerta.
    await expect(page.getByLabel('Ubicación de la tarima')).toBeVisible()
    await capturarUbicacion(page, 'B2-02-02-02')

    // T02 aparece en la tarjeta de resumen y T01 queda en las cerradas.
    await expect(page.getByText('T02').first()).toBeVisible()
    await expect(page.getByText('A1-01-01-01').first()).toBeVisible()
    await expect(page.getByText('B2-02-02-02').first()).toBeVisible()
  })

  test('confirmar manda el lote con tarima, ubicacion y orden asignada, sin cerrar la tarima', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'AAA-1')
    await escanear(page, 'BBB-1')

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

  test('rechaza las cajas de una orden ya validada', async ({ page }) => {
    ordenesValidadas = [{
      outbound_order_no: 'OBC-1001', status: 'complete',
      total_expected: 2, total_scanned: 2, operator_nombre: 'Otro', locked: true,
    }]
    await abrirLote(page)

    await expect(page.getByText('Ya validada')).toBeVisible()

    await escanear(page, 'AAA-1')
    await expect(page.getByText(/ya fue validada y no admite más cajas/)).toBeVisible()

    // La orden que sí está abierta sigue funcionando.
    await escanear(page, 'BBB-1')
    await expect(page.getByText(/Caja asignada a OBC-1002/)).toBeVisible()
  })

  test('la barra de resultado permite deshacer el ultimo escaneo', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'AAA-1')
    await expect(page.getByText(/Caja asignada a OBC-1001/)).toBeVisible()

    await page.getByRole('button', { name: 'Deshacer' }).click()
    // El escaneo desapareció: se puede volver a escanear el mismo código como ok.
    await escanear(page, 'AAA-1')
    await expect(page.getByText(/Caja asignada a OBC-1001/)).toBeVisible()
  })

  test('los rechazos se registran para trazabilidad y aparecen en su propia seccion', async ({ page }) => {
    await abrirLote(page)
    await escanear(page, 'ZZZ-9')
    await expect(page.getByText(/no pertenece a ninguna orden del lote/)).toBeVisible()

    await expect.poll(() => rechazosRecibidos.length).toBeGreaterThan(0)
    expect(rechazosRecibidos[0]).toMatchObject({ fecha_lote: FECHA, reason: 'not_found' })

    await page.getByRole('button', { name: /Rechazos/ }).click()
    await expect(page.getByText('No encontrado')).toBeVisible()
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
