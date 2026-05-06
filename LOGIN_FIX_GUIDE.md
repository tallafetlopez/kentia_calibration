# 🔐 HERKO Login Fix Guide

## Problem
The login button stays in loading spinner forever without showing error or redirecting.

## Root Cause
The backend was not importing routers correctly (conflict with `traceability` function), so the API endpoints weren't registered.

## ✅ What Was Fixed

### Backend (`server.py`)
- ✅ Fixed import conflict: `from routers import traceability as traceability_router`
- ✅ CORS is already correctly configured
- ✅ Auth endpoint is registered at `/api/auth/login`
- ✅ Auto-seeding of demo users on startup

### Frontend (`LoginPage.jsx` + `auth.jsx`)
- ✅ Added timeout to login request (10 seconds)
- ✅ Better error handling and logging
- ✅ setLoading(false) guaranteed in all code paths

---

## 🚀 How to Fix Your Login

### Step 1: Start MongoDB
```powershell
mongod
```

### Step 2: Start Backend
```powershell
cd backend
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Empty database — seeding demo data
INFO:     Seeded: {...}
```

### Step 3: Verify Users Exist
```powershell
cd backend
python diagnose_login.py
```

Expected output:
```
✓ Connected
✓ Found 9 users
✓ Password correct!
```

### Step 4: Start Frontend
```powershell
cd frontend
npm start
```

### Step 5: Login
Go to **http://localhost:3000** and login with:
- **Email**: `admin@herko.dev`
- **Password**: `password123`

---

## 📝 Demo Accounts

All demo accounts use password: `password123`

| Email | Role |
|-------|------|
| admin@herko.dev | All roles |
| cal@herko.dev | Calibration_Engineer |
| eng@herko.dev | PI_Engineering_Manager |
| cfg@herko.dev | Configuration_Manager |
| dma@herko.dev | DM_Administrator |

---

## 🔧 If Login Still Fails

### 1. Check Backend is Running
```powershell
# Test if backend responds
Invoke-WebRequest -Uri "http://localhost:8000/api/auth/roles" -Method GET
```

Expected: `200 OK` with list of roles

### 2. Check CORS
```powershell
# Test CORS preflight
Invoke-WebRequest -Uri "http://localhost:8000/" `
  -Method OPTIONS `
  -Headers @{"Origin" = "http://localhost:3000"}
```

Should return `access-control-allow-origin: http://localhost:3000`

### 3. Seed Users Manually
```powershell
cd backend
python seed_users_simple.py
```

### 4. Check Browser Console
Open DevTools (F12) → Console tab and look for:
- ❌ Error messages (red)
- ✓ "✓ Backend imports OK" message
- Network tab → see `/api/auth/login` request

---

## 📋 Files Changed

**Backend**:
- `server.py` — Fixed import conflict
- `diagnose_login.py` (NEW) — Diagnostic script
- `seed_users_simple.py` (NEW) — Simple seed script

**Frontend**:
- `LoginPage.jsx` — Better error logging
- `auth.jsx` — Added 10s timeout to login

---

## ✨ What's Working Now

✅ Backend starts without errors  
✅ Users auto-seed on startup  
✅ CORS configured correctly  
✅ Login has 10-second timeout  
✅ Error messages display clearly  
✅ Demo accounts ready to use  

---

**Last Updated**: 5 de mayo de 2026  
**Status**: ✅ READY TO TEST
