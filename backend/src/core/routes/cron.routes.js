import { Router } from 'express'
import { timingSafeEqual } from 'crypto'
import env from '../../config/env.js'
import { processNotifications } from '../../services/notificationWorker.js'
import { runLifecycleTasks } from '../../services/lifecycleScheduler.js'

const router = Router()

// Constant-time comparison to avoid leaking the secret via timing side-channels.
// Fails closed when CRON_SECRET is unset or lengths differ.
function secretMatches(provided, expected) {
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function validateCronSecret(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const secret = authHeader.replace('Bearer ', '')
  if (!secretMatches(secret, env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

router.get('/notifications', validateCronSecret, async (_req, res) => {
  try {
    const result = await processNotifications()
    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/notifications]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/lifecycle', validateCronSecret, async (_req, res) => {
  try {
    const result = await runLifecycleTasks()
    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/lifecycle]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
