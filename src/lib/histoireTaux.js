/**
 * Histoire des taux réglementés.
 *
 * Le sous-onglet Taux donne le taux du jour. Il ne dit pas si le Livret A sort
 * d'un plus haut de quinze ans ou d'un plancher — et c'est précisément ce qui
 * décide s'il faut y laisser son matelas ou le déplacer.
 *
 * C'est la même idée que les ratios historiques du screener, appliquée à
 * l'épargne réglementée : la valeur du jour REPLACÉE DANS SA SÉRIE, parce
 * qu'un chiffre seul ne se juge pas.
 *
 * ── POURQUOI UNE TABLE ÉCRITE À LA MAIN ───────────────────────────────────
 *
 * Ces taux sont fixés par arrêté, quelques fois par an, et publiés. Ils ne se
 * « récupèrent » pas en direct : la Banque de France expose les taux courants,
 * pas leur historique complet, et aucune source gratuite ne le sert
 * proprement. Les figer ici est donc la solution honnête — et le coût de
 * maintenance est réel mais minuscule : deux lignes à ajouter par an.
 *
 * Chaque entrée est la date d'ENTRÉE EN VIGUEUR. Le taux court jusqu'à
 * l'entrée suivante.
 */

/** Livret A — taux en vigueur depuis 2009. */
export const LIVRET_A = [
  { date: "2009-02-01", taux: 2.5 },
  { date: "2009-05-01", taux: 1.75 },
  { date: "2009-08-01", taux: 1.25 },
  { date: "2010-08-01", taux: 1.75 },
  { date: "2011-02-01", taux: 2.0 },
  { date: "2011-08-01", taux: 2.25 },
  { date: "2013-02-01", taux: 1.75 },
  { date: "2013-08-01", taux: 1.25 },
  { date: "2014-08-01", taux: 1.0 },
  { date: "2015-08-01", taux: 0.75 },
  { date: "2020-02-01", taux: 0.5 },
  { date: "2022-02-01", taux: 1.0 },
  { date: "2022-08-01", taux: 2.0 },
  { date: "2023-02-01", taux: 3.0 },
  { date: "2025-02-01", taux: 2.4 },
  { date: "2025-08-01", taux: 1.7 },
];

/** LEP — plus volatil, indexé sur l'inflation. */
export const LEP = [
  { date: "2020-02-01", taux: 1.0 },
  { date: "2022-02-01", taux: 2.2 },
  { date: "2022-08-01", taux: 4.6 },
  { date: "2023-02-01", taux: 6.1 },
  { date: "2023-08-01", taux: 6.0 },
  { date: "2024-02-01", taux: 5.0 },
  { date: "2024-08-01", taux: 4.0 },
  { date: "2025-02-01", taux: 3.5 },
  { date: "2025-08-01", taux: 2.7 },
];

export const SERIES = {
  "livret-a": { libelle: "Livret A", serie: LIVRET_A },
  lep: { libelle: "LEP", serie: LEP },
};

/**
 * Replace le taux courant dans sa série.
 *
 * @returns {{
 *   courant: number, moyenne: number, min: number, max: number,
 *   rang: number, depuis: string, points: {date, taux}[]
 * }|null}
 */
export function situerTaux(cle, { anneesRetenues = 15, aujourdhui = new Date() } = {}) {
  const entree = SERIES[cle];
  if (!entree) return null;

  const limite = new Date(aujourdhui);
  limite.setFullYear(limite.getFullYear() - anneesRetenues);
  const limiteIso = limite.toISOString().slice(0, 10);

  // On garde le dernier point ANTÉRIEUR à la fenêtre : sans lui, le taux qui
  // courait au début de la période serait absent et la courbe démarrerait dans
  // le vide.
  const serie = entree.serie;
  const dansFenetre = serie.filter((p) => p.date >= limiteIso);
  const avant = serie.filter((p) => p.date < limiteIso).slice(-1);
  const points = [...avant, ...dansFenetre];
  if (points.length < 2) return null;

  const taux = points.map((p) => p.taux);
  const courant = taux[taux.length - 1];

  /*
   * Moyenne PONDÉRÉE PAR LA DURÉE, et non moyenne des paliers.
   *
   * Les taux ne changent pas à intervalle régulier : 2020-2022 a tenu deux ans
   * à 0,5 %, tandis que 2025 a connu deux révisions en six mois. Une moyenne
   * arithmétique des paliers donnerait autant de poids à un taux qui a duré six
   * mois qu'à un autre qui a duré deux ans — et surestimerait ici nettement le
   * niveau habituel.
   */
  const finIso = aujourdhui.toISOString().slice(0, 10);
  let sommePonderee = 0;
  let dureeTotale = 0;
  for (let i = 0; i < points.length; i++) {
    const debut = points[i].date < limiteIso ? limiteIso : points[i].date;
    const fin = i + 1 < points.length ? points[i + 1].date : finIso;
    const duree = (new Date(fin) - new Date(debut)) / 86400000;
    if (duree <= 0) continue;
    sommePonderee += points[i].taux * duree;
    dureeTotale += duree;
  }
  const moyenne = dureeTotale > 0 ? sommePonderee / dureeTotale : courant;

  const tries = [...taux].sort((a, b) => a - b);
  const rang = (tries.filter((t) => t < courant).length / tries.length) * 100;

  return {
    libelle: entree.libelle,
    courant,
    moyenne,
    min: Math.min(...taux),
    max: Math.max(...taux),
    // Centile du taux courant dans la série : 0 = plus bas jamais vu,
    // 100 = plus haut.
    rang,
    depuis: points[0].date,
    points,
  };
}
