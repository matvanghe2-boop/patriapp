/**
 * Annotations de la courbe du patrimoine : les événements de vie que les
 * chiffres ne racontent pas — un premier salaire, l'aide des parents, un
 * déménagement. Saisies à la main, datées, courtes.
 *
 * Elles se posent sur le dernier relevé connu à leur date, comme les
 * opérations (voir `marqueursOperations`) : la courbe n'a de points qu'aux
 * relevés, et une annotation entre deux points doit tomber sur l'un d'eux.
 */

export const LONGUEUR_MAX = 80;

/** Annotation prête à enregistrer, ou `null` si elle est vide ou mal datée. */
export function creerAnnotation({ id, date, texte }) {
  const t = String(texte || "").trim().slice(0, LONGUEUR_MAX);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  return { id, date, texte: t };
}

/**
 * Regroupe les annotations par point de la courbe.
 *
 * @param {object[]} points  Points de la courbe, avec `date`, `cle` et la valeur.
 * @returns {{point, valeur, annotations: object[]}[]}
 */
export function placerAnnotations(annotations = [], points = [], cleValeur = "value") {
  const mesures = (points || []).filter((p) => p?.date && Number.isFinite(p[cleValeur]));
  if (mesures.length === 0) return [];
  const premiere = mesures[0].date;
  const derniere = mesures[mesures.length - 1].date;
  const groupes = new Map();
  for (const a of [...(annotations || [])].sort((x, y) => x.date.localeCompare(y.date))) {
    if (!a?.date || a.date < premiere || a.date > derniere) continue;
    let cible = mesures[0];
    for (const m of mesures) {
      if (m.date <= a.date) cible = m;
      else break;
    }
    if (!groupes.has(cible.cle)) groupes.set(cible.cle, { point: cible, valeur: cible[cleValeur], annotations: [] });
    groupes.get(cible.cle).annotations.push(a);
  }
  return [...groupes.values()];
}

/** Annotations d'une année civile, pour la rétrospective. */
export const annotationsDeLAnnee = (annotations = [], an) =>
  (annotations || []).filter((a) => String(a.date).startsWith(String(an))).sort((x, y) => x.date.localeCompare(y.date));
