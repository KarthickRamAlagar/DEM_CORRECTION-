"""
DuckDB Service - Ask Your Data Backend, Phase 1

CRITICAL SAFETY LAYER: an LLM-generated SQL query is never trusted
blindly. Every query passes through validate_sql() before execution -
this is not optional hardening, it's the difference between a safe
demo and one that can return 1.2M rows into a browser or attempt a
destructive statement because the LLM misunderstood the question.
"""

import re
import duckdb
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

GOLDEN_DATASET_PATH = Path(__file__).parent.parent / "data" / "final" / "golden_dataset.parquet"
MAX_ROWS = 200
QUERY_TIMEOUT_SECONDS = 10

_connection = None
_executor = ThreadPoolExecutor(max_workers=4)


def get_connection():
    """One shared, read-only DuckDB connection, reused across requests."""
    global _connection
    if _connection is None:
        _connection = duckdb.connect(database=":memory:", read_only=False)
        _connection.execute(
            f"CREATE VIEW golden_dataset AS SELECT * FROM read_parquet('{GOLDEN_DATASET_PATH}')"
        )
    return _connection


class UnsafeSQLError(Exception):
    pass


def validate_sql(sql: str) -> str:
    """
    The mandatory safety gate. Raises UnsafeSQLError for anything that
    isn't a plain SELECT, or that lacks a row limit. Never skip this,
    regardless of how the SQL was generated or how trustworthy it looks.
    """
    cleaned = sql.strip().rstrip(";")
    upper = cleaned.upper()

    if not upper.startswith("SELECT") and not upper.startswith("WITH"):
        raise UnsafeSQLError("Only SELECT queries are allowed.")

    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
                 "ATTACH", "COPY", "EXPORT", "IMPORT", "PRAGMA", "CALL"]
    for word in forbidden:
        # word boundary check - avoids false positives like a column
        # literally named "created_at" containing "CREATE"
        if re.search(rf"\b{word}\b", upper):
            raise UnsafeSQLError(f"Query contains a forbidden keyword: {word}")

    if ";" in cleaned:
        raise UnsafeSQLError("Multiple statements are not allowed.")

    # Enforce a row cap regardless of what the LLM wrote - if it didn't
    # include LIMIT, or included one higher than our cap, we override it
    limit_match = re.search(r"\bLIMIT\s+(\d+)", upper)
    if limit_match and int(limit_match.group(1)) <= MAX_ROWS:
        return cleaned
    cleaned = re.sub(r"\bLIMIT\s+\d+", "", cleaned, flags=re.IGNORECASE)
    return f"{cleaned} LIMIT {MAX_ROWS}"


class QueryTimeoutError(Exception):
    pass


def _execute_blocking(safe_sql: str):
    conn = get_connection()
    result = conn.execute(safe_sql)
    columns = [desc[0] for desc in result.description]
    rows = result.fetchall()
    return [dict(zip(columns, row)) for row in rows]


def run_query(sql: str):
    """
    Validates, then executes with a REAL timeout - DuckDB's Python API
    has no built-in statement_timeout, so this runs the blocking query
    in a worker thread and gives up after QUERY_TIMEOUT_SECONDS if it
    hasn't returned, rather than letting a runaway query hang the
    server indefinitely.
    """
    safe_sql = validate_sql(sql)
    future = _executor.submit(_execute_blocking, safe_sql)
    try:
        return future.result(timeout=QUERY_TIMEOUT_SECONDS)
    except FutureTimeoutError:
        raise QueryTimeoutError(f"Query did not complete within {QUERY_TIMEOUT_SECONDS}s")