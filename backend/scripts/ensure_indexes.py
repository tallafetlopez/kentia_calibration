"""Idempotent index creation. Called at server startup."""
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

_log = logging.getLogger(__name__)

_INDEXES = [
    ("label_metadata",       [("sw_release_id", 1), ("label_name", 1)],  {"unique": True,  "name": "sw_release_label_unique"}),
    ("label_metadata",       [("sw_release_id", 1), ("updated_at", -1)], {"name": "sw_release_updated"}),
    ("label_working_values", [("sw_release_id", 1), ("label_name", 1)],  {"unique": True,  "name": "sw_release_label_wv_unique"}),
    ("label_working_values", [("sw_release_id", 1), ("modified", 1)],    {"name": "sw_release_modified_lookup"}),
    ("label_working_values", [("sw_release_id", 1), ("updated_at", -1)], {"name": "sw_release_wv_updated"}),
    ("audit_log",            [("sw_release_id", 1), ("ts", -1)],         {"name": "audit_by_release"}),
]


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    for collection_name, key, opts in _INDEXES:
        try:
            await db[collection_name].create_index(key, **opts)
        except OperationFailure as e:
            if e.code == 85:
                # IndexOptionsConflict: same key already exists under a different name.
                # The index is functionally present; log and skip.
                _log.warning(
                    "ensure_indexes: %s key %s already exists with different name — skipping. (%s)",
                    collection_name, key, e
                )
            else:
                raise
