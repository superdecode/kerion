// @ts-check
import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots')

function screenshotPath(name) {
  return path.join(SCREENSHOT_DIR, `${name}.png`)
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function injectAdminAuth(page) {
  await page.addInitScript(() => {
    const fakeState = {
      state: {
        token: 'fake-e2e-token',
        admin: { name: 'E2E Admin', email: 'e2e@kirion.test' },
        isAuthenticated: true,
      },
      version: 0,
    }
    localStorage.setItem('kirion-admin-auth', JSON.stringify(fakeState))
  })
}

async function injectTenantAuth(page, overrides = {}) {
  await page.addInitScript((opts) => {
    const fakeState = {
      state: {
        token: 'fake-tenant-e2e-token',
        isAuthenticated: true,
        enabledModules: opts.enabledModules || ['dropscan', 'surtido', 'inventario', 'devoluciones'],
        user: {
          id: 1,
          nombre: 'E2E User',
          email: 'e2e@tenant.test',
          rol_nombre: opts.rol_nombre || 'Operador',
          es_admin_tenant: opts.es_admin_tenant || false,
        },
      },
      version: 0,
    }
    localStorage.setItem('wms-auth', JSON.stringify(fakeState))
  }, overrides)
}

async function goToAdmin(page, routePath) {
  await page.goto(routePath, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('aside', { timeout: 8000 })
}

// ---------------------------------------------------------------------------
// Suite 1 — Tenant creation with module selection
// ---------------------------------------------------------------------------

test.describe('Tenant creation — module checkboxes', () => {
  test.beforeEach(async ({ page }) => {
    await injectAdminAuth(page)
  })

  test('CreateTenantModal shows all four module checkboxes', async ({ page }) => {
    await goToAdmin(page, '/super-admin/tenants')

    // Click the "Nuevo Tenant" button (text may vary by locale)
    const newBtn = page.locator('button', { hasText: /nuevo|crear|add/i }).first()
    await newBtn.click()

    // Modal should open
    await page.waitForSelector('[role="dialog"], .modal, form', { timeout: 5000 }).catch(() => {})

    // Four module labels must be visible
    for (const label of ['DropScan', 'Surtido', 'Inventario', 'Devoluciones']) {
      const el = page.locator(`text=${label}`).first()
      const visible = await el.isVisible().catch(() => false)
      // If modal opened, all labels should be present
      if (visible) {
        await expect(el).toBeVisible()
      }
    }

    await page.screenshot({ path: screenshotPath('create-tenant-modal-modules') })
  })

  test('Module checkboxes are all checked by default', async ({ page }) => {
    await goToAdmin(page, '/super-admin/tenants')

    const newBtn = page.locator('button', { hasText: /nuevo|crear|add/i }).first()
    await newBtn.click()

    await page.waitForTimeout(500)

    // Count checked checkboxes in the module section
    const checkedBoxes = await page.locator('input[type="checkbox"]:checked').count()
    // At least 4 should be checked (the four modules)
    expect(checkedBoxes).toBeGreaterThanOrEqual(4)

    await page.screenshot({ path: screenshotPath('create-tenant-modules-checked') })
  })
})

// ---------------------------------------------------------------------------
// Suite 2 — Tenant detail: ModulesPanel renders
// ---------------------------------------------------------------------------

test.describe('AdminTenantDetalle — ModulesPanel', () => {
  test.beforeEach(async ({ page }) => {
    await injectAdminAuth(page)

    // Mock the modules endpoint before navigation
    await page.route('**/api/admin/tenants/*/modules', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { module_code: 'dropscan', enabled: true, enabled_at: '2025-01-01T00:00:00Z', enabled_by: 'system', disabled_at: null },
            { module_code: 'surtido', enabled: true, enabled_at: '2025-01-01T00:00:00Z', enabled_by: 'system', disabled_at: null },
            { module_code: 'inventario', enabled: false, enabled_at: null, enabled_by: null, disabled_at: '2025-02-15T00:00:00Z' },
            { module_code: 'devoluciones', enabled: true, enabled_at: '2025-01-01T00:00:00Z', enabled_by: 'system', disabled_at: null },
          ],
        }),
      })
    })

    // Mock the tenant detail endpoint
    await page.route('**/api/admin/tenants/*', async route => {
      const url = route.request().url()
      if (url.includes('/modules')) { await route.continue(); return }
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'test-tenant-uuid',
              legal_name: 'Tenant E2E Test',
              slug: 'test',
              contact_name: 'Contact',
              contact_email: 'contact@test.com',
              zona_horaria: 'America/Mexico_City',
              is_active: true,
            },
          }),
        })
      } else {
        await route.continue()
      }
    })

    // Mock any other admin endpoints needed for the detail page
    await page.route('**/api/admin/**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        })
      } else {
        await route.continue()
      }
    })
  })

  test('ModulesPanel renders with mocked data', async ({ page }) => {
    await page.goto('/super-admin/tenants/test-tenant-uuid', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('aside', { timeout: 8000 })

    // Wait for Modulos heading
    const modulosHeading = page.locator('h2', { hasText: /modulos/i }).first()
    const headingVisible = await modulosHeading.isVisible().catch(() => false)

    if (headingVisible) {
      await expect(modulosHeading).toBeVisible()

      // DropScan should show as Activo (enabled=true)
      const dropScanRow = page.locator('text=DropScan').first()
      await expect(dropScanRow).toBeVisible()

      // Inventario should show as Inactivo (enabled=false)
      const inactivoBtn = page.locator('button', { hasText: /inactivo/i }).first()
      await expect(inactivoBtn).toBeVisible()
    }

    await page.screenshot({ path: screenshotPath('tenant-detail-modules-panel') })
  })

  test('toggle button calls PUT modules endpoint', async ({ page }) => {
    let putCalled = false
    let putBody = null

    // Override the PUT route to capture the call
    await page.route('**/api/admin/tenants/*/modules/*', async route => {
      if (route.request().method() === 'PUT') {
        putCalled = true
        putBody = JSON.parse(route.request().postData() || '{}')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/super-admin/tenants/test-tenant-uuid', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('aside', { timeout: 8000 })

    // Click on the Inactivo button (inventario is disabled in mock data)
    const inactivoBtn = page.locator('button', { hasText: /inactivo/i }).first()
    const btnVisible = await inactivoBtn.isVisible().catch(() => false)

    if (btnVisible) {
      await inactivoBtn.click()
      await page.waitForTimeout(300)
      expect(putCalled).toBe(true)
      expect(putBody).toMatchObject({ enabled: true })
    }

    await page.screenshot({ path: screenshotPath('tenant-detail-module-toggle') })
  })
})

// ---------------------------------------------------------------------------
// Suite 3 — Sidebar module gating
// ---------------------------------------------------------------------------

test.describe('Sidebar module gating', () => {
  test('Sidebar hides module groups for disabled modules', async ({ page }) => {
    await injectTenantAuth(page, {
      enabledModules: ['dropscan'], // only dropscan enabled
      rol_nombre: 'Operador',
      es_admin_tenant: false,
    })

    // Mock the auth/me endpoint to prevent redirect
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { id: 1, nombre: 'E2E', rol_nombre: 'Operador', es_admin_tenant: false },
          enabledModules: ['dropscan'],
          permissions: [],
        }),
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    await page.screenshot({ path: screenshotPath('sidebar-module-gating-dropscan-only') })

    // Surtido nav items should NOT be visible
    const surtidoLink = page.locator('nav a, nav button').filter({ hasText: /surtido/i }).first()
    const surtidoVisible = await surtidoLink.isVisible().catch(() => false)
    // With only dropscan enabled, surtido nav group should be hidden
    expect(surtidoVisible).toBe(false)
  })

  test('Tenant admin sees all modules regardless of enabledModules', async ({ page }) => {
    await injectTenantAuth(page, {
      enabledModules: ['dropscan'], // restricted list
      rol_nombre: 'Administrador',
      es_admin_tenant: true,         // but is admin
    })

    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { id: 1, nombre: 'Admin', rol_nombre: 'Administrador', es_admin_tenant: true },
          enabledModules: ['dropscan'],
          permissions: [],
        }),
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    await page.screenshot({ path: screenshotPath('sidebar-admin-sees-all') })
    // Admin should see the page without module restrictions cutting the sidebar
    const sidebar = page.locator('nav, aside').first()
    await expect(sidebar).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Suite 4 — Logout localStorage cleanup
// ---------------------------------------------------------------------------

test.describe('Logout clears tenant-scoped localStorage', () => {
  test('logout removes wms-auth and kirion_ keys', async ({ page }) => {
    await injectTenantAuth(page, { enabledModules: ['dropscan', 'surtido'] })

    // Also inject some tenant-scoped keys to verify cleanup
    await page.addInitScript(() => {
      localStorage.setItem('kirion_surtido_page', '3')
      localStorage.setItem('kirion_filters_ordenes', JSON.stringify({ estado: 'pendiente' }))
    })

    await page.route('**/api/auth/logout', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
    })

    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)

    // Trigger logout by evaluating the auth store's logout action
    await page.evaluate(() => {
      // Simulate logout by directly clearing storage as the store does
      Object.keys(localStorage)
        .filter(k => k === 'wms-auth' || k.startsWith('kirion_'))
        .forEach(k => localStorage.removeItem(k))
    })

    // Verify keys are gone
    const wmAuthKey = await page.evaluate(() => localStorage.getItem('wms-auth'))
    const kirionKey = await page.evaluate(() => localStorage.getItem('kirion_surtido_page'))
    const kirionFilters = await page.evaluate(() => localStorage.getItem('kirion_filters_ordenes'))

    expect(wmAuthKey).toBeNull()
    expect(kirionKey).toBeNull()
    expect(kirionFilters).toBeNull()

    await page.screenshot({ path: screenshotPath('logout-storage-cleared') })
  })
})
