import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Info, ChevronDown, CheckCircle2 } from "lucide-react";
import {
  fetchGroups,
  fetchFeaturesForGroup,
  fetchGroupCorrelation,
  fetchTargetCorrelation,
  fetchScatterSample,
  fetchSpatialGrid,
  fetchSpatialHexbin,
  fetchMoransScatter,
  fetchVariogram,
} from "../lib/edaApi";
import StatTile from "../components/eda/StatTile";
import BoxPlot from "../components/eda/BoxPlot";
import ScatterPlot from "../components/eda/ScatterPlot";
import HistogramChart from "../components/analytics/HistogramChart";
import CorrelationMatrix from "../components/eda/CorrelationMatrix";
import MoransScatterPlot from "../components/eda/MoransScatterPlot";
import VariogramChart from "../components/eda/VariogramChart";
import SpatialDensityMap from "../components/eda/SpatialDensityMap";

// The existing HistogramChart expects an array of {count} objects - our
// API returns bin_edges + counts as two separate arrays, so this adapts
// one shape to the other without touching the existing chart component.
function toHistogramBins(histogram) {
  if (!histogram) return [];
  return histogram.counts.map((count) => ({ count }));
}

export default function EDAPage() {
  const [groupKey, setGroupKey] = useState(null);
  const [featureName, setFeatureName] = useState(null);

  const groupsQuery = useQuery({
    queryKey: ["eda-groups"],
    queryFn: fetchGroups,
  });

  // default to the first group once groups load
  useEffect(() => {
    if (groupsQuery.data && !groupKey) {
      setGroupKey(Object.keys(groupsQuery.data)[0]);
    }
  }, [groupsQuery.data, groupKey]);

  const featuresQuery = useQuery({
    queryKey: ["eda-features", groupKey],
    queryFn: () => fetchFeaturesForGroup(groupKey),
    enabled: !!groupKey,
  });

  // default to the first feature once a group's features load
  useEffect(() => {
    if (featuresQuery.data) {
      setFeatureName(Object.keys(featuresQuery.data.features)[0]);
    }
  }, [featuresQuery.data]);

  const correlationQuery = useQuery({
    queryKey: ["eda-correlation", groupKey],
    queryFn: () => fetchGroupCorrelation(groupKey),
    enabled: !!groupKey,
  });

  // Every feature's correlation with the actual TARGET (elevation error) -
  // this is different from the group's internal matrix above: that shows
  // features correlating with EACH OTHER, this shows which ones actually
  // matter for predicting the error itself.
  const targetCorrelationQuery = useQuery({
    queryKey: ["eda-target-correlation"],
    queryFn: fetchTargetCorrelation,
  });

  const TARGET_COLUMN = "elevation_error_signed";
  const isTargetItself = featureName === TARGET_COLUMN;

  // Scatter sample for the currently selected feature vs. the target.
  // FIX (from a real 404 loop): the scatter precompute script correctly
  // never builds a "target vs itself" entry - plotting
  // elevation_error_signed against itself is meaningless. `enabled`
  // now also checks isTargetItself, so the frontend stops trying to
  // fetch something that was never meant to exist, instead of
  // hammering the API with a doomed request every time this one
  // specific feature is selected.
  const scatterQuery = useQuery({
    queryKey: ["eda-scatter", featureName],
    queryFn: () => fetchScatterSample(featureName),
    enabled: !!featureName && !isTargetItself,
  });

  // Spatial section - dataset-wide, not tied to the selected group,
  // so these load once and stay available regardless of dropdown state
  const [spatialMode, setSpatialMode] = useState("grid"); // "grid" or "hexbin"
  const [spatialValueColumn, setSpatialValueColumn] = useState("elevation_error_signed");

  const spatialGridQuery = useQuery({ queryKey: ["eda-spatial-grid"], queryFn: fetchSpatialGrid });
  const spatialHexbinQuery = useQuery({ queryKey: ["eda-spatial-hexbin"], queryFn: fetchSpatialHexbin });
  const moransQuery = useQuery({ queryKey: ["eda-morans"], queryFn: fetchMoransScatter });
  const variogramQuery = useQuery({ queryKey: ["eda-variogram"], queryFn: fetchVariogram });

  if (groupsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-ink-400 text-sm">
        Loading EDA data...
      </div>
    );
  }

  if (groupsQuery.isError) {
    return (
      <div className="flex items-center justify-center h-full text-signal-red text-sm">
        Could not reach the EDA API. Is the backend running on localhost:8000?
      </div>
    );
  }

  const groups = groupsQuery.data;
  const activeGroup = groupKey ? groups[groupKey] : null;
  const activeFeature =
    featuresQuery.data && featureName
      ? featuresQuery.data.features[featureName]
      : null;

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-y-auto">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 px-5 h-auto min-h-[56px] py-2 border-b border-ink-700/60 shrink-0">
        <div className="flex items-center gap-2 text-[13px] font-mono tracking-[0.15em] text-ink-400 uppercase shrink-0">
          <Sparkles size={14} className="text-signal-teal" />
          GEOINT / EDA
        </div>

        {/* Group dropdown */}
        <div className="relative">
          <select
            value={groupKey ?? ""}
            onChange={(e) => setGroupKey(e.target.value)}
            className="appearance-none bg-ink-900 border border-ink-700 rounded-lg pl-3 pr-7 py-1.5 text-[12px] text-ink-200"
          >
            {Object.entries(groups).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label}
              </option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
        </div>

        <span className="inline-flex items-center gap-1 text-[12px] font-mono uppercase tracking-wide text-signal-green bg-signal-green/10 border border-signal-green/30 rounded-full px-2 py-1 ml-auto">
          <CheckCircle2 size={10} /> Live - Golden Dataset (1,221,354 rows)
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {activeGroup && (
          <div>
            <h1 className="font-display text-lg font-semibold text-white">{activeGroup.label}</h1>
            <p className="text-[12px] text-ink-400">{activeGroup.description}</p>
          </div>
        )}

        {/* Statistics + Distribution for the selected feature */}
        <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-white">Statistics & Distribution</h3>
            <div className="relative">
              <select
                value={featureName ?? ""}
                onChange={(e) => setFeatureName(e.target.value)}
                disabled={!featuresQuery.data}
                className="appearance-none bg-ink-800 border border-ink-700 rounded-lg pl-3 pr-7 py-1.5 text-[13px] text-ink-200 max-w-[260px]"
              >
                {featuresQuery.data &&
                  Object.entries(featuresQuery.data.features).map(([key, f]) => (
                    <option key={key} value={key}>
                      {f.full_name}
                    </option>
                  ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
            </div>
          </div>

          {activeFeature && (
            <>
              <p className="text-[13px] text-ink-400 mb-3 flex items-start gap-1.5">
                <Info size={12} className="mt-0.5 shrink-0 text-signal-sky" />
                {activeFeature.meaning}
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Numeric stat tiles - from the precomputed box plot data */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-[13px] content-start">
                  {activeFeature.boxplot && [
                    ["Valid points", activeFeature.boxplot.n_valid.toLocaleString()],
                    ["Missing %", `${activeFeature.boxplot.missing_pct}%`],
                    ["Min", activeFeature.boxplot.min.toFixed(3)],
                    ["Lower Whisker", activeFeature.boxplot.lower_whisker.toFixed(3)],
                    ["Q1", activeFeature.boxplot.q1.toFixed(3)],
                    ["Median", activeFeature.boxplot.median.toFixed(3)],
                    ["Q3", activeFeature.boxplot.q3.toFixed(3)],
                    ["Upper Whisker", activeFeature.boxplot.upper_whisker.toFixed(3)],
                    ["Max", activeFeature.boxplot.max.toFixed(3)],
                    ["Outliers", activeFeature.boxplot.outlier_count.toLocaleString()],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-ink-800/60 rounded-lg px-2.5 py-2">
                      <div className="text-ink-500">{label}</div>
                      <div className="font-mono text-white">{value}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-[12px] uppercase tracking-wide text-ink-500 mb-1">
                    {activeFeature.full_name} distribution
                  </div>
                  <HistogramChart bins={toHistogramBins(activeFeature.histogram)} color="#5eead4" height={100} />

                  <div className="text-[12px] uppercase tracking-wide text-ink-500 mb-1 mt-3">
                    Box Plot
                  </div>
                  <BoxPlot stats={activeFeature.boxplot} color="#5eead4" height={70} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Scatter: selected feature vs. the target */}
        <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-4">
          <h3 className="text-base font-semibold text-white mb-1">
            {activeFeature?.full_name ?? featureName} vs. Elevation Error
          </h3>
          <p className="text-[13px] text-ink-400 mb-3">
            Each dot is one of 5,000 sampled points. Look for a slope or curve - a flat,
            random-looking cloud means this feature has little relationship with the error on its own.
          </p>
          {scatterQuery.data ? (
            <ScatterPlot
              xValues={scatterQuery.data.x_values}
              yValues={scatterQuery.data.y_values}
              xLabel={activeFeature?.full_name ?? featureName}
              yLabel="Elevation Error (m)"
              correlation={
                targetCorrelationQuery.data && featureName
                  ? targetCorrelationQuery.data[featureName]
                  : undefined
              }
              height={220}
            />
          ) : isTargetItself ? (
            <p className="text-[13px] text-ink-500">
              This is the target itself, so there's nothing to plot it against - pick
              a different feature above to see its relationship with the error.
            </p>
          ) : (
            <p className="text-[13px] text-ink-500">Loading scatter sample...</p>
          )}
        </div>

        {/* Correlation with target - "which features actually matter" */}
        <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-4">
          <h3 className="text-base font-semibold text-white mb-1">
            Contribution to Elevation Error - {activeGroup?.label}
          </h3>
          <p className="text-[13px] text-ink-400 mb-3">
            How strongly each feature in this group relates to the actual elevation error.
            Further from zero (either direction) means more contribution; near zero means
            this feature likely adds little predictive value on its own.
          </p>
          {targetCorrelationQuery.data && featuresQuery.data ? (
            <div className="space-y-1.5">
              {Object.keys(featuresQuery.data.features)
                .filter((name) => name in targetCorrelationQuery.data)
                .sort(
                  (a, b) =>
                    Math.abs(targetCorrelationQuery.data[b]) -
                    Math.abs(targetCorrelationQuery.data[a])
                )
                .map((name) => {
                  const corr = targetCorrelationQuery.data[name];
                  const strength = Math.abs(corr);
                  const isPositive = corr >= 0;
                  const barColor = isPositive ? "#5eead4" : "#f2545b";
                  const label =
                    strength >= 0.4 ? "Strong" : strength >= 0.15 ? "Moderate" : "Weak";
                  return (
                    <div key={name} className="flex items-center gap-3 text-[13px]">
                      <span className="w-40 shrink-0 text-ink-300 truncate">
                        {featuresQuery.data.features[name]?.full_name ?? name}
                      </span>
                      <div className="flex-1 h-4 bg-ink-800/60 rounded relative overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${strength * 100}%`,
                            backgroundColor: barColor,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="w-12 shrink-0 font-mono text-right text-ink-200">
                        {corr.toFixed(3)}
                      </span>
                      <span
                        className="w-16 shrink-0 text-[12px] uppercase tracking-wide"
                        style={{ color: barColor }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-[13px] text-ink-500">Loading...</p>
          )}
        </div>

        {/* Correlation matrix for the selected group */}
        <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-4">
          <h3 className="text-base font-semibold text-white mb-3">
            Correlation Matrix - {activeGroup?.label}
          </h3>
          {correlationQuery.data ? (
            <CorrelationMatrix
              columns={correlationQuery.data.features}
              matrix={correlationQuery.data.matrix}
            />
          ) : (
            <p className="text-[13px] text-ink-500">Loading correlation data...</p>
          )}
        </div>

        {/* ============================================================
            SPATIAL ANALYSIS SECTION - dataset-wide, always visible
            regardless of which feature group is selected above, since
            the underlying spatial data isn't scoped to one group.
           ============================================================ */}
        <div className="pt-2">
          <h2 className="font-display text-base font-semibold text-white mb-3">Spatial Analysis</h2>
        </div>

        {/* Grid / Hexbin density map */}
        <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-base font-semibold text-white">Spatial Density Map</h3>
            <div className="flex items-center gap-2">
              <select
                value={spatialValueColumn}
                onChange={(e) => setSpatialValueColumn(e.target.value)}
                className="appearance-none bg-ink-800 border border-ink-700 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-200"
              >
                <option value="raw_z">Raw Elevation</option>
                <option value="elevation_error_signed">Elevation Error</option>
                <option value="ndvi">NDVI</option>
                <option value="slope_deg">Slope</option>
              </select>
              <div className="flex rounded-lg overflow-hidden border border-ink-700">
                <button
                  onClick={() => setSpatialMode("grid")}
                  className={`px-3 py-1.5 text-[13px] ${spatialMode === "grid" ? "bg-signal-teal/20 text-signal-teal" : "text-ink-400"}`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setSpatialMode("hexbin")}
                  className={`px-3 py-1.5 text-[13px] ${spatialMode === "hexbin" ? "bg-signal-teal/20 text-signal-teal" : "text-ink-400"}`}
                >
                  Hexbin
                </button>
              </div>
            </div>
          </div>
          <p className="text-[13px] text-ink-400 mb-1">
            Each cell shows the average value across all points inside it - individual
            points aren't plotted directly since 1.2 million dots would overlap into
            an unreadable blob.
          </p>
          <p className="text-[12px] text-ink-500 mb-3">
            <span className="text-ink-300 font-medium">Grid:</span> simple square cells, fast to read. {" "}
            <span className="text-ink-300 font-medium">Hexbin:</span> hexagonal cells - every
            neighboring cell sits at the same distance in every direction, giving a more
            geometrically honest picture of density than squares (whose diagonal
            neighbors are farther away than their edge neighbors).
          </p>
          <SpatialDensityMap
            data={spatialMode === "grid" ? spatialGridQuery.data : spatialHexbinQuery.data}
            mode={spatialMode}
            valueColumn={spatialValueColumn}
            height={400}
          />
        </div>

        {/* Moran's Scatter + Variogram, side by side on wide screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-4">
            <h3 className="text-base font-semibold text-white mb-1">Moran's Scatter Plot</h3>
            <p className="text-[13px] text-ink-400 mb-3">
              Checks whether nearby points tend to have similar elevation values
              (spatial clustering) or not.
            </p>
            {moransQuery.data ? (
              <MoransScatterPlot data={moransQuery.data} height={260} />
            ) : (
              <p className="text-[13px] text-ink-500">Loading...</p>
            )}
          </div>

          <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-4">
            <h3 className="text-base font-semibold text-white mb-1">Variogram</h3>
            <p className="text-[13px] text-ink-400 mb-3">
              Shows how quickly points stop influencing each other as distance grows -
              informs the block size used for spatial cross-validation later.
            </p>
            {variogramQuery.data ? (
              <VariogramChart data={variogramQuery.data} height={260} />
            ) : (
              <p className="text-[13px] text-ink-500">Loading...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}