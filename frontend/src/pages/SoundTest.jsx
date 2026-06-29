import { useEffect, useState } from 'react'
import {
  CheckCircle2, Copy, Volume2, XCircle,
  AlertTriangle, PartyPopper, Scale, ScanSearch,
  Ban,
} from 'lucide-react'
import { initAudio, playSound } from '../modules/Shared/Wms/playSound'

const SOUNDS = [
  {
    key: 'success',
    title: 'Correcto',
    description: 'Escaneo válido confirmado.',
    icon: CheckCircle2,
    cls: 'border-success-200 bg-success-50 text-success-700 hover:bg-success-100',
  },
  {
    key: 'duplicate',
    title: 'Duplicado',
    description: 'Código ya registrado anteriormente.',
    icon: Copy,
    cls: 'border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100',
  },
  {
    key: 'error',
    title: 'Error',
    description: 'Código no reconocido o inválido.',
    icon: XCircle,
    cls: 'border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100',
  },
  {
    key: 'reject',
    title: 'Rechazo',
    description: 'Ítem rechazado por regla de negocio.',
    icon: Ban,
    cls: 'border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100',
  },
  {
    key: 'warning',
    title: 'Advertencia',
    description: 'Aviso moderado, verificar.',
    icon: AlertTriangle,
    cls: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
  },
  {
    key: 'complete',
    title: 'Completo',
    description: 'Tarima o sesión finalizada con éxito.',
    icon: PartyPopper,
    cls: 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100',
  },
  {
    key: 'peso',
    title: 'Peso',
    description: 'Confirmación de peso registrado.',
    icon: Scale,
    cls: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  },
  {
    key: 'suspicious',
    title: 'Sospechoso',
    description: 'Código fuera de patrón, revisar.',
    icon: ScanSearch,
    cls: 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100',
  },
]

export default function SoundTest() {
  const [lastPlayed, setLastPlayed] = useState(null)
  const [active, setActive] = useState(null)

  useEffect(() => { initAudio() }, [])

  function testSound(key) {
    initAudio()
    playSound(key)
    setLastPlayed(key)
    setActive(key)
    setTimeout(() => setActive(null), 320)
  }

  return (
    <div className="min-h-screen bg-warm-50 p-5 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">

        <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
              <Volume2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-warm-900">Prueba de sonidos</h1>
              <p className="text-sm text-warm-500">Toca cada tarjeta para escuchar el sonido del evento correspondiente.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {SOUNDS.map(({ key, title, description, icon: Icon, cls }) => (
            <button
              key={key}
              type="button"
              onClick={() => testSound(key)}
              className={`relative min-h-[140px] rounded-2xl border p-4 text-left transition-all active:scale-[0.97] ${cls} ${
                active === key ? 'scale-[0.97] brightness-95' : ''
              }`}
            >
              <Icon className="mb-3 h-6 w-6" />
              <p className="text-base font-black leading-tight">{title}</p>
              <p className="mt-1 text-[11px] font-semibold opacity-70 leading-snug">{description}</p>
              {lastPlayed === key && (
                <span className="mt-3 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest">
                  Reproducido
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-warm-400">
          {SOUNDS.length} sonidos · WebAudio API · sine wave
        </p>
      </div>
    </div>
  )
}
