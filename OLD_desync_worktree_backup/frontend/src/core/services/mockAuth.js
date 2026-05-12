// Mock data para desarrollo
const mockUsers = [
  {
    id: 1,
    codigo: 'ADM001',
    nombre_completo: 'Administrador',
    email: 'admin@wms.com',
    rol_nombre: 'Administrador',
    permisos: {
      global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
      dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', historial: 'eliminar', reportes: 'eliminar', configuracion: 'eliminar', folios: 'eliminar' },
      inventory: { escaneo: 'eliminar', historial: 'eliminar', reportes: 'eliminar' },
      despacho: { ordenes: 'eliminar', validacion: 'eliminar' },
      rastreo: { consulta: 'eliminar' },
      integraciones: { config: 'eliminar' },
      reportes: { global: 'eliminar' }
    }
  },
  {
    id: 2,
    codigo: 'OPR001',
    nombre_completo: 'Operador Demo',
    email: 'operador@wms.com',
    rol_nombre: 'Operador',
    permisos: {
      global: { inicio: 'ver', administracion: 'sin_acceso', wms: 'sin_acceso' },
      dropscan: { dashboard: 'ver', escaneo: 'crear', historial: 'ver', reportes: 'sin_acceso', configuracion: 'sin_acceso', folios: 'ver' },
      inventory: { escaneo: 'crear', historial: 'ver', reportes: 'sin_acceso' },
      despacho: { ordenes: 'ver', validacion: 'sin_acceso' },
      rastreo: { consulta: 'ver' },
      integraciones: { config: 'sin_acceso' },
      reportes: { global: 'sin_acceso' }
    }
  }
]

export const mockLogin = async (email, password) => {
  // Simular delay de red
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  const user = mockUsers.find(u => u.email === email)
  
  if (!user) {
    return { success: false, error: 'Usuario no encontrado' }
  }
  
  // Password simples para demo
  const validPasswords = {
    'admin@wms.com': 'admin123',
    'operador@wms.com': 'operador123'
  }
  
  if (password !== validPasswords[email]) {
    return { success: false, error: 'Contraseña incorrecta' }
  }
  
  return {
    success: true,
    token: `mock_token_${user.id}_${Date.now()}`,
    user
  }
}

export const mockAuthMe = async () => {
  await new Promise(resolve => setTimeout(resolve, 500))
  return { user: mockUsers[0] } // Retorna admin por defecto
}
