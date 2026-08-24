import { MoreHorizontal } from "lucide-react";
import { theme as themeDe } from "../lib/themes";

/**
 * Barre de navigation basse, mobile uniquement (masquée dès md:).
 * Zones tactiles ≥48px, atteignables au pouce, position fixed avec
 * safe-area-inset pour les téléphones à encoche/gestures.
 */
/**
 * Nombre d'onglets tenus directement dans la barre. Le sixième était de trop :
 * six cibles sur un téléphone standard donnent 62 px chacune, étiquette
 * comprise — sous le confortable, et le dernier libellé était déjà tronqué.
 * Quatre plus une entrée « Plus » ramènent les cibles à 78 px, et la feuille
 * qui s'ouvre peut accueillir les réglages et la rétrospective, jusque-là
 * inatteignables sur mobile.
 */
const MAX_DIRECTS = 4;

export default function BottomNav({ tabs, active, onChange, onPlus }) {
  const directs = tabs.slice(0, MAX_DIRECTS);
  const replies = tabs.slice(MAX_DIRECTS);
  // L'entrée « Plus » se surligne quand la section courante s'y trouve : sans
  // ça, ouvrir Abonnements laisserait la barre sans repère actif.
  const plusActif = replies.some((t) => t.key === active);

  return (
    // Nom distinct de celui de la barre latérale : les deux coexistent dans le
    // DOM (seul le CSS en masque une selon la largeur), et deux repères de
    // navigation portant le même nom sont indiscernables au lecteur d'écran.
    <nav
      aria-label="Navigation rapide"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur border-t border-slate-800 flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {directs.map((t) => {
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
            <span aria-hidden="true" className="text-micro font-medium leading-none">
              {t.shortLabel || t.label}
            </span>
          </button>
        );
      })}

      {replies.length > 0 && (
        <button
          onClick={onPlus}
          aria-label={`Plus — ${replies.map((t) => t.label).join(", ")}, réglages, rétrospective`}
          className={`btn-flash relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/40 ${
            plusActif ? "text-amber-300" : "text-slate-500"
          }`}
        >
          {plusActif && (
            <span
              aria-hidden="true"
              className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b-full bg-amber-400"
            />
          )}
          <MoreHorizontal size={22} strokeWidth={plusActif ? 2.4 : 2} aria-hidden="true" />
          <span aria-hidden="true" className="text-micro font-medium leading-none">Plus</span>
        </button>
      )}
    </nav>
  );
}
