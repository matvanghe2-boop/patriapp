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
const ALLOWED_INTERVALS = ["1d", "1wk", "1mo"];

// Intervalle par défaut selon la plage demandée : sur les longues périodes on
// bascule automatiquement sur une granularité plus large, sinon la réponse
// devient énorme (une entreprise cotée depuis 40 ans en quotidien, c'est
// ~10 000 points) sans que ça apporte de précision utile à l'œil sur un
// graphique. L'utilisateur peut malgré tout forcer l'intervalle via ?interval=.
function defaultIntervalFor(range) {
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
        )}?range=${range}&interval=${interval}`;
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

        const series = timestamps
          .map((t, i) => ({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            close: close[i],
            open: open[i] ?? null,
            high: high[i] ?? null,
            low: low[i] ?? null,
            volume: volume[i] ?? null,
          }))
          .filter((p) => p.close != null);

        const meta = result.meta || {};
        return {
          symbol,
          ok: true,
          interval,
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
