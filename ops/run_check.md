# Running the services and checking performance (patch 8c, F1)

Put this file at `ops/RUN_AND_CHECK.md` in the project.
It answers two questions: which commands to run before a demo or a performance check, and what to look at on each screen.

Everything runs on your own computer. There is no Docker and no login system. Services that are not needed can stay off to save RAM (this machine has about 0.8 GB free).

---

## 1. Where everything is

| Service | How it is installed | Port | Started by |
|---|---|---|---|
| App (client) | project | 5173 | `start_all.py` |
| API (Python) | project | 8000 | `start_all.py` |
| Gateway (Node) | project | 3100 | `start_all.py` |
| PostgreSQL 18 | Windows service `postgresql-x64-18` | **5433** | starts by itself |
| Redis (Memurai) | Windows service `Memurai` | 6379 | starts by itself |
| MLflow | Python (`uv`) | 5000 | `ops_services.py` |
| windows_exporter | `C:\ops\windows_exporter` | 9182 | `ops_services.py` |
| Prometheus | `C:\ops\prometheus\...` | 9090 | `ops_services.py` |
| Grafana | `C:\ops\grafana\grafana-13.2.4` | 3000 | `ops_services.py` |
| NGINX | `C:\ops\nginx\nginx-1.30.6` | 8081 | `ops_services.py` |
| Windows firewall block rule | `DEM-SDG` (blocks outside access to the ports above) | - | installed once |

Your own settings live in `ops/ops_config.json` (never commit this file).
The files the script writes (`ops/_rendered/`, `ops/run/`) are also never committed.

---

## 2. Start everything (before a demo or a performance check)

Open **Git Bash** in the project folder (`DEM_CORRECTION_reorganized`).

**Window 1: the app, API and gateway. Leave it open.**
```
uv run python scripts/start_all.py
```

**Window 2: the monitoring services.**
```
uv run python scripts/ops_services.py start all
sleep 30
uv run python scripts/ops_services.py check
```

What a good result looks like:
- Section 1 lists every service as `ANSWERING`.
- Section 2 says `scrape targets up: 2 of 2` and shows real numbers for memory.
- Section 3 shows every page row as `answering`.
- A proof file is written to `ops\_rendered\proof_<date>_<time>.txt`. Keep it as evidence. It does not contain the secret.

Starting only part of the stack (when RAM is short):
```
uv run python scripts/ops_services.py start mlflow prometheus grafana
```
Postgres and Redis are Windows services; start them in `services.msc` if they are stopped.

Warning "only 0.8 GB RAM free": close Chrome tabs and other heavy programs, then start fewer services.

---

## 3. Make the dashboards show data

Some panels need traffic, so the graphs stay flat until the app is used.

1. Open the app at http://localhost:5173 (or through NGINX at http://localhost:8081).
2. Go through the SDG flow for about one minute: choose a district, move through the steps, change the flood rise, open the map.
3. Wait 15 to 30 seconds. Prometheus reads new numbers every 15 seconds.

---

## 4. What to check on each screen

### 4.1 App monitoring page, "Services" list
Open the monitoring page from the app (the Operations / Monitoring view).

| Row | Good looks like | If it is not good |
|---|---|---|
| Gateway | Running, uptime counting up | Start `start_all.py` |
| Python analysis service | Answering, about 70 to 150 ms | API not started |
| Cache | **Redis in use** (not "In memory") | `REDIS_URL` missing or duplicated in `gateway/.env` |
| PostgreSQL / PostGIS | Answering, under 300 ms | Service stopped, or `PG_PORT` is not 5433 |
| Redis | Answering (PING) | Start the `Memurai` service |
| NGINX (front door) | Answering, HTTP 200 | `start nginx` |
| Prometheus | Answering, "2 of 2 targets up" | `start prometheus`; "1 of 2" means windows_exporter is off |
| Grafana | Answering, "database ok" | `start grafana` |
| MLflow | Answering, HTTP 200 | `start mlflow` |
| Windows firewall block rule | Answering, "block rule is on" | Re-run `ops/windows/firewall_8c.ps1` as administrator |
| ML pipeline | "No data" is normal (no job runner yet) | none |

Response times above 500 ms on a row usually mean the machine is short of RAM.

### 4.2 Grafana, http://localhost:3000
Log in as `admin` with the password you set. Go to **Dashboards, DEM-SDG overview**.
Set the time range to **Last 15 minutes** and keep refresh at 10 s.

| Panel | What it shows | Good looks like | Concern |
|---|---|---|---|
| Extra services answering | How many of the extra services answer | 6 or 7 when all are started | A drop means a service stopped |
| Scrape targets up | Targets Prometheus can read | 2 | 1 means windows_exporter is off |
| Gateway memory | Memory used by the gateway | Steady (about 50 to 80 MiB) | A line that keeps climbing means a leak |
| Memory available (computer) | Free RAM on this computer | Above 1 GB | Under 0.5 GB: the machine will slow down |
| Service up (1 = answering) | One line per service over time | All lines at 1 | A line at 0 shows when that service went down |
| Gateway requests per second | Traffic into the gateway | Rises while you use the app | Flat at 0 while you click means traffic is not reaching the gateway |
| Gateway latency p95 | The slowest 5% of requests | Under about 1 s | Spikes during map or what-if steps are worth noting |
| Cache lookups | Redis hits compared with misses | Hits grow on repeat steps | All misses means the cache is not working |
| CPU in use (computer) | CPU load | Under 80% | Sustained 100% means too many heavy tasks |
| Errors talking to the analysis service | Gateway to API failures | **0** | Anything above 0: check the API window |

Take a screenshot of the whole dashboard while you use the app. This is evidence.

### 4.3 Prometheus, http://localhost:9090
1. **Status, Targets** (http://localhost:9090/targets): both targets should say `UP`.
2. **Graph** page. Run these queries and press Execute:
   - `up` shows 1 for each target that is reachable.
   - `dem_service_up` shows 1 for each service that answers, and 0 for a service that does not.

### 4.4 MLflow, http://localhost:5000
- The page opens and shows the Experiments list.
- Open an experiment to see its runs, parameters and metrics.
- An empty list is fine when no training run has been logged yet.

### 4.5 NGINX, http://localhost:8081
- http://localhost:8081/nginx-health should answer `ok` or HTTP 200.
- The app should load through this address the same way as at port 5173.

### 4.6 PostgreSQL (after the database load has been run)
If you have loaded the data (`etl/ops/load_postgis.py`):
- The read-only role `sdg_readonly` can read the `sdg` schema.
- Writing with that role must be refused. This is the proof that the dashboard cannot change data.

---

## 5. Stop everything (free the RAM)
```
uv run python scripts/ops_services.py stop all
```
Then close the `start_all.py` window with Ctrl+C.
Postgres and Redis can stay on.

---

## 6. If something goes wrong

The script now prints the exit code and the last log lines when a program ends by itself. Logs are in `ops/run/<name>.log`.

| Message or symptom | Cause | Fix |
|---|---|---|
| `STOP: ops\ops_config.json not found` | Config not created | Copy `ops/ops_config.example.json` to `ops/ops_config.json` and edit it |
| PostgreSQL `TimeoutError` | Wrong port | PostgreSQL 18 here uses 5433. Set `"postgres": 5433` in `ops_config.json` and `PG_PORT=5433` in `gateway/.env` |
| Cache says "In memory" | Redis URL missing or duplicated | `gateway/.env` must contain one `REDIS_URL=redis://127.0.0.1:6379` line. The first value in the file wins |
| MLflow fails with `WinError 10022` | Too many workers on Windows | The script starts MLflow with `--workers 1` |
| Grafana: "failed to create SQLite database file" | Data folder missing | `mkdir -p ops/run/grafana-data ops/run/grafana-logs ops/run/grafana-plugins` |
| NGINX: `mime.types failed` | File not found next to the config | `cp /c/ops/nginx/nginx-1.30.6/conf/mime.types ops/_rendered/mime.types` |
| Grafana login fails | Default password is `admin` / `admin`, not your email | Reset: `"/c/ops/grafana/grafana-13.2.4/bin/grafana.exe" cli --homepath "C:/ops/grafana/grafana-13.2.4" --config ops/_rendered/grafana.ini admin reset-admin-password <new>` |
| A program ends at once with an empty log | Antivirus blocked it | Add `C:\ops` to the antivirus Trust List |
| `tasklist /FI` gives a strange error in Git Bash | Git Bash rewrites `/FI` as a path | Put `MSYS_NO_PATHCONV=1` in front of the command |
| `render` was run again and a service now fails | `render` rewrites `ops/_rendered/` | Copy `mime.types` again (see above) |

---

## 7. Safe to commit and not safe to commit

Commit: `ops/` templates, `ops/README_8c.md`, this file, `scripts/ops_services.py`, `etl/ops/`, the gateway changes and `.gitignore`.

Never commit: `ops/ops_config.json`, `ops/_rendered/` (it holds the monitor secret), `ops/run/`, `gateway/.env`.

Before committing, run `git status` and confirm none of those four appear in the list.