import sys
from pathlib import Path

# Setup paths
sys.path.insert(0, str(Path('c:\\Trabajo\\kentia_calibration\\backend')))

print("Loading environment...")
from dotenv import load_dotenv
env_path = Path('c:\\Trabajo\\kentia_calibration\\backend\\.env')
result = load_dotenv(env_path)
print(f"Dotenv loaded: {result}")

print("\nImporting server...")
try:
    from server import app, db
    print("✓ Server imported successfully")
except Exception as e:
    print(f"✗ Error importing server: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\nTesting database connection...")
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

try:
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    print(f"MONGO_URL: {mongo_url}")
    print(f"DB_NAME: {db_name}")
    
    async def test():
        client = AsyncIOMotorClient(mongo_url)
        test_db = client[db_name]
        count = await test_db.users.count_documents({})
        print(f"✓ DB connection works, users: {count}")
        client.close()
    
    asyncio.run(test())
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
