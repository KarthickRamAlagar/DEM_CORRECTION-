"""
Smoke test 3 of 4: NASA POWER API (humidity, pressure)

What this proves:
- No signup needed, confirms the endpoint responds
- Confirms real humidity/pressure values come back for a test point

Run: uv run python scripts/smoke_tests/test_power.py
"""

import requests

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"

# Test point: somewhere in the Gangetic Plains
TEST_LAT = 26.5
TEST_LON = 82.0
TEST_DATE = "20230115"  # NASA POWER wants YYYYMMDD format


def test_power_api():
    print(f"Requesting weather data for lat={TEST_LAT}, lon={TEST_LON}, date={TEST_DATE}...\n")

    params = {
        "parameters": "RH2M,PS",  # RH2M = relative humidity, PS = surface pressure
        "community": "AG",
        "longitude": TEST_LON,
        "latitude": TEST_LAT,
        "start": TEST_DATE,
        "end": TEST_DATE,
        "format": "JSON",
    }

    response = requests.get(POWER_URL, params=params)

    if response.status_code != 200:
        print(f"FAILED: Status code {response.status_code}")
        print(response.text)
        return False

    data = response.json()
    try:
        humidity = data["properties"]["parameter"]["RH2M"][TEST_DATE]
        pressure = data["properties"]["parameter"]["PS"][TEST_DATE]
    except KeyError:
        print("FAILED: Response format was unexpected.")
        print(data)
        return False

    print("SUCCESS: NASA POWER returned real values.")
    print(f"  Relative Humidity (RH2M): {humidity} %")
    print(f"  Surface Pressure (PS):    {pressure} kPa")
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("NASA POWER API SMOKE TEST")
    print("=" * 60)
    test_power_api()
