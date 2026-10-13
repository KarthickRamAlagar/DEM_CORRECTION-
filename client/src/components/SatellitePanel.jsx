import { Gauge, MapPin, Radio, Repeat, Circle } from "lucide-react";
import SatelliteGraphic from "./SatelliteGraphic";
import { satelliteCatalog } from "../data/satelliteCatalog";
import { getSubpointRegion } from "../lib/geoRegions";
import { hexToRgba } from "../lib/color";

function StatusPill({ status }) {
  const map = {
    live: { label: "Live TLE", cls: "bg-signal-green/15 text-signal-green border-signal-green/30" },
    fallback: { label: "Cached TLE", cls: "bg-signal-amber/15 text-signal-amber border-signal-amber/30" },
    loading: { label: "Loading…", cls: "bg-ink-700/60 text-ink-300 border-ink-600/60" },
    unavailable: { label: "Unavailable", cls: "bg-signal-red/15 text-signal-red border-signal-red/30" },
  };
  const s = map[status] || map.loading;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wide px-2 py-1 rounded-md border ${s.cls}`}>
      <Circle size={6} className="fill-current" />
      {s.label}
    </span>
  );
}

function Metric({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-ink-900/70 border border-ink-700/70 rounded-xl px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-ink-400 mb-1.5">
        <Icon size={13} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="font-mono text-sm tabular" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

function SpecRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 text-[11px] py-1.5 border-b border-ink-700/40 last:border-b-0">
      <span className="text-ink-400 shrink-0">{label}</span>
      <span className="text-ink-100 text-right">{value}</span>
    </div>
  );
}

export default function SatellitePanel({ satellites, selectedId, onSelect }) {
  const sat = satellites.find((s) => s.id === selectedId) || satellites[0];
  const spec = satelliteCatalog.find((s) => s.id === selectedId) || satelliteCatalog[0];

  const region =
    sat && sat.position ? getSubpointRegion(sat.position.lat, sat.position.lon) : null;

  return (
    <div className="h-full w-full overflow-y-auto bg-ink-900/95 border-r border-ink-700/60">
      {/* satellite tabs */}
      <div className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur border-b border-ink-700/50 px-3 pt-3 pb-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {satellites.map((s) => {
            const active = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: hexToRgba(s.color, 0.14),
                        borderColor: hexToRgba(s.color, 0.5),
                        color: s.color,
                      }
                    : { borderColor: "transparent", color: "#98a2b3" }
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                {s.short}
              </button>
            );
          })}
        </div>
      </div>

      {sat && (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <StatusPill status={sat.status} />
          </div>

          <h1 className="font-display text-xl font-bold text-white tracking-tight mt-2">
            {spec.name}
          </h1>
          <p className="text-sm text-ink-300 mt-0.5">{spec.purpose}</p>

          <div
            className="my-4 rounded-2xl border py-6 flex items-center justify-center"
            style={{
              background: `linear-gradient(to bottom, ${hexToRgba(spec.color, 0.1)}, transparent)`,
              borderColor: hexToRgba(spec.color, 0.25),
            }}
          >
            <SatelliteGraphic className="w-48 h-36" />
          </div>

          {/* live position */}
          {sat.position ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-ink-300 text-xs">
                  <MapPin size={13} style={{ color: spec.color }} />
                  Currently over
                </div>
                <span className="text-sm font-semibold" style={{ color: spec.color }}>
                  {region}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Metric icon={Gauge} label="Altitude" value={`${sat.position.altKm.toFixed(0)} km`} accent={spec.color} />
                <Metric
                  icon={Radio}
                  label="Velocity"
                  value={sat.position.speedKmS ? `${sat.position.speedKmS.toFixed(2)} km/s` : "—"}
                  accent={spec.color}
                />
                <Metric
                  icon={MapPin}
                  label="Sub-point"
                  value={`${sat.position.lat.toFixed(2)}°, ${sat.position.lon.toFixed(2)}°`}
                />
                <Metric
                  icon={Repeat}
                  label="Orbital period"
                  value={sat.periodMin ? `${sat.periodMin.toFixed(1)} min` : "—"}
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-ink-400 bg-ink-900/70 border border-ink-700/70 rounded-xl px-4 py-4 text-center">
              No orbital elements available for this satellite right now.
            </div>
          )}

          {/* real mission specs */}
          <div className="mt-5 pb-4">
            <h3 className="text-sm font-semibold text-white mb-2">Mission specs</h3>
            <div className="bg-ink-900/70 border border-ink-700/70 rounded-xl px-4 py-1">
              <SpecRow label="Agency" value={spec.agency} />
              <SpecRow label="Launched" value={spec.launched} />
              <SpecRow label="Orbit type" value={spec.orbitType} />
              <SpecRow label="Instrument" value={spec.instrument} />
              <SpecRow label="Revisit" value={spec.revisit} />
              <SpecRow
                label="Reference altitude / inclination"
                value={`~${spec.refAltitudeKm} km · ${spec.refInclinationDeg}°`}
              />
              <SpecRow label="NORAD ID" value={spec.norad} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
