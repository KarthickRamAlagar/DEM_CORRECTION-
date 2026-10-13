# Decisions Log

Running record of scope and design decisions made during this project,
for quick reference when your guide asks "why did you choose X."

## Format
- **Date:**
- **Decision:**
- **Reason:**

---

## 2026-08-XX — Study region
- **Decision:** Start with Gangetic Plains only.
- **Reason:** Highest ICESat-2 point density, flattest terrain, easiest
  to debug the pipeline before expanding to Himalaya/Western Ghats.

## 2026-08-XX — Feature set size
- **Decision:** Trim from 55 to ~15-20 core features for the first pass.
- **Reason:** Full 55-feature, 4-region, 8-baseline scope is too large
  for the November deadline; trimmed set is faster to validate and easier
  to defend individually.

## 2026-08-XX — Baseline DEM
- **Decision:** Use both CartoDEM V3 (primary) and Copernicus DEM GLO-30
  (secondary/comparison).
- **Reason:** CartoDEM keeps the ISRO-relevance narrative intact;
  Copernicus DEM proves the method generalizes beyond one DEM source.
