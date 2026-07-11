import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { query, tenantQuery } from '../../config/database.js'

const ALGORITHM = 'aes-256-cbc'

function getRawKey() {
  const raw = process.env.WMS_ENCRYPTION_KEY || ''
  if (!raw) throw new Error('WMS_ENCRYPTION_KEY env var is not set')
  return raw
}

// Current scheme: derive a full 32-byte AES-256 key via SHA-256 instead of
// zero-padding a short passphrase (which collapses key entropy).
function getKey() {
  return createHash('sha256').update(getRawKey(), 'utf8').digest()
}

// Legacy scheme kept ONLY for decrypting credentials saved before the SHA-256
// switch. saveCredentials re-encrypts with the new key on next update.
function getLegacyKey() {
  return Buffer.from(getRawKey().padEnd(32, '0').slice(0, 32), 'utf8')
}

export function encrypt(plaintext) {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(stored) {
  const [ivHex, encHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  for (const key of [getKey(), getLegacyKey()]) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch { /* try next key */ }
  }
  throw new Error('WMS credential decryption failed (key mismatch)')
}

export async function loadCredentials(tenantId) {
  // Explicit tenant_id filter — do NOT rely on RLS. The backend connects with a
  // BYPASSRLS role today, so SET LOCAL app.tenant_id is inert; omitting this
  // WHERE would return another tenant's credentials.
  const res = await tenantQuery(tenantId,
    'SELECT * FROM wms_credentials WHERE is_active = true AND tenant_id = $1 ORDER BY id DESC LIMIT 1',
    [tenantId]
  )
  if (res.rows.length === 0) return null
  const row = res.rows[0]
  return {
    id: row.id,
    app_key: row.app_key,
    app_secret: decrypt(row.app_secret_encrypted),
    base_url: row.base_url,
  }
}

export async function saveCredentials(tenantId, { app_key, app_secret, base_url }) {
  const encrypted = encrypt(app_secret)
  const baseUrl = base_url || 'https://api.xlwms.com/openapi/v1'
  // Explicit tenant_id filter — see loadCredentials. Without it, SELECT id could
  // pick another tenant's row and the UPDATE would overwrite their credentials.
  const existing = await tenantQuery(tenantId, 'SELECT id FROM wms_credentials WHERE tenant_id = $1 LIMIT 1', [tenantId])
  if (existing.rows.length > 0) {
    await tenantQuery(tenantId,
      `UPDATE wms_credentials
       SET app_key = $1, app_secret_encrypted = $2, base_url = $3, updated_at = now()
       WHERE id = $4 AND tenant_id = $5`,
      [app_key, encrypted, baseUrl, existing.rows[0].id, tenantId]
    )
  } else {
    await tenantQuery(tenantId,
      `INSERT INTO wms_credentials (app_key, app_secret_encrypted, base_url, tenant_id)
       VALUES ($1, $2, $3, $4)`,
      [app_key, encrypted, baseUrl, tenantId]
    )
  }
}
