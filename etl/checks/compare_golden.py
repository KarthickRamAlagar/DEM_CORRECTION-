import pandas as pd, numpy as np
A = pd.read_parquet('data/final/golden_dataset.parquet')           # current (trusted)
B = pd.read_parquet('data/final_rebuild/golden_dataset.parquet')    # rebuilt
print('current', A.shape, '| rebuilt', B.shape)
print('columns only in current:', sorted(set(A.columns) - set(B.columns)))
print('columns only in rebuilt:', sorted(set(B.columns) - set(A.columns)))
key = ['latitude', 'longitude', 'elevation_ref']
kk = [k + '_k' for k in key]
for d in (A, B):
    for k in key:
        d[k + '_k'] = d[k].round(6)
print('duplicate keys: current', A.duplicated(kk).sum(), '| rebuilt', B.duplicated(kk).sum())
A = A.drop_duplicates(kk); B = B.drop_duplicates(kk)
M = A.merge(B, on=kk, how='outer', suffixes=('_a', '_b'), indicator=True)
print(M['_merge'].value_counts().to_string())
both = M[M['_merge'] == 'both']
only_b = M[M['_merge'] == 'right_only']
print('rows only in rebuilt by year:', only_b['year_matched_b'].value_counts().to_dict())
common = [c for c in A.columns if c in B.columns and c not in kk and c not in key]
rows = []
for c in common:
    a = both[c + '_a']; b = both[c + '_b']
    if pd.api.types.is_numeric_dtype(a) and pd.api.types.is_numeric_dtype(b):
        a = a.astype('float64'); b = b.astype('float64')
        nanmis = int((a.isna() != b.isna()).sum())
        ok = a.notna() & b.notna()
        diff = (a[ok] - b[ok]).abs()
        bad = int((diff > 1e-6 + 1e-4 * b[ok].abs()).sum())
        rows.append((c, nanmis, bad, float(diff.max()) if len(diff) else 0.0, float(diff.mean()) if len(diff) else 0.0))
    else:
        rows.append((c, int((a.astype(str) != b.astype(str)).sum()), 0, np.nan, np.nan))
R = pd.DataFrame(rows, columns=['column', 'nan_mismatch', 'value_mismatch', 'max_abs_diff', 'mean_abs_diff'])
R['total_bad'] = R.nan_mismatch + R.value_mismatch
pd.set_option('display.width', 200); pd.set_option('display.max_rows', 100)
print('\nPer-column differences (matched rows), worst first:')
print(R.sort_values('total_bad', ascending=False).to_string(index=False))
print('columns with zero differences:', int((R.total_bad == 0).sum()), 'of', len(R))
print()
for name, d in (('current', A), ('rebuilt', B)):
    e = d['elevation_error_signed']
    print(name, '| rows', len(d), '| raw-error RMSE', round(float(np.sqrt((e ** 2).mean())), 3), '| mean error', round(float(e.mean()), 3))
    print('   share B02==0:', round(float((d['band_B02'] == 0).mean()), 3), '| vv NaN share:', round(float(d['vv'].isna().mean()), 3))
    print(d.groupby('year_matched')[['vv', 'vv_texture_std']].agg(lambda s: round(float(s.isna().mean()), 3)).to_string())
