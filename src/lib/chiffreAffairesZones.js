/**
 * Chiffre d'affaires des sociétés par zone géographique — pour situer une
 * action là où elle VEND, et non là où elle est cotée.
 *
 * Rangée d'après son suffixe `.PA`, Vusion passait pour 100 % française alors
 * que l'essentiel de ses ventes se fait aux États-Unis ; Air Liquide n'en fait
 * qu'un huitième en France. Le siège dit où une société est domiciliée ; son
 * chiffre d'affaires dit à quelles économies son résultat est exposé.
 *
 * RÈGLES DE CE CATALOGUE — les mêmes que celles des indices (compositionEtf.js)
 *  - Uniquement des montants PUBLIÉS, recopiés tels quels en millions d'euros,
 *    avec leur source, l'exercice et la date de publication. La part de
 *    chaque zone se calcule à partir d'eux.
 *  - Les sociétés publient des ZONES, rarement des pays, et chacune découpe à
 *    sa façon. Une ligne de la source qui tient dans une zone de l'application
 *    y est rangée ; une ligne qui en chevauche plusieurs (« EMEA »,
 *    « Amériques et Asie-Pacifique ») reste un BLOC, affiché tel quel. Il
 *    n'est jamais découpé au jugé.
 *  - À remettre à jour chaque printemps, après les rapports annuels.
 *
 * Une action absente du catalogue garde le pays de sa place de cotation, et
 * l'écran dit quelle part du portefeuille en relève.
 */

/** Zones de l'application, du plus proche au plus lointain. */
export const ZONES = ["France", "Europe hors France", "Amériques", "Asie-Pacifique", "Afrique & Moyen-Orient"];

/**
 * Pays → zone, pour ranger les lignes situées d'après un pays (siège des
 * sociétés d'un indice, pays enregistré, place de cotation). Noms tels que les
 * écrivent compositionEtf.js et eligibilitePea.js.
 */
export const ZONE_DU_PAYS = {
  France: "France",
  Allemagne: "Europe hors France",
  Autriche: "Europe hors France",
  Belgique: "Europe hors France",
  Danemark: "Europe hors France",
  Espagne: "Europe hors France",
  Finlande: "Europe hors France",
  Grèce: "Europe hors France",
  Hongrie: "Europe hors France",
  Irlande: "Europe hors France",
  Italie: "Europe hors France",
  Luxembourg: "Europe hors France",
  Norvège: "Europe hors France",
  "Pays-Bas": "Europe hors France",
  Pologne: "Europe hors France",
  Portugal: "Europe hors France",
  "Royaume-Uni": "Europe hors France",
  Suède: "Europe hors France",
  Suisse: "Europe hors France",
  Tchéquie: "Europe hors France",
  "États-Unis": "Amériques",
  Canada: "Amériques",
  Brésil: "Amériques",
  Mexique: "Amériques",
  Japon: "Asie-Pacifique",
  Chine: "Asie-Pacifique",
  "Hong Kong": "Asie-Pacifique",
  Australie: "Asie-Pacifique",
  "Corée du Sud": "Asie-Pacifique",
  Inde: "Asie-Pacifique",
  Singapour: "Asie-Pacifique",
  Taïwan: "Asie-Pacifique",
  Israël: "Afrique & Moyen-Orient",
  "Afrique du Sud": "Afrique & Moyen-Orient",
};

export const zoneDuPays = (pays) => ZONE_DU_PAYS[pays] || null;

/**
 * Ticker → chiffre d'affaires par zone. Chaque ligne porte le libellé de la
 * source, son montant, et SOIT la zone de l'application où elle se range,
 * SOIT le bloc qu'elle forme quand elle en chevauche plusieurs.
 */
export const REPARTITION_CA = {
  "DG.PA": {
    societe: "VINCI",
    exercice: 2025,
    source: "VINCI — Rapport sur les comptes de l'exercice 2025, « Chiffre d'affaires par zone géographique »",
    url: "https://www.vinci.com/publi/vinci/vinci-rapport-comptes-exercice-2025.pdf",
    // Le rapport n'est pas daté ; c'est la date du fichier publié.
    date: "2026-02-09",
    // Total 74 599 M€, hors chiffre d'affaires travaux hors Groupe des
    // filiales concessionnaires (note de la source).
    lignes: [
      { libelle: "France", montant: 30787, zone: "France" },
      { libelle: "Royaume-Uni", montant: 7362, zone: "Europe hors France" },
      { libelle: "Allemagne", montant: 6485, zone: "Europe hors France" },
      { libelle: "Espagne", montant: 3780, zone: "Europe hors France" },
      { libelle: "Europe centrale et orientale", montant: 3297, zone: "Europe hors France" },
      { libelle: "Autres pays d'Europe", montant: 7587, zone: "Europe hors France" },
      { libelle: "Amérique du Nord", montant: 5434, zone: "Amériques" },
      { libelle: "Amérique centrale et du Sud", montant: 4294, zone: "Amériques" },
      { libelle: "Afrique", montant: 1768, zone: "Afrique & Moyen-Orient" },
      // La source ne dit pas ce que recouvre ce reste.
      { libelle: "Reste du monde", montant: 3805, bloc: "Reste du monde" },
    ],
  },
  "SU.PA": {
    societe: "Schneider Electric",
    exercice: 2025,
    // Le rapport annuel, qui isolerait la France, n'est pas téléchargeable
    // hors navigateur ; le communiqué déposé à l'AMF ne la sépare pas.
    source: "Schneider Electric — communiqué des résultats annuels 2025, chiffre d'affaires par région (déposé à l'AMF)",
    url: "https://echanges.dila.gouv.fr/OPENDATA/AMF/ECO/2026/02/FCECO081067_20260226.pdf",
    date: "2026-02-26",
    lignes: [
      { libelle: "Amérique du Nord", montant: 15438, zone: "Amériques" },
      { libelle: "Europe de l'Ouest", montant: 9316, bloc: "Europe de l'Ouest (France comprise)" },
      { libelle: "Asie-Pacifique", montant: 10497, zone: "Asie-Pacifique" },
      // Moyen-Orient, Afrique, Amérique du Sud, Europe centrale et de l'Est,
      // d'après le commentaire du communiqué.
      { libelle: "Reste du Monde", montant: 4901, bloc: "Reste du monde" },
    ],
  },
  "AI.PA": {
    societe: "Air Liquide",
    exercice: 2025,
    // Ventilé par zone de PRODUCTION (pays d'origine) : pour des gaz livrés
    // près de leur lieu de production, c'est aussi là où ils sont vendus.
    source: "Air Liquide — Document d'enregistrement universel 2025, note 2.5 « Other information on geographical areas »",
    url: "https://www.airliquide.com/sites/airliquide.com/files/2026-03/air-liquide-2025-universal-registration-document-interactive.pdf",
    date: "2026-03-06",
    lignes: [
      { libelle: "France", montant: 3264.7, zone: "France" },
      { libelle: "Europe, Middle East and Africa excl. France", montant: 7890.7, bloc: "Europe hors France + Afrique & Moyen-Orient" },
      { libelle: "United States", montant: 9009.5, zone: "Amériques" },
      { libelle: "Americas excl. United States", montant: 1527.1, zone: "Amériques" },
      { libelle: "Asia Pacific", montant: 5248.2, zone: "Asie-Pacifique" },
    ],
  },
  "VU.PA": {
    societe: "VusionGroup",
    exercice: 2025,
    // Données IFRS. Le rapport annuel isole la France (note 15 « Chiffre
    // d'affaires » en 2024) ; celui de 2025 reste à récupérer.
    source: "VusionGroup — communiqué des résultats annuels 2025, chiffre d'affaires IFRS par région (déposé à l'AMF)",
    url: "https://echanges.dila.gouv.fr/OPENDATA/AMF/ACT/2026/02/FCACT078445_20260226.pdf",
    date: "2026-02-26",
    lignes: [
      { libelle: "EMEA", montant: 414.6, bloc: "EMEA (France comprise)" },
      { libelle: "Reste du Monde (Amériques et Asie-Pacifique)", montant: 1057.4, bloc: "Amériques + Asie-Pacifique" },
    ],
  },
};

/** Répartition publiée du chiffre d'affaires d'une société ; `null` sinon. */
export function repartitionCaDe(ticker) {
  return REPARTITION_CA[String(ticker || "").toUpperCase()] || null;
}

/**
 * Parts du chiffre d'affaires (somme = 1), chacune rangée dans une zone ou
 * laissée en bloc.
 * @returns {Array<{libelle: string, part: number, zone?: string, bloc?: string}>}
 */
export function partsDuChiffreAffaires(repartition) {
  const lignes = repartition?.lignes || [];
  const total = lignes.reduce((s, l) => s + l.montant, 0);
  if (!(total > 0)) return [];
  return lignes.map(({ montant, ...reste }) => ({ ...reste, part: montant / total }));
}
