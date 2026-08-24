import {
  createLedgerBaseline,
  operationsAfterBaseline,
  rebuildPositionsFromOperations,
  totalCashDelta,
  computeInvestedCapital,
  investedCapitalAsOf,
  valeurPosition,
  todayIso,
} from "./finance";

/**
 * Rattrapage de l'historique — reconstituer ce qu'une absence a laissé vide.
 *
 * LE TROU QU'ON BOUCHE. Le relevé de performance est pris côté client, au
 * montage de l'onglet Bourse, une fois par jour. Pas d'ouverture, pas de
 * point : une semaine sans lancer l'application laisse sept cases vides dans
 * le calendrier et sept jours manquants dans toutes les courbes. Rien ne les
 * remplira jamais, puisque le relevé ne sait prendre que le jour même.
 *
 * POURQUOI RECONSTITUER PLUTÔT QUE RELEVER À DISTANCE. Un travail planifié
 * côté serveur aurait supposé une clé de service capable de lire et d'écrire
 * les données de tous les utilisateurs, RLS contournée — la première du
 * projet. La reconstitution n'a besoin de rien de tout cela : le journal
 * d'opérations est daté, la route `history` sait rendre les clôtures passées,
 * et les deux suffisent à recalculer chaque jour manquant.
 *
 * Elle est même PLUS JUSTE. Un relevé pris à 17 h 45 est une lecture
 * approximative en cours de séance ; la reconstitution utilise la clôture
 * réelle. Et elle n'a aucun angle mort de fuseau : les indices américains, que
 * tout relevé européen attraperait à mi-séance, sont lus à leur vraie clôture.
 *
 * TROIS RETENUES, qui expliquent la forme du code plus bas :
 *
 *  · le calendrier boursier n'est PAS déduit d'une règle sur les jours de la
 *    semaine, mais des dates réellement présentes dans la série Yahoo — c'est
 *    la seule façon d'attraper les jours fériés sans les énumérer ;
 *  · un jour déjà relevé n'est jamais réécrit, même si la reconstitution le
 *    croit plus exact : l'utilisateur peut avoir corrigé ou supprimé une
 *    entrée à la main, et une reconstitution qui écrase ce geste est une perte
 *    de données silencieuse ;
 *  · une division d'action à l'intérieur de la fenêtre rend les jours qui la
 *    précèdent INCALCULABLES, et ils sont laissés vides plutôt que remplis
 *    d'une valeur plausible. Voir `premierJourFiable`.
 */

/** Plage Yahoo la plus courte qui couvre encore l'absence. */
export function plagePour(joursDAbsence) {
  if (joursDAbsence <= 25) return "1mo";
  if (joursDAbsence <= 80) return "3mo";
  if (joursDAbsence <= 170) return "6mo";
  return "1y";
}

/**
 * Au-delà d'un an, ce n'est plus une absence : c'est une nouvelle
 * installation, ou un historique qu'on ne cherche pas à inventer.
 */
export const ABSENCE_MAX_JOURS = 365;

const JOUR_MS = 86400000;

const ecartJours = (a, b) =>
  Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / JOUR_MS);

/**
 * Dates de cotation manquantes dans l'historique.
 *
 * Le calendrier de référence vient des séries elles-mêmes : une date pour
 * laquelle Yahoo a coté est un jour ouvré, un jour férié n'y figure tout
 * simplement pas. Déduire les jours ouvrés d'une règle « lundi à vendredi »
 * ferait apparaître le 1er mai et le 25 décembre comme des trous à combler,
 * qu'aucune donnée ne pourrait jamais remplir.
 *
 * @param {{date: string}[]} historique  Relevés déjà en base.
 * @param {string[]} datesCotees         Dates de cotation, tous symboles confondus.
 * @param {string} aujourdhui
 * @returns {string[]} Dates ISO à reconstituer, dans l'ordre.
 */
export function joursManquants(historique = [], datesCotees = [], aujourdhui = todayIso()) {
  const connues = new Set((historique || []).map((e) => e.date));

  // La borne basse est le dernier relevé connu : avant lui, l'absence de
  // point ne vient pas d'une absence de l'utilisateur mais d'un historique qui
  // n'avait pas encore commencé — ou d'une suppression volontaire.
  const dernier = (historique || [])
    .map((e) => e.date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return [...new Set(datesCotees)]
    .filter((d) => d < aujourdhui) // le jour même reste l'affaire du relevé
    .filter((d) => (dernier ? d > dernier : true))
    .filter((d) => !connues.has(d))
    .filter((d) => ecartJours(d, aujourdhui) <= ABSENCE_MAX_JOURS)
    .sort();
}

/**
 * Premier jour à partir duquel la reconstitution est fiable.
 *
 * Les cours rendus par Yahoo sont AJUSTÉS DES DIVISIONS : sur une date
 * antérieure à un split, la série porte déjà le cours d'après-split. Le journal
 * d'opérations, lui, ne divise la quantité qu'à la date du split. Multiplier
 * l'un par l'autre sur un jour antérieur donnerait une valeur divisée par le
 * ratio — un chiffre parfaitement plausible et faux d'un facteur entier.
 *
 * Plutôt que de désajuster les cours à rebours, on renonce aux jours concernés.
 * C'est la même règle que partout ailleurs dans Patrium : une case vide vaut
 * mieux qu'une valeur inventée.
 */
export function premierJourFiable(operations = [], depuis) {
  const splits = (operations || [])
    .filter((op) => op?.type === "SPLIT" && op.date && op.date >= depuis)
    .map((op) => op.date)
    .sort();
  return splits.length ? splits.at(-1) : depuis;
}

/**
 * Reconstitue les relevés manquants.
 *
 * @param {object} p
 * @param {object} p.bourse            État `bourse` courant (journal + socle).
 * @param {string[]} p.dates           Jours à reconstituer, issus de `joursManquants`.
 * @param {Record<string, Record<string, number>>} p.clotures
 *        Cours de clôture indexés par symbole puis par date.
 * @param {Record<string, string>} p.indices  Symbole d'indice -> clé de sortie.
 * @returns {{date, valeur, capital, sp500, cac40, msciWorld, reconstitue: true}[]}
 */
export function reconstituer({ bourse, dates = [], clotures = {}, indices = {} }) {
  if (!bourse || dates.length === 0) return [];

  const baseline = bourse.ledgerBaseline || createLedgerBaseline(bourse);
  const rejouables = operationsAfterBaseline(bourse.operations || [], baseline);
  const capitalSerie = computeInvestedCapital(bourse);

  const debutFiable = premierJourFiable(bourse.operations, dates[0]);

  const releves = [];

  for (const date of dates) {
    if (date < debutFiable) continue;

    // État du portefeuille CE JOUR-LÀ : le journal est daté, il suffit de le
    // rejouer jusqu'à la date voulue. Achats, ventes et divisions y sont donc
    // pris en compte exactement comme ils l'ont été à l'époque.
    const jusquIci = rejouables.filter((op) => op.date && op.date <= date);
    const positions = rebuildPositionsFromOperations(jusquIci, bourse.positions, baseline.lots);
    const cash = (baseline.cashOpening || 0) + totalCashDelta(jusquIci);

    // Une ligne dont le cours du jour manque rend le relevé INCOMPLET : mieux
    // vaut sauter la journée que de la valoriser avec un cours d'un autre jour
    // ou avec le prix de revient, ce qui ferait apparaître une variation
    // imaginaire dans le calendrier.
    let complet = true;
    let valeur = 0;
    for (const p of positions) {
      if (!p?.quantity) continue;
      const cours = clotures[p.ticker]?.[date];
      if (cours == null) {
        complet = false;
        break;
      }
      /*
       * Le taux de change appliqué est celui d'AUJOURD'HUI, pas celui du jour
       * reconstitué : Patrium ne conserve pas d'historique de change. Sur une
       * absence de quelques jours l'écart se compte en dixièmes de pour cent,
       * très en dessous de ce que vaut la présence du point ; il grandirait
       * sur un an, d'où le plafond d'absence. C'est le seul endroit du
       * rattrapage qui approxime, et `reconstitue: true` le signale.
       */
      valeur += valeurPosition({ ...p, current_price: cours });
    }
    if (!complet) continue;

    const entree = {
      date,
      valeur: Math.round(valeur + cash),
      capital: Math.round(investedCapitalAsOf(capitalSerie, date)),
      // Marque la provenance : ce point vient d'une clôture reconstituée, pas
      // d'un relevé pris en séance. L'interface peut le signaler, et un futur
      // correctif peut le recalculer sans toucher aux relevés d'origine.
      reconstitue: true,
    };

    for (const [symbole, cle] of Object.entries(indices)) {
      entree[cle] = clotures[symbole]?.[date] ?? null;
    }

    releves.push(entree);
  }

  return releves;
}

/** Indexe la réponse de `fetchHistory` par symbole puis par date. */
export function indexerClotures(reponses = []) {
  const parSymbole = {};
  for (const r of reponses || []) {
    if (!r?.ok || !Array.isArray(r.series)) continue;
    const parDate = {};
    for (const point of r.series) {
      // Les séries intraday portent un horodatage complet : on ne garde que la
      // partie date, et le dernier point de la journée l'emporte — c'est la
      // clôture.
      if (point?.close == null || !point.date) continue;
      parDate[String(point.date).slice(0, 10)] = point.close;
    }
    parSymbole[r.symbol] = parDate;
  }
  return parSymbole;
}

/** Dates de cotation présentes dans au moins une série. */
export function datesCotees(clotures = {}) {
  const dates = new Set();
  for (const parDate of Object.values(clotures)) {
    for (const d of Object.keys(parDate)) dates.add(d);
  }
  return [...dates].sort();
}
