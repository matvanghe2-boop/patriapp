import { useState, useEffect, useRef } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useBalayageSuppression } from "./gestes";
import { eur, pctPlain } from "../lib/finance";

/**
 * Briques du tableau de positions de l'onglet Bourse : tri, ligne balayable,
 * tendance et variation du jour. Sorties de Bourse.jsx, qui dépassait 1 800 lignes.
 */

// ─── Sort config ──────────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { key: "none", label: "Ordre d'ajout" },
  { key: "value_desc", label: "Valeur ↓" },
  { key: "value_asc", label: "Valeur ↑" },
  { key: "pnl_desc", label: "Plus-value ↓" },
  { key: "pnl_asc", label: "Plus-value ↑" },
  { key: "daily_desc", label: "Variation du jour ↓" },
  { key: "daily_asc", label: "Variation du jour ↑" },
  { key: "weight_desc", label: "Poids ↓" },
];

export function SortButton({ sort, setSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const current = SORT_OPTIONS.find((o) => o.key === sort) || SORT_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-500/50 rounded-lg px-3 py-1.5 transition-colors"
      >
        <ArrowUpDown size={13} />
        Trier : {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => { setSort(o.key); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${sort === o.key ? "text-amber-300 bg-slate-800" : "text-slate-300"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ligne de position, balayable vers la gauche pour supprimer.
 *
 * Un composant plutôt qu'un `<tr>` écrit sur place : le balayage a besoin d'un
 * hook, et un hook ne peut pas vivre à l'intérieur d'un `.map()`. Le geste est
 * réservé au tactile, et le bouton de suppression reste le chemin principal —
 * au clavier comme à la souris, rien ne change.
 */
export function LignePosition({ onSupprimer, children }) {
  const { handlers, style } = useBalayageSuppression(onSupprimer);
  return (
    <tr className="group hover:bg-slate-800/30 transition-colors" style={style} {...handlers}>
      {children}
    </tr>
  );
}

/**
 * Sens général d'une série de cours : dernier point contre premier.
 *
 * Volontairement grossier — la sparkline n'a que sa COULEUR pour dire le sens,
 * et une régression linéaire donnerait la même réponse dans les cas qui
 * comptent tout en compliquant la lecture du code.
 */
export function tendance(serie) {
  if (!serie || serie.length < 2) return 0;
  return serie[serie.length - 1].p - serie[0].p;
}

// ─── Daily variation cell ─────────────────────────────────────────────────────
export function DailyVariation({ position, dailyData }) {
  const d = dailyData?.[position.ticker];
  if (!d) {
    return <span className="text-slate-500 text-xs font-data">—</span>;
  }
  const { changeAbs, changePct } = d;
  const pos = changeAbs >= 0;
  return (
    <div className={`flex items-center gap-1 font-data tabular-nums text-xs ${pos ? "text-emerald-400" : "text-rose-400"}`}>
      {pos ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      <span>
        {pos ? "+" : ""}{eur(changeAbs * position.quantity, 2)}
        <span className="opacity-70 ml-1">({pos ? "+" : ""}{pctPlain(changePct, 2)})</span>
      </span>
    </div>
  );
}
