import { query } from '../config/database.js'
import env from '../config/env.js'

// Called by Vercel Cron: GET /api/cron/lifecycle
// Also safe to call manually for testing.
export async function runLifecycleTasks() {
  const log = []

  // ── 1. Enqueue trial_5d_warning ──────────────────────────────────────────────
  // Tenants whose trial expires within 2 days and haven't received the warning.
  const warningRes = await query(`
    SELECT t.id, t.contact_name, t.contact_email, t.slug, t.trial_expires_at, t.zona_horaria
    FROM tenants t
    WHERE t.status = 'trial'
      AND t.trial_expires_at IS NOT NULL
      AND t.trial_expires_at <= now() + INTERVAL '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM notifications_outbox n
        WHERE n.tenant_id = t.id
          AND n.template_code = 'trial_5d_warning'
          AND n.status != 'failed'
      )
  `)

  for (const row of warningRes.rows) {
    try {
      await query(
        `INSERT INTO notifications_outbox (tenant_id, recipient_email, template_code, payload)
         VALUES ($1,$2,'trial_5d_warning',$3)`,
        [row.id, row.contact_email, JSON.stringify({
          contact_name: row.contact_name,
          expires_at: new Date(row.trial_expires_at).toLocaleDateString('es-MX', {
            timeZone: row.zona_horaria || 'America/Mexico_City',
          }),
        })]
      )
      log.push({ action: 'trial_5d_warning_enqueued', tenant: row.slug })
    } catch (err) {
      log.push({ action: 'trial_5d_warning_error', tenant: row.slug, error: err.message })
    }
  }

  // ── 2. Expire trials ──────────────────────────────────────────────────────────
  const expiredTrials = await query(`
    SELECT t.id, t.slug, t.contact_name, t.contact_email, t.legal_name
    FROM tenants t
    WHERE t.status = 'trial' AND t.trial_expires_at <= now()
  `)

  for (const row of expiredTrials.rows) {
    try {
      await query(
        `UPDATE tenants SET status = 'trial_expired', updated_at = now() WHERE id = $1`,
        [row.id]
      )
      await query(
        `UPDATE subscriptions SET status = 'expired' WHERE tenant_id = $1 AND status = 'active'`,
        [row.id]
      )
      // Notify tenant
      await query(
        `INSERT INTO notifications_outbox (tenant_id, recipient_email, template_code, payload)
         VALUES ($1,$2,'trial_expired',$3)`,
        [row.id, row.contact_email, JSON.stringify({ contact_name: row.contact_name })]
      )
      // Alert super admin
      if (env.SUPER_ADMIN_EMAIL) {
        await query(
          `INSERT INTO notifications_outbox (recipient_email, template_code, payload)
           VALUES ($1,'tenant_trial_expired_no_conversion',$2)`,
          [env.SUPER_ADMIN_EMAIL, JSON.stringify({
            organization_name: row.legal_name,
            slug: row.slug,
            contact_email: row.contact_email,
          })]
        )
      }
      log.push({ action: 'trial_expired', tenant: row.slug })
    } catch (err) {
      log.push({ action: 'trial_expire_error', tenant: row.slug, error: err.message })
    }
  }

  // ── 3. Expire active subscriptions ────────────────────────────────────────────
  const expiredSubs = await query(`
    SELECT t.id, t.slug FROM tenants t
    WHERE t.status = 'active' AND t.subscription_expires_at IS NOT NULL AND t.subscription_expires_at <= now()
  `)

  for (const row of expiredSubs.rows) {
    try {
      await query(
        `UPDATE tenants SET status = 'expired', updated_at = now() WHERE id = $1`,
        [row.id]
      )
      await query(
        `UPDATE subscriptions SET status = 'expired' WHERE tenant_id = $1 AND status = 'active'`,
        [row.id]
      )
      log.push({ action: 'subscription_expired', tenant: row.slug })
    } catch (err) {
      log.push({ action: 'subscription_expire_error', tenant: row.slug, error: err.message })
    }
  }

  // ── 4. Retention: prune append-only tables that otherwise grow forever ────────
  // These tables have no per-row cleanup and accumulate indefinitely (wide rows for
  // error/audit events). Retention windows are conservative and preserve recent
  // diagnostic/compliance history. Each runs independently so one failure (e.g. a
  // table absent on an older DB) doesn't block the others.
  const retentionTasks = [
    { table: 'system_error_events', column: 'last_seen_at', days: 90 },
    { table: 'landing_events',      column: 'created_at', days: 180 },
    { table: 'audit_log',           column: 'created_at', days: 365 },
    { table: 'notifications_outbox', column: 'created_at', days: 90, extra: "AND status = 'sent'" },
  ]
  for (const { table, column, days, extra } of retentionTasks) {
    try {
      const res = await query(
        `DELETE FROM ${table}
         WHERE ${column} < now() - INTERVAL '${days} days' ${extra || ''}`
      )
      if (res.rowCount > 0) log.push({ action: 'retention_pruned', table, deleted: res.rowCount })
    } catch (err) {
      log.push({ action: 'retention_error', table, error: err.message })
    }
  }

  return { ran_at: new Date().toISOString(), results: log }
}
