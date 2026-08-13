/**
 * Barèmes de courtage — catalogue de référence.
 *
 * Même parti pris que `shared/ratesCatalog.js` : des valeurs officielles
 * maintenues à la main, chacune avec sa source et sa date de vérification,
 * plutôt qu'une saisie libre qu'on oublie de tenir à jour. Et comme pour les
 * taux, tout reste modifiable — le catalogue est un point de départ, pas une
 * vérité opposable.
 *
 * ⚠️ À VÉRIFIER SUR UN AVIS D'OPÉRÉ RÉEL. Une brochure tarifaire décrit un
 * barème général ; le montant effectivement prélevé peut différer (offre
 * promotionnelle, palier d'activité, place d'exécution réelle). Le seul chiffre
 * qui fait foi est celui de ton relevé.
 *
 * ─── Pourquoi la place d'exécution compte autant ────────────────────────────
 * C'est le point le moins connu et le plus coûteux. Chez BoursoBank, un ordre
 * sur Euronext Paris coûte 1,99 € jusqu'à 500 € — mais le MÊME ordre sur une
 * autre bourse européenne (Xetra, Borsa Italiana, Bolsa de Madrid) coûte
 * 11,95 €, soit six fois plus. Sur un versement de 300 €, cela fait passer les
 * frais de 0,66 % à 3,98 %.
 *
 * Conséquence directe pour le screener : une valeur allemande ou italienne du
 * STOXX 600 doit être nettement plus attractive qu'une française pour valoir
 * la peine d'être achetée à cette échelle.
 */

/** Marchés distingués par les barèmes, du moins cher au plus cher en général. */
export const MARCHES = [
  { cle: "euronext", label: "Euronext (Paris, Amsterdam, Bruxelles)" },
  { cle: "europeAutres", label: "Autres bourses européennes (Xetra, Milan, Madrid…)" },
  { cle: "usa", label: "Bourses américaines" },
];

export const COURTIERS = [
  {
    id: "boursorama-decouverte",
    courtier: "BoursoBank",
    offre: "Découverte",
    resume: "Offre d'entrée, sans condition d'activité. Aucun droit de garde.",
    source: "Brochure tarifaire BoursoBank, section « Placements financiers »",
    urlSource: "https://www.boursorama.com/content/brochure_tarifaire/boursorama_bt.pdf",
    verifieLe: "2026-08-13",
    droitsDeGardeAnnuels: 0,
    baremes: {
      // « 1,99 € jusqu'à 500 €, puis 0,60 % au-delà »
      euronext: { tranches: [{ jusqua: 500, fixe: 1.99 }, { jusqua: null, pourcent: 0.6 }] },
      // « 11,95 € jusqu'à 4 000 €, puis 0,30 % au-delà »
      europeAutres: { tranches: [{ jusqua: 4000, fixe: 11.95 }, { jusqua: null, pourcent: 0.3 }] },
      // « 6,95 € jusqu'à 6 000 €, puis 0,12 % au-delà »
      usa: { tranches: [{ jusqua: 6000, fixe: 6.95 }, { jusqua: null, pourcent: 0.12 }] },
    },
  },
  {
    id: "boursorama-classic",
    courtier: "BoursoBank",
    offre: "Classic (compte-titres uniquement)",
    resume: "Palier d'activité supérieur. Ne s'applique pas à un PEA.",
    source: "Brochure tarifaire BoursoBank, section « Placements financiers »",
    urlSource: "https://www.boursorama.com/content/brochure_tarifaire/boursorama_bt.pdf",
    verifieLe: "2026-08-13",
    droitsDeGardeAnnuels: 0,
    baremes: {
      // « 5,50 € jusqu'à 1 000 €, puis 0,48 % au-delà (minimum 8,95 €) »
      euronext: { tranches: [{ jusqua: 1000, fixe: 5.5 }, { jusqua: null, pourcent: 0.48, minimum: 8.95 }] },
      europeAutres: { tranches: [{ jusqua: 4000, fixe: 11.95 }, { jusqua: null, pourcent: 0.3 }] },
      usa: { tranches: [{ jusqua: 6000, fixe: 6.95 }, { jusqua: null, pourcent: 0.12 }] },
    },
  },
  {
    id: "personnalise",
    courtier: "Autre courtier",
    offre: "Barème saisi à la main",
    resume: "Forfait et pourcentage libres, pour un courtier absent du catalogue.",
    source: null,
    verifieLe: null,
    droitsDeGardeAnnuels: 0,
    baremes: {
      euronext: { fixe: 2.5, pourcent: 0, minimum: 0 },
      europeAutres: { fixe: 2.5, pourcent: 0, minimum: 0 },
      usa: { fixe: 2.5, pourcent: 0, minimum: 0 },
    },
  },
];

export function courtierParId(id) {
  return COURTIERS.find((c) => c.id === id) ?? null;
}

/**
 * Plafond légal des frais d'un ordre passé en ligne dans un PEA.
 *
 * Introduit par la loi PACTE, il s'impose au barème du courtier : au-delà, le
 * courtier ne peut légalement pas facturer davantage, quelle que soit sa
 * brochure. Utile comme repère de vraisemblance sur un avis d'opéré.
 */
export const PLAFOND_LEGAL_PEA_PCT = 0.5;
