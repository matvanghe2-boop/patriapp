/**
 * Horizon — client de l'assistant.
 *
 * Seul point du navigateur qui parle à `/api/advisor`. Il n'envoie que le
 * contexte anonymisé qu'on lui passe : la construction de ce contexte, et donc
 * la garantie de confidentialité, appartient à `anonymiser.js`.
 *
 * Le mode dégradé n'est pas une erreur mais un état prévu : quand aucun
 * fournisseur gratuit n'est joignable, l'appelant retombe sur le simulateur à
 * formulaires, qui n'a besoin d'aucun modèle.
 */

import { supabase, isSupabaseConfigured } from "./supabaseClient";

/**
 * Jeton d'accès de la session courante, s'il y en a une.
 *
 * `/api/advisor` l'exige dès que Supabase est configuré : c'est la seule route
 * dont l'abus consomme le quota du fournisseur de modèle du propriétaire.
 */
async function jetonAcces() {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Réponse normalisée : `modeDegrade` est un état, pas un échec. */
export async function poserQuestion({
  question,
  contexte,
  historique = [],
  // Mode B : doit être déclaré explicitement, sinon le serveur refuse un
  // contexte contenant des montants réels (voir api/advisor.js).
  montantsReels = false,
  signal,
} = {}) {
  const jeton = await jetonAcces();

  let reponse;
  try {
    reponse = await fetch("/api/advisor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      },
      body: JSON.stringify({ question, contexte, historique, montantsReels }),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return {
      modeDegrade: true,
      erreur: "Assistant injoignable. Le simulateur à formulaires reste disponible.",
    };
  }

  let data = null;
  try {
    data = await reponse.json();
  } catch {
    data = null;
  }

  if (reponse.status === 503) {
    return {
      modeDegrade: true,
      erreur: data?.erreur ?? "Aucun fournisseur gratuit disponible pour le moment.",
      echecs: data?.echecs ?? [],
    };
  }

  // 401 : session absente ou expirée. Ce n'est pas une panne de l'assistant,
  // et le message doit dire quoi faire plutôt que « il n'a pas pu répondre ».
  if (reponse.status === 401) {
    return {
      erreur: data?.error ?? "Connecte-toi pour utiliser l'assistant. Les formulaires restent disponibles sans compte.",
      authRequise: true,
    };
  }

  if (!reponse.ok) {
    return { erreur: data?.error ?? data?.erreur ?? "L'assistant n'a pas pu répondre." };
  }

  return data;
}

/**
 * Traduit une valeur en base 100 vers un montant lisible.
 * Le modèle raisonne en points ; l'utilisateur lit des euros.
 */
export function pointsVersEuros(points, facteurBase100) {
  return (points || 0) * (facteurBase100 || 0);
}
