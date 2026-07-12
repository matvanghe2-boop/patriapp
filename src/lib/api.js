const BASE = "/api";

/**
 * Recherche un produit financier par ticker, ISIN ou nom.
 * Renvoie une liste de correspondances : [{ symbol, name, exchange, type }]
 */
export async function searchSecurity(query) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Recherche indisponible");
  }
  return res.json();
}

/**
 * Récupère le dernier cours connu pour une liste de tickers.
 * Renvoie : [{ symbol, ok, price, currency, previousClose } | { symbol, ok:false, error }]
 */
export async function fetchQuotes(symbols) {
  if (!symbols || symbols.length === 0) return [];
  const res = await fetch(`${BASE}/quote?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Cours indisponibles");
  }
  return res.json();
}

/**
 * Récupère les événements financiers à venir (dividendes, résultats,
 * assemblées générales) pour une liste de tickers.
 * Renvoie : [{ symbol, ok, events: [{ ticker, name, type, date, label }] } | { symbol, ok:false, error, events: [] }]
 */
export async function fetchCalendarEvents(symbols) {
  if (!symbols || symbols.length === 0) return [];
  const res = await fetch(`${BASE}/calendar?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Calendrier indisponible");
  }
  return res.json();
}

/**
 * Envoie un avis d'opéré (PDF) au parseur serveur et récupère l'ordre
 * standardisé qu'il en a extrait. Le fichier est encodé en base64 côté
 * client — aucune donnée binaire brute n'est postée directement.
 */
export async function parseOperationPdf(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });

  const res = await fetch(`${BASE}/parse-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, data: base64 }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Analyse du PDF impossible");
  return body; // { broker, transactionId, date, asset, type, quantity, price, fees }
}

/**
 * Récupère l'historique (date + OHLC + volume) pour une liste de symboles.
 * range: "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y" | "ytd" | "max"
 * interval (optionnel) : "1d" | "1wk" | "1mo" — sinon déduit automatiquement du range côté serveur.
 * Renvoie : [{ symbol, ok, interval, series: [{date, open, high, low, close, volume}], firstTradeDate, currency } | { symbol, ok:false, error }]
 */
export async function fetchHistory(symbols, range = "6mo", interval = null) {
  if (!symbols || symbols.length === 0) return [];
  const intervalParam = interval ? `&interval=${interval}` : "";
  const res = await fetch(`${BASE}/history?symbols=${encodeURIComponent(symbols.join(","))}&range=${range}${intervalParam}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Historique indisponible");
  }
  return res.json();
}

/**
 * Récupère la fiche complète d'une entreprise (secteur, activité, ratios
 * clés, repères de cours) pour le sous-onglet Marché.
 * Renvoie : { symbol, ok, name, sector, industry, description, ...ratios } | { symbol, ok:false, error }
 */
export async function fetchCompanyProfile(symbol) {
  const res = await fetch(`${BASE}/profile?symbol=${encodeURIComponent(symbol)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Fiche entreprise indisponible");
  return body;
}

