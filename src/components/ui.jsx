import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, X, Lock, ChevronDown } from "lucide-react";
import { eur } from "../lib/finance";
import { theme as themeDe, CARD_THEMES, GHOST_THEMES } from "../lib/themes";

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

export function EmptyState({ children }) {
  return (
    <p className="text-sm text-slate-600 py-6 text-center border border-dashed border-slate-800 rounded-xl">
      {children}
    </p>
  );
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

export function SliderField({ label, value, onChange, min, max, step, unit = "", format }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-slate-400">{label}</label>
        <span className="font-data tabular-nums text-sm text-amber-300">
          {format ? format(value) : value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
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

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const parsed = {};
    fields.forEach((f) => {
      const raw = values[f.key];
      parsed[f.key] = f.type === "number" ? parseFloat(raw === "" ? f.default ?? 0 : raw) : raw;
    });
    onSubmit(parsed);
    setValues(blank());
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1 col-span-1">
          <label className="text-[11px] text-slate-500">{f.label}</label>
          {f.type === "select" ? (
            <select
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
