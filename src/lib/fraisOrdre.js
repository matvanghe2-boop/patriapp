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

/**
 * Tranche applicable à un montant.
 *
 * Les courtiers français ne facturent pas un forfait unique mais un barème par
 * PALIER : « 1,99 € jusqu'à 500 €, puis 0,60 % au-delà ». Le modèle plat
 * initial ne savait pas représenter ça, et sous-estimait donc le coût réel de
 * tout ordre dépassant le premier palier.
 *
 * Convention, celle des brochures tarifaires : le tarif d'une tranche
 * s'applique au montant TOTAL de l'ordre, pas à la seule fraction qui dépasse
 * le palier précédent. Un ordre de 600 € au barème ci-dessus coûte donc
 * 0,60 % × 600 = 3,60 €, et non 1,99 € + 0,60 % × 100.
 */
function trancheApplicable(montant, tranches) {
  return (tranches || []).find((t) => t.jusqua == null || montant <= t.jusqua) ?? null;
}

/** Le barème est-il exprimé par paliers ? */
function estParTranches(bareme) {
  return Array.isArray(bareme?.tranches) && bareme.tranches.length > 0;
}

/** Frais facturés pour un ordre d'un montant donné. */
export function fraisPourMontant(montant, bareme = BAREME_DEFAUT) {
  const m = Math.max(0, nombre(montant));
  if (m === 0) return 0;

  if (estParTranches(bareme)) {
    const t = trancheApplicable(m, bareme.tranches);
    if (!t) return 0;
    const fixe = Math.max(0, nombre(t.fixe));
    const pourcent = Math.max(0, nombre(t.pourcent));
    const minimum = Math.max(0, nombre(t.minimum ?? bareme.minimum));
    // Une tranche porte soit un forfait, soit un pourcentage — jamais les deux
    // dans les brochures rencontrées, mais les additionner reste le
    // comportement correct si le cas se présentait.
    return Math.max(minimum, fixe + (m * pourcent) / 100);
  }

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

  if (estParTranches(bareme)) return montantMinimalParTranches(bareme, cible);

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
 * Seuil de rentabilité d'un barème par paliers.
 *
 * Le coût en pourcentage n'y est pas monotone : il décroît à l'intérieur d'une
 * tranche à forfait, puis SAUTE au passage du palier suivant. Chez BoursoBank
 * Découverte, un ordre de 500 € coûte 0,40 % (1,99 € de forfait) et un ordre
 * de 501 € coûte 0,60 % — plus cher en pourcentage pour un euro de plus.
 *
 * On résout donc tranche par tranche et on retient le plus petit montant
 * satisfaisant la cible, plutôt que d'inverser une formule unique qui
 * n'existe pas.
 */
function montantMinimalParTranches(bareme, cible) {
  const candidats = [];
  let debut = 0;

  for (const t of bareme.tranches) {
    const fin = t.jusqua == null ? Infinity : t.jusqua;
    const fixe = Math.max(0, nombre(t.fixe));
    const pourcent = Math.max(0, nombre(t.pourcent));
    const minimum = Math.max(0, nombre(t.minimum ?? bareme.minimum));

    // Plus petit montant de CETTE tranche qui tient la cible.
    let requis = debut;
    if (fixe > 0) {
      if (pourcent >= cible) {
        debut = fin;
        continue; // la part proportionnelle mange déjà la cible
      }
      requis = Math.max(requis, (100 * fixe) / (cible - pourcent));
    } else if (pourcent > cible) {
      debut = fin;
      continue; // taux constant supérieur à la cible : aucun montant n'y arrive
    }
    if (minimum > 0) requis = Math.max(requis, (100 * minimum) / cible);

    // Le montant trouvé doit rester DANS la tranche, sinon c'est la tranche
    // suivante qui s'applique et le calcul ne vaut plus.
    if (requis <= fin) candidats.push(Math.max(requis, debut === 0 ? 0 : debut));
    debut = fin;
  }

  return candidats.length > 0 ? Math.min(...candidats) : null;
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
  const disponible = moisAAccumuler != null ? moisAAccumuler * versement : montantMin;

  // Le montant conseillé n'est PAS forcément tout ce qu'on a accumulé.
  //
  // Avec un barème par paliers, le coût en pourcentage n'est pas monotone : il
  // décroît tant qu'on amortit un forfait, puis saute d'un coup au palier
  // suivant. Chez BoursoBank Découverte, 500 € coûtent 0,40 % et 600 € coûtent
  // 0,60 %. Investir tout ce qu'on a mis de côté serait donc parfois PLUS cher,
  // en proportion, que d'en investir une partie et de garder le reste pour le
  // prochain ordre.
  const montantOrdreConseille = meilleurMontant(bareme, montantMin, disponible);
  const coutAuSeuil = coutEnPourcent(montantOrdreConseille, bareme);

  return {
    montantMin,
    moisAAccumuler,
    montantOrdreConseille,
    // Ce qui reste sur le compte quand le montant optimal est inférieur à ce
    // qu'on a accumulé : ce n'est pas perdu, c'est le début du prochain ordre.
    resteApresOrdre: Math.max(0, disponible - montantOrdreConseille),
    coutSiMensuel,
    coutAuSeuil,
    economiePct: coutSiMensuel != null && coutAuSeuil != null ? coutSiMensuel - coutAuSeuil : null,
  };
}

/**
 * Montant le moins coûteux en pourcentage, entre un plancher et ce dont on
 * dispose.
 *
 * À l'intérieur d'une tranche à forfait, le coût décroît : l'optimum local est
 * donc le haut de la tranche. Dans une tranche au pourcentage, il est constant.
 * Il suffit d'évaluer ces quelques points de rupture plutôt que de balayer
 * tous les montants.
 */
function meilleurMontant(bareme, plancher, disponible) {
  const min = Math.max(0, nombre(plancher));
  const max = Math.max(min, nombre(disponible));
  if (!estParTranches(bareme)) return max;

  const candidats = [max];
  for (const t of bareme.tranches) {
    const fin = t.jusqua == null ? Infinity : t.jusqua;
    if (fin >= min && fin <= max) candidats.push(fin);
  }

  let meilleur = max;
  let coutMeilleur = coutEnPourcent(max, bareme) ?? Infinity;
  for (const c of candidats) {
    const cout = coutEnPourcent(c, bareme);
    if (cout != null && cout < coutMeilleur - 1e-9) {
      coutMeilleur = cout;
      meilleur = c;
    }
  }
  return meilleur;
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
