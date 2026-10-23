"""Start the whole prototype with ONE command: Python API (8000), Node gateway (3100) and the React client (5173).
Run from the repo root:   uv run python scripts/start_all.py
Options:  --only api,gateway,client   start only some of them      --skip gateway   leave one out
          --no-reload                 run the API without auto-reload (a bit lighter on RAM)
Press Ctrl+C once: all three are stopped. Output lines are tagged [api] [gateway] [client].
Reads gateway/.env for PORT only (never prints or uses any secret). Starts nothing else, changes no data."""
from __future__ import annotations
import argparse, os, re, shutil, signal, socket, subprocess, sys, threading, time, urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
WIN = os.name == "nt"


def gateway_port() -> int:
    env = ROOT / "gateway" / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.match(r"\s*PORT\s*=\s*(\d+)", line)
            if m: return int(m.group(1))
    return 8080


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as r: return r.status < 500
    except Exception:
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description="Start API, gateway and client together")
    ap.add_argument("--only", default="", help="comma list: api,gateway,client")
    ap.add_argument("--skip", default="", help="comma list to leave out")
    ap.add_argument("--no-reload", action="store_true")
    a = ap.parse_args()
    gw = gateway_port()
    npm = shutil.which("npm.cmd" if WIN else "npm") or shutil.which("npm")
    parts = {
        "api": {"cwd": ROOT, "port": 8000, "check": "http://127.0.0.1:8000/api/sdg/meta", "need": ROOT / "server" / "main.py",
                "cmd": [sys.executable, "-m", "uvicorn", "server.main:app", "--port", "8000"] + ([] if a.no_reload else ["--reload"])},
        "gateway": {"cwd": ROOT / "gateway", "port": gw, "check": f"http://127.0.0.1:{gw}/healthz", "need": ROOT / "gateway" / "node_modules",
                    "cmd": [npm, "start"], "hint": "cd gateway && npm install"},
        "client": {"cwd": ROOT / "client", "port": 5173, "check": "http://localhost:5173/", "need": ROOT / "client" / "node_modules",
                   "cmd": [npm, "run", "dev"], "hint": "cd client && npm install"},
    }
    want = [p for p in (a.only.split(",") if a.only else list(parts)) if p in parts and p not in a.skip.split(",")]
    for name in want:
        p = parts[name]
        if not p["need"].exists():
            print(f"STOP: {p['need'].relative_to(ROOT)} not found." + (f" Run: {p['hint']}" if p.get("hint") else " Run this from the repo root.")); return 1
        if name != "api" and not npm:
            print("STOP: npm was not found. Install Node.js first."); return 1
        if port_busy(p["port"]):
            print(f"STOP: port {p['port']} is already in use ({name}). Close the other terminal that runs it, then try again."); return 1

    procs: dict[str, subprocess.Popen] = {}
    def pump(name, pipe):
        for line in iter(pipe.readline, ""):
            print(f"[{name}] {line.rstrip()}", flush=True)

    def stop_all():
        for name, pr in procs.items():
            if pr.poll() is None:
                try:
                    if WIN: subprocess.run(["taskkill", "/PID", str(pr.pid), "/T", "/F"], capture_output=True)
                    else: os.killpg(pr.pid, signal.SIGTERM)
                except Exception: pass
        end = time.time() + 6
        while time.time() < end and any(pr.poll() is None for pr in procs.values()): time.sleep(0.2)
        for pr in procs.values():
            if pr.poll() is None:
                try: pr.kill()
                except Exception: pass

    print("Starting:", ", ".join(want), "  (Ctrl+C stops everything)\n", flush=True)
    for name in want:
        p = parts[name]
        kw = dict(cwd=p["cwd"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", bufsize=1)
        if WIN: kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else: kw["start_new_session"] = True
        procs[name] = subprocess.Popen(p["cmd"], **kw)
        threading.Thread(target=pump, args=(name, procs[name].stdout), daemon=True).start()
        if name == "api":   # the gateway and client can start while the API loads its tables
            time.sleep(0.5)

    def report():
        t0 = time.time(); shown = set()
        while time.time() - t0 < 90 and len(shown) < len(want):
            for name in want:
                if name not in shown and up(parts[name]["check"]):
                    shown.add(name); print(f"\n  OK  {name:<8} is answering at {parts[name]['check']}\n", flush=True)
            time.sleep(1)
        if len(shown) == len(want):
            print("  Everything is up.  App: http://localhost:5173   (developer dashboard: http://localhost:5173/#ops)\n", flush=True)
        else:
            print("  Not answering yet: " + ", ".join(n for n in want if n not in shown) + ". Read the lines above for the reason.\n", flush=True)
    threading.Thread(target=report, daemon=True).start()

    try:
        while True:
            for name, pr in list(procs.items()):
                if pr.poll() is not None:
                    print(f"\n[{name}] stopped with code {pr.returncode}. Stopping the others.", flush=True); stop_all(); return pr.returncode or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping all...", flush=True); stop_all(); print("Stopped."); return 0


if __name__ == "__main__":
    sys.exit(main())
