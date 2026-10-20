import json, time, urllib.request, urllib.error, datetime
BASE = "http://localhost:8000"

def call(method, path, body=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, len(raw), time.time() - t, raw
    except urllib.error.HTTPError as e:
        return e.code, 0, time.time() - t, e.read()[:200]
    except Exception as e:
        return "ERR", 0, time.time() - t, str(e).encode()

print("APP API CHECK", datetime.datetime.now().isoformat(timespec="seconds"))
st, n, dt, raw = call("GET", "/openapi.json")
if st != 200:
    raise SystemExit("backend not reachable or no openapi: %s" % st)
paths = json.loads(raw)["paths"]
rows = []
for p, ops in sorted(paths.items()):
    if "get" in ops and "{" not in p:
        rows.append(("GET", p) + call("GET", p)[:3])
extra = [
  ("POST", "/api/predict/area", {"latitude": 26.5, "longitude": 82.0, "year": 2022}),
  ("GET",  "/api/dem/comparison/2022", None),
  ("GET",  "/api/dem/error-points/2022?sample_size=50", None),
]
for m, p, b in extra:
    rows.append((m, p) + call(m, p, b)[:3])
ok = 0
for m, p, st, n, dt in rows:
    good = st == 200
    ok += good
    print("%-4s %-45s %-4s %8d bytes %6.2fs  %s" % (m, p, st, n, dt, "OK" if good else "CHECK"))
print("TOTAL %d calls, %d returned 200" % (len(rows), ok))
