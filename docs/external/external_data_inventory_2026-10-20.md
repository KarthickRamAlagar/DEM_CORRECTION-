# External data on disk - inventory, 20 Oct 2026

Counted from ls/du/find output in data/external. Pilot box for most layers: West 81.9, South 25.4, East 84.1, North 28.1 (includes only Nepal's southern strip). data/external/MANIFEST.json lists 14 dataset folders (built 20 Oct).

| Folder (data/external/...) | Country | Files / size | Notes |
|---|---|---|---|
| boundaries/geoboundaries | IND + NPL | 3 files, 47 MB | India 735, Nepal 75 features |
| buildings/vida | IND | 100 files, 2.0 GB | 86 non-empty pieces, 22.9M rows |
| buildings/vida_npl | NPL | 100 files, 147 MB | 26 non-empty pieces, 1.68M rows |
| population/worldpop | IND + NPL | 2 rasters (753 MB + 31 MB) | WorldPop R2024B v1 constrained 100 m; original link not kept |
| landcover/worldcover | IND + NPL (pilot tiles) | 2 tiles, 221 MB | |
| flood_observed/gfm | pilot box | 17,283 files, 16 GB | 231 permanent server 404s |
| rainfall/chirps | pilot box | 1,071 files, 3.5 GB | no SOURCE.json yet |
| osm | pilot box | 31 entries, 64 MB | thin schools/clinics |
| crops/apy | IND | 2 files, 55 MB | 455,359 rows |
| health_facilities | IND | 27 MB | 192,905 rows (data.gov.in NIN) |
| costs_norms/MHA_SDRF_NDRF_norms_2022-26.pdf | IND | 602 KB | currency of 2026-27 revision not verified |
| crops/nepal_opendatanepal | NPL | 11 files, 47 KB | cereal district table 2014/15; labels wrong in 2 rows (row 5 = Maize Area, row 8 = Millet Area) |
| crops/nepal_moald_statbook | NPL | EMPTY | 3 PDF links fail; not required |
| health/nepal_hdx | NPL | OSM health facilities (7,313 features, 868 inside pilot box) + DoH/WHO list | 5 identical misnamed copies moved to _duplicates/ |
| costs_norms/nepal_moha_standard | NPL | 1 PDF, 4.98 MB | see nepal_relief_norms_2077.md |

Sized total about 22.7 GB (GFM + rainfall = 19.5 GB).

## Open
- ICIMOD district cereal tables not downloaded (optional).
- SOURCE.json missing for rainfall/chirps.
- Folder names differ: India health in health_facilities/, Nepal in health/nepal_hdx.
- Nepal crop data is 2014/15; India APY is later.
- Recent MoALD statistics books could not be downloaded.
