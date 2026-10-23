"""Load the stored benchmark results into MLflow as experiment history (master prompt section 30).
History only: this does not train, does not touch model/saved, and does not change the benchmark database.
Run from the repo root:  uv run python model/tracking/import_benchmark.py [--db path/to/benchmark.db] [--eval-summary path] [--root .]
One MLflow run per stored result row (model, protocol, config, stage), the per-fold scores as step metrics, and one summary run with the
decision record. Safe to run twice: rows already imported are skipped. Needs:  uv add mlflow"""
from __future__ import annotations
import argparse, json, sqlite3, sys, time
from pathlib import Path

EXPERIMENT = "dem-correction-benchmark"
PROD = "LightGBM (tuned, production)"
SKIP = {".venv", "node_modules", ".git", "mlflow", "__pycache__"}

def find_db(root: Path):
    c = [p for p in root.rglob("benchmark.db") if not (set(p.relative_to(root).parts) & SKIP)]
    return sorted(c, key=lambda p: len(p.parts))[0] if c else None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--root", default="."); ap.add_argument("--db"); ap.add_argument("--eval-summary"); ap.add_argument("--tracking-uri"); a = ap.parse_args()
    root = Path(a.root).resolve(); db = Path(a.db) if a.db else find_db(root)
    if not db or not db.exists(): sys.exit("STOP: benchmark.db not found. Pass --db <path>.")
    try:
        import mlflow
        from mlflow.entities import Metric, Param, RunTag
        from mlflow import MlflowClient
    except ImportError:
        sys.exit("STOP: MLflow is not installed. Run:  uv add mlflow")
    store = root / "mlflow"; (store / "artifacts").mkdir(parents=True, exist_ok=True)
    uri = a.tracking_uri or f"sqlite:///{(store / 'mlflow.db').as_posix()}"
    mlflow.set_tracking_uri(uri); client = MlflowClient(tracking_uri=uri)
    exp = client.get_experiment_by_name(EXPERIMENT)
    exp_id = exp.experiment_id if exp else client.create_experiment(EXPERIMENT, artifact_location=(store / "artifacts").as_uri())
    con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True); con.row_factory = sqlite3.Row
    have = set()
    for r in client.search_runs([exp_id], max_results=50000):
        k = r.data.tags.get("row_key")
        if k: have.add(k)
    folds = {}
    for f in con.execute("select * from folds"): folds.setdefault((f["stage"], f["protocol"], f["config"], f["model"]), []).append(f)
    new = 0; prod_run = None; now = int(time.time() * 1000)
    for row in con.execute("select * from results"):
        key = "|".join(str(row[k]) for k in ("stage", "protocol", "config", "model"))
        if key in have:
            continue
        name = f"{row['stage']} | {row['protocol']} | {row['config']} | {row['model']}"
        run = client.create_run(exp_id, tags={"mlflow.runName": name})
        rid = run.info.run_id
        params = [Param(k, str(row[k])) for k in ("stage", "protocol", "config", "model", "n_train", "n_eval") if row[k] is not None]
        metrics = [Metric(k, float(row[k]), now, 0) for k in ("rmse", "mae", "r2", "rmse_std", "fit_seconds") if row[k] is not None]
        for f in folds.get((row["stage"], row["protocol"], row["config"], row["model"]), []):
            for k in ("rmse", "mae", "r2"):
                if f[k] is not None: metrics.append(Metric(f"fold_{k}", float(f[k]), now, int(f["fold"])))
        tags = [RunTag("row_key", key), RunTag("imported_from", "benchmark.db"), RunTag("source", str(row["source"])), RunTag("created_utc", str(row["created_utc"])),
                RunTag("production", "true" if row["model"] == PROD else "false")]
        if row["note"]: tags.append(RunTag("note", str(row["note"])[:5000]))
        if row["extra"]: tags.append(RunTag("extra", str(row["extra"])[:5000]))
        client.log_batch(rid, metrics=metrics, params=params, tags=tags)
        client.set_terminated(rid)
        if row["model"] == PROD and row["protocol"] == "spatial" and row["stage"] == "benchmark": prod_run = rid
        new += 1
    # summary run: the decision record and the evaluation summary file as artifacts
    meta = {r["key"]: r["value"] for r in con.execute("select * from meta")}
    if "summary|benchmark-meta" not in have:
        run = client.create_run(exp_id, tags={"mlflow.runName": "benchmark meta and decision", "row_key": "summary|benchmark-meta", "imported_from": "benchmark.db"})
        client.log_batch(run.info.run_id, params=[Param(k[:250], str(v)[:5000]) for k, v in meta.items()][:100])
        tmp = store / "benchmark_meta.json"; tmp.write_text(json.dumps(meta, indent=1), encoding="utf-8"); client.log_artifact(run.info.run_id, str(tmp)); client.set_terminated(run.info.run_id); new += 1
    ev = Path(a.eval_summary) if a.eval_summary else next((p for p in root.rglob("eval_summary.json") if not (set(p.relative_to(root).parts) & SKIP)), None)
    if ev and ev.exists() and prod_run:
        client.log_artifact(prod_run, str(ev)); print("attached", ev, "to the production run")
    print(f"MLflow store: {store}\nExperiment: {EXPERIMENT}  |  new runs this time: {new}  |  already there: {len(have)}")
    print(f"To open the MLflow page:  uv run mlflow server --host 127.0.0.1 --port 5000 --backend-store-uri {uri} --default-artifact-root {(store / 'artifacts').as_uri()}")

if __name__ == "__main__": main()
