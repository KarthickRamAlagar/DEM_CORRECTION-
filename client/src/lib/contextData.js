// Reference values for the SDG 2, SDG 12 and economics cards. Every number was read from the page named in `src`.
// status: "official" = read from the official table or release; "reported" = read from a news or data-site page that quotes the official source and was NOT checked against the primary yet.
// Nothing here is estimated. A value that was not found is simply absent, and the screen shows "No data".

export const SRC = {
  nfhs: { name: "Economic Survey 2023-24, Statistical Appendix Table 8.15 (NFHS reports, MoHFW)", url: "https://www.indiabudget.gov.in/budget2024-25/economicsurvey/doc/stat/tab815.pdf", status: "official" },
  hces: { name: "MoSPI Household Consumption Expenditure Survey 2023-24, press note (state values are chart labels)", url: "https://www.mospi.gov.in/sites/default/files/press_release/HCES_Press_Note_2023-24_27122024_rev.pdf", status: "official" },
  gsdpBr: { name: "StatisticsTimes.com, Bihar economy, quoting MoSPI (22-23 Dec 2025)", url: "https://www.statisticstimes.com/m/economy/india/bihar-economy.php", status: "reported" },
  gsdpUp: { name: "StatisticsTimes.com, Uttar Pradesh economy, quoting MoSPI (22 Dec 2025)", url: "https://www.statisticstimes.com/m/economy/india/uttar-pradesh-economy.php", status: "reported" },
  mspK: { name: "PIB, Cabinet approves MSP for Kharif crops, marketing season 2026-27 (13 May 2026)", url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2260618&reg=48&lang=2", status: "official" },
  mspR: { name: "PIB, Cabinet approves MSP for Rabi crops, marketing season 2026-27 (1 Oct 2025)", url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2173567&reg=48&lang=2", status: "official" },
  npNut: { name: "Kathmandu Post, 18 Jun 2026, on the Preliminary National Nutrition Assessment (May 2026)", url: "https://kathmandupost.com/health/2026/06/18/madhesh-leads-in-wasting-karnali-in-stunting", status: "reported" },
  npPov: { name: "Onlinekhabar, on the NSO Nepal Living Standards Survey (the page gives 2023/24; confirm the survey year with NSO)", url: "https://english.onlinekhabar.com/20-per-cent-of-people-living-below-the-poverty-line-the-statistics-office-says.html", status: "reported" },
};

// children under 5
export const NUTRITION = {
  IND: {
    title: "Children under 5 who are stunted, NFHS-5 (2019-21)",
    unit: "%", src: [SRC.nfhs],
    rows: [{ area: "Uttar Pradesh", stunted: 39.7, earlier: 46.3 }, { area: "Bihar", stunted: 42.9, earlier: 48.3 }],
    earlierLabel: "NFHS-4 (2015-16)",
    missing: "Wasting and underweight for these states are not added yet.",
  },
  NPL: {
    title: "Children under 5, Preliminary National Nutrition Assessment (May 2026)",
    unit: "%", src: [SRC.npNut],
    rows: [
      { area: "Koshi", stunted: 24.7, wasted: 7.3 }, { area: "Madhesh", stunted: 31.1, wasted: 13.2 }, { area: "Bagmati", stunted: 23.7, wasted: 4.4 },
      { area: "Gandaki", stunted: 25.3, wasted: 4.8 }, { area: "Lumbini", stunted: 30.0, wasted: 9.0 }, { area: "Karnali", stunted: 36.2, wasted: 7.2 }, { area: "Sudurpashchim", stunted: 25.3, wasted: 10.4 },
    ],
    missing: "A preliminary figure from a news report. Replace it with the final survey report when published.",
  },
};

// money, per person
export const ECON = {
  IND: {
    micro: {
      title: "Monthly spending per person, HCES 2023-24 (current prices, ₹)", src: [SRC.hces],
      rows: [
        { area: "Uttar Pradesh", rural: 3481, urban: 5395, ruralImp: 3578, urbanImp: 5474 },
        { area: "Bihar", rural: 3670, urban: 5080, ruralImp: 3788, urbanImp: 5165 },
        { area: "All India", rural: 4122, urban: 6996, ruralImp: 4247, urbanImp: 7078 },
      ],
      missing: "Household income and farm or labour wage rates are not added yet.",
    },
    macro: {
      title: "State output, 2024-25 (current prices)", src: [SRC.gsdpUp, SRC.gsdpBr],
      rows: [
        { area: "Uttar Pradesh", gsdpCr: 2978224, perCap: 124366 },
        { area: "Bihar", gsdpCr: 991997, perCap: 76490 },
      ],
      missing: "District-level output is not added. State values are shown for the state, not for this place.",
    },
  },
  NPL: {
    micro: {
      title: "People below the national poverty line, by province", src: [SRC.npPov],
      rows: [
        { area: "Sudurpashchim", poor: 34.16 }, { area: "Karnali", poor: 26.69 }, { area: "Lumbini", poor: 24.35 }, { area: "Madhesh", poor: 22.53 },
        { area: "Koshi", poor: 17.19 }, { area: "Bagmati", poor: 12.59 }, { area: "Gandaki", poor: 11.88 },
      ],
      missing: "Spending per person and wage rates are not added yet (the NLSS tables are not read).",
    },
    macro: { title: "Province output", src: [], rows: [], missing: "Provincial gross value added from the National Statistics Office is not added yet." },
  },
};

export const range = (rows, k) => {
  const v = rows.map((r) => r[k]).filter((x) => x != null);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};

// Minimum support price, Rs per quintal (official PIB tables). A government purchase price, not a market price.
export const MSP = {
  rice: { crop: "Paddy (common)", price: 2441, previous: 2369, season: "Kharif 2026-27", src: SRC.mspK },
  wheat: { crop: "Wheat", price: 2585, previous: 2425, season: "Rabi 2026-27", src: SRC.mspR },
};
