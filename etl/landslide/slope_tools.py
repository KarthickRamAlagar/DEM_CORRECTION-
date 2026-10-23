"""Slope from a DEM (Horn 1981, 3x3), in degrees, with cell sizes in metres that follow latitude. Plain numpy."""
import math
import numpy as np

def cell_m(res_x, res_y, lat_deg, geographic=True):
    """(dx, dy) in metres at latitude(s); lat_deg may be an array."""
    if not geographic: return np.full_like(np.asarray(lat_deg, float), res_x), res_y
    return res_x * 111320.0 * np.cos(np.radians(lat_deg)), res_y * 110574.0

def horn_slope(z, dx, dy):
    """z 2-D array (NaN = no data). dx: scalar or array shaped (rows,) or (rows,1). dy scalar. Returns degrees, same shape, border copied from the neighbour row/column."""
    z = np.asarray(z, dtype="float64"); dx = np.asarray(dx, dtype="float64")
    if dx.ndim == 1: dx = dx[:, None]
    if dx.ndim == 0: dx = dx[None, None]
    dxi = dx[1:-1] if dx.shape[0] > 1 else dx
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]; d, f = z[1:-1, :-2], z[1:-1, 2:]; g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8.0 * dxi); dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8.0 * dy)
    s = np.degrees(np.arctan(np.hypot(dzdx, dzdy))); out = np.full(z.shape, np.nan); out[1:-1, 1:-1] = s
    out[0, :] = out[1, :]; out[-1, :] = out[-2, :]; out[:, 0] = out[:, 1]; out[:, -1] = out[:, -2]
    out[np.isnan(z)] = np.nan
    return out
