import React from "react";
import { eur } from "../lib/finance";
import { EmptyState } from "./ui";

function formatDateShortFr(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Tableau complet des opérations, trié par ordre chronologique inversé.
 * Un clic sur une ligne remonte l'opération au parent — utilisé pour la
 * passerelle Ordre ➔ Thèse (relire la note d'investissement initiale).
 */
export default function OperationList({ operations = [], onRowClick }) {
  const sorted = [...operations].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (sorted.length === 0) {
    return (
      <EmptyState>
        Aucune opération enregistrée. Importe un avis d'opéré PDF ou déclare une opération manuellement pour démarrer l'historique.
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-2 px-1">Date</th>
            <th className="py-2 px-1">Actif</th>
            <th className="py-2 px-1">Type</th>
            <th className="py-2 px-1">Quantité</th>
            <th className="py-2 px-1">Cours</th>
            <th className="py-2 px-1">Frais</th>
            <th className="py-2 px-1">Montant net</th>
            <th className="py-2 px-1">Plus-value réalisée</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {sorted.map((op) => (
            <tr
              key={op.id}
              onClick={() => onRowClick?.(op)}
              className="cursor-pointer hover:bg-slate-800/40 transition-colors"
              title="Voir la thèse liée à cet actif"
            >
              <td className="py-2.5 px-1 font-data tabular-nums text-slate-400">{formatDateShortFr(op.date)}</td>
              <td className="py-2.5 px-1 font-data font-semibold text-slate-100">{op.asset}</td>
              <td className="py-2.5 px-1">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
                    op.type === "ACHAT"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {op.type}
                </span>
              </td>
              <td className="py-2.5 px-1 font-data tabular-nums text-slate-300">{op.quantity}</td>
              <td className="py-2.5 px-1 font-data tabular-nums text-slate-300">{eur(op.price, 2)}</td>
              <td className="py-2.5 px-1 font-data tabular-nums text-slate-500">{eur(op.fees, 2)}</td>
              <td className="py-2.5 px-1 font-data tabular-nums text-slate-100">{eur(op.montantNet, 2)}</td>
              <td className="py-2.5 px-1 font-data tabular-nums">
                {op.plusValueRealisee != null ? (
                  <span className={op.plusValueRealisee >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {eur(op.plusValueRealisee, 2)}
                  </span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
