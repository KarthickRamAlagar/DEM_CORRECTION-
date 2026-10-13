// Box Plot - shows min, lower whisker, Q1, median, Q3, upper whisker, max
// as a single horizontal box-and-whisker, matching the precomputed stats
// shape from eda/compute_boxplot_stats.py
//
// FIX (from real rendering bug): the chart was scaled using min-to-max,
// but a single extreme outlier (e.g. max=82 when the box itself sits
// between 3-5.5) stretched the whole chart, squashing the actually
// informative part into a tiny sliver. Standard box plots scale to the
// WHISKER range, not the true min/max - outliers beyond the whiskers
// are shown as separate small dots instead of stretching the axis.

export default function BoxPlot({ stats, color = "#5eead4", height = 110 }) {
  if (!stats) return null;

  const { min, lower_whisker, q1, median, q3, upper_whisker, max } = stats;
  const w = 600;
  const h = height;
  const padding = 30;
  const plotW = w - padding * 2;

  // Scale based on the WHISKER range (with some breathing room), not
  // the true min/max - this keeps the box readable even when there
  // are extreme outliers far beyond the whiskers.
  const whiskerRange = upper_whisker - lower_whisker || 1;
  const scaleMin = lower_whisker - whiskerRange * 0.3;
  const scaleMax = upper_whisker + whiskerRange * 0.3;
  const scaleSpan = scaleMax - scaleMin || 1;

  const scale = (v) => padding + ((v - scaleMin) / scaleSpan) * plotW;
  // clamp so extreme outlier markers stay visible at the chart edge
  // instead of disappearing off-screen
  const clampedScale = (v) => Math.max(padding - 8, Math.min(w - padding + 8, scale(v)));

  const midY = h / 2 + 20; // shifted down further to fit the two-level label stack above
  const boxHeight = h * 0.28;

  const minIsOutlier = min < lower_whisker;
  const maxIsOutlier = max > upper_whisker;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      {/* whisker line: lower_whisker to upper_whisker ONLY - not min/max */}
      <line x1={scale(lower_whisker)} y1={midY} x2={scale(upper_whisker)} y2={midY} stroke={color} strokeWidth="1.5" opacity="0.6" />

      {/* whisker end caps */}
      <line x1={scale(lower_whisker)} y1={midY - 8} x2={scale(lower_whisker)} y2={midY + 8} stroke={color} strokeWidth="1.5" />
      <line x1={scale(upper_whisker)} y1={midY - 8} x2={scale(upper_whisker)} y2={midY + 8} stroke={color} strokeWidth="1.5" />

      {/* box: Q1 to Q3 */}
      <rect
        x={scale(q1)}
        y={midY - boxHeight / 2}
        width={Math.max(scale(q3) - scale(q1), 1)}
        height={boxHeight}
        fill={color}
        opacity="0.25"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* median line */}
      <line x1={scale(median)} y1={midY - boxHeight / 2} x2={scale(median)} y2={midY + boxHeight / 2} stroke={color} strokeWidth="2.5" />

      {/* outlier markers - only shown if min/max actually fall beyond
          the whiskers, clamped to stay within the visible chart area */}
      {minIsOutlier && (
        <circle cx={clampedScale(min)} cy={midY} r="3" fill={color} opacity="0.8" />
      )}
      {maxIsOutlier && (
        <circle cx={clampedScale(max)} cy={midY} r="3" fill={color} opacity="0.8" />
      )}

      {/* FIX: labels staggered onto two vertical levels, not one row -
          verified with real data that Q1/Median/Q3 can sit close enough
          horizontally (as little as ~40px apart) that same-row text
          would overlap. Median sits closest to the box (most important
          value); Q1/Q3 sit one level higher, out of its way. */}
      <text x={scale(median)} y={midY - boxHeight / 2 - 8} fontSize="12" fill="#f1f5f9" textAnchor="middle" fontWeight="700">
        Median: {median.toFixed(2)}
      </text>
      <text x={scale(q1)} y={midY - boxHeight / 2 - 24} fontSize="11" fill="#cbd5e1" textAnchor="middle" fontWeight="500">
        Q1: {q1.toFixed(2)}
      </text>
      <text x={scale(q3)} y={midY - boxHeight / 2 - 24} fontSize="11" fill="#cbd5e1" textAnchor="middle" fontWeight="500">
        Q3: {q3.toFixed(2)}
      </text>

      {/* whisker bound labels, now larger and clearer */}
      <text x={scale(lower_whisker)} y={h - 6} fontSize="10" fill="#94a3b8" textAnchor="middle">
        Lower Whisker: {lower_whisker.toFixed(2)}
      </text>
      <text x={scale(upper_whisker)} y={h - 6} fontSize="10" fill="#94a3b8" textAnchor="middle">
        Upper Whisker: {upper_whisker.toFixed(2)}
      </text>
    </svg>
  );
}