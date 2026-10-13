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
