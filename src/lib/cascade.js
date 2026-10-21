import { valeurReleve } from "./finance";

/**
 * Décomposition du patrimoine : ce que tu as mis de côté, et ce que le
 * marché a fait.
 *
 * « Mon patrimoine a monté de 4 200 € ce mois-ci » ne dit pas l'essentiel :
 * est-ce parce qu'on a épargné 4 000 €, ou parce que le marché a travaillé ?
 * Les deux produisent la même courbe et n'ont rien à voir.
 *
 * LE MARCHÉ EST MESURÉ, L'ÉPARGNE EST LE RÉSIDU.
 *
 * La première version faisait l'inverse : elle lisait les versements dans le
 * journal du PEA et attribuait tout le reste au marché. Or le journal ne
 * connaît que le PEA. Un virement de 500 € vers un Livret A, invisible pour
 * lui, ressortait en « plus-values » — l'erreur exacte que la cascade était
 * censée corriger.
 *
 * Le marché se mesure, lui, sur l'historique du portefeuille, qui enregistre
 * chaque jour sa valeur ET le capital investi : la variation de leur écart
 * (valeur − capital) est ce que les titres ont rapporté — cours, dividendes
 * encaissés, frais payés — versements exclus par construction. Tout le reste
 * de la variation du patrimoine est de l'épargne nette : versements, dépôts
 * sur les livrets et leurs intérêts annuels, remboursements de dettes.
 *
 * La cascade BOUCLE toujours au centime : début + épargne + marché = fin.
 */

/** Mois AAAA-MM d'une date ISO. */
const moisDe = (iso) => String(iso || "").slice(0, 7);

/** Dernier relevé de patrimoine de chaque mois : { mois → { date, valeur } }. */
function relevesParMois(historique = []) {
  const parMois = new Map();
  const tries = [...historique].filter((p) => p?.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const p of tries) {
    const v = valeurReleve(p);
    if (v != null) parMois.set(moisDe(p.date), { date: p.date, valeur: v });
  }
  return parMois;
}

/**
 * Gain cumulé du portefeuille (valeur − capital investi) au dernier relevé
 * daté au plus tard du jour donné, ou `null` s'il n'y en a pas.
 */
export function gainPortefeuilleAu(bourseHistory = [], dateIso) {
  let retenu = null;
  for (const p of bourseHistory || []) {
    if (!p?.date || p.date > dateIso) continue;
    if (!Number.isFinite(p.valeur) || !Number.isFinite(p.capital)) continue;
    if (!retenu || p.date >= retenu.date) retenu = p;
  }
  return retenu ? retenu.valeur - retenu.capital : null;
}

/**
 * Part du marché entre deux dates. 0 sans portefeuille ; `null` quand
 * l'historique du portefeuille ne couvre pas les deux dates — on ne
 * l'invente pas.
 */
function partMarche(bourseHistory, aDesPositions, dateDebut, dateFin) {
  if (!aDesPositions) return 0;
  const avant = gainPortefeuilleAu(bourseHistory, dateDebut);
  const apres = gainPortefeuilleAu(bourseHistory, dateFin);
  return avant == null || apres == null ? null : apres - avant;
}

/**
 * @param {object} p
 * @param {Array} p.historique     Relevés de patrimoine [{date, value}].
 * @param {Array} p.operations     Journal du PEA (dividendes et frais, pour le détail).
 * @param {Array} p.bourseHistory  Historique du portefeuille [{date, valeur, capital}].
 * @param {boolean} p.aDesPositions  Le portefeuille contient-il des lignes ?
 * @param {number} p.mois          Nombre de mois à remonter.
 */
export function cascadeMensuelle({
  historique = [],
  operations = [],
  bourseHistory = [],
  aDesPositions = true,
  mois = 6,
} = {}) {
  const parMois = relevesParMois(historique);
  if (parMois.size < 2) return [];

  const moisTries = [...parMois.keys()].sort();
  const sortie = [];

  for (const m of moisTries.slice(-mois)) {
    const indexGlobal = moisTries.indexOf(m);
    // Sans mois précédent, il n'y a pas d'écart à décomposer.
    if (indexGlobal === 0) continue;

    const releveDebut = parMois.get(moisTries[indexGlobal - 1]);
    const releveFin = parMois.get(m);

    let dividendes = 0;
    let frais = 0;
    for (const op of operations) {
      if (moisDe(op?.date) !== m) continue;
      if (op.type === "DIVIDENDE") dividendes += Number(op.amount ?? op.montantNet ?? 0) || 0;
      frais += Number(op.fees) || 0;
    }

    /*
     * Composants arrondis AVANT le résidu, et le résidu déduit des valeurs
     * arrondies : arrondir chaque terme séparément laissait la cascade ouverte
     * d'un euro, et un euro d'écart suffit à faire douter de tout le reste.
     */
    const debut = Math.round(releveDebut.valeur);
    const fin = Math.round(releveFin.valeur);
    const marcheBrut = partMarche(bourseHistory, aDesPositions, releveDebut.date, releveFin.date);

    if (marcheBrut == null) {
      sortie.push({ mois: m, debut, fin, variation: fin - debut, complet: false });
      continue;
    }

    const marche = Math.round(marcheBrut);
    const dividendesArrondis = Math.round(dividendes);
    const fraisArrondis = Math.round(-frais);
    sortie.push({
      mois: m,
      debut,
      fin,
      variation: fin - debut,
      complet: true,
      epargne: fin - debut - marche,
      marche,
      // Le marché, détaillé : dividendes et frais du journal, et le reste en
      // plus-values. Le détail boucle sur `marche` par construction.
      dividendes: dividendesArrondis,
      frais: fraisArrondis,
      plusValues: marche - dividendesArrondis - fraisArrondis,
    });
  }

  return sortie;
}

/**
 * Met un mois à plat pour un graphique en cascade : chaque barre porte sa
 * base invisible et sa hauteur, de sorte qu'elle démarre là où la précédente
 * s'arrête.
 */
export function barresCascade(moisDecompose) {
  if (!moisDecompose) return [];
  // `court` sert à l'axe, où « Début de mois » finissait tronqué en
  // « Début de mo… » ; `libelle` reste complet dans l'infobulle.
  const etapes = moisDecompose.complet
    ? [
        { cle: "debut", libelle: "Début de mois", court: "Début", valeur: moisDecompose.debut, type: "total" },
        { cle: "epargne", libelle: "Épargne nette", court: "Épargne", valeur: moisDecompose.epargne, type: "flux" },
        { cle: "plusValues", libelle: "Plus-values", court: "Marché", valeur: moisDecompose.plusValues, type: "marche" },
        { cle: "dividendes", libelle: "Dividendes", court: "Dividendes", valeur: moisDecompose.dividendes, type: "marche" },
        { cle: "frais", libelle: "Frais", court: "Frais", valeur: moisDecompose.frais, type: "cout" },
        { cle: "fin", libelle: "Fin de mois", court: "Fin", valeur: moisDecompose.fin, type: "total" },
      ]
    : [
        { cle: "debut", libelle: "Début de mois", court: "Début", valeur: moisDecompose.debut, type: "total" },
        { cle: "variation", libelle: "Variation (non décomposée)", court: "Variation", valeur: moisDecompose.variation, type: "neutre" },
        { cle: "fin", libelle: "Fin de mois", court: "Fin", valeur: moisDecompose.fin, type: "total" },
      ];

  let curseur = 0;
  return etapes.map((e) => {
    if (e.type === "total") {
      curseur = e.valeur;
      return { ...e, base: 0, hauteur: e.valeur };
    }
    const base = e.valeur >= 0 ? curseur : curseur + e.valeur;
    const hauteur = Math.abs(e.valeur);
    curseur += e.valeur;
    return { ...e, base, hauteur };
  });
}

/**
 * D'où vient ton patrimoine, depuis le premier relevé exploitable.
 *
 * Même règle que la cascade : le marché est mesuré sur l'historique du
 * portefeuille, l'épargne est le résidu. La fenêtre démarre au premier jour
 * où les DEUX historiques existent : avant, on ne saurait pas ce que valait
 * le portefeuille, et toute la variation passerait à tort pour de l'épargne.
 */
export function origineDuPatrimoine({ historique = [], bourseHistory = [], aDesPositions = true } = {}) {
  const releves = [...historique]
    .filter((p) => p?.date && valeurReleve(p) != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (releves.length < 2) return null;

  let debut = releves[0];
  if (aDesPositions) {
    const premierPortefeuille = [...(bourseHistory || [])]
      .filter((p) => p?.date && Number.isFinite(p.valeur) && Number.isFinite(p.capital))
      .map((p) => p.date)
      .sort()[0];
    if (!premierPortefeuille) return null;
    debut = releves.find((p) => p.date >= premierPortefeuille) || null;
    if (!debut) return null;
  }
  const fin = releves[releves.length - 1];
  if (fin.date <= debut.date) return null;

  const variation = valeurReleve(fin) - valeurReleve(debut);
  const marche = partMarche(bourseHistory, aDesPositions, debut.date, fin.date);
  if (marche == null) return null;
  return {
    depuis: debut.date,
    jusquau: fin.date,
    debut: valeurReleve(debut),
    fin: valeurReleve(fin),
    variation,
    marche,
    epargne: variation - marche,
  };
}

/**
 * Régularité des versements sur le PEA : mois avec au moins un versement,
 * sur les douze derniers mois, et plus longue série de mois consécutifs.
 *
 * Seul le journal du PEA est connu : un virement vers un livret n'y figure
 * pas. L'écran le précise.
 */
export function regulariteVersements(operations = [], aujourdhui) {
  const mois = new Set(
    (operations || []).filter((op) => op?.type === "VERSEMENT" && op.date).map((op) => moisDe(op.date))
  );

  const fin = new Date(`${aujourdhui}T12:00:00Z`);
  const douze = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() - i, 15));
    const cle = d.toISOString().slice(0, 7);
    douze.push({ cle, verse: mois.has(cle) });
  }

  // Plus longue série, sur tout le journal.
  const tries = [...mois].sort();
  let plusLongue = 0;
  let courante = 0;
  let precedent = null;
  for (const cle of tries) {
    const [a, m] = cle.split("-").map(Number);
    const suit =
      precedent &&
      ((precedent[0] === a && precedent[1] === m - 1) || (precedent[0] === a - 1 && precedent[1] === 12 && m === 1));
    courante = suit ? courante + 1 : 1;
    plusLongue = Math.max(plusLongue, courante);
    precedent = [a, m];
  }

  return { douzeMois: douze, nbSurDouze: douze.filter((d) => d.verse).length, plusLongueSerie: plusLongue };
}
