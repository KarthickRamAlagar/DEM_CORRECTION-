import sys,glob,rasterio,numpy as np,pandas as pd
g=pd.read_parquet('data/final/golden_dataset.parquet',columns=['latitude','longitude','raw_z'])
for pat in sys.argv[1:]:
  for f in sorted(glob.glob(pat,recursive=True)):
    with rasterio.open(f) as s:
        b=s.bounds
        m=g[(g.longitude>b.left+0.01)&(g.longitude<b.right-0.01)&(g.latitude>b.bottom+0.01)&(g.latitude<b.top-0.01)].sample(3000,random_state=1)
        v=np.array([x[0] for x in s.sample(zip(m.longitude,m.latitude))],dtype=float)
        d=v-m.raw_z.values
        print(f.split('data/raw/dem/')[-1],s.dtypes[0],s.width,s.height,'median signed',round(float(np.median(d)),2),'rmse',round(float(np.sqrt((d**2).mean())),2),'corr',round(float(np.corrcoef(v,m.raw_z.values)[0,1]),5),'within0.5m',round(float((np.abs(d)<0.5).mean()),3))
