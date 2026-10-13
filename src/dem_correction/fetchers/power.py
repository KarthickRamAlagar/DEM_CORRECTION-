"""
NASA POWER Fetcher

Reusable functions for pulling humidity and pressure - the two
environmental features from the feature matrix (Section 9E) that
come from an external source rather than being computed locally.
"""

import requests
import pandas as pd

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"


def get_environmental_data(lat, lon, date):
    """
    Get relative humidity and surface pressure for one point/date.
    date format: YYYYMMDD (e.g., "20230115")
    """
    params = {
        "parameters": "RH2M,PS",
        "community": "AG",
        "longitude": lon,
        "latitude": lat,
        "start": date,
        "end": date,
        "format": "JSON",
    }

    response = requests.get(POWER_URL, params=params)
    response.raise_for_status()
    data = response.json()

    humidity = data["properties"]["parameter"]["RH2M"][date]
    pressure = data["properties"]["parameter"]["PS"][date]

    return {"relative_humidity_pct": humidity, "atmospheric_pressure_kpa": pressure}


def get_environmental_data_batch(points_df, lat_col="latitude", lon_col="longitude", date_col="date"):
    """
    Get environmental data for many points at once (e.g., your ICESat-2
    points table). date_col values should be in YYYYMMDD format.

    NOTE: NASA POWER's point API is one point at a time - for a large
    points table, this loops with a small delay to be polite to the API.
    For your ~500-600 granules worth of ICESat-2 points, batch by unique
    (lat, lon, date) combinations rather than every single row, since
    many points will share a date.
    """
    import time

    results = []
    unique_queries = points_df[[lat_col, lon_col, date_col]].drop_duplicates()

    print(f"Fetching environmental data for {len(unique_queries)} unique point/date combinations...")

    for i, row in enumerate(unique_queries.itertuples(index=False), start=1):
        lat, lon, date = getattr(row, lat_col), getattr(row, lon_col), getattr(row, date_col)
        try:
            env_data = get_environmental_data(lat, lon, date)
            results.append({lat_col: lat, lon_col: lon, date_col: date, **env_data})
        except Exception as e:
            print(f"  Failed for ({lat}, {lon}, {date}): {e}")

        if i % 50 == 0:
            print(f"  {i}/{len(unique_queries)} done")
        time.sleep(0.1)  # be polite to the API

    return pd.DataFrame(results)