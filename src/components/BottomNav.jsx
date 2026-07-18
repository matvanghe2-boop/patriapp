import React from "react";

const NAV_THEMES = {
  emerald: "text-emerald-300",
  indigo: "text-indigo-300",
  violet: "text-violet-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  cyan: "text-cyan-300",
};

/**
 * Barre de navigation basse, mobile uniquement (masquée dès md:).
 * Zones tactiles ≥48px, atteignables au pouce, position fixed avec
 * safe-area-inset pour les téléphones à encoche/gestures.
 */
export default function BottomNav({ tabs, active, onChange }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur border-t border-slate-800 flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((t) => {
        const isActive = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors ${
              isActive ? NAV_THEMES[t.theme] || "text-amber-300" : "text-slate-500"
            }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
            <span className="text-[10px] font-medium leading-none">{t.shortLabel || t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
