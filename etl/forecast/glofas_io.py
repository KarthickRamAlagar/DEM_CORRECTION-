"""Small helpers to read GloFAS NetCDF files whatever the exact layout (patch 13). Names of dimensions differ between downloads (time / valid_time, step / forecast_period, number / member);
this module finds them by name and stops with a clear message if it cannot. It never guesses a value."""
import numpy as np, pandas as pd, xarray as xr

LAT, LON = ("latitude", "lat"), ("longitude", "lon")
MEMBER = ("number", "member", "ensemble", "realization")
LEAD = ("step", "forecast_period", "leadtime", "lead_time")
TIME = ("valid_time", "time")

def open_nc(path):
    """open a GloFAS NetCDF. Copernicus files made from GRIB can carry an attribute that stops xarray decoding the lead-time variable; then it is opened without that decoding
    and the lead time is read from the number and its units (see read_forecast)."""
    try: return xr.open_dataset(path)
    except ValueError: return xr.open_dataset(path, decode_timedelta=False)

def _find(names, options):
    low = {n.lower(): n for n in names}
    for o in options:
        if o in low: return low[o]
    return None

def data_var(ds):
    cand = [v for v in ds.data_vars if ds[v].ndim >= 3]
    if not cand: raise SystemExit(f"STOP: no data variable with latitude, longitude and time in this file. Variables: {list(ds.data_vars)}")
    pref = [v for v in cand if v.lower() in ("dis24", "dis", "discharge") or "dis" in v.lower() or "discharge" in v.lower()]
    return (pref or cand)[0]

def grid(ds, da):
    la = _find(da.dims, LAT) or _find(ds.coords, LAT); lo = _find(da.dims, LON) or _find(ds.coords, LON)
    if not la or not lo: raise SystemExit(f"STOP: latitude/longitude not found. Dimensions: {da.dims}")
    return la, lo

def read_history(path):
    """-> (dates DatetimeIndex, lat 1-D, lon 1-D, array [time, lat, lon] in m3/s). Ensemble or step dims of size 1 are squeezed."""
    ds = open_nc(path); da = ds[data_var(ds)]; la, lo = grid(ds, da)
    tname = _find(da.dims, TIME)
    if tname is None: raise SystemExit(f"STOP: no time dimension in {path}. Dimensions: {da.dims}")
    for d in list(da.dims):
        if d not in (la, lo, tname):
            if da.sizes[d] == 1: da = da.isel({d: 0})
            else: raise SystemExit(f"STOP: unexpected dimension {d!r} of size {da.sizes[d]} in {path}")
    da = da.transpose(tname, la, lo)
    return pd.DatetimeIndex(da[tname].values), np.asarray(da[la].values, float), np.asarray(da[lo].values, float), np.asarray(da.values, float)

def read_forecast(path, issue):
    """-> (lead_days ints, lat, lon, array [member, lead, lat, lon]). Works with (step) or (valid_time) as the lead axis, with or without a member dimension."""
    ds = open_nc(path); da = ds[data_var(ds)]; la, lo = grid(ds, da); issue = pd.Timestamp(issue)
    mem = _find(da.dims, MEMBER); lead = _find(da.dims, LEAD)
    tname = None
    if lead is None:
        t = _find(da.dims, TIME)
        if t is not None and da.sizes[t] > 1: tname = t
    for d in list(da.dims):
        if d in (la, lo, mem, lead, tname): continue
        if da.sizes[d] == 1: da = da.isel({d: 0})
        else: raise SystemExit(f"STOP: unexpected dimension {d!r} of size {da.sizes[d]} in {path}")
    axis = lead or tname
    if axis is None:                                  # a single lead day: no lead axis in the file
        da = da.expand_dims("lead_dummy"); axis = "lead_dummy"; leads = None
    if lead is not None:
        v = da[lead].values; units = str(da[lead].attrs.get("units", "")).lower()
        if np.issubdtype(v.dtype, np.timedelta64): leads = (v / np.timedelta64(1, "D")).astype(float)
        else:
            v = np.asarray(v, float)
            leads = v / 86400.0 if "second" in units else v / 24.0 if "hour" in units else v if "day" in units else (v / 24.0 if np.nanmax(v) > 60 else v)
    elif tname is not None:
        leads = np.array([(pd.Timestamp(x) - issue) / pd.Timedelta(days=1) for x in da[tname].values], float)
    leads = None if leads is None else np.rint(leads).astype(int)
    dims = ([mem] if mem else []) + [axis, la, lo]; da = da.transpose(*dims); arr = np.asarray(da.values, float)
    if not mem: arr = arr[None]
    if leads is None: raise SystemExit(f"STOP: cannot tell the lead time in {path}. Run: uv run python -I etl/forecast/fetch_glofas.py --inspect {path}")
    return leads, np.asarray(da[la].values, float), np.asarray(da[lo].values, float), arr
