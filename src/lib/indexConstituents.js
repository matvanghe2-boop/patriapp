/**
 * Univers de titres du screener.
 *
 * Chaque symbole de cette liste a été vérifié contre l'API : ceux qui ne
 * renvoyaient aucune donnée ont été retirés plutôt que laissés en place. Un
 * ticker mort ne provoque pas d'erreur visible — il ressort simplement comme
 * « non évaluable » dans le screener, ce qui ressemble à un titre qui ne passe
 * pas le filtre.
 *
 * Ce sont des **instantanés de composition**, pas un miroir en direct des
 * indices : la composition d'un indice change quelques fois par an, et rien
 * ici ne se met à jour tout seul. C'est assumé — un univers stable et vérifié
 * vaut mieux qu'un univers prétendument exact et silencieusement faux.
 *
 * La taille est bornée par le coût : chaque symbole demande un appel à Yahoo.
 * Soixante valeurs par indice représentent déjà plusieurs secondes de
 * chargement, mises en cache une heure côté serveur.
 */

/**
 * Composition OFFICIELLE du CAC 40 depuis la revue du 22 décembre 2025
 * (entrée d'Eiffage, sortie d'Edenred ; Euronext avait remplacé
 * Teleperformance en septembre). Les quarante symboles ont été vérifiés contre
 * l'API. La liste précédente en comptait quarante-deux, dont des sortants, et
 * l'API n'en lisant que quarante, les deux derniers disparaissaient sans bruit.
 *
 * À revoir après chaque revue trimestrielle d'Euronext (troisième vendredi de
 * mars, juin, septembre et décembre) : `COMPOSITION_CAC40_AU` est affichée
 * sous la carte du CAC 40, pour que son âge se voie.
 */
export const COMPOSITION_CAC40_AU = "2025-12-22";

export const INDEX_CONSTITUENTS = {
  cac40: [
    "AC.PA", "AI.PA", "AIR.PA", "MT.AS", "CS.PA", "BNP.PA", "EN.PA", "BVI.PA",
    "CAP.PA", "CA.PA", "ACA.PA", "BN.PA", "DSY.PA", "FGR.PA", "ENGI.PA", "EL.PA",
    "ERF.PA", "ENX.PA", "RMS.PA", "KER.PA", "LR.PA", "OR.PA", "MC.PA", "ML.PA",
    "ORA.PA", "RI.PA", "PUB.PA", "RNO.PA", "SAF.PA", "SGO.PA", "SAN.PA", "SU.PA",
    "GLE.PA", "STLAP.PA", "STMPA.PA", "HO.PA", "TTE.PA", "URW.PA", "VIE.PA", "DG.PA",
  ],
  sp500: [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "BRK-B", "JPM",
    "LLY", "V", "XOM", "UNH", "MA", "COST", "HD", "PG", "JNJ", "WMT",
    "NFLX", "ABBV", "CRM", "BAC", "ORCL", "MRK", "CVX", "KO", "AMD", "PEP",
    "ADBE", "LIN", "TMO", "ACN", "MCD", "CSCO", "ABT", "PM", "IBM", "GE",
    "QCOM", "TXN", "DHR", "INTU", "CAT", "VZ", "NOW", "AMGN", "NEE", "DIS",
    "RTX", "PFE", "SPGI", "AMAT", "HON", "UNP", "LOW", "BKNG", "T", "BLK",
  ],
  nasdaq: [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "COST", "NFLX",
    "AMD", "PEP", "ADBE", "CSCO", "TMUS", "INTU", "QCOM", "TXN", "AMAT", "BKNG",
    "AMGN", "HON", "ISRG", "VRTX", "ADP", "SBUX", "GILD", "MU", "LRCX", "REGN",
    "PANW", "MDLZ", "ADI", "KLAC", "SNPS", "CDNS", "MAR", "ORLY", "CSX", "ASML",
    "ABNB", "FTNT", "PYPL", "MRVL", "CRWD", "ADSK", "NXPI", "CHTR", "MNST", "WDAY",
    "AEP", "ROP", "PCAR", "CPRT", "ODFL", "FAST", "IDXX", "DXCM", "TTD", "EA",
  ],
};

export const INDEX_TABS = [
  { key: "cac40", symbol: "^FCHI", label: "CAC 40" },
  { key: "sp500", symbol: "^GSPC", label: "S&P 500" },
  { key: "nasdaq", symbol: "^IXIC", label: "Nasdaq" },
];
