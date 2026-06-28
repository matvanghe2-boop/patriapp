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
