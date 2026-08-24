import { useState, useEffect, useRef, useId } from "react";
import { Plus, Trash2, X, Lock, ChevronDown } from "lucide-react";
import { eur, lireNombre } from "../lib/finance";
import { theme as themeDe, CARD_THEMES, GHOST_THEMES } from "../lib/themes";
import EtatVide from "./EtatVide";

// Les palettes vivent désormais dans `lib/themes.js`, où elles ne sont écrites
// qu'une fois. Elles restent réexportées ici : une vingtaine de composants
// importent `CARD_THEMES` depuis `./ui`, et cette façade leur évite une
// modification qui n'apporterait rien.
export { CARD_THEMES, GHOST_THEMES };

export function NavButton({ active, onClick, icon: Icon, label, disabled, theme = "amber", current }) {
  const t = themeDe(theme);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      // L'onglet actif n'était signalé que par la couleur : un lecteur d'écran
      // n'avait aucun moyen de savoir où l'utilisateur se trouve.
      aria-current={current ? "page" : undefined}
      className={`btn-flash relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40
        ${disabled ? "text-slate-600 cursor-not-allowed" : active ? t.nav : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"}`}
    >
      {active && <span aria-hidden="true" className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full ${t.bar} hidden md:block`} />}
      <Icon size={17} strokeWidth={2} aria-hidden="true" />
      <span className="font-medium">{label}</span>
      {disabled && <Lock size={12} className="ml-auto opacity-60" aria-hidden="true" />}
    </button>
  );
}

/**
 * État vide générique.
 *
 * Délègue désormais à `EtatVide`, qui ajoute un pictogramme et une hiérarchie.
 * La façade est conservée parce que trente-quatre appels l'emploient avec la
 * seule phrase pour tout contenu : les faire tous passer à la nouvelle API
 * demanderait d'inventer trente-quatre titres, dont la plupart ne diraient
 * rien de plus que la phrase elle-même.
 *
 * Les écrans où l'état vide est le PREMIER que voit un nouvel arrivant —
 * portefeuille, livrets, objectifs — utilisent directement `EtatVide` avec un
 * titre et une action.
 */
export function EmptyState({ children, picto = "recherche" }) {
  return <EtatVide picto={picto}>{children}</EtatVide>;
}

export function Card({ children, className = "", accent = "" }) {
  return <div className={`rounded-2xl border bg-slate-900 p-5 transition-colors duration-300 ${accent || "border-slate-800"} ${className}`}>{children}</div>;
}

/**
 * Lueur de fond ambiante thématique — à placer en position absolute/fixed
 * dans le conteneur racine de chaque page pour donner une identité visuelle
 * propre à chaque onglet sans dupliquer le layout.
 */
export function PageGlow({ color = "emerald" }) {
  const c = themeDe(color);
  // Conteneur clippant : la seconde lueur déborde volontairement à droite
  // (`-right-24`) pour être coupée par le bord de l'écran. Sans ce wrapper en
  // `overflow-hidden`, ce débordement purement décoratif ajoutait une barre de
  // défilement horizontale à toute l'application.
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      <div className={`absolute -top-24 left-1/4 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full ${c.glowA} blur-[130px]`} />
      <div className={`absolute top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full ${c.glowB} blur-[120px]`} />
    </div>
  );
}

/**
 * Section repliable, pour les écrans qui empilent beaucoup de blocs.
 *
 * Le sous-onglet « Projet » alignait une douzaine de cartes sur un seul
 * défilement : paramètres, verdict, trajectoires, détail des coûts,
 * hypothèses, scénarios et assistant. Tout y était utile, mais rien n'y était
 * hiérarchisé — replier le secondaire rend le principal lisible.
 *
 * L'état d'ouverture est local et non persisté : c'est une préférence de
 * lecture du moment, pas une donnée.
 */
export function SectionRepliable({ titre, icon: Icon, defautOuvert = false, resume, children }) {
  const [ouvert, setOuvert] = useState(defautOuvert);
  const idContenu = `section-${String(titre).replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls={idContenu}
        className="btn-flash w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded-2xl"
      >
        <span className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={14} className="text-slate-500 shrink-0" aria-hidden="true" />}
          <span className="text-sm text-slate-200 truncate">{titre}</span>
          {resume && !ouvert && (
            <span className="text-[11px] text-slate-500 truncate hidden sm:inline">— {resume}</span>
          )}
        </span>
        {/* Un seul chevron qui pivote, plutôt que deux icônes échangées : la
            rotation montre le sens de l'action là où la substitution ne
            faisait que changer le symbole. */}
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`text-slate-500 shrink-0 transition-transform duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${ouvert ? "rotate-180" : ""}`}
        />
      </button>
      {/* Le contenu se déroule à l'ouverture (voir `.collapse-in` dans
          index.css) ; il apparaissait jusqu'ici d'un bloc, ce qui est brutal
          sur les sections qui contiennent un graphique.

          Il reste DÉMONTÉ quand la section est repliée : le garder monté
          permettrait d'animer aussi la fermeture, mais ferait rendre en
          permanence les graphiques de toutes les sections fermées — soit
          précisément ce que ce composant existe pour éviter. */}
      {ouvert && (
        <div className="collapse-in">
          <div>
            <div id={idContenu} className="px-4 pb-4 flex flex-col gap-4">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Le système demande-t-il la suppression des animations ? */
export function mouvementReduit() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Interpole une valeur numérique vers sa nouvelle cible.
 *
 * Le patrimoine net est l'élément central de l'écran et il SAUTAIT d'un
 * montant à l'autre — un ajout de 150 € et une correction de 15 000 € se
 * ressemblaient exactement. Faire filer les chiffres donne une idée de
 * l'ampleur du changement sans qu'aucun texte ne l'explique.
 *
 * Interpolation à sortie douce sur ~600 ms, avec deux abandons volontaires :
 * au premier rendu (aucun mouvement à montrer, la valeur est simplement là) et
 * lorsque le système demande un mouvement réduit.
 */
const DUREE_ANIMATION_MS = 600;

export function useValeurAnimee(cible, { duree = DUREE_ANIMATION_MS } = {}) {
  const valide = Number.isFinite(cible) ? cible : 0;
  const [affichee, setAffichee] = useState(valide);
  const depart = useRef(valide);
  const premierRendu = useRef(true);
  const frame = useRef(null);

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      depart.current = valide;
      setAffichee(valide);
      return undefined;
    }
    if (mouvementReduit() || depart.current === valide) {
      depart.current = valide;
      setAffichee(valide);
      return undefined;
    }

    const de = depart.current;
    const debut = performance.now();
    const avancer = (maintenant) => {
      const t = Math.min(1, (maintenant - debut) / duree);
      // easeOutCubic : rapide au départ, freinage marqué à l'arrivée.
      const adouci = 1 - Math.pow(1 - t, 3);
      setAffichee(de + (valide - de) * adouci);
      if (t < 1) frame.current = requestAnimationFrame(avancer);
      else depart.current = valide;
    };
    frame.current = requestAnimationFrame(avancer);
    return () => cancelAnimationFrame(frame.current);
  }, [valide, duree]);

  return affichee;
}

/**
 * Carte dont on peut replier le contenu, pour composer son écran.
 *
 * Distincte de `SectionRepliable`, et la différence est le point important :
 * cette dernière garde son état en local parce que c'est une préférence de
 * lecture du moment. Ici l'état est REMONTÉ à l'appelant, qui le persiste —
 * un écran qu'on a pris la peine d'organiser doit se retrouver tel quel au
 * rechargement, sinon le réglage ne sert à rien.
 *
 * Le repli passe par une grille `0fr → 1fr` (voir `.collapse-in` dans
 * index.css) : c'est la seule technique qui anime vers une hauteur AUTO sans
 * mesurer le contenu en JavaScript, et elle se neutralise d'elle-même sous
 * `prefers-reduced-motion`.
 */
export function CarteRepliable({
  titre,
  icon: Icon,
  replie = false,
  onBasculer,
  accent = "",
  /** Résumé affiché à la place du contenu quand la carte est repliée. */
  resume,
  /** Actions de l'en-tête (boutons), qui ne doivent pas déclencher le repli. */
  actions,
  className = "",
  children,
}) {
  const idContenu = `carte-${String(titre).replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className={`rounded-2xl border bg-slate-900 transition-colors duration-300 ${accent || "border-slate-800"} ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-1">
        {/* `group` + un titre qui s'éclaircit au survol : sans ce signal, rien
            ne distinguait une carte repliable d'une carte ordinaire, et on ne
            savait pas où cliquer. Le chevron seul était trop discret. */}
        <button
          onClick={onBasculer}
          aria-expanded={!replie}
          aria-controls={idContenu}
          title={replie ? "Déplier" : "Replier"}
          className="btn-flash group flex items-center gap-2 min-w-0 flex-1 text-left rounded -mx-1 px-1 py-0.5 hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        >
          {Icon && <Icon size={13} className="text-slate-500 group-hover:text-slate-300 shrink-0 transition-colors" aria-hidden="true" />}
          <span className="text-xs uppercase tracking-wider text-slate-500 group-hover:text-slate-200 truncate transition-colors">
            {titre}
          </span>
          {replie && resume && (
            <span className="text-[11px] text-slate-600 truncate hidden sm:inline">— {resume}</span>
          )}
          {/* Même chevron pivotant que SectionRepliable : la rotation montre le
              sens de l'action, là où deux icônes échangées ne font que changer
              le symbole. */}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`text-slate-600 shrink-0 ml-auto transition-transform duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
              replie ? "" : "rotate-180"
            }`}
          />
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {/* Contenu DÉMONTÉ quand la carte est repliée, comme dans
          SectionRepliable : c'est ce qui fait qu'un bloc replié cesse
          réellement de coûter quelque chose. Replier « Répartition par ligne »
          arrête de rendre son graphique recharts, ce qu'un simple `hidden`
          n'aurait pas fait. */}
      {!replie && (
        <div className="collapse-in">
          <div>
            <div id={idContenu} className="px-5 pb-5 pt-2">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CardLabel({ children, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 mb-2">
      {Icon && <Icon size={13} />}
      <span>{children}</span>
    </div>
  );
}

export function ProgressBar({ value, accent = "bg-teal-400" }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${accent}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function GhostButton({ onClick, children, icon: Icon = Plus, disabled, theme = "amber" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-flash flex items-center gap-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed border rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 ${themeDe(theme).ghost}`}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}

export function IconTrash({ onClick, label = "Supprimer" }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="btn-flash text-slate-600 hover:text-rose-400 transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
    >
      <Trash2 size={14} aria-hidden="true" />
    </button>
  );
}

/**
 * Champ numérique dont la saisie n'est validée qu'à la sortie du champ.
 *
 * POURQUOI CE COMPOSANT EXISTE
 *
 * Les deux champs du profil mensuel (revenu, dépenses) appelaient `setProfile`
 * à CHAQUE CARACTÈRE. Or `setProfile` ne se contente pas de ranger un nombre :
 * il horodate la saisie, ajoute une entrée datée à `profileHistory`, écrit
 * deux clés dans le localStorage et programme deux écritures cloud. Et comme
 * ces deux clés vivent dans le contexte patrimonial, chaque frappe
 * reconstruisait l'objet de contexte et re-rendait tout l'onglet — graphiques
 * recharts compris.
 *
 * Saisir « 2100 » déclenchait donc quatre fois ce cycle complet, dont trois
 * pour des valeurs intermédiaires (« 2 », « 21 », « 210 ») qui n'ont aucun
 * sens et se retrouvaient réellement dans l'historique du profil.
 *
 * Le brouillon reste donc local pendant la frappe et n'est remonté qu'à la
 * validation : perte du focus, ou touche Entrée. Échap annule et restaure la
 * valeur d'origine — même convention que les champs éditables de Livrets.
 */
export function ChampNumerique({
  id,
  value,
  onCommit,
  className = "",
  /** Valeur retenue quand le champ est laissé vide. */
  valeurSiVide = 0,
  ...rest
}) {
  const [brouillon, setBrouillon] = useState(() => String(value ?? ""));

  // Resynchronisation quand la valeur de référence change ailleurs (import,
  // synchronisation cloud) : ajustement pendant le rendu, pas dans un effet.
  const [refPrecedente, setRefPrecedente] = useState(value);
  if (value !== refPrecedente) {
    setRefPrecedente(value);
    setBrouillon(String(value ?? ""));
  }

  const valider = () => {
    const lu = lireNombre(brouillon);
    const retenu = brouillon.trim() === "" ? valeurSiVide : lu;
    if (retenu == null) {
      // Saisie inexploitable : on revient à la valeur en place plutôt que
      // d'écrire un zéro que personne n'a demandé.
      setBrouillon(String(value ?? ""));
      return;
    }
    setBrouillon(String(retenu));
    if (retenu !== value) onCommit(retenu);
  };

  return (
    <input
      {...rest}
      id={id}
      value={brouillon}
      onChange={(e) => setBrouillon(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setBrouillon(String(value ?? ""));
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

export function SliderField({ label, value, onChange, min, max, step, unit = "", format }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={`${idsChamps}-champ`} className="text-xs text-slate-400">{label}</label>
        <span className="font-data tabular-nums text-sm text-amber-300">
          {format ? format(value) : value}
          {unit}
        </span>
      </div>
      <input id={`${idsChamps}-champ`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(lireNombre(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-data tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name} :</span>
          <span className="text-slate-100">{eur(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Formulaire d'ajout générique en ligne — utilisé pour saisir des livrets,
 * des passifs, des relevés d'historique, etc. Tout reste local, aucune
 * source externe n'est interrogée ici.
 */
export function AddPanel({ open, onClose, fields, onSubmit }) {
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""]));
  const [values, setValues] = useState(blank());

  /**
   * Préfixe d'identifiant pour relier chaque étiquette à son champ.
   *
   * Les `<label>` étaient de simples voisines visuelles : ni `htmlFor`, ni
   * enveloppement du champ. Un lecteur d'écran annonçait donc « zone
   * d'édition, vide » sans jamais dire de quoi il s'agissait, et cliquer sur
   * l'intitulé ne donnait pas le focus au champ.
   *
   * `useId` plutôt qu'un compteur ou la seule clé de champ : ce composant est
   * monté PLUSIEURS FOIS sur le même écran (le Dashboard en affiche deux, pour
   * les passifs et pour l'historique), et deux formulaires partageant `id`
   * rendraient l'association fausse — un clic sur l'étiquette de l'un
   * donnerait le focus au champ de l'autre. C'est pire qu'une association
   * absente.
   */
  const prefixeId = useId();

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const parsed = {};
    fields.forEach((f) => {
      const raw = values[f.key];
      parsed[f.key] = f.type === "number" ? lireNombre(raw === "" ? f.default ?? 0 : raw) : raw;
    });
    onSubmit(parsed);
    setValues(blank());
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1 col-span-1">
          <label htmlFor={`${prefixeId}-${f.key}`} className="text-[11px] text-slate-500">{f.label}</label>
          {f.type === "select" ? (
            <select
              id={`${prefixeId}-${f.key}`}
              required={f.required}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400/60"
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${prefixeId}-${f.key}`}
              required={f.required}
              type={f.type || "text"}
              step={f.step}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-400/60 font-data tabular-nums"
            />
          )}
        </div>
      ))}
      <div className="col-span-2 sm:col-span-4 flex gap-2 justify-end mt-1">
        <button type="button" onClick={onClose} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          <X size={13} /> Annuler
        </button>
        <button type="submit" className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SKELETON SCREENS — versions "fantôme" animées (effet shimmer) affichées
   pendant le chargement de données (cours, historique, fiches...).
   ═══════════════════════════════════════════════════════════════════════ */

/** Bloc rectangulaire générique. Utiliser via les helpers ci-dessous de préférence. */
export function Skeleton({ className = "", style }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

/** Ligne de texte fantôme (largeur variable pour un rendu plus naturel). */
export function SkeletonText({ width = "100%", height = 12, className = "" }) {
  return <Skeleton className={className} style={{ width, height, borderRadius: 4 }} />;
}

/** Carte fantôme complète (titre + quelques lignes) — remplace un <Card> le temps du chargement. */
export function SkeletonCard({ lines = 3, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900 p-5 ${className}`}>
      <SkeletonText width="40%" height={10} className="mb-3" />
      <SkeletonText width="65%" height={22} className="mb-2" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonText key={i} width={`${85 - i * 12}%`} height={12} className="mb-1.5" />
      ))}
    </div>
  );
}

/** Tableau fantôme : en-tête + N lignes à colonnes proportionnelles. */
export function SkeletonTable({ rows = 4, columns = 5 }) {
  const widths = ["20%", "15%", "15%", "30%", "20%", "18%", "22%"];
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton style={{ height: 32, width: "100%" }} />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} style={{ height: 20, width: widths[c % widths.length] }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Zone de graphique fantôme (hauteur configurable). */
export function SkeletonChart({ height = 240 }) {
  return <Skeleton style={{ width: "100%", height, borderRadius: 12 }} />;
}

/*
 * Squelettes À LA FORME du contenu attendu.
 *
 * Le rectangle générique annonce « quelque chose arrive » sans dire quoi, et
 * l'arrivée du vrai contenu fait sauter la mise en page parce que les
 * dimensions ne correspondaient pas. Quand la forme est connue d'avance, la
 * reproduire supprime le saut et donne au chargement l'air d'un remplissage
 * plutôt que d'un remplacement.
 */

/** Grille de calendrier fantôme : 7 lignes, N semaines. */
export function SkeletonCalendrier({ semaines = 26 }) {
  return (
    <div className="squelette-calendrier" role="status" aria-label="Chargement du calendrier">
      {Array.from({ length: semaines * 7 }).map((_, i) => (
        <i key={i} className="skeleton" />
      ))}
    </div>
  );
}

/** Rangée d'anneaux fantômes, évidés pour se distinguer de simples pastilles. */
export function SkeletonAnneaux({ nombre = 3, taille = 56 }) {
  return (
    <div className="squelette-anneaux" role="status" aria-label="Chargement des objectifs">
      {Array.from({ length: nombre }).map((_, i) => (
        <span key={i} className="skeleton squelette-anneau" style={{ width: taille, height: taille }} />
      ))}
    </div>
  );
}

/** Micro-courbe fantôme, pour une ligne de tableau. */
export function SkeletonSparkline({ largeur = "3.5rem" }) {
  return <span className="skeleton squelette-sparkline" style={{ width: largeur, display: "block" }} />;
}
