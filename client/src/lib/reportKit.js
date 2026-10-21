// Drawing kit for the DEM-AREA-SDG PDF: white pages, a dark border, glass cards and bento grids.
// Standard PDF fonts only, so no rupee sign: "INR" and "NPR" are written out.
export const PAGE = { W: 210, H: 297, M: 15 };
export const C = {
  ink: [11, 16, 22], teal: [13, 148, 136], tealDark: [15, 118, 110], amber: [180, 115, 8], gold: [217, 150, 20],
  glass: [236, 247, 246], glassHi: [255, 255, 255], line: [150, 205, 200], text: [28, 34, 40], mute: [98, 108, 116],
  blue: [37, 99, 235], violet: [139, 92, 246], orange: [245, 158, 11], white: [255, 255, 255],
};
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? "No data" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }));
export const money = (v, cur) => (v == null ? "No data" : cur === "NPR" ? `NPR ${num(v / 1e6, 1)} million` : `INR ${num(v / 1e7, 1)} crore`);
export const range = (a, b, f) => (a == null && b == null ? "No data" : a === b ? f(a) : `${f(a)} to ${f(b)}`);
export const DISCLAIMER = "An estimate for planning. Not a forecast. Not a release decision.";

export class Page {
  constructor(doc) { this.doc = doc; this.metas = []; this.sections = []; this.y = PAGE.M; this.n = 0; }
  alpha(a) { this.doc.setGState(new this.doc.GState({ opacity: a, "stroke-opacity": a })); }
  // title/sub: page heading. section: text for the index (only on the first page of a section).
  next({ title, sub, section, cover = false } = {}) {
    const d = this.doc;
    if (this.n > 0) d.addPage();
    this.n += 1; this.metas.push({ title });
    if (section) this.sections.push({ title: section, page: this.n });
    if (cover) { this.y = 40; return this; }
    d.setFont("times", "bold"); d.setFontSize(14); d.setTextColor(...C.ink); d.text(String(title).toUpperCase(), PAGE.M, 26);
    d.setFont("times", "normal"); d.setFontSize(9.5); d.setTextColor(...C.mute); d.text(sub || "", PAGE.M, 32);
    d.setDrawColor(...C.line); d.setLineWidth(0.3); d.line(PAGE.M, 35, PAGE.W - PAGE.M, 35);
    this.y = 43;
    return this;
  }
  // border, running header and footer on every page, once the page count is known
  finalize(label) {
    const d = this.doc, N = this.n, today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    for (let i = 1; i <= N; i++) {
      d.setPage(i);
      d.setDrawColor(...C.ink); d.setLineWidth(0.9); d.roundedRect(6, 6, PAGE.W - 12, PAGE.H - 12, 3, 3, "S");
      d.setDrawColor(...C.line); d.setLineWidth(0.25); d.roundedRect(8, 8, PAGE.W - 16, PAGE.H - 16, 2, 2, "S");
      d.setFont("times", "bold"); d.setFontSize(8.5); d.setTextColor(...C.tealDark); d.text("DEM-AREA-SDG", PAGE.M, 15);
      d.setFont("times", "normal"); d.setTextColor(...C.mute); d.text(label, PAGE.W - PAGE.M, 15, { align: "right" });
      d.setDrawColor(...C.line); d.line(PAGE.M, PAGE.H - 17, PAGE.W - PAGE.M, PAGE.H - 17);
      d.setFont("times", "bold"); d.setFontSize(8); d.setTextColor(...C.ink); d.text("DEM-CORRECTION ENGINE", PAGE.M, PAGE.H - 11.5);
      d.setFont("times", "italic"); d.setTextColor(...C.mute); d.text(DISCLAIMER, PAGE.W / 2 + 6, PAGE.H - 11.5, { align: "center" });
      d.setFont("times", "bold"); d.setTextColor(...C.ink); d.text(`${String(i).padStart(2, "0")} / ${String(N).padStart(2, "0")}`, PAGE.W - PAGE.M, PAGE.H - 11.5, { align: "right" });
    }
    void today;
  }
  text(t, x, y, { size = 10, bold = false, italic = false, color = C.text, w = null, align = "left", lh = 1.2 } = {}) {
    const d = this.doc;
    d.setFont("times", bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal"); d.setFontSize(size); d.setTextColor(...color);
    const lines = w ? d.splitTextToSize(String(t), w) : [String(t)];
    d.text(lines, x, y, { align });
    return lines.length * size * 0.3528 * lh;
  }
  measure(t, size, w) { this.doc.setFont("times", "normal"); this.doc.setFontSize(size); return this.doc.splitTextToSize(String(t), w).length * size * 0.3528 * 1.2; }
  glass(x, y, w, h, { accent = false, tint = null } = {}) {
    const d = this.doc;
    d.setFillColor(...(tint || C.glass)); this.alpha(0.75); d.roundedRect(x, y, w, h, 4, 4, "F");
    d.setFillColor(...C.glassHi); this.alpha(0.55); d.roundedRect(x + 0.6, y + 0.6, w - 1.2, h * 0.42, 3.4, 3.4, "F");      // soft highlight on the upper part, like frosted glass
    this.alpha(1); d.setDrawColor(...(accent ? C.teal : C.line)); d.setLineWidth(accent ? 0.7 : 0.4); d.roundedRect(x, y, w, h, 4, 4, "S");
  }
  heading(t, sub) {
    this.y += 1; this.text(t, PAGE.M, this.y, { size: 12.5, bold: true }); this.y += 5.5;
    if (sub) this.y += this.text(sub, PAGE.M, this.y, { size: 9.5, color: C.mute, w: PAGE.W - 2 * PAGE.M }) + 2;
  }
  kvCard(x, y, w, title, items, { cols = 2, accent = false } = {}) {
    const pad = 5, colW = (w - 2 * pad - (cols - 1) * 6) / cols;
    const rowH = items.map((it) => 4.2 + Math.max(4.4, this.measure(it[1], 10, colW)) + (it[2] ? this.measure(it[2], 8, colW) : 0) + 2.6);
    const rows = []; for (let i = 0; i < items.length; i += cols) rows.push(Math.max(...rowH.slice(i, i + cols)));
    const h = 9 + (title ? 7 : 0) + rows.reduce((a, b) => a + b, 0) + 2;
    this.glass(x, y, w, h, { accent });
    let cy = y + 8;
    if (title) { this.text(title, x + pad, cy, { size: 10.5, bold: true }); cy += 2.5; this.doc.setDrawColor(...C.line); this.doc.setLineWidth(0.25); this.doc.line(x + pad, cy, x + w - pad, cy); cy += 5; }
    rows.forEach((rh, ri) => {
      for (let k = 0; k < cols; k++) {
        const it = items[ri * cols + k]; if (!it) continue;
        const cx = x + pad + k * (colW + 6);
        this.text(it[0], cx, cy, { size: 8.8, bold: true, italic: true, color: C.amber });
        let yy = cy + 4.4;
        yy += this.text(it[1], cx, yy, { size: 10, w: colW });
        if (it[2]) this.text(it[2], cx, yy, { size: 8, w: colW, color: C.mute });
      }
      cy += rh;
    });
    return h;
  }
  tile(x, y, w, h, label, value, sub, { accent = false } = {}) {
    this.glass(x, y, w, h, { accent });
    this.text(label, x + 5, y + 8, { size: 8.8, bold: true, color: C.tealDark });
    const size = String(value).length > 22 ? 11.5 : String(value).length > 14 ? 14.5 : 19;
    this.text(value, x + 5, y + 8 + 3 + size * 0.34, { size, bold: true, w: w - 10 });
    if (sub) this.text(sub, x + 5, y + h - 5.5, { size: 8, w: w - 10, color: C.mute });
    return h;
  }
  table(x, y, w, cols, rows) {
    const d = this.doc, pad = 3, widths = cols.map((c) => c.w * w); let cy = y;
    this.glass(x, cy, w, 9);
    let cx = x; cols.forEach((c, i) => { this.text(c.label, c.align === "right" ? cx + widths[i] - pad : cx + pad, cy + 5.8, { size: 8.5, bold: true, italic: true, color: C.amber, align: c.align === "right" ? "right" : "left" }); cx += widths[i]; });
    cy += 11;
    rows.forEach((r) => {
      const h = Math.max(5.4, ...r.map((v, i) => this.measure(v, 9, widths[i] - 2 * pad) + 1.8));
      cx = x; r.forEach((v, i) => { this.text(v, cols[i].align === "right" ? cx + widths[i] - pad : cx + pad, cy + 4, { size: 9, w: widths[i] - 2 * pad, align: cols[i].align === "right" ? "right" : "left" }); cx += widths[i]; });
      cy += h; d.setDrawColor(...C.line); d.setLineWidth(0.2); d.line(x, cy, x + w, cy); cy += 0.6;
    });
    return cy - y;
  }
  // an image panel with a caption above it, framed in a glass card. Returns the height used.
  figure(x, y, w, caption, url, aspect, bg = false) {
    const ih = w * aspect - 6, iw = w - 6, capH = 8;
    this.glass(x, y, w, ih + capH + 3);
    this.text(caption, x + 3, y + 5.6, { size: 9.2, bold: true });
    if (bg) { this.doc.setFillColor(238, 242, 242); this.doc.rect(x + 3, y + capH, iw, ih, "F"); }
    if (url) this.doc.addImage(url, "PNG", x + 3, y + capH, iw, ih);
    else this.text("No data", x + w / 2, y + capH + ih / 2, { size: 11, color: C.mute, align: "center" });
    return ih + capH + 3;
  }
  legend(x, y, items) {
    let cx = x;
    items.forEach(([label, rgb]) => {
      this.doc.setFillColor(...rgb); this.doc.roundedRect(cx, y - 2.8, 3.4, 3.4, 0.8, 0.8, "F");
      cx += 5; const w = this.doc.getTextWidth(label) + 0; this.text(label, cx, y, { size: 8.5, color: C.text }); this.doc.setFont("times", "normal"); this.doc.setFontSize(8.5); cx += this.doc.getTextWidth(label) + 6;
      void w;
    });
  }
}
