// Day, date and year for every forecast or event date shown in the app, e.g. "Fri 23 Oct 2026". Dates are UTC calendar days (ISO yyyy-mm-dd) from the server.
export function fmtDay(iso) {
  if (!iso) return "No data";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "No data";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).replace(",", "");
}
export const fmtShort = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : "");
export const forecastLabel = (f) => {
  if (!f) return "No data";
  if (f.kind === "replay") return `${fmtDay(f.date)} (replay of a past day from the river model, not a forecast)`;
  return f.issued ? `${fmtDay(f.date)} (day ${f.lead_days} after the forecast was issued on ${fmtDay(f.issued)})` : fmtDay(f.date);
};
// The monsoon season an outlook built on a given date is for (June to October): built Jan to Sep -> same year, Oct to Dec -> next year.
export function seasonYear(builtIso) {
  const d = new Date(builtIso); if (Number.isNaN(d.getTime())) return null;
  return d.getUTCMonth() <= 8 ? d.getUTCFullYear() : d.getUTCFullYear() + 1;
}
