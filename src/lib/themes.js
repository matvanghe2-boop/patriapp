/**
 * Palettes de domaine — source unique de vérité.
 *
 * Les six thèmes (un par onglet) étaient redéfinis SEPT fois dans le projet.
 * Ils l'ont d'abord été regroupés ici, en chaînes Tailwind complètes : chaque
 * variante écrite en toutes lettres, six fois, parce que Tailwind analyse le
 * source en texte brut et ne génère rien pour un `bg-${couleur}-500`.
 *
 * ── CE QUI A CHANGÉ ───────────────────────────────────────────────────────
 *
 * La teinte est désormais portée par une VARIABLE CSS, et la recette qui
 * l'emploie vit dans `index.css`. Chaque thème n'est plus qu'une paire de
 * classes : celle qui pose la teinte (`teinte-violet`) et celle qui décrit
 * l'usage (`carte-domaine`, `btn-fantome`…).
 *
 * Les six palettes se réduisent donc à six déclarations d'une ligne, contre
 * huit chaînes chacune auparavant. Trois conséquences directes :
 *
 *  · **Le mode clair devient possible.** Les recettes s'appuient sur les
 *    variables de surface, qui s'inversent avec le thème.
 *  · **L'accent devient réglable.** Une septième teinte, `teinte-perso`, est
 *    alimentée à l'exécution par la préférence de l'utilisateur.
 *  · **La teinte devient interpolable**, ce qui permet au fond de page de
 *    GLISSER d'un onglet à l'autre au lieu de sauter (voir `--teinte-h` dans
 *    index.css).
 *
 * L'API exportée n'a pas bougé d'un caractère : `CARD_THEMES.emerald` reste
 * une chaîne de classes qu'on pose sur un élément, et la vingtaine de
 * composants qui l'importent n'ont rien à changer.
 */

/** Identifiants de thème valides, dans l'ordre des onglets. */
export const THEME_IDS = ["emerald", "indigo", "violet", "amber", "rose", "cyan"];

/**
 * Recettes d'usage. Elles sont identiques pour les six thèmes : c'est
 * précisément ce que la variable CSS permet, et ce que la duplication
 * précédente empêchait de voir.
 */
const RECETTES = {
  /** Bouton de navigation actif (barre latérale bureau). */
  nav: "nav-actif",
  /** Texte de l'onglet actif (barre basse mobile). */
  navText: "texte-domaine",
  /** Repère d'onglet actif (trait). */
  bar: "barre-domaine",
  /** Carte thématique : bordure + fond dégradé. */
  card: "carte-domaine",
  /** Bouton fantôme (bordure + fond léger). */
  ghost: "btn-fantome",
  /** Fond de page teinté. */
  pageBg: "fond-domaine",
  /** Lueurs ambiantes (deux halos). */
  glowA: "halo-a",
  glowB: "halo-b",
};

/** Construit les huit entrées d'un thème à partir de sa classe de teinte. */
function palette(id) {
  const teinte = `teinte-${id}`;
  return Object.fromEntries(
    Object.entries(RECETTES).map(([usage, classe]) => [usage, `${teinte} ${classe}`])
  );
}

export const THEMES = Object.fromEntries(THEME_IDS.map((id) => [id, palette(id)]));

/** Thème par défaut, appliqué quand l'identifiant demandé est inconnu. */
export const THEME_DEFAUT = "amber";

/** Accès sûr à un thème : jamais `undefined`, quel que soit l'identifiant. */
export function theme(id) {
  return THEMES[id] || THEMES[THEME_DEFAUT];
}

/**
 * Vues par variante, pour les composants qui indexent directement par
 * identifiant de thème (`CARD_THEMES[t]`). Ce sont des projections du même
 * objet, pas des copies à tenir synchrones.
 */
const parVariante = (cle) => Object.fromEntries(THEME_IDS.map((id) => [id, THEMES[id][cle]]));

export const CARD_THEMES = parVariante("card");
export const GHOST_THEMES = parVariante("ghost");
export const NAV_THEMES = parVariante("nav");
export const PAGE_BG = parVariante("pageBg");

/**
 * Teintes disponibles comme ACCENT global, avec leur libellé et leur valeur
 * HSL. La valeur est reprise telle quelle dans `index.css` ; elle est répétée
 * ici parce que le sélecteur de réglages doit afficher une pastille de la
 * bonne couleur, et qu'il ne peut pas lire une classe.
 *
 * `teinte` est au format « H S% L% » attendu par `hsl()`, sans virgules :
 * c'est ce qui permet d'écrire `hsl(var(--teinte) / .4)`.
 */
export const ACCENTS = [
  { id: "amber", libelle: "Ambre", teinte: "38 92% 50%" },
  { id: "emerald", libelle: "Émeraude", teinte: "160 84% 39%" },
  { id: "indigo", libelle: "Indigo", teinte: "239 84% 67%" },
  { id: "violet", libelle: "Violet", teinte: "258 90% 66%" },
  { id: "rose", libelle: "Rose", teinte: "350 89% 60%" },
  { id: "cyan", libelle: "Cyan", teinte: "188 86% 53%" },
  { id: "teal", libelle: "Sarcelle", teinte: "173 80% 40%" },
  { id: "orange", libelle: "Orange", teinte: "25 95% 53%" },
];

/** Accent par défaut : celui que l'application employait déjà partout. */
export const ACCENT_DEFAUT = "amber";

export function accent(id) {
  return ACCENTS.find((a) => a.id === id) || ACCENTS.find((a) => a.id === ACCENT_DEFAUT);
}
