import { theme as themeDe } from "../lib/themes";

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
        const palette = themeDe(t.theme);
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            aria-current={isActive ? "page" : undefined}
            // Le libellé court est purement visuel : le lecteur d'écran
            // annonce le nom complet de l'onglet.
            aria-label={t.label}
            className={`btn-flash relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/40 ${
              isActive ? palette.navText : "text-slate-500"
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b-full ${palette.bar}`}
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
