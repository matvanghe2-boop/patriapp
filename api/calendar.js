// Fonction serverless Vercel — GET /api/calendar?symbols=AI.PA,ADYEN.AS,...
// Récupère les événements financiers à venir (prochaine date de détachement
// de dividende, prochaine mise en paiement, prochaine publication de
// résultats) pour chaque ticker, via l'endpoint v7/finance/quote de Yahoo
// Finance. Exécuté côté serveur pour éviter le CORS.
//
// NOTE IMPORTANTE : l'endpoint v10/finance/quoteSummary (module
// calendarEvents), utilisé dans une version précédente de ce fichier, exige
// désormais un cookie + "crumb" d'authentification côté Yahoo (durci
// courant 2024-2025) : sans ce mécanisme, chaque appel échoue avec une
// erreur "Invalid Crumb" et aucune donnée n'est renvoyée — c'est exactement
// ce qui provoquait le message "X ligne(s) sur X sans calendrier
// disponible". L'endpoint v7/finance/quote expose les mêmes informations
// utiles (dates de dividende, dates de résultats) SANS nécessiter de crumb,
// on l'utilise donc à la place.
//
// Limite connue : Yahoo n'expose pas de date d'assemblée générale sur cet
// endpoint (ni sur aucun endpoint public non authentifié). Aucune date
// n'est donc fabriquée pour ce type d'événement.

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

// Yahoo renvoie les timestamps en epoch secondes (nombre entier).
function toIsoDate(epochSeconds) {
  if (epochSeconds == null) return null;
  const d = new Date(epochSeconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchCalendarForSymbols(symbols) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbols.join(",")
  )}`;
  const r = await fetch(url, { headers: YF_HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
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
    // Si l'appel groupé échoue entièrement (ex: réseau), on renvoie un
    // échec explicite pour chaque symbole plutôt qu'une 500 opaque.
    const results = symbols.map((symbol) => ({ symbol, ok: false, error: err.message, events: [] }));
    res.status(200).json(results);
  }
}

