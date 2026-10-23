import { z } from "zod";

// Query rules for the SDG routes. Same ranges FastAPI enforces, checked earlier so bad input never reaches the model code.
const num = (min, max) => z.coerce.number().finite().min(min).max(max);
const lat = num(-90, 90), lon = num(-180, 180);

export const scenarioQuery = z.object({ lat, lon, radius_km: num(0.5, 25).default(10), rise_m: num(0, 30).default(2) }).strict();
export const pointQuery = z.object({ lat, lon, raw_z: num(-500, 9000), corrected_z: num(-500, 9000), z_lo: num(-500, 9000).optional(), z_hi: num(-500, 9000).optional(), rise_m: num(0, 30).default(2) }).strict();
export const regionQuery = z.object({ rise_m: num(0, 30).default(2), country: z.enum(["ALL", "IND", "NPL"]).default("ALL") }).strict();
export const sceneQuery = z.object({ lat, lon, radius_km: num(0.5, 3).default(2), rise_m: num(0, 30).default(2) }).strict();
export const admin1Query = z.object({ lat, lon }).strict();
export const emptyQuery = z.object({}).strict();
