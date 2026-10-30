import { Landmark, Plus, EyeOff } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import { categorie } from "../lib/compteCourant";

/**
 * Prélèvements récurrents du relevé qui ne sont pas encore suivis.
 *
 * Le compte courant les repérait déjà (`recurrences`), mais le bouton pour les
 * suivre n'existait que dans l'onglet Compte courant : l'onglet Abonnements
 * restait vide tant qu'on n'allait pas les chercher ailleurs. Ici, chaque
 * charge se suit ou s'écarte en un geste — et une charge écartée ne revient
 * plus (`abonnementsIgnores`).
 */
export default function AbonnementsDetectes({ detectes = [], onSuivre, onIgnorer }) {
  if (detectes.length === 0) return null;

  return (
    <Card accent={CARD_THEMES.cyan}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={Landmark}>Détectés sur ton compte</CardLabel>
        <span className="text-micro text-slate-500">
          {detectes.length} pas encore suivi{detectes.length > 1 ? "s" : ""}
        </span>
      </div>
      <p className="text-mini text-slate-500 mt-1">
        Des prélèvements revenus chaque mois sur tes relevés. Suis-les pour qu'ils soient vérifiés à chaque
        import, ou écarte ceux qui ne sont pas des abonnements.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {detectes.map((c) => (
          <li
            key={`${c.cle}-${c.montant}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 basis-[12rem]">
              <span className="block text-corps text-slate-100 truncate">{c.titre}</span>
              <span className="block text-micro text-slate-500">
                {categorie(c.categorie).libelle} · vers le {c.jour} du mois · vu {c.nombreMois} mois
              </span>
            </span>
            <Montant valeur={c.montant / 100} decimales={2} className="text-corps text-slate-100" />
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSuivre?.(c)}
                className="btn-flash inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
              >
                <Plus size={12} aria-hidden="true" /> Suivre
              </button>
              <button
                type="button"
                onClick={() => onIgnorer?.(c)}
                aria-label={`Ignorer ${c.titre}`}
                className="btn-flash inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40"
              >
                <EyeOff size={12} aria-hidden="true" /> Ignorer
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
