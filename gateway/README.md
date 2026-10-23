# Gateway (patch 8a)

A small Node/Express program that sits between the browser and the FastAPI backend.

    browser  ->  gateway :8080  ->  FastAPI :8000 (this computer only)

What it does
- Security headers (Helmet), an allow-list of web addresses (CORS), rate limits, size limit, only GET and POST under /api.
- Checks the SDG map and scenario questions (ranges for lat, lon, radius, river rise) before they reach the model code.
- Keeps repeated SDG answers in a cache (memory, or Redis when REDIS_URL is set) so a map is not computed twice.
- Passes every other /api call straight to FastAPI, unchanged.
- Hidden developer routes for monitoring (below).

There is no login system. The monitoring routes are protected by a long random secret in `gateway/.env`
(MONITOR_SECRET) and answer only from this computer. This is a shared secret, not an authentication system, and it is not a compliance claim.

## Run
    cd gateway
    npm install            # once
    npm start              # the first line it prints shows the cache and monitoring state
Start FastAPI so that only this computer can reach it:
    uv run uvicorn server.main:app --host 127.0.0.1 --port 8000

## Developer-only routes (replace SECRET with the value in gateway/.env)
    /__monitor/SECRET/health     CPU, memory, disk, API speed (p50/p95/p99), error rate, FastAPI check, cache kind
    /__monitor/SECRET/pipeline   newest change in data/processed/sdg, data/final, model/saved
    /__monitor/SECRET/metrics    Prometheus text (patch 8c scrapes this)
    /__monitor/SECRET/quality    data-quality report (patch 8b)
    /__monitor/SECRET/lineage    lineage manifest (patch 8b)
    /__monitor/SECRET/layers     the 10 metric layers (patch 8d)
A wrong secret, another machine, or monitoring switched off all give the same plain 404 as a path that does not exist.
Do not put the secret in the client code, in a screenshot, or in git (gateway/.env is ignored by git).

## Tests
    npm test      # 14 checks against a fake FastAPI
