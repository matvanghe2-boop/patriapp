import React, { useState, useMemo } from "react";
import {
  PiggyBank, ShieldCheck, Banknote, Lightbulb, Target,
  Plus, Trash2, X, ChevronDown, ChevronUp, AlertTriangle, TrendingUp,
} from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, AddPanel, EmptyState, PageGlow } from "./ui";
import { eur, uid } from "../lib/finance";

// ─── Known high-yield alternatives for the arbitrage engine ──────────────────
const MARKET_ALTERNATIVES = [
  { name: "LEP (Livret d'Épargne Populaire)", rate: 0.034, condition: "Éligible si revenu fiscal ≤ 21 393 €", plafond: 10000 },
  { name: "Livret boosté (offre promotionnelle)", rate: 0.04, condition: "3 à 6 mois selon banque", plafond: null },
  { name: "LDDS", rate: 0.017, condition: "Plafond 12 000 €", plafond: 12000 },
];

// ─── Smart Progress Bar ───────────────────────────────────────────────────────
function SmartProgressBar({ value, max, goal, color = "bg-indigo-400", showGoal = false }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const goalPct = (goal && max > 0) ? Math.min(100, (goal / max) * 100) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 w-full rounded-full bg-slate-800 overflow-visible">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
        {goalPct !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-400/80 rounded-full"
            style={{ left: `${goalPct}%` }}
            title={`Objectif : ${eur(goal)}`}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 font-data">
        <span>{pct.toFixed(0)}%</span>
        <span>{eur(value, 0)} / {eur(max, 0)}</span>
      </div>
    </div>
  );
}

// ─── Compte Courant card ──────────────────────────────────────────────────────
function CompteCourant({ cash, setCash }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cash);

  const save = () => { setCash(parseFloat(draft) || 0); setEditing(false); };

  return (
    <Card accent="border-indigo-500/15 hover:border-indigo-500/25" className="flex items-center gap-4 relative">
      <div className="rounded-full bg-slate-700/60 text-slate-300 p-3 shrink-0">
        <Banknote size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Compte courant</div>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-28 bg-slate-950 border border-amber-400/40 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-amber-400"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            />
            <span className="text-xs text-slate-500">€</span>
            <button onClick={save} className="text-xs bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded-lg px-3 py-1">OK</button>
            <button onClick={() => setEditing(false)} className="text-slate-600 hover:text-slate-300"><X size={14} /></button>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl text-slate-100">{eur(cash)}</span>
            <span className="text-[11px] text-slate-600">cash disponible</span>
          </div>
        )}
      </div>
      <button
        onClick={() => { setDraft(cash); setEditing(true); }}
        className="text-xs text-slate-500 hover:text-amber-300 border border-slate-700 hover:border-amber-400/40 rounded-lg px-3 py-1.5 transition-colors shrink-0"
      >
        Modifier
      </button>
    </Card>
  );
}

// ─── Ventilation / Enveloppes tags ────────────────────────────────────────────
const ENVELOPPE_COLORS = [
  { bg: "bg-teal-400/15 border-teal-400/30 text-teal-300", dot: "bg-teal-400" },
  { bg: "bg-violet-400/15 border-violet-400/30 text-violet-300", dot: "bg-violet-400" },
  { bg: "bg-amber-400/15 border-amber-400/30 text-amber-300", dot: "bg-amber-400" },
  { bg: "bg-rose-400/15 border-rose-400/30 text-rose-300", dot: "bg-rose-400" },
  { bg: "bg-sky-400/15 border-sky-400/30 text-sky-300", dot: "bg-sky-400" },
];

function Ventilation({ livretsTotal, enveloppes, setEnveloppes }) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ label: "", amount: "" });
  const [expanded, setExpanded] = useState(true);

  const totalTagged = enveloppes.reduce((s, e) => s + e.amount, 0);
  const remaining = livretsTotal - totalTagged;

  const addEnv = () => {
    if (!draft.label || !draft.amount) return;
    setEnveloppes((prev) => [
      ...prev,
      { id: uid(), label: draft.label, amount: parseFloat(draft.amount) || 0, colorIdx: prev.length % ENVELOPPE_COLORS.length },
    ]);
    setDraft({ label: "", amount: "" });
    setShowAdd(false);
  };
  const removeEnv = (id) => setEnveloppes((prev) => prev.filter((e) => e.id !== id));
  const updateEnv = (id, amount) =>
    setEnveloppes((prev) => prev.map((e) => e.id === id ? { ...e, amount: parseFloat(amount) || 0 } : e));

  return (
    <Card accent="border-indigo-500/15 hover:border-indigo-500/25">
      <div className="flex items-center justify-between">
        <CardLabel icon={Target}>Ventilation de l'épargne</CardLabel>
        <div className="flex items-center gap-2">
          <GhostButton theme="indigo" onClick={() => setShowAdd((s) => !s)} icon={Plus}>Ajouter une enveloppe</GhostButton>
          <button onClick={() => setExpanded((e) => !e)} className="text-slate-500 hover:text-slate-300">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Total bar split visually */}
          {livretsTotal > 0 && enveloppes.length > 0 && (
            <div className="mt-3 mb-4">
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {enveloppes.map((e, i) => {
                  const pct = (e.amount / livretsTotal) * 100;
                  const colors = ["bg-teal-400", "bg-violet-400", "bg-amber-400", "bg-rose-400", "bg-sky-400"];
                  return (
                    <div
                      key={e.id}
                      className={`${colors[e.colorIdx ?? i % colors.length]} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${e.label} : ${eur(e.amount)}`}
                    />
                  );
                })}
                {remaining > 0 && (
                  <div
                    className="bg-slate-700 transition-all"
                    style={{ width: `${(remaining / livretsTotal) * 100}%` }}
                    title={`Non alloué : ${eur(remaining)}`}
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-600 mt-1 font-data">
                <span>0 €</span>
                <span>{eur(livretsTotal)}</span>
              </div>
            </div>
          )}

          {/* Envelopes list */}
          {enveloppes.length === 0 ? (
            <EmptyState>Aucune enveloppe — segmente ton épargne par usage pour mieux piloter.</EmptyState>
          ) : (
            <div className="space-y-2 mt-2">
              {enveloppes.map((e, i) => {
                const colors = ENVELOPPE_COLORS[e.colorIdx ?? i % ENVELOPPE_COLORS.length];
                const pct = livretsTotal > 0 ? (e.amount / livretsTotal) * 100 : 0;
                return (
                  <div key={e.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${colors.bg}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                    <span className="flex-1 text-sm font-medium">{e.label}</span>
                    <span className="text-[11px] opacity-60 font-data">{pct.toFixed(0)}%</span>
                    <input
                      type="number"
                      value={e.amount}
                      onChange={(ev) => updateEnv(e.id, ev.target.value)}
                      className="w-24 bg-black/20 border border-white/10 rounded-lg px-2 py-1 text-sm font-data tabular-nums text-right focus:outline-none focus:border-white/30"
                    />
                    <span className="text-[11px] opacity-50">€</span>
                    <button onClick={() => removeEnv(e.id)} className="opacity-40 hover:opacity-80 ml-1">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
              {/* Remainder */}
              {Math.abs(remaining) > 1 && (
                <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${remaining >= 0 ? "border-slate-700 text-slate-500" : "border-rose-400/30 text-rose-400"}`}>
                  <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                  <span className="flex-1">{remaining >= 0 ? "Non alloué" : "Dépassement"}</span>
                  <span className="font-data tabular-nums">
                    {remaining >= 0 ? eur(remaining) : `−${eur(Math.abs(remaining))}`}
                  </span>
                  {remaining < 0 && <AlertTriangle size={13} className="text-rose-400" />}
                </div>
              )}
            </div>
          )}

          {/* Add envelope inline form */}
          {showAdd && (
            <div className="mt-3 flex items-end gap-2 p-3 rounded-xl border border-amber-400/20 bg-slate-950">
              <div className="flex-1">
                <label className="text-[11px] text-slate-500 block mb-1">Nom de l'enveloppe</label>
                <input
                  type="text"
                  placeholder="Matelas urgence, Voyage..."
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-400/60"
                />
              </div>
              <div className="w-28">
                <label className="text-[11px] text-slate-500 block mb-1">Montant (€)</label>
                <input
                  type="number"
                  placeholder="3000"
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 font-data tabular-nums focus:outline-none focus:border-amber-400/60"
                />
              </div>
              <button onClick={addEnv} className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-3 py-1.5">Ajouter</button>
              <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300 py-1.5"><X size={14} /></button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Arbitrage optimizer ──────────────────────────────────────────────────────
function ArbitrageOptimizer({ livrets }) {
  const suggestions = useMemo(() => {
    const results = [];
    livrets.forEach((livret) => {
      MARKET_ALTERNATIVES.forEach((alt) => {
        if (alt.rate > livret.rate) {
          const transferable = alt.plafond
            ? Math.min(livret.balance, alt.plafond)
            : Math.min(livret.balance, 5000);
          if (transferable <= 0) return;
          const gainAnnuel = transferable * (alt.rate - livret.rate);
          if (gainAnnuel < 5) return; // not worth showing trivial gains
          results.push({
            id: `${livret.id}-${alt.name}`,
            from: livret.name,
            fromRate: livret.rate,
            to: alt.name,
            toRate: alt.rate,
            amount: transferable,
            gainAnnuel,
            condition: alt.condition,
          });
        }
      });
    });
    // Sort by best gain first
    return results.sort((a, b) => b.gainAnnuel - a.gainAnnuel).slice(0, 3);
  }, [livrets]);

  if (suggestions.length === 0) return null;

  return (
    <Card accent="border-indigo-500/15 hover:border-indigo-500/25">
      <CardLabel icon={Lightbulb}>Optimisateur de rendement</CardLabel>
      <div className="space-y-3 mt-2">
        {suggestions.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3"
          >
            <Lightbulb size={14} className="text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 leading-relaxed">
                En déplaçant{" "}
                <span className="font-data font-semibold text-amber-300">{eur(s.amount)}</span>{" "}
                de ton <span className="text-slate-300">{s.from}</span> ({(s.fromRate * 100).toFixed(2)} %) vers{" "}
                <span className="text-slate-300">{s.to}</span> ({(s.toRate * 100).toFixed(2)} %), tu gagnes{" "}
                <span className="font-data font-semibold text-emerald-400">+{eur(s.gainAnnuel)} / an</span>.
              </p>
              <p className="text-[11px] text-slate-600 mt-1">{s.condition}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-600 mt-3">
        Les taux alternatifs sont indicatifs. Vérifie les conditions d'éligibilité auprès de ton établissement bancaire.
      </p>
    </Card>
  );
}

// ─── Livret row with smart progress bar ──────────────────────────────────────
function LivretRow({ l, onRemove, onUpdateGoal }) {
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [goalDraft, setGoalDraft] = useState(l.goal ?? "");

  const hasLimit = !!l.limit;
  const hasGoal = !!l.goal;
  const barMax = l.goal ?? l.limit;
  const barColor = l.goal
    ? "bg-violet-400"
    : l.limit
    ? l.balance / l.limit > 0.9
      ? "bg-rose-400"
      : l.balance / l.limit > 0.6
      ? "bg-amber-400"
      : "bg-indigo-400"
    : "bg-indigo-400";

  const saveGoal = () => {
    const g = parseFloat(goalDraft);
    onUpdateGoal(l.id, g > 0 ? g : null);
    setShowGoalEdit(false);
  };

  return (
    <tr className="group">
      <td className="py-3 pr-3 text-slate-200 font-medium">{l.name}</td>
      <td className="py-3 pr-3 font-data tabular-nums text-slate-100">{eur(l.balance)}</td>
      <td className="py-3 pr-3 font-data tabular-nums text-amber-300/90">{(l.rate * 100).toFixed(2)} %</td>
      <td className="py-3 pr-3 font-data tabular-nums text-emerald-400">{eur(l.balance * l.rate)}</td>
      <td className="py-3 pr-3 min-w-[160px]">
        {barMax ? (
          <SmartProgressBar
            value={l.balance}
            max={barMax}
            color={barColor}
          />
        ) : (
          <span className="text-[11px] text-slate-600">—</span>
        )}
        {/* Goal / limit labels */}
        <div className="flex items-center gap-2 mt-1">
          {hasGoal && (
            <span className="text-[10px] text-violet-400/80 bg-violet-400/10 border border-violet-400/20 rounded-full px-2 py-0.5">
              Objectif : {eur(l.goal, 0)}
            </span>
          )}
          {hasLimit && !hasGoal && (
            <span className="text-[10px] text-slate-600">
              Plafond légal : {eur(l.limit, 0)}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 pr-3">
        {showGoalEdit ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              placeholder="Ex: 10000"
              className="w-20 bg-slate-950 border border-violet-400/40 rounded-lg px-1.5 py-1 text-xs font-data focus:outline-none"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); if (e.key === "Escape") setShowGoalEdit(false); }}
            />
            <button onClick={saveGoal} className="text-[10px] bg-violet-500 hover:bg-violet-400 text-white rounded px-1.5 py-0.5">OK</button>
            <button onClick={() => setShowGoalEdit(false)}><X size={11} className="text-slate-600" /></button>
          </div>
        ) : (
          <button
            onClick={() => { setGoalDraft(l.goal ?? ""); setShowGoalEdit(true); }}
            className="text-[10px] text-slate-600 hover:text-violet-400 border border-transparent hover:border-violet-400/30 rounded-full px-2 py-0.5 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Target size={10} className="inline mr-1" />
            {hasGoal ? "Modifier objectif" : "Fixer objectif"}
          </button>
        )}
      </td>
      <td className="py-3 text-right">
        <IconTrash onClick={() => onRemove(l.id)} />
      </td>
    </tr>
  );
}

// ─── Main Livrets component ───────────────────────────────────────────────────
export default function Livrets({
  livrets, setLivrets, matelasMois, livretsTotal, livretsAvgRate,
  cash, setCash, enveloppes, setEnveloppes,
}) {
  const [showAdd, setShowAdd] = useState(false);

  const addLivret = (v) =>
    setLivrets((l) => [
      ...l,
      { id: uid(), name: v.name, balance: parseFloat(v.balance) || 0, rate: parseFloat(v.rate) / 100, limit: parseFloat(v.limit) > 0 ? parseFloat(v.limit) : null, goal: null },
    ]);
  const removeLivret = (id) => setLivrets((l) => l.filter((x) => x.id !== id));
  const updateGoal = (id, goal) => setLivrets((l) => l.map((x) => x.id === id ? { ...x, goal } : x));

  const totalInterets = livrets.reduce((s, l) => s + l.balance * l.rate, 0);

  return (
    <div className="relative space-y-6">
      <PageGlow color="indigo" />
      <div className="relative">
        <h1 className="font-display text-2xl text-slate-50">
          Livrets &amp; <span className="text-indigo-400">Épargne sécurisée</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">Capital garanti : Livrets réglementés, fonds en euros, cash disponible.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent="border-indigo-500/15 hover:border-indigo-500/25" className="flex items-center gap-4">
          <div className="rounded-full bg-indigo-400/10 text-indigo-300 p-3 shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Matelas de sécurité</div>
            <div className="font-display text-lg text-slate-50">{matelasMois.toFixed(1)} mois</div>
            <div className="text-[11px] text-slate-600">de dépenses couvertes</div>
          </div>
        </Card>
        <Card accent="border-indigo-500/15 hover:border-indigo-500/25">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total épargne sécurisée</div>
          <div className="font-display text-xl text-slate-50">{eur(livretsTotal)}</div>
          <div className="text-xs text-indigo-300/80 mt-0.5">Taux moyen {livretsAvgRate.toFixed(2)} %</div>
        </Card>
        <Card accent="border-indigo-500/15 hover:border-indigo-500/25">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Intérêts estimés / an</div>
          <div className="font-display text-xl text-emerald-400">{eur(totalInterets)}</div>
          <div className="text-[11px] text-slate-600 mt-0.5">soit {eur(totalInterets / 12)} / mois</div>
        </Card>
      </div>

      {/* Compte courant */}
      <CompteCourant cash={cash ?? 0} setCash={setCash} />

      {/* Livrets table */}
      <Card accent="border-indigo-500/15 hover:border-indigo-500/25">
        <div className="flex items-center justify-between mb-3">
          <CardLabel icon={PiggyBank}>Comptes &amp; supports</CardLabel>
          <GhostButton theme="indigo" onClick={() => setShowAdd((s) => !s)}>Ajouter un livret</GhostButton>
        </div>

        {livrets.length === 0 ? (
          <EmptyState>Aucun livret pour le moment — ajoute ton premier support d'épargne.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Support</th>
                  <th className="py-2 pr-3">Capital</th>
                  <th className="py-2 pr-3">Taux net</th>
                  <th className="py-2 pr-3">Intérêts / an</th>
                  <th className="py-2 pr-3 min-w-[160px]">Remplissage</th>
                  <th className="py-2 pr-3 min-w-[140px]">Objectif projet</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {livrets.map((l) => (
                  <LivretRow key={l.id} l={l} onRemove={removeLivret} onUpdateGoal={updateGoal} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AddPanel
          open={showAdd}
          onClose={() => setShowAdd(false)}
          onSubmit={addLivret}
          fields={[
            { key: "name", label: "Nom du support", type: "text", placeholder: "LDDS, PEL...", required: true },
            { key: "balance", label: "Capital (€)", type: "number", step: "100", required: true },
            { key: "rate", label: "Taux annuel net (%)", type: "number", step: "0.1", required: true },
            { key: "limit", label: "Plafond légal (€, optionnel)", type: "number", step: "100", default: 0 },
          ]}
        />
      </Card>

      {/* Ventilation des enveloppes */}
      <Ventilation livretsTotal={livretsTotal} enveloppes={enveloppes ?? []} setEnveloppes={setEnveloppes} />

      {/* Arbitrage optimizer */}
      <ArbitrageOptimizer livrets={livrets} />
    </div>
  );
}