import { Clock } from "lucide-react";
import { useMaintenant, joursDepuis } from "../lib/useMaintenant";

/**
 * Badge de fraîcheur des cours de bourse. Sorti de Dashboard.jsx.
 */

// ─── Badge de fraîcheur des cours ─────────────────────────────────────────────
// Mesure la date de dernière actualisation des COURS (bourse.pricesUpdatedAt),
// et non celle de l'historique de patrimoine : ce dernier étant alimenté
// automatiquement à chaque ouverture de l'app, le badge affichait
// invariablement « Actualisé aujourd'hui » et ses autres états étaient
// inatteignables.
export default function StagnationBadge({ pricesUpdatedAt, hasPositions }) {
  // Même raison que dans ProfileFreshness : ce badge annonce la fraîcheur des
  // cours, il ne peut pas se contenter d'un instant lu pendant le rendu.
  const maintenant = useMaintenant();
  if (!hasPositions) return null;
  if (!pricesUpdatedAt) {
    return (
      <span className="flex items-center gap-1.5 text-micro border rounded-full px-2.5 py-1 text-slate-500 border-slate-700 bg-slate-900/50">
        <Clock size={10} aria-hidden="true" />
        Cours jamais actualisés
      </span>
    );
  }
  const diffDays = joursDepuis(pricesUpdatedAt, maintenant);
  const color =
    diffDays === 0 ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/5"
    : diffDays <= 3 ? "text-amber-300 border-amber-400/30 bg-amber-400/5"
    : "text-rose-400 border-rose-400/30 bg-rose-400/5";
  const label =
    diffDays === 0 ? "Cours actualisés aujourd'hui"
    : diffDays === 1 ? "Cours actualisés hier"
    : `Cours vieux de ${diffDays} jours`;
  return (
    <span className={`flex items-center gap-1.5 text-micro border rounded-full px-2.5 py-1 ${color}`}>
      <Clock size={10} aria-hidden="true" />
      {label}
    </span>
  );
}
