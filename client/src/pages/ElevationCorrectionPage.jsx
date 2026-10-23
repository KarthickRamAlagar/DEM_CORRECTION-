import { API_BASE as API_BASE_ROOT } from "../lib/apiBase";
import { useState, useEffect } from "react";
import MapComparisonView from "../components/MapComparisonView";
import ErrorPointsDashboard from "../components/ErrorPointsDashboard";

const API_BASE = `${API_BASE_ROOT}/dem`;

export default function ElevationCorrectionPage() {
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [viewMode, setViewMode] = useState("map");
  const [loading, setLoading] = useState(true);

  // FIX (real performance bug found in testing): dashboard data now
  // lives HERE, in the parent, keyed by year - not inside
  // ErrorPointsDashboard itself. Previously, toggling away from
  // Dashboard view unmounted that component entirely, losing its
  // fetched data - toggling back triggered a fresh, expensive
  // re-fetch (300 real model predictions) every single time. Now the
  // data survives toggling, and only re-fetches if the year changes.
  const [dashboardDataByYear, setDashboardDataByYear] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/available-years`)
      .then((res) => res.json())
      .then((data) => {
        setAvailableYears(data.available_years);
        if (data.available_years.length > 0) {
          setSelectedYear(data.available_years[0]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      <div className="px-6 pt-6 pb-4 shrink-0">
        <p className="text-[11px] font-mono tracking-[0.15em] uppercase text-ink-400">
          GEOINT / Elevation Error Correction
        </p>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">
              View Elevation Error Correction
            </h1>
            <p className="mt-1 text-sm text-ink-400">
              Compare the original CartoDEM against the ML-corrected elevation, validated
              against real ICESat-2 ground truth.
            </p>
          </div>

          {availableYears.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-ink-800 border border-ink-700 rounded-lg p-0.5 mr-2">
                <button
                  onClick={() => setViewMode("map")}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                    viewMode === "map" ? "bg-ink-700 text-white" : "text-ink-400"
                  }`}
                >
                  Map View
                </button>
                <button
                  onClick={() => setViewMode("dashboard")}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                    viewMode === "dashboard" ? "bg-ink-700 text-white" : "text-ink-400"
                  }`}
                >
                  Dashboard View
                </button>
              </div>
              <span className="text-[12px] text-ink-400">Year:</span>
              <select
                value={selectedYear ?? ""}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-1.5 text-[13px] text-white"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-ink-400 text-sm">
            Checking available years...
          </div>
        ) : availableYears.length === 0 ? (
          <div className="flex items-center justify-center h-full text-ink-400 text-sm text-center px-8">
            No corrected DEM available yet.
            <br />
            Run model/apply_raster_correction.py --year 2022 first.
          </div>
        ) : (
          <>
            {viewMode === "map" && <MapComparisonView year={selectedYear} />}
            {viewMode === "dashboard" && (
              <ErrorPointsDashboard
                year={selectedYear}
                cachedData={dashboardDataByYear[selectedYear]}
                onDataLoaded={(data) =>
                  setDashboardDataByYear((prev) => ({ ...prev, [selectedYear]: data }))
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}