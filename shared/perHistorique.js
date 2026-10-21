/**
 * PER dans le temps : à quel prix le marché a-t-il payé ce bénéfice, mois
 * après mois ?
 *
 * La fiche situait déjà le PER d'aujourd'hui face à la moyenne de quatre
 * exercices — quatre points. Le mois par mois montre le CHEMIN : un titre
 * peut être « dans sa moyenne » après une bulle et une purge, ou n'avoir
 * jamais été aussi cher. C'est la question qu'on se pose avant d'acheter.
 *
 * DÉFINITION, affichée à l'écran : cours de clôture du mois ÷ bénéfice par
 * action dilué du dernier exercice CLOS à cette date. Le bénéfice d'un
 * exercice est donc appliqué dès la clôture, quelques semaines avant sa
 * publication — c'est la convention des PER « sur exercice », et elle évite
 * d'inventer une date de publication qu'on ne connaît pas.
 *
 * Un exercice en perte (BPA ≤ 0) n'a pas de PER : les mois concernés sont
 * laissés vides plutôt que d'afficher un PER négatif, qui ne se lit pas.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/**
 * @param {Array<{date: string, close: number}>} clotures  Clôtures mensuelles.
 * @param {Array<{exercice: string, DilutedEPS: number}>} historique  Exercices publiés.
 * @returns {Array<{date, per, bpa, exercice}>}
 */
export function seriePerMensuelle(clotures = [], historique = []) {
  const exercices = (historique || [])
    .filter((e) => e?.exercice && Number.isFinite(e.DilutedEPS))
    .sort((a, b) => (a.exercice < b.exercice ? -1 : 1));
  if (exercices.length === 0) return [];

  const sortie = [];
  for (const c of [...(clotures || [])].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (!Number.isFinite(c?.close) || c.close <= 0) continue;
    // Dernier exercice clos à cette date.
    let retenu = null;
    for (const e of exercices) {
      if (e.exercice <= c.date) retenu = e;
      else break;
    }
    if (!retenu) continue;
    const bpa = retenu.DilutedEPS;
    sortie.push({
      date: c.date,
      cours: c.close,
      per: bpa > 0 ? c.close / bpa : null,
      bpa,
      exercice: retenu.exercice,
    });
  }
  return sortie;
}

/**
 * Le cours face à la valeur que ses bénéfices justifient au PER moyen.
 *
 * `justifiee` = BPA du dernier exercice clos × PER moyen observé : une marche
 * d'escalier qui monte avec les bénéfices. Le cours au-dessus, le marché paie
 * plus cher que d'habitude ; en dessous, moins cher.
 *
 * Prolongement par le CONSENSUS : aux dates de clôture des deux exercices que
 * les analystes chiffrent, le BPA attendu × le même PER moyen. Rien au-delà :
 * la source n'en publie pas, et l'extrapoler serait inventer.
 *
 * @param {Array} serie  sortie de `seriePerMensuelle`
 * @param {number} perMoyen
 * @param {Array<{exercice: string, bpaEstime: number}>} consensus
 */
export function serieCoursBenefices(serie = [], perMoyen, consensus = []) {
  if (!(perMoyen > 0) || !serie?.length) return [];
  const points = serie.map((p) => ({
    date: p.date,
    cours: p.cours,
    justifiee: p.bpa > 0 ? p.bpa * perMoyen : null,
  }));
  const dernier = points[points.length - 1];
  const futurs = (consensus || [])
    .filter((c) => c?.exercice && c.exercice > dernier.date && c.bpaEstime > 0)
    .sort((a, b) => (a.exercice < b.exercice ? -1 : 1))
    .map((c) => ({ date: c.exercice, attendue: c.bpaEstime * perMoyen }));
  if (futurs.length === 0) return points;
  // Le dernier point réel porte aussi la série « attendue », pour que la
  // ligne pointillée parte du présent au lieu de flotter.
  return [...points.slice(0, -1), { ...dernier, attendue: dernier.justifiee }, ...futurs];
}

/**
 * Lecture de la série : moyenne, extrêmes, et où se situe le dernier point.
 *
 * `rangActuelPct` : part des mois où le PER était PLUS BAS qu'aujourd'hui.
 * 80 se lit « plus cher que 80 % des mois observés ».
 */
export function lirePerHistorique(serie = []) {
  const valeurs = (serie || []).map((p) => p.per).filter((v) => Number.isFinite(v));
  if (valeurs.length < 6) return null;
  const moyenne = valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
  const actuel = [...serie].reverse().find((p) => Number.isFinite(p.per))?.per ?? null;
  const plusBas = valeurs.filter((v) => v < actuel).length;
  return {
    moyenne,
    min: Math.min(...valeurs),
    max: Math.max(...valeurs),
    actuel,
    nbMois: valeurs.length,
    rangActuelPct: actuel == null ? null : (plusBas / valeurs.length) * 100,
    ecartMoyennePct: actuel == null ? null : ((actuel - moyenne) / moyenne) * 100,
  };
}
