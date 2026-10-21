/**
 * Note de Piotroski : neuf critères de solidité, comparés d'un exercice au
 * précédent (Joseph Piotroski, 2000).
 *
 * Rentabilité (4) : résultat net positif, flux d'exploitation positif,
 * rentabilité des actifs en hausse, flux d'exploitation supérieur au résultat
 * (un bénéfice qui n'est pas que comptable).
 * Structure (3) : endettement à long terme en baisse, liquidité en hausse,
 * pas d'actions nouvelles.
 * Efficacité (2) : marge brute en hausse, rotation des actifs en hausse.
 *
 * Choix de calcul, conformes à la définition d'origine : la rentabilité et la
 * rotation des actifs rapportent l'exercice aux actifs de DÉBUT d'exercice
 * (fin du précédent) ; l'endettement, aux actifs de fin d'exercice. Le
 * critère « pas d'actions nouvelles » est strict : le moindre plan
 * d'actionnariat salarié le fait échouer, comme dans l'article.
 *
 * Un critère dont une donnée manque est « non évaluable » — jamais compté
 * comme réussi ni comme raté. La note se lit alors sur le nombre de critères
 * évalués.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const SEUIL_SOLIDE = 7;
export const SEUIL_FRAGILE = 3;

const nb = (v) => (Number.isFinite(v) ? v : null);
const div = (a, b) => (a != null && b != null && b !== 0 ? a / b : null);

/** `reference` vaut `undefined` pour un critère absolu, sans terme de comparaison. */
function critere(cle, libelle, groupe, valeur, reference, test) {
  const comparatif = reference !== undefined;
  const evaluable = valeur != null && (!comparatif || reference != null);
  return { cle, libelle, groupe, valeur, reference: reference ?? null, ok: evaluable ? test(valeur, reference) : null };
}

/** Note d'un exercice `t`, avec `t1` (précédent) et `t2` (celui d'avant, pour les actifs de début). */
function noteExercice(t, t1, t2) {
  const actifsDebut = nb(t1?.TotalAssets);
  const actifsDebutPrec = nb(t2?.TotalAssets);

  const roa = div(nb(t.NetIncome), actifsDebut);
  const roaPrec = div(nb(t1.NetIncome), actifsDebutPrec);
  const cfo = nb(t.OperatingCashFlow);
  const levier = div(nb(t.LongTermDebt), nb(t.TotalAssets));
  const levierPrec = div(nb(t1.LongTermDebt), nb(t1.TotalAssets));
  const liquidite = div(nb(t.CurrentAssets), nb(t.CurrentLiabilities));
  const liquiditePrec = div(nb(t1.CurrentAssets), nb(t1.CurrentLiabilities));
  const actions = nb(t.OrdinarySharesNumber);
  const actionsPrec = nb(t1.OrdinarySharesNumber);
  const margeBrute = div(nb(t.GrossProfit), nb(t.TotalRevenue));
  const margeBrutePrec = div(nb(t1.GrossProfit), nb(t1.TotalRevenue));
  const rotation = div(nb(t.TotalRevenue), actifsDebut);
  const rotationPrec = div(nb(t1.TotalRevenue), actifsDebutPrec);

  const criteres = [
    critere("roa", "Résultat net positif", "rentabilite", roa, undefined, (v) => v > 0),
    critere("cfo", "Flux d'exploitation positif", "rentabilite", cfo, undefined, (v) => v > 0),
    critere("deltaRoa", "Rentabilité des actifs en hausse", "rentabilite", roa, roaPrec, (v, p) => v > p),
    critere(
      "qualite",
      "Flux d'exploitation supérieur au résultat",
      "rentabilite",
      cfo,
      nb(t.NetIncome),
      (v, p) => v > p
    ),
    // Égalité à zéro des deux côtés (aucune dette longue) : la structure n'a
    // pas empiré, le critère est rempli.
    critere("levier", "Endettement long terme en baisse", "structure", levier, levierPrec, (v, p) => v < p || (v === 0 && p === 0)),
    critere("liquidite", "Liquidité en hausse", "structure", liquidite, liquiditePrec, (v, p) => v > p),
    critere("actions", "Pas d'actions nouvelles", "structure", actions, actionsPrec, (v, p) => v <= p),
    critere("margeBrute", "Marge brute en hausse", "efficacite", margeBrute, margeBrutePrec, (v, p) => v > p),
    critere("rotation", "Rotation des actifs en hausse", "efficacite", rotation, rotationPrec, (v, p) => v > p),
  ];

  const evalues = criteres.filter((c) => c.ok != null);
  return {
    exercice: String(t.exercice).slice(0, 4),
    criteres,
    score: evalues.filter((c) => c.ok).length,
    evalues: evalues.length,
  };
}

/**
 * @param {Array<object>} historique  Exercices publiés (séries Yahoo annuelles).
 * @returns {null | {actuelle, precedente}} la note du dernier exercice et, si
 *          l'historique le permet, celle de l'exercice d'avant.
 */
export function notePiotroski(historique = []) {
  const ex = [...(historique || [])].filter((e) => e?.exercice).sort((a, b) => (a.exercice < b.exercice ? -1 : 1));
  if (ex.length < 2) return null;
  const n = ex.length;
  const actuelle = noteExercice(ex[n - 1], ex[n - 2], ex[n - 3]);
  if (actuelle.evalues === 0) return null;
  const precedente = n >= 3 ? noteExercice(ex[n - 2], ex[n - 3], ex[n - 4]) : null;
  return { actuelle, precedente: precedente?.evalues ? precedente : null };
}

/** Lecture de la note — seulement quand assez de critères ont pu être évalués. */
export function lectureNote({ score, evalues }) {
  if (evalues < 7) return { ton: "neutre", libelle: "trop de données manquantes pour conclure" };
  if (score >= SEUIL_SOLIDE) return { ton: "favorable", libelle: "situation qui s'améliore sur presque tous les plans" };
  if (score <= SEUIL_FRAGILE) return { ton: "defavorable", libelle: "situation qui se dégrade sur la plupart des plans" };
  return { ton: "neutre", libelle: "tableau contrasté" };
}
