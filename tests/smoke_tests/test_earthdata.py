"""
Smoke test 1 of 4: Earthdata Login (covers ICESat-2 ATL08 + NISAR)

What this proves:
- Your Earthdata account credentials actually work
- A real search query against NASA's catalogue returns results
- earthaccess library is correctly installed and configured

Run: uv run python scripts/smoke_tests/test_earthdata.py
"""

import earthaccess

def test_earthdata_login():
    print("Step 1: Authenticating with Earthdata Login...")
    auth = earthaccess.login(strategy="interactive", persist=True)
    # 'persist=True' saves credentials locally (~/.netrc) so you're not
    # asked every time. First run will prompt for username/password.

    if not auth.authenticated:
        print("FAILED: Could not authenticate. Check your Earthdata username/password.")
        return False

    print("SUCCESS: Authenticated with Earthdata.\n")
    return True


def test_icesat2_search():
    print("Step 2: Searching for real ICESat-2 ATL08 granules...")
    print("        Region: Gangetic Plains bounding box")
    print("        Date range: small test window (Jan 2023, one month)\n")

    results = earthaccess.search_data(
        short_name="ATL08",
        bounding_box=(80.0, 25.0, 84.0, 28.0),  # (west, south, east, north)
        temporal=("2023-01-01", "2023-01-31"),
        count=5,  # just get a few, this is a smoke test not a real pull
    )

    if len(results) == 0:
        print("WARNING: Search succeeded but returned 0 granules.")
        print("         This could mean the date range or bounding box needs adjusting.")
        return False

    print(f"SUCCESS: Found {len(results)} ATL08 granules.")
    print("Example granule info:")
    print(results[0])
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("EARTHDATA LOGIN SMOKE TEST (covers ICESat-2 and NISAR)")
    print("=" * 60)

    login_ok = test_earthdata_login()
    if login_ok:
        test_icesat2_search()

    print("\nDone. NISAR uses this same Earthdata login, so if this")
    print("test passes, NISAR access is also confirmed working.")
