import { query } from '../config/database.js'
import { sendEmail, renderTemplate } from './emailService.js'

const MAX_ATTEMPTS = 5
const BATCH_SIZE = 10

// Process pending notifications from the outbox.
// Called by Vercel Cron: GET /api/cron/notifications
export async function processNotifications() {
  const pending = await query(
    `SELECT * FROM notifications_outbox
     WHERE status = 'pending' AND attempts < $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [MAX_ATTEMPTS, BATCH_SIZE]
  )

  const results = { sent: 0, failed: 0 }

  for (const notif of pending.rows) {
    try {
      const { subject, html } = renderTemplate(notif.template_code, notif.payload)
      await sendEmail({ to: notif.recipient_email, subject, html })
      await query(
        `UPDATE notifications_outbox
         SET status = 'sent', sent_at = now(), attempts = attempts + 1
         WHERE id = $1`,
        [notif.id]
      )
      results.sent++
    } catch (err) {
      const newAttempts = notif.attempts + 1
      const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
      await query(
        `UPDATE notifications_outbox
         SET status = $1, attempts = $2, last_error = $3
         WHERE id = $4`,
        [newStatus, newAttempts, err.message, notif.id]
      )
      results.failed++
      console.error(`[notificationWorker] Failed to send ${notif.template_code} to ${notif.recipient_email}:`, err.message)
    }
  }

  return results
}
