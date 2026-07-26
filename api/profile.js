// Fonction serverless Vercel — GET /api/profile?symbol=AI.PA
// Renvoie la fiche complète d'une entreprise (ou d'un ETF/fonds/indice) :
// identité, secteur ou catégorie, activité, ratios financiers clés et
// repères de cours. Alimente le panneau "Fiche entreprise" du sous-onglet
// Marché.
//
// Pourquoi cette version est plus robuste : l'API "quoteSummary" de Yahoo
// exige désormais une signature ("crumb") liée à un cookie de session, et
// échoue régulièrement (401/404) sans elle — en particulier pour les ETF,
// indices et certaines places boursières hors US. On tente donc d'abord un
// accès direct (parfois suffisant), puis on retente une fois avec une
// session (cookie + crumb) fraîchement négociée si le premier essai échoue.
// Dans tous les cas, on complète/reconstruit la fiche à partir de l'endpoint
// "chart" (celui utilisé pour l'historique), qui lui ne nécessite aucune
// authentification et reste quasiment toujours disponible — ce qui garantit
// qu'un onglet Marché utilisable s'affiche même quand la fiche détaillée est
// partiellement indisponible.

import { withApi, httpError, cached } from "./_lib/http.js";
import { YF_HEADERS as BASE_HEADERS, getYahooSession, isValidSymbol } from "./_lib/yahoo.js";

const YF_HEADERS = { ...BASE_HEADERS, Accept: "application/json,text/plain,*/*" };

// Une fiche entreprise (secteur, dirigeants, description) ne change pas d'une
// heure à l'autre ; seuls les repères de cours bougent, et ils sont assez
// approximatifs pour tolérer 5 minutes de retard.
const CACHE_MS = 5 * 60_000;

const MODULES = [
  "assetProfile",
  "summaryProfile",
  "fundProfile",
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "topHoldings",
].join(",");

const INSTRUMENT_TYPE_LABELS = {
  EQUITY: "Action",
  ETF: "ETF",
  MUTUALFUND: "Fonds / OPCVM",
  INDEX: "Indice",
  CURRENCY: "Devise",
  CRYPTOCURRENCY: "Cryptomonnaie",
  FUTURE: "Contrat à terme",
  BOND: "Obligation",
};

const raw = (v) => (v && typeof v === "object" && "raw" in v ? v.raw : v ?? null);

// ─── Traduction en français ────────────────────────────────────────────────
// Les fiches Yahoo sont systématiquement en anglais. Les utilisateurs de
// l'appli étant francophones, on traduit : le secteur (dictionnaire fixe, les
// valeurs GICS de Yahoo sont un ensemble fermé d'une douzaine de termes), les
// intitulés de direction (dictionnaire de correspondances usuelles, plus
// fiable et instantané qu'un appel de traduction pour des titres courts), et
// le texte libre (description d'activité, industrie, catégorie de fonds) via
// un service de traduction gratuit — avec repli silencieux sur le texte
// anglais d'origine si la traduction échoue, pour ne jamais casser la fiche.
const SECTOR_FR = {
  Technology: "Technologie",
  Healthcare: "Santé",
  "Financial Services": "Services financiers",
  "Consumer Cyclical": "Consommation cyclique",
  "Consumer Defensive": "Consommation défensive",
  Industrials: "Industrie",
  Energy: "Énergie",
  Utilities: "Services publics",
  "Real Estate": "Immobilier",
  "Basic Materials": "Matériaux de base",
  "Communication Services": "Communication",
};

// Ordre important : du plus spécifique au plus générique, pour éviter qu'un
// remplacement générique ("Director") ne mange un intitulé plus précis
// ("Managing Director") traité plus loin dans la liste.
const TITLE_REPLACEMENTS = [
  [/Chairman of the Management Board/gi, "Président du directoire"],
  [/Chairman of the Board/gi, "Président du conseil d'administration"],
  [/Chief Executive Officer/gi, "Directeur général"],
  [/Chief Financial Officer/gi, "Directeur financier"],
  [/Chief Operating Officer/gi, "Directeur des opérations"],
  [/Chief Technology Officer/gi, "Directeur technique"],
  [/Chief Marketing Officer/gi, "Directeur marketing"],
  [/Chief Information Officer/gi, "Directeur des systèmes d'information"],
  [/Chief Legal Officer/gi, "Directeur juridique"],
  [/Chief Accounting Officer/gi, "Directeur comptable"],
  [/General Counsel/gi, "Directeur juridique"],
  [/Head of Investor Relations/gi, "Responsable des relations investisseurs"],
  [/Head of Human Resources/gi, "Responsable des ressources humaines"],
  [/Head of/gi, "Responsable"],
  [/Investor Relations/gi, "Relations investisseurs"],
  [/Human Resources/gi, "Ressources humaines"],
  [/Executive Vice President/gi, "Vice-président exécutif"],
  [/Senior Vice President/gi, "Vice-président senior"],
  [/Vice President/gi, "Vice-président"],
  [/Managing Director/gi, "Directeur général délégué"],
  [/Co-Founder/gi, "Cofondateur"],
  [/Founder/gi, "Fondateur"],
  [/President\s*&\s*/gi, "Président & "],
  [/President/gi, "Président"],
  [/Chairman/gi, "Président"],
  [/Board Member/gi, "Membre du conseil"],
  [/Director/gi, "Directeur"],
  [/Secretary/gi, "Secrétaire"],
  [/Treasurer/gi, "Trésorier"],
];

function translateTitle(title) {
  if (!title) return title;
  return TITLE_REPLACEMENTS.reduce((acc, [pattern, repl]) => acc.replace(pattern, repl), title);
}

// Appel à un service de traduction gratuit, sans clé. Best-effort : toute
// erreur (réseau, quota, format inattendu) renvoie simplement le texte
// d'origine plutôt que de faire échouer la fiche entière.
//
// ⚠️ Ce service (endpoint interne de Google Translate) n'est ni officiel ni
// contractuel : il peut disparaître ou limiter les appels du jour au
// lendemain. Le texte envoyé est une description publique d'entreprise
// fournie par Yahoo — aucune donnée personnelle de l'utilisateur ne transite
// par ce service (voir la section « Vie privée » du README).
//
// Les résultats sont mis en cache : une description d'entreprise ne change
// pratiquement jamais, et sans cache la même chaîne était retraduite à chaque
// consultation de fiche.
const TRANSLATION_TTL_MS = 24 * 60 * 60_000;

async function translateToFrench(text) {
  if (!text || !text.trim()) return text;
  try {
    return await cached(`tr:${text.slice(0, 120)}:${text.length}`, TRANSLATION_TTL_MS, async () => {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": YF_HEADERS["User-Agent"] },
          signal: controller.signal,
        });
        if (!r.ok) return text;
        const data = await r.json();
        const translated = (data?.[0] || []).map((chunk) => chunk?.[0] || "").join("");
        return translated.trim() || text;
      } finally {
        clearTimeout(timer);
      }
    });
  } catch {
    return text;
  }
}

async function fetchQuoteSummary(symbol) {
  const baseUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`;

  // Essai direct, sans session — fonctionne encore souvent selon les régions.
  try {
    const r = await fetch(`${baseUrl}?modules=${MODULES}`, { headers: YF_HEADERS });
    if (r.ok) {
      const data = await r.json();
      const result = data?.quoteSummary?.result?.[0];
      if (result) return result;
    }
  } catch {
    /* on retente avec une session ci-dessous */
  }

  // Repli avec cookie + crumb négociés à la volée.
  try {
    const session = await getYahooSession();
    const r = await fetch(`${baseUrl}?modules=${MODULES}&crumb=${encodeURIComponent(session.crumb)}`, {
      headers: { ...YF_HEADERS, Cookie: session.cookie },
    });
    if (r.ok) {
      const data = await r.json();
      const result = data?.quoteSummary?.result?.[0];
      if (result) return result;
    }
  } catch {
    /* échec silencieux — on se rabat sur l'endpoint chart */
  }

  return null;
}

// Endpoint "chart" — pas d'authentification requise, quasi toujours
// disponible. Sert de source garantie pour les repères de cours et, en
// dernier recours, pour reconstruire une fiche minimale exploitable.
async function fetchChartMeta(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const r = await fetch(url, { headers: YF_HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(data?.chart?.error?.description || "Symbole introuvable");
  return result.meta || {};
}

async function handler(req, res) {
  const symbol = req.query.symbol;
  if (!isValidSymbol(symbol)) throw httpError(400, "Paramètre `symbol` manquant ou invalide.");

  const [quoteSummary, chartMeta] = await Promise.all([
    cached(`qs:${symbol}`, CACHE_MS, () => fetchQuoteSummary(symbol)).catch(() => null),
    cached(`cm:${symbol}`, CACHE_MS, () => fetchChartMeta(symbol)).catch(() => null),
  ]);

  if (!quoteSummary && !chartMeta) {
    return res.status(502).json({
      symbol,
      ok: false,
      error: "Cette valeur est introuvable ou temporairement indisponible.",
    });
  }

  const {
    assetProfile = {},
    summaryProfile = {},
    fundProfile = {},
    price = {},
    summaryDetail = {},
    defaultKeyStatistics = {},
    financialData = {},
    topHoldings = {},
  } = quoteSummary || {};

  const instrumentType = price.quoteType || chartMeta?.instrumentType || null;
  const instrumentLabel = INSTRUMENT_TYPE_LABELS[instrumentType] || null;

  // Secteur/activité : les fonds/ETF n'ont pas de secteur GICS — on utilise
  // alors leur catégorie et leur société de gestion à la place, avec un
  // libellé clair côté front pour ne pas afficher un champ "Secteur" vide.
  const sectorEn = assetProfile.sector || summaryProfile.sector || null;
  const industryEn = assetProfile.industry || summaryProfile.industry || null;
  const fundCategoryEn = fundProfile.categoryName || null;
  const fundFamily = fundProfile.family || null;
  const descriptionEn = assetProfile.longBusinessSummary || summaryProfile.longBusinessSummary || null;

  // Un seul lot de traductions en parallèle (secteur seulement si absent du
  // dictionnaire fixe, pour épargner un appel réseau inutile la plupart du temps).
  const needsSectorTranslation = sectorEn && !SECTOR_FR[sectorEn];
  const [description, industry, fundCategory, sectorTranslated] = await Promise.all([
    translateToFrench(descriptionEn),
    translateToFrench(industryEn),
    translateToFrench(fundCategoryEn),
    needsSectorTranslation ? translateToFrench(sectorEn) : Promise.resolve(null),
  ]);
  const sector = sectorEn ? (SECTOR_FR[sectorEn] || sectorTranslated || sectorEn) : null;

  const holdings = (topHoldings.holdings || []).slice(0, 10).map((h) => ({
    symbol: h.symbol,
    name: h.holdingName,
    weightPct: raw(h.holdingPercent) != null ? raw(h.holdingPercent) * 100 : null,
  }));
  const sectorWeightings = (topHoldings.sectorWeightings || [])
    .map((entry) => {
      const [key, val] = Object.entries(entry)[0] || [];
      return key ? { key, weightPct: raw(val) != null ? raw(val) * 100 : null } : null;
    })
    .filter(Boolean)
    .filter((s) => s.weightPct != null && s.weightPct > 0)
    .sort((a, b) => b.weightPct - a.weightPct);

  const payload = {
    symbol,
    ok: true,
    // Vrai lorsque la fiche détaillée Yahoo n'a pas pu être récupérée et que
    // seules les données de l'endpoint "chart" (toujours dispo) sont utilisées.
    limited: !quoteSummary,

    name: price.longName || price.shortName || chartMeta?.longName || chartMeta?.shortName || symbol,
    exchange: price.exchangeName || chartMeta?.exchangeName || null,
    currency: price.currency || summaryDetail.currency || chartMeta?.currency || null,
    instrumentType,
    instrumentLabel,

    sector,
    industry,
    fundCategory,
    fundFamily,
    country: assetProfile.country || summaryProfile.country || null,
    city: assetProfile.city || summaryProfile.city || null,
    employees: assetProfile.fullTimeEmployees || null,
    website: assetProfile.website || summaryProfile.website || null,
    description,
    officers: (assetProfile.companyOfficers || []).slice(0, 3).map((o) => ({ name: o.name, title: translateTitle(o.title) })),
    holdings,
    sectorWeightings,

    // Cours et repères — toujours issus en priorité de l'endpoint chart,
    // légèrement plus frais et fiable que quoteSummary sur ce point précis.
    currentPrice: raw(price.regularMarketPrice) ?? chartMeta?.regularMarketPrice ?? null,
    previousClose: raw(price.regularMarketPreviousClose) ?? chartMeta?.chartPreviousClose ?? chartMeta?.previousClose ?? null,
    dayLow: raw(summaryDetail.dayLow) ?? chartMeta?.regularMarketDayLow ?? null,
    dayHigh: raw(summaryDetail.dayHigh) ?? chartMeta?.regularMarketDayHigh ?? null,
    fiftyTwoWeekLow: raw(summaryDetail.fiftyTwoWeekLow) ?? chartMeta?.fiftyTwoWeekLow ?? null,
    fiftyTwoWeekHigh: raw(summaryDetail.fiftyTwoWeekHigh) ?? chartMeta?.fiftyTwoWeekHigh ?? null,
    fiftyDayAverage: raw(summaryDetail.fiftyDayAverage) ?? null,
    twoHundredDayAverage: raw(summaryDetail.twoHundredDayAverage) ?? null,
    volume: raw(summaryDetail.volume) ?? chartMeta?.regularMarketVolume ?? null,
    avgVolume: raw(summaryDetail.averageVolume) ?? null,
    firstTradeDate: chartMeta?.firstTradeDate
      ? new Date(chartMeta.firstTradeDate * 1000).toISOString().slice(0, 10)
      : null,

    // Valorisation et rentabilité — vide (null) pour les ETF/fonds, ce qui
    // est normal et géré côté front (on n'affiche pas des cases vides).
    marketCap: raw(price.marketCap) ?? null,
    peRatio: raw(summaryDetail.trailingPE),
    forwardPE: raw(summaryDetail.forwardPE),
    pegRatio: raw(defaultKeyStatistics.pegRatio),
    priceToBook: raw(defaultKeyStatistics.priceToBook),
    dividendYield: raw(summaryDetail.dividendYield),
    dividendRate: raw(summaryDetail.dividendRate),
    payoutRatio: raw(summaryDetail.payoutRatio),
    beta: raw(summaryDetail.beta),
    profitMargin: raw(financialData.profitMargins),
    revenueGrowth: raw(financialData.revenueGrowth),
    returnOnEquity: raw(financialData.returnOnEquity),
    debtToEquity: raw(financialData.debtToEquity),
    targetMeanPrice: raw(financialData.targetMeanPrice),
    recommendationKey: financialData.recommendationKey || null,
    numberOfAnalystOpinions: raw(financialData.numberOfAnalystOpinions),

    // Frais annuels du fonds (ETF/OPCVM) — l'équivalent du PER pour un fonds.
    expenseRatio: raw(fundProfile.feesExpensesInvestment?.annualReportExpenseRatio) ?? null,
  };

  res.status(200).json(payload);
}

// Endpoint lourd (jusqu'à 4 traductions + 2 appels Yahoo par requête) :
// quota volontairement bas, compensé par un cache de 5 minutes.
export default withApi(handler, { methods: ["GET"], limit: 30, windowMs: 60_000, sMaxAge: 300 });
