import asyncio
import sys
import os
from pathlib import Path

# Cargar .env
from dotenv import load_dotenv
env_path = Path('c:\\Trabajo\\kentia_calibration\\.env')
load_dotenv(env_path)

sys.path.insert(0, 'c:\\\\Trabajo\\\\kentia_calibration\\\\backend')

from motor.motor_asyncio import AsyncIOMotorClient
from auth_utils import verify_password, create_access_token
from models import LoginBody

async def test_login():
    try:
        # Conectar a la BD
        client = AsyncIOMotorClient('mongodb://localhost:27017')
        db = client['calibration_db']
        
        # Crear el body
        email = "admin@herko.dev"
        password = "password123"
        
        # Buscar el usuario
        print("Buscando usuario...")
        user = await db.users.find_one({"email": email})
        
        if not user:
            print("Usuario no encontrado")
            return
        
        print(f"Usuario encontrado: {user['email']}")
        print(f"Password hash: {user['password_hash'][:30]}...")
        
        # Verificar la contraseña
        print("Verificando contraseña...")
        is_valid = verify_password(password, user["password_hash"])
        print(f"Contraseña válida: {is_valid}")
        
        if not is_valid:
            print("Contraseña inválida")
            return
        
        # Crear el token
        print("Creando token...")
        token = create_access_token(user["id"], email)
        print(f"Token: {token}")
        
        # Retornar resultado
        user.pop("password_hash", None)
        user.pop("_id", None)
        print(f"Resultado: {{'token': '{token[:20]}...', 'user': {user}}}")
        
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

asyncio.run(test_login())
