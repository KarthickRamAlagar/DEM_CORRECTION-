from pathlib import Path

# ---- Folders to create ----
FOLDERS = [
    ".vscode",
    ".github/workflows",
    "src/dem_correction/fetchers",
    "src/dem_correction/processing",
    "src/dem_correction/models",
    "src/dem_correction/storage",
    "src/dem_correction/utils",
    "scripts/smoke_tests",
    "tests/test_fetchers",
    "tests/test_processing",
    "notebooks",
    "data/raw/dem",
    "data/raw/sentinel1",
    "data/raw/sentinel2",
    "data/raw/icesat2",
    "data/interim",
    "data/final",
    "models",
    "reports/figures",
    "docs",
    "logs",
]

# ---- Empty __init__.py files (makes these real Python packages) ----
INIT_FILES = [
    "src/dem_correction/__init__.py",
    "src/dem_correction/fetchers/__init__.py",
    "src/dem_correction/processing/__init__.py",
    "src/dem_correction/models/__init__.py",
    "src/dem_correction/storage/__init__.py",
    "src/dem_correction/utils/__init__.py",
    "tests/__init__.py",
]

# ---- Files with starter content ----
STARTER_FILES = {
    ".env.example": """\
# Copy this file to .env and fill in your real values.
# NEVER commit the real .env file.

EARTHDATA_USERNAME=
EARTHDATA_PASSWORD=

CDSE_CLIENT_ID=
CDSE_CLIENT_SECRET=

BHUVAN_USERNAME=
BHUVAN_PASSWORD=
""",

    ".gitignore": """\
# Environment / secrets
.env

# Data (never commit large/raw data)
data/raw/
data/interim/
data/final/
models/*.pkl
models/*.joblib

# Logs
logs/

# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/

# VS Code (keep settings.json, ignore user-specific)
.vscode/*.log

# Jupyter
.ipynb_checkpoints/
""",

    "docs/decisions_log.md": """\
# Decisions Log

Running record of scope and design decisions made during this project,
for quick reference when your guide asks "why did you choose X."

## Format
- **Date:**
- **Decision:**
- **Reason:**

---

## 2026-08-XX — Study region
- **Decision:** Start with Gangetic Plains only.
- **Reason:** Highest ICESat-2 point density, flattest terrain, easiest
  to debug the pipeline before expanding to Himalaya/Western Ghats.

## 2026-08-XX — Feature set size
- **Decision:** Trim from 55 to ~15-20 core features for the first pass.
- **Reason:** Full 55-feature, 4-region, 8-baseline scope is too large
  for the November deadline; trimmed set is faster to validate and easier
  to defend individually.

## 2026-08-XX — Baseline DEM
- **Decision:** Use both CartoDEM V3 (primary) and Copernicus DEM GLO-30
  (secondary/comparison).
- **Reason:** CartoDEM keeps the ISRO-relevance narrative intact;
  Copernicus DEM proves the method generalizes beyond one DEM source.
""",

    "README.md": """\
# Terrain-Aware Machine Learning Correction of Satellite-Derived DEMs
### Using Multi-Source Remote Sensing Features

## Setup

1. Install dependencies:
   ```
   uv sync
   ```

2. Copy `.env.example` to `.env` and fill in your real credentials.

3. Run smoke tests to confirm all API access works:
   ```
   uv run python scripts/smoke_tests/test_power.py
   uv run python scripts/smoke_tests/test_planetary_computer.py
   uv run python scripts/smoke_tests/test_earthdata.py
   uv run python scripts/smoke_tests/test_bhuvan.py
   ```

## Project Structure

See `docs/` for the full proposal, pitch script, and decisions log.

- `src/dem_correction/fetchers/` — one file per data source
- `src/dem_correction/processing/` — reprojection, feature engineering, merging
- `src/dem_correction/models/` — baselines, ensemble model, validation
- `src/dem_correction/storage/` — data lake + warehouse read/write
- `data/` — local data lake (gitignored, not committed)
- `notebooks/` — exploration only, never production logic
""",

    "Makefile": """\
.PHONY: smoke-test fetch train test

smoke-test:
\tuv run python scripts/smoke_tests/test_power.py
\tuv run python scripts/smoke_tests/test_planetary_computer.py
\tuv run python scripts/smoke_tests/test_earthdata.py
\tuv run python scripts/smoke_tests/test_bhuvan.py

fetch:
\tuv run python scripts/run_pipeline.py

train:
\tuv run python scripts/train_models.py

test:
\tuv run pytest tests/
""",

    "src/dem_correction/config.py": '''\
"""
Central configuration - loaded once, imported everywhere else.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ---- Study region: Gangetic Plains ----
# Format: (west, south, east, north)
STUDY_BBOX = (80.0, 25.0, 84.0, 28.0)

# ---- Date range ----
# ICESat-2 launched Sept 2018, so this is the earliest usable start date
START_DATE = "2018-10-01"
END_DATE = "2026-08-13"

# ---- Paths ----
PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_INTERIM = PROJECT_ROOT / "data" / "interim"
DATA_FINAL = PROJECT_ROOT / "data" / "final"

# ---- Credentials (loaded from .env) ----
EARTHDATA_USERNAME = os.getenv("EARTHDATA_USERNAME")
EARTHDATA_PASSWORD = os.getenv("EARTHDATA_PASSWORD")

CDSE_CLIENT_ID = os.getenv("CDSE_CLIENT_ID")
CDSE_CLIENT_SECRET = os.getenv("CDSE_CLIENT_SECRET")

BHUVAN_USERNAME = os.getenv("BHUVAN_USERNAME")
BHUVAN_PASSWORD = os.getenv("BHUVAN_PASSWORD")


if __name__ == "__main__":
    # Quick self-test: run this file directly to confirm config loads
    print("Study bounding box:", STUDY_BBOX)
    print("Date range:", START_DATE, "to", END_DATE)
    print("Data raw path:", DATA_RAW)
    print("Earthdata username set:", bool(EARTHDATA_USERNAME))
    print("CDSE client ID set:", bool(CDSE_CLIENT_ID))
''',

    ".vscode/settings.json": """\
{
    "python.defaultInterpreterPath": ".venv/Scripts/python.exe",
    "python.testing.pytestEnabled": true,
    "python.testing.pytestArgs": ["tests"],
    "editor.formatOnSave": true,
    "files.exclude": {
        "**/__pycache__": true,
        "**/*.pyc": true
    }
}
""",
}


def create_folders():
    print("Creating folders...")
    for folder in FOLDERS:
        path = Path(folder)
        path.mkdir(parents=True, exist_ok=True)
        print(f"  {path}")


def create_init_files():
    print("\nCreating __init__.py files...")
    for f in INIT_FILES:
        path = Path(f)
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.touch()
            print(f"  {path}")
        else:
            print(f"  {path} (already exists, skipped)")


def create_starter_files():
    print("\nCreating starter files with content...")
    for filepath, content in STARTER_FILES.items():
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(content, encoding="utf-8")
            print(f"  {path}")
        else:
            print(f"  {path} (already exists, skipped)")


if __name__ == "__main__":
    print("=" * 60)
    print("Scaffolding DEM Correction Project Structure")
    print("=" * 60)

    create_folders()
    create_init_files()
    create_starter_files()

    print("\n" + "=" * 60)
    print("Done. Next steps:")
    print("  1. Copy .env.example to .env and fill in real credentials")
    print("  2. Run: uv add earthaccess pystac-client requests python-dotenv rasterio geopandas")
    print("  3. Run: uv run python src/dem_correction/config.py  (confirms config loads)")
    print("=" * 60)
