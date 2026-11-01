/**
 * Ouvrir un papier ou un objet du coffre depuis ailleurs dans Patrium : la
 * palette de commandes (Ctrl+K), un contrat d'Abonnements.
 *
 * L'identifiant ne peut pas voyager dans l'URL : `useHashRoute` normalise le
 * hash et retire tout ce qui suit le sous-onglet. La demande passe donc par ce
 * petit canal en mémoire. On la dépose, puis on navigue vers le coffre :
 *
 *  · si l'onglet est déjà affiché, il la reçoit aussitôt (abonnement) ;
 *  · sinon, il la prend en s'ouvrant (`prendreDemande` à l'initialisation) ;
 *  · coffre verrouillé : elle attend qu'il s'ouvre.
 *
 * Une seule demande à la fois : la dernière l'emporte.
 */

let demande = null;
const abonnes = new Set();

/** @param {{ document?: string, objet?: string }} cible */
export function demanderOuverture(cible) {
  demande = cible;
  abonnes.forEach((f) => f());
}

/** Rend la demande en attente et la retire, ou `null`. */
export function prendreDemande() {
  const d = demande;
  demande = null;
  return d;
}

export function abonnerDemandes(fonction) {
  abonnes.add(fonction);
  return () => abonnes.delete(fonction);
}
