import React, { useMemo, useState } from "react";
import { ChevronDown, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from "recharts";
import { eur, pctPlain } from "../lib/finance";
import { Card, CardLabel, EmptyState } from "./ui";
import AssetLogo from "./AssetLogo";

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

function PerformanceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-data font-semibold text-slate-100 mb-1">{d.label}</p>
      <p className={`font-data font-bold ${d.rendementPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {pctPlain(d.rendementPct, 1)}
      </p>
      <p className="text-slate-500 mt-1 ghost-blur">Résultat net : {eur(d.netResult, 2)}</p>
    </div>
  );
}

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

  const [openKeys, setOpenKeys] = useState(() => new Set());
  const toggle = (key) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

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
          <p className="font-data font-bold text-slate-100 ghost-blur">{eur(totals.invested, 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">Frais cumulés</p>
          <p className="font-data font-bold text-slate-300 ghost-blur">{eur(totals.fees, 2)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">PV réalisées</p>
          <p className={`font-data font-bold ghost-blur ${totals.realized >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(totals.realized, 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">PV latentes</p>
          <p className={`font-data font-bold ghost-blur ${totals.latent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(totals.latent, 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] text-slate-500">Dividendes</p>
          <p className="font-data font-bold text-cyan-300 ghost-blur">{eur(totals.dividends, 0)}</p>
        </div>
      </div>

      {/* Diagramme de performance comparée */}
      {(() => {
        const chartData = rows.filter((r) => r.rendementPct != null).sort((a, b) => b.rendementPct - a.rendementPct);
        if (chartData.length === 0) return null;
        return (
          <Card>
            <CardLabel icon={BarChart3}>Performance comparée (rendement net)</CardLabel>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#334155" }} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ReferenceLine y={0} stroke="#334155" />
                  <Tooltip content={<PerformanceTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Bar dataKey="rendementPct" radius={[4, 4, 4, 4]} maxBarSize={38}>
                    {chartData.map((r) => (
                      <Cell key={r.key} fill={r.rendementPct >= 0 ? "#34d399" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      })()}

      {/* Fiches de vie par actif, dépliables */}
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const badge = STATUT_BADGE[r.statut];
          const open = openKeys.has(r.key);
          const perfColor = r.rendementPct == null ? "text-slate-500" : r.rendementPct >= 0 ? "text-emerald-400" : "text-rose-400";

          return (
            <div key={r.key} className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <button
                onClick={() => toggle(r.key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                  <AssetLogo ticker={r.label} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-data font-semibold text-slate-100 truncate">{r.label}</span>
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {r.currentQty > 0 ? `${r.currentQty} titres en portefeuille` : `${r.nbOperations} ordre(s) historisé(s)`}
                    </p>
                  </div>
                </div>
                <div className={`font-data text-lg font-bold shrink-0 ${perfColor}`}>
                  {r.rendementPct != null ? pctPlain(r.rendementPct, 1) : "—"}
                </div>
              </button>

              {open && (
                <div className="border-t border-slate-800 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <StatBlock label="Qté actuelle" value={r.currentQty || "—"} />
                  <StatBlock label="PRU" value={r.pru != null ? eur(r.pru, 2) : "—"} sensitive />
                  <StatBlock label="Investi" value={eur(r.totalInvested, 0)} sensitive />
                  <StatBlock label="Frais cumulés" value={eur(r.feesTotal, 2)} muted sensitive />
                  <StatBlock
                    label="PV réalisée"
                    value={eur(r.realizedPV, 2)}
                    tone={r.realizedPV === 0 ? "neutral" : r.realizedPV > 0 ? "pos" : "neg"}
                    sensitive
                  />
                  <StatBlock
                    label="PV latente"
                    value={r.currentQty > 0 ? eur(r.latentPV, 2) : "—"}
                    tone={r.currentQty > 0 ? (r.latentPV >= 0 ? "pos" : "neg") : "neutral"}
                    sensitive
                  />
                  <StatBlock label="Dividendes" value={r.dividendsTotal > 0 ? eur(r.dividendsTotal, 2) : "—"} cyan sensitive />
                  <StatBlock label="Résultat net" value={eur(r.netResult, 2)} tone={r.netResult >= 0 ? "pos" : "neg"} bold sensitive />
                  <StatBlock label="Ordres" value={r.nbOperations} muted />
                  <StatBlock label="Période" value={`${formatDateShortFr(r.firstDate)} → ${formatDateShortFr(r.lastDate)}`} small />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBlock({ label, value, tone = "default", muted, cyan, bold, small, sensitive }) {
  const toneCls =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : tone === "neutral" ? "text-slate-500" : "text-slate-100";
  const colorCls = cyan ? "text-cyan-300" : muted ? "text-slate-400" : toneCls;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`font-data ${small ? "text-[11px]" : "text-sm"} ${bold ? "font-semibold" : ""} ${colorCls} ${sensitive ? "ghost-blur" : ""}`}>{value}</p>
    </div>
  );
}
