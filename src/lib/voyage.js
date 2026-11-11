/**
 * L'argent qui voyage : un versement vers le PEA ou un livret se VOIT partir
 * du compte courant et arriver à destination.
 *
 * Même principe que les moments (moments.js) : le module n'est qu'un relais.
 * Celui qui enregistre le versement l'annonce, la scène
 * (components/ArgentQuiVoyage.jsx) l'écoute. `annoncerVoyage` répond `false`
 * quand personne n'écoute — un composant monté seul dans un test, par
 * exemple — et rien d'autre ne change : le message habituel a déjà dit que le
 * versement était enregistré.
 *
 * @typedef {object} Voyage
 * @property {string} de       D'où part l'argent (« Compte courant »).
 * @property {string} vers     Où il arrive (« PEA », « PEL »…).
 * @property {number} montant  En euros.
 * @property {"bourse"|"livret"} [genre]  Teinte et pictogramme de l'arrivée.
 */
const auditeurs = new Set();

export function ecouterVoyages(f) {
  auditeurs.add(f);
  return () => auditeurs.delete(f);
}

/** @param {Voyage} voyage */
export function annoncerVoyage(voyage) {
  if (auditeurs.size === 0 || !(voyage?.montant > 0)) return false;
  auditeurs.forEach((f) => f(voyage));
  return true;
}

/**
 * Nombre de pièces en vol : plus le versement est gros, plus il y en a, mais
 * sans jamais noyer l'écran — c'est un clin d'œil, pas un décompte.
 */
export function nombreDePiecesEnVol(montant) {
  if (!(montant > 0)) return 0;
  return Math.max(4, Math.min(12, Math.round(3 + Math.log10(montant) * 2)));
}
