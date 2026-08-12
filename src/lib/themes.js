/**
 * Palettes de domaine — source unique de vérité.
 *
 * Les six thèmes (un par onglet) étaient redéfinis SEPT fois dans le projet :
 * `NAV_THEMES` dans `ui.jsx`, `NAV_THEMES` à nouveau dans `BottomNav.jsx`,
 * `ACTIVE_BARS`, `CARD_THEMES`, `GHOST_THEMES`, `PageGlow.COLORS` et `TAB_BG`
 * dans `App.jsx`. Changer la couleur d'un onglet demandait de retrouver et de
 * modifier sept endroits, et rien ne signalait l'oubli du septième — c'est
 * exactement ainsi que Stratégie et Abonnements avaient fini par partager la
 * même teinte.
 *
 * POURQUOI DES CHAÎNES COMPLÈTES plutôt que des classes composées à la volée :
 * Tailwind analyse le code source en texte brut et ne génère que les classes
 * qu'il y voit littéralement. Un `bg-${couleur}-500` ne produirait aucune règle
 * CSS. Chaque variante est donc écrite en toutes lettres — c'est verbeux, mais
 * c'est la contrainte de l'outil, et tout est ici.
 */

/** Identifiants de thème valides, dans l'ordre des onglets. */
export const THEME_IDS = ["emerald", "indigo", "violet", "amber", "rose", "cyan"];

export const THEMES = {
  emerald: {
    /** Bouton de navigation actif (barre latérale bureau). */
    nav: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    /** Texte de l'onglet actif (barre basse mobile). */
    navText: "text-emerald-300",
    /** Repère d'onglet actif (trait). */
    bar: "bg-emerald-400",
    /** Carte thématique : bordure + fond dégradé. */
    card: "border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 hover:border-emerald-400/60",
    /** Bouton fantôme (bordure + fond léger). */
    ghost:
      "text-emerald-300 hover:text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/40 hover:border-emerald-400/70 focus-visible:ring-emerald-400/40",
    /** Fond de page teinté. */
    pageBg: "bg-gradient-to-br from-emerald-950/70 via-slate-950 to-slate-950",
    /** Lueurs ambiantes (deux halos). */
    glowA: "bg-emerald-400/10",
    glowB: "bg-cyan-400/8",
  },
  indigo: {
    nav: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
    navText: "text-indigo-300",
    bar: "bg-indigo-400",
    card: "border-indigo-500/40 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 hover:border-indigo-400/60",
    ghost:
      "text-indigo-300 hover:text-indigo-100 bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/40 hover:border-indigo-400/70 focus-visible:ring-indigo-400/40",
    pageBg: "bg-gradient-to-br from-indigo-950/70 via-slate-950 to-slate-950",
    glowA: "bg-indigo-400/10",
    glowB: "bg-blue-400/8",
  },
  violet: {
    nav: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
    navText: "text-violet-300",
    bar: "bg-violet-400",
    card: "border-violet-500/40 bg-gradient-to-br from-violet-950/40 via-slate-900 to-slate-900 hover:border-violet-400/60",
    ghost:
      "text-violet-300 hover:text-violet-100 bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/40 hover:border-violet-400/70 focus-visible:ring-violet-400/40",
    pageBg: "bg-gradient-to-br from-violet-950/70 via-slate-950 to-slate-950",
    glowA: "bg-violet-400/10",
    glowB: "bg-fuchsia-400/8",
  },
  amber: {
    nav: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    navText: "text-amber-300",
    bar: "bg-amber-400",
    card: "border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 hover:border-amber-400/60",
    ghost:
      "text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/40 hover:border-amber-400/70 focus-visible:ring-amber-400/40",
    pageBg: "bg-gradient-to-br from-amber-950/70 via-slate-950 to-slate-950",
    glowA: "bg-amber-400/10",
    glowB: "bg-orange-400/8",
  },
  rose: {
    nav: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
    navText: "text-rose-300",
    bar: "bg-rose-400",
    card: "border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 hover:border-rose-400/60",
    ghost:
      "text-rose-300 hover:text-rose-100 bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/40 hover:border-rose-400/70 focus-visible:ring-rose-400/40",
    pageBg: "bg-gradient-to-br from-rose-950/70 via-slate-950 to-slate-950",
    glowA: "bg-rose-400/10",
    glowB: "bg-orange-500/8",
  },
  cyan: {
    nav: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
    navText: "text-cyan-300",
    bar: "bg-cyan-400",
    card: "border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 hover:border-cyan-400/60",
    ghost:
      "text-cyan-300 hover:text-cyan-100 bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/40 hover:border-cyan-400/70 focus-visible:ring-cyan-400/40",
    pageBg: "bg-gradient-to-br from-cyan-950/70 via-slate-950 to-slate-950",
    glowA: "bg-cyan-400/10",
    glowB: "bg-teal-400/8",
  },
};

/** Thème par défaut, appliqué quand l'identifiant demandé est inconnu. */
export const THEME_DEFAUT = "amber";

/** Accès sûr à un thème : jamais `undefined`, quel que soit l'identifiant. */
export function theme(id) {
  return THEMES[id] || THEMES[THEME_DEFAUT];
}

/**
 * Vues par variante, pour les composants qui indexent directement par
 * identifiant de thème (`CARD_THEMES[t]`). Elles évitent de réécrire
 * `theme(x).card` à chaque appel sans réintroduire de duplication : ce sont
 * des projections du même objet.
 */
const parVariante = (cle) => Object.fromEntries(THEME_IDS.map((id) => [id, THEMES[id][cle]]));

export const CARD_THEMES = parVariante("card");
export const GHOST_THEMES = parVariante("ghost");
export const NAV_THEMES = parVariante("nav");
export const PAGE_BG = parVariante("pageBg");
