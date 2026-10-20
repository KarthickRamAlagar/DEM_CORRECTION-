"""
datasets_sdg.py - SDG-exposure datasets for the Datasets page (India and Nepal).

Only layers that are really on disk in data/external are listed (fetched 18-20 Oct 2026).
Counts are a SNAPSHOT from the fetch checks (rows/files), written here as text; sizes are
measured from disk when the server starts. Nothing planned or missing is shown as real.
Field shape matches the four model-input datasets in datasets_routes.py.
"""
from pathlib import Path

PILOT = "Fetch box 81.9-84.1 E, 25.4-28.1 N (includes Nepal's southern strip only)"
SNAP = "Counts are a snapshot from the 20 Oct 2026 fetch checks."


def _size_label(path):
    path = Path(path)
    if not path.exists():
        return "0 MB"
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    if total >= 1e9:
        return f"{total / 1e9:.2f} GB"
    if total >= 1e6:
        return f"{total / 1e6:.0f} MB"
    return f"{max(total / 1e3, 1):.0f} KB"


def _entry(i, name, sub, typ, country, provider, rows, size, crs, res, lic, desc, bbox, dates, tags, schema, n_files, org=None):
    return {
        "id": i, "name": name, "subtitle": sub, "type": typ, "provider": provider, "rows": rows,
        "sizeGB": size, "crs": crs, "status": "healthy", "updated": "2026-10-20", "created": "2026-10-18",
        "resolution": res, "license": lic,
        "author": {"name": provider, "organization": org or provider, "description": f"Original provider of {name}."},
        "description": f"{desc} {SNAP}", "boundingBox": bbox, "dateRange": dates, "tags": tags + ["sdg", "real-data"],
        "schema": schema, "granules": [], "granuleCount": n_files,
        "country": country, "use": "sdg", "coverage": bbox,
    }


def build_sdg_datasets(ext):
    ext = Path(ext)
    d = {}
    d["worldpop-2020"] = _entry("worldpop-2020", "WorldPop 2020 Population", "Constrained 100 m, India and Nepal (real, fetched)", "Raster", "IND+NPL",
        "WorldPop, University of Southampton", "2 rasters (India, Nepal)", _size_label(ext / "population"), "EPSG:4326", "100 m",
        "CC BY 4.0 (WorldPop standard; not checked for release R2024B)",
        "Modelled people per grid cell for 2020 (release R2024B v1, constrained). A modelled estimate, not a census count. Used for people exposed to flood.",
        "Whole-country rasters for India and Nepal", "2020", ["population", "exposure"], [{"name": "population", "type": "Float32", "unit": "people per cell"}], 2)
    d["buildings-ind"] = _entry("buildings-ind", "Open Buildings - India", "VIDA Google + Microsoft footprints (real, fetched)", "Vector", "IND",
        "VIDA / Source Cooperative", "22,924,389 footprints (86 non-empty pieces)", _size_label(ext / "buildings" / "vida"), "EPSG:4326", "Building footprint",
        "ODbL", "Building footprints for the fetch area, one GeoParquet piece per grid cell. Footprints show buildings, not damage.",
        PILOT, "Version 2.0 (Sep 2024)", ["buildings", "exposure"], [{"name": "geometry", "type": "Polygon", "unit": "-"}], 100)
    d["buildings-npl"] = _entry("buildings-npl", "Open Buildings - Nepal", "VIDA Google + Microsoft footprints (real, fetched)", "Vector", "NPL",
        "VIDA / Source Cooperative", "1,678,436 footprints (26 non-empty pieces)", _size_label(ext / "buildings" / "vida_npl"), "EPSG:4326", "Building footprint",
        "ODbL", "Building footprints for Nepal's part of the fetch area. Footprints show buildings, not damage.",
        PILOT, "Version 2.0 (Sep 2024)", ["buildings", "exposure"], [{"name": "geometry", "type": "Polygon", "unit": "-"}], 100)
    d["worldcover-2021"] = _entry("worldcover-2021", "ESA WorldCover 2021", "Land cover incl. cropland, 10 m (real, fetched)", "Raster", "IND+NPL",
        "ESA", "2 tiles (N24E081, N27E081)", _size_label(ext / "landcover"), "EPSG:4326", "10 m", "CC BY 4.0",
        "Land cover classes (cropland is class 40). No crop type, season or yield.", "Tiles N24E081 and N27E081 (24-30 N, 81-84 E)", "2021", ["landcover", "cropland"],
        [{"name": "land_cover_class", "type": "UInt8", "unit": "class code"}], 2)
    d["gfm-flood"] = _entry("gfm-flood", "Copernicus GFM Flood Maps", "Observed flood extent, 20 m (real, fetched, partial)", "Raster", "IND+NPL",
        "Copernicus / EODC", "17,281 of 17,512 files", _size_label(ext / "flood_observed"), "Equi7 grid (per tile)", "20 m", "Free (terms not checked)",
        "Observed flood extent, exclusion mask and advisory flags. PARTIAL: 231 files (229 advisory flags, 2 exclusion layers) return 404 on the server and cannot be fetched. Weak under dense vegetation, in urban areas and on flat sand.",
        PILOT, "2019-2026, June-October", ["flood", "observed", "partial-coverage"], [{"name": "flood_extent", "type": "UInt8", "unit": "0/1/255"}], 17281)
    d["chirps-rain"] = _entry("chirps-rain", "CHIRPS Daily Rainfall", "June-October 2019-2025 (real, fetched)", "Raster", "IND+NPL",
        "UCSB Climate Hazards Center", "1,071 daily files", _size_label(ext / "rainfall"), "EPSG:4326", "0.05 deg (about 5 km)", "Open (terms not checked)",
        "Daily rainfall estimates for flood-event context.", PILOT, "2019-06-01 -> 2025-10-31 (June-October only)", ["rainfall", "climate"],
        [{"name": "precip", "type": "Float32", "unit": "mm/day"}], 1071)
    d["osm-pilot"] = _entry("osm-pilot", "OpenStreetMap Features", "Roads, schools, hospitals, waterways (real, fetched)", "Vector", "IND+NPL",
        "OpenStreetMap contributors", "30 tile files", _size_label(ext / "osm"), "EPSG:4326", "Vector features", "ODbL",
        "Mapped roads, schools, hospitals and waterways. Schools and clinics are thin, so counts must be called 'mapped in OpenStreetMap'.",
        PILOT, "Snapshot of 19 Oct 2026", ["osm", "infrastructure", "thin-coverage"], [{"name": "feature", "type": "GeoJSON", "unit": "-"}], 30)
    d["boundaries-geo"] = _entry("boundaries-geo", "geoBoundaries Districts", "District boundaries, India 735 and Nepal 75 (real, fetched)", "Vector", "IND+NPL",
        "geoBoundaries", "735 India + 75 Nepal features", _size_label(ext / "boundaries"), "EPSG:4326", "District polygons", "Open (terms not checked)",
        "District boundary polygons used to join crop, health and relief figures. The India count of 735 versus 736 is not explained.",
        "India and Nepal", "Current release", ["boundaries", "districts"], [{"name": "district", "type": "String", "unit": "-"}], 2)
    d["crops-ind"] = _entry("crops-ind", "India District Crops (APY)", "Area, production, yield (real, fetched)", "Table", "IND",
        "India Data Portal / Directorate of Economics and Statistics, MoA&FW", "455,359 rows", _size_label(ext / "crops" / "apy"), "n/a", "District level",
        "ODC Attribution", "District crop table: area, production and yield by crop, season and year.", "India districts", "As published on the portal",
        ["crops", "exposure"], [{"name": "area", "type": "Float", "unit": "ha"}, {"name": "production", "type": "Float", "unit": "tonnes"}], 2)
    d["health-ind"] = _entry("health-ind", "India Health Facilities", "NIN facility list (real, fetched)", "Table", "IND",
        "data.gov.in", "192,905 rows", _size_label(ext / "health_facilities"), "n/a", "Facility records",
        "data.gov.in terms (not checked)", "Facility list, a 2019-era snapshot (date to confirm).", "India", "2019 snapshot", ["health", "facilities"],
        [{"name": "facility", "type": "String", "unit": "-"}], 2)
    d["norms-ind"] = _entry("norms-ind", "India Relief Norms (SDRF/NDRF)", "MHA norms PDF, 2022-26 (real, fetched)", "Document", "IND",
        "Ministry of Home Affairs, Government of India", "1 PDF", "602 KB", "n/a", "Document", "Public document",
        "Items and norms of assistance under SDRF/NDRF. Whether the 2026-27 revision exists is not verified.", "India", "2022-2026", ["norms", "costs"],
        [{"name": "norm", "type": "Text", "unit": "INR"}], 1)
    d["crops-npl"] = _entry("crops-npl", "Nepal District Crops (2014/15)", "Area, production, yield (real, fetched, partial)", "Table", "NPL",
        "Ministry of Agriculture via Open Data Nepal", "75 districts x 6 cereals", _size_label(ext / "crops" / "nepal_opendatanepal"), "n/a", "District level",
        "Creative Commons Attribution",
        "2014/15 district cereal table. Two source rows were mislabelled and were fixed by position. District values: paddy and millet reliable, maize with caution, wheat, buckwheat and barley unreliable. Older than the India table. Units are inferred (ha, tonnes, kg/ha).",
        "Nepal districts (75, pre-2017 list)", "2014/15", ["crops", "partial-coverage"], [{"name": "area_ha", "type": "Float", "unit": "ha (inferred)"}, {"name": "prod_t", "type": "Float", "unit": "tonnes (inferred)"}], 11)
    d["health-npl"] = _entry("health-npl", "Nepal Health Facilities", "OSM export and DoH/WHO list (real, fetched)", "Vector", "NPL",
        "Humanitarian OpenStreetMap Team / Department of Health Services, WHO", "7,313 OSM features (868 in the fetch box)", _size_label(ext / "health"), "EPSG:4326",
        "Facility points", "ODbL (OSM export); 'Other' (DoH/WHO list)",
        "OpenStreetMap health facilities plus an older DoH/WHO list. Mapped in OpenStreetMap, not a full register.", "Nepal", "Export of 8 Oct 2026 (OSM); list from 2023 upload", ["health", "facilities", "thin-coverage"],
        [{"name": "facility", "type": "Point", "unit": "-"}], 6)
    d["norms-npl"] = _entry("norms-npl", "Nepal Relief Standard (2077 BS)", "MoHA rescue and relief standard, 7th amendment (real, fetched)", "Document", "NPL",
        "Ministry of Home Affairs, Government of Nepal", "1 PDF, 5 pages (scanned)", _size_label(ext / "costs_norms" / "nepal_moha_standard"), "n/a", "Document",
        "Government of Nepal legal document",
        "Amounts in NPR (e.g. 2 lakh per death, 15,000-20,000 immediate cash per household). Figures were read by eye from the scan and have not been double-checked. Only amended clauses are listed.",
        "Nepal", "2077 BS (about 2020/21)", ["norms", "costs"], [{"name": "amount", "type": "Text", "unit": "NPR"}], 1)
    return d
