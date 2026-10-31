import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";

/**
 * Accueil d'un patrimoine encore vierge. Sorti de Dashboard.jsx.
 */

// ─── Accueil d'un patrimoine encore vierge ────────────────────────────────────
// L'app démarrait sur un patrimoine de démonstration (Livret A à 7 000 €,
// 30 parts de CW8) que rien ne signalait comme fictif. Elle démarre désormais
// vide, et cette carte explique quoi faire — avec le jeu d'exemple accessible,
// mais nommé pour ce qu'il est.
export default function OnboardingCard({ onLoadDemo }) {
  return (
    <Card accent={CARD_THEMES.emerald}>
      <CardLabel icon={Sparkles}>Bienvenue</CardLabel>
      <p className="text-sm text-slate-300 mt-1">
        Ton patrimoine est encore vide. Commence par renseigner tes supports d'épargne dans
        « Livrets &amp; Épargne », puis tes positions dans « PEA &amp; Bourse » — ce tableau de bord
        se remplit tout seul ensuite.
      </p>
      <button
        onClick={onLoadDemo}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 border border-slate-700 hover:border-slate-500 rounded-lg px-3.5 py-2 transition-colors mt-4"
      >
        <ArrowRight size={14} aria-hidden="true" /> Charger un jeu d'exemple
      </button>
      <p className="text-micro text-slate-500 mt-3">
        Le jeu d'exemple contient un an d'historique et des chiffres inventés, à des fins de
        démonstration uniquement.
        Tu pourras tout effacer depuis « Réinitialiser », dans le menu.
      </p>
    </Card>
  );
}
