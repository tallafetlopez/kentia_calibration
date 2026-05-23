"""Idempotent index creation. Called at server startup."""
from motor.motor_asyncio import AsyncIOMotorDatabase


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.label_metadata.create_index(
        [("sw_release_id", 1), ("label_name", 1)],
        unique=True, name="sw_release_label_unique",
    )
    await db.label_metadata.create_index(
        [("sw_release_id", 1), ("updated_at", -1)],
        name="sw_release_updated",
    )
    await db.label_working_values.create_index(
        [("sw_release_id", 1), ("label_name", 1)],
        unique=True, name="sw_release_label_wv_unique",
    )
    await db.label_working_values.create_index(
        [("sw_release_id", 1), ("modified", 1)],
        name="sw_release_modified_lookup",
    )
    await db.label_working_values.create_index(
        [("sw_release_id", 1), ("updated_at", -1)],
        name="sw_release_wv_updated",
    )
    await db.audit_log.create_index(
        [("sw_release_id", 1), ("ts", -1)],
        name="audit_by_release",
    )
