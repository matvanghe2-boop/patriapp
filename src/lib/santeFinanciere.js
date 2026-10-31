/**
 * Score de santé financière.
 *
 * Quatre critères, chacun noté sur 100 et expliqué — jamais un chiffre seul :
 * un score n'aide que si l'on voit ce qui le fait baisser. Un critère dont la
 * donnée manque (pas de relevé, pas de dépenses connues) est ÉCARTÉ, pas
 * compté zéro : l'absence d'information n'est pas une mauvaise note.
 *
 * Les seuils sont des repères usuels, pas des normes : trois mois de
 * dépenses de côté, 20 % des revenus épargnés, des charges fixes qui ne
 * mangent pas plus du tiers des revenus, aucun jour à découvert.
 */

import { parMois } from "./compteCourant";

const borne = (x) => Math.max(0, Math.min(100, Math.round(x)));
const etat = (score) => (score >= 75 ? "ok" : score >= 40 ? "attention" : "critique");

/** Jours à découvert sur les `jours` derniers jours couverts par la série de soldes. */
export function joursADecouvert(serie, jours = 90) {
  if (!serie?.length) return null;
  const fin = serie[serie.length - 1].date;
  const [a, m, j] = fin.split("-").map(Number);
  const debut = new Date(a, m - 1, j - jours + 1);
  let compte = 0;
  let i = 0;
  let solde = null;
  for (let d = new Date(debut); d <= new Date(a, m - 1, j); d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    while (i < serie.length && serie[i].date <= iso) solde = serie[i++].solde;
    if (solde != null && solde < 0) compte += 1;
  }
  return compte;
}

/**
 * @param {{ matelasMois?: number|null, tauxEpargnePct?: number|null,
 *           partChargesFixes?: number|null, joursDecouvert?: number|null }} mesures
 */
export function scoreSante({
  matelasMois = null, tauxEpargnePct = null, partChargesFixes = null, joursDecouvert = null,
  // Le matelas est-il compté en mois « les plus chers » (voir moisDeReference) ?
  matelasPrudent = false,
} = {}) {
  const criteres = [];

  if (Number.isFinite(matelasMois)) {
    const score = borne((matelasMois / 3) * 100);
    criteres.push({
      id: "matelas",
      libelle: "Matelas de sécurité",
      valeur: `${matelasMois.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois de dépenses${matelasPrudent ? " (tes mois les plus chers)" : ""}`,
      score,
      etat: etat(score),
      explication:
        (score >= 100
          ? "Au moins trois mois de dépenses de côté : un imprévu ne te met pas en difficulté."
          : "Le repère usuel est trois mois de dépenses disponibles sans délai.") +
        (matelasPrudent ? " Compté sur tes mois les plus chers, pas sur un mois moyen." : ""),
    });
  }

  if (Number.isFinite(tauxEpargnePct)) {
    const score = borne((tauxEpargnePct / 20) * 100);
    criteres.push({
      id: "epargne",
      libelle: "Taux d'épargne",
      valeur: `${Math.round(tauxEpargnePct)} % des revenus`,
      score,
      etat: etat(score),
      explication:
        score >= 100
          ? "Tu mets de côté au moins 20 % de ce qui entre."
          : tauxEpargnePct <= 0
            ? "Tu dépenses autant ou plus que ce qui entre."
            : "Le repère usuel est d'épargner 20 % de ses revenus.",
    });
  }

  if (Number.isFinite(partChargesFixes)) {
    // 100 jusqu'à un tiers des revenus, 0 à partir de 70 %.
    const pct = partChargesFixes * 100;
    const score = borne(pct <= 33 ? 100 : ((70 - pct) / (70 - 33)) * 100);
    criteres.push({
      id: "charges",
      libelle: "Charges fixes",
      valeur: `${Math.round(pct)} % des revenus`,
      score,
      etat: etat(score),
      explication:
        score >= 100
          ? "Tes charges fixes laissent l'essentiel de tes revenus libre."
          : "Au-delà d'un tiers des revenus, les charges fixes laissent peu de marge.",
    });
  }

  if (Number.isFinite(joursDecouvert)) {
    const score = borne(100 - joursDecouvert * 10);
    criteres.push({
      id: "decouvert",
      libelle: "Découvert",
      valeur: joursDecouvert === 0 ? "aucun jour sur 90 jours" : `${joursDecouvert} jour${joursDecouvert > 1 ? "s" : ""} sur 90 jours`,
      score,
      etat: etat(score),
      explication:
        joursDecouvert === 0
          ? "Ton compte n'est pas passé sous zéro en fin de journée."
          : "Chaque jour à découvert peut coûter des agios et signale un mois tendu.",
    });
  }

  if (criteres.length === 0) return null;
  const score = borne(criteres.reduce((s, c) => s + c.score, 0) / criteres.length);
  return { score, etat: etat(score), criteres };
}

// ─── Matelas calé sur les vrais mois ─────────────────────────────────────────

const moyenne = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

/**
 * Le mois qui sert d'unité au matelas de sécurité.
 *
 * Trois mois de dépenses MOYENNES protègent mal un budget irrégulier : le mois
 * de la rentrée, des impôts ou d'une réparation, c'est précisément celui où
 * l'on puise dans son épargne. On retient donc la moyenne des `plusChers` mois
 * les plus coûteux des `nbMois` derniers — tant qu'il y en a au moins
 * `minMois`, sans quoi on ne sait pas encore.
 *
 * @returns {null | {centimes, moisObserves, retenus}}
 */
export function moisDeReference(enrichies, { nbMois = 12, plusChers = 3, minMois = 3 } = {}) {
  const flux = parMois(enrichies).slice(-nbMois);
  if (flux.length < minMois) return null;
  const retenus = flux.map((l) => l.sorties).sort((a, b) => b - a).slice(0, plusChers);
  const centimes = moyenne(retenus);
  return centimes > 0 ? { centimes, moisObserves: flux.length, retenus: retenus.length } : null;
}

// ─── Historique de la note ───────────────────────────────────────────────────

export const LIBELLES_CRITERES = {
  matelas: "matelas",
  epargne: "taux d'épargne",
  charges: "charges fixes",
  decouvert: "découvert",
};

/**
 * Enregistre la note du mois en cours : un point par mois, mis à jour tant que
 * le mois dure (la dernière valeur du mois fait foi). Rend l'historique tel
 * quel s'il n'y a rien de nouveau, pour ne rien réécrire.
 */
export function noterMois(historique = [], sante, mois) {
  if (!sante) return historique;
  const liste = Array.isArray(historique) ? historique : [];
  const entree = { mois, score: sante.score, criteres: Object.fromEntries(sante.criteres.map((c) => [c.id, c.score])) };
  const existant = liste.find((e) => e.mois === mois);
  if (existant && existant.score === entree.score && JSON.stringify(existant.criteres) === JSON.stringify(entree.criteres)) {
    return historique;
  }
  return [...liste.filter((e) => e.mois !== mois), entree].sort((a, b) => a.mois.localeCompare(b.mois)).slice(-36);
}

/**
 * Ce qui a bougé depuis le mois précédent : l'écart de note et le critère qui
 * l'explique le plus.
 */
export function evolutionSante(historique = []) {
  const liste = Array.isArray(historique) ? historique : [];
  if (liste.length < 2) return null;
  const actuel = liste[liste.length - 1];
  const precedent = liste[liste.length - 2];
  const ecarts = Object.keys({ ...actuel.criteres, ...precedent.criteres })
    .filter((id) => actuel.criteres?.[id] != null && precedent.criteres?.[id] != null)
    .map((id) => ({ id, libelle: LIBELLES_CRITERES[id] || id, delta: actuel.criteres[id] - precedent.criteres[id] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { precedent: precedent.mois, delta: actuel.score - precedent.score, principal: ecarts[0]?.delta ? ecarts[0] : null };
}
