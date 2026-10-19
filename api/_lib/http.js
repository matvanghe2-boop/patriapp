// Socle commun à toutes les fonctions serverless : CORS, limitation de débit,
// vérification de méthode, plafond de taille de corps, cache mémoire et
// gestion d'erreur uniforme. Avant, chaque endpoint refaisait son propre
// try/catch et n'imposait aucune restriction — n'importe qui pouvait les
// utiliser comme proxy gratuit vers Yahoo Finance.

/**
 * Origines autorisées à appeler l'API depuis un navigateur.
 * En production, renseigner ALLOWED_ORIGINS (liste séparée par des virgules)
 * dans les variables d'environnement Vercel, ex :
 *   ALLOWED_ORIGINS=https://patrium.vercel.app,https://patrium.fr
 * VERCEL_URL (injectée automatiquement par Vercel) est toujours acceptée.
 */
function allowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const vercel = process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [];
  const dev =
    process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"];
  return [...fromEnv, ...vercel, ...dev];
}

export function isOriginAllowed(origin, allowed = allowedOrigins()) {
  // Pas d'en-tête Origin = requête same-origin (le navigateur ne l'envoie pas
  // pour un GET vers sa propre origine) : c'est le cas nominal de l'app.
  if (!origin) return true;
  return allowed.includes(origin);
}

// ─── Limitation de débit ─────────────────────────────────────────────────────
// Fenêtre glissante en mémoire. Limite connue : sur Vercel, chaque instance
// serverless a sa propre mémoire, donc le quota réel est "par instance" et
// remis à zéro à froid. C'est suffisant pour couper un abus grossier ; pour un
// quota strict il faudrait un store partagé (Upstash Redis, Vercel KV).
const buckets = new Map();
const MAX_BUCKETS = 5000;

export function rateLimit(key, { limit = 60, windowMs = 60_000 } = {}, now = Date.now()) {
  // Purge opportuniste pour éviter que la Map grossisse indéfiniment.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, hits] of buckets) {
      if (!hits.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
    buckets.set(key, hits);
    return { allowed: false, remaining: 0, retryAfter };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, remaining: limit - hits.length, retryAfter: 0 };
}

export function _resetRateLimit() {
  buckets.clear();
}

/**
 * Identifie l'appelant pour la limitation de débit.
 *
 * `x-forwarded-for` est une liste que CHAQUE intermédiaire complète, et dont
 * le client contrôle entièrement le début : la version précédente prenait le
 * premier élément, si bien qu'un `curl -H "X-Forwarded-For: 1.2.3.4"` changeait
 * de compartiment à chaque requête et annulait purement et simplement le quota.
 *
 * On préfère donc `x-vercel-forwarded-for`, que la plateforme réécrit elle-même,
 * puis — à défaut — le DERNIER élément de la chaîne, seul segment ajouté par un
 * intermédiaire de confiance et non par l'appelant.
 */
export function clientKey(req) {
  const premier = (v) => (Array.isArray(v) ? v[0] : v || "");

  const vercel = premier(req.headers?.["x-vercel-forwarded-for"]).trim();
  if (vercel) return vercel;

  const chaine = premier(req.headers?.["x-forwarded-for"])
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chaine.length > 0) return chaine[chaine.length - 1];

  return premier(req.headers?.["x-real-ip"]).trim() || req.socket?.remoteAddress || "unknown";
}

// ─── Cache mémoire ───────────────────────────────────────────────────────────
// Évite de retaper Yahoo/Google pour la même requête à quelques secondes
// d'intervalle (rechargement de page, plusieurs onglets ouverts...). Même
// limite que le rate limit : c'est un cache par instance, pas un cache global.
const cacheStore = new Map();
const MAX_CACHE_ENTRIES = 500;

/**
 * Requêtes identiques DÉJÀ en vol, pour ne pas les lancer plusieurs fois.
 *
 * Sans ce registre, N appels simultanés sur la même clé exécutent N fois le
 * producteur : le cache ne sert à rien tant que la première réponse n'est pas
 * revenue. C'est exactement ce qui se passe au démarrage à froid, quand le
 * tableau de bord demande d'un coup les cours, le change et l'historique —
 * donc précisément le moment où Yahoo répond par des 429.
 */
const enVol = new Map();

export async function cached(key, ttlMs, producer, now = Date.now()) {
  const hit = cacheStore.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value;

  // Une requête identique est déjà partie : on attend SON résultat.
  const dejaEnVol = enVol.get(key);
  if (dejaEnVol) return dejaEnVol;

  const promesse = (async () => {
    const value = await producer();
    if (cacheStore.size >= MAX_CACHE_ENTRIES) {
      // Éviction FIFO simple : on retire l'entrée la plus ancienne insérée.
      const oldest = cacheStore.keys().next().value;
      cacheStore.delete(oldest);
    }
    cacheStore.set(key, { at: now, value });
    return value;
  })();

  // Le nettoyage doit survivre à un échec, sinon une seule erreur condamne la
  // clé : tous les appels suivants attendraient une promesse déjà rejetée.
  enVol.set(key, promesse);
  try {
    return await promesse;
  } finally {
    enVol.delete(key);
  }
}

export function _resetCache() {
  cacheStore.clear();
  enVol.clear();
}

// ─── Wrapper ─────────────────────────────────────────────────────────────────
/**
 * Enveloppe un handler avec les protections communes.
 *
 * @param {object} options
 * @param {string[]} options.methods       Méthodes HTTP acceptées.
 * @param {number}   options.limit         Requêtes autorisées par fenêtre.
 * @param {number}   options.windowMs      Durée de la fenêtre.
 * @param {number}   options.maxBodyBytes  Taille max du corps (POST).
 * @param {number}   options.sMaxAge       Cache CDN en secondes (0 = pas de cache).
 * @param {string}   options.portee        Nom du compartiment de débit. À
 *   renseigner dès que PLUSIEURS routes partagent un même chemin : sans lui,
 *   le compartiment est le chemin, et les dix actions de `/api/market` se
 *   partageaient un unique quota. Conséquence concrète : vingt-cinq requêtes
 *   `?action=quote` (limite 120) suffisaient à faire répondre 429 au PREMIER
 *   `?action=screen` (limite 20), dont le quota n'avait pourtant jamais servi.
 *   La limite réellement appliquée était donc la plus basse des dix, et
 *   `X-RateLimit-Remaining` était faux sur toutes les routes.
 */
export function withApi(handler, options = {}) {
  const {
    methods = ["GET"],
    limit = 60,
    windowMs = 60_000,
    maxBodyBytes = 0,
    sMaxAge = 0,
    portee = "",
  } = options;

  return async function wrapped(req, res) {
    const origin = req.headers?.origin;

    /**
     * `Vary: Origin` est posé AVANT le contrôle, et sans condition.
     *
     * Il n'était écrit que sur les réponses portant un en-tête `Origin`. Or
     * les routes de marché déclarent toutes un `s-maxage` : le CDN de Vercel
     * mettait donc en cache la réponse d'une requête SANS `Origin` (le cas
     * nominal du navigateur en same-origin) sous une clé qui ne dépendait pas
     * de l'origine — puis la servait telle quelle à n'importe qui.
     *
     * Vérifié en production avant correctif : un appel à
     * `/api/market?action=health` portant `Origin: https://evil.example`
     * recevait 200 depuis le cache, alors que le même appel forcé en MISS
     * (paramètre unique) recevait bien 403. Le contrôle d'origine fonctionnait
     * donc parfaitement… et n'était jamais atteint.
     *
     * Avec cet en-tête, le CDN segmente ses entrées par origine : une origine
     * refusée obtient sa propre entrée 403 au lieu d'hériter du 200 d'une
     * autre.
     */
    res.setHeader("Vary", "Origin");

    if (!isOriginAllowed(origin)) {
      return res.status(403).json({ error: "Origine non autorisée." });
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
    // `Authorization` est indispensable : /api/advisor exige un jeton de
    // session. Sans lui ici, le préambule CORS échouait pour tout appel
    // cross-origin — y compris depuis une origine pourtant listée dans
    // ALLOWED_ORIGINS — alors que rien dans la réponse ne l'expliquait.
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    // L'API n'expose que des données de marché publiques : rien à indexer,
    // rien à embarquer dans une autre page.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (req.method === "OPTIONS") return res.status(204).end();

    if (!methods.includes(req.method)) {
      res.setHeader("Allow", methods.join(", "));
      return res.status(405).json({ error: "Méthode non autorisée." });
    }

    const compartiment = portee || req.url?.split("?")[0] || "";
    const rl = rateLimit(`${clientKey(req)}:${compartiment}`, { limit, windowMs });
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({
        error: "Trop de requêtes. Réessaie dans quelques instants.",
        retryAfter: rl.retryAfter,
      });
    }

    if (maxBodyBytes > 0) {
      const declared = Number(req.headers?.["content-length"] || 0);
      if (declared > maxBodyBytes) {
        return res.status(413).json({
          error: `Fichier trop volumineux (max ${Math.round(maxBodyBytes / 1024 / 1024)} Mo).`,
        });
      }
    }

    if (sMaxAge > 0) {
      res.setHeader("Cache-Control", `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}`);
    }

    try {
      return await handler(req, res);
    } catch (err) {
      // Le détail technique part dans les logs Vercel, pas chez l'utilisateur :
      // un message d'erreur brut peut révéler des URL internes ou des versions.
      console.error(`Erreur ${req.url} :`, err);
      if (res.headersSent) return undefined;
      const status = err.statusCode || err.status || 500;
      return res.status(status).json({
        error: err.expose ? err.message : "Service temporairement indisponible. Réessaie plus tard.",
      });
    }
  };
}

/** Erreur destinée à être affichée telle quelle à l'utilisateur. */
export function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  err.expose = true;
  return err;
}
