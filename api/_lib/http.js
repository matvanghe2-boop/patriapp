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

function clientKey(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  return ip || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

// ─── Cache mémoire ───────────────────────────────────────────────────────────
// Évite de retaper Yahoo/Google pour la même requête à quelques secondes
// d'intervalle (rechargement de page, plusieurs onglets ouverts...). Même
// limite que le rate limit : c'est un cache par instance, pas un cache global.
const cacheStore = new Map();
const MAX_CACHE_ENTRIES = 500;

export async function cached(key, ttlMs, producer, now = Date.now()) {
  const hit = cacheStore.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value;
  const value = await producer();
  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    // Éviction FIFO simple : on retire l'entrée la plus ancienne insérée.
    const oldest = cacheStore.keys().next().value;
    cacheStore.delete(oldest);
  }
  cacheStore.set(key, { at: now, value });
  return value;
}

export function _resetCache() {
  cacheStore.clear();
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
 */
export function withApi(handler, options = {}) {
  const {
    methods = ["GET"],
    limit = 60,
    windowMs = 60_000,
    maxBodyBytes = 0,
    sMaxAge = 0,
  } = options;

  return async function wrapped(req, res) {
    const origin = req.headers?.origin;

    if (!isOriginAllowed(origin)) {
      return res.status(403).json({ error: "Origine non autorisée." });
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // L'API n'expose que des données de marché publiques : rien à indexer,
    // rien à embarquer dans une autre page.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (req.method === "OPTIONS") return res.status(204).end();

    if (!methods.includes(req.method)) {
      res.setHeader("Allow", methods.join(", "));
      return res.status(405).json({ error: "Méthode non autorisée." });
    }

    const rl = rateLimit(`${clientKey(req)}:${req.url?.split("?")[0] || ""}`, { limit, windowMs });
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
