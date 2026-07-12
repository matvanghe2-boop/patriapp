// Fonction serverless Vercel — GET /api/profile?symbol=AI.PA
// Renvoie la fiche complète d'une entreprise : identité, secteur, activité
// (texte descriptif), ratios financiers clés et repères de cours (52
// semaines, etc.). Alimente le panneau "Fiche Entreprise" du sous-onglet
// Marché. Exécuté côté serveur pour éviter les soucis de CORS et masquer les
// en-têtes nécessaires face à Yahoo Finance.

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const MODULES = [
  "assetProfile",
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
].join(",");

export default async function handler(req, res) {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Paramètre symbol manquant" });

  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      symbol
    )}?modules=${MODULES}`;
    const r = await fetch(url, { headers: YF_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) {
      const yahooError = data?.quoteSummary?.error?.description;
      throw new Error(yahooError || "Entreprise introuvable");
    }

    const { assetProfile = {}, price = {}, summaryDetail = {}, defaultKeyStatistics = {}, financialData = {} } = result;
    const raw = (v) => (v && typeof v === "object" && "raw" in v ? v.raw : v ?? null);

    const payload = {
      symbol,
      ok: true,
      name: price.longName || price.shortName || symbol,
      exchange: price.exchangeName || null,
      currency: price.currency || summaryDetail.currency || null,
      quoteType: price.quoteType || null,

      // Secteur / activité — l'essentiel pour "comprendre" l'entreprise avant d'investir.
      sector: assetProfile.sector || null,
      industry: assetProfile.industry || null,
      country: assetProfile.country || null,
      city: assetProfile.city || null,
      employees: assetProfile.fullTimeEmployees || null,
      website: assetProfile.website || null,
      description: assetProfile.longBusinessSummary || null,
      officers: (assetProfile.companyOfficers || []).slice(0, 3).map((o) => ({
        name: o.name,
        title: o.title,
      })),

      // Cours et repères
      currentPrice: raw(price.regularMarketPrice),
      previousClose: raw(price.regularMarketPreviousClose),
      dayLow: raw(summaryDetail.dayLow),
      dayHigh: raw(summaryDetail.dayHigh),
      fiftyTwoWeekLow: raw(summaryDetail.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: raw(summaryDetail.fiftyTwoWeekHigh),
      fiftyDayAverage: raw(summaryDetail.fiftyDayAverage),
      twoHundredDayAverage: raw(summaryDetail.twoHundredDayAverage),
      volume: raw(summaryDetail.volume),
      avgVolume: raw(summaryDetail.averageVolume),

      // Valorisation et rentabilité — de quoi juger un dossier au-delà du prix nu.
      marketCap: raw(price.marketCap),
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
    };

    res.status(200).json(payload);
  } catch (err) {
    console.error("Erreur /api/profile :", err.message);
    res.status(502).json({
      symbol,
      ok: false,
      error: "Fiche entreprise indisponible pour le moment.",
      detail: err.message,
    });
  }
}
