import React, { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ComposedChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp, PiggyBank, Landmark, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, AddPanel, CustomTooltip, EmptyState } from "./ui";
import { eur, pct, compact, uid } from "../lib/finance";

export default function Dashboard({
  profile, setProfile, patrimoineBrut, patrimoineNet, bourseGainAbs, bourseGainPct,
  epargneMensuelle, tauxEpargne, dettes, setDettes, dettesTotal,
  historyPast, setHistoryPast, livretsTotal, bourseTotal,
}) {
  const [showAddDette, setShowAddDette] = useState(false);
  const [showAddHistory, setShowAddHistory] = useState(false);

  const addDette = (v) => setDettes((d) => [...d, { id: uid(), name: v.name, amount: v.amount }]);
  const removeDette = (id) => setDettes((d) => d.filter((x) => x.id !== id));
  const addHistoryPoint = (v) => setHistoryPast((h) => [...h, { id: uid(), label: v.label, value: v.value }]);
  const removeHistoryPoint = (id) => setHistoryPast((h) => h.filter((x) => x.id !== id));

  const lastPastPoint = historyPast[historyPast.length - 1]?.value ?? patrimoineNet;
  const deltaVsLastMonth = patrimoineNet - lastPastPoint;

  const historyChartData = [
    ...historyPast.map((h) => ({ label: h.label, value: h.value })),
    { label: "Aujourd'hui", value: Math.round(patrimoineNet) },
  ];

  const allocationData = [
    { name: "Épargne sécurisée", value: livretsTotal, color: "#2dd4bf" },
    { name: "Bourse (PEA)", value: bourseTotal, color: "#fbbf24" },
  ].filter((d) => d.value > 0);
  const totalAlloc = allocationData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-slate-50">Dashboard global</h1>
        <p className="text-sm text-slate-500 mt-1">La photographie consolidée de ton patrimoine, à date.</p>
      </div>

      {/* Profil mensuel — éditable */}
      <Card className="flex flex-wrap items-center gap-6">
        <CardLabel icon={Wallet}>Profil mensuel</CardLabel>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Revenu net</label>
          <input
            type="number"
            value={profile.monthly_income}
            onChange={(e) => setProfile((p) => ({ ...p, monthly_income: parseFloat(e.target.value) || 0 }))}
            className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
          />
          <span className="text-xs text-slate-600">€/mois</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Dépenses</label>
          <input
            type="number"
            value={profile.monthly_expenses}
            onChange={(e) => setProfile((p) => ({ ...p, monthly_expenses: parseFloat(e.target.value) || 0 }))}
            className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
          />
          <span className="text-xs text-slate-600">€/mois</span>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
        <div
          className="flex flex-col items-center justify-center text-center rounded-full mx-auto p-6 aspect-square w-[190px]"
          style={{
            background: "radial-gradient(circle at 32% 30%, rgba(251,191,36,0.10), transparent 65%)",
            border: "1.5px solid rgba(251,191,36,0.35)",
          }}
        >
          <span className="text-[11px] uppercase tracking-widest text-amber-300/80 font-medium">Patrimoine net</span>
          <span className="font-display text-[26px] text-slate-50 mt-1.5 leading-tight">{eur(patrimoineNet)}</span>
          <span className={`text-xs mt-1.5 flex items-center gap-1 ${deltaVsLastMonth >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {deltaVsLastMonth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {eur(Math.abs(deltaVsLastMonth))} vs mois dernier
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardLabel icon={Landmark}>Patrimoine brut</CardLabel>
            <div className="font-display text-xl text-slate-100">{eur(patrimoineBrut)}</div>
            {dettesTotal > 0 && <div className="text-xs text-slate-500 mt-1">dont −{eur(dettesTotal)} de passifs</div>}
          </Card>
          <Card>
            <CardLabel icon={TrendingUp}>Plus-value latente (Bourse)</CardLabel>
            <div className={`font-display text-xl ${bourseGainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(bourseGainAbs)}</div>
            <div className={`text-xs mt-1 ${bourseGainAbs >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>{pct(bourseGainPct)}</div>
          </Card>
          <Card>
            <CardLabel icon={PiggyBank}>Taux d'épargne mensuel</CardLabel>
            <div className="font-display text-xl text-slate-100">{eur(epargneMensuelle)}</div>
            <div className="text-xs text-amber-300/80 mt-1">{pct(tauxEpargne)} du revenu</div>
          </Card>
        </div>
      </div>

      {/* Allocation + historique */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardLabel>Allocation d'actifs globale</CardLabel>
          {allocationData.length === 0 ? (
            <EmptyState>Ajoute un livret ou une position pour voir ta répartition.</EmptyState>
          ) : (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} stroke="none">
                      {allocationData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 mt-2">
                {allocationData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-data tabular-nums text-slate-300">
                      {eur(d.value)} · {totalAlloc > 0 ? ((d.value / totalAlloc) * 100).toFixed(0) : 0} %
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="text-[11px] text-slate-600 mt-3">
            L'onglet « Immobilier &amp; Crédit » te permet de planifier un futur achat sans modifier cette répartition.
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardLabel>Évolution du patrimoine net</CardLabel>
            <GhostButton onClick={() => setShowAddHistory((s) => !s)}>Ajouter un relevé</GhostButton>
          </div>
          <div className="h-52 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={historyChartData} margin={{ left: -10, right: 5, top: 5 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" name="Patrimoine net" stroke="#fbbf24" strokeWidth={2} fill="url(#netWorthFill)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <AddPanel
            open={showAddHistory}
            onClose={() => setShowAddHistory(false)}
            onSubmit={addHistoryPoint}
            fields={[
              { key: "label", label: "Mois (ex: Juin)", type: "text", required: true },
              { key: "value", label: "Patrimoine net (€)", type: "number", step: "100", required: true },
            ]}
          />
          {historyPast.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {historyPast.map((h) => (
                <span key={h.id} className="flex items-center gap-1.5 text-[11px] bg-slate-950 border border-slate-800 rounded-full px-2.5 py-1 text-slate-400">
                  {h.label} · {eur(h.value)}
                  <button onClick={() => removeHistoryPoint(h.id)} className="text-slate-600 hover:text-rose-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Passifs */}
      <Card>
        <div className="flex items-center justify-between">
          <CardLabel>Passifs / Dettes</CardLabel>
          <GhostButton onClick={() => setShowAddDette((s) => !s)}>Ajouter un passif</GhostButton>
        </div>
        {dettes.length === 0 ? (
          <EmptyState>Aucun passif déclaré — le patrimoine net est égal au patrimoine brut.</EmptyState>
        ) : (
          <div className="mt-2 divide-y divide-slate-800">
            {dettes.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-300">{d.name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-data tabular-nums text-rose-400">−{eur(d.amount)}</span>
                  <IconTrash onClick={() => removeDette(d.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
        <AddPanel
          open={showAddDette}
          onClose={() => setShowAddDette(false)}
          onSubmit={addDette}
          fields={[
            { key: "name", label: "Nom du passif", type: "text", placeholder: "Crédit conso, etc.", required: true },
            { key: "amount", label: "Montant restant (€)", type: "number", step: "100", required: true },
          ]}
        />
      </Card>
    </div>
  );
}
