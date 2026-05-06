# ✓ PROYECTO INICIADO CORRECTAMENTE

## 📍 ACCESO A LA APLICACIÓN

**Frontend:** http://localhost:3001  
**Backend API:** http://localhost:8000/api  

---

## 🔐 CREDENCIALES DE DEMO

**Contraseña para todos los usuarios:** `password123`

### Usuarios disponibles:
- `admin@herko.dev` - Admin (todos los roles)
- `pm@herko.dev` - Paulo Martins (Project Manager)
- `cal@herko.dev` - Clara Alves (Calibration Engineer)
- `eng@herko.dev` - Ethan Ng (Engineering Manager)
- `reg@herko.dev` - Ren Gupta (Regulatory Compliance)
- `vnv@herko.dev` - Vera Novak (Verification/Validation)
- `cfg@herko.dev` - Carlos Figueroa (Configuration Manager)
- `dma@herko.dev` - Dana Mori (DM Administrator)
- `ps@herko.dev` - Priya Sharma (Post Sales Engineer)

---

## 🔧 CÓMO CERRAR LA APLICACIÓN

### Opción 1: Desde VS Code
1. En la terminal del **Backend** (PowerShell):
   - Presiona `Ctrl+C` para detener uvicorn

2. En la terminal del **Frontend** (PowerShell):
   - Presiona `Ctrl+C` para detener npm

### Opción 2: Limpiar todo desde PowerShell
```powershell
# Matar todos los procesos Python y Node
taskkill /F /IM python.exe 2>&1 | Out-Null
taskkill /F /IM node.exe 2>&1 | Out-Null
```

### Opción 3: Matar puertos específicos
```powershell
# Matar proceso en puerto 8000 (Backend)
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Matar proceso en puerto 3001 (Frontend)
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

---

## 🚀 CÓMO REINICIAR (Si se cierra accidentalmente)

### Terminal 1 - Backend
```powershell
cd c:\Trabajo\kentia_calibration\backend
c:/Trabajo/kentia_calibration/.venv/Scripts/python.exe -m uvicorn server:app --host 0.0.0.0 --port 8000
```

### Terminal 2 - Frontend
```powershell
cd c:\Trabajo\kentia_calibration\frontend
npm start
# Si pregunta sobre otro puerto, responde: y
```

---

## 🐛 SOLUCIONES RÁPIDAS

### Si Backend falla con "Port already in use"
```powershell
taskkill /F /IM python.exe
# Espera 2 segundos
# Reinicia el backend
```

### Si MongoDB no responde
```powershell
# Verificar si MongoDB está corriendo
Get-Process | findstr "mongod"
# Si no aparece, iniciar MongoDB en otra terminal:
"C:\Program Files\MongoDB\Server\X.X\bin\mongod.exe"
```

### Si Frontend no carga
1. Abre DevTools (F12)
2. Ve a Network y recarga (Ctrl+R)
3. Verifica que http://localhost:8000/api/auth/roles devuelve datos

---

## 📝 NOTAS IMPORTANTES

✓ **BD seeded automáticamente** con todos los usuarios y datos de calibración  
✓ **Login funcionando** correctamente con contraseña `password123` para todos  
✓ **Backend en desarrollo** con auto-reload habilitado  
✓ **Frontend compilado** con Craco + Webpack dev server  

**Problema resuelto:** Faltaba importación de `verify_password` en `server.py` → ✓ Corregido

---

## 📂 ARCHIVOS CLAVE

- `.env` - Variables de entorno (MongoDB, JWT_SECRET, CORS)
- `backend/server.py` - API FastAPI (puerto 8000)
- `frontend/src/pages/LoginPage.jsx` - Página de login
- `backend/models.py` - Modelos Pydantic
- `backend/auth_utils.py` - Autenticación y JWT

---

¡**Listo para trabajar! 🎉**
