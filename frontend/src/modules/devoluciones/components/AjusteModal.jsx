import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, ArrowLeftRight, ClipboardList, Search, X, Check, LayoutGrid, AlertCircle } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'

const TABS = [
  { id: 'ajuste',     label: 'Ajuste de cantidad', icon: ClipboardList },
  { id: 'movimiento', label: 'Mover mercancía',    icon: ArrowLeftRight },
]

function LocationCombo({ ubicaciones, value, onChange, placeholder = 'Seleccionar ubicación...' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const selected = ubicaciones.find(u => String(u.id) === String(value))

  useEffect(() => {
    if (selected) setQ(selected.codigo)
    else setQ('')
  }, [value])

  const filtered = useMemo(() => {
    const qn = q.toLowerCase()
    return ubicaciones.filter(u => u.activo !== false &&
      (u.codigo?.toLowerCase().includes(qn) || u.nombre?.toLowerCase().includes(qn)))
  }, [ubicaciones, q])

  const select = (u) => {
    onChange(String(u.id))
    setQ(u.codigo)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={e => { setQ(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-warm-200 shadow-xl max-h-44 overflow-y-auto">
          {filtered.map(u => (
            <button key={u.id} type="button" onMouseDown={() => select(u)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 border-b border-warm-50 last:border-0 flex items-center gap-2">
              <span className="font-mono text-xs text-warm-500 shrink-0">{u.codigo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AjusteModal({ isOpen, onClose, initialTipo = 'ajuste', inventario = [], ubicaciones = [], onSubmit, saving = false, submitResult = null }) {
  const [tipo, setTipo] = useState(initialTipo)
  const [descripcion, setDescripcion] = useState('')
  const [ajustes, setAjustes] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [destinoId, setDestinoId] = useState('')
  const [searchAjuste, setSearchAjuste] = useState('')
  const [searchMov, setSearchMov] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    setTipo(initialTipo)
    setDescripcion('')
    setAjustes([])
    setSelectedIds([])
    setCantidades({})
    setDestinoId('')
    setSearchAjuste('')
    setSearchMov('')
    setErrors({})
  }, [isOpen, initialTipo])

  const invParaAjuste = useMemo(() => {
    const q = searchAjuste.toLowerCase().trim()
    if (!q) return inventario
    return inventario.filter(inv =>
      inv.sku?.toLowerCase().includes(q) ||
      inv.codigo_trazabilidad?.toLowerCase().includes(q) ||
      inv.descripcion?.toLowerCase().includes(q)
    )
  }, [inventario, searchAjuste])

  const invParaMov = useMemo(() => {
    const q = searchMov.toLowerCase().trim()
    if (!q) return inventario
    return inventario.filter(inv =>
      inv.sku?.toLowerCase().includes(q) ||
      inv.codigo_trazabilidad?.toLowerCase().includes(q) ||
      inv.ubicacion_nombre?.toLowerCase().includes(q) ||
      inv.ubicacion_codigo?.toLowerCase().includes(q)
    )
  }, [inventario, searchMov])

  const alreadyInAjuste = new Set(ajustes.map(r => r.inventario_id))

  const addAjusteItem = (inv) => {
    if (alreadyInAjuste.has(String(inv.id))) return
    setAjustes(prev => [...prev, {
      inventario_id: String(inv.id),
      _sku: inv.sku,
      _codigo: inv.codigo_trazabilidad,
      _descripcion: inv.descripcion || '',
      _ubicacion: inv.ubicacion_codigo || inv.ubicacion_nombre || '—',
      _disponible: inv.cantidad_disponible,
      cantidad_nueva: inv.cantidad_disponible,
      motivo: '',
      observacion: '',
    }])
    setSearchAjuste('')
  }

  const updateRow = (i, key, val) => setAjustes(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  const removeRow = (i) => setAjustes(prev => prev.filter((_, idx) => idx !== i))

  const toggleId = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      const inv = inventario.find(i => i.id === id)
      setCantidades(c => ({ ...c, [id]: inv?.cantidad_disponible ?? 0 }))
      return [...prev, id]
    })
  }
  const toggleAll = () => {
    if (selectedIds.length === invParaMov.length) {
      setSelectedIds([])
    } else {
      const newIds = invParaMov.map(i => i.id)
      setCantidades(c => {
        const next = { ...c }
        for (const inv of invParaMov) next[inv.id] = inv.cantidad_disponible
        return next
      })
      setSelectedIds(newIds)
    }
  }

  const validate = () => {
    const errs = {}
    if (tipo === 'ajuste') {
      const valid = ajustes.filter(r => r.inventario_id && r.cantidad_nueva !== '')
      if (!valid.length) errs.ajustes = 'Agrega al menos un item'
    } else {
      if (!selectedIds.length) errs.ids = 'Selecciona al menos un item'
      if (!destinoId) errs.destino = 'Selecciona una ubicación destino'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    if (tipo === 'ajuste') {
      const valid = ajustes.filter(r => r.inventario_id && r.cantidad_nueva !== '')
      onSubmit({
        tipo: 'ajuste',
        descripcion,
        inventario: valid.map(r => ({
          inventario_id: r.inventario_id,
          cantidad_nueva: parseInt(r.cantidad_nueva, 10),
          motivo: r.motivo || descripcion || 'Ajuste manual',
          observacion: r.observacion || descripcion || 'Ajuste manual',
        })),
      })
    } else {
      onSubmit({
        tipo: 'movimiento',
        descripcion,
        inventario: selectedIds.map(id => ({
          inventario_id: id,
          cantidad: cantidades[id] ?? inventario.find(i => i.id === id)?.cantidad_disponible,
          observacion: descripcion || 'Traslado manual',
        })),
        ubicacion_destino_id: destinoId,
      })
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white'
  const labelCls = 'block text-[11px] text-warm-500 mb-1 font-medium'

  const canSubmit = tipo === 'ajuste'
    ? ajustes.some(r => r.inventario_id && r.cantidad_nueva !== '')
    : selectedIds.length > 0 && !!destinoId

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tipo === 'ajuste' ? 'Ajuste de inventario' : 'Mover mercancía'}
      icon={tipo === 'ajuste' ? ClipboardList : ArrowLeftRight}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !canSubmit}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">

        {submitResult?.summary?.fallidos > 0 && (
          <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-xs text-warning-800 space-y-1">
            <div className="font-semibold">
              Resultado parcial: {submitResult.summary.creados || 0} creados, {submitResult.summary.actualizados || 0} actualizados, {submitResult.summary.fallidos || 0} fallidos.
            </div>
            {Array.isArray(submitResult.errors) && submitResult.errors.length > 0 && (
              <div className="space-y-1">
                {submitResult.errors.slice(0, 4).map((err, index) => (
                  <div key={`${err.row || 'row'}-${index}`} className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{err.row ? `Fila ${err.row}: ` : ''}{err.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tipo tabs */}
        <div className="flex gap-1 border-b border-warm-100 -mx-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
                tipo === t.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-warm-400 hover:text-warm-600'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Descripción */}
        <div>
          <label className={labelCls}>Descripción / motivo general</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className={inputCls} placeholder="Ej. Conteo físico mensual" />
        </div>

        {/* ── AJUSTE ── */}
        {tipo === 'ajuste' && (
          <div className="space-y-3">

            {/* Search to add */}
            <div className="relative">
              <label className={labelCls}>Buscar y agregar items al ajuste</label>
              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-2">
                <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                <input type="text" value={searchAjuste} onChange={e => setSearchAjuste(e.target.value)}
                  placeholder="SKU, código o descripción..."
                  className="text-sm outline-none bg-transparent text-warm-700 flex-1" />
                {searchAjuste && <button onClick={() => setSearchAjuste('')} className="text-warm-400 hover:text-warm-600"><X className="w-3.5 h-3.5" /></button>}
              </div>

              {searchAjuste.trim() && (
                <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-warm-200 shadow-xl max-h-48 overflow-y-auto">
                  {invParaAjuste.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-warm-400">Sin resultados</div>
                  ) : invParaAjuste.slice(0, 12).map(inv => {
                    const ya = alreadyInAjuste.has(String(inv.id))
                    return (
                      <button key={inv.id} onMouseDown={() => !ya && addAjusteItem(inv)} disabled={ya}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${ya ? 'bg-warm-50 cursor-not-allowed opacity-60' : 'hover:bg-primary-50/60 cursor-pointer'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-warm-800 truncate">{inv.sku}</p>
                          <p className="text-xs text-warm-400 font-mono">{inv.codigo_trazabilidad}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-warm-700">{inv.cantidad_disponible} disp.</p>
                          {(inv.ubicacion_codigo || inv.ubicacion_nombre) && <p className="text-[10px] text-warm-400">{inv.ubicacion_codigo || inv.ubicacion_nombre}</p>}
                        </div>
                        {ya && <Check className="w-4 h-4 text-success-500 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {errors.ajustes && (
              <div className="flex items-center gap-1.5 text-danger-600 text-xs">
                <AlertCircle className="w-3.5 h-3.5" /> {errors.ajustes}
              </div>
            )}

            {/* Items table */}
            {ajustes.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-warm-300 border border-dashed border-warm-200 rounded-xl gap-2">
                <ClipboardList className="w-8 h-8" />
                <p className="text-sm">Busca y agrega items para ajustar</p>
              </div>
            ) : (
              <div className="border border-warm-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-warm-50 border-b border-warm-100 text-warm-500 text-left">
                      <th className="px-3 py-2.5 w-6">#</th>
                      <th className="px-3 py-2.5">SKU</th>
                      <th className="px-3 py-2.5">Código</th>
                      <th className="px-3 py-2.5">Ubicación</th>
                      <th className="px-3 py-2.5 text-right w-20">Actual</th>
                      <th className="px-3 py-2.5 w-28">Cantidad real</th>
                      <th className="px-3 py-2.5">Observación</th>
                      <th className="px-3 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {ajustes.map((row, i) => {
                      const diff = row.cantidad_nueva !== '' ? parseInt(row.cantidad_nueva, 10) - (row._disponible ?? 0) : null
                      return (
                        <tr key={i} className="border-b border-warm-50 last:border-0 hover:bg-warm-50/40">
                          <td className="px-3 py-2.5 text-warm-300 font-mono">{i + 1}</td>
                          <td className="px-3 py-2.5 font-semibold text-warm-800">{row._sku}</td>
                          <td className="px-3 py-2.5 font-mono text-warm-500">{row._codigo}</td>
                          <td className="px-3 py-2.5 text-warm-500">{row._ubicacion}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-warm-700">{row._disponible}</td>
                          <td className="px-3 py-2.5">
                            <div className="relative">
                              <input type="number" min="0"
                                value={row.cantidad_nueva}
                                onChange={e => updateRow(i, 'cantidad_nueva', e.target.value)}
                                onFocus={e => e.target.select()}
                                className="w-full px-2 py-1.5 rounded-lg border border-warm-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-200 pr-7"
                              />
                              {diff !== null && (
                                <span className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold ${diff > 0 ? 'text-success-600' : diff < 0 ? 'text-danger-500' : 'text-warm-400'}`}>
                                  {diff > 0 ? `+${diff}` : diff}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <input value={row.observacion} onChange={e => updateRow(i, 'observacion', e.target.value)}
                              placeholder={descripcion || 'Nota...'}
                              className="w-full px-2 py-1.5 rounded-lg border border-warm-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-200"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => removeRow(i)} className="p-1 rounded-lg text-warm-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── MOVIMIENTO ── */}
        {tipo === 'movimiento' && (
          <div className="space-y-3">

            {/* Destino */}
            <div>
              <label className={labelCls}>Ubicación destino *</label>
              <LocationCombo
                ubicaciones={ubicaciones}
                value={destinoId}
                onChange={setDestinoId}
                placeholder="Escribir o buscar ubicación destino..."
              />
              {errors.destino && (
                <p className="text-[11px] text-danger-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.destino}
                </p>
              )}
            </div>

            {/* Search */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Items a mover</label>
                {invParaMov.length > 0 && (
                  <button onClick={toggleAll} className="text-xs text-primary-600 font-semibold hover:text-primary-700">
                    {selectedIds.length === invParaMov.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 py-2 mb-2">
                <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                <input type="text" value={searchMov} onChange={e => setSearchMov(e.target.value)}
                  placeholder="Filtrar por SKU, código o ubicación..."
                  className="text-sm outline-none bg-transparent text-warm-700 flex-1" />
                {searchMov && <button onClick={() => setSearchMov('')} className="text-warm-400 hover:text-warm-600"><X className="w-3.5 h-3.5" /></button>}
              </div>

              {errors.ids && (
                <div className="flex items-center gap-1.5 text-danger-600 text-xs mb-2">
                  <AlertCircle className="w-3.5 h-3.5" /> {errors.ids}
                </div>
              )}

              <div className="border border-warm-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {inventario.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-warm-400">Sin inventario disponible</div>
                ) : invParaMov.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-warm-400">Sin resultados</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-warm-400 border-b border-warm-100 bg-warm-50">
                        <th className="px-3 py-2 w-8" />
                        <th className="px-3 py-2 w-6">#</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2 flex items-center gap-0.5"><LayoutGrid className="w-3 h-3" />Ubicación</th>
                        <th className="px-3 py-2 text-right">Disp.</th>
                        <th className="px-3 py-2 text-right w-24">Traslado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invParaMov.map((inv, i) => {
                        const sel = selectedIds.includes(inv.id)
                        return (
                          <tr key={inv.id} onClick={() => toggleId(inv.id)}
                            className={`border-b border-warm-50 last:border-0 cursor-pointer transition-colors ${sel ? 'bg-primary-50' : 'hover:bg-warm-50'}`}
                          >
                            <td className="px-3 py-2.5">
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${sel ? 'bg-primary-500 border-primary-500' : 'border-warm-300'}`}>
                                {sel && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-warm-300 font-mono">{i + 1}</td>
                            <td className="px-3 py-2.5 font-semibold text-warm-800">{inv.sku}</td>
                            <td className="px-3 py-2.5 font-mono text-warm-500">{inv.codigo_trazabilidad}</td>
                            <td className="px-3 py-2.5 text-warm-500">{inv.ubicacion_codigo || inv.ubicacion_nombre || '—'}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-warm-700">{inv.cantidad_disponible}</td>
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              {sel && (
                                <input
                                  type="number" min="1" max={inv.cantidad_disponible}
                                  value={cantidades[inv.id] ?? inv.cantidad_disponible}
                                  onChange={e => {
                                    const v = Math.min(inv.cantidad_disponible, Math.max(1, Number(e.target.value)))
                                    setCantidades(c => ({ ...c, [inv.id]: v }))
                                  }}
                                  onFocus={e => e.target.select()}
                                  className="w-20 px-2 py-1 rounded-lg border border-warm-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary-200"
                                />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {selectedIds.length > 0 && (
                <p className="text-xs text-primary-600 font-semibold mt-1.5">
                  {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} seleccionado{selectedIds.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
