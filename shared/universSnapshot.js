/**
 * Format d'instantané d'univers — encodage colonnaire.
 *
 * Le screener interrogeait Yahoo à chaque écran, titre par titre. À 162
 * valeurs c'était déjà plusieurs secondes ; à quelques milliers c'est
 * impossible — le seul quota de `/api/market?action=screen` (20 requêtes par
 * minute) imposerait plus de sept minutes d'attente avant même que Yahoo ne
 * commence à renvoyer des 429.
 *
 * Or les fondamentaux d'un univers entier tiennent dans un fichier statique :
 * 2 970 titres pèsent 145 Ko compressés en colonnaire, contre 234 Ko en
 * tableau d'objets — moins que `recharts`, que l'application télécharge déjà.
 * Ils sont donc générés hors ligne (voir `scripts/rafraichir-univers.mjs`),
 * servis comme un actif statique, et filtrés dans le navigateur. Le screening
 * devient instantané et ne consomme plus aucun appel réseau.
 *
 * POURQUOI COLONNAIRE. Un tableau d'objets répète les 22 noms de champs à
 * chaque ligne. En colonnes, ils n'apparaissent qu'une fois, et les valeurs
 * de même nature se retrouvent contiguës — ce que la compression exploite
 * bien mieux. Les champs textuels très répétitifs (secteur, industrie, pays,
 * devise) passent par un dictionnaire : la ligne ne stocke qu'un index.
 *
 * Module pur, partagé par le script de génération et par le navigateur.
 */

/** Version du format. Un instantané d'une autre version est ignoré. */
export const VERSION_INSTANTANE = 1;

/**
 * Champs retenus.
 *
 * Strictement ceux dont le screener a besoin : les critères de `screener.js`,
 * plus l'identité et ce qu'exige la suggestion de diversification. Tout le
 * reste — flux de trésorerie, objectif de cours, nombre d'analystes,
 * historique annuel — n'est lu que dans la fiche détaillée, qui reste en
 * direct pour un seul titre à la fois.
 */
export const CHAMPS_TEXTE = ["symbole", "nom"];
export const CHAMPS_DICO = ["secteur", "industrie", "pays", "devise"];
export const CHAMPS_NOMBRE = [
  "cours",
  "capitalisation",
  "per",
  "perForward",
  "peg",
  "priceToBook",
  "evEbitda",
  "rendementPct",
  "payoutPct",
  "roePct",
  "margeNettePct",
  "margeOperationnellePct",
  "detteSurFondsPropresPct",
  "ratioLiquidite",
  "beta",
  "positionFourchettePct",
];
/** Éligibilité PEA, calculée à la génération : un booléen, stocké en 0/1. */
export const CHAMPS_BOOLEEN = ["eee"];

export const CHAMPS = [...CHAMPS_TEXTE, ...CHAMPS_DICO, ...CHAMPS_NOMBRE, ...CHAMPS_BOOLEEN];

/**
 * Arrondi de stockage.
 *
 * Deux décimales suffisent à tous les critères : personne ne départage deux
 * titres sur le troisième chiffre d'un PER. Les capitalisations, elles, sont
 * arrondies à l'entier — une décimale sur un milliard n'est que du bruit qui
 * compresse mal.
 */
function arrondir(cle, valeur) {
  if (valeur == null || !Number.isFinite(valeur)) return null;
  if (cle === "capitalisation") return Math.round(valeur);
  return Math.round(valeur * 100) / 100;
}

/**
 * Encode une liste de titres en instantané compact.
 *
 * @param {Array<object>} titres  objets plats portant les champs de CHAMPS
 * @param {object} meta           { univers, libelle, genereLe, source }
 */
export function encoderInstantane(titres, meta = {}) {
  const lignes = (titres || []).filter((t) => t && t.symbole);

  const dico = {};
  const indexDico = {};
  for (const cle of CHAMPS_DICO) {
    const valeurs = [...new Set(lignes.map((l) => l[cle]).filter((v) => v != null && v !== ""))].sort();
    dico[cle] = valeurs;
    indexDico[cle] = new Map(valeurs.map((v, i) => [v, i]));
  }

  const colonnes = {};
  for (const cle of CHAMPS_TEXTE) colonnes[cle] = lignes.map((l) => l[cle] ?? null);
  for (const cle of CHAMPS_DICO) {
    // -1 plutôt que null : une colonne d'entiers homogène compresse mieux, et
    // le décodage retraduit -1 en null.
    colonnes[cle] = lignes.map((l) => indexDico[cle].get(l[cle]) ?? -1);
  }
  for (const cle of CHAMPS_NOMBRE) colonnes[cle] = lignes.map((l) => arrondir(cle, l[cle]));
  for (const cle of CHAMPS_BOOLEEN) colonnes[cle] = lignes.map((l) => (l[cle] ? 1 : 0));

  return {
    version: VERSION_INSTANTANE,
    ...meta,
    nbTitres: lignes.length,
    dico,
    colonnes,
  };
}

/**
 * Décode un instantané vers la forme que le moteur de screener attend déjà
 * (`shared/screener.js` lit des objets plats indexés par nom de critère).
 *
 * `ok: true` est posé sur chaque ligne : le moteur distingue les titres non
 * évaluables des titres qui échouent à un critère, et un titre présent dans
 * l'instantané a bien été récupéré — c'est l'absence de CERTAINS champs qui
 * ressortira en « indéterminé », ligne par ligne.
 */
export function decoderInstantane(instantane) {
  if (!instantane || instantane.version !== VERSION_INSTANTANE) return [];
  const { dico = {}, colonnes = {}, nbTitres = 0 } = instantane;

  const titres = [];
  for (let i = 0; i < nbTitres; i++) {
    const titre = { ok: true };
    for (const cle of CHAMPS_TEXTE) titre[cle] = colonnes[cle]?.[i] ?? null;
    for (const cle of CHAMPS_DICO) {
      const index = colonnes[cle]?.[i] ?? -1;
      titre[cle] = index >= 0 ? dico[cle]?.[index] ?? null : null;
    }
    for (const cle of CHAMPS_NOMBRE) {
      const v = colonnes[cle]?.[i];
      titre[cle] = Number.isFinite(v) ? v : null;
    }
    for (const cle of CHAMPS_BOOLEEN) titre[cle] = colonnes[cle]?.[i] === 1;
    titres.push(titre);
  }
  return titres;
}

/**
 * Nombre de champs numériques réellement renseignés, sur le total possible.
 *
 * Indispensable dès qu'on descend vers les petites capitalisations : la
 * couverture Yahoo y est lacunaire, et un titre noté sur trois critères sur
 * quinze ne vaut pas un titre noté sur quinze. Le moteur compte déjà les
 * critères « indéterminés » par recette ; ceci mesure la donnée disponible
 * indépendamment de toute recette.
 */
export function couvertureTitre(titre) {
  const renseignes = CHAMPS_NOMBRE.filter((c) => Number.isFinite(titre?.[c])).length;
  return { renseignes, total: CHAMPS_NOMBRE.length, pct: (renseignes / CHAMPS_NOMBRE.length) * 100 };
}
