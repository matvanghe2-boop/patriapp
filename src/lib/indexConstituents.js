export const INDEX_CONSTITUENTS = {
  cac40: [
    "AI.PA", "MC.PA", "OR.PA", "SAN.PA", "TTE.PA", "BNP.PA", "AIR.PA", "SU.PA",
    "DG.PA", "SAF.PA", "RMS.PA", "KER.PA", "CS.PA", "ACA.PA", "GLE.PA", "BN.PA",
    "ENGI.PA", "VIE.PA", "CAP.PA", "STLAP.PA",
  ],
  sp500: [
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "BRK-B", "JPM",
    "JNJ", "V", "PG", "XOM", "UNH", "HD", "MA", "AVGO", "COST", "PEP", "KO",
  ],
  nasdaq: [
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "AVGO", "ADBE",
    "NFLX", "COST", "PEP", "CSCO", "INTC", "AMD", "QCOM", "TXN", "SBUX", "INTU", "CMCSA",
  ],
};

export const INDEX_TABS = [
  { key: "cac40", symbol: "^FCHI", label: "CAC 40" },
  { key: "sp500", symbol: "^GSPC", label: "S&P 500" },
  { key: "nasdaq", symbol: "^IXIC", label: "Nasdaq" },
];
