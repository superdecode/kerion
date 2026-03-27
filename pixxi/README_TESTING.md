# 🚀 Inicio Rápido - Pixxi Testing

## ⚡ Inicio Rápido (3 pasos)

### 1. Iniciar Servicios Backend
```bash
cd /Users/quiron/CascadeProjects/pixxi
./quick-start.sh
```

### 2. Abrir Android Studio
```bash
open -a "Android Studio" PixxiOrderApp
```

### 3. Ejecutar App
- Click en ▶️ (Run) en Android Studio
- Espera a que compile e instale
- Login con: `test@pixxi.com` / `123456`

---

## 📱 Credenciales de Prueba

```
Email: test@pixxi.com
Password: 123456
```

---

## 🔗 URLs Importantes

| Servicio | URL |
|----------|-----|
| Backend API | http://localhost:8000 |
| Admin Panel | http://localhost:8000/auth/login |
| API Test | http://localhost:8000/api/settings |
| Emulador API | http://10.0.2.2:8000/ |

---

## 📖 Documentación Completa

Ver: `LOCALHOST_TESTING_GUIDE.md`

---

## 🛑 Detener Servicios

```bash
# Detener PHP Server
pkill -f 'php -S localhost:8000'

# Detener MySQL (opcional)
brew services stop mysql
```

---

## ✅ Verificación Rápida

```bash
# Verificar MySQL
brew services list | grep mysql

# Verificar PHP Server
lsof -i :8000

# Test API
curl http://localhost:8000/api/settings
```
