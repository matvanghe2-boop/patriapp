// Fonction serverless Vercel — GET /api/quote?symbols=AAPL,CW8.PA,...
// Renvoie le dernier cours connu pour chaque ticker, avec le nom de
// l'entreprise (shortName/longName) pour affichage au lieu du ticker brut.

import { withApi, httpError, cached } from "./_lib/http.js";
import { fetchJson, parseSymbols } from "./_lib/yahoo.js";

// Un cours de bourse ne bouge pas de façon significative en 30 s, et pendant
// ce temps un rechargement de page ou un second onglet ne redéclenche pas
// d'appel externe.
const CACHE_MS = 30_000;

async function handler(req, res) {
  const symbols = parseSymbols(req.query.symbols);
  if (symbols.length === 0) {
    throw httpError(400, "Paramètre `symbols` manquant ou invalide.");
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return await cached(`quote:${symbol}`, CACHE_MS, async () => {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
          const data = await fetchJson(url);
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta || meta.regularMarketPrice == null) throw new Error("Réponse inattendue");
          return {
            symbol,
            ok: true,
            price: meta.regularMarketPrice,
            currency: meta.currency,
            previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
            name: meta.shortName || meta.longName || symbol,
          };
        });
      } catch (err) {
        // Un symbole en échec ne doit pas faire tomber tout le lot.
        return { symbol, ok: false, error: err.message };
      }
    })
  );

  res.status(200).json(results);
}

export default withApi(handler, { methods: ["GET"], limit: 120, windowMs: 60_000, sMaxAge: 30 });
