/**
 * Catalogue de référence des taux financiers français et européens.
 *
 * ─── Pourquoi des valeurs codées en dur plutôt qu'une API 100% live ───────────
 * La Banque de France publie ses 40 000+ séries statistiques (dont tous les
 * taux réglementés) via son portail Webstat, mais l'accès PUBLIC et SANS CLÉ
 * (Opendatasoft Explore API) ne sert que le catalogue de métadonnées — pas les
 * valeurs elles-mêmes. Vérifié par appel direct : sur les 42 000+ jeux de
 * données du catalogue public, un seul expose des enregistrements requêtables,
 * et ce n'est pas une série de taux. Les vraies valeurs ne sont accessibles
 * qu'via l'API sécurisée (api.webstat.banque-france.fr, authentification
 * X-IBM-Client-Id obtenue par inscription gratuite sur
 * developer.webstat.banque-france.fr).
 *
 * Ce fichier est donc la source de vérité par défaut — comme
 * `MARKET_ALTERNATIVES`/`MARKET_BENCHMARKS` dans finance.js, des valeurs
 * officielles maintenues à la main, avec leur date d'entrée en vigueur et leur
 * source citée. Si `WEBSTAT_CLIENT_ID` est configuré côté serveur (voir
 * api/_lib/webstat.js), `api/_lib/routes/rates.js` tente de rafraîchir en direct les
 * quelques séries dont la clé est confirmée (voir `seriesKey` ci-dessous) et
 * remplace la valeur de référence en cas de succès — sinon celle-ci reste
 * affichée, clairement marquée comme non vérifiée en direct.
 *
 * Valeurs vérifiées le 26/07/2026 auprès de sources officielles (Banque de
 * France, INSEE, BCE) — voir le champ `source` de chaque entrée.
 */

export const RATE_CATEGORIES = {
  epargne: { label: "Épargne réglementée", color: "#34d399", short: "Épargne" },
  credit: { label: "Crédit & emprunt", color: "#fb7185", short: "Crédit" },
  marche: { label: "Banques centrales & marché", color: "#818cf8", short: "Marché" },
  inflation: { label: "Inflation & indices", color: "#fbbf24", short: "Inflation" },
  fiscalite: { label: "Fiscalité de l'épargne", color: "#22d3ee", short: "Fiscalité" },
};

/**
 * `seriesKey` : identifiant de série Webstat confirmé (existence vérifiée via
 * la page catalogue publique), utilisé par api/_lib/routes/rates.js pour tenter un
 * rafraîchissement live si une clé API est configurée. `null` quand aucune
 * série Webstat correspondante n'a été identifiée (ex : données BCE ou INSEE,
 * publiées par d'autres portails).
 */
export const RATES_CATALOG = [
  // ─── Épargne réglementée ────────────────────────────────────────────────
  {
    id: "livret-a",
    label: "Livret A",
    category: "epargne",
    value: 1.7,
    unit: "% net",
    effectiveDate: "2026-08-01",
    nextReview: "2027-02-01",
    reviewFrequency: "Révisé le 1er février et le 1er août de chaque année",
    plafond: 22950,
    source: "Banque de France / Ministère de l'Économie",
    seriesKey: "MIR1.M.FR.B.L23FRLA.D.R.A.2230U6.EUR.O",
    description: "Épargne défiscalisée, sans risque, disponible à tout moment. Référence de taux sans risque pour l'épargne de précaution.",
  },
  {
    id: "ldds",
    label: "LDDS (Livret Développement Durable et Solidaire)",
    category: "epargne",
    value: 1.7,
    unit: "% net",
    effectiveDate: "2026-08-01",
    nextReview: "2027-02-01",
    reviewFrequency: "Aligné sur le taux du Livret A",
    plafond: 12000,
    source: "Banque de France / Ministère de l'Économie",
    seriesKey: null,
    description: "Mêmes conditions que le Livret A (taux, disponibilité, défiscalisation), plafond de versement plus bas.",
  },
  {
    id: "lep",
    label: "LEP (Livret d'Épargne Populaire)",
    category: "epargne",
    value: 2.5,
    unit: "% net",
    effectiveDate: "2026-08-01",
    nextReview: "2027-02-01",
    reviewFrequency: "Révisé le 1er février et le 1er août — peut déroger à la formule légale par décision ministérielle",
    plafond: 10000,
    source: "Banque de France / Ministère de l'Économie",
    seriesKey: "MIR1.M.FR.B.L23FRLP.H.R.A.2250U6.EUR.O",
    description: "Réservé aux foyers modestes sous condition de revenu fiscal de référence. Le taux théorique (formule légale) aurait dû baisser à 2,2 % ; maintenu à 2,5 % par arbitrage ministériel.",
    condition: "Revenu fiscal de référence ≤ 21 393 € (part fiscale seule)",
  },
  {
    id: "livret-jeune",
    label: "Livret Jeune",
    category: "epargne",
    value: 1.7,
    unit: "% net (minimum légal)",
    effectiveDate: "2026-08-01",
    nextReview: "2027-02-01",
    reviewFrequency: "Minimum légal aligné sur le Livret A ; chaque banque peut proposer plus",
    plafond: 1600,
    source: "Banque de France",
    seriesKey: null,
    description: "Réservé aux 12-25 ans. Le taux affiché est le plancher réglementaire — les réseaux bancaires proposent souvent davantage.",
    condition: "12 à 25 ans révolus",
  },
  {
    id: "cel",
    label: "CEL (Compte Épargne Logement)",
    category: "epargne",
    value: 1.25,
    unit: "% brut",
    netValue: 0.85,
    effectiveDate: "2026-08-01",
    nextReview: "2027-02-01",
    reviewFrequency: "Révisé le 1er février et le 1er août",
    plafond: 15300,
    source: "Banque de France",
    seriesKey: "MIR1.M.FR.B.L23FRCL.D.R.A.2230U6.EUR.O",
    description: "Taux brut soumis à la flat tax (30 %), soit un taux net d'environ 0,85 %. Donne accès à un prêt épargne-logement à taux préférentiel.",
  },
  {
    id: "pel",
    label: "PEL (Plan Épargne Logement) — nouveaux plans",
    category: "epargne",
    value: 1.75,
    unit: "% brut",
    effectiveDate: "2026-01-01",
    nextReview: "2027-01-01",
    reviewFrequency: "Fixé à l'ouverture du plan, garanti pendant toute sa durée (contrairement aux autres livrets)",
    plafond: 61200,
    source: "Banque de France",
    seriesKey: null,
    description: "Le taux ne concerne que les PEL ouverts après la date d'effet : un PEL existant conserve le taux de son ouverture, quelles que soient les révisions ultérieures.",
  },

  // ─── Crédit & emprunt ───────────────────────────────────────────────────
  {
    id: "usure-immo-20ans",
    label: "Taux d'usure — prêt immobilier ≥ 20 ans",
    category: "credit",
    value: 5.19,
    unit: "% (TAEG maximum)",
    effectiveDate: "2026-07-01",
    nextReview: "2026-10-01",
    reviewFrequency: "Révisé chaque trimestre (1er janvier, avril, juillet, octobre)",
    source: "Banque de France",
    seriesKey: null,
    description: "Taux annuel effectif global maximum légal qu'une banque peut pratiquer sur ce type de prêt. Marge confortable au-dessus des taux moyens constatés (≈ 3,3 %).",
  },
  {
    id: "credit-immo-20ans-moyen",
    label: "Taux moyen constaté — crédit immobilier 20 ans",
    category: "credit",
    value: 3.3,
    unit: "% (hors assurance, indicatif)",
    effectiveDate: "2026-07-01",
    nextReview: "2026-08-01",
    reviewFrequency: "Baromètre mensuel, moyenne de plusieurs courtiers",
    source: "Baromètres courtiers (moyenne, hors assurance)",
    seriesKey: null,
    description: "Moyenne indicative des barèmes bancaires observés par les courtiers en crédit sur 20 ans. Sert de repère pour l'onglet Immobilier & Crédit — à comparer à ton hypothèse de simulation.",
  },
  {
    id: "euribor-3m",
    label: "Euribor 3 mois",
    category: "credit",
    value: 2.05,
    unit: "%",
    effectiveDate: "2026-07-01",
    nextReview: null,
    reviewFrequency: "Publié quotidiennement par l'European Money Markets Institute",
    source: "European Money Markets Institute (EMMI)",
    seriesKey: null,
    description: "Taux interbancaire de référence pour les crédits à taux variable. Valeur indicative, susceptible d'évoluer entre deux mises à jour de ce catalogue.",
  },

  // ─── Banques centrales & marché ─────────────────────────────────────────
  {
    id: "bce-depot",
    label: "BCE — Taux de la facilité de dépôt",
    category: "marche",
    value: 2.25,
    unit: "%",
    effectiveDate: "2026-07-23",
    nextReview: "2026-09-10",
    reviewFrequency: "Décidé lors de chaque réunion du Conseil des gouverneurs (≈ toutes les 6 semaines)",
    source: "Banque centrale européenne",
    seriesKey: null,
    description: "Rémunération des dépôts bancaires auprès de la BCE — référence de taux sans risque au niveau de la zone euro, sert de plancher aux taux d'épargne bancaire.",
  },
  {
    id: "bce-refi",
    label: "BCE — Taux de refinancement principal",
    category: "marche",
    value: 2.4,
    unit: "%",
    effectiveDate: "2026-07-23",
    nextReview: "2026-09-10",
    reviewFrequency: "Décidé lors de chaque réunion du Conseil des gouverneurs",
    source: "Banque centrale européenne",
    seriesKey: null,
    description: "Coût de refinancement des banques auprès de la BCE — influence directement le coût du crédit dans la zone euro.",
  },
  {
    id: "bce-pret-marginal",
    label: "BCE — Taux de la facilité de prêt marginal",
    category: "marche",
    value: 2.65,
    unit: "%",
    effectiveDate: "2026-07-23",
    nextReview: "2026-09-10",
    reviewFrequency: "Décidé lors de chaque réunion du Conseil des gouverneurs",
    source: "Banque centrale européenne",
    seriesKey: null,
    description: "Taux plafond auquel les banques empruntent en urgence auprès de la BCE, au jour le jour.",
  },

  // ─── Inflation & indices ─────────────────────────────────────────────────
  {
    id: "inflation-ipc",
    label: "Inflation France (IPC, glissement annuel)",
    category: "inflation",
    value: 1.8,
    unit: "% sur un an",
    effectiveDate: "2026-06-01",
    nextReview: "2026-08-13",
    reviewFrequency: "Publication mensuelle par l'INSEE (~13 du mois pour le mois précédent)",
    source: "INSEE",
    seriesKey: null,
    description: "Variation sur un an de l'indice des prix à la consommation. Repère pour juger si tes rendements d'épargne couvrent l'érosion du pouvoir d'achat (voir le simulateur d'inflation dans l'onglet Simulation).",
  },
  {
    id: "inflation-sous-jacente",
    label: "Inflation sous-jacente (hors énergie et produits frais)",
    category: "inflation",
    value: 1.0,
    unit: "% sur un an",
    effectiveDate: "2026-06-01",
    nextReview: "2026-08-13",
    reviewFrequency: "Publication mensuelle INSEE",
    source: "INSEE",
    seriesKey: null,
    description: "Mesure la tendance de fond des prix en excluant les composantes les plus volatiles (énergie, produits frais).",
  },

  // ─── Fiscalité de l'épargne ──────────────────────────────────────────────
  {
    id: "flat-tax",
    label: "Prélèvement Forfaitaire Unique (flat tax)",
    category: "fiscalite",
    value: 30,
    unit: "% (12,8 % IR + 17,2 % prélèvements sociaux)",
    effectiveDate: "2018-01-01",
    nextReview: null,
    reviewFrequency: "Fixé par la loi de finances — stable depuis 2018",
    source: "Code général des impôts, art. 200 A",
    seriesKey: null,
    description: "S'applique par défaut aux revenus du capital (dividendes, plus-values, intérêts hors livrets défiscalisés) sauf option pour le barème progressif.",
  },
  {
    id: "ps-livrets-imposables",
    label: "Prélèvements sociaux sur l'épargne imposable",
    category: "fiscalite",
    value: 17.2,
    unit: "%",
    effectiveDate: "2018-01-01",
    nextReview: null,
    reviewFrequency: "Fixé par la loi de finances",
    source: "Code de la sécurité sociale",
    seriesKey: null,
    description: "S'applique notamment aux intérêts du CEL, du PEL (nouveaux plans) et à la part imposable de l'assurance-vie.",
  },
];

/** Recherche insensible à la casse/accents sur libellé, description et catégorie. */
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Recherche libre dans le catalogue : libellé, description, catégorie.
 * Renvoie le catalogue entier si la requête est vide.
 */
export function searchRates(query, catalog = RATES_CATALOG) {
  const q = normalize(query).trim();
  if (!q) return catalog;
  return catalog.filter((r) => {
    const haystack = normalize(`${r.label} ${r.description} ${RATE_CATEGORIES[r.category]?.label ?? ""}`);
    return haystack.includes(q);
  });
}

/** Regroupe une liste de taux par catégorie, en respectant l'ordre de RATE_CATEGORIES. */
export function groupByCategory(rates) {
  const groups = Object.fromEntries(Object.keys(RATE_CATEGORIES).map((k) => [k, []]));
  rates.forEach((r) => {
    if (!groups[r.category]) groups[r.category] = [];
    groups[r.category].push(r);
  });
  return Object.entries(groups).filter(([, items]) => items.length > 0);
}

/** Le meilleur taux d'épargne réglementée sans risque actuellement disponible. */
export function bestSavingsRate(catalog = RATES_CATALOG) {
  const savings = catalog.filter((r) => r.category === "epargne");
  if (savings.length === 0) return null;
  return savings.reduce((best, r) => (r.value > best.value ? r : best));
}

/** Nombre de jours avant la prochaine révision connue la plus proche. */
export function nextUpcomingReview(catalog = RATES_CATALOG, from = new Date()) {
  const upcoming = catalog
    .filter((r) => r.nextReview)
    .map((r) => ({ ...r, daysUntil: Math.ceil((new Date(`${r.nextReview}T00:00:00`) - from) / 86_400_000) }))
    .filter((r) => r.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return upcoming[0] ?? null;
}

/**
 * Compare un taux saisi par l'utilisateur (ex : son propre Livret A) au taux
 * officiel de référence correspondant, pour signaler un écart (retard de mise
 * à jour côté utilisateur, ou établissement proposant une offre boostée).
 */
export function findOfficialRateFor(name, catalog = RATES_CATALOG) {
  const key = normalize(name);
  return (
    catalog.find((r) => key.includes(normalize(r.id.replace(/-/g, " ")))) ||
    catalog.find((r) => normalize(r.label).includes(key) || key.includes(normalize(r.label).split(" (")[0]))
  );
}
