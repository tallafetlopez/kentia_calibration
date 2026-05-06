"""
Clear MongoDB collections (preserving indexes and structure).
DO NOT drop collections — use delete_many({}) for clean reset.
Preserves the "users" collection for admin survival.
"""

import asyncio
import argparse
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "calibrationengine_herko"

# Collections to clear (NOT including users)
COLLECTIONS_TO_CLEAR = [
    "sw_releases",
    "datasets",
    "reviews",
    "vehicle_sw_ids",
    "audit_logs",
]


async def main(dry_run: bool = False):
    """Main function to clear collections."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print(f"\n{'='*60}")
    print(f"Database: {DB_NAME}")
    print(f"Mode: {'DRY-RUN (no deletion)' if dry_run else 'LIVE'}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    total_deleted = 0

    for collection_name in COLLECTIONS_TO_CLEAR:
        collection = db[collection_name]

        # Count documents
        count = await collection.count_documents({})

        if dry_run:
            print(f"[DRY-RUN] {collection_name:20} → {count:5} documents (would be deleted)")
        else:
            result = await collection.delete_many({})
            deleted = result.deleted_count
            print(f"[CLEARED] {collection_name:20} → {deleted:5} documents deleted")
            total_deleted += deleted

    # Also show count of users (NOT deleted)
    users_count = await db.users.count_documents({})
    print(f"\n[PRESERVED] {'users':20} → {users_count:5} documents (untouched)")

    print(f"\n{'='*60}")
    if dry_run:
        print(f"Dry-run complete. Total documents that would be deleted: {total_deleted}")
    else:
        print(f"Cleanup complete. Total documents deleted: {total_deleted}")
    print(f"{'='*60}\n")

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Clear MongoDB collections in calibrationengine_herko database"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List documents per collection WITHOUT deleting"
    )
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run))
