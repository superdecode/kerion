# ✅ Configuración Completa - Pixxi Order App

## 🎉 Todo Listo para Probar

---

## 📦 Lo que se ha Configurado

### ✅ Backend API
- **URL:** `http://localhost:8000`
- **Base de datos:** `pixxi_ordering_app` (importada)
- **Servidor:** PHP 8.5.2 corriendo
- **Estado:** ✅ Funcionando

### ✅ App Android
- **Proyecto:** `/Users/quiron/CascadeProjects/pixxi/PixxiOrderApp`
- **Package:** `com.app.pixxi`
- **API URL:** `http://10.0.2.2:8000/` (configurada para emulador)
- **Estado:** ✅ Lista para compilar

### ✅ Usuario de Prueba
```
Email: test@pixxi.com
Password: 123456
Nombre: Test User
```

---

## 🚀 Inicio Rápido (3 Pasos)

### 1️⃣ Iniciar Backend
```bash
cd /Users/quiron/CascadeProjects/pixxi
./quick-start.sh
```

### 2️⃣ Abrir Android Studio
```bash
open -a "Android Studio" PixxiOrderApp
```

### 3️⃣ Ejecutar App
- Espera a que Gradle sincronice (2-5 min primera vez)
- Click en ▶️ (Run)
- Login con: `test@pixxi.com` / `123456`

---

## 📚 Documentación Disponible

| Archivo | Descripción |
|---------|-------------|
| `README_TESTING.md` | Inicio rápido y comandos básicos |
| `LOCALHOST_TESTING_GUIDE.md` | Guía completa de testing (⭐ Recomendada) |
| `ANDROID_EMULATOR_SETUP.md` | Configuración detallada del emulador |
| `quick-start.sh` | Script para iniciar servicios |

---

## 🔗 URLs Importantes

| Servicio | URL | Descripción |
|----------|-----|-------------|
| Backend API | http://localhost:8000 | API principal |
| Admin Panel | http://localhost:8000/auth/login | Panel administrativo |
| API Test | http://localhost:8000/api/settings | Test de API |
| Emulador API | http://10.0.2.2:8000/ | URL para emulador Android |

---

## 📱 Credenciales

### Usuario Cliente (App Android)
```
Email: test@pixxi.com
Password: 123456
```

### Usuarios Existentes (Opcionales)
```
Email: tonyja@mail.com
Email: dominos@mail.com
Email: dadaboudi@mail.com
```

---

## 🎯 Funcionalidades Disponibles

### En la App Android
- ✅ Login/Registro
- ✅ Home con banners y productos
- ✅ Búsqueda de productos
- ✅ Categorías y subcategorías
- ✅ Detalles de productos
- ✅ Carrito de compras
- ✅ Checkout y órdenes
- ✅ Perfil de usuario
- ✅ Historial de órdenes
- ✅ Mensajes con vendedores
- ✅ Favoritos/Wishlist
- ✅ Valoraciones y reviews
- ✅ Cupones
- ✅ FAQ
- ✅ Feedback

### En el Backend
- ✅ 40+ endpoints REST
- ✅ Panel administrativo
- ✅ Gestión de productos
- ✅ Gestión de órdenes
- ✅ Gestión de usuarios
- ✅ Gestión de vendedores
- ✅ Reportes
- ✅ Configuración del sistema

---

## 🔧 Comandos Útiles

### Iniciar Servicios
```bash
# Iniciar MySQL
brew services start mysql

# Iniciar PHP Server
cd /Users/quiron/CascadeProjects/pixxi/ordering_app-Backend
php -S localhost:8000

# O usar el script rápido:
./quick-start.sh
```

### Verificar Estado
```bash
# Verificar MySQL
brew services list | grep mysql

# Verificar PHP Server
lsof -i :8000

# Test API
curl http://localhost:8000/api/settings
```

### Detener Servicios
```bash
# Detener PHP Server
pkill -f 'php -S localhost:8000'

# Detener MySQL (opcional)
brew services stop mysql
```

### Android
```bash
# Ver dispositivos conectados
~/Library/Android/sdk/platform-tools/adb devices

# Ver logs de la app
~/Library/Android/sdk/platform-tools/adb logcat | grep -i pixxi

# Reinstalar app
cd /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
./gradlew installDebug
```

---

## 📋 Checklist Pre-Testing

Antes de probar, verifica:

- [ ] MySQL está corriendo
- [ ] PHP Server está corriendo en puerto 8000
- [ ] Base de datos `pixxi_ordering_app` existe
- [ ] API responde en `http://localhost:8000/api/settings`
- [ ] Android Studio instalado
- [ ] Emulador Android creado
- [ ] Proyecto abierto en Android Studio
- [ ] Gradle sync completado

---

## 🐛 Problemas Comunes

### Backend no responde
```bash
# Reiniciar servidor
pkill -f 'php -S localhost:8000'
cd /Users/quiron/CascadeProjects/pixxi/ordering_app-Backend
php -S localhost:8000
```

### Error de base de datos
```bash
# Verificar configuración
cat ordering_app-Backend/application/config/development/database.php | grep database

# Debe mostrar: 'database' => 'pixxi_ordering_app',
```

### App no se conecta
- Verifica que `ApiConstant.java` tenga: `http://10.0.2.2:8000/`
- NO uses `localhost` en el emulador
- Verifica que el backend esté corriendo

### Gradle sync failed
```bash
cd /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
./gradlew clean
# Luego en Android Studio: File → Invalidate Caches → Restart
```

---

## 📊 Estructura del Proyecto

```
pixxi/
├── PixxiOrderApp/              # App Android
│   ├── app/
│   │   ├── src/main/java/      # Código Java
│   │   └── build.gradle        # Configuración
│   └── build.gradle            # Configuración raíz
├── ordering_app-Backend/       # Backend PHP
│   ├── application/            # Código CodeIgniter
│   ├── assets/                 # Assets admin
│   └── index.php               # Entry point
├── database/                   # Base de datos
│   └── pixxi_ordering_app.sql
├── postman/                    # Colección Postman
├── README_TESTING.md           # Inicio rápido
├── LOCALHOST_TESTING_GUIDE.md  # Guía completa
├── ANDROID_EMULATOR_SETUP.md   # Setup emulador
└── quick-start.sh              # Script inicio
```

---

## 🎓 Próximos Pasos

1. **Leer la guía completa:** `LOCALHOST_TESTING_GUIDE.md`
2. **Configurar emulador:** `ANDROID_EMULATOR_SETUP.md`
3. **Iniciar servicios:** `./quick-start.sh`
4. **Abrir Android Studio:** Ejecutar la app
5. **Probar funcionalidades:** Login, productos, carrito, etc.

---

## 📞 Soporte

Si encuentras problemas:
1. Revisa la sección "Problemas Comunes" arriba
2. Consulta `LOCALHOST_TESTING_GUIDE.md`
3. Revisa logs del emulador: `adb logcat`
4. Verifica que todos los servicios estén corriendo

---

## ✨ Resultado Esperado

Al completar el setup:
- ✅ Backend funcionando en localhost:8000
- ✅ Base de datos con datos de prueba
- ✅ Emulador Android corriendo
- ✅ App instalada y funcional
- ✅ Login exitoso
- ✅ Navegación completa por la app

**¡Todo está listo para probar! 🚀**

---

## 📝 Notas Técnicas

### Configuración de Red
- Emulador usa `10.0.2.2` para acceder a localhost del host
- Dispositivo físico necesita IP real de tu Mac
- Backend configurado para aceptar conexiones de cualquier origen

### Base de Datos
- Motor: MySQL 9.6.0
- Charset: UTF-8
- Collation: utf8_general_ci
- Tablas: 62 tablas con datos de ejemplo

### App Android
- Min SDK: 22 (Android 5.1)
- Target SDK: 34 (Android 14)
- Lenguaje: Java
- Arquitectura: MVVM

---

**Fecha de configuración:** $(date)
**Versión:** 1.0
**Estado:** ✅ Producción Local Lista
