// Accès mutualisé à l'API Yahoo Finance (non officielle, non documentée —
// elle peut changer sans préavis, d'où le point de passage unique ici pour
// pouvoir la remplacer ou la doubler d'un fournisseur de secours en un endroit).

export const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * fetch + JSON avec délai maximal. Sans timeout, une lenteur côté Yahoo
 * bloque la fonction serverless jusqu'à son propre timeout (10 s+) et
 * l'utilisateur voit une page figée sans explication.
 */
export async function fetchJson(url, { headers = YF_HEADERS, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, signal: controller.signal, ...rest });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Délai dépassé");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Session Yahoo (cookie + crumb) ──────────────────────────────────────────
// Depuis 2023-2025, la plupart des endpoints Yahoo utiles (v10/quoteSummary,
// v7/finance/quote) exigent un cookie de session ET un "crumb" anti-CSRF ;
// sans eux, chaque appel échoue avec {"error":{"code":"Unauthorized"}}.
// Le mécanisme est le même que celui des librairies yfinance / yahoo-finance2 :
//   1. GET https://fc.yahoo.com                              -> pose un cookie
//   2. GET query2.../v1/test/getcrumb (avec ce cookie)       -> renvoie le crumb
//   3. appel réel avec ?crumb=... et le même cookie
// Le couple est mis en cache pour la durée de vie de l'instance serverless :
// le régénérer à chaque requête déclenche des 429 côté Yahoo.
// Ce flux peut changer sans préavis côté Yahoo — tous les appelants doivent
// donc traiter un échec ici comme non fatal.

const AUTH_TTL_MS = 30 * 60_000;
let cachedAuth = null;

export async function getYahooSession() {
  if (cachedAuth && cachedAuth.expiresAt > Date.now()) return cachedAuth;

  const r1 = await fetch("https://fc.yahoo.com", { headers: YF_HEADERS, redirect: "manual" });
  const cookies =
    typeof r1.headers.getSetCookie === "function"
      ? r1.headers.getSetCookie()
      : [r1.headers.get("set-cookie")].filter(Boolean);
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Cookie de session Yahoo indisponible");

  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...YF_HEADERS, Cookie: cookie },
  });
  if (!r2.ok) throw new Error(`Échec récupération crumb (HTTP ${r2.status})`);
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.includes("<")) throw new Error("Crumb Yahoo invalide");

  cachedAuth = { cookie, crumb, expiresAt: Date.now() + AUTH_TTL_MS };
  return cachedAuth;
}

/** À appeler quand un appel authentifié échoue : force une renégociation. */
export function invalidateYahooSession() {
  cachedAuth = null;
}

// ─── Validation des entrées ──────────────────────────────────────────────────
// Les symboles viennent du navigateur et sont interpolés dans une URL externe :
// on impose une forme stricte (lettres, chiffres, `.`, `-`, `^`, `=`) plutôt
// que de faire confiance à encodeURIComponent seul.
const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,20}$/;
export const MAX_SYMBOLS = 40;

export function parseSymbols(raw) {
  if (!raw || typeof raw !== "string") return [];
  const unique = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SYMBOL_RE.test(s))
  );
  return [...unique].slice(0, MAX_SYMBOLS);
}

export function isValidSymbol(s) {
  return typeof s === "string" && SYMBOL_RE.test(s);
}

/**
 * Requête de recherche libre : bornée en longueur et débarrassée des
 * caractères de contrôle (qui n'ont rien à faire dans une URL et servent
 * parfois à masquer une charge utile dans les logs).
 */
export function sanitizeQuery(raw, maxLength = 60) {
  if (!raw || typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code !== 127) out += ch;
  }
  return out.trim().slice(0, maxLength);
}
