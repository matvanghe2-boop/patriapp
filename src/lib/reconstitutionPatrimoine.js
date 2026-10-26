/**
 * Reconstitution de la courbe du patrimoine à partir des relevés.
 *
 * La courbe du Dashboard n'a de points que les jours où l'application a été
 * ouverte, et ces points comptaient le compte courant à sa valeur saisie à la
 * main. Les relevés donnent, eux, le solde du compte courant chaque soir
 * depuis le premier relevé : de quoi recalculer le patrimoine net de chacun
 * de ces jours.
 *
 *   patrimoine(J) = compte courant(J) + portefeuille(J) + livrets(J) − dettes
 *
 *  · compte courant(J) : solde du soir d'après les relevés ;
 *  · portefeuille(J) : le suivi quotidien de PEA & Bourse pour ce jour, ou
 *    le dernier connu dans la semaine qui précède. Sans valeur du
 *    portefeuille, le jour n'est PAS reconstitué — on ne l'invente pas ;
 *  · livrets(J) : le solde actuel, moins les mouvements datés après J ;
 *  · dettes : le montant actuel, faute d'historique.
 *
 * Rien n'est écrit sans aperçu : la fonction renvoie la liste des jours
 * ajoutés ou corrigés, et l'écran la montre avant qu'on confirme. Les points
 * saisis à la main ne sont jamais touchés.
 */
import { compactHistory, uid } from "./finance";
import { montantSigne } from "./livretsMouvements";

const RECUL_PORTEFEUILLE_JOURS = 7;

function lendemain(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, j + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ecartJours = (a, b) => {
  const t = (iso) => {
    const [x, y, z] = iso.split("-").map(Number);
    return Date.UTC(x, y - 1, z) / 86400000;
  };
  return t(b) - t(a);
};

/** Solde des livrets le soir du jour J, reconstruit à rebours depuis aujourd'hui. */
function livretsAuSoir(livrets, jour) {
  return (livrets || []).reduce((total, l) => {
    const apres = (l.mouvements || []).filter((m) => m.date > jour).reduce((s, m) => s + montantSigne(m), 0);
    return total + Math.max(0, (Number(l.balance) || 0) - apres);
  }, 0);
}

/**
 * @param {{
 *   serie: Array<{date, solde}>,      // solde du compte courant (centimes), relevés
 *   bourseHistory?: Array<{date, valeur}>,
 *   portefeuilleVide?: boolean,       // aucun titre ni cash : la valeur est 0, connue
 *   livrets?: Array, dettesTotal?: number, historique?: Array<{date, value, manual?}>,
 *   jusquA?: string,                  // dernier jour à reconstituer (inclus)
 * }} donnees
 * @returns {{ changements: Array<{date, avant, apres}>, sansPortefeuille: number }}
 */
export function reconstituerPatrimoine({
  serie = [],
  bourseHistory = [],
  portefeuilleVide = false,
  livrets = [],
  dettesTotal = 0,
  historique = [],
  jusquA,
}) {
  if (serie.length === 0) return { changements: [], sansPortefeuille: 0 };
  const fin = [serie[serie.length - 1].date, jusquA].filter(Boolean).sort()[0];
  const portefeuille = [...(bourseHistory || [])]
    .filter((p) => p.date && Number.isFinite(p.valeur))
    .sort((a, b) => a.date.localeCompare(b.date));
  const existants = new Map((historique || []).filter((h) => h.date).map((h) => [h.date, h]));

  const changements = [];
  let sansPortefeuille = 0;
  let i = 0;
  let solde = null;
  let k = 0;
  let dernierPortefeuille = null;

  for (let jour = serie[0].date; jour <= fin; jour = lendemain(jour)) {
    while (i < serie.length && serie[i].date <= jour) solde = serie[i++].solde;
    while (k < portefeuille.length && portefeuille[k].date <= jour) dernierPortefeuille = portefeuille[k++];
    if (solde == null) continue;

    let valeurPortefeuille = null;
    if (portefeuilleVide) valeurPortefeuille = 0;
    else if (dernierPortefeuille && ecartJours(dernierPortefeuille.date, jour) <= RECUL_PORTEFEUILLE_JOURS) {
      valeurPortefeuille = dernierPortefeuille.valeur;
    }
    if (valeurPortefeuille == null) {
      sansPortefeuille += 1;
      continue;
    }

    const existant = existants.get(jour);
    if (existant?.manual) continue;
    const apres = Math.round(solde / 100 + valeurPortefeuille + livretsAuSoir(livrets, jour) - dettesTotal);
    const avant = existant ? existant.value : null;
    if (avant != null && Math.abs(avant - apres) < 1) continue;
    changements.push({ date: jour, avant, apres });
  }
  return { changements, sansPortefeuille };
}

/** Applique les changements à l'historique, puis le compacte comme le relevé quotidien. */
export function appliquerReconstitution(historique = [], changements = [], { now = new Date() } = {}) {
  const parDate = new Map(changements.map((c) => [c.date, c]));
  const misAJour = historique.map((h) =>
    parDate.has(h.date) ? { ...h, value: parDate.get(h.date).apres, reconstitue: true } : h
  );
  const connus = new Set(historique.map((h) => h.date));
  const ajouts = changements
    .filter((c) => !connus.has(c.date))
    .map((c) => {
      const [a, m, j] = c.date.split("-").map(Number);
      return {
        id: uid(),
        label: new Date(a, m - 1, j).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        value: c.apres,
        date: c.date,
        reconstitue: true,
      };
    });
  return compactHistory([...misAJour, ...ajouts], { now });
}
