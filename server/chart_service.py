"""
Chart Service - Generates Real Charts and Stores Them on Cloudinary

Only triggers for questions where a visual genuinely helps - detected
by checking if the generated SQL used CORR(colA, colB). Simple
single-value questions (counts, averages) don't get a chart - a chart
would add nothing there and just slow the response down.

Charts are uploaded to Cloudinary under the "DEM-Correction-Model"
folder, and the resulting URL is what gets cached by cache_service.py -
this is the actual point of using Cloudinary here: a reworded repeat
of the same question serves the SAME image URL instantly, instead of
regenerating and re-uploading a new chart every time.
"""

import os
import re
import io

import matplotlib
matplotlib.use("Agg")  # no display backend needed - this runs on a server
import matplotlib.pyplot as plt
import cloudinary
import cloudinary.uploader

from . import duckdb_service

CLOUDINARY_FOLDER = "DEM-Correction-Model"
SAMPLE_SIZE = 2000  # enough points for a meaningful scatter, small enough to render fast

_cloudinary_configured = False


def _ensure_cloudinary_configured():
    global _cloudinary_configured
    if _cloudinary_configured:
        return
    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    )
    _cloudinary_configured = True


def detect_correlation_columns(sql: str):
    """Returns (col_a, col_b) if the SQL used CORR(colA, colB), else None."""
    match = re.search(r"CORR\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)", sql, re.IGNORECASE)
    if match:
        return match.group(1), match.group(2)
    return None


def generate_scatter_chart(col_a: str, col_b: str, correlation_value: float):
    """
    Queries a real sample of the two columns and renders an actual
    matplotlib scatter plot - not a mock image, real data points from
    the golden dataset.

    FIX (from a real reproduced parser error): DuckDB's `USING SAMPLE`
    hit a genuine syntax error when combined with WHERE against
    `golden_dataset` specifically, since that's a VIEW wrapping
    read_parquet() rather than a plain physical table - the simple
    docs examples don't hit this edge case. Switched to the simpler,
    universally-supported `ORDER BY random() LIMIT n` instead.

    This intentionally bypasses duckdb_service.run_query() (which caps
    everything at 200 rows via the shared safety validator meant for
    untrusted, LLM-generated SQL). col_a/col_b here were already
    extracted via a strict \\w+ regex from SQL that already passed
    validation, so they can only ever be real column identifiers -
    safe by construction. A dedicated, larger row cap (2000) gives a
    more visually meaningful scatter plot than the LLM-facing 200 cap.
    """
    conn = duckdb_service.get_connection()
    sample_sql = (
        f"SELECT {col_a}, {col_b} FROM golden_dataset "
        f"WHERE {col_a} IS NOT NULL AND {col_b} IS NOT NULL "
        f"ORDER BY random() LIMIT {SAMPLE_SIZE}"
    )
    result = conn.execute(sample_sql)
    columns = [desc[0] for desc in result.description]
    rows = [dict(zip(columns, row)) for row in result.fetchall()]

    x_values = [r[col_a] for r in rows]
    y_values = [r[col_b] for r in rows]

    fig, ax = plt.subplots(figsize=(6, 4.5), facecolor="#0f172a")
    ax.set_facecolor("#0f172a")
    ax.scatter(x_values, y_values, s=8, alpha=0.35, color="#5eead4")
    ax.set_xlabel(col_a, color="#94a3b8")
    ax.set_ylabel(col_b, color="#94a3b8")
    ax.set_title(f"{col_a} vs {col_b}  (r = {correlation_value:.3f})", color="#ffffff", fontsize=13)
    ax.tick_params(colors="#64748b")
    for spine in ax.spines.values():
        spine.set_color("#334155")
    fig.tight_layout()

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=120, facecolor=fig.get_facecolor())
    plt.close(fig)
    buffer.seek(0)
    return buffer


def upload_chart(image_buffer, public_id: str) -> str:
    """Uploads to Cloudinary under the DEM-Correction-Model folder, returns the real URL."""
    _ensure_cloudinary_configured()
    result = cloudinary.uploader.upload(
        image_buffer,
        folder=CLOUDINARY_FOLDER,
        public_id=public_id,
        overwrite=True,
        resource_type="image",
    )
    return result["secure_url"]


def maybe_generate_chart(sql: str, results: list):
    """
    Main entry point - returns a Cloudinary URL if this question
    warrants a chart, or None if it doesn't (e.g. a simple count/single
    value question, where a chart would add nothing).
    """
    corr_columns = detect_correlation_columns(sql)
    if not corr_columns or not results:
        return None

    col_a, col_b = corr_columns
    correlation_value = list(results[0].values())[0]

    try:
        image_buffer = generate_scatter_chart(col_a, col_b, correlation_value)
        public_id = f"scatter_{col_a}_vs_{col_b}"
        return upload_chart(image_buffer, public_id)
    except Exception as e:
        print(f"[Chart] Generation/upload failed, continuing without a chart: {e}")
        return None