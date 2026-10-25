# Patch 8c: extra services (F1)

Goal (F1 proof): PostgreSQL/PostGIS, Redis, NGINX, Prometheus, Grafana, MLflow and the firewall rule are installed, **each one answers**, and the **monitoring page shows live numbers**.

No Docker. Native Windows installs. No logging system and no login system (decided earlier). The monitoring page is the hidden gateway page you already use.

## 0. Before you start (this computer is small)
- About 8 GB RAM with roughly 1 GB free earlier, and about 8 GB free on C:. Check both first. Start only what you need; the script warns when RAM is low.
- Rough memory use (measure it yourself): PostgreSQL 100-250 MB, Redis or Memurai 20-50 MB, MLflow 200-400 MB, Prometheus 150-300 MB, Grafana 150-250 MB, NGINX about 10 MB, windows_exporter 20-40 MB.
- Do not commit `ops/ops_config.json`, `ops/_rendered/` or `ops/run/` (the installer adds them to .gitignore). `ops/_rendered/prometheus.yml` contains the monitor secret.

## 1. Downloads (you do this part)
| Service | Where | Notes |
|---|---|---|
| PostgreSQL + PostGIS | https://www.postgresql.org/download/windows/ (EDB installer). After it: Stack Builder > Spatial Extensions > PostGIS | Installs as a Windows service. Choose the postgres password and keep it out of git. Service name looks like `postgresql-x64-17` (see services.msc). |
| Redis | Redis has no official native Windows build. Redis lists Memurai as the Windows route: https://redis.io/partners/memurai/ (Memurai Developer is the free edition) | Installs as service `Memurai`. Alternative: Redis inside WSL2. |
| NGINX | https://nginx.org/en/download.html (stable, Windows zip) | Unzip, for example to `C:/tools/nginx`. |
| Prometheus | https://prometheus.io/download/ (windows-amd64 zip) | Unzip, for example to `C:/tools/prometheus`. |
| Grafana OSS | https://grafana.com/grafana/download?platform=windows (standalone zip). Guide: https://grafana.com/docs/grafana/latest/setup-grafana/installation/windows/ | Unzip, for example to `C:/tools/grafana`. |
| windows_exporter | https://github.com/prometheus-community/windows_exporter/releases (the .msi) | Installs as service `windows_exporter`, port 9182. It feeds CPU, memory and disk to Prometheus. |
| MLflow | already in the project (`mlflow` in pyproject) | nothing to download |
| postgres_exporter, redis_exporter (optional) | https://github.com/prometheus-community/postgres_exporter and https://github.com/oliver006/redis_exporter | Skip them if there is no Windows build for your version or RAM is short. The monitoring page already asks PostgreSQL and Redis directly. |

## 2. Set up (about 20 minutes once everything is downloaded)
1. `cp ops/ops_config.example.json ops/ops_config.json`, then edit the paths and service names. Delete the entries you did not install.
2. `gateway/.env` must already hold `MONITOR_SECRET` (16+ characters). If port 8081 is refused on this computer (8080 was), change `ports.nginx` in `ops/ops_config.json` **and** add `NGINX_URL=http://127.0.0.1:<port>` to `gateway/.env`. Same idea for any other port you change (`PG_PORT`, `PROMETHEUS_URL`, `GRAFANA_URL`, `MLFLOW_URL`).
3. To make the gateway cache use Redis, add `REDIS_URL=redis://127.0.0.1:6379` to `gateway/.env` and restart the gateway. The monitoring page then says "Redis in use".
4. `uv run python scripts/ops_services.py render` writes NGINX, Prometheus and Grafana configs to `ops/_rendered/`.
5. Firewall, in an **administrator** PowerShell: `powershell -ExecutionPolicy Bypass -File ops\windows\firewall_8c.ps1`. It adds one rule that blocks other computers from reaching the project ports. Programs on this computer still work. Undo with `-Remove`.

## 3. Start, in small steps
```
uv run python scripts/ops_services.py start postgres redis
uv run python scripts/ops_services.py start mlflow
uv run python scripts/ops_services.py start windows_exporter prometheus grafana
uv run python scripts/ops_services.py start nginx
uv run python scripts/start_all.py          # API, gateway, client, as before
```
Services that are Windows services need Git Bash opened **as administrator** to start or stop through the script (or use services.msc).

## 4. Load the database (optional but part of the PostgreSQL proof)
```
uv add "psycopg[binary]"          # once
PG_ADMIN_URL=postgresql://postgres:<password>@127.0.0.1:5432/postgres SDG_RO_PASSWORD=<choose one> uv run python -I etl/ops/load_postgis.py
```
It creates database `dem_sdg`, loads the district, outlook and OpenStreetMap asset tables, makes read-only role `sdg_readonly`, and prints: row counts equal to the files, role can read, role cannot write. Use `--no-postgis` if the PostGIS add-on is not installed yet; `--dry-run` shows what would load.

## 5. Proof (what to send back)
```
uv run python scripts/ops_services.py check
```
It prints three blocks and writes `ops/_rendered/proof_<time>.txt` (no secret inside): 1) each service answers, 2) live numbers from Prometheus, 3) the same services as the monitoring page sees them. Then open:
- the monitoring page (System tab): the Services list now has a row per service with its answer and speed;
- Grafana at http://127.0.0.1:3000 (first login admin / admin, it asks for a new password), dashboard "DEM-SDG overview";
- Prometheus at http://127.0.0.1:9090/targets (gateway and windows should be "UP");
- NGINX at http://127.0.0.1:8081/nginx-health ("ok"). To use the app through NGINX, run the client with `VITE_API_BASE=http://127.0.0.1:8081/api` and add `http://127.0.0.1:8081,http://localhost:8081` to `CORS_ORIGINS` in `gateway/.env`. NGINX never serves the `/__monitor/` path.

## 6. Stop
`uv run python scripts/ops_services.py stop all` (reverse order). Windows services need the administrator terminal.

## 7. What was tested, what was not (read this)
Tested here (cloud workspace): the gateway service checks (19 automatic tests pass); `ops_services.py render, start, status, check, stop` against a real Redis, a real PostgreSQL 16 and stand-in web servers; `load_postgis.py` against a real PostgreSQL 16 **without** PostGIS (counts equal, read-only role can read and cannot write, safe to run twice).
**Not tested** (needs your machine): the Windows installs; Memurai; the real NGINX, Prometheus and Grafana programs and their command-line flags on Windows; windows_exporter; `sc start`/`sc stop`; the firewall script and its row on the monitoring page; the PostGIS part of the loader (geometry columns and indexes).

## 8. If something fails
- `port ... in use` or EACCES: another program holds the port; change it as in step 2.
- Prometheus target `gateway` is DOWN: the gateway must be running and `MONITOR_SECRET` unchanged since `render`; run `render` again after changing it. The monitor route only answers from this computer.
- Grafana will not start: read `ops/run/grafana.log`. The Grafana zip layout differs between versions; if the program is `bin/grafana.exe` instead of `bin/grafana-server.exe` the script tries both.
- A row says "Not running" on the monitoring page: that service is simply not started; amber is normal for a service you did not start.
