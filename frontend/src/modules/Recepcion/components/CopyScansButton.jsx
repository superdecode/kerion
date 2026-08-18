import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

function buildScansTsv(rows, formatDate, headerCodigo, headerFecha) {
  const lines = [`${headerCodigo}\t${headerFecha}`]
  for (const row of rows) {
    lines.push(`${row.code || ''}\t${formatDate(row.scannedAt)}`)
  }
  return lines.join('\n')
}

export default function CopyScansButton({ rows, formatDate, tooltip, copiedLabel, idleClassName = 'text-warm-400 hover:text-primary-600 hover:bg-primary-50', headerCodigo = 'Código', headerFecha = 'Fecha/Hora' }) {
  const [copied, setCopied] = useState(false)

  if (!rows || rows.length === 0) return null

  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(buildScansTsv(rows, formatDate, headerCodigo, headerFecha))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? (copiedLabel || tooltip) : tooltip}
      aria-label={copied ? (copiedLabel || tooltip) : tooltip}
      className={`p-1 rounded-md transition-colors shrink-0 ${copied ? 'text-success-500' : idleClassName}`}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  )
}
