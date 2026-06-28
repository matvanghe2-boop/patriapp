// Fonction serverless Vercel — GET /api/quote?symbols=AAPL,CW8.PA,...
// Renvoie le dernier cours connu pour chaque ticker. Chaque ticker est
// interrogé individuellement afin qu'un échec isolé n'empêche pas la
// mise à jour des autres lignes du portefeuille.

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

export default async function handler(req, res) {
  const symbolsParam = req.query.symbols;
  if (!symbolsParam) return res.status(400).json({ error: "Paramètre symbols manquant" });

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
        const r = await fetch(url, { headers: YF_HEADERS });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta || meta.regularMarketPrice == null) throw new Error("Réponse inattendue");
        return {
          symbol,
          ok: true,
          price: meta.regularMarketPrice,
          currency: meta.currency,
          previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
        };
      } catch (err) {
        return { symbol, ok: false, error: err.message };
      }
    })
  );

  res.status(200).json(results);
}
