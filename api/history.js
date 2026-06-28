// Fonction serverless Vercel — GET /api/history?symbols=AI.PA,CW8.PA,^GSPC&range=6mo
// Renvoie l'historique quotidien (date + clôture) pour chaque symbole.
// Utilisée pour reconstruire la valeur passée du portefeuille et pour
// comparer sa performance (en base 100) à des indices de référence.

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const ALLOWED_RANGES = ["1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max"];

export default async function handler(req, res) {
  const symbolsParam = req.query.symbols;
  const range = ALLOWED_RANGES.includes(req.query.range) ? req.query.range : "6mo";
  if (!symbolsParam) return res.status(400).json({ error: "Paramètre symbols manquant" });

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          symbol
        )}?range=${range}&interval=1d`;
        const r = await fetch(url, { headers: YF_HEADERS });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const result = data?.chart?.result?.[0];
        if (!result) throw new Error("Réponse inattendue");

        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];

        const series = timestamps
          .map((t, i) => ({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            close: closes[i],
          }))
          .filter((p) => p.close != null);

        return { symbol, ok: true, series };
      } catch (err) {
        return { symbol, ok: false, error: err.message, series: [] };
      }
    })
  );

  res.status(200).json(results);
}
