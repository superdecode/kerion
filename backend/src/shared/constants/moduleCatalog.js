export const ALL_MODULE_CODES = [
  'dropscan',
  'surtido',
  'inventario',
  'devoluciones',
  'anormalidades',
  'despacho',
  'recepcion',
]

export const FULL_ACCESS_PERMISSIONS = {
  global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
  dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', tarimas: 'eliminar', reportes: 'eliminar', configuracion: 'eliminar' },
  fep: { folios: 'eliminar' },
  inventario: { dashboard: 'eliminar', escaneo: 'eliminar', registros: 'eliminar', rastreo: 'eliminar' },
  devoluciones: { dashboard: 'eliminar', entradas: 'eliminar', inventario: 'eliminar', salidas: 'eliminar' },
  surtido: { dashboard: 'eliminar', ordenes: 'eliminar', validacion: 'eliminar', registros: 'eliminar' },
  anormalidades: { dashboard: 'eliminar', registro: 'eliminar', mejoras: 'eliminar', configuracion: 'eliminar' },
  despacho: { dashboard: 'eliminar', validar: 'eliminar', ordenes: 'eliminar', folios: 'eliminar' },
  recepcion: { dashboard: 'eliminar', recibir: 'eliminar', validacion: 'eliminar' },
  sistema: { wms: 'eliminar' },
}
