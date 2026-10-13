# Pre-declared model-selection rule (written BEFORE the tournament was run)
Date written: 2026-10-13 (session time), before any candidate was scored on the CV strips with tuned settings.

Data: strips 0,1,2,4 = 4-fold spatial CV with 5 km buffer. Strip 3 (82.45-83.25 E) = frozen final test, never used for fitting, tuning, feature or model choice.
Feature set: F29_parity_safe (chosen from the feature-set test: no accuracy cost; removes inputs that cannot be computed identically at inference).

1. Primary criterion: lowest POOLED CV RMSE.
2. Candidates within 1% of the best pooled RMSE are treated as tied.
3. Among tied candidates choose, in order: lower worst-fold RMSE; fewer base models; lower inference cost.
4. Report on the same CV predictions: MAE, median AE, LE90 (empirical), bias, RMSE excluding voids, plains vs foothill RMSE.
5. The chosen configuration (and the current production recipe, for reference) is scored ONCE on the frozen strip.
6. Tuning (Optuna): capped trials/time, fixed seed, scored on the 4 CV strips only.
