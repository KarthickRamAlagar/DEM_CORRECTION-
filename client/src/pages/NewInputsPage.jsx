import { API_BASE } from "../lib/apiBase";
import SdgContinueButton from "../components/sdg/SdgContinueButton";
import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Rectangle, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Sparkles, ChevronDown, Mic, ArrowRight, ArrowLeft, Mountain, Leaf, Radio, Grid3x3, MapPin, Calendar } from "lucide-react";
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "../components/ImageryOverlayLayer";
import { speakText } from "../lib/speakText";
import { playTingSound } from "../lib/notificationSound";
import { getSettings } from "../lib/settingsStore";

const PREDICT_API = `${API_BASE}/predict`;

import { newReportDoc, Flow, COL, dec } from "../lib/reportFlow";
import { reportVersionLine } from "../lib/reportVersion";
const STUDY_BOUNDS = [[25, 80], [28, 84]];
let AVAILABLE_YEARS_WITH_DATA = [2022, 2024, 2025, 2026];   // year fix: years come from the server
fetch(`${PREDICT_API}/available-years`)
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => { if (d && Array.isArray(d.available_years) && d.available_years.length) AVAILABLE_YEARS_WITH_DATA = d.available_years; })
  .catch(() => {});
const VALIDATED_YEARS = new Set([2022, 2023]);
const MAX_ACTIONS = 25;
const RESET_MS = 7 * 60 * 1000;
const SESSION_KEY = "newInputs_session";

const FEATURE_GROUPS = {
  "Terrain Shape": ["slope_deg", "aspect_sin", "aspect_cos", "tri", "tpi", "relative_slope_position", "planform_curvature", "profile_curvature", "general_curvature", "hillshade", "raw_z"],
  "Vegetation & Land Cover": ["ndvi", "ndwi", "ndsi", "evi", "shadow_index", "bsi", "band_B02", "band_B03", "band_B04", "band_B08", "band_B11", "band_B12", "ndvi_mean_3x3"],
  "Radar Signal": ["vv", "vh", "vv_vh_ratio", "vv_vh_diff", "vv_texture_std", "vh_texture_std", "vv_texture_contrast", "vh_texture_contrast", "radar_layover_flag", "radar_shadow_flag"],
  "Local Neighborhood": ["elev_mean_3x3", "elev_std_3x3", "slope_mean_5x5", "slope_std_5x5"],
  "Location & Environment": ["distance_to_water_km", "spatial_autocorrelation_moran", "terrain_region_class", "atmospheric_pressure_kpa", "relative_humidity_pct", "uncertainty_estimate"],
};
const GROUP_ICONS = { "Terrain Shape": Mountain, "Vegetation & Land Cover": Leaf, "Radar Signal": Radio, "Local Neighborhood": Grid3x3, "Location & Environment": MapPin };
const ATTEMPT_WORDS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh"];
function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th"}`;
}

const FIELD_LABELS = {
  slope_deg: "Slope (degrees)", aspect_sin: "Aspect (Sin)", aspect_cos: "Aspect (Cos)",
  tri: "Terrain Ruggedness Index", tpi: "Topographic Position Index",
  relative_slope_position: "Relative Slope Position", planform_curvature: "Planform Curvature",
  profile_curvature: "Profile Curvature", general_curvature: "General Curvature",
  hillshade: "Hillshade", raw_z: "Raw Elevation (m)",
  ndvi: "NDVI (Vegetation Index)", ndwi: "NDWI (Water Index)", ndsi: "NDSI (Snow Index)",
  evi: "EVI (Enhanced Vegetation)", shadow_index: "Shadow Index", bsi: "Bare Soil Index",
  band_B02: "Blue Band (B02)", band_B03: "Green Band (B03)", band_B04: "Red Band (B04)",
  band_B08: "NIR Band (B08)", band_B11: "SWIR Band (B11)", band_B12: "SWIR Band (B12)",
  ndvi_mean_3x3: "NDVI Mean (3x3)",
  vv: "SAR VV Backscatter", vh: "SAR VH Backscatter", vv_vh_ratio: "VV/VH Ratio",
  vv_vh_diff: "VV-VH Difference", vv_texture_std: "VV Texture Std Dev",
  vh_texture_std: "VH Texture Std Dev", vv_texture_contrast: "VV Texture Contrast",
  vh_texture_contrast: "VH Texture Contrast", radar_layover_flag: "Radar Layover Flag",
  radar_shadow_flag: "Radar Shadow Flag",
  elev_mean_3x3: "Elevation Mean (3x3)", elev_std_3x3: "Elevation Std Dev (3x3)",
  slope_mean_5x5: "Slope Mean (5x5)", slope_std_5x5: "Slope Std Dev (5x5)",
  distance_to_water_km: "Distance to Water (km)",
  spatial_autocorrelation_moran: "Spatial Autocorrelation (Moran's I)",
  terrain_region_class: "Terrain Region Class", atmospheric_pressure_kpa: "Atmospheric Pressure (kPa)",
  relative_humidity_pct: "Relative Humidity (%)", uncertainty_estimate: "Uncertainty Estimate",
};

const GROUP_NAMES = Object.keys(FEATURE_GROUPS);

function getVisibleWindow(currentIndex, totalSteps = GROUP_NAMES.length, windowSize = 3) {
  if (currentIndex <= windowSize - 2) return Array.from({ length: windowSize }, (_, i) => i);
  return Array.from({ length: windowSize }, (_, i) => totalSteps - windowSize + i);
}

function classifyDate(dateStr) {
  const year = parseInt(dateStr.split("-")[0], 10);
  return {
    year,
    validated: VALIDATED_YEARS.has(year),
    hasRealData: AVAILABLE_YEARS_WITH_DATA.includes(year),
  };
}

function loadSession(key = SESSION_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { count: 0, sessionStart: null, currentStep: 0 };
    const data = JSON.parse(raw);
    if (data.sessionStart && Date.now() - data.sessionStart >= RESET_MS) {
      localStorage.removeItem(key);
      return { count: 0, sessionStart: null, currentStep: 0 };
    }
    return data;
  } catch {
    return { count: 0, sessionStart: null, currentStep: 0 };
  }
}

function saveSession(count, sessionStart, currentStep, key = SESSION_KEY) {
  localStorage.setItem(key, JSON.stringify({ count, sessionStart, currentStep }));
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const SUGGESTED_DESCRIPTIONS = [
  "Steep rugged mountain slope in the Himalayan foothills with sparse vegetation and exposed rock",
  "Flat agricultural plains with moderate vegetation, far from any river or water body",
  "Dense forest cover on gently sloping terrain right next to a river",
  "Dry barren land with no vegetation, flat terrain, no nearby water source",
  "Flat urban built-up area with minimal vegetation and no significant water nearby",
  "Moderately steep hillside terrain with radar shadow present, patchy vegetation",
];

const markerIcon = new L.DivIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#5eead4;border:2px solid white;box-shadow:0 0 8px rgba(94,234,212,0.8);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// One real, internally consistent plains point from the golden dataset (genuinely observed feature combination),
// used by the "Sample input" button so a new user never has to invent feature values.
const SAMPLE_INPUT = { "aspect_cos": 0.6955, "aspect_sin": -0.7185, "band_B02": 2353, "band_B03": 2513, "band_B04": 2512, "band_B08": 3332, "band_B11": 3681, "band_B12": 3393, "bsi": 0.0428, "elev_mean_3x3": 61.2335, "elev_std_3x3": 0.6068, "evi": 0.1906, "general_curvature": 0.0007, "hillshade": 0.7243, "ndsi": -0.1886, "ndvi": 0.1403, "ndvi_mean_3x3": 0.1276, "ndwi": -0.1401, "planform_curvature": 0.0004, "profile_curvature": 0.0002, "raw_z": 60.6424, "relative_slope_position": 0.1182, "shadow_index": 0.7567, "slope_deg": 1.4137, "slope_mean_5x5": 0.9074, "slope_std_5x5": 0.6952, "terrain_region_class": 0, "tpi": -0.7363, "tri": 0.3821 };
const SAMPLE_LOCATION = { lat: 26.8002, lng: 80.6891 };

function regionName(lat) {
  return lat >= 27.0 ? "Himalayan Foothill Region" : "Gangetic Plains Region";
}

async function fetchRealPlaceName(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const parts = [addr.county || addr.state_district, addr.state, addr.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

function RealLocationCard({ lat, lng, placeName }) {
  return (
    <div className="px-4 py-3 border bg-ink-900/60 border-ink-700/60 rounded-xl">
      <p className="text-[11px]" style={{ color: "#facc15" }}>Real Location</p>
      <p className="text-sm font-medium text-white">{placeName || "Loading location..."}</p>
      <p className="text-[11px] mt-0.5" style={{ color: "#fb923c" }}>{regionName(lat)}</p>
      <p className="text-[11px] font-mono mt-0.5" style={{ color: "#fb923c" }}>{lat.toFixed(4)}, {lng.toFixed(4)}</p>
    </div>
  );
}

function Typewriter({ text, mode = "letter", speed = 40 }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    const units = mode === "word" ? text.split(" ") : text.split("");
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setShown(mode === "word" ? units.slice(0, i).join(" ") : units.slice(0, i).join(""));
      if (i >= units.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, mode, speed]);

  return <>{shown}</>;
}

function ProgressTimeline({ percent, label }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-ink-400">{label}</span>
        <span className="text-[11px] text-signal-teal font-mono">{percent}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-ink-800 overflow-hidden">
        <div
          className="h-full transition-all duration-500 rounded-full bg-signal-teal"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function DateField({ value, onChange }) {
  const info = classifyDate(value);
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] text-ink-500 mb-1">
        <Calendar size={12} /> Prediction date
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min="2022-01-01"
        max="2026-12-31"
        className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-1.5 text-[13px] text-white"
      />
      <p className={`text-[11px] mt-1 ${info.validated ? "text-signal-teal" : "text-signal-amber"}`}>
        {info.validated
          ? "Validated against real ICESat-2 ground truth"
          : "Unvalidated - extrapolation beyond training data"}
      </p>
      {!info.hasRealData && (
        <p className="text-[11px] mt-0.5 text-ink-500">No imagery features for this year - the 2022 imagery will be used.</p>
      )}
    </div>
  );
}

function StepTooltip({ groupName, fields, values, visible }) {
  if (!visible) return null;

  return (
    <div className="fixed right-5 bottom-5 z-[1100] flex items-end gap-3 pointer-events-none">
      <div
        className="
          relative w-fit max-w-[min(90vw,720px)]
          max-h-[330px] overflow-auto
          bg-white text-black
          rounded-2xl rounded-br-sm
          px-5 py-4
          shadow-[0_18px_50px_rgba(0,0,0,0.30)]
          border-2 border-red-700
          mb-8
          pointer-events-auto
        "
      >
        <div className="flex items-center gap-2 pb-2 mb-3 border-b border-red-700/25">
          <span className="w-2 h-2 bg-red-700 rounded-full shrink-0" />
          <p className="text-[13px] font-bold tracking-tight text-black whitespace-nowrap">
            <Typewriter text={`${groupName} - current values`} mode="letter" />
          </p>
        </div>

        <div className="grid grid-cols-[max-content_max-content] gap-x-8 gap-y-2">
          {fields.slice(0, 6).map((f) => (
            <div
              key={f}
              className="min-w-0 rounded-lg bg-red-400/10 px-3 py-1.5 border border-red-400/15"
            >
              <p className="text-[11px] leading-4 font-bold text-yellow-600 whitespace-nowrap">
                <Typewriter text={f} mode="word" speed={90} />
              </p>
              <p className="text-[13px] leading-5 font-bold text-black whitespace-nowrap">
                <Typewriter
                  text={`${values[f]?.toFixed?.(2) ?? values[f]}`}
                  mode="word"
                  speed={120}
                />
              </p>
            </div>
          ))}
        </div>
      </div>

      <img
        src="/assets/kalam-character.png"
        alt="APJ Abdul Kalam"
        style={{ transform: "scaleX(-1)" }}
        className="w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 object-contain shrink-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
      />
    </div>
  );
}

function TechnicalMode() {
  const initialSession = loadSession();

  const [defaults, setDefaults] = useState(null);
  const [values, setValues] = useState({});
  const [description, setDescription] = useState("");
  const [describing, setDescribing] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dateValue, setDateValue] = useState("2022-06-15");

  const [currentStep, setCurrentStep] = useState(initialSession.currentStep || 0);
  const [changedFields, setChangedFields] = useState(new Set());
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const [actionCount, setActionCount] = useState(initialSession.count || 0);
  const [sessionStart, setSessionStart] = useState(initialSession.sessionStart || null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [resetToast, setResetToast] = useState(false);

  const [pickedLocation, setPickedLocation] = useState(null);
  const [pdfMessage, setPdfMessage] = useState(null);
  const [placeName, setPlaceName] = useState(null);

  // NEW: gates the whole automated tooltip/speech system behind an
  // explicit choice, asked fresh every time this page is genuinely
  // (re)entered for a new form-filling attempt - null | "asking" |
  // "granted" | "declined". Replaces the old behavior of silently
  // resuming straight into the "asking" phase whenever the persisted
  // step happened to be the last one, which is exactly what was
  // firing "do you need to update any field" on a simple return visit.
  const [assistancePhase, setAssistancePhase] = useState(null);

  const recognitionRef = useRef(null);
  const countdownRef = useRef(null);
  const tooltipTimerRef = useRef(null);

  useEffect(() => {
    fetch(`${PREDICT_API}/technical/defaults`)
      .then((res) => res.json())
      .then((data) => {
        setDefaults(data.defaults);
        setValues(data.defaults);
      });
  }, []);

  // FIX (real bug reported): now checks window.__isApplicationTouring,
  // matching the same suppression pattern used elsewhere - the tour
  // has its own blocking overlay, this page's own assistance prompt
  // shouldn't fire on top of it. Dependency array changed from [] to
  // [assistancePhase, result] so this can genuinely re-fire whenever
  // something else resets assistancePhase back to null later (not
  // just once on the very first mount).
  useEffect(() => {
    if (window.__isApplicationTouring) return;
    if (!result && assistancePhase === null) {
      const timer = setTimeout(() => {
        setAssistancePhase("asking");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [assistancePhase, result]);

  useEffect(() => {
    if (!sessionStart) return;
    const tick = () => {
      const remaining = RESET_MS - (Date.now() - sessionStart);
      if (remaining <= 0) {
        setActionCount(0);
        setSessionStart(null);
        saveSession(0, null, currentStep);
        setCountdownMs(0);
        setResetToast(true);
        playTingSound();
        speakText("Your session has been reset. Feel free to predict again.");
        setTimeout(() => setResetToast(false), 6000);
      } else {
        setCountdownMs(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      setDescription(transcript);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  const resultSpokenRef = useRef(false);
  useEffect(() => {
    if (result && !result.error && !resultSpokenRef.current) {
      speakText("Here is your prediction result");
      resultSpokenRef.current = true;
    }
    if (!result) {
      resultSpokenRef.current = false;
    }
  }, [result]);

  const [confirmPhase, setConfirmPhase] = useState(null);
  const [changesText, setChangesText] = useState("");
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [changesListening, setChangesListening] = useState(false);
  const changesRecognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      setChangesText(transcript);
      setTimeout(() => applyChangesWithText(transcript), 100);
    };
    recognition.onend = () => setChangesListening(false);
    changesRecognitionRef.current = recognition;
  }, []);

  const toggleChangesListening = () => {
    if (!changesRecognitionRef.current) return;
    if (changesListening) {
      changesRecognitionRef.current.stop();
      setChangesListening(false);
    } else {
      setChangesText("");
      changesRecognitionRef.current.start();
      setChangesListening(true);
    }
  };

  const countdownStartTimerRef = useRef(null);
  const askingSpokenRef = useRef(false);

  // FIX (both real bugs found): (1) added "if (result) return" so this
  // never re-enters the asking flow after a result is already showing
  // - previously, actionCount incrementing on a successful submission
  // re-triggered this effect even though currentStep hadn't changed,
  // silently re-speaking "do you need to update any field" on the
  // result page. (2) now gated entirely behind assistancePhase ===
  // "granted" - a returning visit no longer silently jumps back into
  // the asking phase just because the persisted step happened to be
  // the last one; the new assistance prompt is the only way in.
  useEffect(() => {
    if (result) return;
    if (assistancePhase !== "granted") return;

    setShowTooltip(false);
    setConfirmPhase(null);
    askingSpokenRef.current = false;
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    if (countdownStartTimerRef.current) clearTimeout(countdownStartTimerRef.current);
    if (actionCount >= MAX_ACTIONS) return;
    if (window.__isApplicationTouring) return;

    tooltipTimerRef.current = setTimeout(() => {
      setShowTooltip(true);
      if (currentStep < GROUP_NAMES.length - 1) {
        countdownStartTimerRef.current = setTimeout(() => {
          startAutoAdvanceCountdown();
        }, 3000);
      } else {
        setConfirmPhase("asking");
        if (!askingSpokenRef.current) {
          speakText("Do you need to update any field?");
          askingSpokenRef.current = true;
        }
        startAskingCountdown();
      }
    }, 2000);
    return () => {
      clearTimeout(tooltipTimerRef.current);
      clearTimeout(countdownStartTimerRef.current);
    };
  }, [currentStep, actionCount, assistancePhase, result]);

  useEffect(() => {
    saveSession(actionCount, sessionStart, currentStep);
  }, [currentStep]);

  const handleAssistanceYes = () => {
    // FIX (real bug reported): a previously-persisted currentStep could
    // be sitting on the LAST step (e.g. "Location & Environment") from
    // an earlier attempt - granting assistance would then immediately
    // narrate the last step instead of walking through properly from
    // the beginning. Explicitly restarting at step 0 guarantees a real
    // step-by-step walkthrough every time assistance is granted.
    setCurrentStep(0);
    setAssistancePhase("granted");
    speakText("Let's walk through what we found.");
  };

  const handleAssistanceNo = () => {
    setAssistancePhase("declined");
  };

  const handleConfirmNo = () => {
    cancelAskingCountdown();
    setConfirmPhase(null);
    handleSubmit();
  };

  const handleConfirmYes = () => {
    cancelAskingCountdown();
    setConfirmPhase("changes");
    speakText("Which tab would you like, or simply tell me your changes - I will automate your work.");
  };

  const applyChangesWithText = (overrideText) => {
    const text = overrideText ?? changesText;
    if (!text.trim()) return;
    setApplyingChanges(true);
    fetch(`${PREDICT_API}/describe-it`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: text }),
    })
      .then((res) => res.json())
      .then((data) => {
        const returned = data.feature_values || {};
        if (Object.keys(returned).length > 0) {
          skipNextValuesResetRef.current = true; // mid-assisted-flow edit, not an independent manual change
          setValues((prev) => ({ ...prev, ...returned }));
          setChangedFields((prev) => new Set([...prev, ...Object.keys(returned)]));
        }
        setChangesText("");
        setConfirmPhase(null);
        setApplyingChanges(false);
      })
      .catch(() => setApplyingChanges(false));
  };
  const applyChanges = () => applyChangesWithText();

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setDescription("");
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const startAutoAdvanceCountdown = () => {
    let seconds = 5;
    setAutoAdvanceCountdown(seconds);
    countdownRef.current = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(countdownRef.current);
        setAutoAdvanceCountdown(null);
        setCurrentStep((s) => Math.min(GROUP_NAMES.length - 1, s + 1));
      } else {
        setAutoAdvanceCountdown(seconds);
      }
    }, 1000);
  };

  const cancelAutoAdvance = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (countdownStartTimerRef.current) clearTimeout(countdownStartTimerRef.current);
    setAutoAdvanceCountdown(null);
  };

  const askingCountdownRef = useRef(null);
  const startAskingCountdown = () => {
    let seconds = 8;
    setAutoAdvanceCountdown(seconds);
    askingCountdownRef.current = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(askingCountdownRef.current);
        setAutoAdvanceCountdown(null);
        handleConfirmNo();
      } else {
        setAutoAdvanceCountdown(seconds);
      }
    }, 1000);
  };
  const cancelAskingCountdown = () => {
    if (askingCountdownRef.current) clearInterval(askingCountdownRef.current);
    setAutoAdvanceCountdown(null);
  };

  const handleDescribe = (overrideText) => {
    const text = overrideText ?? description;
    if (!text.trim()) return;
    if (overrideText) setDescription(overrideText);
    setDescribing(true);
    fetch(`${PREDICT_API}/describe-it`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: text }),
    })
      .then((res) => res.json())
      .then((data) => {
        const returned = data.feature_values || {};
        if (Object.keys(returned).length > 0) {
          skipNextValuesResetRef.current = true;
          setValues((prev) => ({ ...prev, ...returned }));
          setChangedFields(new Set(Object.keys(returned)));
          const firstGroupIndex = GROUP_NAMES.findIndex((g) =>
            FEATURE_GROUPS[g].some((f) => f in returned)
          );
          setCurrentStep(firstGroupIndex >= 0 ? firstGroupIndex : 0);
          // Describing implies wanting the guided walkthrough - grant
          // assistance automatically so the tooltip system engages
          if (assistancePhase !== "granted") {
            setAssistancePhase("granted");
          }
          speakText("Got it, shall we walk through what we found?");
          startAutoAdvanceCountdown();
        }
        setDescribing(false);
      })
      .catch(() => setDescribing(false));
  };

  const goNext = () => {
    cancelAutoAdvance();
    setCurrentStep((s) => Math.min(GROUP_NAMES.length - 1, s + 1));
  };
  const goBack = () => {
    cancelAutoAdvance();
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  // FIX (real requirement): the assistance prompt + its whole guided
  // workflow should genuinely re-trigger whenever the user manually
  // changes an input field, the date, or picks a new map location -
  // treating any such edit as the start of a fresh attempt. Skips the
  // very first render (that's the initial mount's own first ask,
  // already handled above) using a ref, only reacting to REAL
  // subsequent changes.
  const skipNextValuesResetRef = useRef(false);
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (skipNextValuesResetRef.current) {
      // FIX: describing auto-grants assistance in the same action that
      // changes values - without this flag, this effect would
      // immediately undo that grant right back to null
      skipNextValuesResetRef.current = false;
      return;
    }
    if (result) return;
    if (assistancePhase === null) return;
    setAssistancePhase(null);
    setShowTooltip(false);
    setConfirmPhase(null);
    cancelAutoAdvance();
    cancelAskingCountdown();
  }, [values, dateValue, pickedLocation]);

  const handleMapPick = useCallback((lat, lng) => {
    setPickedLocation({ lat, lng });
    setPlaceName(null);
    fetchRealPlaceName(lat, lng).then(setPlaceName);
  }, []);

  function LocationClickHandler() {
    useMapEvents({ click: (e) => handleMapPick(e.latlng.lat, e.latlng.lng) });
    return null;
  }

  const handleSubmit = () => {
    if (actionCount >= MAX_ACTIONS) return;
    cancelAutoAdvance();
    cancelAskingCountdown();
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setShowTooltip(false);
    setConfirmPhase(null);
    setSubmitting(true);
    fetch(`${PREDICT_API}/technical`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature_values: values }),
    })
      .then((res) => res.json())
      .then((data) => {
        setResult(data);
        setSubmitting(false);
        const newCount = actionCount + 1;
        setActionCount(newCount);
        if (newCount >= MAX_ACTIONS && !sessionStart) {
          const start = Date.now();
          setSessionStart(start);
          saveSession(newCount, start, currentStep);
        } else {
          saveSession(newCount, sessionStart, currentStep);
        }
      })
      .catch(() => {
        setResult({ error: "Could not reach the prediction service." });
        setSubmitting(false);
      });
  };

  const generatePdf = async () => {
    const pdfSettings = getSettings();
    const dp = pdfSettings.pdfDecimalPlaces; // real setting, used everywhere below instead of hardcoded .toFixed(2)
    const ok = !!result && !result.error;

    // the picture for the cover (read once as a data URL)
    let kalam = null;
    try {
      const blob = await (await fetch("/assets/kalam-character.png")).blob();
      kalam = await new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); });
    } catch { kalam = null; }

    // ONE template for every report (lib/reportFlow.js): same border, headings, tables and footer as the Evaluation report.
    const doc = newReportDoc();
    const f = new Flow(doc, { label: "Technical Prediction Report" });
    f.disclaimer = "This report preserves the prediction values returned by the DEM-Correction model. Please cross-verify them, as predictions can sometimes contain errors.";
    const corrected = ok ? values.raw_z + result.predicted_error : null;
    const fx = (v) => (v == null || Number.isNaN(v) ? "No data" : `${Number(v).toFixed(dp)} m`);

    f.title("Digital elevation model correction report", "Hybrid machine-learning based elevation error correction report");

    if (pdfSettings.pdfIncludePredictionSummary && ok) {
      f.heroCard({
        image: kalam, imageAspect: 269 / 227,
        label: "New corrected value", value: fx(corrected),
        drop: `${result.predicted_error <= 0 ? "Lower" : "Higher"} by ${Math.abs(result.predicted_error).toFixed(dp)} m`,
        items: [["Old estimate", fx(values.raw_z)], ["Predicted correction", fx(result.predicted_error)]],
      });
    }
    if (pdfSettings.pdfIncludeCorrectionInsight && ok) {
      f.callout("Correction insight", [`The model estimated a vertical correction of ${fx(result.predicted_error)}, changing the original elevation from ${fx(values.raw_z)} to ${fx(corrected)}.`]);
      f.kpi([
        { label: "Model", value: result.model_used || "No data", sub: "" },
        { label: "Validated RMSE", value: `${result.validated_rmse} m`, sub: "on areas the model has not seen", color: COL.blue },
        { label: "Confidence", value: result.is_reliable ? "Reliable" : "Low confidence", sub: result.is_reliable ? "within the validated error" : "treat with care", color: result.is_reliable ? COL.green : COL.red },
      ]);
    }

    if (pdfSettings.pdfIncludeAllFeatures) {
      f.section("Input feature analysis", { index: false, minSpace: 60 });
      f.para("Terrain, vegetation, radar and neighbourhood values the correction model used for this point.", { size: 8, color: COL.grey });
      Object.keys(FEATURE_GROUPS).forEach((groupName) => {
        f.h2(groupName);
        f.table([{ label: "Input", left: true, w: 3 }, { label: "Value", w: 1.6 }],
          FEATURE_GROUPS[groupName].map((field) => { const v = values[field]; return [FIELD_LABELS[field] || field, v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)) ? "Not used by model v2" : dec(v)]; }));
      });
    }

    if (pickedLocation && pdfSettings.pdfIncludeLocation) {
      f.h2("Real location");
      f.kv([["Place", placeName || "Unknown"], ["Region", regionName(pickedLocation.lat)], ["Coordinates", `${pickedLocation.lat.toFixed(4)}, ${pickedLocation.lng.toFixed(4)}`]]);
    }

    if (ok && pdfSettings.pdfIncludeValidation) {
      f.h2("Model validation");
      f.kv([
        ["Original elevation", fx(values.raw_z)],
        ["Predicted correction", fx(result.predicted_error)],
        ["Corrected elevation", fx(corrected)],
        ["Validated RMSE", `${result.validated_rmse} m`],
        ["Confidence", result.is_reliable ? "Reliable" : "Low confidence"],
        ["Model", result.model_used],
        ...(result.interval_lower !== undefined ? [
          ["Uncertainty range (nominal 90%, approx.)", `${fx(values.raw_z + result.interval_lower)} to ${fx(values.raw_z + result.interval_upper)}`],
          ["Model version", `${result.model_version}`],
        ] : []),
      ]);
    }

    f.versionLine = await reportVersionLine();
    f.finish();
    doc.save("dem-correction-technical-summary.pdf");
    setPdfMessage("PDF downloaded successfully");
  };

  const handleSampleInput = () => {
    setValues({ ...defaults, ...SAMPLE_INPUT });
    setDateValue("2022-06-15");
    setPickedLocation(SAMPLE_LOCATION);
    setPlaceName(null);
    fetchRealPlaceName(SAMPLE_LOCATION.lat, SAMPLE_LOCATION.lng).then(setPlaceName);
    setChangedFields(new Set());
  };

  const handleAskAgain = () => {
    setResult(null);
    setCurrentStep(0);
    setChangedFields(new Set());
    setDescription("");
    setValues(defaults);
    setPickedLocation(null);   // fresh attempt: clear the previous map pin, place name and date
    setPlaceName(null);
    setDateValue("2022-06-15");
    setAssistancePhase(null); // fresh attempt - ask again whether assistance is wanted
    saveSession(actionCount, sessionStart, 0);
  };

  if (!defaults) {
    return <p className="px-6 py-4 text-sm text-ink-400">Loading real default values...</p>;
  }

  const remaining = MAX_ACTIONS - actionCount;
  const limitReached = remaining <= 0;

  if (result) {
    const dateInfo = classifyDate(dateValue);
    return (
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        {resetToast && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-signal-teal/40 bg-signal-teal/10 px-4 py-2.5 text-xs text-signal-teal">
            Your session has been reset - feel free to predict again.
          </div>
        )}
        <ProgressTimeline percent={100} label="Input complete - showing your output" />
        {pickedLocation && (
          <div className="mb-4">
            <RealLocationCard lat={pickedLocation.lat} lng={pickedLocation.lng} placeName={placeName} />
          </div>
        )}
        <div className="p-5 border bg-ink-900/60 border-ink-700/60 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-ink-500">
              Numerical comparison - {dateValue}
              {!dateInfo.validated && <span className="ml-2 text-signal-amber">(unvalidated year)</span>}
            </p>
            {limitReached && (
              <span className="text-[12px] font-mono text-signal-amber">
                Resets in {formatCountdown(countdownMs)}
              </span>
            )}
          </div>
          {result.error ? (
            <p className="text-[13px] text-signal-amber">{result.error}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-ink-800/60">
                  <p className="text-[11px] text-ink-500">Old estimate (uncorrected)</p>
                  <p className="font-mono text-2xl font-semibold text-ink-300">{values.raw_z?.toFixed(2)} m</p>
                </div>
                <div className="p-4 border rounded-lg bg-signal-teal/10 border-signal-teal/30">
                  <p className="text-[11px] text-signal-teal">New corrected value</p>
                  <p className="font-mono text-2xl font-semibold text-white">
                    {(values.raw_z + result.predicted_error)?.toFixed(2)} m
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t sm:grid-cols-4 border-ink-700/60">
                <div>
                  <p className="text-[11px] text-ink-500">Predicted correction</p>
                  <p className="font-mono text-base font-semibold text-signal-teal">
                    {result.predicted_error >= 0 ? "+" : ""}{result.predicted_error?.toFixed(2)} m
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">Model</p>
                  <p className="text-sm font-medium text-white">{result.model_used}</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">Validated RMSE</p>
                  <p className="font-mono text-sm text-ink-300">{result.validated_rmse} m</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">Confidence</p>
                  <p className={`text-sm font-semibold ${result.is_reliable ? "text-signal-teal" : "text-signal-red"}`}>
                    {result.is_reliable ? "Reliable" : "Low confidence"}
                  </p>
                </div>
              </div>
              {result.interval_lower !== undefined && (
                <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t sm:grid-cols-4 border-ink-700/60">
                  <div className="sm:col-span-2">
                    <p className="text-[11px] text-ink-500">Uncertainty range (nominal 90%, approximate)</p>
                    <p className="font-mono text-sm text-ink-200">
                      {(values.raw_z + result.interval_lower)?.toFixed(2)} m to {(values.raw_z + result.interval_upper)?.toFixed(2)} m
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-500">Model version</p>
                    <p className="font-mono text-sm text-ink-300">{result.model_version}</p>
                  </div>
                </div>
              )}
              {result.warning && (
                <p className="text-[12px] text-signal-amber mt-3 pt-3 border-t border-ink-700/60">{result.warning}</p>
              )}
            </>
          )}
        </div>

        {!result.error && (
          <div className="p-4 mt-4 overflow-hidden border bg-ink-900/60 border-ink-700/60 rounded-xl">
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-stretch">
              <div className="relative min-h-[250px] lg:min-h-[280px] rounded-xl border border-ink-700/50 bg-ink-950/40 flex items-end justify-center overflow-hidden">
                <img
                  src="/assets/kalam-character.png"
                  alt="APJ Abdul Kalam"
                  className="w-64 h-64 lg:w-72 lg:h-72 object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
                />
              </div>

              <div className="min-w-0">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-1">
                  <div className="p-4 text-center border rounded-lg bg-signal-teal/10 border-signal-teal/30">
                    <p className="text-[14px] text-signal-teal">New corrected value</p>
                    <p className="font-mono text-4xl font-bold text-white">
                      {(values.raw_z + result.predicted_error)?.toFixed(2)} m
                    </p>
                  </div>
                </div>

                {result.warning && (
                  <p className="text-[12px] text-signal-amber mt-3 pt-3 border-t border-ink-700/60 leading-5">
                    {result.warning}
                  </p>
                )}
                <p className="text-[12px] text-ink-400 mt-3 text-center">
                  {remaining} of {MAX_ACTIONS} predictions remaining this session
                </p>
                <div className="flex gap-3 mt-4">
                  <button onClick={handleAskAgain} disabled={limitReached} className="flex-1 py-2.5 bg-ink-700 text-white rounded-lg text-sm font-medium hover:bg-ink-600 disabled:opacity-40">
                    Ask Again
                  </button>
                  <button
                    onClick={generatePdf}
                    className="flex-1 py-2.5 bg-ink-800 border border-ink-700 text-ink-300 rounded-lg text-sm font-medium hover:text-white"
                  >
                    Download PDF
                  </button>
                </div>
                {pdfMessage && <p className="text-[12px] text-ink-500 mt-2 text-center">{pdfMessage}</p>}
                <div className="mt-3">
                  <SdgContinueButton lat={pickedLocation?.lat} lng={pickedLocation?.lng} corrected={values.raw_z + result.predicted_error} raw={values.raw_z}
                    interval={result.interval_lower !== undefined ? [values.raw_z + result.interval_lower, values.raw_z + result.interval_upper] : null} date={dateValue}
                    inputs={GROUP_NAMES.map((g) => ({ group: g, rows: FEATURE_GROUPS[g].map((f) => [FIELD_LABELS[f] || f, values[f] ?? null]) }))}
                    engine={{ model: result.model_used, rmse: result.validated_rmse, reliable: result.is_reliable, version: result.model_version }}
                    className="w-full rounded-lg border border-signal-teal/40 bg-signal-teal/10 px-3 py-2.5 text-sm font-medium text-signal-teal hover:bg-signal-teal/20" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentGroupName = GROUP_NAMES[currentStep];
  const isLastStep = currentStep === GROUP_NAMES.length - 1;
  const visibleWindow = getVisibleWindow(currentStep);

  return (
    <div className="flex-1 px-6 py-4 overflow-y-auto">
      {resetToast && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-signal-teal/40 bg-signal-teal/10 px-4 py-2.5 text-xs text-signal-teal">
          Your session has been reset - feel free to predict again.
        </div>
      )}
      {limitReached && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-4 py-2.5 text-[13px] text-signal-amber">
          <span>You've used all {MAX_ACTIONS} predictions for this session.</span>
          <span className="font-mono font-semibold">Resets in {formatCountdown(countdownMs)}</span>
        </div>
      )}

      <div className="p-4 mb-4 border bg-ink-900/60 border-ink-700/60 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={15} className="text-signal-teal" />
          <span className="text-sm font-medium text-white">Describe it instead</span>
        </div>
        <div className="flex gap-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={limitReached}
            placeholder={limitReached ? "Session limit reached - wait for reset" : listening ? "Listening..." : "e.g. steep rugged terrain near a river with dense vegetation"}
            className="flex-1 px-3 py-2 text-sm text-white border rounded-lg bg-ink-800 border-ink-700 placeholder:text-ink-500 disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button onClick={toggleListening} disabled={limitReached} className={`w-9 h-9 flex items-center justify-center rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed ${listening ? "bg-signal-red border-signal-red text-white" : "border-ink-700 text-ink-400"}`}>
            <Mic size={15} />
          </button>
          <button onClick={() => handleDescribe()} disabled={describing || !description.trim() || limitReached} className="px-4 py-2 bg-signal-teal text-ink-950 rounded-lg text-[13px] font-medium disabled:opacity-40">
            {describing ? "Thinking..." : "Auto-fill"}
          </button>
          <button onClick={handleSampleInput} disabled={limitReached} className="px-4 py-2 border border-signal-teal/50 text-signal-teal rounded-lg text-[13px] font-medium hover:bg-signal-teal/10 disabled:opacity-40">
            Sample input
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SUGGESTED_DESCRIPTIONS.map((text) => (
            <button key={text} onClick={() => handleDescribe(text)} disabled={describing || limitReached} className="rounded-full border border-ink-700 px-3 py-1 text-[11px] text-ink-300 hover:border-signal-teal/50 hover:text-white transition-colors disabled:opacity-40">
              {text.length > 45 ? text.slice(0, 45) + "..." : text}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <DateField value={dateValue} onChange={setDateValue} />
      </div>

      <div className="mb-4">
        <p className="text-[12px] text-ink-400 mb-2">Pick a location on the map (optional, for the real-location report)</p>
        <div className="h-[180px] rounded-xl overflow-hidden border border-ink-700/60">
          <MapContainer bounds={STUDY_BOUNDS} style={{ height: "100%", width: "100%" }}>
            <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
            <Rectangle bounds={STUDY_BOUNDS} pathOptions={{ color: "#5eead4", weight: 2, fill: false }} />
            {pickedLocation && <Marker position={[pickedLocation.lat, pickedLocation.lng]} icon={markerIcon} />}
            <LocationClickHandler />
          </MapContainer>
        </div>
        {pickedLocation && (
          <div className="mt-2">
            <RealLocationCard lat={pickedLocation.lat} lng={pickedLocation.lng} placeName={placeName} />
          </div>
        )}
      </div>

      {autoAdvanceCountdown !== null && (
        <div className="flex items-center justify-between bg-signal-teal/10 border border-signal-teal/40 rounded-lg px-4 py-2.5 mb-4">
          <p className="text-[13px] text-signal-teal">Moving to the next step in {autoAdvanceCountdown}...</p>
          <button onClick={cancelAutoAdvance} className="text-[12px] text-ink-400 hover:text-white shrink-0 ml-3">Stay here</button>
        </div>
      )}

      {/* NEW: the assistance gate - shown before any automated tooltip
          behavior is allowed to engage, on every fresh attempt */}
      {assistancePhase === "asking" && (
        <div className="fixed right-5 bottom-5 z-[1100] flex items-end gap-4 max-w-none">
          <div className="relative px-5 py-4 mb-8 bg-white rounded-br-sm shadow-2xl text-ink-950 rounded-2xl">
            <p className="text-[13px] font-bold text-black mb-3">
              Do you need assistance to automatically view the summary and run the prediction?
            </p>
            <div className="flex gap-2">
              <button onClick={handleAssistanceYes} className="flex-1 py-1.5 bg-signal-teal text-ink-950 rounded-lg text-[13px] font-medium">Yes</button>
              <button onClick={handleAssistanceNo} className="flex-1 py-1.5 border border-ink-300 text-ink-600 rounded-lg text-[13px] font-medium">No</button>
            </div>
          </div>
          <img
            src="/assets/kalam-character.png"
            alt="APJ Abdul Kalam"
            style={{ transform: "scaleX(-1)" }}
            className="w-52 h-52 object-contain shrink-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
          />
        </div>
      )}

      {showTooltip && confirmPhase === "asking" && (
        <div className="fixed right-5 bottom-5 z-[1100] flex items-end gap-4 max-w-none">
          <div className="relative px-5 py-4 mb-8 bg-white rounded-br-sm shadow-2xl text-ink-950 rounded-2xl">
            <p className="text-[13px] font-bold text-black mb-3">Do you need to update any field?</p>
            <div className="flex gap-2">
              <button onClick={handleConfirmYes} className="flex-1 py-1.5 bg-ink-800 text-white rounded-lg text-[13px] font-medium">Yes</button>
              <button onClick={handleConfirmNo} className="flex-1 py-1.5 bg-signal-teal text-ink-950 rounded-lg text-[13px] font-medium">No, run it</button>
            </div>
            {autoAdvanceCountdown !== null && (
              <p className="text-[11px] text-ink-500 mt-2 text-center">
                Running automatically in {autoAdvanceCountdown}s...
              </p>
            )}
          </div>
          <img
            src="/assets/kalam-character.png"
            alt="APJ Abdul Kalam"
            style={{ transform: "scaleX(-1)" }}
            className="w-52 h-52 object-contain shrink-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
          />
        </div>
      )}

      {showTooltip && confirmPhase === "changes" && (
        <div className="fixed right-5 bottom-5 z-[1100] flex items-end gap-4 max-w-none">
          <div className="relative flex-1 max-w-md px-5 py-4 mb-8 bg-white rounded-br-sm shadow-2xl text-ink-950 rounded-2xl">
            <p className="text-[13px] font-bold text-black mb-2">Tell me your changes, or pick a step below</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {GROUP_NAMES.map((g, i) => (
                <button key={g} onClick={() => { setCurrentStep(i); setConfirmPhase(null); }}
                  className="text-[11px] px-2 py-1 rounded-md bg-ink-100 text-ink-700 hover:bg-ink-200">
                  {g}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={changesText}
                onChange={(e) => setChangesText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyChanges(); }}
                placeholder={changesListening ? "Listening..." : "e.g. make it steeper with less vegetation"}
                className="flex-1 border border-ink-300 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-950"
              />
              <button onClick={toggleChangesListening}
                className={`px-2.5 rounded-lg ${changesListening ? "bg-signal-red text-white" : "border border-ink-300 text-ink-600"}`}>
                <Mic size={14} />
              </button>
              <button onClick={applyChanges} disabled={applyingChanges || !changesText.trim()}
                className="px-3 py-1.5 bg-signal-teal text-ink-950 rounded-lg text-[12px] font-medium disabled:opacity-40">
                {applyingChanges ? "..." : "Apply"}
              </button>
            </div>
            <div className="flex gap-1.5 mt-2 pt-2 border-t border-ink-200">
              <button onClick={() => setConfirmPhase("asking")} className="flex-1 py-1.5 border border-ink-300 text-ink-600 rounded-lg text-[12px] font-medium">
                Cancel
              </button>
              <button onClick={handleConfirmNo} className="flex-1 py-1.5 bg-signal-teal text-ink-950 rounded-lg text-[12px] font-medium">
                Run Prediction
              </button>
            </div>
          </div>
          <img
            src="/assets/kalam-character.png"
            alt="APJ Abdul Kalam"
            style={{ transform: "scaleX(-1)" }}
            className="w-52 h-52 object-contain shrink-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
          />
        </div>
      )}

      {showTooltip && confirmPhase === null && assistancePhase === "granted" && (
        <StepTooltip
          groupName={currentGroupName}
          fields={FEATURE_GROUPS[currentGroupName]}
          values={values}
          visible={true}
        />
      )}

      <p className="text-[12px] text-ink-400 mb-1">{ATTEMPT_WORDS[actionCount] || ordinal(actionCount + 1)} attempt of {MAX_ACTIONS}</p>
      <ProgressTimeline percent={Math.round(((currentStep + 1) / (GROUP_NAMES.length + 1)) * 100)} label={`Step ${currentStep + 1} of ${GROUP_NAMES.length} - Input`} />

      <div className="flex items-center gap-2 mb-5">
        {visibleWindow.map((idx, i) => {
          const GroupIcon = GROUP_ICONS[GROUP_NAMES[idx]];
          const isActive = idx === currentStep;
          return (
            <div key={idx} className="flex items-center flex-1 gap-2">
              <button onClick={() => setCurrentStep(idx)} disabled={limitReached} className={`flex flex-col items-center gap-1 flex-1 py-2.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isActive ? "border-signal-teal bg-signal-teal/10" : "border-ink-700 text-ink-400"}`}>
                <GroupIcon size={18} className={isActive ? "text-signal-teal" : "text-ink-500"} />
                <span className={`text-[11px] font-medium ${isActive ? "text-white" : "text-ink-400"}`}>{GROUP_NAMES[idx]}</span>
              </button>
              {i < visibleWindow.length - 1 && <div className="w-4 h-px bg-ink-700 shrink-0" />}
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden border border-ink-700/60 rounded-xl">
        <div className="px-4 py-2.5 bg-ink-800/60 text-sm font-medium text-white">
          {currentGroupName} (step {currentStep + 1} of {GROUP_NAMES.length})
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          {FEATURE_GROUPS[currentGroupName].map((field) => (
            <div key={field}>
              <label className="text-[11px] text-ink-500 block mb-1">
                {field}{changedFields.has(field) && <span className="ml-1 text-signal-teal">*</span>}
              </label>
              <input
                type="number" step="any" value={values[field] ?? ""}
                disabled={limitReached}
                onChange={(e) => setValues((prev) => ({ ...prev, [field]: parseFloat(e.target.value) }))}
                className={`w-full bg-ink-800 border rounded-lg px-2.5 py-1.5 text-[13px] text-white disabled:opacity-40 disabled:cursor-not-allowed ${changedFields.has(field) ? "border-signal-teal/50" : "border-ink-700"}`}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-ink-700/60">
          <button onClick={goBack} disabled={currentStep === 0 || limitReached} className="flex items-center gap-1 text-[13px] text-ink-400 disabled:opacity-30">
            <ArrowLeft size={14} /> Back
          </button>
          {isLastStep ? (
            <button onClick={handleSubmit} disabled={submitting || limitReached} className="flex items-center gap-1 px-4 py-1.5 bg-signal-teal text-ink-950 rounded-lg text-[13px] font-medium disabled:opacity-40">
              {submitting ? "Predicting..." : "Run Prediction"}
            </button>
          ) : (
            <button onClick={goNext} disabled={limitReached} className="flex items-center gap-1 px-4 py-1.5 bg-ink-700 text-white rounded-lg text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NormalMode() {
  const initialSession = loadSession("newInputs_normal_session");

  const [dateValue, setDateValue] = useState("2022-06-15");
  const [clickedPoint, setClickedPoint] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [placeName, setPlaceName] = useState(null);

  const [actionCount, setActionCount] = useState(initialSession.count || 0);
  const [sessionStart, setSessionStart] = useState(initialSession.sessionStart || null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [resetToast, setResetToast] = useState(false);

  const dateInfo = classifyDate(dateValue);
  const usedYear = dateInfo.hasRealData ? dateInfo.year : 2022;   // imagery year actually used
  const remaining = MAX_ACTIONS - actionCount;
  const limitReached = remaining <= 0;

  useEffect(() => {
    if (!sessionStart) return;
    const tick = () => {
      const remainingMs = RESET_MS - (Date.now() - sessionStart);
      if (remainingMs <= 0) {
        setActionCount(0);
        setSessionStart(null);
        saveSession(0, null, 0, "newInputs_normal_session");
        setCountdownMs(0);
        setResetToast(true);
        playTingSound();
        speakText("Your session has been reset. Feel free to predict again.");
        setTimeout(() => setResetToast(false), 6000);
      } else {
        setCountdownMs(remainingMs);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  const handleClick = useCallback((lat, lng) => {
    if (limitReached) return;
    setClickedPoint({ lat, lng });
    setResult(null);
    setPlaceName(null);
    setLoading(true);
    fetch(`${PREDICT_API}/area`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lng, year: usedYear }),
    })
      .then((res) => res.json())
      .then((data) => {
        setResult(data && data.detail ? { error: typeof data.detail === "string" ? data.detail : "The server could not answer for this point." } : data);
        setLoading(false);
        const newCount = actionCount + 1;
        setActionCount(newCount);
        if (newCount >= MAX_ACTIONS && !sessionStart) {
          const start = Date.now();
          setSessionStart(start);
          saveSession(newCount, start, 0, "newInputs_normal_session");
        } else {
          saveSession(newCount, sessionStart, 0, "newInputs_normal_session");
        }
      })
      .catch(() => {
        setResult({ error: "Could not fetch data for this point." });
        setLoading(false);
      });
    fetchRealPlaceName(lat, lng).then(setPlaceName);
  }, [dateValue]);

  function ClickHandler() {
    useMapEvents({ click: (e) => handleClick(e.latlng.lat, e.latlng.lng) });
    return null;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {resetToast && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-signal-teal/40 bg-signal-teal/10 text-[12px] text-signal-teal">
          Your session has been reset - feel free to predict again.
        </div>
      )}
      {limitReached && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-signal-amber/40 bg-signal-amber/10 text-[12px] text-signal-amber">
          <span>You've used all {MAX_ACTIONS} predictions for this session.</span>
          <span className="font-mono font-semibold">Resets in {formatCountdown(countdownMs)}</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3 px-4 py-2 border-b border-ink-700/60 bg-ink-900/40">
        <DateField value={dateValue} onChange={setDateValue} />
        <span className="text-[12px] text-ink-400 mt-5 whitespace-nowrap">{remaining} of {MAX_ACTIONS} predictions remaining</span>
      </div>
      <div className="px-4 pt-3">
        <ProgressTimeline
          percent={result ? 100 : clickedPoint ? 60 : 0}
          label={result ? "Output ready" : clickedPoint ? "Fetching your result" : "Pick an area to begin"}
        />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1">
          <MapContainer bounds={STUDY_BOUNDS} style={{ height: "100%", width: "100%" }}>
            <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
            <Rectangle bounds={STUDY_BOUNDS} pathOptions={{ color: dateInfo.validated ? "#5eead4" : "#facc15", weight: 2, fill: false }} />
            {clickedPoint && <Marker position={[clickedPoint.lat, clickedPoint.lng]} icon={markerIcon} />}
            <ClickHandler />
          </MapContainer>
          {!clickedPoint && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-ink-900/90 backdrop-blur-md border border-ink-700/60 rounded-lg px-4 py-2 text-[12px] text-ink-400">
              Click anywhere inside the boundary to check that area
            </div>
          )}
        </div>

        <div className="w-[340px] border-l border-ink-700/60 p-4 overflow-y-auto">
          {!clickedPoint ? (
            <p className="text-sm text-ink-400">Click a point on the map to see results here.</p>
          ) : loading ? (
            <p className="text-sm text-ink-400">Fetching real values for this point...</p>
          ) : result?.error ? (
            <p className="text-sm text-signal-amber">{result.error}</p>
          ) : result ? (
            <div className="space-y-4">
              {!dateInfo.validated && (
                <div className="bg-signal-amber/10 border border-signal-amber/40 rounded-lg px-3 py-2 text-[11px] text-signal-amber">
                  {dateInfo.year} has no real ground truth - treat this result as an estimate, not a checked prediction.
                </div>
              )}
              {usedYear !== dateInfo.year && (
                <div className="bg-signal-amber/10 border border-signal-amber/40 rounded-lg px-3 py-2 text-[11px] text-signal-amber">
                  No satellite imagery features exist for {dateInfo.year}, so the {usedYear} imagery was used. Terrain inputs are the same; vegetation inputs may differ.
                </div>
              )}
              <RealLocationCard lat={clickedPoint.lat} lng={clickedPoint.lng} placeName={placeName} />
              <div>
                <p className="text-[11px] text-ink-500">Raw Elevation</p>
                <p className="font-mono text-lg font-semibold text-ink-200">{result.raw_elevation?.toFixed(2)} m</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-500">Corrected Elevation</p>
                <p className="font-mono text-lg font-semibold text-white">{result.corrected_elevation?.toFixed(2)} m</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-500">Risk Level</p>
                <p className={`text-base font-semibold ${result.risk_level === "Low" ? "text-signal-teal" : result.risk_level === "Medium" ? "text-signal-amber" : "text-signal-red"}`}>
                  {result.risk_level}
                </p>
              </div>
              {result.corrected_interval && (
                <div>
                  <p className="text-[11px] text-ink-500">Uncertainty range (approx. 90%)</p>
                  <p className="font-mono text-sm text-ink-200">
                    {result.corrected_interval[0]?.toFixed(2)} m to {result.corrected_interval[1]?.toFixed(2)} m
                  </p>
                </div>
              )}
              <p className="text-[12px] text-ink-400 pt-3 border-t border-ink-700/60">{result.message}</p>
<SdgContinueButton lat={clickedPoint.lat} lng={clickedPoint.lng} corrected={result.corrected_elevation} raw={result.raw_elevation} interval={result.corrected_interval ?? null} date={dateValue} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function NewInputsPage() {
  const [mode, setMode] = useState("technical");

  return (
    <div className="flex flex-col w-full h-full min-w-0">
      <div className="px-6 pt-6 pb-4 shrink-0">
        <p className="text-[11px] font-mono tracking-[0.15em] uppercase text-ink-400">GEOINT / New Inputs</p>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="text-xl font-semibold text-white font-display">New Inputs</h1>
            <p className="mt-1 text-sm text-ink-400">Get a real prediction - fill in exact values, describe the terrain, or just click an area.</p>
          </div>
          <div className="flex items-center bg-ink-800 border border-ink-700 rounded-lg p-0.5">
            <button onClick={() => setMode("technical")} className={`px-4 py-1.5 rounded-md text-[13px] font-medium ${mode === "technical" ? "bg-ink-700 text-white" : "text-ink-400"}`}>Technical User</button>
            <button onClick={() => setMode("normal")} className={`px-4 py-1.5 rounded-md text-[13px] font-medium ${mode === "normal" ? "bg-ink-700 text-white" : "text-ink-400"}`}>Normal User</button>
          </div>
        </div>
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        {mode === "technical" ? <TechnicalMode /> : <NormalMode />}
      </div>
    </div>
  );
}