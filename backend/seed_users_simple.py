#!/usr/bin/env python3
"""
SIMPLE SEED SCRIPT — Ensure demo users exist in MongoDB
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from auth_utils import hash_password
from seed import DEMO_USERS, DEMO_PASSWORD
from models import _uuid, _now

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "calibrationengine_herko"


async def main():
    print("=" * 60)
    print("SEED DEMO USERS")
    print("=" * 60)

    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        await client.server_info()
        db = client[DB_NAME]

        print(f"\n✓ Connected to {DB_NAME}")

        # Check existing
        existing_count = await db.users.count_documents({})
        print(f"  Currently {existing_count} users")

        if existing_count > 0:
            print("  ✓ Users already exist. Skipping.")
            return True

        # Seed users
        print("\n  Seeding users...")
        now = _now()
        for email, name, roles in DEMO_USERS:
            await db.users.insert_one(
                {
                    "id": _uuid(),
                    "email": email,
                    "password_hash": hash_password(DEMO_PASSWORD),
                    "name": name,
                    "roles": roles,
                    "active_role": roles[0],
                    "created_at": now,
                }
            )
            print(f"    ✓ {email}")

        # Verify
        final_count = await db.users.count_documents({})
        print(f"\n✓ Successfully seeded {final_count} users")
        print(f"\nDemo credentials:")
        print(f"  Email:    admin@herko.dev")
        print(f"  Password: {DEMO_PASSWORD}")
        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nMake sure MongoDB is running: mongod")
        return False

    finally:
        client.close()


if __name__ == "__main__":
    import sys
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
