"""
Smoke test 4 of 4: Bhuvan (CartoDEM V3 + WMS/WMTS boundaries)

IMPORTANT NOTE (read before running):
Bhuvan does not have a clean, modern REST API like the other sources.
This script tests the WMS (Web Map Service) endpoint, which is the
most API-like access point Bhuvan offers. Actual CartoDEM TILE
DOWNLOADS are typically done manually through the Bhuvan web portal,
not through a script.

What this proves:
- Whether the WMS endpoint responds (useful for boundary layers)
- It does NOT fully prove CartoDEM tile downloads work — that
  still needs a manual check in your browser, logged in, actually
  clicking "download" on one tile.

Run: uv run python scripts/smoke_tests/test_bhuvan.py
"""

import requests

# Bhuvan's public WMS endpoint (confirm this matches what's in your
# Bhuvan account dashboard - it can vary by service/layer)
WMS_URL = "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms"


def test_wms_capabilities():
    print("Requesting WMS GetCapabilities from Bhuvan...\n")

    params = {
        "service": "WMS",
        "request": "GetCapabilities",
    }

    try:
        response = requests.get(WMS_URL, params=params, timeout=15)
    except requests.exceptions.RequestException as e:
        print(f"FAILED: Could not reach Bhuvan WMS endpoint. Error: {e}")
        return False

    if response.status_code != 200:
        print(f"FAILED: Status code {response.status_code}")
        return False

    if b"WMS_Capabilities" in response.content or b"WMT_MS_Capabilities" in response.content:
        print("SUCCESS: Bhuvan WMS endpoint responded with valid capabilities XML.")
        print("This confirms boundary/WMS layer access works.")
    else:
        print("WARNING: Got a 200 response but content doesn't look like WMS capabilities.")
        print("First 300 characters of response:")
        print(response.text[:300])
        return False

    return True


if __name__ == "__main__":
    print("=" * 60)
    print("BHUVAN SMOKE TEST (WMS layer check)")
    print("=" * 60)

    test_wms_capabilities()

    print("\n" + "=" * 60)
    print("MANUAL STEP STILL REQUIRED FOR CARTODEM:")
    print("=" * 60)
    print("This script only checks the WMS boundary layer service.")
    print("To confirm CartoDEM tile DOWNLOAD works:")
    print("  1. Log into bhuvan.nrsc.gov.in in your browser")
    print("  2. Navigate to the CartoDEM download section")
    print("  3. Try downloading ONE tile covering your Gangetic Plains bbox")
    print("  4. Confirm a real .tif file saves to your computer")
    print("This manual check cannot be fully automated in this script.")
