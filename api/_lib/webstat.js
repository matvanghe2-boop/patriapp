// Accès best-effort à l'API sécurisée Webstat (Banque de France).
//
// ⚠️ Point vérifié par appel direct au moment de l'écriture de ce fichier :
// le catalogue PUBLIC de Webstat (Opendatasoft Explore API, sans clé,
// https://webstat.banque-france.fr/api/explore/v2.1/...) ne sert que des
// métadonnées de recherche — sur 42 000+ jeux de données catalogués, un seul
// expose des enregistrements requêtables, et ce n'est pas une série de taux.
// Les valeurs réelles des séries (taux du Livret A, du LEP, du CEL...) ne
// sont accessibles qu'via l'API sécurisée d'api.webstat.banque-france.fr,
// avec un identifiant client (X-IBM-Client-Id) obtenu par inscription
// gratuite sur developer.webstat.banque-france.fr.
//
// Ce module est donc volontairement best-effort et silencieux : sans
// `WEBSTAT_CLIENT_ID` configuré côté serveur (jamais préfixé VITE_, donc
// jamais exposé au navigateur), toute tentative de rafraîchissement échoue
// proprement et l'appelant se rabat sur `src/lib/ratesCatalog.js`, qui reste
// la source de vérité par défaut, avec ses valeurs officielles maintenues à
// la main et datées.

const BASE_URL = "https://api.webstat.banque-france.fr/v1";
const TIMEOUT_MS = 6000;

export function isWebstatConfigured() {
  return Boolean(process.env.WEBSTAT_CLIENT_ID);
}

/**
 * Récupère la dernière observation d'une série Webstat.
 * Renvoie `null` au moindre problème (clé absente, réseau, format
 * inattendu, série inconnue) — jamais d'exception : un taux qui ne se
 * rafraîchit pas doit dégrader vers la valeur de référence, pas faire
 * échouer tout l'endpoint /api/rates.
 *
 * Forme de réponse anticipée (non vérifiable sans compte développeur actif) :
 * une série d'observations avec au moins une date et une valeur numérique.
 * Le parsing reste défensif et tente plusieurs formes plausibles plutôt que
 * de supposer une forme unique.
 */
export async function fetchLatestObservation(seriesKey) {
  const clientId = process.env.WEBSTAT_CLIENT_ID;
  if (!clientId || !seriesKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${BASE_URL}/series/${encodeURIComponent(seriesKey)}/observations?lastNObservations=1`;
    const r = await fetch(url, {
      headers: { "X-IBM-Client-Id": clientId, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const data = await r.json();
    return parseObservation(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extraction défensive : accepte plusieurs formes plausibles de réponse SDMX/JSON. */
function parseObservation(data) {
  const candidate =
    data?.observations?.[0] ??
    data?.data?.[0] ??
    (Array.isArray(data) ? data[0] : null) ??
    data;
  if (!candidate || typeof candidate !== "object") return null;

  const value = Number(candidate.value ?? candidate.obsValue ?? candidate.OBS_VALUE);
  const date = candidate.date ?? candidate.period ?? candidate.TIME_PERIOD ?? null;
  if (!Number.isFinite(value) || !date) return null;

  return { value, date: String(date).slice(0, 10) };
}
