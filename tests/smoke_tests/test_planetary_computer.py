"""
Smoke test 2 of 4: Microsoft Planetary Computer STAC API
(covers Copernicus DEM GLO-30, Sentinel-1 GRD, Sentinel-2 L2A)

What this proves:
- No signup needed, but confirms the STAC endpoint is reachable
- Confirms each of the 3 collections actually returns real items
  for your study region

Run: uv run python scripts/smoke_tests/test_planetary_computer.py
"""

from pystac_client import Client

CATALOG_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"

# Gangetic Plains bounding box: (west, south, east, north)
BBOX = [80.0, 25.0, 84.0, 28.0]


def test_collection(catalog, collection_id, date_range):
    print(f"\nSearching collection: {collection_id}")
    search = catalog.search(
        collections=[collection_id],
        bbox=BBOX,
        datetime=date_range,
        max_items=3,
    )
    items = list(search.items())

    if len(items) == 0:
        print(f"WARNING: 0 items found for {collection_id}. "
              f"Try widening the date range or checking the collection ID.")
        return False

    print(f"SUCCESS: Found {len(items)} item(s) for {collection_id}.")
    print(f"Example item ID: {items[0].id}")
    print(f"Example item date: {items[0].datetime}")
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("PLANETARY COMPUTER SMOKE TEST")
    print("(Copernicus DEM + Sentinel-1 GRD + Sentinel-2 L2A)")
    print("=" * 60)

    catalog = Client.open(CATALOG_URL)
    print("Connected to Planetary Computer STAC catalog.\n")

    # Copernicus DEM has no time dimension, so date range is ignored for it
    test_collection(catalog, "cop-dem-glo-30", None)

    # Sentinel-1 GRD and Sentinel-2 need a real date range
    test_collection(catalog, "sentinel-1-grd", "2023-01-01/2023-01-31")
    test_collection(catalog, "sentinel-2-l2a", "2023-01-01/2023-01-31")

    print("\nDone. If all three show SUCCESS, Planetary Computer access")
    print("is fully confirmed for 3 of your 4 core datasets.")
