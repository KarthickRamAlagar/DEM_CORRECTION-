// The ONE template for every PDF in the app (patch 23). Same look as the DEM-Correction Evaluation Report:
// white pages, a dark border, the app name top-left in blue, serif headings with a short blue underline,
// pale stat tiles, mint highlighted table rows, page numbers bottom-centre, "Developed by" icons on the last page.
// Used by: the DEM-AREA-SDG report, the Evaluation report, the Technical prediction report.
// Standard PDF fonts only. The rupee sign is drawn as a small vector shape (rupee()), so no font file is embedded.
import { jsPDF } from "jspdf";
import { DEVELOPER_GITHUB_URL, DEVELOPER_LINKEDIN_URL, makeIconPng } from "./developerLinks";

export const APP_NAME = "AETHER GIS";
export const COL = {
  blue: [37, 99, 235], amber: [180, 112, 12], ink: [15, 23, 42], grey: [110, 118, 130], text: [60, 66, 78],
  border: [8, 9, 11], red: [185, 28, 28], green: [21, 128, 61], violet: [124, 58, 237], orange: [245, 158, 11],
  teal: [13, 148, 136], mint: [230, 242, 239], panel: [248, 250, 252], line: [210, 216, 224],
};
export const DISCLAIMER_LINE = "An estimate for planning. Not a forecast. Not a release decision. Please cross-verify the figures, as results can contain errors.";
export const DEV_NAME = "Karthickramalagar";

export const clean = (t) => String(t ?? "")
  .replace(/²/g, "2").replace(/→/g, "to").replace(/[–—]/g, "-").replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"').replace(/≈/g, "about").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/₹/g, "INR ");
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? "No data" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }));
export const money = (v, cur) => (v == null ? "No data" : cur === "NPR" ? `NPR ${num(v / 1e6, 1)} million` : `INR ${num(v / 1e7, 1)} crore`);
export const range = (a, b, f) => (a == null && b == null ? "No data" : a === b ? f(a) : `${f(a)} to ${f(b)}`);
// a measured number printed with a fixed number of decimals; text and missing values are left alone
export const dec = (v, dp = 4) => (v == null || v === "" ? "Not used by model" : typeof v === "number" ? (Number.isNaN(v) ? "Not used by model" : (Number.isInteger(v) ? String(v) : v !== 0 && Math.abs(v) < 0.5 * 10 ** -dp ? v.toExponential(2) : v.toFixed(dp))) : String(v));

// One document factory for all reports. compress:true is the big size saver: jsPDF writes everything uncompressed without it.
export function newReportDoc() { return new jsPDF({ unit: "mm", format: "a4", compress: true }); }

const iconCache = {};
const icon = (k) => (k in iconCache ? iconCache[k] : (iconCache[k] = makeIconPng(k)));

// The Indian rupee sign drawn with lines (standard PDF fonts have no such glyph). x = left edge, y = baseline, h = height in mm.
export function rupee(d, x, y, h, rgb) {
  const w = h * 0.62, t = Math.max(0.3, h * 0.1), top = y - h;
  d.setDrawColor(...rgb); d.setLineWidth(t); d.setLineCap("butt");
  d.line(x, top + t / 2, x + w, top + t / 2);                 // upper bar
  d.line(x, top + h * 0.26, x + w, top + h * 0.26);           // lower bar
  const bx = x + w * 0.4, rx = w * 0.5, yTop = top + t / 2, yBot = top + h * 0.52, cy = (yTop + yBot) / 2, ry = (yBot - yTop) / 2;
  let px = bx, py = yTop;
  d.setLineCap("round");
  for (let i = 1; i <= 16; i += 1) { const a = -Math.PI / 2 + (Math.PI * i) / 16, qx = bx + rx * Math.cos(a), qy = cy + ry * Math.sin(a); d.line(px, py, qx, qy); px = qx; py = qy; }
  d.line(px, py, x, yBot);                                    // bowl closes on the left
  d.line(x + w * 0.12, yBot, x + w * 0.95, y - t / 2);        // leg
  d.setLineCap("butt"); d.setLineWidth(0.2);
}
const fmtIN = (v) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const imgType = (u) => (/^data:image\/jpe?g/i.test(u) ? "JPEG" : "PNG");

// small flags for the money card: India (tricolour with a blue wheel) and Nepal (two crimson pennants)
function flag(d, iso, x, y, w = 9, h = 6) {
  if (iso === "IND") {
    d.setFillColor(255, 153, 51); d.rect(x, y, w, h / 3, "F"); d.setFillColor(255, 255, 255); d.rect(x, y + h / 3, w, h / 3, "F"); d.setFillColor(19, 136, 8); d.rect(x, y + (2 * h) / 3, w, h / 3, "F");
    d.setDrawColor(0, 0, 128); d.setLineWidth(0.15); d.circle(x + w / 2, y + h / 2, h / 6, "S"); d.setDrawColor(200, 205, 214); d.rect(x, y, w, h, "S");
  } else {
    d.setFillColor(220, 20, 60); d.triangle(x + 0.5, y, x + w * 0.7, y + h * 0.5, x + 0.5, y + h * 0.5, "F"); d.triangle(x + 0.5, y + h * 0.45, x + w * 0.75, y + h * 0.95, x + 0.5, y + h * 0.95, "F");
    d.setDrawColor(0, 56, 147); d.setLineWidth(0.25); d.line(x + 0.5, y, x + w * 0.7, y + h * 0.5); d.line(x + w * 0.7, y + h * 0.5, x + 0.5, y + h * 0.5); d.line(x + 0.5, y + h * 0.45, x + w * 0.75, y + h * 0.95); d.line(x + w * 0.75, y + h * 0.95, x + 0.5, y + h * 0.95); d.line(x + 0.5, y, x + 0.5, y + h * 0.95);
  }
  d.setLineWidth(0.2);
}

export class Flow {
  constructor(doc, { label = "DEM-AREA-SDG Report", date = null } = {}) {
    this.doc = doc; this.label = label;
    this.W = 210; this.H = 297; this.M = 14; this.CW = 210 - 28; this.TOP = 24; this.BOTTOM = 262;
    const t = date ? new Date(date) : new Date();
    this.date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    this.y = this.TOP; this.sections = []; this.chrome();
  }
  get n() { return this.doc.getNumberOfPages(); }
  chrome() {
    const d = this.doc, { W, H, M } = this;
    d.setFillColor(255, 255, 255); d.rect(0, 0, W, H, "F");
    d.setDrawColor(...COL.border); d.setLineWidth(1.2); d.rect(5, 5, W - 10, H - 10); d.setLineWidth(0.2);
    d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(...COL.blue); d.text(APP_NAME, M, 13);
    d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...COL.grey); d.text(this.date, W - M, 13, { align: "right" });
    d.setDrawColor(...COL.blue); d.line(M, 16, W - M, 16);
    d.setFontSize(8); d.setTextColor(140, 140, 140); d.text(`${APP_NAME}  ${this.label}`, M, 285);
  }
  newPage() { this.doc.addPage(); this.chrome(); this.y = this.TOP; return this; }
  need(h) { if (this.y + h > this.BOTTOM) this.newPage(); }
  // A section FLOWS on from the one before. It moves to a fresh page only when less than minSpace mm is left,
  // so a heading never sits alone at the foot of a page and pages are not left mostly empty. Listed in the contents.
  section(title, { index = true, level = 1, minSpace = 75 } = {}) {
    if (this.y > this.TOP + 0.5) { if (this.BOTTOM - this.y < minSpace) this.newPage(); else this.y += 5; }
    if (index || this.indexAll) this.sections.push({ title, page: this.n, level });
    this.h1(title);
  }
  h1(t) { this.need(14); const d = this.doc; d.setFont("times", "bold"); d.setFontSize(17); d.setTextColor(...COL.ink); d.text(clean(t), this.M, this.y); this.y += 8; }
  title(t, sub, line) {
    const d = this.doc, { M } = this;
    d.setFont("times", "bold"); d.setFontSize(24); d.setTextColor(...COL.ink); d.text(clean(t), M, this.y + 5); this.y += 11;
    if (sub) { d.setFont("helvetica", "italic"); d.setFontSize(9.5); d.setTextColor(...COL.grey); d.text(clean(sub), M, this.y); this.y += 7; }
    if (line) this.para(line, { size: 8, color: COL.grey });
  }
  h2(t) {
    this.need(32); this.y += 3; const d = this.doc;
    d.setFont("times", "bold"); d.setFontSize(13); d.setTextColor(...COL.ink); d.text(clean(t), this.M, this.y);
    d.setDrawColor(...COL.blue); d.setLineWidth(0.5); d.line(this.M, this.y + 1.6, this.M + 14, this.y + 1.6); d.setLineWidth(0.2);
    this.y += 6.5;
  }
  para(t, { size = 8.5, color = COL.text, italic = false, gap = 1.5, bold = false } = {}) {
    const d = this.doc; d.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal"); d.setFontSize(size); d.setTextColor(...color);
    d.splitTextToSize(clean(t), this.CW).forEach((ln) => { this.need(size * 0.45 + 1); d.text(ln, this.M, this.y); this.y += size * 0.45 + 0.8; });
    this.y += gap;
  }
  bullet(t, color = COL.blue) {
    const d = this.doc; d.setFont("helvetica", "normal"); d.setFontSize(8.5);
    const lines = d.splitTextToSize(clean(t), this.CW - 6);
    this.need(lines.length * 4.2 + 1);
    d.setFillColor(...color); d.circle(this.M + 1.2, this.y - 1, 0.9, "F"); d.setTextColor(...COL.text);
    lines.forEach((ln) => { d.text(ln, this.M + 5, this.y); this.y += 4.1; }); this.y += 1;
  }
  // cols: [{label, key | idx, w, left, fmt}] rows: objects or arrays. highlight(row) -> "win"
  table(cols, rows, { highlight = null, size = 7.5, wrap = true } = {}) {
    const d = this.doc, { M, CW } = this, tw = cols.reduce((a, c) => a + (c.w || 1), 0);
    const widths = cols.map((c) => ((c.w || 1) / tw) * CW), xs = []; let acc = M; widths.forEach((w) => { xs.push(acc); acc += w; });
    const cell = (c, r, i) => { const v = Array.isArray(r) ? r[i] : r[c.key]; const t = c.fmt ? c.fmt(v, r) : v; return t == null ? "-" : clean(t); };
    const head = () => {
      this.need(16); d.setFillColor(240, 244, 248); d.rect(M, this.y - 3.6, CW, 5, "F");
      d.setFont("helvetica", "bold"); d.setFontSize(size); d.setTextColor(...COL.ink);
      cols.forEach((c, i) => d.text(clean(c.label), c.left ? xs[i] + 1 : xs[i] + widths[i] - 1, this.y, { align: c.left ? "left" : "right" }));
      this.y += 5;
    };
    head();
    rows.forEach((r) => {
      const h = highlight ? highlight(r) : null;
      d.setFont("helvetica", h === "win" ? "bold" : "normal"); d.setFontSize(size);
      const cells = cols.map((c, i) => { const t = cell(c, r, i); return c.left && wrap ? d.splitTextToSize(t, widths[i] - 2) : [t]; });
      const rh = Math.max(5, Math.max(...cells.map((l) => l.length)) * (size * 0.42) + 1.8);
      if (this.y + rh > this.BOTTOM) { this.newPage(); head(); d.setFont("helvetica", h === "win" ? "bold" : "normal"); d.setFontSize(size); }
      if (h === "win") { d.setFillColor(214, 244, 238); d.rect(M, this.y - 3.6, CW, rh, "F"); }
      d.setTextColor(...COL.ink);
      cols.forEach((c, i) => { if (c.left) d.text(cells[i], xs[i] + 1, this.y); else d.text(cells[i][0], xs[i] + widths[i] - 1, this.y, { align: "right" }); });
      d.setDrawColor(225, 229, 235); d.line(M, this.y - 3.6 + rh, M + CW, this.y - 3.6 + rh); this.y += rh;
    });
    this.y += 3;
  }
  // a two-column "name, value" table with the value wrapped (for inputs, settings, assumptions)
  kv(rows, { w = [0.36, 0.64], head = ["Item", "Value"] } = {}) {
    this.table([{ label: head[0], idx: 0, left: true, w: w[0] }, { label: head[1], idx: 1, left: true, w: w[1] }], rows.map((r) => [r[0], r[1]]));
  }
  kpi(items) {
    const d = this.doc, { M, CW } = this; this.need(20);
    const n = items.length, gap = 3, w = (CW - gap * (n - 1)) / n;
    items.forEach((it, i) => {
      const x = M + i * (w + gap), y = this.y;
      d.setDrawColor(...COL.line); d.setFillColor(...COL.panel); d.roundedRect(x, y, w, 17, 2, 2, "FD");
      d.setFont("helvetica", "normal"); d.setFontSize(6.5); d.setTextColor(...COL.grey); d.text(clean(it.label).toUpperCase(), x + 3, y + 5);
      const v = clean(it.value), sz = v.length > 26 ? 7.5 : v.length > 18 ? 9 : v.length > 12 ? 10.5 : 12;
      d.setFont("helvetica", "bold"); d.setFontSize(sz); d.setTextColor(...(it.color || COL.ink)); d.text(d.splitTextToSize(v, w - 5)[0], x + 3, y + 11.5);
      d.setFont("helvetica", "normal"); d.setFontSize(6); d.setTextColor(...COL.grey); d.text(d.splitTextToSize(clean(it.sub || ""), w - 5)[0] || "", x + 3, y + 15.2);
    });
    this.y += 21;
  }
  // green-bordered decision card with up to three small cards inside
  decision({ badge, headline, sub, cards = [], color = COL.green }) {
    const d = this.doc, { M, CW } = this; this.need(60); const y = this.y;
    d.setDrawColor(...color); d.setLineWidth(0.5); d.roundedRect(M, y, CW, 47, 2, 2); d.setLineWidth(0.2);
    d.setFont("helvetica", "bold"); d.setFontSize(7.5); d.setTextColor(...color); d.text(clean(badge), M + 4, y + 5.5);
    d.setFont("times", "bold"); d.setFontSize(15); d.setTextColor(...COL.ink); d.text(clean(headline), M + 4, y + 12.5);
    d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...COL.text); d.text(clean(sub), M + 4, y + 17.5);
    const bw = (CW - 8 - 4 * (cards.length - 1)) / Math.max(1, cards.length);
    cards.forEach((c, i) => {
      const bx = M + 4 + i * (bw + 4);
      d.setDrawColor(200, 205, 214); d.roundedRect(bx, y + 20.5, bw, 23.5, 1.2, 1.2);
      d.setFont("helvetica", "normal"); d.setFontSize(6.5); d.setTextColor(...COL.grey); d.text(clean(c.label), bx + 2, y + 24);
      d.setFont("helvetica", "bold"); d.setFontSize(7.5); d.setTextColor(...COL.ink); d.text(d.splitTextToSize(clean(c.title), bw - 4).slice(0, 2), bx + 2, y + 28);
      d.setFontSize(8.5); d.setTextColor(...COL.blue); d.text(d.splitTextToSize(clean(c.value), bw - 4)[0], bx + 2, y + 36);
      d.setFont("helvetica", "normal"); d.setFontSize(6); d.setTextColor(...COL.text); d.text(d.splitTextToSize(clean(c.text), bw - 4).slice(0, 2), bx + 2, y + 39.5);
    });
    this.y += 51;
  }
  // "How much money is needed": one card per country (From / To in rupees) and a mint total card, as on the app screen, without the Close button.
  // countries: [{iso, name, cur, from, to}]  total: {iso, label, from, to}  (whole rupees, printed with Indian digit grouping)
  moneyCard({ title = "How much money is needed", sub, countries = [], total = null, note = "" }) {
    const d = this.doc, { M, CW } = this, rows = countries.length, h = 20 + rows * 31 + (total ? 30 : 0) + (note ? 10 : 0);
    this.need(h + 4); const x0 = M, y0 = this.y;
    d.setDrawColor(...COL.line); d.setFillColor(255, 255, 255); d.setLineWidth(0.3); d.roundedRect(x0, y0, CW, h, 3, 3, "FD"); d.setLineWidth(0.2);
    d.setFont("helvetica", "bold"); d.setFontSize(12.5); d.setTextColor(...COL.ink); d.text(clean(title), x0 + 6, y0 + 9);
    d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...COL.grey); d.text(d.splitTextToSize(clean(sub || ""), CW - 12), x0 + 6, y0 + 14.5);
    let y = y0 + 20;
    const big = (x, yb, v, cur, sz, col) => { // rupee sign + number; for NPR the code is written out
      const hgt = sz * 0.3528 * 0.9; let cx = x;
      if (cur === "INR") { rupee(d, cx, yb, hgt, COL.teal); cx += hgt * 0.62 + 1.6; } else { d.setFont("helvetica", "bold"); d.setFontSize(sz * 0.55); d.setTextColor(...COL.teal); d.text("NPR", cx, yb); cx += d.getTextWidth("NPR") + 1.6; }
      d.setFont("helvetica", "bold"); d.setFontSize(sz); d.setTextColor(...col); d.text(fmtIN(v), cx, yb); return cx + d.getTextWidth(fmtIN(v));
    };
    countries.forEach((c) => {
      d.setDrawColor(...COL.line); d.setFillColor(...COL.panel); d.roundedRect(x0 + 5, y, CW - 10, 28, 3, 3, "FD");
      flag(d, c.iso, x0 + 9, y + 4); d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(...COL.ink); d.text(clean(c.name), x0 + 21, y + 9);
      d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(...COL.grey); d.text(`in ${c.cur}`, x0 + 21 + d.getTextWidth(clean(c.name)) * 1.25 + 3, y + 9);
      d.setFontSize(7.5); d.text("From", x0 + 9, y + 15); d.text("To", x0 + 9 + (CW - 18) / 2, y + 15);
      big(x0 + 9, y + 24, c.from, c.cur, 18, COL.ink); big(x0 + 9 + (CW - 18) / 2, y + 24, c.to, c.cur, 18, COL.ink);
      y += 31;
    });
    if (total) {
      d.setDrawColor(150, 205, 195); d.setFillColor(...COL.mint); d.roundedRect(x0 + 5, y, CW - 10, 27, 3, 3, "FD");
      flag(d, total.iso, x0 + 9, y + 4); d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(...COL.ink); d.text(clean(total.label), x0 + 21, y + 9);
      const e1 = big(x0 + 9, y + 21, total.from, "INR", 17, COL.ink); d.setFont("helvetica", "normal"); d.setFontSize(9); d.setTextColor(...COL.grey); d.text("to", e1 + 3, y + 21); big(e1 + 11, y + 21, total.to, "INR", 17, COL.ink);
      y += 30;
    }
    if (note) { d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(...COL.grey); d.text(d.splitTextToSize(clean(note), CW - 12), x0 + 6, y + 3); }
    this.y = y0 + h + 4;
  }
  // The cover block of the technical report: a picture box on the left and a dark result card on the right.
  heroCard({ image, imageAspect = 1, label, value, drop, items = [] }) {
    const d = this.doc, { M, CW } = this, H = 55, imgW = 55; this.need(H + 6); const y = this.y;
    d.setDrawColor(...COL.teal); d.setLineWidth(0.3); d.roundedRect(M, y, imgW, H, 3, 3, "S");
    if (image) { const bw = imgW - 6, bh = H - 6, ar = imageAspect, w = ar >= bw / bh ? bw : bh * ar, h2 = ar >= bw / bh ? bw / ar : bh; d.addImage(image, imgType(image), M + 3 + (bw - w) / 2, y + 3 + (bh - h2) / 2, w, h2); }
    const bx = M + imgW + 7, bwid = CW - imgW - 7;
    d.setFillColor(20, 40, 38); d.roundedRect(bx, y, bwid, H, 3, 3, "F"); d.setDrawColor(...COL.teal); d.roundedRect(bx, y, bwid, H, 3, 3, "S");
    d.setFont("helvetica", "bold"); d.setFontSize(9); d.setTextColor(45, 212, 191); d.text(clean(label).toUpperCase(), bx + 6, y + 10);
    d.setFontSize(21); d.setTextColor(255, 255, 255); d.text(clean(value), bx + 6, y + 22);
    d.setFont("helvetica", "normal"); d.setFontSize(10); d.setTextColor(45, 212, 191); d.text(clean(drop), bx + 6, y + 30);
    items.forEach(([k, v], i) => { const ix = bx + 6 + i * (bwid / 2 - 2); d.setFont("helvetica", "bold"); d.setFontSize(8); d.setTextColor(214, 180, 70); d.text(clean(k).toUpperCase(), ix, y + 40); d.setFont("helvetica", "normal"); d.setFontSize(9.5); d.setTextColor(235, 235, 235); d.text(clean(v), ix, y + 47); });
    this.y += H + 6;
  }
  // a dark note bar (the "correction insight" of the technical report)
  callout(title, lines) {
    const d = this.doc, { M, CW } = this, ls = lines.flatMap((t) => d.splitTextToSize(clean(t), CW - 12)), h = 12 + ls.length * 5; this.need(h + 4); const y = this.y;
    d.setFillColor(20, 40, 38); d.roundedRect(M, y, CW, h, 3, 3, "F");
    d.setFont("helvetica", "bold"); d.setFontSize(9.5); d.setTextColor(45, 212, 191); d.text(clean(title).toUpperCase(), M + 6, y + 8);
    d.setFont("helvetica", "normal"); d.setFontSize(9); d.setTextColor(225, 225, 225); ls.forEach((ln, i) => d.text(ln, M + 6, y + 14.5 + i * 5));
    this.y += h + 6;
  }
  // 2 or 3 pictures side by side, each with a caption. figs: [{caption, url, aspect, after(x,y,w,h)}]. JPEG pictures are far smaller than PNG: use them for maps.
  figures(figs, { cols = 2 } = {}) {
    const d = this.doc, { M, CW } = this, G = 4, w = (CW - G * (cols - 1)) / cols;
    const hs = figs.map((f) => (f.url ? w * f.aspect : w * 0.6)), h = Math.max(...hs);
    this.need(h + 12); const y = this.y;
    figs.forEach((f, i) => {
      const x = M + i * (w + G);
      d.setFont("helvetica", "bold"); d.setFontSize(8); d.setTextColor(...COL.ink); d.text(clean(f.caption), x, y);
      d.setFillColor(242, 244, 247); d.setDrawColor(...COL.line); d.roundedRect(x, y + 2, w, h, 1.5, 1.5, "FD");
      if (f.url) { const ih = w * f.aspect; d.addImage(f.url, imgType(f.url), x, y + 2, w, ih, undefined, "FAST"); if (f.after) f.after(x, y + 2, w, ih); }
      else { d.setFont("helvetica", "italic"); d.setFontSize(9); d.setTextColor(...COL.grey); d.text("No data", x + w / 2, y + 2 + h / 2, { align: "center" }); }
    });
    this.y += h + 7;
  }
  legend(items) {
    const d = this.doc; this.need(8); let x = this.M;
    items.forEach(([label, rgb]) => {
      d.setFillColor(...rgb); d.circle(x + 1, this.y - 1, 1, "F"); d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(...COL.text);
      d.text(clean(label), x + 3.5, this.y); x += 3.5 + d.getTextWidth(clean(label)) + 6;
    });
    this.y += 5;
  }
  // Reserves a whole page for the contents: heading now, list drawn later by fillIndex(). The next section starts on a fresh page.
  // same = true keeps the list on the current page (below the title block); otherwise it gets its own page.
  reserveContents(title = "Contents", note = "What is in this report and where to find it.", { same = false } = {}) {
    if (!same) this.newPage();
    this.h1(title); this.para(note, { size: 8.5, color: COL.grey }); const page = this.n;
    this._idxY = same ? this.y + 8 : null; this.y = this.BOTTOM + 1; return page;
  }
  // The contents list is drawn on its reserved page once every section has its page number.
  // Numbered 1, 2, 3 for the main sections; sub-sections are indented. The right column is the PAGE number.
  fillIndex(page, y0 = this._idxY || 44) {
    const d = this.doc, { M, W } = this; d.setPage(page);
    const rowH = Math.min(this.sections.length > 20 ? 7 : 8.5, (this.BOTTOM - y0) / Math.max(1, this.sections.length)); let y = y0, k = 0;
    d.setFont("helvetica", "bold"); d.setFontSize(7.5); d.setTextColor(...COL.grey); d.text("SECTION", M, y - 6); d.text("PAGE", W - M, y - 6, { align: "right" });
    this.sections.forEach((s) => {
      const sub = s.level > 1; if (!sub) k += 1;
      d.setFont("helvetica", "bold"); d.setFontSize(9); d.setTextColor(...COL.blue); if (!sub) d.text(String(k), M, y);
      d.setFont("helvetica", sub ? "normal" : "normal"); d.setFontSize(sub ? 9 : 10); d.setTextColor(...(sub ? COL.text : COL.ink)); d.text(clean(s.title), M + (sub ? 14 : 8), y);
      d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(...COL.ink); d.text(String(s.page), W - M, y, { align: "right" });
      d.setDrawColor(225, 229, 235); d.line(M, y + 2.2, W - M, y + 2.2); y += rowH;
    });
  }
  // page numbers on every page and the footer of the last page
  finish() {
    const d = this.doc, { M, W } = this, total = this.n;
    d.setPage(total);
    const ICON = 5, footY = 285, top = footY - ICON + 1.2, ghX = W - M - ICON, liX = ghX - 2.5 - ICON;
    const li = icon("linkedin"), gh = icon("github");
    d.setFont("helvetica", "bold"); d.setFontSize(8); d.setTextColor(90, 90, 90);
    d.text(`Developed by ${DEV_NAME}`, liX - 2.5, footY, { align: "right" });
    if (li) { d.addImage(li, "PNG", liX, top, ICON, ICON); if (DEVELOPER_LINKEDIN_URL) d.link(liX, top, ICON, ICON, { url: DEVELOPER_LINKEDIN_URL }); }
    if (gh) { d.addImage(gh, "PNG", ghX, top, ICON, ICON); if (DEVELOPER_GITHUB_URL) d.link(ghX, top, ICON, ICON, { url: DEVELOPER_GITHUB_URL }); }
    d.setDrawColor(200, 200, 200); d.line(M, 266, W - M, 266);
    d.setFont("helvetica", "italic"); d.setFontSize(8); d.setTextColor(130, 130, 130); d.text(this.disclaimer || DISCLAIMER_LINE, M, 273, { maxWidth: this.CW });
    d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(110, 110, 110); d.text(this.versionLine || "Code commit: No data. Model version: No data.", M, 280, { maxWidth: this.CW - 70 });
    for (let i = 1; i <= total; i += 1) {
      d.setPage(i); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(140, 140, 140);
      d.text(`${String(i).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W / 2, 291, { align: "center" });
    }
  }
}
