import { useEffect, useState } from "react";

/**
 * Instant de référence STABLE pour un rendu, rafraîchi à intervalle régulier.
 *
 * Plusieurs badges de l'application affichent l'ancienneté d'une donnée
 * (« profil renseigné il y a 132 jours », « cours actualisés il y a 4 jours »).
 * Ils appelaient `Date.now()` directement dans le corps du composant. Deux
 * problèmes, dont le second est le plus visible à l'usage :
 *
 *  1. Le rendu n'est plus PUR : deux rendus successifs sans changement d'état
 *     produisent un résultat différent. C'est ce que signale le compilateur
 *     React (« Cannot call impure function during render »), et c'est ce qui
 *     l'empêche de mémoïser le composant.
 *  2. Le badge ne se met JAMAIS à jour tout seul. Sa valeur ne change qu'au
 *     prochain rendu déclenché par autre chose. Sur une PWA laissée ouverte —
 *     le cas nominal d'un tableau de bord — « actualisé aujourd'hui » restait
 *     affiché le lendemain, et le badge vert censé signaler la fraîcheur des
 *     cours devenait un mensonge.
 *
 * L'instant est donc un état, figé pendant le rendu et avancé par un
 * intervalle. Une minute par défaut : ces badges se comptent en jours, une
 * précision plus fine ne ferait que réveiller l'onglet pour rien.
 *
 * @param {number} intervalleMs Période de rafraîchissement.
 * @returns {number} Horodatage en millisecondes, constant pendant le rendu.
 */
export function useMaintenant(intervalleMs = 60_000) {
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), intervalleMs);
    return () => clearInterval(id);
  }, [intervalleMs]);

  return maintenant;
}

/** Nombre de jours pleins écoulés depuis une date ISO, ou `null` si absente. */
export function joursDepuis(dateIso, maintenant) {
  if (!dateIso) return null;
  const debut = new Date(dateIso).getTime();
  if (!Number.isFinite(debut)) return null;
  return Math.floor((maintenant - debut) / 86400000);
}
