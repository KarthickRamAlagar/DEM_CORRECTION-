// Developer links shared by every PDF report (prediction report + evaluation report).
// Icons only - no visible URL.
// Edit the two RAW values below. Any form works (with or without https://, with a messy host):
// the link is cleaned up before it goes into a PDF, so the icon always opens the real page.
const RAW_GITHUB = "https://github.com/KarthickRamAlagar";
const RAW_LINKEDIN = "https://www.linkedin.com/in/karthi21903/";

function normalizeUrl(raw, kind) {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (kind === "linkedin") {
    const m = /\/in\/([^/?#\s]+)/i.exec(t);
    if (m) return `https://www.linkedin.com/in/${m[1]}/`;
  }
  if (kind === "github") {
    const m = /github\.com\/([^/?#\s]+)/i.exec(t);
    if (m) return `https://github.com/${m[1]}`;
  }
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
}

export const DEVELOPER_GITHUB_URL = normalizeUrl(RAW_GITHUB, "github");
export const DEVELOPER_LINKEDIN_URL = normalizeUrl(RAW_LINKEDIN, "linkedin");

// Draws a small logo on an off-screen canvas and returns it as a PNG data URL for jsPDF.
export function makeIconPng(kind) {
  try {
    const size = 192;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (kind === "github") {
      // GitHub "mark" (Octicons mark-github, 16x16 viewBox)
      ctx.scale(size / 16, size / 16);
      ctx.fillStyle = "#0f172a";
      ctx.fill(new Path2D("M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"));
    } else {
      // LinkedIn: blue rounded square with a white "in"
      const r = 30;
      ctx.fillStyle = "#0a66c2";
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(size - r, 0); ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r); ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size); ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 112px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("in", size / 2, size * 0.73);
    }
    return canvas.toDataURL("image/png");
  } catch {
    return null; // icons are decoration - the PDF still downloads without them
  }
}
