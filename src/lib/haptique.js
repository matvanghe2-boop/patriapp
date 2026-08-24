/**
 * Retour tactile.
 *
 * Dix millisecondes de vibration, imperceptibles consciemment, font la
 * différence entre une page web installée sur un écran d'accueil et une
 * application. C'est le seul retour dont dispose le pouce quand il valide une
 * saisie sans regarder.
 *
 * TROIS GARDE-FOUS, parce qu'une vibration mal placée est bien plus agaçante
 * qu'une absence de vibration :
 *
 *  · L'API n'existe pas sur iOS ni sur les navigateurs de bureau. On ne teste
 *    donc pas la plateforme, on teste la CAPACITÉ — et on ne fait rien quand
 *    elle manque, sans erreur ni message.
 *  · Le réglage utilisateur (`apparence.haptique`) est lu à l'appel, pas
 *    capturé à l'import : il doit pouvoir se couper en cours de session.
 *  · Les durées sont courtes et hiérarchisées. Une confirmation ne doit pas
 *    vibrer comme une suppression, sinon le retour ne dit plus rien.
 */

/** Durées, en millisecondes. Volontairement toutes sous le seuil de conscience. */
export const MOTIFS = {
  /** Changement d'onglet, ouverture d'un panneau. */
  navigation: 8,
  /** Validation d'une saisie, ajout d'une ligne. */
  validation: 12,
  /** Suppression, action destructive. Deux impulsions : c'est le seul motif
   *  qui doit se remarquer, parce que c'est le seul qu'on peut regretter. */
  suppression: [10, 40, 10],
  /** Seuil de déclenchement atteint (tirer pour rafraîchir). */
  seuil: 6,
};

/** L'appareil sait-il vibrer ? */
export function haptiqueDisponible() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * Déclenche un retour tactile.
 *
 * @param {keyof typeof MOTIFS} motif
 * @param {boolean} actif  Préférence utilisateur ; `false` neutralise l'appel.
 */
export function vibrer(motif = "navigation", actif = true) {
  if (!actif || !haptiqueDisponible()) return false;
  const duree = MOTIFS[motif] ?? MOTIFS.navigation;
  try {
    return navigator.vibrate(duree);
  } catch {
    // Certains navigateurs lèvent quand la page n'a pas encore reçu
    // d'interaction utilisateur. Un retour tactile raté n'est jamais une
    // raison d'interrompre ce que l'utilisateur était en train de faire.
    return false;
  }
}
