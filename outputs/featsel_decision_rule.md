# Pre-declared rule for the feature-selection experiment (written BEFORE running it)
Date: 2026-10-16. Question: does a data-driven reduced feature set beat or match the current 29-feature production set?
Design: for each of the 4 spatial CV folds, the feature ranking is computed on that fold's TRAINING rows only (no test/frozen rows), top-k features kept, tuned LightGBM-L2 retrained
(300k-row subsample, same as the tournament), scored on the held-out spatial strip. Methods: correlation filter, mutual information, F-test, Lasso, RFE-Ridge, RandomForest importance.
k in {10, 15, 20, 25}. Baseline = all 29 features (same code path).
Rework of the production pipeline is triggered ONLY IF a reduced set (a) has pooled CV RMSE at least 1% lower than the 29-feature baseline AND (b) worst-fold RMSE not higher than baseline.
Otherwise: no change to production; "fewer features give equal accuracy" (within 1%) is reported as a thesis finding only.
The frozen strip is NOT touched by this experiment. If the rule triggers, the candidate would be scored once on the frozen strip as the last step.
Second experiment (information only, no rework): random split vs spatial split on the same data/model, to quantify how optimistic a random split is.
