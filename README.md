 uv run uvicorn server.main:app --reload --port 8000 - backend Cammand 
 npn run dev - Client


 (dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/training/baseline_interpolation.py
============================================================
BASELINE INTERPOLATION METHODS
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

--- Fold 0 as test ---
    (Bilinear SKIPPED: all 1000 test points fell outside the training data's convex hull - expected for edge folds, where training points only exist on one side of the test region)
    (Bicubic SKIPPED: all 1000 test points fell outside the training data's convex hull - same edge-fold reason as Bilinear above)
  IDW                  RMSE=3.9960  MAE=1.2037
  Ordinary Kriging     RMSE=4.1346  MAE=1.6734

--- Fold 1 as test ---
    (Bilinear: 9 of 1000 test points fell outside the training convex hull, excluded)
    (Bicubic: 9 of 1000 test points fell outside the training convex hull, excluded)
  Bilinear             RMSE=1.6439  MAE=1.2815
  Bicubic              RMSE=8.4304  MAE=6.4666
  IDW                  RMSE=1.5731  MAE=1.2132
  Ordinary Kriging     RMSE=1.5351  MAE=1.1882

--- Fold 2 as test ---
    (Bilinear: 3 of 1000 test points fell outside the training convex hull, excluded)
    (Bicubic: 3 of 1000 test points fell outside the training convex hull, excluded)
  Bilinear             RMSE=4.0859  MAE=2.4707
  Bicubic              RMSE=19.0660  MAE=12.7608
  IDW                  RMSE=3.0706  MAE=1.9072
  Ordinary Kriging     RMSE=3.0647  MAE=2.0129

--- Fold 3 as test ---
    (Bilinear: 8 of 1000 test points fell outside the training convex hull, excluded)
    (Bicubic: 8 of 1000 test points fell outside the training convex hull, excluded)
  Bilinear             RMSE=4.4268  MAE=2.5869
  Bicubic              RMSE=27.2367  MAE=16.2839
  IDW                  RMSE=5.1557  MAE=2.7457
  Ordinary Kriging     RMSE=5.0589  MAE=3.3395

--- Fold 4 as test ---
    (Bilinear SKIPPED: all 1000 test points fell outside the training data's convex hull - expected for edge folds, where training points only exist on one side of the test region)
    (Bicubic SKIPPED: all 1000 test points fell outside the training data's convex hull - same edge-fold reason as Bilinear above)
  IDW                  RMSE=6.7180  MAE=2.8800
  Ordinary Kriging     RMSE=6.2581  MAE=3.2486

============================================================
AVERAGE ACROSS ALL 5 FOLDS
============================================================
  Bilinear             RMSE=3.3855  MAE=2.1130  (only 3/5 folds - see notes above)
  Bicubic              RMSE=18.2443  MAE=11.8371  (only 3/5 folds - see notes above)
  IDW                  RMSE=4.1027  MAE=1.9900
  Ordinary Kriging     RMSE=4.0103  MAE=2.2925

Note: Bilinear/Bicubic can be genuinely unavailable for edge folds (0 and 4) -
this is expected griddata behavior (no extrapolation outside the training
convex hull), not a bug. IDW and Kriging don't have this limitation since
they don't require enclosure - this is itself a real, useful finding about
these methods' relative robustness.
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv sync
Resolved 146 packages in 1.51s
      Built dem-correction @ file:///C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized                                                        
Prepared 4 packages in 2.64s
Uninstalled 1 package in 13ms
Installed 7 packages in 1.77s
 + cloudpickle==3.1.2
 ~ dem-correction==0.1.0 (from file:///C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized)
 + joblib==1.6.0
 + lightgbm==4.7.0
 + narwhals==2.26.0
 + scikit-learn==1.7.2
 + threadpoolctl==3.6.0
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/training/baseline_ml.py
============================================================
ML BASELINE MODELS - Linear Regression, Random Forest, LightGBM
============================================================

Using 44 input features, target: elevation_error_signed

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

--- Fold 0 as test ---
  942,833 train / 241,792 test points
Traceback (most recent call last):
  File "C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\training\baseline_ml.py", line 137, in <module>
    main()
  File "C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\training\baseline_ml.py", line 122, in main
    fold_results = evaluate_fold(train_df, test_df, features, target)
  File "C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\training\baseline_ml.py", line 76, in evaluate_fold
    lr.fit(X_train, y_train)
  File "c:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\.venv\lib\site-packages\sklearn\base.py", line 1365, in wrapper
    return fit_method(estimator, *args, **kwargs)
  File "c:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\.venv\lib\site-packages\sklearn\linear_model\_base.py", line 618, in fit
    X, y = validate_data(
  File "c:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\.venv\lib\site-packages\sklearn\utils\validation.py", line 2971, in validate_data
    X, y = check_X_y(X, y, **check_params)
  File "c:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\.venv\lib\site-packages\sklearn\utils\validation.py", line 1368, in check_X_y
    X = check_array(
  File "c:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\.venv\lib\site-packages\sklearn\utils\validation.py", line 1105, in check_array
    _assert_all_finite(
  File "c:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\.venv\lib\site-packages\sklearn\utils\validation.py", line 120, in _assert_all_finite
    _assert_all_finite_element_wise(
  File "c:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\.venv\lib\site-packages\sklearn\utils\validation.py", line 169, in _assert_all_finite_element_wise
    raise ValueError(msg_err)
ValueError: Input X contains NaN.
LinearRegression does not accept missing values encoded as NaN natively. For supervised learning, you might want to consider sklearn.ensemble.HistGradientBoostingClassifier and Regressor which accept missing values encoded as NaNs natively. Alternatively, it is possible to preprocess the data, for instance by using an imputer transformer in a pipeline or drop samples with missing values. See https://scikit-learn.org/stable/modules/impute.html You can find a list of all estimators that handle NaN values at the following page: https://scikit-learn.org/stable/modules/impute.html#estimators-that-handle-nan-values
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/training/baseline_ml.py
============================================================
ML BASELINE MODELS - Linear Regression, Random Forest, LightGBM
============================================================

Using 44 input features, target: elevation_error_signed

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

--- Fold 0 as test ---
  942,833 train / 241,792 test points
  Linear Regression    RMSE=1.9689  MAE=1.1833
  Random Forest        RMSE=2.7857  MAE=1.7730
  LightGBM (alone)     RMSE=2.3290  MAE=1.5200

--- Fold 1 as test ---
  863,709 train / 287,477 test points
  Linear Regression    RMSE=1.7870  MAE=1.2421
  Random Forest        RMSE=2.1085  MAE=1.3815
  LightGBM (alone)     RMSE=1.7812  MAE=1.2478

--- Fold 2 as test ---
  876,114 train / 256,114 test points
  Linear Regression    RMSE=3.1674  MAE=1.7397
  Random Forest        RMSE=3.4329  MAE=1.9454
  LightGBM (alone)     RMSE=3.2590  MAE=1.7715

--- Fold 3 as test ---
  892,567 train / 259,260 test points
  Linear Regression    RMSE=4.3639  MAE=2.2698
  Random Forest        RMSE=4.5911  MAE=2.4050
  LightGBM (alone)     RMSE=4.3036  MAE=2.3713

--- Fold 4 as test ---
  1,010,924 train / 176,711 test points
  Linear Regression    RMSE=5.0638  MAE=2.4867
  Random Forest        RMSE=5.2089  MAE=2.8741
  LightGBM (alone)     RMSE=5.1283  MAE=2.7927

============================================================
AVERAGE ACROSS ALL 5 FOLDS
============================================================
  Linear Regression    RMSE=3.2702  MAE=1.7843
  Random Forest        RMSE=3.6254  MAE=2.0758
  LightGBM (alone)     RMSE=3.3602  MAE=1.9407
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/training/tune_and_compare.py
============================================================
HYPERPARAMETER TUNING - Random Forest and LightGBM
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

============================================================
STAGE 1 - FAST SEARCH (fold 0, subsampled)
============================================================

  Stage 1: searching Random Forest (6 trials on 150,000-row subsample)...
    {'n_estimators': np.int64(100), 'max_depth': np.int64(20), 'min_samples_leaf': np.int64(5)} -> RMSE=2.9500
    {'n_estimators': np.int64(150), 'max_depth': np.int64(12), 'min_samples_leaf': np.int64(10)} -> RMSE=2.6801
    {'n_estimators': np.int64(100), 'max_depth': np.int64(16), 'min_samples_leaf': np.int64(1)} -> RMSE=3.6751
    {'n_estimators': np.int64(100), 'max_depth': np.int64(16), 'min_samples_leaf': np.int64(10)} -> RMSE=2.6949
    {'n_estimators': np.int64(200), 'max_depth': np.int64(20), 'min_samples_leaf': np.int64(10)} -> RMSE=2.6809
    {'n_estimators': np.int64(200), 'max_depth': np.int64(16), 'min_samples_leaf': np.int64(1)} -> RMSE=3.6449

  Stage 1: searching LightGBM (6 trials)...
    {'n_estimators': np.int64(400), 'num_leaves': np.int64(63), 'max_depth': np.int64(10), 'learning_rate': np.float64(0.05)} -> RMSE=3.1717
    {'n_estimators': np.int64(400), 'num_leaves': np.int64(31), 'max_depth': np.int64(6), 'learning_rate': np.float64(0.1)} -> RMSE=3.4532
    {'n_estimators': np.int64(200), 'num_leaves': np.int64(63), 'max_depth': np.int64(-1), 'learning_rate': np.float64(0.05)} -> RMSE=2.7120
    {'n_estimators': np.int64(400), 'num_leaves': np.int64(127), 'max_depth': np.int64(10), 'learning_rate': np.float64(0.05)} -> RMSE=3.3986
    {'n_estimators': np.int64(200), 'num_leaves': np.int64(63), 'max_depth': np.int64(10), 'learning_rate': np.float64(0.05)} -> RMSE=2.9540
    {'n_estimators': np.int64(200), 'num_leaves': np.int64(127), 'max_depth': np.int64(10), 'learning_rate': np.float64(0.1)} -> RMSE=3.2480

Best Random Forest params found: {'n_estimators': np.int64(150), 'max_depth': np.int64(12), 'min_samples_leaf': np.int64(10)}
Best LightGBM params found: {'n_estimators': np.int64(200), 'num_leaves': np.int64(63), 'max_depth': np.int64(-1), 'learning_rate': np.float64(0.05)}

============================================================
STAGE 2 - FAITHFUL FULL 5-FOLD EVALUATION
============================================================
(These ARE the real, reportable numbers - directly comparable to baseline_ml.py)

  --- Fold 0 as test ---
    Linear Regression        RMSE=1.9689  MAE=1.1833
    Random Forest (tuned)    RMSE=2.3101  MAE=1.4872
    LightGBM (tuned)         RMSE=2.1670  MAE=1.3712

  --- Fold 1 as test ---
    Linear Regression        RMSE=1.7870  MAE=1.2421
    Random Forest (tuned)    RMSE=1.9018  MAE=1.3246
    LightGBM (tuned)         RMSE=1.7803  MAE=1.2418

  --- Fold 2 as test ---
    Linear Regression        RMSE=3.1674  MAE=1.7397
    Random Forest (tuned)    RMSE=3.3473  MAE=1.8862
    LightGBM (tuned)         RMSE=3.2653  MAE=1.7898

  --- Fold 3 as test ---
    Linear Regression        RMSE=4.3639  MAE=2.2698
    Random Forest (tuned)    RMSE=4.3130  MAE=2.3317
    LightGBM (tuned)         RMSE=4.2862  MAE=2.3449

  --- Fold 4 as test ---
    Linear Regression        RMSE=5.0638  MAE=2.4867
    Random Forest (tuned)    RMSE=5.1273  MAE=2.8023
    LightGBM (tuned)         RMSE=5.1089  MAE=2.7582

============================================================
FINAL AVERAGE ACROSS ALL 5 FOLDS
============================================================
  Linear Regression        RMSE=3.2702  MAE=1.7843
  Random Forest (tuned)    RMSE=3.3999  MAE=1.9664
  LightGBM (tuned)         RMSE=3.3215  MAE=1.9012
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/training/quick_checks.py
============================================================
QUICK FOLLOW-UP CHECKS - Ridge Regression, Reduced-Feature LightGBM
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

  Picking Ridge alpha...
    alpha=   1.0 -> RMSE=1.9793
    alpha=  10.0 -> RMSE=1.9772
    alpha=  50.0 -> RMSE=1.9798

  Best Ridge alpha: 10.0

============================================================
FAITHFUL FULL 5-FOLD EVALUATION
============================================================

  --- Fold 0 as test ---
    Ridge Regression             RMSE=1.9660  MAE=1.1803
    LightGBM (top 12 features)   RMSE=2.2184  MAE=1.3565

  --- Fold 1 as test ---
    Ridge Regression             RMSE=1.7819  MAE=1.2378
    LightGBM (top 12 features)   RMSE=2.0316  MAE=1.3760

  --- Fold 2 as test ---
    Ridge Regression             RMSE=3.1669  MAE=1.7391
    LightGBM (top 12 features)   RMSE=3.2595  MAE=1.9273

  --- Fold 3 as test ---
    Ridge Regression             RMSE=4.3653  MAE=2.2691
    LightGBM (top 12 features)   RMSE=4.1616  MAE=2.0734

  --- Fold 4 as test ---
    Ridge Regression             RMSE=5.0645  MAE=2.4860
    LightGBM (top 12 features)   RMSE=5.1422  MAE=2.7766

============================================================
FINAL AVERAGE - COMPARE AGAINST PREVIOUS RESULTS
============================================================
  (Linear Regression: 3.2702 | Random Forest tuned: 3.3999 | LightGBM tuned (44 feat): 3.3215)
  Ridge Regression             RMSE=3.2689  MAE=1.7825
  LightGBM (top 12 features)   RMSE=3.3627  MAE=1.9020
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv sync
Resolved 149 packages in 2.10s
      Built dem-correction @ file:///C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized                                                        
Prepared 4 packages in 21.54s
Uninstalled 1 package in 21ms
Installed 4 packages in 3.05s
 + catboost==1.2.10
 ~ dem-correction==0.1.0 (from file:///C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized)
 + graphviz==0.21
 + plotly==7.0.0
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/training/final_ensemble.py
============================================================
FINAL PROPOSED MODEL - LightGBM + CatBoost Ensemble
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

============================================================
SEARCHING CATBOOST HYPERPARAMETERS (fold 0, subsampled)
============================================================

  Searching CatBoost (6 trials on 150,000-row subsample)...
    {'iterations': np.int64(200), 'depth': np.int64(10), 'learning_rate': np.float64(0.1)} -> RMSE=2.6818
    {'iterations': np.int64(200), 'depth': np.int64(8), 'learning_rate': np.float64(0.1)} -> RMSE=2.6497
    {'iterations': np.int64(200), 'depth': np.int64(10), 'learning_rate': np.float64(0.05)} -> RMSE=2.3701
    {'iterations': np.int64(400), 'depth': np.int64(10), 'learning_rate': np.float64(0.1)} -> RMSE=2.9032
    {'iterations': np.int64(400), 'depth': np.int64(8), 'learning_rate': np.float64(0.05)} -> RMSE=2.6913
    {'iterations': np.int64(400), 'depth': np.int64(8), 'learning_rate': np.float64(0.1)} -> RMSE=2.8380

  Best CatBoost params: {'iterations': np.int64(200), 'depth': np.int64(10), 'learning_rate': np.float64(0.05)}

============================================================
FAITHFUL FULL 5-FOLD EVALUATION
============================================================
(These ARE the real, reportable numbers)

  --- Fold 0 as test ---
    LightGBM (alone)                 RMSE=2.1670  MAE=1.3712
    CatBoost (alone)                 RMSE=2.1785  MAE=1.3777
    Ensemble (LightGBM + CatBoost)   RMSE=2.1475  MAE=1.3533

  --- Fold 1 as test ---
    LightGBM (alone)                 RMSE=1.7803  MAE=1.2418
    CatBoost (alone)                 RMSE=1.7613  MAE=1.2349
    Ensemble (LightGBM + CatBoost)   RMSE=1.7628  MAE=1.2327

  --- Fold 2 as test ---
    LightGBM (alone)                 RMSE=3.2653  MAE=1.7898
    CatBoost (alone)                 RMSE=3.2637  MAE=1.7995
    Ensemble (LightGBM + CatBoost)   RMSE=3.2544  MAE=1.7901

  --- Fold 3 as test ---
    LightGBM (alone)                 RMSE=4.2862  MAE=2.3449
    CatBoost (alone)                 RMSE=4.2224  MAE=2.3470
    Ensemble (LightGBM + CatBoost)   RMSE=4.2369  MAE=2.3368

  --- Fold 4 as test ---
    LightGBM (alone)                 RMSE=5.1089  MAE=2.7582
    CatBoost (alone)                 RMSE=5.0780  MAE=2.7121
    Ensemble (LightGBM + CatBoost)   RMSE=5.0775  MAE=2.7255

============================================================
FINAL AVERAGE - COMPARE AGAINST ALL PREVIOUS RESULTS
============================================================
  Linear Regression:            RMSE=3.2702  MAE=1.7843
  Ridge Regression:              RMSE=3.2689  MAE=1.7825
  Random Forest (tuned):         RMSE=3.3999  MAE=1.9664
  LightGBM (tuned, 44 features): RMSE=3.3215  MAE=1.9012

  LightGBM (alone)                 RMSE=3.3215  MAE=1.9012
  CatBoost (alone)                 RMSE=3.3008  MAE=1.8942
  Ensemble (LightGBM + CatBoost)   RMSE=3.2958  MAE=1.8877
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/evaluation/significance_test.py
============================================================
LE90 AND SIGNIFICANCE TESTING - Ridge vs. Ensemble
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

--- Fold 0 as test ---
  Ridge RMSE=1.9660   Ensemble RMSE=2.1475

--- Fold 1 as test ---
  Ridge RMSE=1.7819   Ensemble RMSE=1.7628

--- Fold 2 as test ---
  Ridge RMSE=3.1669   Ensemble RMSE=3.2544

--- Fold 3 as test ---
  Ridge RMSE=4.3653   Ensemble RMSE=4.2369

--- Fold 4 as test ---
  Ridge RMSE=5.0645   Ensemble RMSE=5.0775

============================================================
LE90 RESULTS
============================================================
  Ridge    - RMSE: 3.3722
    LE90 (formula, 1.6449 x RMSE): 5.5469
    LE90 (empirical, 90th %ile):    3.2232
  Ensemble - RMSE: 3.3773
    LE90 (formula, 1.6449 x RMSE): 5.5553
    LE90 (empirical, 90th %ile):    3.5584

============================================================
PAIRED SIGNIFICANCE TEST (n=1,221,354 pooled test points)
============================================================
Testing: are Ridge's absolute errors significantly LARGER than the Ensemble's?

  Wilcoxon signed-rank: statistic=336323301747.0, p-value=1.000000
  Paired t-test:        statistic=-79.3364, p-value=1.000000

============================================================
CONCLUSION
============================================================
  Wilcoxon test: NOT statistically significant (p >= 0.05)
  -> The difference cannot be distinguished from random variation at this
     sample size - Ridge and the Ensemble are statistically comparable.
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/evaluation/significance_test.py
============================================================
LE90 AND SIGNIFICANCE TESTING - Ridge vs. Ensemble
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

--- Fold 0 as test ---
  Ridge RMSE=1.9660   Ensemble RMSE=2.1475

--- Fold 1 as test ---
  Ridge RMSE=1.7819   Ensemble RMSE=1.7628

--- Fold 2 as test ---
  Ridge RMSE=3.1669   Ensemble RMSE=3.2544

--- Fold 3 as test ---
  Ridge RMSE=4.3653   Ensemble RMSE=4.2369

--- Fold 4 as test ---
  Ridge RMSE=5.0645   Ensemble RMSE=5.0775

============================================================
LE90 RESULTS
============================================================
  Ridge    - RMSE: 3.3722
    LE90 (formula, 1.6449 x RMSE): 5.5469
    LE90 (empirical, 90th %ile):    3.2232
  Ensemble - RMSE: 3.3773
    LE90 (formula, 1.6449 x RMSE): 5.5553
    LE90 (empirical, 90th %ile):    3.5584

  NOTE: formula-based LE90 exceeds empirical LE90 by 2.32m -
  this is a real, meaningful divergence (verified: for genuinely normal errors,
  these two calculations agree closely - tested separately with synthetic normal
  data). This confirms the real elevation-error residuals are NOT normally
  distributed, consistent with the skewed, heavy-tailed error distribution
  already found in EDA. The EMPIRICAL LE90 should be treated as the trustworthy
  number to report - the formula version meaningfully overestimates true
  worst-case error for this dataset.

============================================================
PAIRED SIGNIFICANCE TEST (n=1,221,354 pooled test points)
============================================================
Testing: are the Ensemble's absolute errors significantly LARGER than Ridge's?
(Corrected direction - the real RMSE numbers show Ridge winning, so this tests
whether that observed gap is statistically real, not the reverse claim)

  Wilcoxon signed-rank: statistic=409530105588.0, p-value=0.0000000000
  Paired t-test:        statistic=79.3364, p-value=0.0000000000

============================================================
CONCLUSION
============================================================
  Wilcoxon test: STATISTICALLY SIGNIFICANT (p < 0.05)
  -> Ridge's errors are genuinely, reliably smaller than the Ensemble's.
     Ridge Regression is the confirmed better model on this data.
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/training/stacking_ensemble.py
============================================================
LINEAR STACKING ENSEMBLE - Ridge + LightGBM + CatBoost
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows

Rebuilding the verified spatial split...

============================================================
STEP 1 - GENERATING BASE MODEL OUT-OF-FOLD PREDICTIONS
============================================================
(The expensive part - only done once)

--- Fold 0 ---
  Ridge RMSE=1.9660  LightGBM RMSE=2.1670  CatBoost RMSE=2.1785

--- Fold 1 ---
  Ridge RMSE=1.7819  LightGBM RMSE=1.7803  CatBoost RMSE=1.7613

--- Fold 2 ---
  Ridge RMSE=3.1669  LightGBM RMSE=3.2653  CatBoost RMSE=3.2637

--- Fold 3 ---
  Ridge RMSE=4.3653  LightGBM RMSE=4.2862  CatBoost RMSE=4.2224

--- Fold 4 ---
  Ridge RMSE=5.0645  LightGBM RMSE=5.1089  CatBoost RMSE=5.0780

============================================================
STEP 2 - NESTED CV: TRAINING THE STACKING META-MODEL
============================================================
(Cheap - just fitting Linear Regression on 3 columns, 5 more times)
  Meta-fold 0: weights (ridge, lgbm, catboost) = [0.407 0.124 0.425], intercept=-0.2594
  Meta-fold 1: weights (ridge, lgbm, catboost) = [0.476 0.124 0.366], intercept=-0.0359
  Meta-fold 2: weights (ridge, lgbm, catboost) = [0.437 0.129 0.416], intercept=-0.2191
  Meta-fold 3: weights (ridge, lgbm, catboost) = [0.442 0.226 0.203], intercept=-0.5317
  Meta-fold 4: weights (ridge, lgbm, catboost) = [0.449 0.097 0.401], intercept=-0.0550

============================================================
FINAL COMPARISON
============================================================
  Average learned weights: ridge=0.442, lgbm=0.140, catboost=0.362

  Ridge alone                              RMSE=3.3722  MAE=1.7311
  LightGBM alone                           RMSE=3.4040  MAE=1.8359
  CatBoost alone                           RMSE=3.3792  MAE=1.8314
  Naive average ensemble                   RMSE=3.3773  MAE=1.8238
  Linear Stacking (Ridge+LGBM+CatBoost)    RMSE=3.3130  MAE=1.7214
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv sync 
Resolved 149 packages in 8.20s
      Built dem-correction @ file:///C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized                                                        
Prepared 1 package in 62ms
Uninstalled 1 package in 8ms
Installed 1 package in 40ms
 ~ dem-correction==0.1.0 (from file:///C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized)
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/train_final_model.py
============================================================
TRAINING FINAL PRODUCTION MODEL - Linear Stacking Ensemble
============================================================

Using 44 features, target: elevation_error_signed

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\final\golden_dataset.parquet...
  Loaded 1,221,354 rows - training all 3 base models on ALL of them

Computing imputation medians (for Ridge's missing SAR features)...

Training Ridge Regression (alpha=10.0)...

Training LightGBM {'n_estimators': 200, 'num_leaves': 63, 'max_depth': -1, 'learning_rate': 0.05}...

Training CatBoost {'iterations': 200, 'depth': 10, 'learning_rate': 0.05}...

Verifying the stacked formula on training data (sanity check only -
real validated performance is the 3.3130 RMSE from stacking_ensemble.py)...
  Training-set RMSE: 3.0000 (expected to look better than 3.3130 -
  this is in-sample, not a fair validation number)

Saved: C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\saved\dem_correction_model.pkl

This single file now contains everything a prediction API needs:
  - All 3 trained base models
  - The honest, validated combination weights
  - Imputation values for missing features
  - The exact feature order the models expect
  - The real, honest validated performance numbers (RMSE 3.3130)
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/predict.py
Self-test: predicting with a realistic-looking feature set...

Input (partial, 4 of 44 features given):
  slope_deg: 15.0
  tri: 2.5
  terrain_region_class: 1
  raw_z: 850.0

Prediction result: {'predicted_error': -234.6713, 'model_used': 'Linear Stacking (Ridge + LightGBM + CatBoost)', 'individual_predictions': {'ridge': -526.6778, 'lightgbm': -4.4657, 'catboost': -2.5648}, 'validated_rmse': 3.313, 'validated_mae': 1.7214}
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/predict.py
Self-test 1: the EXACT case that revealed the bug (inconsistent inputs)...
  Result: {'predicted_error': -234.6713, 'model_used': 'Linear Stacking (Ridge + LightGBM + CatBoost)', 'individual_predictions': {'ridge': -526.6778, 'lightgbm': -4.4657, 'catboost': -2.5648}, 'is_reliable': np.False_, 'disagreement_spread_meters': 524.11, 'validated_rmse': 3.313, 'validated_mae': 1.7214, 'warning': "The 3 base models disagree by 524.1m, well beyond the normal range - this usually means the provided feature values don't form a physically realistic combination (e.g. a high elevation given alongside neighborhood-average features left at their default/typical values). Treat this prediction with caution."}
  Correctly flagged as unreliable: True

Self-test 2: a more complete, internally consistent feature set...
  Result: {'predicted_error': -11.5474, 'model_used': 'Linear Stacking (Ridge + LightGBM + CatBoost)', 'individual_predictions': {'ridge': -20.5481, 'lightgbm': -7.9433, 'catboost': -3.1163}, 'is_reliable': np.False_, 'disagreement_spread_meters': 17.43, 'validated_rmse': 3.313, 'validated_mae': 1.7214, 'warning': "The 3 base models disagree by 17.4m, well beyond the normal range - this usually means the provided feature values don't form a physically realistic combination (e.g. a high elevation given alongside neighborhood-average features left at their default/typical values). Treat this prediction with caution."}
  Correctly passes as reliable: False
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/predict.py
Self-test 1: the EXACT case that revealed the bug (inconsistent inputs)...
  Result: {'predicted_error': -234.6713, 'model_used': 'Linear Stacking (Ridge + LightGBM + CatBoost)', 'individual_predictions': {'ridge': -526.6778, 'lightgbm': -4.4657, 'catboost': -2.5648}, 'is_reliable': False, 'disagreement_spread_meters': 524.11, 'validated_rmse': 3.313, 'validated_mae': 1.7214, 'warning': "The 3 base models disagree by 524.1m, well beyond the normal range - this usually means the provided feature values don't form a physically realistic combination (e.g. a high elevation given alongside neighborhood-average features left at their default/typical values). Treat this prediction with caution."}
  Correctly flagged as unreliable: True

Self-test 2: a more complete, internally consistent feature set...
  Result: {'predicted_error': -11.5474, 'model_used': 'Linear Stacking (Ridge + LightGBM + CatBoost)', 'individual_predictions': {'ridge': -20.5481, 'lightgbm': -7.9433, 'catboost': -3.1163}, 'is_reliable': False, 'disagreement_spread_meters': 17.43, 'validated_rmse': 3.313, 'validated_mae': 1.7214, 'warning': "The 3 base models disagree by 17.4m, well beyond the normal range - this usually means the provided feature values don't form a physically realistic combination (e.g. a high elevation given alongside neighborhood-average features left at their default/typical values). Treat this prediction with caution."}
  Correctly passes as reliable: False

Self-test 3: an ACTUAL real row from the dataset (guaranteed fully consistent,
since it's a genuinely observed combination, not hand-crafted guesswork)...
  Real row's ACTUAL elevation_error_signed: -3.7397
  Model's prediction: -2.7362
  Reliable: True (should be True for a real, natural row)
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/apply_raster_correction.py --year 2022
============================================================
RASTER-WIDE DEM CORRECTION - Year 2022
============================================================

Loading C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\data\interim\features\features_2022.tif...
Traceback (most recent call last):
  File "C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\apply_raster_correction.py", line 201, in <module>
    main()
  File "C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\apply_raster_correction.py", line 104, in main
    stack = src.read()
  File "rasterio/_io.pyx", line 620, in rasterio._io.DatasetReaderBase.read
numpy._core._exceptions._ArrayMemoryError: Unable to allocate 24.9 GiB for an array with shape (43, 10800, 14400) and data type float32
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ uv run python model/apply_raster_correction.py --year 2022
============================================================
RASTER-WIDE DEM CORRECTION (TILED) - Year 2022
============================================================

Loading model...

Raster: 14400 x 10800 pixels, processing in 1024x1024 tiles
  Computing global statistics (one pass, needed for Moran's I and uncertainty normalization)...
Traceback (most recent call last):
  File "C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\apply_raster_correction.py", line 240, in <module>
    main()
  File "C:\Users\KARTHI\Documents\DEM_CORRECTION_reorganized\model\apply_raster_correction.py", line 182, in main
    UNCERTAINTY_WEIGHTS["tri"] * normalize_with_global_stats(
ValueError: operands could not be broadcast together with shapes (1024,1024) (1048576,) 
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ ^C

bash: D: command not found
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ 
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ 
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ 
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ 
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ 
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ 
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ curl -X POST http://localhost:8000/api/predict/describe-it \
  -H "Content-Type: application/json" \
  -d '{"description": "steep rugged terrain near a river with dense vegetation"}'
{"feature_values":{"slope_deg":35,"tri":0.7,"tpi":-0.5,"relative_slope_position":0.2,"planform_curvature":-0.3,"profile_curvature":-0.4,"general_curvature":0.5,"hillshade":0.6,"elevation_gradient":15,"ndvi":0.8,"ndwi":0.3,"ndsi":0.0,"evi":0.9,"shadow_index":0.4,"bsi":0.1,"slope_mean_5x5":30,"slope_std_5x5":10,"distance_to_water_km":0.1},"provider":"groq"}(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ curl -X POST http://localhost:8000/api/predict/describe-it   -H "Content-Type: application/json"   -d '{"description": "steep rugged terrain near a river with dense vegetation"}'
{"feature_values":{"slope_deg":35,"tri":0.9,"ndvi":0.82,"evi":0.88,"band_B08":8200,"ndwi":0.1,"ndsi":0.05,"bsi":0.1,"distance_to_water_km":0.05,"ndvi_mean_3x3":0.8},"provider":"groq"}(dem-correction)
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ grep -n "new-inputs" client/src/App.jsx
27:  "new-inputs": Sparkles,
119:       {active === "new-inputs" && (
(dem-correction) 
KARTHI@KARTHIKEYAN MINGW64 ~/Documents/DEM_CORRECTION_reorganized (main)
$ 