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
export function scoreSante({ matelasMois = null, tauxEpargnePct = null, partChargesFixes = null, joursDecouvert = null } = {}) {
  const criteres = [];

  if (Number.isFinite(matelasMois)) {
    const score = borne((matelasMois / 3) * 100);
    criteres.push({
      id: "matelas",
      libelle: "Matelas de sécurité",
      valeur: `${matelasMois.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois de dépenses`,
      score,
      etat: etat(score),
      explication:
        score >= 100
          ? "Au moins trois mois de dépenses de côté : un imprévu ne te met pas en difficulté."
          : "Le repère usuel est trois mois de dépenses disponibles sans délai.",
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
