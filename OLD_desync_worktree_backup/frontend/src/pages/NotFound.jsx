import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="relative inline-block mb-8">
          <span
            className="text-[10rem] font-black text-blue-600/20 select-none leading-none"
            style={{ letterSpacing: '-0.05em' }}
          >
            404
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center text-[10rem] font-black text-blue-500 select-none leading-none animate-pulse"
            style={{ letterSpacing: '-0.05em', animationDuration: '3s' }}
          >
            404
          </span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Pagina no encontrada</h1>
        <p className="text-gray-400 text-sm mb-8 max-w-sm mx-auto">
          La ruta que buscas no existe o fue movida.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
          >
            Volver atras
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
