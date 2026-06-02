import crypto from 'crypto'
import env from '../../../config/env.js'

const BUCKET = 'devoluciones-evidencia'
let bucketReady = false

export function getEvidencePublicUrl(storagePath) {
  if (!storagePath || !env.SUPABASE_URL) return null
  return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
}

function getHeaders(contentType) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    const err = new Error('Supabase Storage no configurado')
    err.code = 'SUPABASE_NOT_CONFIGURED'
    throw err
  }
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': contentType || 'application/octet-stream',
  }
}

function sanitizeFilename(filename = 'evidencia') {
  return String(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function getJsonHeaders() {
  return {
    ...getHeaders('application/json'),
    'Content-Type': 'application/json',
  }
}

function isBucketMissingError(status, text = '') {
  const normalized = String(text).toLowerCase()
  return normalized.includes('bucket not found') || normalized.includes('"message":"bucket not found"')
}

async function ensureBucket() {
  if (bucketReady) return

  const checkResponse = await fetch(
    `${env.SUPABASE_URL}/storage/v1/bucket/${BUCKET}`,
    {
      method: 'GET',
      headers: getJsonHeaders(),
    }
  )

  if (checkResponse.ok) {
    bucketReady = true
    return
  }

  const checkText = await checkResponse.text()
  if (!isBucketMissingError(checkResponse.status, checkText)) {
    const err = new Error(checkText || 'Error validando bucket de evidencia')
    err.status = checkResponse.status
    throw err
  }

  const createResponse = await fetch(
    `${env.SUPABASE_URL}/storage/v1/bucket`,
    {
      method: 'POST',
      headers: getJsonHeaders(),
      body: JSON.stringify({
        name: BUCKET,
        public: true,
        allowedMimeTypes: ['image/*'],
        fileSizeLimit: '2MB',
      }),
    }
  )

  if (!createResponse.ok) {
    const createText = await createResponse.text()
    const alreadyExists = createResponse.status === 400 && String(createText).toLowerCase().includes('already exists')
    if (!alreadyExists) {
      const err = new Error(createText || 'Error creando bucket de evidencia')
      err.status = createResponse.status
      throw err
    }
  }

  bucketReady = true
}

async function uploadToBucket({ storagePath, contentType, buffer }) {
  return fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: 'POST',
      headers: getHeaders(contentType),
      body: buffer,
    }
  )
}

export async function uploadEvidence({ tenantId, itemId, filename, contentType, buffer }) {
  await ensureBucket()

  const safeName = `${crypto.randomUUID()}-${sanitizeFilename(filename)}`
  const storagePath = `${tenantId}/${itemId}/${safeName}`
  let response = await uploadToBucket({ storagePath, contentType, buffer })

  if (!response.ok) {
    const text = await response.text()
    if (isBucketMissingError(response.status, text)) {
      bucketReady = false
      await ensureBucket()
      response = await uploadToBucket({ storagePath, contentType, buffer })
    } else {
      const err = new Error(text || 'Error subiendo evidencia')
      err.status = response.status
      throw err
    }
  }

  if (!response.ok) {
    const text = await response.text()
    const err = new Error(text || 'Error subiendo evidencia')
    err.status = response.status
    throw err
  }

  return {
    storagePath,
    publicUrl: getEvidencePublicUrl(storagePath),
  }
}

export async function deleteEvidence(storagePath) {
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: 'DELETE',
      headers: getHeaders(),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    const err = new Error(text || 'Error eliminando evidencia')
    err.status = response.status
    throw err
  }
}
