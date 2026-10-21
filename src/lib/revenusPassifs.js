import { dividendeAttendu } from "../../shared/dividendes.js";

/**
 * Revenus passifs, indépendance financière et calendrier des revenus.
 *
 * Toutes ces mesures partent des MÊMES chiffres que le reste de l'app : le
 * dividende attendu par ligne (net de retenue étrangère dans un PEA, comme la
 * carte « Revenus de dividendes estimés ») et le taux de chaque livret. Rien
 * n'est re-estimé à part : deux écrans ne doivent pas donner deux montants
 * pour la même chose.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Intérêts annuels attendus des livrets : solde × taux net. */
export function interetsLivrets(livrets = []) {
  return (livrets || []).reduce((s, l) => s + (Number(l?.balance) || 0) * (Number(l?.rate) || 0), 0);
}

/** Dividendes nets et intérêts attendus sur un an. */
export function revenusPassifsAnnuels({ positions = [], enveloppe = "PEA", livrets = [] } = {}) {
  const dividendes = (positions || []).reduce((s, p) => s + dividendeAttendu(p, enveloppe), 0);
  const interets = interetsLivrets(livrets);
  return { dividendes, interets, total: dividendes + interets };
}

/**
 * Nombre de mois pour qu'un capital atteigne une cible, avec un versement
 * mensuel et un rendement annuel composé mensuellement. `null` si la cible
 * n'est pas atteinte en 50 ans — au-delà, une date n'a plus de sens.
 */
export function moisPourAtteindre(capital, versementMensuel, tauxAnnuelPct, cible, maxMois = 600) {
  if (!(cible > 0)) return null;
  let valeur = Number(capital) || 0;
  if (valeur >= cible) return 0;
  const r = (Number(tauxAnnuelPct) || 0) / 100 / 12;
  const v = Number(versementMensuel) || 0;
  for (let m = 1; m <= maxMois; m++) {
    valeur = valeur * (1 + r) + v;
    if (valeur >= cible) return m;
  }
  return null;
}

/**
 * Indépendance financière, sous deux angles.
 *
 *  - COUVERTURE : la part des dépenses que paient déjà les revenus passifs
 *    (dividendes et intérêts réellement attendus). C'est un fait, pas une
 *    convention.
 *  - RÈGLE DES 4 % : la part des dépenses que financerait un retrait annuel
 *    de 4 % du capital financier. C'est une CONVENTION, issue d'études
 *    américaines sur trente ans de retraite — elle est présentée comme telle,
 *    jamais comme un conseil. La cible correspondante vaut 25 fois les
 *    dépenses annuelles.
 *
 * `null` sans dépenses renseignées : sans elles, aucun ratio n'a de sens.
 */
export function independanceFinanciere({
  revenusPassifs = 0,
  depensesMensuelles = 0,
  capitalFinancier = 0,
  epargneMensuelle = 0,
  tauxAnnuelPct = 0,
  tauxRetrait = 0.04,
} = {}) {
  const depensesAnnuelles = (Number(depensesMensuelles) || 0) * 12;
  if (depensesAnnuelles <= 0) return null;
  const cible = depensesAnnuelles / tauxRetrait;
  return {
    depensesAnnuelles,
    couverturePct: (revenusPassifs / depensesAnnuelles) * 100,
    regleRetraitPct: ((capitalFinancier * tauxRetrait) / depensesAnnuelles) * 100,
    cible,
    moisAvantCible: moisPourAtteindre(capitalFinancier, Math.max(0, epargneMensuelle), tauxAnnuelPct, cible),
  };
}

/**
 * Revenus attendus mois par mois, sur les douze mois à venir (mois courant
 * compris).
 *
 * - Dividendes : le montant annuel net de chaque ligne, réparti selon les
 *   mois de détachement observés l'an dernier (`dividendeMois`, rempli à
 *   l'actualisation des cours). Une ligne sans calendrier connu n'est PAS
 *   répartie au jugé : son montant est compté à part, « mois inconnu ».
 * - Intérêts des livrets : crédités en une fois au 31 décembre — c'est là
 *   qu'ils sont placés, pas lissés sur l'année.
 */
export function calendrierRevenus({ positions = [], enveloppe = "PEA", livrets = [], aujourdhui } = {}) {
  const depart = new Date(`${aujourdhui}T12:00:00Z`);
  const mois = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(depart.getUTCFullYear(), depart.getUTCMonth() + i, 15));
    mois.push({
      cle: d.toISOString().slice(0, 7),
      numero: d.getUTCMonth() + 1,
      libelle: d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }),
      dividendes: 0,
      interets: 0,
      details: [],
    });
  }

  let inconnu = 0;
  const lignesInconnues = [];
  for (const p of positions || []) {
    const annuel = dividendeAttendu(p, enveloppe);
    if (!(annuel > 0)) continue;
    const repartition = p?.dividendeMois;
    if (!repartition || Object.keys(repartition).length === 0) {
      inconnu += annuel;
      lignesInconnues.push(p.ticker);
      continue;
    }
    for (const m of mois) {
      const part = Number(repartition[String(m.numero)]) || 0;
      if (part <= 0) continue;
      const montant = annuel * part;
      m.dividendes += montant;
      m.details.push({ ticker: p.ticker, montant });
    }
  }

  const interets = interetsLivrets(livrets);
  const decembre = mois.find((m) => m.numero === 12);
  if (decembre && interets > 0) decembre.interets = interets;

  const total = mois.reduce((s, m) => s + m.dividendes + m.interets, 0);
  return { mois, inconnu, lignesInconnues, total };
}
