import { todayIso, projectMonthly } from "./finance";

/**
 * Objectifs de patrimoine datés — « 150 000 € pour janvier 2032 ».
 *
 * L'application savait projeter (Simulation, Horizon) et mesurer (historique),
 * mais rien ne reliait les deux : il n'existait aucune cible à laquelle
 * comparer la trajectoire. Un objectif daté transforme une courbe en réponse à
 * la seule question qui compte — « est-ce que je suis en avance ou en retard ? »
 *
 * Le suivi repose sur une trajectoire de référence linéaire entre le point de
 * départ (patrimoine au moment où l'objectif est créé) et la cible. C'est
 * volontairement plus simple que la projection composée du Dashboard : une
 * référence doit être lisible et stable, pas optimale.
 */

/** Mois pleins entre deux dates ISO, négatif si la seconde est passée. */
export function moisEntre(depuisIso, jusquIso) {
  const a = new Date(`${depuisIso}T00:00:00`);
  const b = new Date(`${jusquIso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Modèles d'objectifs — coûts d'ordre de grandeur, pas des devis.
 *
 * Le formulaire d'ajout demandait un libellé, un montant et une échéance, tous
 * vides. Fixer une cible suppose pourtant de connaître le prix de ce qu'on
 * vise, et c'est précisément ce qu'on ignore quand on s'y prend pour la
 * première fois : la page blanche est le vrai obstacle, pas la saisie.
 *
 * Les montants sont des fourchettes basses observées en France, arrondies, et
 * modifiables une fois le modèle appliqué — l'objectif est de donner un point
 * de départ crédible, jamais de prétendre à l'exactitude. `moisParDefaut`
 * propose une échéance plausible, elle aussi ajustable.
 */
export const MODELES_OBJECTIFS = [
  {
    id: "permis",
    libelle: "Permis de conduire",
    montant: 1500,
    moisParDefaut: 12,
    detail: "Forfait boîte manuelle, hors heures supplémentaires (souvent nécessaires).",
  },
  {
    id: "installation",
    libelle: "Premier logement",
    montant: 2500,
    moisParDefaut: 24,
    detail: "Dépôt de garantie, premier loyer, frais d'agence et équipement de base.",
  },
  {
    id: "vehicule",
    libelle: "Première voiture",
    montant: 4000,
    moisParDefaut: 36,
    detail: "Occasion fiable, carte grise et première assurance comprises.",
  },
  {
    id: "echange",
    libelle: "Semestre à l'étranger",
    montant: 3000,
    moisParDefaut: 18,
    detail: "Reste à charge courant après bourse de mobilité : voyage, logement, caution.",
  },
  {
    id: "materiel",
    libelle: "Ordinateur / matériel",
    montant: 1200,
    moisParDefaut: 8,
    detail: "Machine correcte tenant toute la durée des études.",
  },
  {
    id: "matelas",
    libelle: "Matelas de sécurité",
    montant: 2000,
    moisParDefaut: 18,
    detail: "De quoi encaisser un imprévu sans toucher au reste ni emprunter.",
  },
];

/** Échéance ISO située `mois` mois après aujourd'hui, calée en fin de mois. */
export function echeanceDansMois(mois, depuis = new Date()) {
  const d = new Date(depuis.getFullYear(), depuis.getMonth() + Number(mois || 0) + 1, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

export function creerObjectif({ libelle, cible, echeance, patrimoineActuel = 0, id }) {
  return {
    id,
    libelle: (libelle || "").trim(),
    cible: Math.max(0, Number(cible) || 0),
    echeance,
    // Figés à la création : sans point de départ daté, « en avance » n'aurait
    // aucun sens — on ne saurait pas de quoi on est parti.
    departDate: todayIso(),
    departValeur: Math.max(0, patrimoineActuel),
  };
}

/**
 * Où devrait se trouver le patrimoine aujourd'hui pour tenir l'objectif,
 * en interpolant linéairement entre le départ et l'échéance.
 */
export function trajectoireAttendue(objectif, aujourdhui = todayIso()) {
  const total = moisEntre(objectif.departDate, objectif.echeance);
  if (total <= 0) return objectif.cible;
  const ecoules = Math.min(total, Math.max(0, moisEntre(objectif.departDate, aujourdhui)));
  const progression = ecoules / total;
  return objectif.departValeur + (objectif.cible - objectif.departValeur) * progression;
}

/**
 * État complet d'un objectif : avancement, avance/retard, effort mensuel
 * restant, et date d'atteinte estimée au rythme d'épargne courant.
 */
export function evaluerObjectif(objectif, { patrimoineActuel = 0, epargneMensuelle = 0, tauxAnnuelPct = 0, aujourdhui = todayIso() } = {}) {
  const cible = objectif.cible || 0;
  const restant = Math.max(0, cible - patrimoineActuel);
  const moisRestants = moisEntre(aujourdhui, objectif.echeance);
  const attendu = trajectoireAttendue(objectif, aujourdhui);
  const ecart = patrimoineActuel - attendu;

  const progressionPct = cible > 0 ? Math.min(100, Math.max(0, (patrimoineActuel / cible) * 100)) : 0;
  const atteint = patrimoineActuel >= cible;
  const echu = moisRestants <= 0;

  // Versement mensuel nécessaire pour combler le reste dans le temps imparti,
  // rendement inclus. Sans temps restant, la question ne se pose plus.
  let effortMensuelRequis = null;
  if (!atteint && moisRestants > 0) {
    const r = (tauxAnnuelPct || 0) / 100 / 12;
    const capitalProjete = patrimoineActuel * Math.pow(1 + r, moisRestants);
    const manque = Math.max(0, cible - capitalProjete);
    const facteur = r === 0 ? moisRestants : (Math.pow(1 + r, moisRestants) - 1) / r;
    effortMensuelRequis = facteur > 0 ? manque / facteur : null;
  }

  // Date d'atteinte au rythme actuel : on avance mois par mois plutôt que de
  // résoudre l'équation, pour rester juste quand l'épargne est nulle ou le
  // rendement négatif. 720 mois (60 ans) fait office de « jamais ».
  let moisJusquAtteinte = null;
  if (!atteint && (epargneMensuelle > 0 || tauxAnnuelPct > 0)) {
    for (let m = 1; m <= 720; m++) {
      if (projectMonthly(patrimoineActuel, tauxAnnuelPct, epargneMensuelle, m) >= cible) {
        moisJusquAtteinte = m;
        break;
      }
    }
  }

  return {
    cible,
    restant,
    moisRestants,
    attendu,
    ecart,
    enAvance: ecart >= 0,
    progressionPct,
    atteint,
    echu,
    effortMensuelRequis,
    moisJusquAtteinte,
    // Écart entre l'échéance voulue et l'atteinte estimée, en mois.
    retardEstimeMois:
      moisJusquAtteinte != null && moisRestants > 0 ? moisJusquAtteinte - moisRestants : null,
  };
}

/** Formate un nombre de mois en « 3 ans et 2 mois ». */
export function formaterDuree(mois) {
  if (mois == null) return "—";
  if (mois <= 0) return "échu";
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  if (ans === 0) return `${reste} mois`;
  if (reste === 0) return `${ans} an${ans > 1 ? "s" : ""}`;
  return `${ans} an${ans > 1 ? "s" : ""} et ${reste} mois`;
}
