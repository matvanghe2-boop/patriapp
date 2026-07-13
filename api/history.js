// Fonction serverless Vercel — GET /api/history?symbols=AI.PA,CW8.PA,^GSPC&range=6mo&interval=1d
// Renvoie l'historique (date + OHLC + volume) pour chaque symbole.
// Utilisée pour reconstruire la valeur passée du portefeuille, comparer sa
// performance (en base 100) à des indices de référence, et alimenter le
// graphique historique complet du sous-onglet "Marché" (depuis l'introduction
// en bourse, via range=max).

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const ALLOWED_RANGES = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"];
const ALLOWED_INTERVALS = ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "1wk", "1mo"];
const INTRADAY_INTERVALS = ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"];

// Intervalle par défaut selon la plage demandée. Sur "1 jour"/"1 semaine"/
// "1 mois" on descend en intraday pour un tracé précis (plusieurs dizaines à
// centaines de points par jour) au lieu d'une seule bougie par jour ; sur les
// longues périodes on remonte à l'hebdomadaire, sinon la réponse devient
// énorme (une entreprise cotée depuis 40 ans en quotidien, c'est ~10 000
// points) sans gain de précision visuelle utile. L'utilisateur peut malgré
// tout forcer l'intervalle via ?interval=.
function defaultIntervalFor(range) {
  if (range === "1d") return "5m";
  if (range === "5d") return "15m";
  if (range === "1mo") return "30m";
  if (["5y", "10y", "max"].includes(range)) return "1wk";
  return "1d";
}

export default async function handler(req, res) {
  const symbolsParam = req.query.symbols;
  const range = ALLOWED_RANGES.includes(req.query.range) ? req.query.range : "6mo";
  const interval = ALLOWED_INTERVALS.includes(req.query.interval)
    ? req.query.interval
    : defaultIntervalFor(range);
  if (!symbolsParam) return res.status(400).json({ error: "Paramètre symbols manquant" });

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          symbol
        )}?range=${range}&interval=${interval}&includePrePost=false`;
        const r = await fetch(url, { headers: YF_HEADERS });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const result = data?.chart?.result?.[0];
        if (!result) {
          const yahooError = data?.chart?.error?.description;
          throw new Error(yahooError || "Réponse inattendue");
        }

        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const { close = [], open = [], high = [], low = [], volume = [] } = quote;
        // Cours ajusté des splits/dividendes — plus fiable que le cours brut
        // pour juger d'une performance longue période (l'ajustement de
        // dividende n'existe que sur l'intervalle journalier et plus large).
        const adjClose = result.indicators?.adjclose?.[0]?.adjclose || [];
        const isIntraday = INTRADAY_INTERVALS.includes(interval);

        const series = timestamps
          .map((t, i) => ({
            // En intraday, l'horodatage complet est conservé (heure précise)
            // pour permettre de se déplacer minute par minute sur le
            // graphique ; au-delà, une date suffit (comparaisons/agrégats
            // ailleurs dans l'appli reposent sur ce format "YYYY-MM-DD").
            date: isIntraday ? new Date(t * 1000).toISOString() : new Date(t * 1000).toISOString().slice(0, 10),
            close: close[i],
            open: open[i] ?? null,
            high: high[i] ?? null,
            low: low[i] ?? null,
            volume: volume[i] ?? null,
            adjClose: adjClose[i] ?? null,
          }))
          .filter((p) => p.close != null);

        const meta = result.meta || {};
        return {
          symbol,
          ok: true,
          interval,
          isIntraday,
          series,
          currency: meta.currency || null,
          exchangeName: meta.exchangeName || null,
          firstTradeDate: meta.firstTradeDate
            ? new Date(meta.firstTradeDate * 1000).toISOString().slice(0, 10)
            : (series[0]?.date ?? null),
        };
      } catch (err) {
        return { symbol, ok: false, error: err.message, series: [] };
      }
    })
  );

  res.status(200).json(results);
}
