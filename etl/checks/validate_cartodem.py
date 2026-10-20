import glob,rasterio,numpy as np
W,S,E,N=80.0,25.0,84.0,28.0
for f in sorted(glob.glob('data/raw/dem/cartodem_tiles/*.tif')):
    with rasterio.open(f) as s:
        a=s.read(1,out_shape=(450,450)).astype(float); b=s.bounds
        ov=min(b.right,E)-max(b.left,W)>0.5 and min(b.top,N)-max(b.bottom,S)>0.5
        nd=100*float((a==s.nodata).mean()) if s.nodata is not None else 0
        print(f.split('/')[-1].split('\\')[-1],s.dtypes[0],'overlap' if ov else 'OUTSIDE','nodata%',round(nd,2),'min',round(float(a.min()),1),'max',round(float(a.max()),1),'mean',round(float(a.mean()),1),'neg%',round(100*float((a<0).mean()),2))
