"""No-op stub — indexes are created in db/_init_schema() at startup."""
import logging

_log = logging.getLogger(__name__)


async def ensure_indexes(db=None) -> None:
    _log.debug("ensure_indexes: indexes managed by db/_init_schema, nothing to do")
