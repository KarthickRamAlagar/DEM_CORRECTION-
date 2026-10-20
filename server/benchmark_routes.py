"""
Benchmark study results (read-only). The numbers are computed ONCE by model/benchmark/run_benchmark.py and stored in SQLite.
GET /api/benchmark/summary   -> everything the Evaluation page needs in one call (small payload)
GET /api/benchmark/status    -> which DB is being served and whether it is a self-test sample
DB used: model/saved/benchmark.db (real run); falls back to benchmark_sample.db (self-test, flagged) if the real one is absent.
"""
import json, sqlite3
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])
SAVED = Path(__file__).parent.parent / "model" / "saved"


def _db_path():
    for n in ("benchmark.db", "benchmark_sample.db"):
        if (SAVED / n).exists():
            return SAVED / n
    raise HTTPException(status_code=404, detail="No benchmark DB found - run: uv run python model/benchmark/run_benchmark.py --stages all")


def _conn():
    p = _db_path()
    c = sqlite3.connect(f"file:{p.as_posix()}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    return c, p


def _meta(c):
    return {r["key"]: json.loads(r["value"]) for r in c.execute("SELECT key, value FROM meta")}


@router.get("/status")
def status():
    c, p = _conn()
    m = _meta(c)
    return {"db": p.name, "self_test_sample": bool(m.get("self_test_subsample", False)), "rows_used": m.get("n_rows_total"),
            "last_run_utc": m.get("last_run_utc")}


@router.get("/summary")
def summary():
    c, p = _conn()
    m = _meta(c)
    rows = []
    for r in c.execute("SELECT * FROM results"):
        d = dict(r)
        d["extra"] = json.loads(d["extra"]) if d["extra"] else None
        rows.append(d)
    folds = [dict(r) for r in c.execute("SELECT * FROM folds")]
    samples = {f"{r['protocol']}|{r['model']}|{r['kind']}": json.loads(r["payload"]) for r in c.execute("SELECT * FROM samples")}
    return {"db": p.name, "meta": m, "results": rows, "folds": folds, "samples": samples}
