"""
Limpia archivos huérfanos en backend/uploads/ que no están referenciados
por ningún SW Release activo en la base de datos.

Uso:
    python scripts/clean_duplicate_uploads.py           # dry-run (solo muestra)
    python scripts/clean_duplicate_uploads.py --delete  # borra los huérfanos
"""
import asyncio
import sys
from pathlib import Path

# Allow running from repo root or from backend/
_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv
load_dotenv(_BACKEND / ".env")

import os
from motor.motor_asyncio import AsyncIOMotorClient


async def main(delete: bool = False):
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name   = os.environ.get("DB_NAME",   "calibration_db")
    client    = AsyncIOMotorClient(mongo_url)
    db        = client[db_name]

    # 1) Collect paths referenced by active SW releases
    active_paths: set[str] = set()
    async for sr in db.sw_releases.find({}):
        for key in ("a2l_path", "dcm_path"):
            p = sr.get(key)
            if p:
                active_paths.add(str(Path(p).resolve()))

    print(f"Active paths in DB: {len(active_paths)}")

    # 2) Walk uploads/
    uploads_dir = _BACKEND / "uploads"
    all_files   = list(uploads_dir.rglob("*.a2l")) + \
                  list(uploads_dir.rglob("*.A2L")) + \
                  list(uploads_dir.rglob("*.dcm")) + \
                  list(uploads_dir.rglob("*.DCM"))

    orphans = [f for f in all_files if str(f.resolve()) not in active_paths]

    if not orphans:
        print("No orphan files found.")
        client.close()
        return

    print(f"\n{'WOULD DELETE' if not delete else 'DELETING'} {len(orphans)} orphan file(s):")
    for f in orphans:
        size_kb = f.stat().st_size // 1024
        print(f"  {'DELETE' if delete else 'DRY-RUN'}  {f.name}  ({size_kb} KB)")
        if delete:
            f.unlink()

    if not delete:
        print("\nRun with --delete to actually remove them.")

    client.close()


if __name__ == "__main__":
    delete_flag = "--delete" in sys.argv
    asyncio.run(main(delete=delete_flag))
