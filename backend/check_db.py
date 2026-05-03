
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from pathlib import Path

# Cargar .env desde la ruta absoluta del backend
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

async def check():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    
    user_count = await db.users.count_documents({})
    print(f"[DB] users: {user_count}")
    
    if user_count > 0:
        users = await db.users.find({}, {"_id": 0, "email": 1, "password_hash": 1}).to_list(20)
        for u in users:
            print(f"  email={u['email']}  hash_present={'password_hash' in u and bool(u['password_hash'])}")
    else:
        print("[!] Base de datos VACIA — ejecutando seed...")
        from seed import seed_all
        stats = await seed_all(db)
        print(f"[OK] Seed completado: {stats}")
    
    client.close()

asyncio.run(check())
