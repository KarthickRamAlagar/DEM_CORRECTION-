import { MapPin, Waves, Building2, Wheat, Sprout, Coins, FileText } from "lucide-react";

// The guided flow, in order. One page per step. "sdg" is shown on the card; null for non-SDG pages.
export const FLOW_STEPS = [
  { id: "inputs", icon: MapPin, title: "Place and DEM result", sdg: null,
    what: "The place and the corrected elevation from the DEM engine, or a place you choose on the map.",
    you: "Check the values and choose how far the river rises. Press Start." },
  { id: "flood", icon: Waves, title: "Flood what-if", sdg: null,
    what: "Raw and corrected DEM flood maps for the southern plains of Nepal and nearby India, the land under water at your place, and floods the satellite saw 2019-2026.",
    you: "Compare the raw and corrected flood maps, then press Next." },
  { id: "sdg11", icon: Building2, title: "Communities at risk", sdg: "SDG 11",
    what: "People, built-up land and buildings inside the flooded area, and the districts touched.",
    you: "Read, then press Next. Exposure only, not casualties or damage." },
  { id: "sdg2", icon: Wheat, title: "Households and food land", sdg: "SDG 2",
    what: "Households exposed, the farmland that feeds them, and published child-stunting figures for the state or province.",
    you: "Read, then press Next." },
  { id: "sdg12", icon: Sprout, title: "Land and production", sdg: "SDG 12",
    what: "Cropland under water, set against what satellites saw, with state crop yield. Value at risk stays No data until a verified price table is added.",
    you: "Read, then press Next." },
  { id: "money", icon: Coins, title: "Micro and macro economics", sdg: null,
    what: "Estimated recovery need per household and in total, set beside household spending, poverty and state output.",
    you: "Check how reliable each unit cost is, then press Next." },
  { id: "report", icon: FileText, title: "Report", sdg: null,
    what: "A PDF: plain summary on page 1, technical annex on page 2.",
    you: "Download, then finish." },
];
