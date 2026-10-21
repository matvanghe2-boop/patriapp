import { valeurReleve } from "./finance";

/**
 * Records de patrimoine et objectifs atteints : les dire au moment où ils
 * arrivent.
 *
 * La Timeline enregistrait déjà les nouveaux sommets et les paliers franchis,
 * mais il fallait aller les y chercher. Un nouveau record est pourtant l'un
 * des rares moments où l'application a une bonne nouvelle à annoncer.
 *
 * SANS EN ABUSER : dans un marché qui monte, le patrimoine bat son record
 * presque chaque jour. Un message quotidien deviendrait du bruit qu'on ferme
 * sans lire. Un record n'est donc annoncé que s'il dépasse le dernier record
 * ANNONCÉ d'au moins 1 %, ou si celui-ci date de plus d'une semaine.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const ECART_MIN_RECORD = 0.01;
export const JOURS_ENTRE_RECORDS = 7;

/** Plus haut historique, hors relevé du jour : { valeur, date } ou null. */
export function plusHautHistorique(historique = [], aujourdhui) {
  let meilleur = null;
  for (const p of historique || []) {
    if (!p?.date || p.date >= aujourdhui) continue;
    const v = valeurReleve(p);
    if (v == null) continue;
    if (!meilleur || v > meilleur.valeur) meilleur = { valeur: v, date: p.date };
  }
  return meilleur;
}

const joursEntre = (a, b) =>
  Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

/**
 * Un nouveau record à annoncer, ou `null`.
 *
 * Il faut au moins sept relevés antérieurs : sur trois jours d'historique,
 * chaque hausse serait un « record » qui ne veut rien dire.
 */
export function recordAAnnoncer({ historique = [], patrimoineActuel, dernierAnnonce = null, aujourdhui } = {}) {
  const anterieurs = (historique || []).filter((p) => p?.date && p.date < aujourdhui && valeurReleve(p) != null);
  if (anterieurs.length < 7 || !Number.isFinite(patrimoineActuel)) return null;

  const precedent = plusHautHistorique(historique, aujourdhui);
  if (!precedent || patrimoineActuel <= precedent.valeur) return null;

  if (dernierAnnonce?.date === aujourdhui) return null;
  if (
    dernierAnnonce &&
    patrimoineActuel < dernierAnnonce.valeur * (1 + ECART_MIN_RECORD) &&
    joursEntre(dernierAnnonce.date, aujourdhui) < JOURS_ENTRE_RECORDS
  ) {
    return null;
  }
  return { valeur: patrimoineActuel, precedent };
}

/** Objectifs atteints qui n'ont pas encore été annoncés. */
export function objectifsAAnnoncer(objectifs = [], patrimoineActuel, dejaAnnonces = []) {
  const vus = new Set(dejaAnnonces || []);
  return (objectifs || []).filter((o) => o?.id && o.cible > 0 && patrimoineActuel >= o.cible && !vus.has(o.id));
}
