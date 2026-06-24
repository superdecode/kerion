/**
 * Canonical module → route mapping, shared by App.jsx (SmartRedirect) and
 * usePermissionSync (access-guard redirect). Single source of truth so both
 * stay in sync when new modules are added.
 *
 * Paths use lowercase to match the <Route path="..."> definitions in App.jsx.
 */
export const MODULE_ROUTES = [
  { module: 'global.inicio',              path: '/' },
  { module: 'dropscan.dashboard',         path: '/dashboard?module=dropscan' },
  { module: 'dropscan.escaneo',           path: '/dropscan/escaneo' },
  { module: 'dropscan.tarimas',           path: '/dropscan/tarimas' },
  { module: 'dropscan.reportes',          path: '/dropscan/reportes' },
  { module: 'dropscan.configuracion',     path: '/dropscan/configuracion' },
  { module: 'fep.folios',                 path: '/dropscan/folios' },
  { module: 'devoluciones.entradas',      path: '/devoluciones/entradas' },
  { module: 'devoluciones.inventario',    path: '/devoluciones/inventario' },
  { module: 'devoluciones.salidas',       path: '/devoluciones/salidas' },
  { module: 'inventario.escaneo',         path: '/inventario/escaneo' },
  { module: 'inventario.registros',       path: '/inventario/registros' },
  { module: 'inventario.rastreo',         path: '/inventario/rastreo' },
  { module: 'surtido.ordenes',            path: '/surtido' },
  { module: 'surtido.validacion',         path: '/surtido/validacion' },
  { module: 'surtido.registros',          path: '/surtido/registros' },
  { module: 'anormalidades.registro',     path: '/anormalidades/registro' },
  { module: 'anormalidades.dashboard',    path: '/dashboard?module=anormalidades' },
  { module: 'anormalidades.mejoras',      path: '/anormalidades/mejoras' },
  { module: 'anormalidades.configuracion',path: '/anormalidades/configuracion' },
  { module: 'sistema.wms',               path: '/sistema/conexion' },
  { module: 'despacho.validar',           path: '/despacho/validar' },
  { module: 'despacho.ordenes',           path: '/despacho/ordenes' },
  { module: 'despacho.folios',            path: '/despacho/folios' },
  { module: 'recepcion.recibir',          path: '/recepcion/recibir' },
  { module: 'global.administracion',      path: '/admin' },
]
