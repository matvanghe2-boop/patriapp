// Fonction serverless Vercel — GET /api/calendar?symbols=AI.PA,ADYEN.AS,...
// Récupère les événements financiers à venir pour chaque ticker :
//   - détachement et mise en paiement des dividendes
//   - publications de résultats (annuels / intermédiaires), avec les
//     estimations d'analystes (bénéfice et chiffre d'affaires attendus)
//   - conférences de résultats
// Exécuté côté serveur pour éviter le CORS.
//
// Deux sources Yahoo sont combinées :
//   1. v7/finance/quote — un seul appel groupé pour tous les symboles, rapide,
//      donne les dates de dividende et LA prochaine date de résultats.
//   2. v10/quoteSummary (module calendarEvents) — un appel par symbole, plus
//      lent mais qui renvoie TOUTES les dates de résultats connues, la date de
//      conférence, et les estimations. C'est ce qui rend le calendrier
//      réellement exhaustif au lieu de n'afficher qu'une échéance par ligne.
// La seconde source est facultative : si elle échoue, on garde la première.
//
// L'authentification Yahoo (cookie + crumb) est mutualisée dans _lib/yahoo.js.
//
// ⚠️ Limites de la source (aucune date n'est fabriquée) :
//   - Yahoo n'expose AUCUNE date d'assemblée générale, sur aucun endpoint
//     public. Le type "Assemblée Générale" existe côté client et s'affichera
//     dès qu'une source le fournira, mais il reste vide aujourd'hui.
//   - Yahoo ne distingue pas la publication du chiffre d'affaires seul de la
//     publication des résultats complets (fréquente chez les sociétés
//     européennes). Le CA attendu est donc rattaché à l'événement "Résultats"
//     sous forme d'estimation, plutôt que présenté comme une date distincte
//     qui serait inventée.

import { withApi, httpError, cached } from "./_lib/http.js";
import { YF_HEADERS, getYahooSession, invalidateYahooSession, parseSymbols } from "./_lib/yahoo.js";

// Un calendrier d'événements évolue au mieux une fois par jour : cache long.
const CACHE_MS = 60 * 60_000;

// Nombre d'appels quoteSummary menés de front. Trop à la fois et Yahoo
// répond 429 ; un par un et un portefeuille de 30 lignes dépasse le temps
// d'exécution de la fonction serverless.
const ENRICH_CONCURRENCY = 6;

// Yahoo renvoie les timestamps en epoch secondes (nombre entier).
function toIsoDate(epochSeconds) {
  if (epochSeconds == null) return null;
  const d = new Date(epochSeconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Yahoo enveloppe ses nombres dans { raw, fmt } — parfois non. */
const raw = (v) => (v && typeof v === "object" && "raw" in v ? v.raw : (v ?? null));

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

/**
 * Récupère le module `calendarEvents` d'un symbole : toutes les dates de
 * résultats connues, la conférence associée, et les estimations d'analystes.
 * Best-effort — renvoie null au moindre problème, l'appelant s'en passe.
 */
async function fetchCalendarDetail(symbol) {
  try {
    const { cookie, crumb } = await getYahooSession();
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
      `?modules=calendarEvents,defaultKeyStatistics&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, { headers: { ...YF_HEADERS, Accept: "*/*", Cookie: cookie } });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Distingue une publication annuelle d'une publication intermédiaire.
 *
 * Yahoo ne qualifie jamais ses dates de résultats. Mais la clôture de
 * l'exercice est connue (`lastFiscalYearEnd`) : une publication qui tombe
 * dans les quatre mois suivant cette clôture est, dans l'immense majorité
 * des cas, la publication annuelle. Au-delà, c'est un point intermédiaire.
 * L'heuristique est explicitée dans le libellé pour que l'utilisateur sache
 * qu'il s'agit d'une déduction et non d'une donnée fournie par la source.
 */
function qualifyEarnings(dateIso, fiscalYearEndIso) {
  if (!fiscalYearEndIso) return "Publication des résultats";
  const monthsAfter =
    (new Date(`${dateIso}T00:00:00`).getFullYear() - new Date(`${fiscalYearEndIso}T00:00:00`).getFullYear()) * 12 +
    (new Date(`${dateIso}T00:00:00`).getMonth() - new Date(`${fiscalYearEndIso}T00:00:00`).getMonth());
  const normalized = ((monthsAfter % 12) + 12) % 12;
  return normalized <= 4 ? "Résultats annuels (estimé)" : "Résultats intermédiaires (estimé)";
}

/**
 * Événements tirés du module calendarEvents : toutes les dates de résultats
 * (pas seulement la prochaine) et la conférence de résultats.
 */
export function eventsFromDetail(detail, symbol, shortName) {
  if (!detail) return [];
  const earnings = detail.calendarEvents?.earnings || {};
  const fiscalYearEnd = toIsoDate(raw(detail.defaultKeyStatistics?.lastFiscalYearEnd));
  const events = [];

  const estimates = {
    beneficeAttendu: raw(earnings.earningsAverage),
    chiffreAffairesAttendu: raw(earnings.revenueAverage),
  };
  const hasEstimates = estimates.beneficeAttendu != null || estimates.chiffreAffairesAttendu != null;

  const seen = new Set();
  for (const entry of earnings.earningsDate || []) {
    const date = toIsoDate(raw(entry));
    if (!date || seen.has(date)) continue;
    seen.add(date);
    events.push({
      ticker: symbol,
      name: shortName,
      type: "Résultats",
      date,
      label: qualifyEarnings(date, fiscalYearEnd),
      ...(hasEstimates ? { estimates } : {}),
    });
  }

  for (const entry of earnings.earningsCallDate || []) {
    const date = toIsoDate(raw(entry));
    if (!date) continue;
    events.push({
      ticker: symbol,
      name: shortName,
      type: "Communication",
      date,
      label: "Conférence de résultats",
    });
  }

  return events;
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

/**
 * Deux événements sont considérés comme le même dès qu'ils partagent ticker,
 * type et date : la source groupée et la source détaillée se recoupent
 * largement, et sans déduplication chaque publication de résultats
 * apparaîtrait deux fois dans le calendrier.
 */
function mergeEvents(...groups) {
  const byKey = new Map();
  for (const group of groups) {
    for (const ev of group) {
      const key = `${ev.ticker}|${ev.type}|${ev.date}`;
      const existing = byKey.get(key);
      // En cas de doublon, on garde la version la plus riche (celle qui porte
      // des estimations ou un libellé plus précis).
      if (!existing || (!existing.estimates && ev.estimates)) byKey.set(key, ev);
    }
  }
  return [...byKey.values()];
}

/** Exécute `task` sur chaque élément, `limit` en parallèle au maximum. */
async function mapWithConcurrency(items, limit, task) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(task))));
  }
  return out;
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

    // Enrichissement facultatif, par symbole. Chaque appel est caché
    // séparément : un portefeuille stable ne le repaie qu'une fois par heure.
    const details = await mapWithConcurrency(symbols, ENRICH_CONCURRENCY, async (symbol) => {
      const detail = await cached(`calendarDetail:${symbol}`, CACHE_MS, () => fetchCalendarDetail(symbol));
      return [symbol, detail];
    });
    const detailBySymbol = Object.fromEntries(details);

    return res.status(200).json(
      symbols.map((symbol) => {
        const row = rowBySymbol[symbol];
        const detail = detailBySymbol[symbol];
        if (!row && !detail) return { symbol, ok: false, error: "Symbole introuvable", events: [] };
        const shortName = row?.shortName || row?.longName || symbol;
        return {
          symbol,
          ok: true,
          // La source détaillée passe en premier : ses libellés sont plus
          // précis (« Résultats annuels » plutôt que « Publication des
          // résultats »). La source groupée complète ce qui manque —
          // notamment les dates de dividende, absentes de calendarEvents
          // pour beaucoup de valeurs européennes.
          events: mergeEvents(
            eventsFromDetail(detail, symbol, shortName),
            row ? eventsFromRow(row) : []
          ),
        };
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
