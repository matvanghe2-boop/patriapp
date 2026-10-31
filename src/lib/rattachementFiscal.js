/**
 * Rattaché au foyer de ses parents, ou déclaration séparée ?
 *
 * Estimation SIMPLIFIÉE de l'impôt sur le revenu des deux foyers dans les
 * trois cas possibles, pour un jeune majeur aidé par ses parents :
 *  · RATTACHÉ — ses revenus rejoignent ceux de ses parents, qui gagnent une
 *    demi-part (une part entière à partir du troisième enfant) ;
 *  · SÉPARÉ AVEC PENSION — il déclare seul ; ses parents déduisent l'aide
 *    versée (dans la limite légale) et lui la déclare comme pension reçue ;
 *  · SÉPARÉ SANS PENSION — il déclare seul et l'aide n'est pas déduite.
 * Rattachement et déduction d'une pension s'excluent pour un même enfant.
 *
 * Hors calcul : réductions et crédits d'impôt, revenus du capital (taxés à
 * part), exonération des jobs étudiants (à retrancher des salaires saisis),
 * contribution sur les hauts revenus, parents séparés qui déclarent chacun.
 * Le résultat sert à repérer la piste intéressante ; le simulateur officiel
 * tranche.
 */

/**
 * Paramètres de l'impôt 2026 sur les revenus 2025 (loi de finances pour 2026,
 * seuils revalorisés de 0,9 %).
 */
export const PARAMETRES_IMPOT = {
  anneeRevenus: 2025,
  // Barème par part : [plafond de la tranche, taux].
  tranches: [
    [11600, 0],
    [29579, 0.11],
    [84577, 0.3],
    [181917, 0.41],
    [Infinity, 0.45],
  ],
  // Avantage maximal par demi-part de quotient familial.
  plafondDemiPart: 1807,
  // Parent isolé (case T) : la part du premier enfant est plafonnée à part.
  plafondParentIsole: 4262,
  decote: { seul: 897, couple: 1483, taux: 0.4525 },
  abattementSalaires: { taux: 0.1, min: 509, max: 14556 },
  // Pensions reçues : abattement de 10 % (le minimum par pensionné, de l'ordre
  // de 450 €, est négligé : la pension d'un enfant le dépasse presque toujours).
  abattementPensions: 0.1,
  // Pension déductible par enfant majeur, et forfait sans justificatif quand
  // il vit chez ses parents (logement et nourriture).
  pensionMax: 6855,
  forfaitHebergement: 4075,
  // En dessous, l'impôt n'est pas mis en recouvrement.
  seuilRecouvrement: 61,
};

const P = PARAMETRES_IMPOT;
const arrondi = (n) => Math.round(n);

/** Impôt du barème pour un revenu par part. */
export function impotParPart(revenuParPart) {
  let impot = 0;
  let bas = 0;
  for (const [haut, taux] of P.tranches) {
    if (revenuParPart <= bas) break;
    impot += (Math.min(revenuParPart, haut) - bas) * taux;
    bas = haut;
  }
  return impot;
}

/**
 * Parts du foyer : 2 pour un couple marié ou pacsé, 1 sinon ; une demi-part
 * pour chacun des deux premiers enfants, une part à partir du troisième ; une
 * demi-part de plus au parent qui élève seul ses enfants (case T).
 */
export function nombreParts({ couple = true, parentIsole = false, enfants = 0 } = {}) {
  const n = Math.max(0, Math.floor(enfants));
  let parts = couple ? 2 : 1;
  parts += Math.min(n, 2) * 0.5 + Math.max(n - 2, 0);
  if (!couple && parentIsole && n > 0) parts += 0.5;
  return parts;
}

/** Revenu imposable de salaires, après la déduction forfaitaire de 10 %. */
export function salairesImposables(salaires) {
  const s = Math.max(0, Number(salaires) || 0);
  if (s === 0) return 0;
  const { taux, min, max } = P.abattementSalaires;
  return Math.max(0, s - Math.min(Math.max(s * taux, min), max));
}

/**
 * Impôt d'un foyer : barème, plafonnement du quotient familial, décote et
 * seuil de recouvrement.
 */
export function impotFoyer({ revenu = 0, couple = true, parentIsole = false, enfants = 0 } = {}) {
  const r = Math.max(0, Number(revenu) || 0);
  const parts = nombreParts({ couple, parentIsole, enfants });
  const partsBase = couple ? 2 : 1;
  const avecParts = impotParPart(r / parts) * parts;
  const sansEnfants = impotParPart(r / partsBase) * partsBase;
  // Avantage plafonné : 1 807 € par demi-part, sauf la part du premier enfant
  // d'un parent isolé (4 262 € pour ses deux demi-parts).
  const demiParts = (parts - partsBase) * 2;
  const isole = !couple && parentIsole && enfants > 0;
  const plafond = isole ? P.plafondParentIsole + (demiParts - 2) * P.plafondDemiPart : demiParts * P.plafondDemiPart;
  const brut = Math.max(avecParts, sansEnfants - plafond);
  const plafonne = brut > avecParts + 0.5;

  const { seul, couple: forfaitCouple, taux } = P.decote;
  const forfait = couple ? forfaitCouple : seul;
  const decote = brut < forfait / taux ? Math.min(brut, Math.max(0, forfait - taux * brut)) : 0;
  let net = Math.max(0, brut - decote);
  if (net < P.seuilRecouvrement) net = 0;
  return { revenu: arrondi(r), parts, brut: arrondi(brut), decote: arrondi(decote), net: arrondi(net), plafonne };
}

/**
 * Peut-on être rattaché ? Moins de 21 ans au 1er janvier de l'année des
 * revenus, ou moins de 25 ans pour un étudiant.
 */
export function rattachementPossible({ age, etudiant = false } = {}) {
  const a = Number(age);
  if (!Number.isFinite(a) || a < 18) return { possible: true, motif: null };
  if (a < 21) return { possible: true, motif: null };
  if (etudiant && a < 25) return { possible: true, motif: null };
  return {
    possible: false,
    motif: etudiant
      ? "Le rattachement s'arrête à 25 ans pour un étudiant."
      : "Le rattachement s'arrête à 21 ans, ou 25 ans pour un étudiant.",
  };
}

/**
 * Compare les trois façons de déclarer.
 *
 * @param parents {revenu (revenu net imposable du foyer, sans ta pension), couple, parentIsole, autresEnfants}
 * @param jeune {salaires (salaires imposables bruts de la déduction de 10 %), aide (aide versée par les parents sur l'année), age, etudiant}
 */
export function comparerRattachement({ parents = {}, jeune = {} } = {}) {
  const situation = { couple: parents.couple !== false, parentIsole: !!parents.parentIsole };
  const autres = Math.max(0, Math.floor(Number(parents.autresEnfants) || 0));
  const revenuParents = Math.max(0, Number(parents.revenu) || 0);
  const salaires = salairesImposables(jeune.salaires);
  const aide = Math.max(0, Number(jeune.aide) || 0);
  const pension = Math.min(aide, P.pensionMax);

  const scenarios = [];

  const eligibilite = rattachementPossible(jeune);
  if (eligibilite.possible) {
    const foyer = impotFoyer({ ...situation, enfants: autres + 1, revenu: revenuParents + salaires });
    scenarios.push({ id: "rattache", libelle: "Rattaché à tes parents", parents: foyer, jeune: null, total: foyer.net });
  }

  const parentsSansToi = (revenu) => impotFoyer({ ...situation, enfants: autres, revenu });
  if (pension > 0) {
    const p = parentsSansToi(revenuParents - pension);
    const j = impotFoyer({ couple: false, revenu: salaires + pension * (1 - P.abattementPensions) });
    scenarios.push({ id: "pension", libelle: "Déclaration séparée, aide déduite en pension", parents: p, jeune: j, total: p.net + j.net, pension });
  }
  const p = parentsSansToi(revenuParents);
  const j = impotFoyer({ couple: false, revenu: salaires });
  scenarios.push({ id: "separe", libelle: "Déclaration séparée, sans pension", parents: p, jeune: j, total: p.net + j.net });

  const tries = [...scenarios].sort((a, b) => a.total - b.total);
  const meilleur = tries[0];
  return {
    scenarios,
    meilleur: meilleur.id,
    // Écart avec la deuxième meilleure option : l'enjeu réel du choix.
    ecart: tries.length > 1 ? tries[1].total - meilleur.total : 0,
    eligibilite,
    aidePlafonnee: aide > P.pensionMax,
  };
}
