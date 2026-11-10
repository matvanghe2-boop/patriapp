/**
 * Moments patrimoniaux : un record, un palier rond, un objectif atteint, un
 * dividende encaissé.
 *
 * Ils étaient annoncés par le même toast qu'une suppression annulable. Ce sont
 * pourtant les seuls instants réjouissants d'une application de patrimoine, et
 * ils n'arrivent que quelques fois par an : ils ont droit à leur propre scène
 * (components/Moments.jsx), jouée une seule fois chacun.
 *
 * Le module n'est qu'un relais : celui qui détecte le moment l'annonce, la
 * scène l'écoute. `annoncerMoment` répond `false` quand personne n'écoute
 * (un composant monté seul dans un test, par exemple) : l'appelant garde
 * alors son toast d'origine.
 *
 * @typedef {object} Moment
 * @property {"record"|"palier"|"objectif"|"dividende"} type
 * @property {string} titre      Ce qui s'est passé, en une ligne.
 * @property {number} [valeur]   Le montant à mettre en vedette.
 * @property {string} [detail]   Une phrase de contexte.
 * @property {string} message    Le texte complet, pour le toast de repli et les lecteurs d'écran.
 */
const auditeurs = new Set();

export function ecouterMoments(f) {
  auditeurs.add(f);
  return () => auditeurs.delete(f);
}

/** @param {Moment} moment */
export function annoncerMoment(moment) {
  if (auditeurs.size === 0) return false;
  auditeurs.forEach((f) => f(moment));
  return true;
}

/**
 * Paliers ronds du patrimoine net. Assez rapprochés au début, où chaque
 * dizaine de milliers est une étape, puis de plus en plus espacés.
 */
export const PALIERS = [
  10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000, 500_000, 750_000,
  1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000,
];

/** Le plus haut palier atteint par une valeur (0 sous le premier). */
export function palierAtteint(valeur) {
  let p = 0;
  for (const seuil of PALIERS) if (valeur >= seuil) p = seuil;
  return p;
}
