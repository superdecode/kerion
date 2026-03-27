# 🚀 Guía Completa de Testing Localhost - Pixxi Order App

## 📋 Resumen

Esta guía te permitirá probar la app Android Pixxi en tu máquina local usando un emulador Android.

---

## ✅ Configuración Completada

### Backend API
- ✅ URL configurada: `http://10.0.2.2:8000/`
- ✅ Base de datos: `pixxi_ordering_app`
- ✅ Servidor PHP corriendo en puerto 8000

### Usuario de Prueba Creado
```
Email: test@pixxi.com
Password: 123456
```

---

## 🔧 Requisitos Previos

### 1. Android Studio
Si no lo tienes instalado:
```bash
# Descargar desde:
https://developer.android.com/studio

# O instalar con Homebrew:
brew install --cask android-studio
```

### 2. MySQL Running
```bash
# Verificar que MySQL está corriendo:
brew services list | grep mysql

# Si no está corriendo:
brew services start mysql
```

### 3. PHP Server Running
```bash
# Iniciar servidor PHP (si no está corriendo):
cd /Users/quiron/CascadeProjects/pixxi/ordering_app-Backend
php -S localhost:8000
```

---

## 📱 Configuración del Emulador Android

### Opción 1: Usar Android Studio (Recomendado)

1. **Abrir Android Studio**
   ```bash
   open -a "Android Studio" /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
   ```

2. **Crear/Configurar Emulador**
   - Tools → Device Manager
   - Click "Create Device"
   - Selecciona: **Pixel 5** o **Pixel 6**
   - System Image: **Android 13 (API 33)** o superior
   - Click "Finish"

3. **Iniciar Emulador**
   - Click en el botón ▶️ (Play) junto al dispositivo
   - Espera a que el emulador inicie completamente

### Opción 2: Línea de Comandos

```bash
# Listar emuladores disponibles
~/Library/Android/sdk/emulator/emulator -list-avds

# Iniciar emulador (reemplaza 'Pixel_5_API_33' con tu AVD)
~/Library/Android/sdk/emulator/emulator -avd Pixel_5_API_33
```

---

## 🏗️ Compilar e Instalar la App

### Método 1: Android Studio (Más Fácil)

1. **Abrir Proyecto**
   ```bash
   open -a "Android Studio" /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
   ```

2. **Esperar Gradle Sync**
   - Android Studio sincronizará automáticamente
   - Espera a que termine (puede tomar 2-5 minutos la primera vez)

3. **Ejecutar App**
   - Click en el botón ▶️ (Run) en la barra superior
   - Selecciona el emulador que iniciaste
   - La app se instalará y abrirá automáticamente

### Método 2: Línea de Comandos

```bash
# Navegar al proyecto
cd /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp

# Compilar APK Debug
./gradlew assembleDebug

# El APK se generará en:
# app/build/outputs/apk/debug/PixxiOrderApp_1.0.apk

# Instalar en emulador (debe estar corriendo)
~/Library/Android/sdk/platform-tools/adb install app/build/outputs/apk/debug/PixxiOrderApp_1.0.apk

# Iniciar la app
~/Library/Android/sdk/platform-tools/adb shell am start -n com.app.pixxi/.splash.SplashActivity
```

---

## 🧪 Probar la Aplicación

### 1. Primera Ejecución

1. **Splash Screen**
   - La app mostrará el logo de Pixxi
   - Espera 2-3 segundos

2. **Pantalla de Login**
   - Ingresa las credenciales de prueba:
     - Email: `test@pixxi.com`
     - Password: `123456`
   - Click en "Login"

### 2. Funcionalidades a Probar

#### Home Screen
- ✅ Ver banners promocionales
- ✅ Ver categorías de productos
- ✅ Ver lista de vendedores
- ✅ Buscar productos

#### Catálogo
- ✅ Navegar categorías
- ✅ Ver detalles de productos
- ✅ Agregar al carrito
- ✅ Agregar a favoritos

#### Carrito
- ✅ Ver productos en carrito
- ✅ Modificar cantidades
- ✅ Eliminar productos
- ✅ Proceder al checkout

#### Perfil
- ✅ Ver información del usuario
- ✅ Editar perfil
- ✅ Ver historial de órdenes
- ✅ Cambiar contraseña

---

## 🔍 Verificar Conexión Backend

### Test API desde el Emulador

1. **Abrir Chrome en el Emulador**
2. **Navegar a:** `http://10.0.2.2:8000/api/settings`
3. **Deberías ver:** JSON con configuración de la app

### Test desde tu Computadora

```bash
# Verificar que el backend responde
curl http://localhost:8000/api/settings

# Deberías ver JSON con datos de configuración
```

---

## 🐛 Solución de Problemas

### Problema 1: "No se puede conectar al servidor"

**Solución:**
```bash
# Verificar que PHP server está corriendo
lsof -i :8000

# Si no está corriendo, iniciarlo:
cd /Users/quiron/CascadeProjects/pixxi/ordering_app-Backend
php -S localhost:8000
```

### Problema 2: "Error de base de datos"

**Solución:**
```bash
# Verificar MySQL
brew services list | grep mysql

# Verificar que la base de datos existe
mysql -u root -e "SHOW DATABASES LIKE 'pixxi_ordering_app';"

# Si no existe, importarla:
mysql -u root -e "CREATE DATABASE pixxi_ordering_app;"
mysql -u root pixxi_ordering_app < /Users/quiron/CascadeProjects/pixxi/database/pixxi_ordering_app.sql
```

### Problema 3: "Gradle sync failed"

**Solución:**
```bash
# Limpiar y reconstruir
cd /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
./gradlew clean
./gradlew build
```

### Problema 4: "Emulador no inicia"

**Solución:**
```bash
# Verificar que tienes espacio en disco (necesitas al menos 10GB)
df -h

# Verificar configuración de virtualización
sysctl -a | grep machdep.cpu.features | grep VMX
```

### Problema 5: "App se cierra al iniciar"

**Solución:**
1. Ver logs en Android Studio: View → Tool Windows → Logcat
2. Filtrar por "Pixxi" para ver errores específicos
3. O desde terminal:
```bash
~/Library/Android/sdk/platform-tools/adb logcat | grep -i pixxi
```

---

## 📊 Endpoints API Disponibles

### Autenticación
- `POST /api/user_login` - Login de usuario
- `POST /api/user_registration` - Registro de usuario
- `POST /api/forgot_password` - Recuperar contraseña

### Productos
- `POST /api/home` - Datos del home (banners, categorías, productos)
- `POST /api/products` - Lista de productos
- `POST /api/product_details` - Detalles de producto
- `POST /api/category_list` - Lista de categorías

### Carrito
- `POST /api/add_to_cart` - Agregar al carrito
- `POST /api/cart_list` - Ver carrito
- `POST /api/remove_from_cart` - Eliminar del carrito
- `POST /api/checkout` - Procesar orden

### Usuario
- `POST /api/user_profile_details` - Ver perfil
- `POST /api/user_profile_update` - Actualizar perfil
- `POST /api/order_list` - Historial de órdenes

---

## 🎯 Usuarios de Prueba Adicionales

Si necesitas más usuarios de prueba, estos ya existen en la base de datos:

```
Usuario 1:
Email: tonyja@mail.com
Password: (necesitas verificar en la BD)

Usuario 2:
Email: dominos@mail.com
Password: (necesitas verificar en la BD)

Usuario 3 (Recomendado):
Email: test@pixxi.com
Password: 123456
```

---

## 📝 Notas Importantes

### Red del Emulador
- `10.0.2.2` = localhost de tu máquina host
- `localhost` en el emulador = el propio emulador (NO funciona)
- Si usas dispositivo físico, usa la IP de tu computadora (ej: `192.168.1.100:8000`)

### Para Dispositivo Físico

1. **Obtener IP de tu Mac:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

2. **Modificar ApiConstant.java:**
```java
private static final String DOMAIN = "http://TU_IP_AQUI:8000/";
```

3. **Recompilar la app**

---

## 🚀 Comandos Rápidos

### Iniciar Todo
```bash
# Terminal 1: Iniciar MySQL
brew services start mysql

# Terminal 2: Iniciar PHP Server
cd /Users/quiron/CascadeProjects/pixxi/ordering_app-Backend
php -S localhost:8000

# Terminal 3: Iniciar Emulador
~/Library/Android/sdk/emulator/emulator -avd Pixel_5_API_33

# Terminal 4: Instalar App
cd /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
./gradlew installDebug
```

### Detener Todo
```bash
# Detener PHP Server: Ctrl+C en la terminal
# Cerrar emulador: Cerrar ventana del emulador
# Detener MySQL (opcional):
brew services stop mysql
```

---

## 📞 Soporte

Si encuentras problemas:
1. Revisa los logs del emulador
2. Verifica que todos los servicios estén corriendo
3. Revisa la sección de "Solución de Problemas"

---

## ✨ Resultado Esperado

Al finalizar esta guía deberías tener:
- ✅ Backend corriendo en `localhost:8000`
- ✅ Base de datos MySQL con datos de prueba
- ✅ Emulador Android funcionando
- ✅ App Pixxi instalada y funcional
- ✅ Capacidad de login, navegar productos, y hacer órdenes

**¡Disfruta probando la app Pixxi!** 🎉
