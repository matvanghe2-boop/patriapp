import React, { useMemo } from "react";
import { Layers } from "lucide-react";
import { eur, pctPlain } from "../lib/finance";
import { EmptyState } from "./ui";

function formatDateShortFr(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Agrège l'historique des opérations (bourse.operations) par actif, croisé
 * avec la position actuelle (bourse.positions) pour obtenir une fiche de vie
 * complète de chaque ligne : capital investi, frais cumulés, plus-value
 * réalisée ET latente, dividendes perçus, et un rendement net "tout compris".
 */
function buildAssetStats(operations, positions) {
  const groups = new Map();

  for (const op of operations) {
    const key = (op.asset || "").trim().toUpperCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { label: op.asset, ops: [] });
    groups.get(key).ops.push(op);
  }

  const rows = [];
  for (const [key, { label, ops }] of groups) {
    ops.sort((a, b) => (a.date < b.date ? -1 : 1));
    const buys = ops.filter((o) => o.type === "ACHAT");
    const sells = ops.filter((o) => o.type === "VENTE");
    const divs = ops.filter((o) => o.type === "DIVIDENDE");

    const totalBuyQty = buys.reduce((s, o) => s + (o.quantity || 0), 0);
    const totalSellQty = sells.reduce((s, o) => s + (o.quantity || 0), 0);
    const totalInvested = buys.reduce((s, o) => s + (o.montantNet || 0), 0);
    const feesTotal = ops.reduce((s, o) => s + (o.fees || 0), 0);
    const realizedPV = sells.reduce((s, o) => s + (o.plusValueRealisee || 0), 0);
    const dividendsTotal = divs.reduce((s, o) => s + (o.amount ?? o.montantNet ?? 0), 0);

    const position = positions.find((p) => p.ticker?.toUpperCase() === key || p.name?.toUpperCase() === key);
    const currentQty = position?.quantity || 0;
    const latentPV = position ? (position.current_price - position.pru) * currentQty : 0;

    const statut = currentQty > 0 ? "en_position" : totalSellQty > 0 ? "cloturee" : "inconnu";
    const netResult = realizedPV + latentPV + dividendsTotal - feesTotal;
    const rendementPct = totalInvested > 0 ? (netResult / totalInvested) * 100 : null;

    rows.push({
      key,
      label: position?.ticker || label,
      statut,
      nbOperations: ops.length,
      totalBuyQty,
      totalSellQty,
      currentQty,
      pru: position?.pru ?? null,
      totalInvested,
      feesTotal,
      realizedPV,
      latentPV,
      dividendsTotal,
      netResult,
      rendementPct,
      firstDate: ops[0]?.date,
      lastDate: ops[ops.length - 1]?.date,
    });
  }

  // En position d'abord (triées par capital investi décroissant), puis les
  // lignes clôturées (triées par date de dernière opération décroissante).
  rows.sort((a, b) => {
    if (a.statut !== b.statut) {
      const order = { en_position: 0, cloturee: 1, inconnu: 2 };
      return order[a.statut] - order[b.statut];
    }
    if (a.statut === "en_position") return b.totalInvested - a.totalInvested;
    return a.lastDate < b.lastDate ? 1 : -1;
  });

  return rows;
}

const STATUT_BADGE = {
  en_position: { label: "En position", cls: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300" },
  cloturee: { label: "Clôturée", cls: "bg-slate-500/10 border-slate-500/30 text-slate-400" },
  inconnu: { label: "Historique", cls: "bg-amber-500/10 border-amber-500/30 text-amber-300" },
};

export default function AssetStats({ bourse }) {
  const operations = bourse?.operations || [];
  const positions = bourse?.positions || [];

  const rows = useMemo(() => buildAssetStats(operations, positions), [operations, positions]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          invested: acc.invested + r.totalInvested,
          fees: acc.fees + r.feesTotal,
          realized: acc.realized + r.realizedPV,
          latent: acc.latent + r.latentPV,
          dividends: acc.dividends + r.dividendsTotal,
        }),
        { invested: 0, fees: 0, realized: 0, latent: 0, dividends: 0 }
      ),
    [rows]
  );

  if (rows.length === 0) {
    return (
      <EmptyState>
        Aucune opération enregistrée pour l'instant. Les statistiques par actif apparaîtront ici dès qu'un ordre sera importé ou saisi manuellement.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau de synthèse globale */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-center">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">Capital investi</p>
          <p className="font-data font-bold text-slate-100">{eur(totals.invested, 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">Frais cumulés</p>
          <p className="font-data font-bold text-slate-300">{eur(totals.fees, 2)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">PV réalisées</p>
          <p className={`font-data font-bold ${totals.realized >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(totals.realized, 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">PV latentes</p>
          <p className={`font-data font-bold ${totals.latent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(totals.latent, 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">Dividendes</p>
          <p className="font-data font-bold text-cyan-300">{eur(totals.dividends, 0)}</p>
        </div>
      </div>

      {/* Fiche de vie par actif */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2 px-1">Actif</th>
              <th className="py-2 px-1">Statut</th>
              <th className="py-2 px-1">Qté actuelle</th>
              <th className="py-2 px-1">PRU</th>
              <th className="py-2 px-1">Investi</th>
              <th className="py-2 px-1">Frais cumulés</th>
              <th className="py-2 px-1">PV réalisée</th>
              <th className="py-2 px-1">PV latente</th>
              <th className="py-2 px-1">Dividendes</th>
              <th className="py-2 px-1">Résultat net</th>
              <th className="py-2 px-1">Rendement net</th>
              <th className="py-2 px-1">Ordres</th>
              <th className="py-2 px-1">Période</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((r) => {
              const badge = STATUT_BADGE[r.statut];
              return (
                <tr key={r.key} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-1 font-data font-semibold text-slate-100">{r.label}</td>
                  <td className="py-2.5 px-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="py-2.5 px-1 font-data tabular-nums text-slate-300">{r.currentQty || <span className="text-slate-600">—</span>}</td>
                  <td className="py-2.5 px-1 font-data tabular-nums text-slate-300">{r.pru != null ? eur(r.pru, 2) : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2.5 px-1 font-data tabular-nums text-slate-300">{eur(r.totalInvested, 0)}</td>
                  <td className="py-2.5 px-1 font-data tabular-nums text-slate-500">{eur(r.feesTotal, 2)}</td>
                  <td className="py-2.5 px-1 font-data tabular-nums">
                    <span className={r.realizedPV === 0 ? "text-slate-600" : r.realizedPV > 0 ? "text-emerald-400" : "text-rose-400"}>
                      {eur(r.realizedPV, 2)}
                    </span>
                  </td>
                  <td className="py-2.5 px-1 font-data tabular-nums">
                    {r.currentQty > 0 ? (
                      <span className={r.latentPV >= 0 ? "text-emerald-400" : "text-rose-400"}>{eur(r.latentPV, 2)}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-1 font-data tabular-nums text-cyan-300">
                    {r.dividendsTotal > 0 ? eur(r.dividendsTotal, 2) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2.5 px-1 font-data tabular-nums font-semibold">
                    <span className={r.netResult >= 0 ? "text-emerald-400" : "text-rose-400"}>{eur(r.netResult, 2)}</span>
                  </td>
                  <td className="py-2.5 px-1 font-data tabular-nums">
                    {r.rendementPct != null ? (
                      <span className={r.rendementPct >= 0 ? "text-emerald-400" : "text-rose-400"}>{pctPlain(r.rendementPct, 1)}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-1 font-data tabular-nums text-slate-500">{r.nbOperations}</td>
                  <td className="py-2.5 px-1 text-[11px] text-slate-500 whitespace-nowrap">
                    {formatDateShortFr(r.firstDate)} → {formatDateShortFr(r.lastDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
