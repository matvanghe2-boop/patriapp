/**
 * Style commun à tous les graphiques.
 *
 * Deux familles cohabitaient sans se ressembler : les graphiques `recharts`
 * (Dashboard, Performance, Marché) et les primitives SVG écrites à la main
 * (sparklines, anneaux, courbe de rétrospective). Grilles, axes, épaisseurs de
 * trait et infobulles suivaient deux logiques différentes selon l'écran, et le
 * passage de l'un à l'autre se voyait.
 *
 * Ces constantes sont la seule source de vérité. Elles sont exprimées en
 * VARIABLES CSS plutôt qu'en valeurs figées partout où c'est possible : les
 * couleurs doivent suivre le thème clair ou sombre, et `recharts` accepte
 * n'importe quelle chaîne CSS là où il attend une couleur.
 */

/** Couleurs, résolues à l'exécution depuis la palette du thème courant. */
export const COULEURS = {
  grille: "rgb(var(--c-slate-800))",
  axe: "rgb(var(--c-slate-500))",
  texte: "rgb(var(--c-slate-400))",
  hausse: "rgb(var(--etat-ok))",
  baisse: "rgb(var(--etat-critique))",
  neutre: "rgb(var(--etat-neutre))",
  /** Teinte du domaine courant — héritée du conteneur, d'où le `hsl(var())`. */
  domaine: "hsl(var(--teinte))",
};

/**
 * Épaisseurs. Une seule valeur par rôle : c'est l'écart entre les trois qui
 * porte l'information, pas leur valeur absolue.
 */
export const TRAITS = {
  /** Série principale. */
  serie: 2,
  /** Séries de comparaison (indices de référence). */
  comparaison: 1.5,
  /** Grille et axes. */
  grille: 1,
};

/** Rayons des points. Le point final est toujours plus gros : c'est « ici ». */
export const POINTS = {
  final: 4,
  halo: 8,
  jalon: 3,
  survol: 5,
};

/**
 * Marges internes d'un graphique recharts.
 *
 * Volontairement identiques d'un graphique à l'autre : deux courbes empilées
 * dont les zones de tracé ne commencent pas au même x se lisent comme deux
 * échelles différentes, alors qu'elles partagent la même.
 */
export const MARGES = { top: 8, right: 8, bottom: 4, left: 0 };

/** Style de la grille cartésienne recharts. */
export const GRILLE = {
  stroke: COULEURS.grille,
  strokeWidth: TRAITS.grille,
  // Horizontales seules : les verticales n'apportent rien sur une série
  // temporelle et alourdissent le fond.
  vertical: false,
  strokeDasharray: "0",
};

/** Style commun des axes recharts. */
export const AXE = {
  stroke: "transparent",
  tick: { fill: COULEURS.texte, fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

/**
 * Nombre de graduations visé sur un axe de valeurs.
 *
 * Quatre, et non le défaut de recharts : au-delà, les libellés se touchent sur
 * les cartes étroites de la grille à deux colonnes.
 */
export const GRADUATIONS = 4;

/** Durée d'animation d'entrée d'une série, en millisecondes. */
export const DUREE_ANIMATION = 420;
