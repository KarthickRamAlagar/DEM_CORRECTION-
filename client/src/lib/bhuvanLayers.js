// Bhuvan (ISRO / NRSC) WMS layers. India only. Context layers, NOT flood extent.
// "tested" = a GetMap request returned a real PNG on 21 Oct 2026. Untested layers are labelled in the app and may show nothing.
export const BHUVAN_WMS = "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms";
export const BHUVAN_LAYERS = [
  { id: "br1112", label: "Bihar land use / land cover (50K, 2011-12 per layer name)", layer: "lulc:BR_LULC50K_1112", tested: true },
  { id: "br1516", label: "Bihar land use / land cover (50K, 2015-16 per layer name)", layer: "lulc:BR_LULC50K_1516", tested: false },
  { id: "br0506", label: "Bihar land use / land cover (50K, 2005-06 per layer name)", layer: "lulc:BR_LULC50K_0506", tested: false },
  { id: "up1619", label: "Uttar Pradesh land use / land cover (10K, 2016-19 per layer name)", layer: "sisdp_phase2:SISDP_P2_LULC_10K_2016_2019_UP", tested: false },
];
export const legendUrl = (layer) =>
  `${BHUVAN_WMS}?service=WMS&version=1.1.1&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(layer)}`;
