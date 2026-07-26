// Fonction serverless Vercel — GET /api/calendar?symbols=AI.PA,ADYEN.AS,...
// Récupère les événements financiers à venir (prochaine date de détachement
// de dividende, prochaine mise en paiement, prochaine publication de
// résultats) pour chaque ticker, via l'endpoint v7/finance/quote de Yahoo
// Finance. Exécuté côté serveur pour éviter le CORS.
//
// L'authentification Yahoo (cookie + crumb) est mutualisée dans _lib/yahoo.js.
//
// Limite connue : Yahoo n'expose pas de date d'assemblée générale sur cet
// endpoint (ni sur aucun endpoint public). Aucune date n'est donc fabriquée
// pour ce type d'événement.

import { withApi, httpError, cached } from "./_lib/http.js";
import { YF_HEADERS, getYahooSession, invalidateYahooSession, parseSymbols } from "./_lib/yahoo.js";

// Un calendrier d'événements évolue au mieux une fois par jour : cache long.
const CACHE_MS = 60 * 60_000;

// Yahoo renvoie les timestamps en epoch secondes (nombre entier).
function toIsoDate(epochSeconds) {
  if (epochSeconds == null) return null;
  const d = new Date(epochSeconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function fetchCalendarForSymbols(symbols) {
  const { cookie, crumb } = await getYahooSession();
  // IMPORTANT : sans le paramètre "fields", Yahoo ne renvoie qu'un jeu de
  // champs par défaut qui EXCLUT exDividendDate/dividendDate pour de
  // nombreuses valeurs (notamment les valeurs européennes) — même si le
  // champ existe bel et bien côté Yahoo. On force donc explicitement la liste.
  const fields = [
    "symbol",
    "shortName",
    "longName",
    "exDividendDate",
    "dividendDate",
    "earningsTimestamp",
    "earningsTimestampStart",
    "earningsTimestampEnd",
    "trailingAnnualDividendRate",
    "trailingAnnualDividendYield",
  ].join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbols.join(",")
  )}&fields=${fields}&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, { headers: { ...YF_HEADERS, Accept: "*/*", Cookie: cookie } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (data?.finance?.error) throw new Error(data.finance.error.description || "Erreur Yahoo");
  const rows = data?.quoteResponse?.result;
  if (!Array.isArray(rows)) throw new Error("Réponse inattendue");
  return rows;
}

export function eventsFromRow(row) {
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
  // Si Yahoo ne fournit ni date ex-dividende ni date de paiement pour ce
  // titre, mais qu'un montant de dividende versé sur les 12 derniers mois
  // est connu (trailingAnnualDividendRate), on ne fabrique PAS de date —
  // seule une date effectivement communiquée par Yahoo est affichée.

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
  } else if (earningsSingle || earningsStart) {
    events.push({
      ticker: symbol,
      name: shortName,
      type: "Résultats",
      date: earningsSingle || earningsStart,
      label: "Publication des résultats",
    });
  }

  // Assemblée générale — non disponible sur cet endpoint public, aucune
  // donnée n'est fabriquée (voir note en tête de fichier).

  return events;
}

async function handler(req, res) {
  const symbols = parseSymbols(req.query.symbols);
  if (symbols.length === 0) throw httpError(400, "Paramètre `symbols` manquant ou invalide.");

  try {
    const rows = await cached(`calendar:${symbols.join(",")}`, CACHE_MS, () =>
      // Un seul appel groupé : v7/finance/quote accepte une liste de symbols.
      fetchCalendarForSymbols(symbols)
    );
    const rowBySymbol = Object.fromEntries(rows.map((r) => [r.symbol, r]));

    return res.status(200).json(
      symbols.map((symbol) => {
        const row = rowBySymbol[symbol];
        if (!row) return { symbol, ok: false, error: "Symbole introuvable", events: [] };
        return { symbol, ok: true, events: eventsFromRow(row) };
      })
    );
  } catch (err) {
    // L'authentification a pu expirer / être invalidée entre-temps : on
    // vide le cache pour forcer une régénération au prochain appel. On
    // répond 200 avec des lignes en échec pour que l'UI affiche le reste du
    // portefeuille plutôt qu'une page d'erreur.
    invalidateYahooSession();
    return res
      .status(200)
      .json(symbols.map((symbol) => ({ symbol, ok: false, error: err.message, events: [] })));
  }
}

export default withApi(handler, { methods: ["GET"], limit: 30, windowMs: 60_000, sMaxAge: 900 });
