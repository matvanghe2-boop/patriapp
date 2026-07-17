import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, TrendingUp, TrendingDown } from "lucide-react";
import { eur, pct } from "../lib/finance";

const SCROLL_THRESHOLD = 48; // px de défilement avant de basculer en mode condensé

/**
 * En-tête collant qui se condense progressivement au défilement : au repos
 * (scroll = 0) c'est le bandeau complet habituel ; passé SCROLL_THRESHOLD px,
 * il se transforme en une fine barre sticky avec uniquement le total et la
 * performance globale, toujours visibles en haut de l'écran.
 *
 * `condensedContent` (ex: la barre de recherche + notifications existantes)
 * reste affiché en permanence à droite ; seule la partie "résumé chiffré"
 * change de taille/format.
 */
export default function StickySummaryHeader({ patrimoineNet, deltaPct, ghostMode, onToggleGhost, children }) {
  const [scrolled, setScrolled] = useState(false);
  const tickingRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > SCROLL_THRESHOLD);
        tickingRef.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const perfPositive = (deltaPct ?? 0) >= 0;

  return (
    <div
      className={`sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 transition-all duration-300 ease-out ${
        scrolled ? "bg-slate-950/95 backdrop-blur border-b border-slate-800 shadow-lg py-2" : "bg-transparent py-0 mb-2"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Bloc résumé chiffré — se condense au scroll */}
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <span
            className={`font-display text-slate-50 shrink-0 transition-all duration-300 ${
              scrolled ? "text-sm" : "text-lg opacity-0 h-0 -mt-6" // masqué/rétréci au repos, le vrai titre de page reste affiché plus bas
            }`}
          >
            Patrium
          </span>

          <div
            className={`flex items-center gap-3 font-data tabular-nums transition-all duration-300 ${
              scrolled ? "opacity-100 text-sm" : "opacity-0 pointer-events-none h-0 text-xs"
            }`}
          >
            <span className="text-slate-500 hidden sm:inline">Total :</span>
            <span className={`font-semibold text-slate-100 ${ghostMode ? "ghost-blur" : ""}`}>{eur(patrimoineNet)}</span>

            {deltaPct != null && (
              <span className={`flex items-center gap-1 ${perfPositive ? "text-emerald-400" : "text-rose-400"}`}>
                {perfPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {pct(deltaPct)}
              </span>
            )}

            <button
              onClick={onToggleGhost}
              className="btn-flash text-slate-500 hover:text-slate-200 p-0.5"
              title="Mode Ghost (flouter les montants)"
            >
              {ghostMode ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>

        {/* Zone droite existante (recherche globale, notifications, déconnexion...) */}
        <div className="flex items-center gap-3 shrink-0">{children}</div>
      </div>
    </div>
  );
}
