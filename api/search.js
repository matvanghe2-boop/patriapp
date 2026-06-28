// Fonction serverless Vercel — GET /api/search?q=...
// Recherche un produit (action/ETF) par ticker, ISIN ou nom.
// Exécutée côté serveur pour éviter les soucis de CORS côté navigateur.

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

export default async function handler(req, res) {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Paramètre q manquant" });

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      q
    )}&quotesCount=8&newsCount=0`;
    const r = await fetch(url, { headers: YF_HEADERS });
    if (!r.ok) throw new Error(`Réponse HTTP ${r.status}`);
    const data = await r.json();

    const results = (data.quotes || [])
      .filter((item) => item.symbol)
      .map((item) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchDisp || item.exchange || "",
        type: item.quoteType || "",
      }));

    res.status(200).json(results);
  } catch (err) {
    console.error("Erreur /api/search :", err.message);
    res.status(502).json({
      error: "Recherche indisponible pour le moment. Vérifiez votre connexion internet.",
      detail: err.message,
    });
  }
}
