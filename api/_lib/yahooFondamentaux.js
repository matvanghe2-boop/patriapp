// Accès aux données fondamentales Yahoo — ratios courants, historique annuel
// et consensus d'analystes.
//
// Trois endpoints sont nécessaires, et c'est une contrainte de la source, pas
// un choix :
//
//  1. `quoteSummary` (modules `financialData`, `defaultKeyStatistics`,
//     `summaryDetail`) pour les ratios instantanés ;
//  2. `quoteSummary` (module `earningsTrend`) pour le consensus d'analystes ;
//  3. `fundamentals-timeseries` pour l'historique annuel.
//
// Le point 3 mérite une explication. Les modules historiques classiques —
// `balanceSheetHistory`, `cashflowStatementHistory` — ont été vidés par Yahoo :
// le bilan ne renvoie plus AUCUN champ, et le tableau de flux ne renvoie que
// `netIncome`. Le capex, l'EBITDA et le free cash flow ne s'obtiennent donc
// plus que par `fundamentals-timeseries`, qui est l'endpoint réellement utilisé
// par le site Yahoo aujourd'hui.
//
// Limite assumée sur les prévisions : `earningsTrend` s'arrête à l'exercice
// SUIVANT (`+1y`). On peut donc calculer un PER sur l'année en cours et sur la
// suivante, pas au-delà. Afficher une troisième année supposerait de
// l'extrapoler nous-mêmes, c'est-à-dire d'inventer un consensus.

import { YF_HEADERS, fetchJson, getYahooSession, invalidateYahooSession } from "./yahoo.js";

const BASE_SUMMARY = "https://query2.finance.yahoo.com/v10/finance/quoteSummary";
const BASE_TIMESERIES = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries";

/** Valeur brute d'un champ Yahoo, qui arrive sous la forme `{ raw, fmt }`. */
export function brut(champ) {
  if (champ == null) return null;
  if (typeof champ === "number") return Number.isFinite(champ) ? champ : null;
  const v = champ.raw;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Ratio Yahoo exprimé en fraction (0.1309) converti en pourcentage (13.09). */
function enPourcent(champ) {
  const v = brut(champ);
  return v == null ? null : v * 100;
}

/**
 * Appel authentifié à quoteSummary, avec renégociation de session sur échec.
 * Yahoo invalide régulièrement les crumbs ; un seul retry suffit en pratique.
 */
async function appelSummary(symbol, modules) {
  const url = (crumb) =>
    `${BASE_SUMMARY}/${encodeURIComponent(symbol)}?modules=${modules.join(",")}${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ""}`;

  for (let tentative = 0; tentative < 2; tentative++) {
    try {
      const session = await getYahooSession();
      const data = await fetchJson(url(session.crumb), {
        headers: { ...YF_HEADERS, Cookie: session.cookie },
      });
      const resultat = data?.quoteSummary?.result?.[0];
      if (resultat) return resultat;
    } catch {
      invalidateYahooSession();
    }
  }
  return null;
}

// Séries annuelles réellement exploitables. Volontairement restreint : chaque
// type demandé alourdit la réponse, et les séries absentes reviennent vides.
const SERIES_ANNUELLES = [
  "annualTotalRevenue",
  "annualNetIncome",
  "annualEBITDA",
  "annualCapitalExpenditure",
  "annualFreeCashFlow",
  "annualTotalDebt",
  "annualStockholdersEquity",
];

/**
 * Historique annuel, du plus ancien au plus récent.
 * @returns {Array<{exercice: string, [metrique: string]: number|null}>}
 */
export async function historiqueAnnuel(symbol) {
  const params = new URLSearchParams({
    symbol,
    type: SERIES_ANNUELLES.join(","),
    // Bornes larges : Yahoo exige les deux, et ne renvoie de toute façon que
    // les exercices publiés (quatre en pratique).
    period1: "1000000000",
    period2: String(Math.floor(Date.now() / 1000)),
  });

  let data = null;
  for (let tentative = 0; tentative < 2; tentative++) {
    try {
      const session = await getYahooSession();
      params.set("crumb", session.crumb);
      data = await fetchJson(`${BASE_TIMESERIES}/${encodeURIComponent(symbol)}?${params}`, {
        headers: { ...YF_HEADERS, Cookie: session.cookie },
      });
      if (data?.timeseries?.result) break;
    } catch {
      invalidateYahooSession();
    }
  }

  const series = data?.timeseries?.result;
  if (!Array.isArray(series)) return [];

  // Yahoo renvoie une série par métrique ; on pivote vers un exercice par ligne.
  const parExercice = new Map();
  for (const serie of series) {
    const type = serie?.meta?.type?.[0];
    if (!type) continue;
    const cle = type.replace(/^annual/, "");
    for (const point of serie[type] || []) {
      if (!point?.asOfDate) continue;
      const valeur = brut(point.reportedValue);
      if (!parExercice.has(point.asOfDate)) parExercice.set(point.asOfDate, { exercice: point.asOfDate });
      parExercice.get(point.asOfDate)[cle] = valeur;
    }
  }

  return [...parExercice.values()].sort((a, b) => (a.exercice < b.exercice ? -1 : 1));
}

/**
 * Consensus d'analystes pour l'exercice en cours et le suivant.
 * `numAnalystes` est remonté tel quel : un consensus à 1 analyste et un
 * consensus à 18 ne se lisent pas de la même façon, et masquer cette
 * différence reviendrait à donner la même autorité aux deux.
 */
export function extraireConsensus(earningsTrend) {
  const tendances = earningsTrend?.trend || [];
  const parPeriode = {};

  for (const t of tendances) {
    if (t?.period !== "0y" && t?.period !== "+1y") continue;
    const bpa = brut(t?.earningsEstimate?.avg);
    if (bpa == null) continue;
    parPeriode[t.period] = {
      exercice: t.endDate || null,
      bpaEstime: bpa,
      numAnalystes: brut(t?.earningsEstimate?.numberOfAnalysts),
      croissanceEstimeePct: enPourcent(t?.growth),
      caEstime: brut(t?.revenueEstimate?.avg),
    };
  }

  return {
    anneeEnCours: parPeriode["0y"] ?? null,
    anneeSuivante: parPeriode["+1y"] ?? null,
  };
}

/**
 * Ratios instantanés d'un titre, normalisés.
 *
 * Tous les pourcentages sortent en points (13.09 pour 13,09 %) : Yahoo mélange
 * fractions et pourcentages selon les champs, et laisser filtrer cette
 * incohérence jusqu'aux filtres du screener produirait des comparaisons
 * silencieusement fausses.
 */
export function extraireRatios({ financialData, defaultKeyStatistics, summaryDetail, price, assetProfile, summaryProfile }) {
  const fd = financialData || {};
  const ks = defaultKeyStatistics || {};
  const sd = summaryDetail || {};

  return {
    nom: price?.longName || price?.shortName || null,
    devise: price?.currency || sd?.currency || null,
    secteur: assetProfile?.sector || summaryProfile?.sector || null,
    industrie: assetProfile?.industry || summaryProfile?.industry || null,
    pays: assetProfile?.country || summaryProfile?.country || null,

    cours: brut(fd.currentPrice) ?? brut(price?.regularMarketPrice),
    capitalisation: brut(price?.marketCap) ?? brut(sd.marketCap),

    // Valorisation
    per: brut(sd.trailingPE),
    perForward: brut(ks.forwardPE) ?? brut(sd.forwardPE),
    peg: brut(ks.pegRatio),
    priceToBook: brut(ks.priceToBook),
    evEbitda: brut(ks.enterpriseToEbitda),
    bpaTrailing: brut(ks.trailingEps),
    bpaForward: brut(ks.forwardEps),

    // Rentabilité
    margeBrutePct: enPourcent(fd.grossMargins),
    margeOperationnellePct: enPourcent(fd.operatingMargins),
    margeNettePct: enPourcent(fd.profitMargins),
    roePct: enPourcent(fd.returnOnEquity),
    roaPct: enPourcent(fd.returnOnAssets),

    // Dividende
    rendementPct: enPourcent(sd.dividendYield) ?? enPourcent(sd.trailingAnnualDividendYield),
    dividendeParAction: brut(sd.dividendRate) ?? brut(sd.trailingAnnualDividendRate),
    payoutPct: enPourcent(sd.payoutRatio),

    // Solidité
    detteSurFondsPropresPct: brut(fd.debtToEquity),
    ratioLiquidite: brut(fd.currentRatio),
    detteTotale: brut(fd.totalDebt),
    ebitda: brut(fd.ebitda),
    fluxOperationnel: brut(fd.operatingCashflow),
    freeCashFlow: brut(fd.freeCashflow),

    // Marché
    beta: brut(ks.beta) ?? brut(sd.beta),
    plusHaut52s: brut(sd.fiftyTwoWeekHigh),
    plusBas52s: brut(sd.fiftyTwoWeekLow),
    volumeMoyen: brut(sd.averageVolume),

    // Consensus de place
    objectifCoursMoyen: brut(fd.targetMeanPrice),
    recommandation: fd.recommendationKey ?? null,
    nbAnalystes: brut(fd.numberOfAnalystOpinions),
  };
}

/** Position du cours dans sa fourchette annuelle, en pourcentage (0 = plus bas). */
export function positionDansFourchette({ cours, plusBas52s, plusHaut52s }) {
  if (cours == null || plusBas52s == null || plusHaut52s == null) return null;
  const amplitude = plusHaut52s - plusBas52s;
  if (amplitude <= 0) return null;
  return ((cours - plusBas52s) / amplitude) * 100;
}

const MODULES_RATIOS = ["price", "summaryDetail", "financialData", "defaultKeyStatistics", "assetProfile", "summaryProfile"];
const MODULES_COMPLETS = [...MODULES_RATIOS, "earningsTrend"];

/** Ratios seuls — utilisé par le screener, qui en interroge des dizaines. */
export async function ratiosTitre(symbol) {
  const resultat = await appelSummary(symbol, MODULES_RATIOS);
  if (!resultat) return null;
  const ratios = extraireRatios(resultat);
  return { symbole: symbol, ...ratios, positionFourchettePct: positionDansFourchette(ratios) };
}

/** Fiche complète — ratios, historique annuel et consensus. */
export async function ficheComplete(symbol) {
  const [resultat, historique] = await Promise.all([
    appelSummary(symbol, MODULES_COMPLETS),
    historiqueAnnuel(symbol).catch(() => []),
  ]);
  if (!resultat) return null;

  const ratios = extraireRatios(resultat);
  return {
    symbole: symbol,
    ...ratios,
    positionFourchettePct: positionDansFourchette(ratios),
    historique,
    consensus: extraireConsensus(resultat.earningsTrend),
  };
}
