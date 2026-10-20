# External data status (re-fetch after the data-loss incident)

Recorded 19 Oct 2026 from `check_external.py` and terminal output run by Karthi on his own machine. Labels: **Verified** = printed by a check today. **Partial** = present but known gaps. **Not found** = no open source found. **Planned** = not started.

Fetch box (covers Pilots A, B and C): West 81.9, South 25.4, East 84.1, North 28.1. This is wider than the Pilot A box in `phase1-fetch-list.md`.

## Phase 1 items (data)

| # | Layer | Result | Status |
|---|---|---|---|
| 2 | GFM flood maps (flood extent, exclusion mask, advisory flags) | 17,281 of 17,512 files. 231 missing: 229 `ADVFLAG` files and 2 `ENSEMBLE_EXCLAYER` files (2024-08-19) return 404 on the server. | Partial, permanent server gaps |
| 3 | WorldPop 2020 constrained | India and Nepal rasters open correctly | Verified |
| 4 | Buildings (VIDA) | 99 pieces each for India and Nepal. India: 86 pieces with buildings, 22,924,389 rows. Nepal: 26 pieces with buildings, 1,678,436 rows. Empty pieces are expected: each country run keeps only that country's buildings. | Verified |
| 5 | WorldCover 2021 | Tiles N24E081 and N27E081 open correctly (36000 x 36000). Cropland class 40 not yet checked. | Verified (tiles); class code From memory |
| 6 | OSM (roads, schools, hospitals, waterways) | 30 of 30 pieces. Schools and clinics are thin, so counts must say "mapped in OpenStreetMap". | Verified, thin coverage |
| 7 | Boundaries (geoBoundaries) | India 735 features, Nepal 75 features | Verified |
| 9 | Rainfall (CHIRPS 2.0 daily, June-October 2019-2025) | 1,071 of 1,071 files | Verified |

## Phase 3 items (SDG exposure and recovery need)

| Layer | Result | Status |
|---|---|---|
| Relief norms (India, MHA SDRF/NDRF PDF) | Real PDF; date and 2026-27 revision not yet checked | Verified (file); currency Not verified |
| Crops (India Data Portal APY) | 455,359 rows | Verified |
| Health facilities (data.gov.in NIN) | 192,905 rows (exact, counted with pandas) | Verified |
| Nepal crops, Nepal relief norms, Nepal health | No open source found | Not found |

## Not external (come from our own pipeline)

- Raw and corrected DEM rasters (item 1) and rivers/HAND (item 8): need the ETL rebuild. The recovered rasters were garbage and are being quarantined.

## Known limits to write in the report

- GFM gaps above; anomaly-flag rule (41% of items carry `anomaly_detected = True`) undecided.
- OSM schools and clinics thin.
- Nepal crops, norms and health missing; Nepal health only has an old 2015 list.
- Health data is a 2019 snapshot (date to confirm).
- 735 vs 736 India boundary features not explained.