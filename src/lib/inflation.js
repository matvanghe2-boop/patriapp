import { todayIso } from "./finance";
import { recurrences } from "./analyseCompte";
import { RATES_CATALOG } from "../../shared/ratesCatalog";

/**
 * Inflation : l'officielle, et la tienne.
 *
 * Deux usages, un même parti pris d'honnêteté :
 *  · ramener une courbe de patrimoine en EUROS D'AUJOURD'HUI, au taux officiel
 *    — une hypothèse simple et annoncée comme telle ;
 *  · mesurer TON inflation là où un relevé bancaire permet de la mesurer
 *    vraiment : sur les charges récurrentes. Le même service, prélevé à la
 *    même fréquence, qui coûte plus cher — c'est une hausse de prix. Une
 *    hausse des dépenses de restauration, elle, peut venir de prix plus
 *    élevés comme de repas plus nombreux : la confondre avec de l'inflation
 *    serait un chiffre plausible et faux.
 */

/** Dernière inflation officielle connue (IPC INSEE, glissement annuel). */
export function inflationOfficielle(catalogue = RATES_CATALOG) {
  const ipc = catalogue.find((r) => r.id === "inflation-ipc");
  return ipc ? { tauxPct: ipc.value, date: ipc.effectiveDate, source: ipc.source } : { tauxPct: 2, date: null, source: null };
}

const JOUR_MS = 86400000;
const annees = (debut, fin) => (new Date(`${fin}T00:00:00`) - new Date(`${debut}T00:00:00`)) / JOUR_MS / 365.25;

/**
 * Valeur d'un montant daté, exprimée en euros d'aujourd'hui. Un point futur
 * (projection) est ramené au présent dans l'autre sens.
 */
export function enEurosConstants(valeur, date, { tauxPct = inflationOfficielle().tauxPct, aujourdhui = todayIso() } = {}) {
  if (!Number.isFinite(valeur) || !date) return valeur;
  return valeur * Math.pow(1 + tauxPct / 100, annees(String(date).slice(0, 10), aujourdhui));
}

const moisEntre = (debut, fin) => {
  const [a1, m1] = debut.split("-").map(Number);
  const [a2, m2] = fin.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};

/**
 * Inflation de tes charges récurrentes : pour chacune, le premier et le
 * dernier prélèvement constatés, et l'ensemble pondéré par les montants.
 *
 * La variation est donnée SUR LA PÉRIODE OBSERVÉE, sans l'annualiser :
 * extrapoler sur douze mois une hausse vue sur trois exagérerait tout.
 *
 * @returns {null | {lignes, totalAvant, totalApres, variationPct, moisObserves, hausses}}
 */
export function inflationCharges(enrichies = [], { moisMin = 2 } = {}) {
  const { charges } = recurrences(enrichies);
  const parId = new Map((enrichies || []).map((o) => [o.id, o]));
  const lignes = [];
  for (const c of charges) {
    const ops = c.ids.map((id) => parId.get(id)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    if (ops.length < 2) continue;
    const premier = ops[0];
    const dernier = ops[ops.length - 1];
    const mois = moisEntre(premier.date, dernier.date);
    if (mois < moisMin) continue;
    const avant = Math.abs(premier.montant);
    const apres = Math.abs(dernier.montant);
    lignes.push({
      titre: c.titre,
      avant,
      apres,
      variationPct: avant > 0 ? ((apres - avant) / avant) * 100 : 0,
      depuis: premier.date,
      jusqua: dernier.date,
      mois,
    });
  }
  if (lignes.length === 0) return null;
  const totalAvant = lignes.reduce((s, l) => s + l.avant, 0);
  const totalApres = lignes.reduce((s, l) => s + l.apres, 0);
  return {
    lignes: lignes.sort((a, b) => b.variationPct - a.variationPct),
    totalAvant,
    totalApres,
    variationPct: totalAvant > 0 ? ((totalApres - totalAvant) / totalAvant) * 100 : 0,
    moisObserves: Math.max(...lignes.map((l) => l.mois)),
    hausses: lignes.filter((l) => l.variationPct > 0.5).length,
  };
}
