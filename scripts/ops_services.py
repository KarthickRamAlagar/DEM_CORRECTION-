"""Patch 8c: render the service configs, start / stop the extra services on demand, and prove each one answers.
Run from the repo root:
  uv run python scripts/ops_services.py render                 write NGINX, Prometheus and Grafana configs to ops/_rendered/ (needs MONITOR_SECRET in gateway/.env)
  uv run python scripts/ops_services.py start [names|all]      start what ops/ops_config.json lists (default: all). Names: postgres redis mlflow windows_exporter prometheus grafana nginx
  uv run python scripts/ops_services.py stop [names|all]
  uv run python scripts/ops_services.py status                 one line per service: answering or not
  uv run python scripts/ops_services.py check                  status + live numbers from Prometheus and the gateway monitoring page; writes ops/_rendered/proof_<time>.txt
This machine has about 8 GB RAM: start only what you need (for example:  start postgres redis).
Never prints the monitor secret or any password. Changes no data. Services that are Windows services (config key "service") need an administrator terminal to start or stop."""
from __future__ import annotations
import json, os, re, shutil, socket, subprocess, sys, time, urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(os.environ.get("DEM_ROOT") or Path(__file__).resolve().parent.parent)
OPS, RENDERED, RUN = ROOT / "ops", ROOT / "ops" / "_rendered", ROOT / "ops" / "run"
CONFIG = OPS / "ops_config.json"
WIN = os.name == "nt"
ORDER = ["postgres", "redis", "mlflow", "windows_exporter", "prometheus", "grafana", "nginx"]
NAMES = {"postgres": "PostgreSQL / PostGIS", "redis": "Redis", "mlflow": "MLflow", "windows_exporter": "windows_exporter", "prometheus": "Prometheus", "grafana": "Grafana", "nginx": "NGINX"}
PORTS = {"nginx": 8081, "postgres": 5432, "redis": 6379, "prometheus": 9090, "grafana": 3000, "mlflow": 5000, "windows_exporter": 9182}
EXE = ".exe" if WIN else ""


# ---------------------------------------------------------------- config
def load_cfg() -> dict:
    if not CONFIG.exists():
        sys.exit(f"STOP: {CONFIG.relative_to(ROOT)} not found. Copy ops/ops_config.example.json to ops/ops_config.json and fill the paths.")
    c = json.loads(CONFIG.read_text(encoding="utf-8"))
    c["ports"] = {**PORTS, **c.get("ports", {})}
    c.setdefault("services", {}); c.setdefault("client_dist", "")
    return c


def gateway_env() -> dict:
    out, f = {}, ROOT / "gateway" / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
            if m and not line.strip().startswith("#"): out[m.group(1)] = m.group(2).strip("\"'")
    return out


# ---------------------------------------------------------------- probes (same questions the gateway asks)
def tcp_ask(port: int, payload: bytes, accept) -> tuple[bool, str]:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1.5) as s:
            s.settimeout(1.5); s.sendall(payload); return accept(s.recv(64))
    except ConnectionRefusedError:
        return False, "not running (port closed)"
    except Exception as e:
        return False, type(e).__name__


def http_ask(url: str, check=None) -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=1.5) as r:
            body = r.read(200_000).decode("utf-8", "ignore")
            return check(r.status, body) if check else (r.status == 200, f"HTTP {r.status}")
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:
        return False, "not running (port closed)" if "refused" in str(e).lower() else "not reachable"


def probe(name: str, cfg: dict) -> tuple[bool, str]:
    p = cfg["ports"]
    if name == "postgres":
        return tcp_ask(p["postgres"], bytes([0, 0, 0, 8, 4, 210, 22, 47]), lambda d: (d[:1] in (b"S", b"N"), "answering the PostgreSQL protocol"))
    if name == "redis":
        def acc(d):
            t = d.decode("ascii", "ignore")
            return (True, "answered PING") if t.startswith("+PONG") else (True, "answering (password needed)") if t.startswith("-NOAUTH") else (False, "unexpected answer")
        return tcp_ask(p["redis"], b"PING\r\n", acc)
    if name == "nginx":
        return http_ask(f"http://127.0.0.1:{p['nginx']}/nginx-health", lambda s, b: (s == 200 and "ok" in b.lower(), f"HTTP {s}"))
    if name == "prometheus":
        ok, d = http_ask(f"http://127.0.0.1:{p['prometheus']}/-/ready")
        if not ok: return ok, d
        t = prom_targets(cfg)
        return True, f"{t[0]} of {t[1]} targets up" if t else "ready"
    if name == "grafana":
        def chk(s, b):
            try: j = json.loads(b); return s == 200 and j.get("database") == "ok", f"database {j.get('database')}, version {j.get('version')}"
            except Exception: return False, f"HTTP {s}"
        return http_ask(f"http://127.0.0.1:{p['grafana']}/api/health", chk)
    if name == "mlflow":
        return http_ask(f"http://127.0.0.1:{p['mlflow']}/health")
    if name == "windows_exporter":
        return http_ask(f"http://127.0.0.1:{p['windows_exporter']}/metrics", lambda s, b: (s == 200 and "windows_" in b, f"HTTP {s}"))
    return False, "unknown service"


def prom_targets(cfg: dict):
    ok, _ = True, ""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{cfg['ports']['prometheus']}/api/v1/targets?state=active", timeout=1.5) as r:
            a = json.loads(r.read())["data"]["activeTargets"]; return sum(x["health"] == "up" for x in a), len(a)
    except Exception:
        return None


def prom_query(cfg: dict, q: str):
    try:
        from urllib.parse import quote
        with urllib.request.urlopen(f"http://127.0.0.1:{cfg['ports']['prometheus']}/api/v1/query?query={quote(q)}", timeout=2) as r:
            return json.loads(r.read())["data"]["result"]
    except Exception:
        return None


# ---------------------------------------------------------------- render
def render_text(src: Path, values: dict) -> str:
    t = src.read_text(encoding="utf-8")
    for k, v in values.items(): t = t.replace("{{" + k + "}}", str(v))
    left = re.findall(r"\{\{([A-Z_]+)\}\}", t)
    if left: sys.exit(f"STOP: {src.name} still has placeholders: {sorted(set(left))}")
    return t


def cmd_render(cfg: dict) -> None:
    env = gateway_env(); secret = env.get("MONITOR_SECRET", "")
    if len(secret) < 16: sys.exit("STOP: MONITOR_SECRET in gateway/.env is missing or shorter than 16 characters. Nothing written.")
    gw = env.get("PORT", "3100"); p = cfg["ports"]
    extra = [f'  - job_name: windows\n    static_configs:\n      - targets: ["127.0.0.1:{p["windows_exporter"]}"]']
    for job, key, def_port in (("postgres", "postgres_exporter", 9187), ("redis", "redis_exporter", 9121)):
        if key in cfg["services"]: extra.append(f'  - job_name: {job}\n    static_configs:\n      - targets: ["127.0.0.1:{cfg["services"][key].get("port", def_port)}"]')
    RENDERED.mkdir(parents=True, exist_ok=True); RUN.mkdir(parents=True, exist_ok=True)
    for sub in ("grafana-data", "grafana-logs", "grafana-plugins"): (RUN / sub).mkdir(parents=True, exist_ok=True)  # Grafana does not create its own folders (patch 8c3)
    nd = cfg["services"].get("nginx", {}).get("dir")
    if nd and (Path(nd) / "conf" / "mime.types").exists(): shutil.copyfile(Path(nd) / "conf" / "mime.types", RENDERED / "mime.types")  # nginx.conf includes it from its own folder (patch 8c3)
    dist = cfg.get("client_dist", "")
    if dist:
        block = f'    location / {{ root "{Path(dist).as_posix()}"; try_files $uri /index.html; }}'
    else:
        block = ('    location / {\n      proxy_pass http://127.0.0.1:5173;\n      proxy_http_version 1.1;\n      proxy_set_header Upgrade $http_upgrade;\n'
                 '      proxy_set_header Connection $connection_upgrade;\n      proxy_set_header Host $host;\n    }')
    (RENDERED / "nginx.conf").write_text(render_text(OPS / "nginx" / "nginx.conf.template", {"GATEWAY_PORT": gw, "NGINX_PORT": p["nginx"], "CLIENT_BLOCK": block}), encoding="utf-8")
    (RENDERED / "prometheus.yml").write_text(render_text(OPS / "prometheus" / "prometheus.yml.template", {"MONITOR_SECRET": secret, "GATEWAY_PORT": gw, "EXTRA_JOBS": "\n".join(extra)}), encoding="utf-8")
    (RENDERED / "grafana.ini").write_text(render_text(OPS / "grafana" / "grafana.ini.template", {"RUN_DIR": RUN.as_posix(), "RENDERED": RENDERED.as_posix(), "GRAFANA_PORT": p["grafana"]}), encoding="utf-8")
    prov = RENDERED / "grafana" / "provisioning"
    for sub, f in (("datasources", "prometheus.yml"), ("dashboards", "dem-sdg.yml")):
        (prov / sub).mkdir(parents=True, exist_ok=True)
        (prov / sub / f).write_text(render_text(OPS / "grafana" / "provisioning" / sub / f, {"PROMETHEUS_PORT": p["prometheus"], "DASHBOARD_DIR": (OPS / "grafana" / "dashboards").as_posix()}), encoding="utf-8")
    print(f"Rendered to {RENDERED.relative_to(ROOT)}: nginx.conf, prometheus.yml (holds the monitor secret, never commit), grafana.ini, grafana provisioning.")


# ---------------------------------------------------------------- start / stop
def free_ram_gb():
    try:
        if WIN:
            import ctypes
            class MS(ctypes.Structure):
                _fields_ = [("l", ctypes.c_ulong), ("load", ctypes.c_ulong), ("tp", ctypes.c_ulonglong), ("ap", ctypes.c_ulonglong), ("tv", ctypes.c_ulonglong), ("av", ctypes.c_ulonglong), ("tx", ctypes.c_ulonglong), ("ax", ctypes.c_ulonglong), ("ex", ctypes.c_ulonglong)]
            m = MS(); m.l = ctypes.sizeof(MS); ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)); return m.ap / 1e9
        for line in open("/proc/meminfo"):
            if line.startswith("MemAvailable"): return int(line.split()[1]) / 1e6
    except Exception:
        return None


def build_cmd(name: str, s: dict, cfg: dict):
    """(argv, cwd) for services started as programs. None when the entry is a Windows service."""
    p = cfg["ports"]
    if "exe" in s: return [s["exe"], *s.get("args", [])], Path(s.get("cwd") or ROOT)
    d = Path(s["dir"]) if s.get("dir") else None
    if name == "nginx": return [str(d / f"nginx{EXE}"), "-p", str(d), "-c", str(RENDERED / "nginx.conf")], d
    if name == "prometheus": return [str(d / f"prometheus{EXE}"), f"--config.file={RENDERED / 'prometheus.yml'}", f"--storage.tsdb.path={RUN / 'prom-data'}", "--storage.tsdb.retention.time=7d", f"--web.listen-address=127.0.0.1:{p['prometheus']}"], d
    if name == "grafana":
        exe = d / "bin" / f"grafana-server{EXE}"
        if not exe.exists(): exe = d / "bin" / f"grafana{EXE}"
        return [str(exe), *(["server"] if exe.name.startswith("grafana.") else []), "--homepath", str(d), "--config", str(RENDERED / "grafana.ini")], d
    if name == "mlflow":
        store = ROOT / "mlflow"; (store / "artifacts").mkdir(parents=True, exist_ok=True)
        return [sys.executable, "-u", "-m", "mlflow", "server", "--backend-store-uri", f"sqlite:///{(store / 'mlflow.db').as_posix()}", "--default-artifact-root", str(store / "artifacts"), "--host", "127.0.0.1", "--port", str(p["mlflow"]), "--workers", "1"], ROOT
    if name == "windows_exporter" and d: return [str(d / f"windows_exporter{EXE}"), f"--web.listen-address=127.0.0.1:{p['windows_exporter']}"], d
    return None


def start_one(name: str, cfg: dict) -> bool:
    ok, _ = probe(name, cfg)
    if ok: print(f"  {NAMES[name]}: already answering"); return True
    pr = None
    s = cfg["services"].get(name)
    if s is None: print(f"  {NAMES[name]}: not listed in ops/ops_config.json, skipped"); return False
    if "service" in s:
        r = subprocess.run(["sc", "start", s["service"]] if WIN else ["systemctl", "start", s["service"]], capture_output=True, text=True)
        if r.returncode not in (0, 1056):
            print(f"  {NAMES[name]}: could not start the service '{s['service']}' ({(r.stdout + r.stderr).strip()[:120]}). Open Git Bash as administrator, or start it in services.msc."); return False
    else:
        if name in ("nginx", "prometheus", "grafana") and not (RENDERED / ("nginx.conf" if name == "nginx" else "prometheus.yml" if name == "prometheus" else "grafana.ini")).exists():
            print(f"  {NAMES[name]}: run  render  first"); return False
        try: built = build_cmd(name, s, cfg)
        except KeyError: print(f"  {NAMES[name]}: the entry needs 'dir' or 'exe' in ops/ops_config.json"); return False
        if not built: print(f"  {NAMES[name]}: the entry needs 'dir' or 'exe' in ops/ops_config.json"); return False
        argv, cwd = built
        if not Path(argv[0]).exists() and shutil.which(argv[0]) is None: print(f"  {NAMES[name]}: program not found: {argv[0]}"); return False
        RUN.mkdir(parents=True, exist_ok=True)
        log = open(RUN / f"{name}.log", "ab")
        kw = {"creationflags": 0x00000200 | 0x08000000} if WIN else {"start_new_session": True}  # new process group + no console window (patch 8c2: DETACHED_PROCESS removed)
        pr = subprocess.Popen(argv, cwd=str(cwd), stdout=log, stderr=log, stdin=subprocess.DEVNULL, **kw)
        (RUN / f"{name}.pid").write_text(str(pr.pid))
    for _ in range(60):
        time.sleep(0.75)
        ok, d = probe(name, cfg)
        if ok: print(f"  {NAMES[name]}: answering ({d})"); return True
        if pr is not None and pr.poll() is not None:
            tail = ""
            try: tail = "\n".join((RUN / f"{name}.log").read_text(encoding="utf-8", errors="replace").splitlines()[-12:])
            except Exception: pass
            print(f"  {NAMES[name]}: the program ended by itself (exit code {pr.returncode}). Last lines of ops/run/{name}.log:\n{tail or '  (the log is empty)'}"); return False
    print(f"  {NAMES[name]}: started but not answering after 45 s. Read ops/run/{name}.log"); return False


def stop_one(name: str, cfg: dict) -> None:
    s = cfg["services"].get(name, {})
    if "service" in s:
        r = subprocess.run(["sc", "stop", s["service"]] if WIN else ["systemctl", "stop", s["service"]], capture_output=True, text=True)
        print(f"  {NAMES[name]}: " + ("stop sent" if r.returncode == 0 else f"could not stop ({(r.stdout + r.stderr).strip()[:100]}); use an administrator terminal")); return
    pf = RUN / f"{name}.pid"
    if not pf.exists(): print(f"  {NAMES[name]}: not started by this script"); return
    pid = int(pf.read_text())
    if WIN: subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try: os.killpg(pid, 15)
        except Exception:
            try: os.kill(pid, 15)
            except Exception: pass
    pf.unlink(missing_ok=True); print(f"  {NAMES[name]}: stopped")


def pick(arg: list[str], cfg: dict) -> list[str]:
    want = [a for a in arg] or ["all"]
    if "all" in want: return [n for n in ORDER if n in cfg["services"]]
    bad = [w for w in want if w not in ORDER]
    if bad: sys.exit(f"STOP: unknown service {bad}. Choose from: {', '.join(ORDER)}")
    return [n for n in ORDER if n in want]


# ---------------------------------------------------------------- status / check
def table(cfg: dict, names: list[str]):
    rows = []
    for n in names:
        t0 = time.time(); ok, d = probe(n, cfg); rows.append((n, ok, d, int((time.time() - t0) * 1000)))
        print(f"  {'OK ' if ok else '-- '} {NAMES[n]:<22} {d}")
    return rows


def cmd_check(cfg: dict) -> int:
    lines = [f"Patch 8c proof, {time.strftime('%Y-%m-%d %H:%M:%S')}"]
    def out(s=""): print(s); lines.append(s)
    out("1. Each service answers its own health question")
    names = [n for n in ORDER if n in cfg["services"]] or ORDER
    rows = []
    for n in names:
        ok, d = probe(n, cfg); rows.append(ok); out(f"  {'ANSWERING' if ok else 'NOT ANSWERING':<14} {NAMES[n]:<22} {d}")
    out("\n2. Live numbers from Prometheus")
    t = prom_targets(cfg)
    if t is None: out("  Prometheus not answering, no numbers.")
    else:
        out(f"  scrape targets up: {t[0]} of {t[1]}")
        for label, q in (("services answering (dem_service_up sum)", "sum(dem_service_up)"), ("gateway memory, bytes", "gw_process_resident_memory_bytes"), ("memory available on this computer, bytes", "windows_memory_available_bytes")):
            r = prom_query(cfg, q); out(f"  {label}: " + (r[0]["value"][1] if r else "no value yet (wait one scrape, 15 s)"))
    out("\n3. The gateway monitoring page reads the same services")
    env = gateway_env(); gw = env.get("PORT", "3100"); sec = env.get("MONITOR_SECRET", "")
    if len(sec) < 16: out("  MONITOR_SECRET missing in gateway/.env.")
    else:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{gw}/__monitor/{sec}/health", timeout=6) as r: h = json.loads(r.read())
            for s in h.get("services", []): out(f"  page row: {s['name']:<30} {'answering' if s['ok'] else ('not checked' if s['ok'] is None else 'not running')}  {s.get('detail', '')}")
            if not h.get("services"): out("  The gateway answered but sent no service rows: install patch 8c and restart the gateway.")
        except Exception as e:
            out(f"  gateway did not answer ({type(e).__name__}). Start it: uv run python scripts/start_all.py")
    RENDERED.mkdir(parents=True, exist_ok=True)
    f = RENDERED / f"proof_{time.strftime('%Y%m%d_%H%M')}.txt"; f.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out(f"\nWritten: {f.relative_to(ROOT)} (does not contain the secret)")
    return 0 if all(rows) else 1


def main() -> int:
    a = sys.argv[1:]
    if not a or a[0] not in ("render", "start", "stop", "status", "check"): print(__doc__); return 2
    cmd, rest = a[0], a[1:]
    cfg = load_cfg()
    if cmd == "render": cmd_render(cfg); return 0
    if cmd == "start":
        fr = free_ram_gb()
        if fr is not None and fr < 1.2: print(f"WARNING: only {fr:.1f} GB RAM free. Start fewer services (for example: start postgres redis).")
        if any(n in pick(rest, cfg) for n in ("nginx", "prometheus", "grafana")) and not (RENDERED / "nginx.conf").exists(): cmd_render(cfg)
        res = [start_one(n, cfg) for n in pick(rest, cfg)]; return 0 if all(res) else 1
    if cmd == "stop":
        for n in reversed(pick(rest, cfg)): stop_one(n, cfg)
        return 0
    if cmd == "status": rows = table(cfg, [n for n in ORDER if n in cfg["services"]] or ORDER); return 0 if all(r[1] for r in rows) else 1
    return cmd_check(cfg)


if __name__ == "__main__":
    sys.exit(main())
