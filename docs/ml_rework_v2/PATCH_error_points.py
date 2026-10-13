# Replace the body of get_error_points() in server/dem_comparison_routes.py (decorator and signature stay the same).
# Uses OUT-OF-FOLD predictions (each point predicted by a model that never saw its own longitude strip), so the
# Dashboard numbers are honest. Same response keys as before. Needs model/saved/oof_predictions.parquet (make_oof_v2.py).
@router.get("/error-points/{year}")
def get_error_points(year: int, sample_size: int = 400):
    import pandas as pd
    oof_path = Path(__file__).parent.parent / "model" / "saved" / "oof_predictions.parquet"   # adjust if your layout differs
    if not oof_path.exists():
        raise HTTPException(status_code=404, detail="Out-of-fold predictions not found - run model/training/make_oof_v2.py")
    df = pd.read_parquet(oof_path)
    sample = df.sample(n=min(sample_size, len(df)), random_state=42)
    points = []
    for row in sample.itertuples(index=False):
        old_error = float(row.elevation_error_signed)
        new_error = old_error - float(row.oof_pred)          # same algebra as before: ref - (raw + predicted)
        points.append({
            "lat": float(row.latitude), "lng": float(row.longitude),
            "old_error": round(old_error, 2), "new_error": round(new_error, 2),
            "was_error_point": abs(old_error) > ERROR_THRESHOLD_M,
            "is_corrected": abs(old_error) > ERROR_THRESHOLD_M and abs(new_error) <= ERROR_THRESHOLD_M,
        })
    total_error_points = sum(1 for p in points if p["was_error_point"])
    corrected_points = sum(1 for p in points if p["is_corrected"])
    remaining_error_points = sum(1 for p in points if p["was_error_point"] and not p["is_corrected"])
    avg_correction = sum(p["new_error"] - p["old_error"] for p in points) / len(points) if points else 0
    return {
        "year": year, "threshold_m": ERROR_THRESHOLD_M, "total_error_points": total_error_points,
        "corrected_points": corrected_points, "remaining_error_points": remaining_error_points,
        "reduction_pct": round(100 * corrected_points / total_error_points, 1) if total_error_points else 0,
        "avg_correction_m": round(avg_correction, 2), "points": points,
        "evaluation": "out-of-fold (spatially held-out) predictions",
    }
