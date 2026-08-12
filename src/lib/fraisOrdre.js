/**
 * Seuil de rentabilité d'un ordre de bourse.
 *
 * L'application savait déjà mesurer les frais déjà payés (`computeFeeEfficiency`)
 * mais jamais répondre à la question qui se pose AVANT de passer l'ordre :
 * « à partir de quel montant les frais deviennent-ils négligeables ? »
 *
 * C'est la question la plus rentable quand on investit de petites sommes.
 * Chez un courtier à 2,50 € par ordre, investir 100 € coûte 2,5 % — soit plus
 * d'un an de rendement d'un Livret A, perdu à la seconde où l'ordre passe.
 * Attendre d'avoir 500 € ramène ce coût à 0,5 %.
 *
 * Trois barèmes coexistent chez les courtiers, et le calcul les combine :
 *   - un forfait fixe par ordre (`fixe`) ;
 *   - un pourcentage du montant (`pourcent`) ;
 *   - un plancher facturé quoi qu'il arrive (`minimum`).
 */

/** Barème par défaut : un forfait seul, cas le plus courant chez les courtiers en ligne. */
export const BAREME_DEFAUT = { fixe: 2.5, pourcent: 0, minimum: 0 };

/** Part des frais jugée acceptable, en % du montant investi. */
export const COUT_CIBLE_DEFAUT = 0.5;

const nombre = (v, defaut = 0) => (Number.isFinite(Number(v)) ? Number(v) : defaut);

/** Frais facturés pour un ordre d'un montant donné. */
export function fraisPourMontant(montant, bareme = BAREME_DEFAUT) {
  const m = Math.max(0, nombre(montant));
  if (m === 0) return 0;
  const fixe = Math.max(0, nombre(bareme?.fixe));
  const pourcent = Math.max(0, nombre(bareme?.pourcent));
  const minimum = Math.max(0, nombre(bareme?.minimum));
  return Math.max(minimum, fixe + (m * pourcent) / 100);
}

/** Coût d'un ordre en % du montant investi. */
export function coutEnPourcent(montant, bareme = BAREME_DEFAUT) {
  const m = Math.max(0, nombre(montant));
  if (m <= 0) return null;
  return (fraisPourMontant(m, bareme) / m) * 100;
}

/**
 * Montant minimal d'un ordre pour que les frais ne dépassent pas `coutCible` %.
 *
 * Renvoie `null` quand aucun montant ne peut y parvenir : c'est le cas si la
 * part proportionnelle du barème atteint déjà la cible à elle seule, auquel cas
 * attendre plus longtemps n'améliore rien — l'information utile est justement
 * qu'il n'y a pas de seuil à attendre.
 */
export function montantMinimal(bareme = BAREME_DEFAUT, coutCible = COUT_CIBLE_DEFAUT) {
  const cible = nombre(coutCible);
  if (cible <= 0) return null;

  const fixe = Math.max(0, nombre(bareme?.fixe));
  const pourcent = Math.max(0, nombre(bareme?.pourcent));
  const minimum = Math.max(0, nombre(bareme?.minimum));

  // Aucun frais : n'importe quel montant convient.
  if (fixe === 0 && pourcent === 0 && minimum === 0) return 0;

  const seuils = [];

  // Contrainte du forfait : (fixe + M·p/100) / M ≤ c/100  ⟺  M ≥ 100·fixe / (c − p)
  if (fixe > 0) {
    if (pourcent >= cible) return null; // la part proportionnelle mange déjà la cible
    seuils.push((100 * fixe) / (cible - pourcent));
  } else if (pourcent > 0 && pourcent > cible) {
    return null;
  }

  // Contrainte du plancher : minimum / M ≤ c/100  ⟺  M ≥ 100·minimum / c
  if (minimum > 0) seuils.push((100 * minimum) / cible);

  return seuils.length > 0 ? Math.max(...seuils) : 0;
}

/**
 * Cadence conseillée : nombre de mois d'épargne à accumuler avant de passer un
 * ordre, et ce que cela représente concrètement.
 *
 * @returns {{montantMin: number|null, moisAAccumuler: number|null, coutSiMensuel: number|null,
 *            coutAuSeuil: number|null, economiePct: number|null}}
 */
export function cadenceConseillee({
  bareme = BAREME_DEFAUT,
  versementMensuel = 0,
  coutCible = COUT_CIBLE_DEFAUT,
} = {}) {
  const versement = Math.max(0, nombre(versementMensuel));
  const montantMin = montantMinimal(bareme, coutCible);

  const coutSiMensuel = versement > 0 ? coutEnPourcent(versement, bareme) : null;

  if (montantMin == null) {
    return { montantMin: null, moisAAccumuler: null, coutSiMensuel, coutAuSeuil: null, economiePct: null };
  }

  const moisAAccumuler = versement > 0 ? Math.max(1, Math.ceil(montantMin / versement)) : null;
  // Le coût réel au seuil se mesure sur le montant effectivement accumulé
  // (un multiple entier du versement), pas sur le seuil théorique.
  const montantEffectif = moisAAccumuler != null ? moisAAccumuler * versement : montantMin;
  const coutAuSeuil = coutEnPourcent(montantEffectif, bareme);

  return {
    montantMin,
    moisAAccumuler,
    coutSiMensuel,
    coutAuSeuil,
    economiePct: coutSiMensuel != null && coutAuSeuil != null ? coutSiMensuel - coutAuSeuil : null,
  };
}

/**
 * Frais annuels comparés selon la cadence, pour rendre l'arbitrage tangible :
 * douze petits ordres contre quelques gros, sur la même somme investie.
 */
export function fraisAnnuelsSelonCadence(versementMensuel, bareme = BAREME_DEFAUT) {
  const versement = Math.max(0, nombre(versementMensuel));
  if (versement <= 0) return [];

  return [1, 2, 3, 6, 12].map((mois) => {
    const ordresParAn = 12 / mois;
    const montantParOrdre = versement * mois;
    const fraisAnnuels = fraisPourMontant(montantParOrdre, bareme) * ordresParAn;
    const investiParAn = versement * 12;
    return {
      moisEntreOrdres: mois,
      ordresParAn,
      montantParOrdre,
      fraisAnnuels,
      partDesVersementsPct: investiParAn > 0 ? (fraisAnnuels / investiParAn) * 100 : 0,
    };
  });
}
