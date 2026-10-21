// Flowing PDF layout for the DEM-AREA-SDG report, in the same look as the DEM-Correction Evaluation Report:
// white pages, a dark border, the app name top-left in blue, serif headings with a short blue underline,
// pale stat tiles, mint highlighted table rows, and the "Developed by" icons in the footer of the last page.
// Standard PDF fonts only (no rupee sign): "INR" and "NPR" are written out.
import { DEVELOPER_GITHUB_URL, DEVELOPER_LINKEDIN_URL, makeIconPng } from "./developerLinks";

export const APP_NAME = "AETHER GIS";
export const COL = {
  blue: [37, 99, 235], amber: [180, 112, 12], ink: [15, 23, 42], grey: [110, 118, 130], text: [60, 66, 78],
  border: [8, 9, 11], red: [185, 28, 28], green: [21, 128, 61], violet: [124, 58, 237], orange: [245, 158, 11],
};
export const DISCLAIMER_LINE = "An estimate for planning. Not a forecast. Not a release decision. Please cross-verify the figures, as results can contain errors.";
export const DEV_NAME = "Karthickramalagar";

export const clean = (t) => String(t ?? "")
  .replace(/²/g, "2").replace(/→/g, "to").replace(/[–—]/g, "-").replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"').replace(/≈/g, "about").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/₹/g, "INR ");
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? "No data" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }));
export const money = (v, cur) => (v == null ? "No data" : cur === "NPR" ? `NPR ${num(v / 1e6, 1)} million` : `INR ${num(v / 1e7, 1)} crore`);
export const range = (a, b, f) => (a == null && b == null ? "No data" : a === b ? f(a) : `${f(a)} to ${f(b)}`);

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
  // a section starts on a fresh page and is listed in the index
  section(title, { index = true } = {}) {
    if (this.y > this.TOP + 0.5) this.newPage();
    if (index) this.sections.push({ title, page: this.n });
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
      this.need(10); d.setFillColor(240, 244, 248); d.rect(M, this.y - 3.6, CW, 5, "F");
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
      d.setDrawColor(210, 216, 224); d.setFillColor(248, 250, 252); d.roundedRect(x, y, w, 17, 2, 2, "FD");
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
  // 2 or 3 pictures side by side, each with a caption. figs: [{caption, url, aspect, after(x,y,w,h)}]
  figures(figs, { cols = 2 } = {}) {
    const d = this.doc, { M, CW } = this, G = 4, w = (CW - G * (cols - 1)) / cols;
    const hs = figs.map((f) => (f.url ? w * f.aspect : w * 0.6)), h = Math.max(...hs);
    this.need(h + 12); const y = this.y;
    figs.forEach((f, i) => {
      const x = M + i * (w + G);
      d.setFont("helvetica", "bold"); d.setFontSize(8); d.setTextColor(...COL.ink); d.text(clean(f.caption), x, y);
      d.setFillColor(242, 244, 247); d.setDrawColor(210, 216, 224); d.roundedRect(x, y + 2, w, h, 1.5, 1.5, "FD");
      if (f.url) {
        const ih = w * f.aspect; d.addImage(f.url, "PNG", x, y + 2, w, ih);
        if (f.after) f.after(x, y + 2, w, ih);
      } else { d.setFont("helvetica", "italic"); d.setFontSize(9); d.setTextColor(...COL.grey); d.text("No data", x + w / 2, y + 2 + h / 2, { align: "center" }); }
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
  // index lines are drawn on the index page once every section has its page number
  fillIndex(page, y0 = 46) {
    const d = this.doc, { M, W } = this; d.setPage(page); let y = y0;
    this.sections.forEach((s, i) => {
      d.setFont("helvetica", "bold"); d.setFontSize(9); d.setTextColor(...COL.blue); d.text(String(i + 1).padStart(2, "0"), M, y);
      d.setFont("helvetica", "normal"); d.setFontSize(10); d.setTextColor(...COL.ink); d.text(clean(s.title), M + 10, y);
      d.setFont("helvetica", "bold"); d.text(String(s.page).padStart(2, "0"), W - M, y, { align: "right" });
      d.setDrawColor(225, 229, 235); d.line(M, y + 2.2, W - M, y + 2.2); y += 8.5;
    });
  }
  // page numbers on every page and the footer of the last page
  finish() {
    const d = this.doc, { M, W } = this, total = this.n;
    d.setPage(total);
    const ICON = 5, footY = 285, top = footY - ICON + 1.2, ghX = W - M - ICON, liX = ghX - 2.5 - ICON;
    const li = makeIconPng("linkedin"), gh = makeIconPng("github");
    d.setFont("helvetica", "bold"); d.setFontSize(8); d.setTextColor(90, 90, 90);
    d.text(`Developed by ${DEV_NAME}`, liX - 2.5, footY, { align: "right" });
    if (li) { d.addImage(li, "PNG", liX, top, ICON, ICON); if (DEVELOPER_LINKEDIN_URL) d.link(liX, top, ICON, ICON, { url: DEVELOPER_LINKEDIN_URL }); }
    if (gh) { d.addImage(gh, "PNG", ghX, top, ICON, ICON); if (DEVELOPER_GITHUB_URL) d.link(ghX, top, ICON, ICON, { url: DEVELOPER_GITHUB_URL }); }
    d.setDrawColor(200, 200, 200); d.line(M, 266, W - M, 266);
    d.setFont("helvetica", "italic"); d.setFontSize(8); d.setTextColor(130, 130, 130); d.text(DISCLAIMER_LINE, M, 273, { maxWidth: this.CW });
    for (let i = 1; i <= total; i += 1) {
      d.setPage(i); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(140, 140, 140);
      d.text(`${String(i).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W / 2, 291, { align: "center" });
    }
  }
}
