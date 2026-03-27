# 📱 Configuración del Emulador Android - Guía Detallada

## 🎯 Objetivo
Configurar un emulador Android para probar la app Pixxi localmente.

---

## 📋 Requisitos

### 1. Instalar Android Studio
```bash
# Opción 1: Descargar desde el sitio oficial
# https://developer.android.com/studio

# Opción 2: Instalar con Homebrew
brew install --cask android-studio
```

### 2. Configurar Android SDK
Al abrir Android Studio por primera vez:
1. Acepta los términos y condiciones
2. Selecciona "Standard" installation
3. Espera a que descargue el SDK (puede tomar 10-15 minutos)

---

## 🚀 Crear Emulador Android

### Método 1: Desde Android Studio (Recomendado)

1. **Abrir Android Studio**
   ```bash
   open -a "Android Studio"
   ```

2. **Acceder al Device Manager**
   - Abre el proyecto: `File → Open` → Selecciona `/Users/quiron/CascadeProjects/pixxi/PixxiOrderApp`
   - Click en el ícono de teléfono en la barra superior (Device Manager)
   - O: `Tools → Device Manager`

3. **Crear Nuevo Dispositivo Virtual**
   - Click en "Create Device"
   - **Selecciona Hardware:**
     - Recomendado: **Pixel 5** o **Pixel 6**
     - Resolución: 1080 x 2340
     - Densidad: 440 dpi
   - Click "Next"

4. **Seleccionar System Image**
   - **Recomendado: Android 13 (API 33) - Tiramisu**
   - O: Android 12 (API 32)
   - Selecciona la imagen con "Google APIs" (incluye Google Play)
   - Click "Download" si no está instalada
   - Espera a que descargue (1-2 GB)
   - Click "Next"

5. **Configurar AVD**
   - Nombre: `Pixxi_Test_Device`
   - Startup orientation: Portrait
   - **Configuración Avanzada (Show Advanced Settings):**
     - RAM: 2048 MB (mínimo)
     - VM heap: 512 MB
     - Internal Storage: 2048 MB
     - SD card: 512 MB
   - Click "Finish"

### Método 2: Línea de Comandos

```bash
# Listar system images disponibles
~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager --list | grep system-images

# Descargar system image (Android 13)
~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager "system-images;android-33;google_apis;arm64-v8a"

# Crear AVD
~/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager create avd \
  -n Pixxi_Test_Device \
  -k "system-images;android-33;google_apis;arm64-v8a" \
  -d "pixel_5"

# Listar AVDs creados
~/Library/Android/sdk/emulator/emulator -list-avds
```

---

## ▶️ Iniciar Emulador

### Desde Android Studio
1. Abre Device Manager
2. Click en el botón ▶️ (Play) junto a `Pixxi_Test_Device`
3. Espera 30-60 segundos a que inicie

### Desde Terminal
```bash
# Iniciar emulador
~/Library/Android/sdk/emulator/emulator -avd Pixxi_Test_Device

# Iniciar en modo headless (sin ventana)
~/Library/Android/sdk/emulator/emulator -avd Pixxi_Test_Device -no-window

# Iniciar con más RAM
~/Library/Android/sdk/emulator/emulator -avd Pixxi_Test_Device -memory 4096
```

---

## 🔧 Verificar Emulador

### 1. Verificar que está corriendo
```bash
# Listar dispositivos conectados
~/Library/Android/sdk/platform-tools/adb devices

# Deberías ver algo como:
# emulator-5554   device
```

### 2. Test de conectividad
```bash
# Verificar conectividad con el emulador
~/Library/Android/sdk/platform-tools/adb shell ping -c 3 10.0.2.2

# Deberías ver respuestas exitosas
```

### 3. Test de API desde el emulador
```bash
# Abrir shell en el emulador
~/Library/Android/sdk/platform-tools/adb shell

# Dentro del shell, probar la API
curl http://10.0.2.2:8000/api/settings

# Deberías ver JSON con datos de configuración
```

---

## 📦 Instalar la App en el Emulador

### Opción 1: Desde Android Studio (Más Fácil)

1. **Abrir Proyecto**
   ```bash
   open -a "Android Studio" /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
   ```

2. **Esperar Gradle Sync**
   - Android Studio sincronizará automáticamente
   - Puede tomar 2-5 minutos la primera vez
   - Verás progreso en la barra inferior

3. **Seleccionar Dispositivo**
   - En la barra superior, selecciona tu emulador en el dropdown
   - Debe aparecer como "Pixxi_Test_Device" o "emulator-5554"

4. **Ejecutar App**
   - Click en el botón ▶️ (Run) verde
   - O presiona: `Ctrl + R`
   - La app se compilará, instalará y abrirá automáticamente

### Opción 2: Compilar e Instalar Manualmente

```bash
# Navegar al proyecto
cd /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp

# Compilar APK Debug
./gradlew assembleDebug

# Espera 2-5 minutos la primera vez
# El APK se generará en:
# app/build/outputs/apk/debug/PixxiOrderApp_1.0.apk

# Instalar en emulador
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/PixxiOrderApp_1.0.apk

# Iniciar la app
~/Library/Android/sdk/platform-tools/adb shell am start -n com.app.pixxi/.splash.SplashActivity
```

---

## 🧪 Probar la App

### 1. Primera Ejecución

**Splash Screen:**
- La app mostrará el logo de Pixxi
- Espera 2-3 segundos

**Pantalla de Login:**
- Email: `test@pixxi.com`
- Password: `123456`
- Click "Login"

### 2. Navegación Básica

**Home:**
- Verás banners, categorías y productos
- Scroll para ver más contenido

**Buscar:**
- Click en el ícono de búsqueda
- Escribe nombre de producto

**Carrito:**
- Agrega productos al carrito
- Click en el ícono del carrito

**Perfil:**
- Click en el ícono de perfil
- Ver información del usuario

---

## 🐛 Solución de Problemas

### Problema 1: Emulador no inicia

**Síntomas:**
- Ventana negra
- Error "Cannot launch AVD"

**Soluciones:**
```bash
# 1. Verificar espacio en disco (necesitas 10GB+)
df -h

# 2. Verificar virtualización
sysctl -a | grep machdep.cpu.features | grep VMX

# 3. Limpiar y recrear AVD
~/Library/Android/sdk/emulator/emulator -avd Pixxi_Test_Device -wipe-data

# 4. Aumentar RAM del emulador
# En Device Manager → Edit → Advanced → RAM: 4096 MB
```

### Problema 2: "App keeps stopping"

**Soluciones:**
```bash
# Ver logs en tiempo real
~/Library/Android/sdk/platform-tools/adb logcat | grep -i pixxi

# O desde Android Studio:
# View → Tool Windows → Logcat
# Filtrar por "Pixxi"
```

### Problema 3: No se conecta al backend

**Verificar:**
```bash
# 1. Backend está corriendo
lsof -i :8000

# 2. Desde el emulador, probar conectividad
~/Library/Android/sdk/platform-tools/adb shell ping -c 3 10.0.2.2

# 3. Probar API desde el emulador
~/Library/Android/sdk/platform-tools/adb shell curl http://10.0.2.2:8000/api/settings
```

**Solución:**
- Verifica que `ApiConstant.java` tenga: `http://10.0.2.2:8000/`
- NO uses `localhost` o `127.0.0.1` (eso apunta al emulador mismo)

### Problema 4: Gradle sync failed

**Soluciones:**
```bash
# 1. Limpiar proyecto
cd /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp
./gradlew clean

# 2. Invalidar caché de Android Studio
# File → Invalidate Caches → Invalidate and Restart

# 3. Eliminar archivos de build
rm -rf .gradle
rm -rf app/build
./gradlew build
```

### Problema 5: Emulador muy lento

**Soluciones:**
1. **Aumentar RAM:**
   - Device Manager → Edit → RAM: 4096 MB

2. **Habilitar aceleración:**
   - Verifica que HAXM esté instalado
   - System Preferences → Security → Allow kernel extension

3. **Usar imagen x86_64:**
   - Más rápida que ARM en Mac Intel
   - En Mac M1/M2, usa ARM64

---

## 📊 Comandos Útiles ADB

```bash
# Ver dispositivos conectados
~/Library/Android/sdk/platform-tools/adb devices

# Instalar APK
~/Library/Android/sdk/platform-tools/adb install app.apk

# Desinstalar app
~/Library/Android/sdk/platform-tools/adb uninstall com.app.pixxi

# Ver logs
~/Library/Android/sdk/platform-tools/adb logcat

# Limpiar logs
~/Library/Android/sdk/platform-tools/adb logcat -c

# Tomar screenshot
~/Library/Android/sdk/platform-tools/adb shell screencap /sdcard/screen.png
~/Library/Android/sdk/platform-tools/adb pull /sdcard/screen.png

# Abrir shell
~/Library/Android/sdk/platform-tools/adb shell

# Reiniciar emulador
~/Library/Android/sdk/platform-tools/adb reboot
```

---

## 🎯 Configuración para Dispositivo Físico

Si prefieres usar un dispositivo Android físico:

### 1. Habilitar Modo Desarrollador
1. Settings → About phone
2. Tap "Build number" 7 veces
3. Vuelve a Settings → Developer options
4. Habilita "USB debugging"

### 2. Conectar Dispositivo
```bash
# Conecta el dispositivo por USB
# Acepta el diálogo de "Allow USB debugging"

# Verificar conexión
~/Library/Android/sdk/platform-tools/adb devices
```

### 3. Modificar URL de API
```java
// En ApiConstant.java, usa la IP de tu Mac:
private static final String DOMAIN = "http://192.168.1.XXX:8000/";
```

**Obtener IP de tu Mac:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

## ✅ Checklist de Verificación

Antes de probar la app, verifica:

- [ ] Android Studio instalado
- [ ] Emulador creado (Pixel 5, Android 13)
- [ ] Emulador iniciado y funcionando
- [ ] Backend PHP corriendo en puerto 8000
- [ ] MySQL corriendo
- [ ] Base de datos `pixxi_ordering_app` existe
- [ ] Usuario de prueba creado (`test@pixxi.com`)
- [ ] `ApiConstant.java` configurado con `http://10.0.2.2:8000/`
- [ ] App compilada e instalada en el emulador

---

## 🎉 Resultado Esperado

Al completar esta guía:
- ✅ Emulador Android funcionando
- ✅ App Pixxi instalada
- ✅ Login exitoso con credenciales de prueba
- ✅ Navegación fluida por la app
- ✅ Conexión exitosa con el backend local

**¡Disfruta probando la app!** 📱
