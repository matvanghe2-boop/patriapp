import { valeurReleve } from "./finance";
import { plusHautHistorique } from "./records";

/**
 * L'humeur du pingouin de l'en-tête (public/orbit-header.js, attribut `mood`).
 *
 *  · « record »  — lunettes de soleil : le patrimoine est au-dessus de tout ce
 *    qu'il a été, et la séance ne le fait pas reculer ;
 *  · « hausse »  — sourire : le portefeuille monte aujourd'hui ;
 *  · « baisse »  — sueur : il baisse aujourd'hui ;
 *  · `null`      — le pingouin de tous les jours.
 *
 * C'est de l'ambiance : elle redit, en plus petit, la variation du jour déjà
 * écrite dans l'en-tête. Elle se tait donc dès que l'ambiance n'a pas lieu
 * d'être — effets sobres, animations coupées — et en mode Ghost, où même le
 * SENS d'une variation n'a pas à se lire par-dessus une épaule.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Le patrimoine dépasse-t-il son plus haut historique (hors relevé du jour) ? */
export function estAuPlusHaut({ historique = [], patrimoineActuel, aujourdhui } = {}) {
  if (!Number.isFinite(patrimoineActuel)) return false;
  // Même garde-fou que pour l'annonce d'un record (records.js) : sur trois
  // jours d'historique, chaque hausse serait un « record » qui ne veut rien dire.
  const anterieurs = (historique || []).filter((p) => p?.date && p.date < aujourdhui && valeurReleve(p) != null);
  if (anterieurs.length < 7) return false;
  const precedent = plusHautHistorique(historique, aujourdhui);
  return !!precedent && patrimoineActuel > precedent.valeur;
}

export function humeurPingouin({ ghost = false, vivant = true, auPlusHaut = false, variationJour = null } = {}) {
  if (ghost || !vivant) return null;
  const sens = variationJour?.exploitable && variationJour.montant ? Math.sign(variationJour.montant) : 0;
  if (sens < 0) return "baisse";
  if (auPlusHaut) return "record";
  return sens > 0 ? "hausse" : null;
}
