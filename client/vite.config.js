import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    // react-globe.gl (via three-globe) bundles its own Three.js. If anything
    // else in the dependency tree also resolves a `three` copy, the app ends
    // up with two separate Three.js instances loaded at once — Three then
    // throws odd runtime errors (e.g. "determinantAffine is not a function")
    // because objects created by one copy don't match the other copy's
    // prototypes. Forcing a single resolved copy here is the standard fix.
    dedupe: ["three"],
  },
});
