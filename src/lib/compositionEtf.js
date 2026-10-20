/**
 * Composition des indices que répliquent les ETF — pour les DÉCOMPOSER.
 *
 * Un ETF monde rangé dans un secteur unique faussait toute l'analyse : en
 * « Non classé », il passait pour un secteur dominant (« Non classé
 * représente 84 % ») et faisait chuter la note de diversification, alors
 * qu'il est précisément l'actif le plus diversifié du portefeuille. Décomposé,
 * son poids se répartit entre les secteurs et les pays de son indice, et la
 * répartition affichée devient celle à laquelle on est réellement exposé.
 *
 * RÈGLES DE CE CATALOGUE
 *  - Uniquement des chiffres PUBLIÉS, recopiés tels quels, avec leur source et
 *    leur date. Rien n'est estimé ni complété : la fiche MSCI ne détaille que
 *    cinq pays, le reste reste donc « Autres pays développés », en bloc.
 *  - Les libellés sont ceux de la source (GICS, en anglais) ; leur
 *    correspondance avec les secteurs de l'application est faite à part, dans
 *    `SECTEUR_GICS`, pour qu'on puisse toujours confronter le catalogue à la
 *    fiche d'origine ligne à ligne.
 *  - Une composition dérive : à remettre à jour de temps en temps. La date est
 *    affichée à l'écran pour que son âge se voie.
 *
 * Un ETF absent du catalogue n'est PAS décomposé au jugé : il reste « Non
 * classé », compté à part.
 */

export const INDICES = {
  "MSCI World": {
    source: "MSCI World Index (USD) — fiche de l'indice, MSCI",
    url: "https://www.msci.com/documents/10199/178e6643-6ae6-47b9-82be-e1fc565ededb",
    date: "2026-09-30",
    constituants: 1249,
    // Poids sectoriels publiés, en %. Leur somme fait 100,02 : ce sont les
    // arrondis de la fiche. La décomposition renormalise, sans quoi un ETF
    // pèserait 0,02 % de plus que sa valeur.
    secteurs: {
      "Information Technology": 31.78,
      Financials: 15.74,
      Industrials: 10.8,
      "Health Care": 9.2,
      "Consumer Discretionary": 8.36,
      "Communication Services": 8.31,
      "Consumer Staples": 4.77,
      Energy: 4.03,
      Materials: 3.21,
      Utilities: 2.3,
      "Real Estate": 1.52,
    },
    pays: {
      "États-Unis": 72.94,
      Japon: 5.91,
      "Royaume-Uni": 3.41,
      Canada: 3.29,
      France: 2.24,
      // La fiche ne détaille que les cinq premiers pays.
      "Autres pays développés": 12.21,
    },
  },
};

/**
 * ETF → indice répliqué. Ces ETF éligibles au PEA répliquent le MSCI World
 * de façon synthétique (par un contrat d'échange) : le panier qu'ils
 * détiennent physiquement est européen, mais l'exposition économique — celle
 * qui fait varier leur valeur — est celle de l'indice. C'est elle qui compte
 * pour savoir à quoi l'on est exposé.
 */
export const ETF_INDICE = {
  "CW8.PA": "MSCI World", // Amundi MSCI World Swap UCITS ETF
  "EWLD.PA": "MSCI World", // Amundi PEA Monde (MSCI World) UCITS ETF
  "WPEA.PA": "MSCI World", // iShares MSCI World Swap PEA UCITS ETF
};

/** Secteurs GICS de la source → secteurs de l'application. */
export const SECTEUR_GICS = {
  "Information Technology": "Technologie",
  Financials: "Finance",
  Industrials: "Industrie",
  "Health Care": "Santé & pharmacie",
  "Consumer Discretionary": "Biens de consommation",
  "Consumer Staples": "Biens de consommation",
  "Communication Services": "Télécoms & médias",
  Energy: "Énergie",
  Materials: "Matériaux",
  Utilities: "Utilities & infrastructures",
  "Real Estate": "Immobilier",
};

/** Indice répliqué par un ETF connu, avec sa composition ; `null` sinon. */
export function compositionDe(ticker) {
  const nom = ETF_INDICE[String(ticker || "").toUpperCase()];
  return nom ? { indice: nom, ...INDICES[nom] } : null;
}

/** Normalise un jeu de poids publiés pour que leur somme fasse exactement 1. */
function normaliser(poids) {
  const total = Object.values(poids).reduce((s, v) => s + v, 0);
  return total > 0 ? Object.entries(poids).map(([cle, v]) => [cle, v / total]) : [];
}

/** Poids sectoriels d'un indice, dans les secteurs de l'application (somme = 1). */
export function poidsSectorielsIndice(composition) {
  const parSecteur = new Map();
  for (const [gics, part] of normaliser(composition?.secteurs || {})) {
    const secteur = SECTEUR_GICS[gics];
    if (!secteur) continue;
    parSecteur.set(secteur, (parSecteur.get(secteur) || 0) + part);
  }
  return [...parSecteur.entries()];
}

/** Poids géographiques d'un indice (somme = 1). */
export function poidsPaysIndice(composition) {
  return normaliser(composition?.pays || {});
}
