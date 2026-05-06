"""
Reset Database — Delete all documents except users.

Usage:
    python reset_db_keep_users.py

MongoDB: mongodb://localhost:27017
Database: calibrationengine_herko
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient


async def reset_database():
    """Delete all documents from all collections EXCEPT 'users'."""
    
    # Connect to MongoDB
    print("🔗 Connecting to MongoDB...")
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["calibrationengine_herko"]
    
    try:
        # List all collections
        collections = await db.list_collection_names()
        print(f"✓ Found {len(collections)} collection(s)\n")
        
        # Track deletions
        total_deleted = 0
        
        for collection_name in sorted(collections):
            if collection_name == "users":
                # Preserve users collection
                count = await db[collection_name].count_documents({})
                print(f"👤 users: ✓ PRESERVED ({count} users)")
            else:
                # Delete all documents from other collections
                result = await db[collection_name].delete_many({})
                deleted_count = result.deleted_count
                total_deleted += deleted_count
                
                if deleted_count == 0:
                    print(f"🗑️  {collection_name}: ✓ empty (0 docs)")
                else:
                    print(f"🗑️  {collection_name}: {deleted_count} doc(s) deleted")
        
        # Print summary
        print("\n" + "=" * 60)
        print("✅ DATABASE RESET COMPLETE")
        print("=" * 60)
        print(f"Total documents deleted: {total_deleted}")
        print(f"Users collection: PRESERVED")
        print(f"All other collections: EMPTIED")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    print("\n🧹 HERKO Calibration Manager — Database Reset")
    print("━" * 60)
    print("ℹ️  This will DELETE all documents from all collections")
    print("    EXCEPT 'users' collection")
    print("━" * 60 + "\n")
    
    asyncio.run(reset_database())
