import { guessEnvelope, ENVELOPE_META } from "./finance";
import { soldeAu, aDesMouvements } from "./livretsMouvements";

/**
 * Le patrimoine découpé par poche, à chaque relevé.
 *
 * La courbe ne montrait qu'un total. Découpée, elle montre COMMENT sa
 * composition évolue — une bourse qui prend de la place, un matelas qui
 * stagne — ce qu'un total ne dit jamais.
 *
 * Chaque poche n'est tracée que là où elle est MESURÉE :
 *  - la bourse, par l'historique du portefeuille ;
 *  - un livret, par ses mouvements datés, à partir du premier — avant, son
 *    solde est inconnu ;
 *  - le reste (livrets non suivis, compte courant, dettes…) est le résidu du
 *    total, et porte ce nom : « Autres ».
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const COULEURS_POCHES = {
  bourse: "#a78bfa",
  autres: "#475569",
};

/** Valeur du portefeuille au dernier relevé daté au plus tard du jour. */
export function valeurPortefeuilleAu(bourseHistory = [], dateIso) {
  let retenu = null;
  for (const p of bourseHistory || []) {
    if (!p?.date || p.date > dateIso || !Number.isFinite(p.valeur)) continue;
    if (!retenu || p.date >= retenu.date) retenu = p;
  }
  return retenu ? retenu.valeur : null;
}

/**
 * Poches suivies (hors bourse et résidu), avec leur clé, leur libellé et leur
 * couleur : une par enveloppe ayant au moins un livret suivi par mouvements.
 */
export function pochesSuivies(livrets = []) {
  const vues = new Map();
  for (const l of livrets || []) {
    if (!aDesMouvements(l)) continue;
    const env = l.envelope || guessEnvelope(l.name);
    if (!vues.has(env)) {
      vues.set(env, {
        cle: `poche_${env}`,
        libelle: ENVELOPE_META[env]?.label || env,
        couleur: ENVELOPE_META[env]?.color || "#2dd4bf",
      });
    }
  }
  return [...vues.values()];
}

/**
 * Ajoute à chaque point { date, value } ses poches : `poche_bourse`,
 * `poche_<enveloppe>` pour les livrets suivis, et `poche_autres`.
 *
 * Renvoie `null` si l'historique du portefeuille manque alors qu'il y a des
 * positions : sans lui, la bourse ne peut pas être isolée, et tout empiler
 * dans « Autres » ferait croire à un patrimoine sans bourse.
 */
export function decouperParPoche(points = [], { bourseHistory = [], livrets = [], aDesPositions = true } = {}) {
  if (aDesPositions && !(bourseHistory || []).some((p) => Number.isFinite(p?.valeur))) return null;

  const suivis = (livrets || [])
    .filter(aDesMouvements)
    .map((l) => ({
      livret: l,
      env: l.envelope || guessEnvelope(l.name),
      depuis: [...l.mouvements].map((m) => m.date).sort()[0],
    }));

  let residuNegatif = false;
  const sortie = points.map((p) => {
    if (!p?.date || !Number.isFinite(p.value)) return p;
    const bourse = aDesPositions ? valeurPortefeuilleAu(bourseHistory, p.date) ?? 0 : 0;
    const poches = {};
    let somme = bourse;
    for (const s of suivis) {
      if (p.date < s.depuis) continue;
      const solde = Math.max(0, soldeAu(s.livret, p.date));
      poches[`poche_${s.env}`] = (poches[`poche_${s.env}`] || 0) + solde;
      somme += solde;
    }
    const autres = p.value - somme;
    if (autres < -1) residuNegatif = true;
    return { ...p, poche_bourse: bourse, ...poches, poche_autres: Math.max(0, autres) };
  });

  return { points: sortie, poches: pochesSuivies(livrets), residuNegatif };
}
