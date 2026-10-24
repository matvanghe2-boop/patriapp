const BASE = "/api";

/**
 * Les routes de données de marché passent toutes par `/api/market`, avec un
 * paramètre `action`. Ce n'est pas un détail d'implémentation qu'on pourrait
 * masquer : Vercel compte une fonction serverless par fichier de `api/`, et le
 * plan Hobby en autorise douze. Un fichier par endpoint faisait échouer le
 * déploiement dès la treizième route.
 *
 * `parse-pdf` et `advisor` gardent leur propre URL : ils portent une
 * configuration Vercel au niveau du fichier (taille de corps, durée maximale)
 * qui ne peut pas être partagée.
 */
const marche = (action, params = {}) => {
  const q = new URLSearchParams({ action, ...params });
  return `${BASE}/market?${q}`;
};

/**
 * Recherche un produit financier par ticker, ISIN ou nom.
 * Renvoie une liste de correspondances : [{ symbol, name, exchange, type }]
 */
export async function searchSecurity(query) {
  const res = await fetch(marche("search", { q: query }));
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
  const res = await fetch(marche("quote", { symbols: symbols.join(",") }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Cours indisponibles");
  }
  return res.json();
}

/**
 * Récupère le taux de conversion de chaque devise vers l'euro.
 * Renvoie : [{ devise, ok, versEuro } | { devise, ok:false, error }]
 * `versEuro` s'applique directement à un cours : prix × versEuro = prix en €.
 */
export async function fetchTauxChange(devises) {
  const liste = [...new Set((devises || []).filter((d) => d && d !== "EUR"))];
  if (liste.length === 0) return [];
  const res = await fetch(marche("fx", { devises: liste.join(",") }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Taux de change indisponibles");
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
  const res = await fetch(marche("calendar", { symbols: symbols.join(",") }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Calendrier indisponible");
  }
  return res.json();
}

/**
 * Texte d'un communiqué déposé sur info-financiere.gouv.fr, extrait du PDF
 * par le serveur. Public et sans compte : c'est le texte que la société a
 * publié. Renvoie { url, titre, date, texte, tronque }.
 *
 * `cible` est le lien du document, ou { symbole, date, type } pour le faire
 * chercher dans le registre quand l'événement n'en porte pas.
 */
export async function fetchCommunique(cible) {
  const params =
    typeof cible === "string"
      ? { url: cible }
      : { symbol: cible.symbole, date: cible.date, ...(cible.type ? { type: cible.type } : {}) };
  const res = await fetch(marche("communique", params));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Communiqué indisponible");
  return body;
}

/** Le lien pointe-t-il vers un communiqué que le serveur sait lire ? */
export const estCommuniqueDepose = (url) =>
  typeof url === "string" && url.startsWith("https://fr.ftp.opendatasoft.com/datadila/INFOFI/");

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
 * range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y" | "ytd" | "max"
 * interval (optionnel) : "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" | "1mo" — sinon déduit
 * automatiquement du range côté serveur (intraday précis sur 1d/5d/1mo, hebdo au-delà de 5 ans).
 * Renvoie : [{ symbol, ok, interval, isIntraday, series: [{date, open, high, low, close, adjClose, volume}], firstTradeDate, currency } | { symbol, ok:false, error }]
 */
export async function fetchHistory(symbols, range = "6mo", interval = null, { dividendes = false } = {}) {
  if (!symbols || symbols.length === 0) return [];
  const res = await fetch(
    marche("history", {
      symbols: symbols.join(","),
      range,
      ...(interval ? { interval } : {}),
      ...(dividendes ? { dividendes: "1" } : {}),
    })
  );
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
  const res = await fetch(marche("profile", { symbol }));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Fiche entreprise indisponible");
  return body;
}

/**
 * Ratios fondamentaux d'un lot de titres, pour le screener.
 * Renvoie : [{ symbole, ok, per, roePct, ... } | { symbole, ok:false, error }]
 */
// L'endpoint borne chaque requête à 40 symboles (voir MAX_SYMBOLS), et une
// fonction serverless a de toute façon un temps d'exécution limité. Vingt
// symboles par appel tiennent confortablement dans les deux contraintes.
const TAILLE_REQUETE_SCREEN = 20;

export async function fetchScreen(symbols, { onProgression } = {}) {
  const liste = [...new Set((symbols || []).filter(Boolean))];
  if (liste.length === 0) return [];

  const tranches = [];
  for (let i = 0; i < liste.length; i += TAILLE_REQUETE_SCREEN) {
    tranches.push(liste.slice(i, i + TAILLE_REQUETE_SCREEN));
  }

  const resultats = [];
  let faites = 0;
  for (const tranche of tranches) {
    const res = await fetch(marche("screen", { symbols: tranche.join(",") }));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Données fondamentales indisponibles");
    }
    resultats.push(...(await res.json()));
    faites += 1;
    onProgression?.({ faites, total: tranches.length, titres: resultats.length });
  }
  return resultats;
}

/**
 * Fiche financière complète d'un titre : ratios, historique annuel (quatre
 * exercices) et consensus d'analystes (exercice en cours et suivant).
 */
export async function fetchFundamentals(symbol) {
  const res = await fetch(marche("fundamentals", { symbol }));
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error || "Fiche financière indisponible");
  return body;
}

/**
 * Récupère le catalogue des taux financiers (épargne réglementée, crédit,
 * banques centrales, inflation, fiscalité). Best-effort côté serveur : en
 * cas d'échec réseau total, on retombe côté client sur le catalogue de
 * référence embarqué (src/lib/ratesCatalog.js) plutôt que d'afficher un
 * onglet vide.
 * Renvoie : { rates: [...], liveEnabled: boolean, generatedAt: string }
 */
export async function fetchRates() {
  const res = await fetch(marche("rates"));
  // En dev sans `vercel dev` (simple `npm run dev`), une route /api/* inconnue
  // renvoie le HTML de l'app (statut 200) plutôt qu'une vraie 404 : le corps
  // n'est alors pas du JSON valide. On ne peut donc pas se contenter de
  // `res.ok` — il faut vérifier la FORME de la réponse avant de la utiliser.
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !Array.isArray(body.rates)) {
    throw new Error(body?.error || "Catalogue des taux indisponible");
  }
  return body;
}


/**
 * Interroge l'état de la source de données de marché.
 *
 * Renvoie : { ok, source, motif?, verifieLe, latenceMs }
 *
 * Ne LÈVE JAMAIS. Un diagnostic qui échoue en levant une exception oblige
 * chaque appelant à l'envelopper dans un try/catch pour ne rien casser — et
 * c'est exactement l'inverse du besoin : cette fonction existe pour rendre une
 * panne lisible, pas pour en ajouter une.
 *
 * Un échec de la route elle-même est donc rapporté comme une source
 * indisponible, ce qu'il est du point de vue de l'application.
 */
export async function fetchEtatSource() {
  try {
    const res = await fetch(marche("health"));
    const body = await res.json().catch(() => null);
    // Même précaution que `fetchRates` : en `npm run dev` sans `vercel dev`,
    // une route /api/* renvoie le HTML de l'application avec un statut 200.
    if (!res.ok || !body || typeof body.ok !== "boolean") {
      return { ok: false, source: "yahoo", motif: "route-indisponible", verifieLe: new Date().toISOString() };
    }
    return body;
  } catch {
    return { ok: false, source: "yahoo", motif: "reseau", verifieLe: new Date().toISOString() };
  }
}

/**
 * Résumé d'une publication d'entreprise.
 *
 * La route exige un jeton de session : son abus coûte le quota du fournisseur
 * de modèle, exactement comme l'assistant. Le jeton est donc joint ici, comme
 * le fait `horizonClient`.
 *
 * Ce qui part : un symbole, et du texte DÉJÀ PUBLIC — ou un lien vers un
 * document de la SEC. Jamais un montant, jamais une quantité, jamais un nom
 * de compte.
 */
export async function resumerPublication({ symbole, texte, url, guidancePrecedente = null, tenue = null }) {
  const { supabase, isSupabaseConfigured } = await import("./supabaseClient");
  let jeton = null;
  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession();
    jeton = data?.session?.access_token ?? null;
  }

  const res = await fetch(`${BASE}/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    // `tenue` : combien de guidances passées la société a tenues, d'après les
    // résumés déjà faits. Un décompte de publications publiques, pas une
    // donnée de portefeuille.
    body: JSON.stringify({ symbole, texte, url, guidancePrecedente, tenue }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Résumé impossible pour le moment.");
  return body;
}

/**
 * Analyse de trajectoire et de valorisation d'une valeur.
 *
 * `donnees` ne contient que des ratios PUBLICS de la société — les mêmes que
 * ceux déjà affichés dans sa fiche. Aucune position, aucun montant, aucune
 * quantité détenue : cette route ignore jusqu'à l'existence du portefeuille.
 */
export async function analyserValeur({ symbole, donnees }) {
  const { supabase, isSupabaseConfigured } = await import("./supabaseClient");
  let jeton = null;
  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession();
    jeton = data?.session?.access_token ?? null;
  }

  const res = await fetch(`${BASE}/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify({ mode: "analyse", symbole, donnees }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Analyse indisponible pour le moment.");
  return body;
}
