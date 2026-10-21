/**
 * Comptes et cotation dans deux monnaies différentes.
 *
 * TotalEnergies et STMicroelectronics cotent en euros et publient leurs
 * comptes en dollars ; les sociétés de Londres cotent en pence et publient en
 * livres. Diviser un cours en euros par un bénéfice par action en dollars
 * donnait un PER historique faux d'autant que le taux de change — et cent fois
 * trop petit à Londres.
 *
 * Le facteur ramène un montant des comptes dans la monnaie de cotation, au
 * taux du JOUR : appliqué à des exercices passés, il laisse l'effet de change
 * d'une année sur l'autre, ce que l'écran dit. C'est sans commune mesure avec
 * l'erreur qu'il corrige.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Sous-unités : pence, cents sud-africains, agorot. */
const SOUS_UNITES = { GBp: ["GBP", 100], GBX: ["GBP", 100], ZAc: ["ZAR", 100], ILA: ["ILS", 100] };

export function uniteMonetaire(devise) {
  const s = SOUS_UNITES[devise];
  return s ? { base: s[0], diviseur: s[1] } : { base: devise, diviseur: 1 };
}

/** Devises dont il faut le taux pour convertir `de` vers `vers` (EUR exclu). */
export function devisesNecessaires(de, vers) {
  if (!de || !vers) return [];
  const a = uniteMonetaire(de).base;
  const b = uniteMonetaire(vers).base;
  if (a === b) return [];
  return [a, b].filter((d) => d !== "EUR");
}

/**
 * Facteur à appliquer à un montant en `de` pour l'exprimer en `vers`.
 *
 * Devise des comptes inconnue (fonds, données incomplètes) : 1, comme avant —
 * on ne sait pas qu'il faudrait convertir. Taux manquant alors qu'il faut
 * convertir : `null`, et l'appelant n'affiche rien plutôt qu'un chiffre faux.
 *
 * @param {object} versEuro  { USD: 0.92, … } euros par unité de devise
 */
export function facteurConversion(de, vers, versEuro = {}) {
  if (!de || !vers) return 1;
  const a = uniteMonetaire(de);
  const b = uniteMonetaire(vers);
  if (a.base === b.base) return b.diviseur / a.diviseur;
  const ta = a.base === "EUR" ? 1 : versEuro?.[a.base];
  const tb = b.base === "EUR" ? 1 : versEuro?.[b.base];
  if (!Number.isFinite(ta) || !Number.isFinite(tb) || tb === 0) return null;
  return ta / a.diviseur / (tb / b.diviseur);
}
