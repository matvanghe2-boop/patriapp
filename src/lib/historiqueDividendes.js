/**
 * Vingt ans de dividende par action, lus depuis les détachements Yahoo.
 *
 * Trois pièges mesurés sur les valeurs du portefeuille, et traités ici :
 *
 *  1. LES VERSEMENTS À CHEVAL SUR DEUX ANNÉES. TotalEnergies détache son
 *     acompte d'automne début janvier (6 janvier 2020, 4 janvier 2021, …).
 *     Additionnés par année civile, ses dividendes faisaient trois versements
 *     en 2019 et cinq en 2020 : une « baisse » puis une « hausse » qui
 *     n'existaient pas. Pour un payeur trimestriel, un détachement des vingt
 *     premiers jours de janvier est rattaché à l'année précédente.
 *
 *  2. LES DONNÉES SOURCE ERRONÉES. Schneider Electric figure pour 0,19 € en
 *     2018, entre 2,04 € et 2,35 € : le dividende réel était de 2,20 €. Une
 *     année qui tombe sous 30 % de ses DEUX voisines, ou dépasse le double des
 *     deux, est marquée « atypique » et sortie des calculs — affichée, mais
 *     signalée, plutôt que corrigée par une valeur inventée.
 *
 *  3. LES DIVIDENDES EXCEPTIONNELS. TotalEnergies a versé 1 € de plus en
 *     décembre 2022 : compté, il fabriquait une « baisse de 21 % » en 2023.
 *     Chez un payeur régulier, une année qui compte PLUS de versements que
 *     d'habitude voit le versement le plus éloigné de la norme (au moins 25 %
 *     d'écart à la médiane de l'année) mis à part comme exceptionnel.
 *
 *  4. L'ANNÉE EN COURS, incomplète par construction (LVMH n'a pas encore
 *     détaché son acompte de décembre) : montrée, jamais comptée.
 *
 * PROFONDEUR : onze années complètes, de quoi calculer une croissance sur dix
 * ans, et pas plus. Au-delà, les ajustements de la source se dégradent :
 * Air Liquide y paraît baisser en 2009 et Schneider en 2010, ce qui n'est pas
 * arrivé.
 *
 * Les montants sont ceux de Yahoo, par action, dans la devise de cotation et
 * ajustés des divisions d'actions.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Années complètes conservées : dix ans de croissance, plus l'année de départ. */
export const ANNEES_AFFICHEES = 11;

/** Écart à la médiane de l'année au-delà duquel un versement surnuméraire est exceptionnel. */
const ECART_EXCEPTIONNEL = 0.25;

/** Tolérance d'arrondi : une « baisse » de 0,5 % n'en est pas une. */
const TOLERANCE_BAISSE = 0.01;

function frequenceAnnuelle(detachements, anneeEnCours) {
  const parAnnee = new Map();
  for (const d of detachements) {
    const a = Number(d.date.slice(0, 4));
    if (a < anneeEnCours && a >= anneeEnCours - 5) parAnnee.set(a, (parAnnee.get(a) || 0) + 1);
  }
  const comptes = [...parAnnee.values()].sort((a, b) => a - b);
  return comptes.length ? comptes[Math.floor(comptes.length / 2)] : 1;
}

/** Année de rattachement d'un détachement. */
function anneeDe(date, frequence) {
  const annee = Number(date.slice(0, 4));
  const mois = Number(date.slice(5, 7));
  const jour = Number(date.slice(8, 10));
  return frequence >= 3 && mois === 1 && jour <= 20 ? annee - 1 : annee;
}

/**
 * @param {Array<{date: string, montant: number}>} detachements
 * @returns {{annees: Array<{annee, montant, versements, enCours, atypique}>, frequence: number}}
 */
export function dividendesParAnnee(detachements = [], { aujourdhui } = {}) {
  const tries = (detachements || [])
    .filter((d) => d?.date && Number.isFinite(d.montant) && d.montant > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (tries.length === 0) return { annees: [], frequence: 0 };

  const anneeEnCours = Number(String(aujourdhui).slice(0, 4));
  const frequence = frequenceAnnuelle(tries, anneeEnCours);

  const parAnnee = new Map();
  for (const d of tries) {
    const a = anneeDe(d.date, frequence);
    if (!parAnnee.has(a)) parAnnee.set(a, []);
    parAnnee.get(a).push(d.montant);
  }

  const annees = [...parAnnee.entries()]
    .sort(([a], [b]) => a - b)
    .map(([annee, montants]) => {
      const exceptionnels = frequence >= 2 && montants.length > frequence ? versementsExceptionnels(montants, frequence) : [];
      const exceptionnel = exceptionnels.reduce((s, v) => s + v, 0);
      return {
        annee,
        montant: montants.reduce((s, v) => s + v, 0) - exceptionnel,
        exceptionnel,
        versements: montants.length - exceptionnels.length,
        enCours: annee >= anneeEnCours,
        atypique: null,
      };
    });

  // La première année de la série peut n'être qu'une fin d'année.
  if (annees.length > 1 && annees[0].versements < frequence) annees[0].partielle = true;

  const completes = annees.filter((e) => !e.enCours && !e.partielle);
  for (let i = 1; i < completes.length - 1; i++) {
    const { montant } = completes[i];
    const avant = completes[i - 1].montant;
    const apres = completes[i + 1].montant;
    if (montant < 0.3 * Math.min(avant, apres)) completes[i].atypique = "bas";
    else if (montant > 2 * Math.max(avant, apres)) completes[i].atypique = "haut";
  }

  return {
    annees: [...completes.slice(-ANNEES_AFFICHEES), ...annees.filter((e) => e.enCours)],
    frequence,
  };
}

/** Versements surnuméraires d'une année, les plus éloignés de sa médiane. */
function versementsExceptionnels(montants, frequence) {
  const tri = [...montants].sort((a, b) => a - b);
  const mediane = tri[Math.floor(tri.length / 2)];
  return [...montants]
    .sort((a, b) => Math.abs(b - mediane) - Math.abs(a - mediane))
    .slice(0, montants.length - frequence)
    .filter((v) => Math.abs(v - mediane) >= ECART_EXCEPTIONNEL * mediane);
}

const croissanceAnnuelle = (fin, debut, n) => (debut > 0 && fin > 0 ? ((fin / debut) ** (1 / n) - 1) * 100 : null);

/**
 * Lecture de l'historique : croissance, années sans baisse, baisses.
 *
 * `anneesSansBaisse` compte les années consécutives, en remontant depuis la
 * dernière année complète, où le dividende n'a pas reculé. Une année atypique
 * est sautée : on la compare à rien, et la suivante à celle d'avant.
 */
export function lireHistoriqueDividendes(annees = []) {
  const fiables = (annees || []).filter((e) => !e.enCours && !e.partielle && !e.atypique);
  if (fiables.length < 2) return null;

  const derniere = fiables[fiables.length - 1];
  const parAnnee = new Map(fiables.map((e) => [e.annee, e]));
  const il_y_a = (n) => parAnnee.get(derniere.annee - n) ?? null;

  let anneesSansBaisse = 0;
  for (let i = fiables.length - 1; i > 0; i--) {
    if (fiables[i].montant >= fiables[i - 1].montant * (1 - TOLERANCE_BAISSE)) anneesSansBaisse += 1;
    else break;
  }

  const baisses = [];
  for (let i = 1; i < fiables.length; i++) {
    const variation = (fiables[i].montant / fiables[i - 1].montant - 1) * 100;
    if (variation < -TOLERANCE_BAISSE * 100) baisses.push({ annee: fiables[i].annee, variationPct: variation });
  }

  return {
    derniere,
    croissance5ansPct: il_y_a(5) ? croissanceAnnuelle(derniere.montant, il_y_a(5).montant, 5) : null,
    croissance10ansPct: il_y_a(10) ? croissanceAnnuelle(derniere.montant, il_y_a(10).montant, 10) : null,
    anneesSansBaisse,
    // La série ENTIÈRE est sans baisse : « depuis au moins … » plutôt qu'un
    // nombre qui laisserait croire à une rupture avant.
    sansBaisseDepuisLeDebut: anneesSansBaisse === fiables.length - 1,
    premiereAnnee: fiables[0].annee,
    baisses,
    atypiques: (annees || []).filter((e) => e.atypique).map((e) => e.annee),
  };
}
