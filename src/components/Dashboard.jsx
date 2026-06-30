import React, { useState, useMemo, useEffect } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  TrendingUp, PiggyBank, Landmark, Wallet, ArrowUpRight, ArrowDownRight,
  Target, AlertCircle, Clock, ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, AddPanel, CustomTooltip, EmptyState, PageGlow } from "./ui";
import { eur, pct, compact, uid } from "../lib/finance";

// ─── Time filter config ────────────────────────────────────────────────────────
const TIME_FILTERS = [
  { key: "1M", label: "1M", months: 1 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1Y", months: 12 },
  { key: "ALL", label: "ALL", months: null },
];

function getMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

// ─── Stagnation badge ─────────────────────────────────────────────────────────
function StagnationBadge({ lastUpdateDate }) {
  if (!lastUpdateDate) return null;
  const diffMs = Date.now() - new Date(lastUpdateDate).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const color =
    diffDays === 0 ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/5"
    : diffDays <= 3 ? "text-amber-300 border-amber-400/30 bg-amber-400/5"
    : "text-rose-400 border-rose-400/30 bg-rose-400/5";
  const label =
    diffDays === 0 ? "Actualisé aujourd'hui"
    : diffDays === 1 ? "Dernier relevé : hier"
    : `Dernier relevé : il y a ${diffDays} jours`;
  return (
    <span className={`flex items-center gap-1.5 text-[11px] border rounded-full px-2.5 py-1 ${color}`}>
      <Clock size={10} />
      {label}
    </span>
  );
}

// ─── Time filter buttons ──────────────────────────────────────────────────────
function TimeFilterBar({ active, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {TIME_FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
            active === f.key
              ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Allocation target panel ──────────────────────────────────────────────────
function AllocationTarget({ target, setTarget, livretsTotal, bourseTotal }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(target);
  const total = livretsTotal + bourseTotal;
  if (total === 0) return null;

  const currentBoursePct = total > 0 ? (bourseTotal / total) * 100 : 0;
  const currentLivretsPct = 100 - currentBoursePct;
  const targetBoursePct = target.bourse;
  const targetLivretsPct = 100 - targetBoursePct;

  const gapBourse = currentBoursePct - targetBoursePct;
  const absGap = Math.abs(gapBourse);

  // Compute next investment suggestion
  const nextAmount = 500;
  let suggestion = null;
  if (absGap > 2) {
    if (gapBourse < 0) {
      suggestion = `Pour te rapprocher de ta cible, oriente tes prochains ${eur(nextAmount)} vers ton PEA/Bourse.`;
    } else {
      suggestion = `Pour te rapprocher de ta cible, oriente tes prochains ${eur(nextAmount)} vers tes livrets.`;
    }
  }

  const save = () => {
    setTarget(draft);
    setEditing(false);
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
          <Target size={11} />
          Allocation cible
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="flex items-center gap-1 text-[11px] text-amber-300/70 hover:text-amber-300"
        >
          {editing ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {editing ? "Fermer" : "Définir ma cible"}
        </button>
      </div>

      {/* Bars: Current vs Target */}
      <div className="space-y-2.5">
        {/* Épargne sécurisée */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>Épargne sécurisée</span>
            <span>
              <span className="text-slate-300 font-data">{currentLivretsPct.toFixed(0)}%</span>
              <span className="text-slate-600 mx-1">→</span>
              <span className="text-teal-400 font-data">{targetLivretsPct.toFixed(0)}%</span>
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-visible">
            <div
              className="absolute top-0 left-0 h-2 rounded-full bg-teal-400/50 transition-all"
              style={{ width: `${currentLivretsPct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-2 rounded-full border-2 border-teal-400 bg-transparent transition-all"
              style={{ width: `${targetLivretsPct}%` }}
            />
          </div>
        </div>
        {/* Bourse */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>Bourse (PEA)</span>
            <span>
              <span className="text-slate-300 font-data">{currentBoursePct.toFixed(0)}%</span>
              <span className="text-slate-600 mx-1">→</span>
              <span className="text-amber-400 font-data">{targetBoursePct.toFixed(0)}%</span>
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-visible">
            <div
              className="absolute top-0 left-0 h-2 rounded-full bg-amber-400/50 transition-all"
              style={{ width: `${currentBoursePct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-2 rounded-full border-2 border-amber-400 bg-transparent transition-all"
              style={{ width: `${targetBoursePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ecart */}
      {absGap > 2 && (
        <div className="flex items-start gap-2 mt-3 text-[11px] text-amber-300/80 bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2">
          <Zap size={11} className="mt-0.5 shrink-0" />
          <span>{suggestion}</span>
        </div>
      )}
      {absGap <= 2 && absGap >= 0 && (
        <div className="flex items-center gap-2 mt-3 text-[11px] text-emerald-400/80 bg-emerald-400/5 border border-emerald-400/15 rounded-lg px-3 py-2">
          <Target size={11} />
          Ton allocation est conforme à ta cible. ✓
        </div>
      )}

      {/* Edit slider */}
      {editing && (
        <div className="mt-4 p-3 rounded-xl border border-slate-700 bg-slate-950">
          <label className="text-[11px] text-slate-500 block mb-2">
            Part Bourse cible : <span className="text-amber-300 font-data">{draft.bourse}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft.bourse}
            onChange={(e) => setDraft({ bourse: parseInt(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>100% Livrets</span>
            <span>100% Bourse</span>
          </div>
          <button
            onClick={save}
            className="mt-3 w-full text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors"
          >
            Enregistrer la cible
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Custom tooltip for chart with projection ─────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-data tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span className="text-slate-400">{p.name} :</span>
          <span className={p.name?.includes("Projection") ? "text-amber-300/70" : "text-slate-100"}>
            {eur(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Snapshot: auto-save today's value ───────────────────────────────────────
function useDailySnapshot(patrimoineNet, historyPast, setHistoryPast, lastSnapshotDate, setLastSnapshotDate) {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (lastSnapshotDate === today) return;
    if (patrimoineNet <= 0) return;
    const todayLabel = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const exists = historyPast.find((h) => h.date === today);
    if (!exists) {
      setHistoryPast((h) => [...h, { id: uid(), label: todayLabel, value: Math.round(patrimoineNet), date: today }]);
    }
    setLastSnapshotDate(today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patrimoineNet]);
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({
  profile, setProfile, patrimoineBrut, patrimoineNet, bourseGainAbs, bourseGainPct,
  epargneMensuelle, tauxEpargne, dettes, setDettes, dettesTotal,
  historyPast, setHistoryPast, livretsTotal, bourseTotal,
  bourseInvested,
}) {
  const [showAddDette, setShowAddDette] = useState(false);
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [timeFilter, setTimeFilter] = useState("ALL");
  const [lastSnapshotDate, setLastSnapshotDate] = useState(() => {
    try { return localStorage.getItem("patrimoine:lastSnapshotDate") || null; } catch { return null; }
  });

  // Allocation target state
  const [allocationTarget, setAllocationTarget] = useState(() => {
    try {
      const raw = localStorage.getItem("patrimoine:allocationTarget");
      return raw ? JSON.parse(raw) : { bourse: 60 };
    } catch { return { bourse: 60 }; }
  });

  // Persist allocation target
  const saveAllocationTarget = (t) => {
    setAllocationTarget(t);
    try { localStorage.setItem("patrimoine:allocationTarget", JSON.stringify(t)); } catch {}
  };

  // Persist lastSnapshotDate
  const saveLastSnapshotDate = (d) => {
    setLastSnapshotDate(d);
    try { localStorage.setItem("patrimoine:lastSnapshotDate", d); } catch {}
  };

  // Auto daily snapshot
  useDailySnapshot(patrimoineNet, historyPast, setHistoryPast, lastSnapshotDate, saveLastSnapshotDate);

  const addDette = (v) => setDettes((d) => [...d, { id: uid(), name: v.name, amount: v.amount }]);
  const removeDette = (id) => setDettes((d) => d.filter((x) => x.id !== id));
  const addHistoryPoint = (v) => {
    const today = new Date().toISOString().slice(0, 10);
    setHistoryPast((h) => [...h, { id: uid(), label: v.label, value: parseFloat(v.value), date: v.date || today }]);
    saveLastSnapshotDate(v.date || today);
  };
  const removeHistoryPoint = (id) => setHistoryPast((h) => h.filter((x) => x.id !== id));

  // Last update date (most recent date in history)
  const lastUpdateDate = useMemo(() => {
    const datesFromHistory = historyPast
      .map((h) => h.date)
      .filter(Boolean)
      .sort()
      .reverse();
    return datesFromHistory[0] || null;
  }, [historyPast]);

  // Delta vs last month
  const lastPastPoint = historyPast[historyPast.length - 1]?.value ?? patrimoineNet;
  const deltaVsLastMonth = patrimoineNet - lastPastPoint;

  // Savings effort vs market gains
  const versementsCumules = bourseInvested || 0;
  const gainsMarcheReels = bourseGainAbs || 0;

  // Build chart data with time filter + projection
  const chartData = useMemo(() => {
    const allPoints = [
      ...historyPast.map((h) => ({ label: h.label, value: h.value, date: h.date })),
      { label: "Aujourd'hui", value: Math.round(patrimoineNet), date: new Date().toISOString().slice(0, 10) },
    ];

    // Apply time filter
    let filtered = allPoints;
    const filterConfig = TIME_FILTERS.find((f) => f.key === timeFilter);
    if (filterConfig?.months) {
      const cutoff = getMonthsAgo(filterConfig.months);
      filtered = allPoints.filter((p) => {
        if (!p.date) return true;
        return new Date(p.date) >= cutoff;
      });
      if (filtered.length === 0) filtered = allPoints.slice(-2);
    }

    // Build projection: 6 months ahead, linear based on epargneMensuelle
    const projectionMonths = 6;
    const projectionPoints = [];
    const now = new Date();
    for (let i = 1; i <= projectionMonths; i++) {
      const futureDate = new Date(now);
      futureDate.setMonth(futureDate.getMonth() + i);
      const label = futureDate.toLocaleDateString("fr-FR", { month: "short" });
      projectionPoints.push({
        label,
        projection: Math.round(patrimoineNet + epargneMensuelle * i),
        date: futureDate.toISOString().slice(0, 10),
      });
    }

    // Merge: last real point ties into first projection
    const histData = filtered.map((p) => ({ ...p, projection: undefined }));
    // Connect real line to first projection point
    if (histData.length > 0) {
      histData[histData.length - 1].projection = Math.round(patrimoineNet);
    }

    return [...histData, ...projectionPoints];
  }, [historyPast, patrimoineNet, epargneMensuelle, timeFilter]);

  // Allocation data
  const allocationData = [
    { name: "Épargne sécurisée", value: livretsTotal, color: "#2dd4bf" },
    { name: "Bourse (PEA)", value: bourseTotal, color: "#fbbf24" },
  ].filter((d) => d.value > 0);
  const totalAlloc = allocationData.reduce((s, d) => s + d.value, 0);

  // Find the join point index for reference line
  const joinIndex = historyPast.length; // index of "Aujourd'hui" in chartData

  return (
    <div className="relative space-y-6">
      <PageGlow color="emerald" />
      <div className="flex items-start justify-between relative">
        <div>
          <h1 className="font-display text-2xl text-slate-50">
            Dashboard <span className="text-emerald-400">global</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">La photographie consolidée de ton patrimoine, à date.</p>
        </div>
        <StagnationBadge lastUpdateDate={lastUpdateDate} />
      </div>

      {/* Profil mensuel */}
      <Card accent="border-emerald-500/10 hover:border-emerald-500/20" className="flex flex-wrap items-center gap-6">
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
            background: "radial-gradient(circle at 32% 30%, rgba(16,185,129,0.12), transparent 65%)",
            border: "1.5px solid rgba(16,185,129,0.35)",
          }}
        >
          <span className="text-[11px] uppercase tracking-widest text-emerald-300/80 font-medium">Patrimoine net</span>
          <span className="font-display text-[26px] text-slate-50 mt-1.5 leading-tight">{eur(patrimoineNet)}</span>
          <span className={`text-xs mt-1.5 flex items-center gap-1 ${deltaVsLastMonth >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {deltaVsLastMonth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {eur(Math.abs(deltaVsLastMonth))} vs mois dernier
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card accent="border-emerald-500/10 hover:border-emerald-500/20">
            <CardLabel icon={Landmark}>Patrimoine brut</CardLabel>
            <div className="font-display text-xl text-slate-100">{eur(patrimoineBrut)}</div>
            {dettesTotal > 0 && <div className="text-xs text-slate-500 mt-1">dont −{eur(dettesTotal)} de passifs</div>}
          </Card>

          {/* Enhanced performance card: effort vs gains */}
          <Card accent="border-emerald-500/10 hover:border-emerald-500/20">
            <CardLabel icon={TrendingUp}>Performance bourse</CardLabel>
            <div className={`font-display text-xl ${bourseGainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {eur(bourseGainAbs)}
            </div>
            <div className={`text-xs mt-1 ${bourseGainAbs >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
              {pct(bourseGainPct)}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                  Versements cumulés
                </span>
                <span className="font-data tabular-nums text-slate-300">{eur(versementsCumules)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className={`flex items-center gap-1 ${gainsMarcheReels >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${gainsMarcheReels >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                  Gains marché réels
                </span>
                <span className={`font-data tabular-nums ${gainsMarcheReels >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {eur(gainsMarcheReels)}
                </span>
              </div>
            </div>
          </Card>

          <Card accent="border-emerald-500/10 hover:border-emerald-500/20">
            <CardLabel icon={PiggyBank}>Taux d'épargne mensuel</CardLabel>
            <div className="font-display text-xl text-slate-100">{eur(epargneMensuelle)}</div>
            <div className="text-xs text-emerald-300/80 mt-1">{pct(tauxEpargne)} du revenu</div>
            {epargneMensuelle > 0 && (
              <div className="text-[11px] text-slate-600 mt-1">
                Projection +{eur(epargneMensuelle * 6)} / 6 mois
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Allocation + historique */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation card */}
        <Card accent="border-emerald-500/10 hover:border-emerald-500/20">
          <CardLabel>Allocation d'actifs globale</CardLabel>
          {allocationData.length === 0 ? (
            <EmptyState>Ajoute un livret ou une position pour voir ta répartition.</EmptyState>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={3} stroke="none">
                      {allocationData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
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
          {/* Allocation target section */}
          <AllocationTarget
            target={allocationTarget}
            setTarget={saveAllocationTarget}
            livretsTotal={livretsTotal}
            bourseTotal={bourseTotal}
          />
          <p className="text-[11px] text-slate-600 mt-3">
            L'onglet « Immobilier &amp; Crédit » te permet de planifier un futur achat sans modifier cette répartition.
          </p>
        </Card>

        {/* History chart card */}
        <Card accent="border-emerald-500/10 hover:border-emerald-500/20">
          <div className="flex items-center justify-between mb-1">
            <CardLabel>Évolution du patrimoine net</CardLabel>
            <div className="flex items-center gap-2">
              <TimeFilterBar active={timeFilter} onChange={setTimeFilter} />
              <GhostButton theme="emerald" onClick={() => setShowAddHistory((s) => !s)}>Ajouter</GhostButton>
            </div>
          </div>

          {/* Legend for projection */}
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <div className="w-6 h-0.5 bg-emerald-400 rounded" />
              Historique
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <div className="w-6 h-0.5 border-t-2 border-dashed border-emerald-400/50" />
              Projection ({eur(epargneMensuelle)}/mois)
            </div>
          </div>

          <div className="h-52 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ left: -10, right: 5, top: 5 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<ChartTooltip />} />
                {/* Vertical reference line at "Aujourd'hui" */}
                <ReferenceLine x="Aujourd'hui" stroke="#475569" strokeDasharray="3 3" label={{ value: "Auj.", fill: "#475569", fontSize: 10 }} />
                {/* Historical area */}
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Patrimoine net"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#netWorthFill)"
                  connectNulls={false}
                />
                {/* Projection dashed line */}
                <Line
                  type="monotone"
                  dataKey="projection"
                  name="Projection"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  strokeOpacity={0.55}
                  connectNulls={true}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <AddPanel
            open={showAddHistory}
            onClose={() => setShowAddHistory(false)}
            onSubmit={addHistoryPoint}
            fields={[
              { key: "label", label: "Libellé (ex: Juin)", type: "text", required: true },
              { key: "date", label: "Date (AAAA-MM-JJ)", type: "date", required: false },
              { key: "value", label: "Patrimoine net (€)", type: "number", step: "100", required: true },
            ]}
          />

          {historyPast.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 max-h-24 overflow-y-auto">
              {historyPast.map((h) => (
                <span key={h.id} className="flex items-center gap-1.5 text-[11px] bg-slate-950 border border-slate-800 rounded-full px-2.5 py-1 text-slate-400">
                  {h.label} · {eur(h.value)}
                  <button onClick={() => removeHistoryPoint(h.id)} className="text-slate-600 hover:text-rose-400">×</button>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Passifs */}
      <Card accent="border-emerald-500/10 hover:border-emerald-500/20">
        <div className="flex items-center justify-between">
          <CardLabel>Passifs / Dettes</CardLabel>
          <GhostButton theme="emerald" onClick={() => setShowAddDette((s) => !s)}>Ajouter un passif</GhostButton>
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
