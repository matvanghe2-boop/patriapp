/**
 * Indices de comparaison — SOURCE UNIQUE.
 *
 * Cette liste existait en deux exemplaires : trois entrées dans `Bourse.jsx`,
 * celles réellement récupérées et écrites dans l'instantané quotidien, et six
 * dans `BoursePerformance.jsx`, celles proposées à la sélection. Les trois
 * indices en trop — Nasdaq, MSCI Emerging, Or — n'étaient donc JAMAIS
 * renseignés dans l'historique.
 *
 * Le symptôme n'était pas une courbe manquante mais un graphique vide : en
 * sélectionnant l'un des trois, `rebaseTo100` ne trouvait aucune date où
 * toutes les séries demandées étaient disponibles, renvoyait un tableau vide,
 * et emportait au passage la courbe du portefeuille lui-même.
 *
 * Ironie du sort, le commentaire qui surplombait la liste de `Bourse.jsx`
 * disait déjà : « deux listes qui doivent rester d'accord sans que rien ne le
 * vérifie finissent toujours par diverger ». C'est exactement ce qui s'est
 * produit, mais entre deux fichiers différents.
 *
 * Toute addition se fait ICI, et nulle part ailleurs.
 */
export const BENCHMARKS = [
  { symbol: "^GSPC", name: "S&P 500", color: "#38bdf8", cle: "sp500", devise: "USD" },
  { symbol: "^FCHI", name: "CAC 40", color: "#a78bfa", cle: "cac40", devise: "EUR" },
  { symbol: "URTH", name: "MSCI World", color: "#34d399", cle: "msciWorld", devise: "USD" },
  { symbol: "^IXIC", name: "Nasdaq", color: "#f472b6", cle: "nasdaq", devise: "USD" },
  { symbol: "EEM", name: "MSCI Emerging", color: "#fb923c", cle: "msciEmerging", devise: "USD" },
  // L'or est suivi via le contrat à terme COMEX (GC=F), coté en dollars
  // l'once. C'est la série la plus continue et la plus largement reprise ;
  // le spot XAU n'a pas d'endpoint Yahoo fiable, et un ETF (GLD, PHAU)
  // porterait ses propres frais de gestion dans la performance affichée.
  { symbol: "GC=F", name: "Or", color: "#facc15", cle: "or", devise: "USD" },
];

/** Symbole Yahoo → clé stockée dans l'historique. */
export const CLES_INDICE = Object.fromEntries(BENCHMARKS.map((b) => [b.symbol, b.cle]));

/** Clé stockée → définition complète. */
export const INDICE_PAR_CLE = Object.fromEntries(BENCHMARKS.map((b) => [b.cle, b]));

/** Toutes les clés d'indice, pour l'alignement des séries. */
export const CLES_BENCHMARK = BENCHMARKS.map((b) => b.cle);

/**
 * Les indices sont comparés en BASE 100, donc en variation relative. Un
 * indice coté en dollars et un portefeuille en euros se comparent alors sans
 * conversion : seule la devise introduirait un écart si l'on comparait des
 * niveaux, pas des variations.
 *
 * Nuance assumée, et c'est la raison de cette note : la courbe « S&P 500 » se
 * lit comme la performance vue par un investisseur EN DOLLARS, pas par un
 * investisseur européen qui aurait subi l'effet de change. L'interface le
 * signale sous le graphique.
 */
export const COMPARAISON_EN_DEVISE_LOCALE = true;
