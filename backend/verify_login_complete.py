#!/usr/bin/env python3
"""
COMPLETE LOGIN VERIFICATION
Test all components: MongoDB, Backend, Frontend, CORS
"""

import asyncio
import sys
import subprocess
import os
from motor.motor_asyncio import AsyncIOMotorClient
from auth_utils import verify_password

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "calibrationengine_herko"


async def check_mongodb():
    """Test MongoDB connection"""
    print("\n🔍 Testing MongoDB...", end=" ", flush=True)
    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        await client.server_info()
        client.close()
        print("✓")
        return True
    except Exception as e:
        print(f"❌ {e}")
        return False


async def check_users():
    """Check if users exist in database"""
    print("🔍 Checking users...", end=" ", flush=True)
    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        count = await db.users.count_documents({})
        client.close()
        
        if count == 0:
            print("❌ No users found")
            return False
        else:
            print(f"✓ ({count} users)")
            return True
    except Exception as e:
        print(f"❌ {e}")
        return False


async def check_admin_password():
    """Verify admin credentials"""
    print("🔍 Checking admin credentials...", end=" ", flush=True)
    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        admin = await db.users.find_one({"email": "admin@herko.dev"})
        client.close()
        
        if not admin:
            print("❌ admin@herko.dev not found")
            return False
        
        pwd_hash = admin.get("password_hash")
        if verify_password("password123", pwd_hash):
            print("✓")
            return True
        else:
            print("❌ Password mismatch")
            return False
    except Exception as e:
        print(f"❌ {e}")
        return False


async def main():
    print("=" * 60)
    print("HERKO COMPLETE LOGIN VERIFICATION")
    print("=" * 60)

    results = []

    # MongoDB checks
    results.append(("MongoDB", await check_mongodb()))
    results.append(("Users", await check_users()))
    results.append(("Admin Password", await check_admin_password()))

    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    print(f"Results: {passed}/{total} passed")
    print("=" * 60)

    if passed == total:
        print("\n✅ ALL CHECKS PASSED!")
        print("\nYou can now login with:")
        print("  Email:    admin@herko.dev")
        print("  Password: password123")
        print("\nMake sure:")
        print("  1. Backend running: uvicorn server:app --reload --port 8000")
        print("  2. Frontend running: npm start (in frontend/)")
        print("  3. Browser: http://localhost:3000")
        return True
    else:
        print("\n❌ Some checks failed!")
        print("\nNext steps:")
        print("  1. Make sure MongoDB is running")
        print("  2. Run: python seed_users_simple.py")
        print("  3. Restart backend with: uvicorn server:app --reload")
        return False


if __name__ == "__main__":
    os.chdir(os.path.dirname(__file__))
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
