#!/usr/bin/env python3
"""
DIAGNOSTIC SCRIPT — Verify login setup
Checks: MongoDB, users collection, demo users
"""

import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from auth_utils import verify_password, hash_password

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "calibrationengine_herko"

async def main():
    print("=" * 60)
    print("HERKO LOGIN DIAGNOSTIC")
    print("=" * 60)

    try:
        # Connect to MongoDB
        print("\n1️⃣  Connecting to MongoDB...", end=" ")
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        await client.server_info()  # Test connection
        print("✓ Connected")
        db = client[DB_NAME]

        # Check users collection
        print(f"2️⃣  Checking database '{DB_NAME}'...", end=" ")
        user_count = await db.users.count_documents({})
        print(f"✓ Found {user_count} users")

        if user_count == 0:
            print("\n❌ NO USERS IN DATABASE!")
            print("   Run: python seed.py")
            return False

        # List all users
        print("\n3️⃣  Users in database:")
        users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
        for i, user in enumerate(users, 1):
            email = user.get("email", "?")
            name = user.get("name", "?")
            roles = user.get("roles", [])
            print(f"   {i}. {email:25} | {name:20} | {', '.join(roles)}")

        # Test login with admin credentials
        print("\n4️⃣  Testing login with admin@herko.dev / password123...")
        admin = await db.users.find_one({"email": "admin@herko.dev"})
        
        if not admin:
            print("   ❌ admin@herko.dev not found!")
            return False
        
        pwd_hash = admin.get("password_hash")
        if verify_password("password123", pwd_hash):
            print("   ✓ Password correct!")
        else:
            print("   ❌ Password INCORRECT!")
            print("   Expected: password123")
            return False

        # Summary
        print("\n" + "=" * 60)
        print("✓ ALL CHECKS PASSED")
        print("=" * 60)
        print("\nYour login credentials are:")
        print("  Email:    admin@herko.dev")
        print("  Password: password123")
        print("\nYou can now login to http://localhost:3000")
        
        return True

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print("\nTroubleshooting:")
        print("  1. Is MongoDB running? Run: mongod")
        print("  2. Did you run seed.py? Run: python seed.py")
        print("  3. Is the backend running? Run: uvicorn server:app --reload --port 8000")
        return False

    finally:
        client.close()


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
