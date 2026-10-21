/**
 * Un titre face à ses concurrents.
 *
 * « PER 24 » ne dit rien seul ; « PER 24, plus cher que 70 % des chimistes
 * européens » est un jugement. Les concurrents sont pris dans les instantanés
 * du Screener (SBF 120, STOXX Europe 600, small caps françaises), qui portent
 * déjà l'industrie Yahoo de chaque titre : aucune requête de plus.
 *
 * LE GROUPE : la même INDUSTRIE quand elle compte assez de sociétés, sinon le
 * même SECTEUR — et l'écran dit lequel des deux a servi. Mesuré : la moitié
 * des 123 industries de l'univers comptent moins de cinq titres.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const UNIVERS_PAIRS = ["sbf120", "stoxx600", "fr-small"];

/** En dessous, le groupe ne dit plus rien d'un rang : on passe au secteur. */
export const TAILLE_MIN_GROUPE = 5;

/** En dessous, une médiane ou un rang ne se lit plus. */
export const VALEURS_MIN_METRIQUE = 4;

/**
 * Indicateurs comparés.
 *
 * `sens` dit ce qui est favorable : `bas` pour la valorisation et la dette,
 * `haut` pour la rentabilité, `null` pour le rendement — un rendement élevé
 * n'est ni bon ni mauvais en soi. `strictementPositif` écarte les valeurs qui
 * ne se classent pas : un PER négatif n'est pas « moins cher » qu'un PER de 10.
 */
export const METRIQUES_PAIRS = [
  { cle: "per", libelle: "PER", unite: "×", sens: "bas", strictementPositif: true, lecture: "plus cher que" },
  { cle: "evEbitda", libelle: "VE / EBITDA", unite: "×", sens: "bas", strictementPositif: true, lecture: "plus cher que" },
  { cle: "priceToBook", libelle: "Cours / actif net", unite: "×", sens: "bas", strictementPositif: true, lecture: "plus cher que" },
  { cle: "margeOperationnellePct", libelle: "Marge opérationnelle", unite: "%", sens: "haut", lecture: "supérieure à" },
  { cle: "margeNettePct", libelle: "Marge nette", unite: "%", sens: "haut", lecture: "supérieure à" },
  { cle: "roePct", libelle: "Rentabilité des capitaux propres", unite: "%", sens: "haut", lecture: "supérieure à" },
  { cle: "detteSurFondsPropresPct", libelle: "Dette / capitaux propres", unite: "%", sens: "bas", positif: true, lecture: "plus endetté que" },
  { cle: "rendementPct", libelle: "Rendement du dividende", unite: "%", sens: null, lecture: "plus élevé que" },
];

/** Fusionne plusieurs univers décodés, chaque symbole une seule fois. */
export function fusionnerUnivers(listes = []) {
  const vus = new Map();
  for (const liste of listes) {
    for (const t of liste || []) {
      if (t?.symbole && !vus.has(t.symbole)) vus.set(t.symbole, t);
    }
  }
  return [...vus.values()];
}

/**
 * Groupe de comparaison d'un titre.
 * @returns {{niveau: "industrie"|"secteur", libelle: string, pairs: Array}|null}
 */
export function groupeDePairs(sujet, titres = []) {
  if (!sujet?.industrie && !sujet?.secteur) return null;
  const autres = (titres || []).filter((t) => t.symbole !== sujet.symbole);

  if (sujet.industrie) {
    const memeIndustrie = autres.filter((t) => t.industrie === sujet.industrie);
    if (memeIndustrie.length + 1 >= TAILLE_MIN_GROUPE) {
      return { niveau: "industrie", libelle: sujet.industrie, pairs: memeIndustrie };
    }
  }
  if (sujet.secteur) {
    const memeSecteur = autres.filter((t) => t.secteur === sujet.secteur);
    if (memeSecteur.length + 1 >= TAILLE_MIN_GROUPE) {
      return { niveau: "secteur", libelle: sujet.secteur, pairs: memeSecteur };
    }
  }
  return null;
}

function valeurClassable(metrique, v) {
  if (!Number.isFinite(v)) return false;
  if (metrique.strictementPositif && v <= 0) return false;
  if (metrique.positif && v < 0) return false;
  return true;
}

function mediane(valeurs) {
  const tri = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(tri.length / 2);
  return tri.length % 2 ? tri[m] : (tri[m - 1] + tri[m]) / 2;
}

/**
 * Rang du titre parmi ses pairs, indicateur par indicateur.
 *
 * `rangPct` : part des pairs dont la valeur est PLUS BASSE (les égalités
 * comptent pour moitié). 70 se lit « plus haut que 70 % des pairs ».
 * `ton` : favorable / défavorable / neutre, selon le sens de l'indicateur.
 */
export function comparerAuxPairs(sujet, pairs = []) {
  return METRIQUES_PAIRS.map((m) => {
    const valeur = sujet?.[m.cle];
    const valeursPairs = (pairs || []).map((p) => p[m.cle]).filter((v) => valeurClassable(m, v));
    const base = { ...m, valeur: Number.isFinite(valeur) ? valeur : null, nbPairs: valeursPairs.length };
    if (valeursPairs.length < VALEURS_MIN_METRIQUE) return { ...base, mediane: null, rangPct: null, ton: "neutre" };

    const med = mediane(valeursPairs);
    if (!valeurClassable(m, valeur)) return { ...base, mediane: med, rangPct: null, ton: "neutre" };

    const plusBas = valeursPairs.filter((v) => v < valeur).length;
    const egaux = valeursPairs.filter((v) => v === valeur).length;
    const rangPct = ((plusBas + egaux / 2) / valeursPairs.length) * 100;

    let ton = "neutre";
    if (m.sens === "bas") ton = rangPct <= 35 ? "favorable" : rangPct >= 65 ? "defavorable" : "neutre";
    if (m.sens === "haut") ton = rangPct >= 65 ? "favorable" : rangPct <= 35 ? "defavorable" : "neutre";
    return { ...base, mediane: med, rangPct, ton };
  });
}

/**
 * Devise dans laquelle Yahoo exprime la CAPITALISATION.
 *
 * Les titres de Londres cotent en pence (« GBp ») mais leur capitalisation
 * est publiée en livres : la convertir comme des pence la diviserait par cent.
 */
export function deviseCapitalisation(devise) {
  if (devise === "GBp") return "GBP";
  if (devise === "ZAc") return "ZAR";
  if (devise === "ILA") return "ILS";
  return devise || null;
}

/**
 * Les concurrents les plus proches par la taille.
 *
 * Distance mesurée sur le LOGARITHME de la capitalisation en euros : 2 Md€
 * contre 4 Md€ est le même écart que 50 contre 100. Un concurrent dont la
 * devise n'a pas de taux connu est écarté plutôt que comparé en monnaie
 * étrangère — une capitalisation en couronnes suédoises paraît dix fois
 * plus grosse qu'elle n'est.
 *
 * @param {object} versEuro  { EUR: 1, USD: 0.92, … } euros par unité de devise
 */
export function plusProchesParTaille(sujet, pairs = [], versEuro = {}, n = 5) {
  const enEuro = (t) => {
    const devise = deviseCapitalisation(t?.devise);
    const taux = devise === "EUR" ? 1 : versEuro[devise];
    return Number.isFinite(t?.capitalisation) && t.capitalisation > 0 && Number.isFinite(taux) ? t.capitalisation * taux : null;
  };
  const capSujet = enEuro(sujet);
  if (capSujet == null) return [];
  return (pairs || [])
    .map((p) => ({ ...p, capitalisationEuro: enEuro(p) }))
    .filter((p) => p.capitalisationEuro != null)
    .map((p) => ({ ...p, rapportTaille: p.capitalisationEuro / capSujet }))
    .sort((a, b) => Math.abs(Math.log(a.rapportTaille)) - Math.abs(Math.log(b.rapportTaille)))
    .slice(0, n);
}
