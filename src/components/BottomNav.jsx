
const NAV_THEMES = {
  emerald: "text-emerald-300",
  indigo: "text-indigo-300",
  violet: "text-violet-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  cyan: "text-cyan-300",
};

// Repère d'onglet actif, pendant de la barre latérale du bureau : la couleur
// seule ne suffit pas à signaler la position courante.
const ACTIVE_BARS = {
  emerald: "bg-emerald-400",
  indigo: "bg-indigo-400",
  violet: "bg-violet-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  cyan: "bg-cyan-400",
};

/**
 * Barre de navigation basse, mobile uniquement (masquée dès md:).
 * Zones tactiles ≥48px, atteignables au pouce, position fixed avec
 * safe-area-inset pour les téléphones à encoche/gestures.
 */
export default function BottomNav({ tabs, active, onChange }) {
  return (
    // Nom distinct de celui de la barre latérale : les deux coexistent dans le
    // DOM (seul le CSS en masque une selon la largeur), et deux repères de
    // navigation portant le même nom sont indiscernables au lecteur d'écran.
    <nav
      aria-label="Navigation rapide"
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
            aria-current={isActive ? "page" : undefined}
            // Le libellé court est purement visuel : le lecteur d'écran
            // annonce le nom complet de l'onglet.
            aria-label={t.label}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/40 ${
              isActive ? NAV_THEMES[t.theme] || "text-amber-300" : "text-slate-500"
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b-full ${
                  ACTIVE_BARS[t.theme] || "bg-amber-400"
                }`}
              />
            )}
            <Icon size={22} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
            <span aria-hidden="true" className="text-[10px] font-medium leading-none">
              {t.shortLabel || t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
