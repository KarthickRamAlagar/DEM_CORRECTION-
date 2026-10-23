"""GET /api/sdg/version: the code commit and model version recorded by etl/lineage/build_manifest.py, for the PDF report footer.
Reads data/processed/sdg/lineage/manifest.json only. Nothing is guessed: if the manifest or a field is missing the value is null and the report prints "No data"."""
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()
MANIFEST = Path(__file__).resolve().parent.parent / "data" / "processed" / "sdg" / "lineage" / "manifest.json"


@router.get("/version")
def version():
    out = {"git_commit": None, "git_branch": None, "uncommitted_files": None, "model_version": None, "model_created_utc": None, "manifest_created_utc": None}
    try:
        m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except Exception:
        return out
    code, model = (m.get("code") or {}), (m.get("model") or {})
    out.update({"git_commit": code.get("git_commit"), "git_branch": code.get("git_branch"), "uncommitted_files": code.get("git_uncommitted_files"),
                "model_version": model.get("model_version"), "model_created_utc": model.get("created_utc"), "manifest_created_utc": m.get("created_utc")})
    return out
