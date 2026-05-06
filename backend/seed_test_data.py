"""Seed minimal realistic test data for HERKO Calibration Manager."""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "calibrationengine_herko"


async def main():
    """Seed test data."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print(f"\n{'='*60}")
    print(f"Database: {DB_NAME}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    # 1. Create SW Release
    sw_release_doc = {
        "identifier": "ECM-SW-2024.1",
        "version": "1.4.2",
        "supplier": "Bosch",
        "a2l_filename": None,
        "released_date": datetime(2026, 1, 5, tzinfo=timezone.utc),
        "status": "VALID_FOR_CALIBRATION",
        "created_by": "admin@herko.dev",
        "created_at": datetime.now(timezone.utc),
    }

    # Check if already exists
    existing_sw = await db.sw_releases.find_one({"identifier": "ECM-SW-2024.1"})
    if existing_sw:
        print(f"[SKIPPED] SW Release already exists: ECM-SW-2024.1")
        sw_release_id = existing_sw["_id"]
    else:
        result = await db.sw_releases.insert_one(sw_release_doc)
        sw_release_id = result.inserted_id
        print(f"[CREATED] SW Release: ECM-SW-2024.1 → {sw_release_id}")

    # 2. Create Dataset
    dataset_doc = {
        "name": "DS_Base_Euro6d_Prod",
        "state": "RELEASED",
        "sw_release_id": str(sw_release_id),
        "sw_release_identifier": "ECM-SW-2024.1",
        "context": "PRODUCTION",
        "mode": "IMPORT_S37",
        "author": "cal@herko.dev",
        "derived_from": None,
        "is_locked": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    # Check if already exists
    existing_dataset = await db.datasets.find_one({"name": "DS_Base_Euro6d_Prod"})
    if existing_dataset:
        print(f"[SKIPPED] Dataset already exists: DS_Base_Euro6d_Prod")
        dataset_id = existing_dataset["_id"]
    else:
        result = await db.datasets.insert_one(dataset_doc)
        dataset_id = result.inserted_id
        print(f"[CREATED] Dataset: DS_Base_Euro6d_Prod → {dataset_id}")

    # 3. Create Vehicle_SW_ID linked to dataset
    vehicle_sw_doc = {
        "vehicle_sw_id": str(uuid.uuid4()),
        "sw_release_id": str(sw_release_id),
        "sw_release_identifier": "ECM-SW-2024.1",
        "dataset_id": str(dataset_id),
        "dataset_name": "DS_Base_Euro6d_Prod",
        "vin": None,
        "variant": None,
        "mfg_order_ref": "MO-A2A1493B",
        "service_case_ref": None,
        "created_by": "dma@herko.dev",
        "created_at": datetime.now(timezone.utc),
    }

    # Check if vehicle with mfg_order_ref already exists
    existing_vehicle = await db.vehicle_sw_ids.find_one({"mfg_order_ref": "MO-A2A1493B"})
    if existing_vehicle:
        print(f"[SKIPPED] Vehicle SW ID already exists for MO-A2A1493B")
        vehicle_id = existing_vehicle["_id"]
    else:
        result = await db.vehicle_sw_ids.insert_one(vehicle_sw_doc)
        vehicle_id = result.inserted_id
        print(f"[CREATED] Vehicle SW ID: {vehicle_sw_doc['vehicle_sw_id'][:8]}... → {vehicle_id}")

    print(f"\n{'='*60}")
    print(f"Seed complete.")
    print(f"SW Release ID: {sw_release_id}")
    print(f"Dataset ID:    {dataset_id}")
    print(f"Vehicle ID:    {vehicle_id}")
    print(f"{'='*60}\n")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
