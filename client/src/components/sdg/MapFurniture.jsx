import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// Map furniture (master prompt section 37): scale bar, north arrow, coordinate system and pointer coordinates.
// - Scale bar: Leaflet's own, metric only. It is true at the map centre (the map is drawn in Web Mercator).
// - North arrow: the map is always north-up, so the arrow is fixed.
// - Coordinates: WGS 84 (EPSG:4326), 4 decimals (about 11 m). The DEM pixel is about 30 m, so this is finer than the data.
const BOX = { background: "rgb(var(--ink-950) / 0.88)", color: "rgb(var(--ink-100))", border: "1px solid rgb(var(--ink-600))", borderRadius: "8px", font: "11px/1.35 system-ui, sans-serif", padding: "5px 8px" };
const apply = (el, css) => Object.entries(css).forEach(([k, v]) => { el.style[k] = v; });
const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

export default function MapFurniture() {
  const map = useMap();
  useEffect(() => {
    const scale = L.control.scale({ position: "bottomright", metric: true, imperial: false, maxWidth: 110 }).addTo(map);
    const north = L.control({ position: "topright" });
    north.onAdd = () => {
      const d = L.DomUtil.create("div");
      apply(d, { ...BOX, textAlign: "center", padding: "4px 8px 3px", pointerEvents: "none" });
      d.setAttribute("role", "img"); d.setAttribute("aria-label", "North is up");
      d.innerHTML = '<svg width="18" height="26" viewBox="0 0 18 26" aria-hidden="true"><path d="M9 1 L16 20 L9 15.5 L2 20 Z" fill="currentColor"/></svg><div style="font-weight:600;margin-top:-2px">N</div>';
      return d;
    };
    north.addTo(map);
    const info = L.control({ position: "topleft" });
    let line;
    const show = (label, ll) => { if (line) line.textContent = `${label}  ${fmt(ll.lat, "N", "S")}, ${fmt(ll.lng, "E", "W")}`; };
    info.onAdd = () => {
      const d = L.DomUtil.create("div");
      apply(d, { ...BOX, pointerEvents: "none", marginTop: "6px", maxWidth: "260px" });
      d.setAttribute("aria-label", "Coordinate system and pointer position");
      d.innerHTML = '<div style="color:rgb(var(--ink-300))">WGS 84 (EPSG:4326), 4 decimals ≈ 11 m</div><div data-line style="font-variant-numeric:tabular-nums;margin-top:1px"></div>';
      line = d.querySelector("[data-line]");
      show("Centre", map.getCenter());
      return d;
    };
    info.addTo(map);
    const move = (e) => show("Pointer", e.latlng), out = () => show("Centre", map.getCenter()), mv = () => { if (line && line.textContent.startsWith("Centre")) show("Centre", map.getCenter()); };
    map.on("mousemove", move); map.on("mouseout", out); map.on("move", mv);
    return () => { map.off("mousemove", move); map.off("mouseout", out); map.off("move", mv); scale.remove(); north.remove(); info.remove(); };
  }, [map]);
  return null;
}
