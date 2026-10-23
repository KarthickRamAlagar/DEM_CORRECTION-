// One place for the backend address. Default = the Python server, exactly as before.
// To go through the security gateway, create client/.env.local with:  VITE_API_BASE=http://localhost:3100/api   and restart npm run dev.
const raw = String(import.meta.env.VITE_API_BASE || "http://localhost:8000/api").replace(/\/+$/, "");
export const API_BASE = raw;                        // ends with /api
export const API_ORIGIN = raw.replace(/\/api$/, ""); // same address without /api
