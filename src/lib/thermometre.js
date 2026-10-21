/**
 * Thermomètre du marché : trois mesures publiques, chacune avec sa source.
 *
 *  - la VOLATILITÉ attendue sur le S&P 500 (VIX), et son rang sur cinq ans ;
 *  - l'AMPLEUR de la hausse : combien de valeurs du CAC 40 cotent au-dessus de
 *    leur moyenne des 40 dernières semaines, l'équivalent hebdomadaire de la
 *    moyenne à 200 séances ;
 *  - le RECUL des indices depuis leur plus haut des dix dernières années.
 *
 * Pourquoi dix ans en hebdomadaire et pas tout l'historique : sur la période
 * « max », Yahoo réduit la série à un point par mois, voire moins, et le plus
 * haut s'en trouve sous-estimé. Mesuré : sur dix ans, le plus haut
 * hebdomadaire du CAC 40 est à 0,1 % du plus haut quotidien.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const SEMAINES_MOYENNE = 40;

/**
 * Lecture du VIX, selon les paliers d'usage : sous 15, marché calme ; de 15
 * à 20, ordinaire ; de 20 à 30, nerveux ; au-delà, en tension.
 */
export function lectureVix(niveau) {
  if (!Number.isFinite(niveau)) return null;
  if (niveau < 15) return { etat: "calme", libelle: "marché calme" };
  if (niveau < 20) return { etat: "normal", libelle: "nervosité ordinaire" };
  if (niveau < 30) return { etat: "nerveux", libelle: "marché nerveux" };
  return { etat: "tension", libelle: "marché en tension" };
}

/** Part des valeurs d'une série strictement inférieures à `valeur`, en %. */
export function rangPct(valeur, valeurs = []) {
  const v = valeurs.filter(Number.isFinite);
  if (!Number.isFinite(valeur) || v.length === 0) return null;
  return (v.filter((x) => x < valeur).length / v.length) * 100;
}

/**
 * Valeurs au-dessus de leur moyenne mobile.
 * @param {Array<{symbol, series: Array<{close}>}>} historiques
 */
export function ampleur(historiques = [], semaines = SEMAINES_MOYENNE) {
  let auDessus = 0;
  let total = 0;
  for (const h of historiques || []) {
    const closes = (h?.series || []).map((b) => b.close).filter(Number.isFinite);
    if (closes.length < semaines) continue;
    const fenetre = closes.slice(-semaines);
    const moyenne = fenetre.reduce((s, v) => s + v, 0) / semaines;
    total += 1;
    if (closes[closes.length - 1] > moyenne) auDessus += 1;
  }
  return total === 0 ? null : { auDessus, total, pct: (auDessus / total) * 100 };
}

/** Recul du dernier cours depuis le plus haut de la série. */
export function reculDepuisPlusHaut(series = []) {
  const points = (series || []).filter((b) => Number.isFinite(b?.close));
  if (points.length < 2) return null;
  const plusHaut = points.reduce((m, b) => (b.close > m.close ? b : m));
  const dernier = points[points.length - 1];
  return { plusHaut: plusHaut.close, date: plusHaut.date, dernier: dernier.close, reculPct: (dernier.close / plusHaut.close - 1) * 100 };
}
