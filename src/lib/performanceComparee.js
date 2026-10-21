import { computeDailyReturns } from "./finance";

/**
 * Trois lectures de la performance qui manquaient : face à une alternative
 * honnête, mois par mois, et au prix des frais.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Dernière clôture connue au plus tard à la date donnée. */
function clotureAu(clotures, dateIso) {
  let retenue = null;
  for (const c of clotures) {
    if (c.date > dateIso) break;
    if (Number.isFinite(c.close) && c.close > 0) retenue = c.close;
  }
  return retenue;
}

/**
 * Le même argent, aux mêmes dates, dans un indice.
 *
 * La comparaison aux indices ramenait tout à une base 100 : elle mesure la
 * performance du GÉRANT, en ignorant QUAND l'argent est arrivé. Or un
 * versement fait juste avant une baisse ne pèse pas comme un versement fait
 * juste après. Ici, chaque apport de l'historique achète l'indice le jour
 * même, et la valeur obtenue se compare à la valeur réelle du portefeuille.
 *
 * Point de départ : la valeur du portefeuille au premier relevé — « si, ce
 * jour-là, tu avais tout placé dans l'indice ». Les apports suivants sont les
 * variations du capital investi entre deux relevés (un retrait revend des
 * parts).
 *
 * @param {Array<{date, valeur, capital}>} bourseHistory
 * @param {Array<{date, close}>} clotures  Clôtures quotidiennes de l'indice.
 * @returns {null | {depuis, serie: Array<{date, reel, indice}>, reel, indice, ecart, ecartPct}}
 */
export function memeArgentDansUnIndice(bourseHistory = [], clotures = []) {
  const cl = [...(clotures || [])].filter((c) => c?.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const releves = [...(bourseHistory || [])]
    .filter((p) => p?.date && Number.isFinite(p.valeur) && p.valeur > 0 && Number.isFinite(p.capital))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (releves.length < 2 || cl.length === 0) return null;

  // Premier relevé couvert par une clôture de l'indice.
  const iDepart = releves.findIndex((p) => clotureAu(cl, p.date) != null);
  if (iDepart < 0 || iDepart >= releves.length - 1) return null;

  let parts = releves[iDepart].valeur / clotureAu(cl, releves[iDepart].date);
  const serie = [{ date: releves[iDepart].date, reel: releves[iDepart].valeur, indice: releves[iDepart].valeur }];

  for (let i = iDepart + 1; i < releves.length; i++) {
    const p = releves[i];
    const prix = clotureAu(cl, p.date);
    const apport = p.capital - releves[i - 1].capital;
    if (apport !== 0) parts += apport / prix;
    serie.push({ date: p.date, reel: p.valeur, indice: Math.max(0, parts * prix) });
  }

  const dernier = serie[serie.length - 1];
  return {
    depuis: serie[0].date,
    serie,
    reel: dernier.reel,
    indice: dernier.indice,
    ecart: dernier.reel - dernier.indice,
    ecartPct: dernier.indice > 0 ? ((dernier.reel - dernier.indice) / dernier.indice) * 100 : null,
  };
}

/**
 * Rendements mensuels, neutralisés des versements, par année.
 *
 * Chaque mois compose les rendements quotidiens de l'historique — la même
 * neutralisation des apports que le TWR de l'onglet. Un mois que
 * l'historique ne couvre qu'en partie est signalé, pour qu'un « +0,4 % »
 * sur trois jours ne se lise pas comme un mois entier.
 *
 * @returns {Array<{annee, mois: Record<number, {pct, partiel}>, total}>}
 */
export function rendementsMensuels(bourseHistory = []) {
  const tries = [...(bourseHistory || [])].filter((p) => p?.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const quotidiens = computeDailyReturns(tries);
  if (quotidiens.length === 0) return [];

  const parMois = new Map();
  for (const { date, r } of quotidiens) {
    const cle = date.slice(0, 7);
    const m = parMois.get(cle) || { croissance: 1, jours: new Set() };
    m.croissance *= 1 + r / 100;
    m.jours.add(date);
    parMois.set(cle, m);
  }

  const premier = tries[0].date.slice(0, 7);
  const dernier = tries[tries.length - 1].date.slice(0, 7);
  const parAnnee = new Map();
  for (const [cle, m] of parMois) {
    const [annee, numero] = cle.split("-").map(Number);
    const ligne = parAnnee.get(annee) || { annee, mois: {}, croissance: 1 };
    ligne.mois[numero] = {
      pct: (m.croissance - 1) * 100,
      // Premier et dernier mois de l'historique : couverts en partie seulement.
      partiel: cle === premier || cle === dernier,
    };
    ligne.croissance *= m.croissance;
    parAnnee.set(annee, ligne);
  }

  return [...parAnnee.values()]
    .sort((a, b) => b.annee - a.annee)
    .map(({ annee, mois, croissance }) => ({ annee, mois, total: (croissance - 1) * 100 }));
}

/**
 * Ce que les frais ont vraiment coûté : leur montant, et ce qu'ils vaudraient
 * aujourd'hui s'ils étaient restés investis.
 *
 * Le rendement retenu est celui du portefeuille quand il est mesurable (au
 * moins un mois d'historique, rendement positif), sinon une hypothèse de 5 %
 * par an — signalée comme telle.
 */
export function coutDesFrais(operations = [], rendementAnnuelPct = null, horizons = [10, 20]) {
  let frais = 0;
  let volume = 0;
  let nbOrdres = 0;
  for (const op of operations || []) {
    const f = Number(op?.fees) || 0;
    if (f > 0) frais += f;
    if (op?.type === "ACHAT" || op?.type === "VENTE") {
      nbOrdres += 1;
      volume += Math.abs((Number(op.quantity) || 0) * (Number(op.price) || 0));
    }
  }
  const mesure = Number.isFinite(rendementAnnuelPct) && rendementAnnuelPct > 0;
  const taux = mesure ? rendementAnnuelPct : 5;
  return {
    frais,
    nbOrdres,
    fraisMoyenParOrdre: nbOrdres > 0 ? frais / nbOrdres : null,
    fraisSurVolumePct: volume > 0 ? (frais / volume) * 100 : null,
    taux,
    tauxMesure: mesure,
    projections: horizons.map((ans) => ({ ans, valeur: frais * (1 + taux / 100) ** ans })),
  };
}
