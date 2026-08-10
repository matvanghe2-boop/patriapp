// Fonction serverless Vercel — GET /api/search?q=...
// Recherche un produit (action/ETF) par ticker, ISIN ou nom.
// Exécutée côté serveur pour éviter les soucis de CORS côté navigateur.

import { httpError, cached } from "../http.js";
import { fetchJson, sanitizeQuery } from "../yahoo.js";

const CACHE_MS = 5 * 60_000;

async function handler(req, res) {
  const q = sanitizeQuery(req.query.q);
  if (q.length < 1) throw httpError(400, "Paramètre `q` manquant.");

  const results = await cached(`search:${q.toLowerCase()}`, CACHE_MS, async () => {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const data = await fetchJson(url);
    return (data.quotes || [])
      .filter((item) => item.symbol)
      .map((item) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchDisp || item.exchange || "",
        type: item.quoteType || "",
      }));
  });

  res.status(200).json(results);
}

// La recherche part à chaque frappe côté client (avec debounce) : la limite
// est plus haute que sur les autres endpoints, mais le cache absorbe
// l'essentiel des requêtes répétées.
export const options = { methods: ["GET"], limit: 90, windowMs: 60_000, sMaxAge: 300 };

export { handler };
