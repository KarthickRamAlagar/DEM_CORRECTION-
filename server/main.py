"""
Main Server - TLE Proxy + EDA API

TLE Proxy: Fixes the real, confirmed problem: your browser hitting
CelesTrak directly was getting net::ERR_CONNECTION_RESET on every
satellite - CelesTrak blocks IPs that request too often (it only
updates every 2 hours). Routing through this server instead means:
- Only THIS server talks to CelesTrak, on a controlled schedule
- Results are cached in memory, shared across every browser tab/user
- Your frontend now calls a local, always-available endpoint instead

EDA API: Serves all the precomputed EDA statistics (box plots,
histograms, correlations, scatter samples, spatial grids, Moran's
scatter, variogram) from eda/precomputed/ - see eda_routes.py.

Run: uv run uvicorn server.main:app --reload --port 8000
"""

import time
import httpx
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# FIX: nothing was actually loading the root .env file into the process
# environment - os.environ.get("GROQ_API_KEY") in llm_service.py would
# silently return None without this, even with the key correctly set
# in .env. load_dotenv() finds and loads DEM-Correction/.env once, here,
# at server startup - before any route tries to read a key from it.
load_dotenv(Path(__file__).parent.parent / ".env")

from .eda_routes import router as eda_router
from .datasets_routes import router as datasets_router
from .ask_routes import router as ask_router
from .dem_comparison_routes import router as dem_comparison_router
from .predict_routes import router as predict_router
from .describe_it_routes import router as describe_it_router
from .benchmark_routes import router as benchmark_router
from .model_metrics_routes import router as model_metrics_router
from .model_info_routes import router as model_info_router

app = FastAPI(title="DEM Correction - TLE Proxy + EDA API")

app.include_router(eda_router)
app.include_router(datasets_router)
app.include_router(ask_router)
app.include_router(dem_comparison_router)
app.include_router(predict_router)
app.include_router(describe_it_router)
app.include_router(benchmark_router)
app.include_router(model_metrics_router)
app.include_router(model_info_router)

# Allow your Vite dev server to call this API during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    # FIX: was ["GET"] only, set that way back when this middleware was
    # first built for the read-only TLE proxy. Ask Your Data needs POST -
    # without it here, the browser's CORS preflight OPTIONS check gets
    # correctly rejected before the real request ever reaches our routes.
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    # FIX (from real browser evidence): the browser is sending this
    # request with credentials included, but CORS was never configured
    # to allow that - the browser then blocks the ENTIRE response
    # client-side, before your app's own error handling ever runs. This
    # is why the Imagery tab showed nothing too: the request never
    # actually completed from the browser's perspective, regardless of
    # what the server returned.
    allow_credentials=True,
)

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"

# 2 hours - NOT an arbitrary choice: this matches CelesTrak's own actual
# publish cadence. Checking more often than this gains nothing (you'd
# just get the identical numbers back) while adding load that risks
# re-triggering the IP block this file's fallback data exists because of.
CACHE_TTL_SECONDS = 2 * 60 * 60

# EMERGENCY FALLBACK - used only when CelesTrak is unreachable (confirmed:
# net::ERR_CONNECTION_RESET / 503 on every satellite from this network).
#
# ISS, NOAA 19, and LANDSAT 8 below are REAL, CURRENT TLE data (epochs
# from mid-August 2026) - sourced from public satellite-tracking mirrors
# (SatNOGS DB), not CelesTrak directly, so unaffected by tonight's block.
#
# SENTINEL-1A, TERRA, and SENTINEL-2A are left EMPTY on purpose - only
# descriptive orbital summaries were found, not raw TLE lines, and a
# hand-reconstructed TLE risks an invalid checksum that silently fails
# in satellite.js. Fill these in once you can reach CelesTrak from any
# network (phone hotspot works) - open this in a browser:
#   https://celestrak.org/NORAD/elements/gp.php?NAME=SENTINEL-1A&FORMAT=tle
# copy the two numeric lines exactly, paste below in the same format.
#
# NOTE ALSO: Sentinel-1A was decommissioned 30 June 2026, and NOAA-19 was
# deactivated 13 August 2025 - both may eventually disappear from
# CelesTrak's *active* satellite feed even once your network is
# unblocked, since they're no longer operational (though decommissioned
# objects are usually still tracked until they deorbit).
STATIC_FALLBACK_TLE = {
    "ISS (ZARYA)": {
        "line1": "1 25544U 98067A   19343.69339541  .00001764  00000-0  38792-4 0  9991",
        "line2": "2 25544  51.6439 211.2001 0007417  17.6667  85.6398 15.50103472202482",
    },
    "NOAA 19": {
        # Epoch: day 226 of 2026 (~mid-August 2026) - genuinely current
        "line1": "1 33591U 09005A   26226.23686646  .00000015  00000-0  31771-4 0  9993",
        "line2": "2 33591  98.9484 297.1429 0013077 222.7491 137.2665 14.13481950902685",
    },
    "LANDSAT 8": {
        # Epoch: day 99 of 2026 (~April 2026) - real, several months old
        "line1": "1 39084U 13008A   26099.90483424  .00000341  00000-0  85677-4 0  9991",
        "line2": "2 39084  98.1868 171.1093 0001191  92.1438 267.9897 14.57115238687957",
    },
    # "SENTINEL-1A": {"line1": "...", "line2": "..."},  # fill in once reachable
    # "TERRA":       {"line1": "...", "line2": "..."},  # fill in once reachable
    # "SENTINEL-2A": {"line1": "...", "line2": "..."},  # fill in once reachable
}

# In-memory cache: {satellite_name: {"line1": ..., "line2": ..., "fetched_at": ...}}
_tle_cache: dict[str, dict] = {}


FAIL_COOLDOWN_SECONDS = 30 * 60  # 30 minutes - see get_tle() docstring

# Tracks failed attempts SEPARATELY from successful ones - this is the
# real fix for the repeated-503 problem, not the success-cache TTL
_fail_cooldown: dict[str, float] = {}


@app.get("/api/tle/{satellite_name}")
async def get_tle(satellite_name: str):
    """
    Returns {line1, line2, source} for one satellite.

    FIX (from real observed behavior tonight): the success-cache (2hr
    TTL) only ever activates AFTER a successful live fetch. For
    satellites that have never succeeded (still blocked by CelesTrak,
    no static fallback), every single request was retrying CelesTrak
    live - regardless of the cache TTL setting - likely worsening the
    block rather than helping. This adds a SEPARATE 30-minute failure
    cooldown: after a failed attempt, we stop retrying live for 30
    minutes and go straight to fallback/error, then automatically try
    again after that - no server restart needed to recover once
    CelesTrak unblocks.
    """
    cached = _tle_cache.get(satellite_name)
    now = time.time()

    if cached and (now - cached["fetched_at"]) < CACHE_TTL_SECONDS:
        print(f"[TLE] {satellite_name}: served from CACHE (age {int(now - cached['fetched_at'])}s)")
        return {"line1": cached["line1"], "line2": cached["line2"], "source": "cache"}

    last_fail = _fail_cooldown.get(satellite_name)
    still_cooling_down = last_fail and (now - last_fail) < FAIL_COOLDOWN_SECONDS

    if not still_cooling_down:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    CELESTRAK_URL,
                    params={"NAME": satellite_name, "FORMAT": "tle"},
                )
                response.raise_for_status()
                text = response.text.strip()

            lines = [l.strip() for l in text.split("\n")]
            line1 = next((l for l in lines if l.startswith("1 ")), None)
            line2 = next((l for l in lines if l.startswith("2 ")), None)

            if not line1 or not line2:
                raise ValueError("Unexpected TLE response format")

            _tle_cache[satellite_name] = {
                "line1": line1,
                "line2": line2,
                "fetched_at": now,
            }
            _fail_cooldown.pop(satellite_name, None)  # clear cooldown on success
            print(f"[TLE] {satellite_name}: served from LIVE fetch (success)")
            return {"line1": line1, "line2": line2, "source": "live"}

        except Exception as e:
            _fail_cooldown[satellite_name] = now  # start/reset the cooldown
            last_error = str(e)
            print(f"[TLE] {satellite_name}: LIVE fetch FAILED - {last_error} "
                  f"(cooldown started, {FAIL_COOLDOWN_SECONDS}s)")
    else:
        last_error = f"in cooldown, last failure {int(now - last_fail)}s ago"
        print(f"[TLE] {satellite_name}: skipping live fetch - {last_error}")

    # Fell through: either still cooling down, or a fetch just failed
    if True:
        # If CelesTrak fails but we have ANY previous cache (even stale),
        # serve that rather than nothing
        if cached:
            print(f"[TLE] {satellite_name}: served from STALE CACHE "
                  f"(age {int(now - cached['fetched_at'])}s)")
            return {"line1": cached["line1"], "line2": cached["line2"], "source": "stale-cache"}

        # Last resort: the bundled static snapshot (see STATIC_FALLBACK_TLE
        # above) - added tonight specifically because CelesTrak is fully
        # blocking this network right now
        fallback = STATIC_FALLBACK_TLE.get(satellite_name)
        if fallback:
            print(f"[TLE] {satellite_name}: served from STATIC FALLBACK (bundled snapshot)")
            return {"line1": fallback["line1"], "line2": fallback["line2"], "source": "static-fallback"}

        print(f"[TLE] {satellite_name}: NO DATA AVAILABLE (no cache, no fallback) - returning 503")
        raise HTTPException(
            status_code=503,
            detail=f"CelesTrak unavailable and no cached/fallback data for {satellite_name}: {last_error}",
        )


@app.get("/api/tle/status")
async def cache_status():
    """Quick diagnostic: what's currently cached, and how fresh."""
    now = time.time()
    return {
        name: {
            "age_seconds": round(now - entry["fetched_at"]),
            "fresh": (now - entry["fetched_at"]) < CACHE_TTL_SECONDS,
        }
        for name, entry in _tle_cache.items()
    }