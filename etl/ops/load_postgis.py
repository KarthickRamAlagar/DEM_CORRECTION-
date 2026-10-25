"""Patch 8c: copy the small result tables into PostgreSQL / PostGIS and make a read-only role for them.
Copies (read-only on the files): district boundaries, district exposure table, rain and plain outlook tables, and the OpenStreetMap asset tables
(schools, health, shelters, main-road samples, bridges). Points get a PostGIS geometry column and a spatial index.
Nothing in the app reads from this database yet: it is the database layer of the plan, loaded from the same files, so counts can be compared.
Run from the repo root, with PostgreSQL running:
  PG_ADMIN_URL=postgresql://postgres:<your postgres password>@127.0.0.1:5432/postgres  SDG_RO_PASSWORD=<choose one>  uv run python -I etl/ops/load_postgis.py
Options: --db dem_sdg (database name)  --dry-run (list what would load, connect to nothing)  --no-postgis (if the PostGIS add-on is not installed: loads plain tables, longitude and latitude columns only)
Needs once:  uv add "psycopg[binary]"       Passwords come from the environment only and are never printed or stored in a file."""
from __future__ import annotations
import argparse, io, json, os, sys, time
from pathlib import Path
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(os.environ.get("DEM_ROOT") or Path(__file__).resolve().parents[2])
SDG = ROOT / "data/processed/sdg"
CSV_TABLES = [  # (table, file, point columns or None)
    ("districts_table", SDG / "exposure_base_ext/districts_table.csv", None),
    ("outlook_by_district", SDG / "forecast/outlook_by_district.csv", None),
    ("outlook_rain_by_district", SDG / "forecast/outlook_rain_by_district.csv", None),
    ("assets_points", SDG / "assets/points.csv", ("lon", "lat")),
    ("assets_bridges", SDG / "assets/bridges.csv", ("lon", "lat")),
    ("assets_road_samples", SDG / "assets/road_samples.csv", ("lon", "lat")),
]
GEOJSON = SDG / "districts_ext/districts_ext.geojson"
RO = "sdg_readonly"


def pgtype(s: pd.Series) -> str:
    k = str(s.dtype)
    return "bigint" if k.startswith(("int", "Int", "uint")) else "double precision" if k.startswith(("float", "Float")) else "boolean" if k == "bool" else "text"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="dem_sdg"); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--no-postgis", action="store_true")
    a = ap.parse_args()
    if not a.db.replace("_", "").isalnum(): sys.exit("STOP: --db may only contain letters, digits and underscore.")
    plan = [(t, f, pc) for t, f, pc in CSV_TABLES if f.exists()]
    for t, f, _ in CSV_TABLES:
        if not f.exists(): print(f"  skipped {t}: {f.relative_to(ROOT)} not found")
    have_geo = GEOJSON.exists()
    print(f"Would load {len(plan)} tables" + (" + districts (geometry)" if have_geo else "") + f" into database '{a.db}', schema sdg, read-only role {RO}.")
    if a.dry_run:
        for t, f, pc in plan: print(f"  {t}: {len(pd.read_csv(f, usecols=[0])):,} rows from {f.relative_to(ROOT)}")
        return 0
    admin, ro_pw = os.environ.get("PG_ADMIN_URL", ""), os.environ.get("SDG_RO_PASSWORD", "")
    if not admin or not ro_pw: sys.exit("STOP: set PG_ADMIN_URL and SDG_RO_PASSWORD in the environment first (see the top of this file). Nothing changed.")
    try:
        import psycopg
        from psycopg import sql
        from psycopg.conninfo import conninfo_to_dict, make_conninfo
    except ImportError:
        sys.exit('STOP: psycopg is not installed. Run:  uv add "psycopg[binary]"')
    t0 = time.time()
    base = conninfo_to_dict(admin)
    with psycopg.connect(make_conninfo(**{**base, "dbname": base.get("dbname") or "postgres"}), autocommit=True) as c:
        if not c.execute("SELECT 1 FROM pg_database WHERE datname=%s", (a.db,)).fetchone():
            c.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(a.db))); print(f"created database {a.db}")
        if not c.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (RO,)).fetchone():
            c.execute(sql.SQL("CREATE ROLE {} LOGIN").format(sql.Identifier(RO)))
        c.execute(sql.SQL("ALTER ROLE {} PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE").format(sql.Identifier(RO), sql.Literal(ro_pw)))
        c.execute(sql.SQL("REVOKE CONNECT ON DATABASE {} FROM PUBLIC").format(sql.Identifier(a.db)))
        c.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(sql.Identifier(a.db), sql.Identifier(RO)))
    dbc = make_conninfo(**{**base, "dbname": a.db})
    postgis = False
    with psycopg.connect(dbc) as c:
        if not a.no_postgis:
            try:
                c.execute("CREATE EXTENSION IF NOT EXISTS postgis"); c.commit(); postgis = True
            except Exception as e:
                c.rollback(); sys.exit(f"STOP: PostGIS is not installed in this PostgreSQL ({str(e).splitlines()[0]}). Install it (Stack Builder > Spatial Extensions > PostGIS) or run again with --no-postgis.")
        c.execute("CREATE SCHEMA IF NOT EXISTS sdg")
        c.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
        results = []
        for t, f, pc in plan:
            df = pd.read_csv(f, low_memory=False)
            cols = ", ".join(f'"{n}" {pgtype(df[n])}' for n in df.columns)
            c.execute(f'DROP TABLE IF EXISTS sdg."{t}"'); c.execute(f'CREATE TABLE sdg."{t}" ({cols})')
            buf = io.StringIO(); df.to_csv(buf, index=False, header=False); buf.seek(0)
            with c.cursor().copy(f'COPY sdg."{t}" FROM STDIN WITH (FORMAT csv)') as cp:
                while chunk := buf.read(1 << 20): cp.write(chunk)
            if pc and postgis and {pc[0], pc[1]} <= set(df.columns):
                c.execute(f'ALTER TABLE sdg."{t}" ADD COLUMN geom geometry(Point,4326)')
                c.execute(f'UPDATE sdg."{t}" SET geom = ST_SetSRID(ST_MakePoint("{pc[0]}","{pc[1]}"),4326) WHERE "{pc[0]}" IS NOT NULL AND "{pc[1]}" IS NOT NULL')
                c.execute(f'CREATE INDEX ON sdg."{t}" USING GIST (geom)')
            n = c.execute(f'SELECT count(*) FROM sdg."{t}"').fetchone()[0]
            results.append((t, len(df), n)); print(f"  {t}: {n:,} rows (file {len(df):,})")
        if have_geo:
            g = json.loads(GEOJSON.read_text(encoding="utf-8"))["features"]
            c.execute("DROP TABLE IF EXISTS sdg.districts")
            c.execute("CREATE TABLE sdg.districts (did bigint, iso text, name text, " + ("geom geometry(Geometry,4326)" if postgis else "geom_json text") + ")")
            for f in g:
                p, geo = f["properties"], json.dumps(f["geometry"])
                if postgis: c.execute("INSERT INTO sdg.districts VALUES (%s,%s,%s,ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))", (p.get("did"), p.get("iso"), p.get("shapeName"), geo))
                else: c.execute("INSERT INTO sdg.districts VALUES (%s,%s,%s,%s)", (p.get("did"), p.get("iso"), p.get("shapeName"), geo))
            if postgis: c.execute("CREATE INDEX ON sdg.districts USING GIST (geom)")
            n = c.execute("SELECT count(*) FROM sdg.districts").fetchone()[0]; results.append(("districts", len(g), n)); print(f"  districts: {n:,} polygons (file {len(g):,})")
        c.execute(sql.SQL("GRANT USAGE ON SCHEMA sdg TO {}").format(sql.Identifier(RO)))
        c.execute(sql.SQL("GRANT SELECT ON ALL TABLES IN SCHEMA sdg TO {}").format(sql.Identifier(RO)))
        c.execute(sql.SQL("ALTER DEFAULT PRIVILEGES IN SCHEMA sdg GRANT SELECT ON TABLES TO {}").format(sql.Identifier(RO)))
        c.commit()
    bad = [r for r in results if r[1] != r[2]]
    # proof 1: the read-only role can read; proof 2: it cannot write
    with psycopg.connect(make_conninfo(**{**base, "dbname": a.db, "user": RO, "password": ro_pw})) as ro:
        first = results[0][0] if results else None
        n = ro.execute(f'SELECT count(*) FROM sdg."{first}"').fetchone()[0] if first else None
        try:
            ro.execute("CREATE TABLE sdg.should_fail (x int)"); wrote = True
        except Exception:
            wrote = False; ro.rollback()
    print(f"\nread-only role {RO}: can read ({n if n is not None else 'n/a'} rows in {first}), can write: {'YES - PROBLEM' if wrote else 'no (correct)'}")
    print(f"row counts file vs database: {'all equal' if not bad else 'DIFFERENT: ' + str(bad)}   PostGIS: {'on' if postgis else 'off (--no-postgis)'}   ({time.time() - t0:.0f} s)")
    return 1 if (bad or wrote) else 0


if __name__ == "__main__":
    sys.exit(main())
