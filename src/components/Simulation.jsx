import React, { useMemo, useState } from "react";
import { Calculator, RotateCcw, TrendingDown, Target, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from "recharts";
import { Card, CardLabel, SliderField, CustomTooltip, PageGlow, CARD_THEMES } from "./ui";
import { projectCompound, eur, pct, compact, solveMonthlyForTarget, applyInflation, generateVolatileReturns } from "../lib/finance";

export default function Simulation({ sim, setSim, livretsTotal, livretsAvgRate, bourseTotal }) {
  const livretsCapital = sim.livrets.capital ?? livretsTotal;
  const livretsRate = sim.livrets.rate ?? Math.max(livretsAvgRate, 0.5);
  const bourseCapital = sim.bourse.capital ?? bourseTotal;

  // États pour les nouvelles fonctionnalités
  const [showInverse, setShowInverse] = useState(false);
  const [targetCapital, setTargetCapital] = useState(60000);
  const [targetYears, setTargetYears] = useState(6);
  const [showStress, setShowStress] = useState(false);
  const [inflationRate, setInflationRate] = useState(2.0);
  const [showInflation, setShowInflation] = useState(false);

  const set = (track, key) => (v) => setSim((s) => ({ ...s, [track]: { ...s[track], [key]: v } }));
  const setYears = (v) => setSim((s) => ({ ...s, years: v }));

  const resyncFromPortfolio = () => {
    setSim((s) => ({
      ...s,
      livrets: { ...s.livrets, capital: null, rate: null },
      bourse: { ...s.bourse, capital: null },
    }));
  };

  // ─── Génération des rendements annuels ─────────────────────────────────────
  // Mode linéaire : taux fixe chaque année
  // Mode volatile : séquence d'années historiques réelles (2018-2025)
  const bourseReturns = useMemo(() => {
    if (showStress) {
      // Séquence de rendements réels du CAC 40 / MSCI World (approximative)
      // 2018-2025 : années avec krachs et reprises
      return generateVolatileReturns(sim.years);
    }
    // Linéaire : même taux chaque année
    return Array(sim.years).fill(sim.bourse.rate / 100);
  }, [showStress, sim.bourse.rate, sim.years]);

  // ─── Projection avec rendements variables ──────────────────────────────────
  const projLivrets = useMemo(
    () => projectCompound(livretsCapital, livretsRate, sim.livrets.monthly, sim.years),
    [livretsCapital, livretsRate, sim.livrets.monthly, sim.years]
  );

  const projBourse = useMemo(() => {
    const t = sim.bourse.rate / 100;
    const P = (sim.bourse.monthly || 0) * 12;
    const M0 = bourseCapital || 0;
    const n = Math.max(0, Math.round(sim.years || 0));
    const data = [];
    let capital = M0;

    for (let y = 0; y <= n; y++) {
      if (y === 0) {
        data.push({ year: y, total: M0, versed: M0, interets: 0 });
      } else {
        const annualReturn = bourseReturns[y - 1] ?? t;
        capital = capital * (1 + annualReturn) + P;
        const versed = M0 + P * y;
        data.push({ year: y, total: capital, versed: versed, interets: capital - versed });
      }
    }
    return data;
  }, [bourseCapital, sim.bourse.rate, sim.bourse.monthly, sim.years, bourseReturns]);

  const combined = useMemo(
    () =>
      projLivrets.map((row, i) => ({
        year: row.year,
        livrets: Math.round(row.total),
        bourse: Math.round(projBourse[i].total),
        total: Math.round(row.total + projBourse[i].total),
        versed: Math.round(row.versed + projBourse[i].versed),
        // Valeur réelle (ajustée de l'inflation)
        totalReal: Math.round((row.total + projBourse[i].total) / Math.pow(1 + inflationRate / 100, i)),
      })),
    [projLivrets, projBourse, inflationRate]
  );

  // ─── Calcul de l'épargne mensuelle nécessaire ─────────────────────────────
  const requiredMonthly = useMemo(() => {
    if (!showInverse) return null;
    // On prend la valeur actuelle du patrimoine (hors versements futurs)
    const currentTotal = livretsCapital + bourseCapital;
    // On calcule l'épargne mensuelle nécessaire pour atteindre targetCapital
    // en répartissant entre livrets et bourse selon les taux actuels
    const result = solveMonthlyForTarget({
      target: targetCapital,
      currentTotal: currentTotal,
      livretsRate: livretsRate / 100,
      bourseRate: sim.bourse.rate / 100,
      years: targetYears,
    });
    return result;
  }, [showInverse, targetCapital, targetYears, livretsCapital, bourseCapital, livretsRate, sim.bourse.rate]);

  const final = combined[combined.length - 1];
  const totalInterets = final.total - final.versed;
  const gainPct = final.versed > 0 ? (totalInterets / final.versed) * 100 : 0;
  const showBand = sim.years >= 6;
  const isCustom = sim.livrets.capital != null || sim.livrets.rate != null || sim.bourse.capital != null;

  return (
    <div className="relative space-y-6">
      <PageGlow color="amber" />
      <div className="flex items-start justify-between flex-wrap gap-2 relative">
        <div>
          <h1 className="font-display text-2xl text-slate-50">
            Moteur de <span className="text-amber-400">simulation</span> — patrimoine entier
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Projection combinée de la poche sécurisée et de la poche Bourse, intérêts composés.
            {showStress && " — Mode Volatile (simulation historique)"}
          </p>
        </div>
        {isCustom && (
          <button
            onClick={resyncFromPortfolio}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 border border-slate-700 rounded-lg px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            <RotateCcw size={13} /> Resynchroniser depuis mon patrimoine actuel
          </button>
        )}
      </div>

      {/* ─── Controls ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card accent={CARD_THEMES.amber}>
          <CardLabel icon={Calculator}>Durée de la projection</CardLabel>
          <SliderField label="Nombre d'années" value={sim.years} onChange={setYears} min={1} max={40} step={1} unit=" ans" />
        </Card>

        <Card accent={CARD_THEMES.amber}>
          <CardLabel>
            <div className="flex items-center gap-3">
              <span>Paramètres avancés</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowStress(!showStress)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    showStress ? "bg-amber-400/20 text-amber-300 border border-amber-400/30" : "bg-slate-800 text-slate-400 hover:text-slate-300"
                  }`}
                >
                  <Zap size={12} />
                  Stress Test
                </button>
                <button
                  onClick={() => setShowInflation(!showInflation)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    showInflation ? "bg-amber-400/20 text-amber-300 border border-amber-400/30" : "bg-slate-800 text-slate-400 hover:text-slate-300"
                  }`}
                >
                  <TrendingDown size={12} />
                  Inflation
                </button>
              </div>
            </div>
          </CardLabel>
          <div className="mt-2 space-y-3">
            {showInflation && (
              <SliderField
                label="Taux d'inflation estimé"
                value={inflationRate}
                onChange={setInflationRate}
                min={0}
                max={6}
                step={0.1}
                unit=" %"
              />
            )}
            {showStress && (
              <div className="text-xs text-slate-400 bg-slate-900/50 rounded-lg px-3 py-2">
                <p>Mode Volatile : les rendements annuels sont basés sur les performances réelles du CAC 40/MSCI World (2018-2025).</p>
                <p className="text-[10px] text-slate-500 mt-1">Cette séquence inclut krachs et reprises, reflétant la réalité des marchés.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card accent={CARD_THEMES.amber}>
          <CardLabel>Poche sécurisée (Livrets)</CardLabel>
          <div className="space-y-4 mt-2">
            <SliderField label="Capital de départ" value={livretsCapital} onChange={set("livrets", "capital")} min={0} max={150000} step={500} format={(v) => eur(v)} />
            <SliderField label="Taux annuel net" value={livretsRate} onChange={set("livrets", "rate")} min={0} max={6} step={0.05} unit=" %" />
            <SliderField label="Versement mensuel" value={sim.livrets.monthly} onChange={set("livrets", "monthly")} min={0} max={2000} step={25} format={(v) => eur(v)} />
          </div>
        </Card>
        <Card accent={CARD_THEMES.amber}>
          <CardLabel>Poche Bourse (PEA)</CardLabel>
          <div className="space-y-4 mt-2">
            <SliderField label="Capital de départ" value={bourseCapital} onChange={set("bourse", "capital")} min={0} max={200000} step={500} format={(v) => eur(v)} />
            <SliderField label="Rendement annuel estimé" value={sim.bourse.rate} onChange={set("bourse", "rate")} min={0} max={15} step={0.1} unit=" %" />
            <SliderField label="Versement mensuel" value={sim.bourse.monthly} onChange={set("bourse", "monthly")} min={0} max={3000} step={50} format={(v) => eur(v)} />
          </div>
        </Card>
      </div>

      {/* ─── Résumé ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent={CARD_THEMES.amber}>
          <CardLabel>Valeur finale (patrimoine)</CardLabel>
          <div className="font-display text-xl text-slate-100">{eur(final.total)}</div>
          {showInflation && (
            <div className="text-xs text-slate-400 mt-1">
              Pouvoir d'achat réel : {eur(Math.round(final.total / Math.pow(1 + inflationRate / 100, sim.years)))}
              <span className="text-[10px] text-slate-500 ml-1">(inflation {inflationRate.toFixed(1)}%)</span>
            </div>
          )}
        </Card>
        <Card accent={CARD_THEMES.amber}>
          <CardLabel>Total versé</CardLabel>
          <div className="font-display text-xl text-slate-100">{eur(final.versed)}</div>
        </Card>
        <Card accent={CARD_THEMES.amber}>
          <CardLabel>Intérêts générés</CardLabel>
          <div className={`font-display text-xl ${totalInterets >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {eur(totalInterets)}
          </div>
          <div className={`text-xs mt-1 ${totalInterets >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
            {pct(gainPct)} du capital versé
          </div>
        </Card>
      </div>

      {/* ─── Simulation inverse ──────────────────────────────────────────────── */}
      <Card accent={CARD_THEMES.amber}>
        <button
          onClick={() => setShowInverse(!showInverse)}
          className="w-full flex items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded-lg p-1"
        >
          <CardLabel icon={Target}>Simulation inverse — Objectif de capital</CardLabel>
          {showInverse ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>

        {showInverse && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SliderField
                label="Objectif de capital (€)"
                value={targetCapital}
                onChange={setTargetCapital}
                min={10000}
                max={300000}
                step={1000}
                format={(v) => eur(v)}
              />
              <SliderField
                label="Horizon (années)"
                value={targetYears}
                onChange={setTargetYears}
                min={1}
                max={30}
                step={1}
                unit=" ans"
              />
            </div>

            {requiredMonthly !== null && requiredMonthly > 0 ? (
              <div className="rounded-lg bg-emerald-400/10 border border-emerald-400/20 px-4 py-3">
                <p className="text-sm">
                  Pour atteindre <span className="text-emerald-400 font-display">{eur(targetCapital)}</span> dans{" "}
                  <span className="text-slate-200 font-data">{targetYears} ans</span>, tu dois épargner{" "}
                  <span className="text-emerald-400 font-display">{eur(Math.round(requiredMonthly))}</span> par mois
                  <span className="text-xs text-slate-400 block mt-1">
                    (réparti selon les taux actuels des livrets {livretsRate.toFixed(1)}% et Bourse {sim.bourse.rate}%)
                  </span>
                </p>
              </div>
            ) : requiredMonthly !== null && requiredMonthly === 0 ? (
              <div className="rounded-lg bg-amber-400/10 border border-amber-400/20 px-4 py-3">
                <p className="text-sm text-amber-300">
                  Ton capital actuel atteindra déjà <span className="font-display">{eur(targetCapital)}</span> en{" "}
                  <span className="font-data">{targetYears} ans</span> sans versement supplémentaire.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-800/50 px-4 py-3">
                <p className="text-sm text-slate-400">Ajuste l'objectif ou l'horizon pour voir l'épargne mensuelle nécessaire.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ─── Graphique ────────────────────────────────────────────────────────── */}
      <Card accent={CARD_THEMES.amber}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardLabel>Trajectoire du patrimoine (Livrets + Bourse)</CardLabel>
          {showBand && <span className="text-[11px] text-amber-300/80">Horizon cible : 6–7 ans</span>}
          {showStress && (
            <span className="text-[11px] text-amber-300/60 flex items-center gap-1">
              <Zap size={12} /> Mode volatil
            </span>
          )}
        </div>
        <div className="h-72 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={combined} margin={{ left: -10, right: 10, top: 10 }}>
              <defs>
                <linearGradient id="livretsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bourseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                </linearGradient>
                {showInflation && (
                  <linearGradient id="realFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                )}
              </defs>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="year" tickFormatter={(y) => `An ${y}`} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              {showBand && <ReferenceArea x1={6} x2={7} strokeOpacity={0} fill="#f8fafc" fillOpacity={0.05} />}

              <Area type="monotone" dataKey="livrets" name="Poche Livrets" stackId="p" stroke="#2dd4bf" strokeWidth={1.5} fill="url(#livretsFill)" />
              <Area type="monotone" dataKey="bourse" name="Poche Bourse" stackId="p" stroke="#fbbf24" strokeWidth={1.5} fill="url(#bourseFill)" />
              <Line type="monotone" dataKey="versed" name="Capital versé" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />

              {showInflation && (
                <Line
                  type="monotone"
                  dataKey="totalReal"
                  name="Valeur réelle (hors inflation)"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 mt-2">
          <LegendItem color="#2dd4bf" label="Poche Livrets" />
          <LegendItem color="#fbbf24" label="Poche Bourse" />
          <LegendItem color="#94a3b8" label="Capital versé" dashed />
          {showInflation && <LegendItem color="#a78bfa" label="Valeur réelle" dashed />}
        </div>
        <p className="font-data text-[11px] text-slate-600 mt-4">
          {showStress
            ? "Mode volatil : les rendements annuels de la poche Bourse sont basés sur une séquence de performances réelles du CAC 40/MSCI World (2018-2025), incluant krachs et reprises."
            : "Vf = M0·(1+t)^n + P·((1+t)^n-1)/t — appliquée séparément à chaque poche (Livrets, Bourse), puis sommée."}
          {showInflation && " — La ligne violette montre le pouvoir d'achat réel, corrigé de l'inflation."}
        </p>
      </Card>
    </div>
  );
}

function LegendItem({ color, label, dashed }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
      <span
        className="w-3 h-0.5"
        style={{ background: color, ...(dashed ? { borderTop: `2px dashed ${color}`, height: 0 } : {}) }}
      />
      {label}
    </span>
  );
}