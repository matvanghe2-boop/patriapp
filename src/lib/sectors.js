// Classification sectorielle par ticker. Couvre le CAC 40 et les grandes
// valeurs européennes (cohérent avec le PEA : pas de tickers US). Un ticker
// absent de la table retombe sur "Autre".
const SECTOR_MAP = {
  // Technologie
  "DSY.PA": "Technologie",
  "CAP.PA": "Technologie",
  "SOI.PA": "Technologie",
  "ADYEN.AS": "Technologie",
  "ASML.AS": "Technologie",
  "SAP.DE": "Technologie",
  "WLN.PA": "Technologie",
  "ATO.PA": "Technologie",
  "UBI.PA": "Technologie",
  "NEXI.MI": "Technologie",
  "VU.PA": "Technologie",

  // Santé & pharmacie
  "SAN.PA": "Santé & pharmacie",
  "EL.PA": "Santé & pharmacie",
  "IPN.PA": "Santé & pharmacie",
  "VLA.PA": "Santé & pharmacie",
  "ERF.PA": "Santé & pharmacie",
  "NOVN.SW": "Santé & pharmacie",
  "ROG.SW": "Santé & pharmacie",

  // Biens de consommation
  "MC.PA": "Biens de consommation",
  "OR.PA": "Biens de consommation",
  "RMS.PA": "Biens de consommation",
  "KER.PA": "Biens de consommation",
  "BN.PA": "Biens de consommation",
  "RI.PA": "Biens de consommation",
  "AC.PA": "Biens de consommation",
  "NESN.SW": "Biens de consommation",
  "UHR.SW": "Biens de consommation",
  "AD.AS": "Biens de consommation",
  "HEIA.AS": "Biens de consommation",
  "UNA.AS": "Biens de consommation",
  "ABI.BR": "Biens de consommation",

  // Industrie
  "AI.PA": "Industrie",
  "SU.PA": "Industrie",
  "DG.PA": "Industrie",
  "SAF.PA": "Industrie",
  "ML.PA": "Industrie",
  "HO.PA": "Industrie",
  "LR.PA": "Industrie",
  "SGO.PA": "Industrie",
  "ALO.PA": "Industrie",
  "AIR.PA": "Industrie",
  "RNO.PA": "Industrie",
  "STLA.PA": "Industrie",
  "STLAP.PA": "Industrie",
  "FR.PA": "Industrie",
  "VK.PA": "Industrie",
  "SIE.DE": "Industrie",
  "MBG.DE": "Industrie",
  "BMW.DE": "Industrie",
  "VOW3.DE": "Industrie",
  "BAS.DE": "Industrie",
  "MT.AS": "Industrie",

  // Finance
  "BNP.PA": "Finance",
  "ACA.PA": "Finance",
  "GLE.PA": "Finance",
  "CS.PA": "Finance",
  "AMUN.PA": "Finance",
  "COFA.PA": "Finance",
  "SCR.PA": "Finance",
  "ALV.DE": "Finance",
  "DBK.DE": "Finance",
  "ISP.MI": "Finance",
  "UCG.MI": "Finance",
  "INGA.AS": "Finance",
  "KBC.BR": "Finance",

  // Énergie
  "TTE.PA": "Énergie",
  "ENGI.PA": "Énergie",
  "SHEL.AS": "Énergie",
  "ENEL.MI": "Énergie",
  "ENI.MI": "Énergie",

  // Immobilier
  "URW.PA": "Immobilier",
  "COV.PA": "Immobilier",
  "ICAD.PA": "Immobilier",

  // Télécommunications
  "ORA.PA": "Télécommunications",
  "DTE.DE": "Télécommunications",

  // Services
  "VIE.PA": "Services",
  "EDEN.PA": "Services",
  "TEP.PA": "Services",
  "PUB.PA": "Services",
  "SW.PA": "Services",
  "TFI.PA": "Services",
  "VIV.PA": "Services",
  "BOL.PA": "Services",
  "FDJ.PA": "Services",
  "RXL.PA": "Services",
  "UCB.BR": "Santé & pharmacie",
  "SOLB.BR": "Matériaux",
  "SESG.PA": "Télécommunications",
  "PHIA.AS": "Santé & pharmacie",
};

export function getSector(ticker) {
  const key = String(ticker || "").toUpperCase();
  return SECTOR_MAP[key] || "Autre";
}

export const SECTOR_COLORS = {
  "Technologie": { bg: "bg-cyan-500/20", border: "border-cyan-500/40", text: "text-cyan-300" },
  "Santé & pharmacie": { bg: "bg-emerald-500/20", border: "border-emerald-500/40", text: "text-emerald-300" },
  "Biens de consommation": { bg: "bg-pink-500/20", border: "border-pink-500/40", text: "text-pink-300" },
  "Industrie": { bg: "bg-amber-500/20", border: "border-amber-500/40", text: "text-amber-300" },
  "Finance": { bg: "bg-violet-500/20", border: "border-violet-500/40", text: "text-violet-300" },
  "Énergie": { bg: "bg-orange-500/20", border: "border-orange-500/40", text: "text-orange-300" },
  "Immobilier": { bg: "bg-sky-500/20", border: "border-sky-500/40", text: "text-sky-300" },
  "Télécommunications": { bg: "bg-fuchsia-500/20", border: "border-fuchsia-500/40", text: "text-fuchsia-300" },
  "Matériaux": { bg: "bg-lime-500/20", border: "border-lime-500/40", text: "text-lime-300" },
  "Services": { bg: "bg-teal-500/20", border: "border-teal-500/40", text: "text-teal-300" },
  "Autre": { bg: "bg-slate-500/20", border: "border-slate-500/40", text: "text-slate-300" },
};

// Mêmes secteurs, en hexadécimal plein pour le remplissage SVG du treemap
// (les classes Tailwind ci-dessus ne sont pas exploitables comme fill SVG).
export const SECTOR_HEX = {
  "Technologie": "#0e7490",
  "Santé & pharmacie": "#047857",
  "Biens de consommation": "#be185d",
  "Industrie": "#b45309",
  "Finance": "#6d28d9",
  "Énergie": "#c2410c",
  "Immobilier": "#0369a1",
  "Télécommunications": "#a21caf",
  "Matériaux": "#4d7c0f",
  "Services": "#0f766e",
  "Autre": "#334155",
};
