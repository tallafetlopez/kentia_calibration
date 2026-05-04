"""
Importa un archivo .DCM a la base de datos de kentia_cal.

NOTA: Este proyecto usa FastAPI + MongoDB (Motor async), no Django.
      Este comando es un script CLI standalone que usa motor síncrono
      (pymongo) para insertar datos, replicando la interfaz de
      `python manage.py import_dcm` de Django.

Uso:
    python -m calibrations.management.commands.import_dcm ruta/archivo.DCM --release-id <id>
    python -m calibrations.management.commands.import_dcm ruta/archivo.DCM --release-name "Release_1D_120KMH"
    python -m calibrations.management.commands.import_dcm ruta/archivo.DCM --release-id <id> --dry-run

O desde la raíz del proyecto:
    python calibrations/management/commands/import_dcm.py HKSW_0A_03_102_00_1D_120KMH_251120.DCM --dry-run
"""

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

# Asegurar que la raíz del proyecto está en sys.path
_ROOT = Path(__file__).resolve().parents[4]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from calibrations.parsers.dcm_parser import DcmParser


# ── Colores ANSI para la salida (equivalen a style.SUCCESS / WARNING) ─────────
_GREEN  = "\033[92m"
_YELLOW = "\033[93m"
_RED    = "\033[91m"
_RESET  = "\033[0m"

def _ok(msg):    return f"{_GREEN}{msg}{_RESET}"
def _warn(msg):  return f"{_YELLOW}{msg}{_RESET}"
def _err(msg):   return f"{_RED}{msg}{_RESET}"


# ── Función principal de importación ─────────────────────────────────────────

def import_dcm(dcm_path: str, release_id: str = None, release_name: str = None,
               dry_run: bool = False, mongo_url: str = None, db_name: str = None):
    """
    Parsea un archivo .DCM e importa su contenido a MongoDB.

    Args:
        dcm_path:     Ruta al archivo .DCM
        release_id:   _id del documento Release en MongoDB (string ObjectId)
        release_name: Nombre del Release (crea si no existe)
        dry_run:      Si True, parsea pero no guarda en DB
        mongo_url:    URL de MongoDB (default: MONGO_URL del .env o localhost)
        db_name:      Nombre de la base de datos (default: DB_NAME del .env o calibrationdb)
    """
    # ── 1. Parsear el archivo ────────────────────────────────────────────────
    print(f"Parseando {dcm_path}...")
    parser = DcmParser()
    dataset = parser.parse(dcm_path)

    print(_ok(
        f"Parse OK — "
        f"{len(dataset.scalars)} escalares, "
        f"{len(dataset.maps)} mapas 2D, "
        f"{len(dataset.curves)} curvas 1D, "
        f"{len(dataset.arrays)} arrays, "
        f"{len(dataset.breakpoints)} ejes"
    ))

    if dataset.parse_errors:
        print(_warn(f"{len(dataset.parse_errors)} errores de parse:"))
        for err in dataset.parse_errors[:10]:
            print(f"  ⚠ {err}")

    if dry_run:
        print(_warn("--dry-run: no se ha guardado nada en la base de datos."))
        return

    # ── 2. Conectar a MongoDB ────────────────────────────────────────────────
    try:
        import pymongo
    except ImportError:
        print(_err("pymongo no instalado. Ejecuta: pip install pymongo"))
        sys.exit(1)

    # Leer configuración del .env si existe
    env_path = _ROOT / "backend" / ".env"
    env = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()

    mongo_url = mongo_url or env.get("MONGO_URL", "mongodb://localhost:27017/")
    db_name   = db_name   or env.get("DB_NAME", "calibrationdb")

    client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    try:
        client.server_info()
    except Exception as exc:
        print(_err(f"No se puede conectar a MongoDB ({mongo_url}): {exc}"))
        sys.exit(1)

    db = client[db_name]

    # ── 3. Obtener o crear el Release ────────────────────────────────────────
    release_doc = None

    if release_id:
        from bson import ObjectId
        try:
            release_doc = db.software_releases.find_one({"_id": ObjectId(release_id)})
        except Exception:
            release_doc = db.software_releases.find_one({"_id": release_id})
        if not release_doc:
            print(_err(f"Release con id='{release_id}' no existe en la base de datos."))
            sys.exit(1)

    elif release_name:
        release_doc = db.software_releases.find_one({"name": release_name})
        if not release_doc:
            now = datetime.now(timezone.utc)
            result = db.software_releases.insert_one({
                "name":        release_name,
                "description": f"Importado desde {Path(dcm_path).name}",
                "version":     dataset.version,
                "created_at":  now,
                "updated_at":  now,
                "status":      "EDIT",
                "labels":      [],
            })
            release_doc = db.software_releases.find_one({"_id": result.inserted_id})
            print(f"Release creado: {release_name} (id={result.inserted_id})")

    else:
        print(_err("Debes especificar --release-id o --release-name"))
        sys.exit(1)

    release_ref_id = release_doc["_id"]

    # ── 4. Importar escalares (FESTWERT → label_type: scalar) ────────────────
    created_count = 0
    updated_count = 0
    now = datetime.now(timezone.utc)

    for name, scalar in dataset.scalars.items():
        doc = {
            "name":        name,
            "description": scalar.description,
            "unit":        scalar.unit,
            "value":       scalar.value,
            "label_type":  "scalar",
            "status":      "EDIT",
            "release_id":  release_ref_id,
            "updated_at":  now,
        }
        result = db.calibration_labels.update_one(
            {"name": name, "release_id": release_ref_id},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if result.upserted_id:
            created_count += 1
        else:
            updated_count += 1

    # ── 5. Importar mapas 2D (GRUPPENKENNFELD → label_type: map2d) ───────────
    for name, map2d in dataset.maps.items():
        doc = {
            "name":        name,
            "description": map2d.description,
            "unit":        map2d.unit_w,
            "label_type":  "map2d",
            "status":      "EDIT",
            "release_id":  release_ref_id,
            "updated_at":  now,
            "value": {
                "rows":   map2d.axis_y,
                "cols":   map2d.axis_x,
                "data":   map2d.data,
                "unit_x": map2d.unit_x,
                "unit_y": map2d.unit_y,
            },
        }
        result = db.calibration_labels.update_one(
            {"name": name, "release_id": release_ref_id},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if result.upserted_id:
            created_count += 1
        else:
            updated_count += 1

    # ── 6. Importar curvas 1D (GRUPPENKENNLINIE → label_type: curve1d) ───────
    for name, curve in dataset.curves.items():
        doc = {
            "name":        name,
            "description": curve.description,
            "unit":        curve.unit_w,
            "label_type":  "curve1d",
            "status":      "EDIT",
            "release_id":  release_ref_id,
            "updated_at":  now,
            "value": {
                "axis_x":     curve.axis_x,
                "values":     curve.values,
                "unit_x":     curve.unit_x,
                "axis_x_ref": curve.axis_x_ref,
            },
        }
        result = db.calibration_labels.update_one(
            {"name": name, "release_id": release_ref_id},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if result.upserted_id:
            created_count += 1
        else:
            updated_count += 1

    # ── 7. Importar arrays 1D (FESTWERTEBLOCK → label_type: array1d) ─────────
    for name, arr in dataset.arrays.items():
        doc = {
            "name":        name,
            "description": arr.description,
            "unit":        arr.unit,
            "label_type":  "array1d",
            "status":      "EDIT",
            "release_id":  release_ref_id,
            "updated_at":  now,
            "value":       arr.values,
        }
        result = db.calibration_labels.update_one(
            {"name": name, "release_id": release_ref_id},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if result.upserted_id:
            created_count += 1
        else:
            updated_count += 1

    client.close()
    print(_ok(
        f"Importación completada: {created_count} creados, {updated_count} actualizados "
        f"(release: {release_doc.get('name', release_ref_id)})"
    ))


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Importa un archivo DAMOS .DCM a MongoDB (kentia_cal)"
    )
    ap.add_argument("dcm_file",       type=str, help="Ruta al archivo .DCM")
    ap.add_argument("--release-id",   type=str, help="_id del Release en MongoDB")
    ap.add_argument("--release-name", type=str, help="Nombre del Release (crea si no existe)")
    ap.add_argument("--dry-run",      action="store_true", help="Parsea pero no guarda en DB")
    ap.add_argument("--mongo-url",    type=str, help="URL de MongoDB (sobreescribe .env)")
    ap.add_argument("--db-name",      type=str, help="Nombre de la base de datos")
    args = ap.parse_args()

    import_dcm(
        dcm_path=args.dcm_file,
        release_id=args.release_id,
        release_name=args.release_name,
        dry_run=args.dry_run,
        mongo_url=args.mongo_url,
        db_name=args.db_name,
    )


if __name__ == "__main__":
    main()
