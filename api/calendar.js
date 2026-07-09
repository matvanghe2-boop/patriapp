// Fonction serverless Vercel — GET /api/calendar?symbols=AI.PA,ADYEN.AS,...
// Récupère les événements financiers à venir (prochaine date de détachement
// de dividende, prochaine mise en paiement, prochaine publication de
// résultats) pour chaque ticker, via l'endpoint v7/finance/quote de Yahoo
// Finance. Exécuté côté serveur pour éviter le CORS.
//
// NOTE IMPORTANTE — AUTHENTIFICATION YAHOO (cookie + crumb) :
// Depuis 2023-2025, TOUS les endpoints Yahoo Finance utiles ici
// (v10/quoteSummary ET v7/finance/quote) exigent un cookie de session ET un
// "crumb" anti-CSRF ; sans eux, chaque appel échoue avec
// {"finance":{"error":{"code":"Unauthorized","description":"Invalid Crumb"}}}
// — c'est ce qui provoquait "X ligne(s) sur X sans calendrier disponible"
// avec les deux versions précédentes de ce fichier (aucune des deux
// n'envoyait de cookie/crumb).
//
// On implémente donc ici le mécanisme standard (le même que celui utilisé en
// interne par les librairies yfinance / yahoo-finance2) :
//   1. GET https://fc.yahoo.com               → pose un cookie de session
//   2. GET https://query2.finance.yahoo.com/v1/test/getcrumb (avec ce cookie)
//                                              → renvoie un crumb texte brut
//   3. GET v7/finance/quote?...&crumb=XXX (avec le même cookie)
// Le couple {cookie, crumb} est mis en cache en mémoire pour la durée de vie
// de l'instance serverless (évite de le régénérer à chaque requête, ce qui
// peut déclencher un 429 côté Yahoo en cas d'appels trop fréquents).
//
// Limite connue : Yahoo n'expose pas de date d'assemblée générale sur cet
// endpoint (ni sur aucun endpoint public). Aucune date n'est donc fabriquée
// pour ce type d'événement.

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "*/*",
};

// Cache mémoire process — vit tant que l'instance serverless reste "chaude".
let cachedAuth = null; // { cookie, crumb, expiresAt }
const AUTH_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function getYahooAuth() {
  if (cachedAuth && cachedAuth.expiresAt > Date.now()) return cachedAuth;

  // Étape 1 — poser un cookie de session.
  const cookieRes = await fetch("https://fc.yahoo.com", { headers: YF_HEADERS, redirect: "manual" });
  const setCookieHeaders = cookieRes.headers.getSetCookie
    ? cookieRes.headers.getSetCookie()
    : [cookieRes.headers.get("set-cookie")].filter(Boolean);
  const cookie = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Impossible d'obtenir le cookie de session Yahoo");

  // Étape 2 — échanger ce cookie contre un crumb.
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...YF_HEADERS, Cookie: cookie },
  });
  if (!crumbRes.ok) throw new Error(`Échec récupération crumb (HTTP ${crumbRes.status})`);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes("<")) throw new Error("Crumb Yahoo invalide");

  cachedAuth = { cookie, crumb, expiresAt: Date.now() + AUTH_TTL_MS };
  return cachedAuth;
}

// Yahoo renvoie les timestamps en epoch secondes (nombre entier).
function toIsoDate(epochSeconds) {
  if (epochSeconds == null) return null;
  const d = new Date(epochSeconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchCalendarForSymbols(symbols) {
  const { cookie, crumb } = await getYahooAuth();
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbols.join(",")
  )}&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, { headers: { ...YF_HEADERS, Cookie: cookie } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (data?.finance?.error) throw new Error(data.finance.error.description || "Erreur Yahoo");
  const rows = data?.quoteResponse?.result;
  if (!Array.isArray(rows)) throw new Error("Réponse inattendue");
  return rows;
}

function eventsFromRow(row) {
  const symbol = row.symbol;
  const shortName = row.shortName || row.longName || symbol;
  const events = [];

  // Dividende — dates ex-dividende et mise en paiement (epoch secondes).
  const exDiv = toIsoDate(row.exDividendDate);
  if (exDiv) {
    events.push({ ticker: symbol, name: shortName, type: "Dividende", date: exDiv, label: "Date ex-dividende" });
  }
  const payDiv = toIsoDate(row.dividendDate);
  if (payDiv) {
    events.push({ ticker: symbol, name: shortName, type: "Dividende", date: payDiv, label: "Mise en paiement" });
  }

  // Résultats trimestriels — Yahoo fournit une date ponctuelle et/ou une
  // fourchette (début/fin) selon la confiance de l'estimation.
  const earningsStart = toIsoDate(row.earningsTimestampStart);
  const earningsEnd = toIsoDate(row.earningsTimestampEnd);
  const earningsSingle = toIsoDate(row.earningsTimestamp);

  if (earningsStart && earningsEnd && earningsStart !== earningsEnd) {
    events.push({
      ticker: symbol,
      name: shortName,
      type: "Résultats",
      date: earningsStart,
      label: `Publication des résultats (entre le ${earningsStart} et le ${earningsEnd})`,
    });
  } else if (earningsSingle) {
    events.push({ ticker: symbol, name: shortName, type: "Résultats", date: earningsSingle, label: "Publication des résultats" });
  } else if (earningsStart) {
    events.push({ ticker: symbol, name: shortName, type: "Résultats", date: earningsStart, label: "Publication des résultats" });
  }

  // Assemblée générale — non disponible sur cet endpoint public, aucune
  // donnée n'est fabriquée (voir note en tête de fichier).

  return events;
}

export default async function handler(req, res) {
  const symbolsParam = req.query.symbols;
  if (!symbolsParam) return res.status(400).json({ error: "Paramètre symbols manquant" });

  const symbols = [...new Set(symbolsParam.split(",").map((s) => s.trim()).filter(Boolean))];
  if (symbols.length === 0) return res.status(200).json([]);

  try {
    // Un seul appel groupé : v7/finance/quote accepte une liste de symbols.
    const rows = await fetchCalendarForSymbols(symbols);
    const rowBySymbol = {};
    rows.forEach((r) => { rowBySymbol[r.symbol] = r; });

    const results = symbols.map((symbol) => {
      const row = rowBySymbol[symbol];
      if (!row) return { symbol, ok: false, error: "Symbole introuvable", events: [] };
      return { symbol, ok: true, events: eventsFromRow(row) };
    });

    res.status(200).json(results);
  } catch (err) {
    // L'authentification a pu expirer / être invalidée entre-temps : on
    // vide le cache pour forcer une régénération au prochain appel.
    cachedAuth = null;
    const results = symbols.map((symbol) => ({ symbol, ok: false, error: err.message, events: [] }));
    res.status(200).json(results);
  }
}


