// Vérification d'identité pour les routes coûteuses.
//
// Les routes de cotation interrogent Yahoo : elles sont gratuites, et un abus
// ne coûte que de la bande passante. `/api/advisor`, lui, déclenche jusqu'à
// douze appels au fournisseur de modèle par question. Sans contrôle, n'importe
// qui pouvait épuiser le quota Gemini du propriétaire — et le contrôle
// d'origine ne l'en empêchait pas : `isOriginAllowed` laisse passer une requête
// sans en-tête `Origin`, ce qui est le cas nominal d'un appel same-origin
// depuis le navigateur… mais aussi celui d'un simple `curl`.
//
// Le jeton d'accès Supabase est vérifié auprès de Supabase lui-même plutôt que
// décodé localement : pas de secret JWT à stocker, pas de vérification de
// signature à réimplémenter, et une révocation (déconnexion, suppression de
// compte) prend effet immédiatement.

import { httpError } from "./http.js";

/**
 * Ces variables portent le préfixe VITE_ car le client en a besoin aussi ; côté
 * serveur, Vercel les expose sous le même nom. La clé anonyme suffit pour
 * l'endpoint `/auth/v1/user`, qui n'authentifie que le porteur du jeton.
 */
function configSupabase(env = process.env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function estAuthRequise(env = process.env) {
  return Boolean(configSupabase(env));
}

/**
 * Vérifie le jeton porteur de la requête et renvoie l'utilisateur.
 *
 * Si Supabase n'est pas configuré, l'application tourne en mode local pur :
 * il n'y a pas de compte, donc rien à vérifier. Exiger une authentification
 * dans ce cas rendrait l'assistant inutilisable en installation locale, alors
 * que le déploiement public — le seul exposé — est toujours configuré.
 *
 * @returns {Promise<{id: string, email?: string} | null>} null en mode local.
 */
export async function exigerUtilisateur(req, env = process.env, fetchImpl = fetch) {
  const config = configSupabase(env);
  if (!config) return null;

  const entete = req.headers?.authorization || req.headers?.Authorization || "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7).trim() : "";
  if (!jeton) throw httpError(401, "Authentification requise.");

  let reponse;
  try {
    reponse = await fetchImpl(`${config.url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jeton}`, apikey: config.anonKey },
    });
  } catch {
    // Supabase injoignable : on refuse plutôt que d'ouvrir la route. Une panne
    // du fournisseur d'identité ne doit pas se traduire par un accès libre.
    throw httpError(503, "Vérification d'identité indisponible. Réessaie plus tard.");
  }

  if (!reponse.ok) throw httpError(401, "Session expirée ou invalide. Reconnecte-toi.");

  const utilisateur = await reponse.json().catch(() => null);
  if (!utilisateur?.id) throw httpError(401, "Session invalide.");

  return { id: utilisateur.id, email: utilisateur.email };
}
