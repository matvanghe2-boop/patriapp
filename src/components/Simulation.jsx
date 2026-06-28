import React, { useMemo } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from "recharts";
import { Card, CardLabel, SliderField, CustomTooltip } from "./ui";
import { projectCompound, eur, pct, compact } from "../lib/finance";

export default function Simulation({ sim, setSim, livretsTotal, livretsAvgRate, bourseTotal }) {
  const livretsCapital = sim.livrets.capital ?? livretsTotal;
  const livretsRate = sim.livrets.rate ?? Math.max(livretsAvgRate, 0.5);
  const bourseCapital = sim.bourse.capital ?? bourseTotal;

  const set = (track, key) => (v) => setSim((s) => ({ ...s, [track]: { ...s[track], [key]: v } }));
  const setYears = (v) => setSim((s) => ({ ...s, years: v }));

  const resyncFromPortfolio = () => {
    setSim((s) => ({
      ...s,
      livrets: { ...s.livrets, capital: null, rate: null },
      bourse: { ...s.bourse, capital: null },
    }));
  };

  const projLivrets = useMemo(
    () => projectCompound(livretsCapital, livretsRate, sim.livrets.monthly, sim.years),
    [livretsCapital, livretsRate, sim.livrets.monthly, sim.years]
  );
  const projBourse = useMemo(
    () => projectCompound(bourseCapital, sim.bourse.rate, sim.bourse.monthly, sim.years),
    [bourseCapital, sim.bourse.rate, sim.bourse.monthly, sim.years]
  );

  const combined = useMemo(
    () =>
      projLivrets.map((row, i) => ({
        year: row.year,
        livrets: Math.round(row.total),
        bourse: Math.round(projBourse[i].total),
        total: Math.round(row.total + projBourse[i].total),
        versed: Math.round(row.versed + projBourse[i].versed),
      })),
    [projLivrets, projBourse]
  );

  const final = combined[combined.length - 1];
  const totalInterets = final.total - final.versed;
  const gainPct = final.versed > 0 ? (totalInterets / final.versed) * 100 : 0;
  const showBand = sim.years >= 6;
  const isCustom = sim.livrets.capital != null || sim.livrets.rate != null || sim.bourse.capital != null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display text-2xl text-slate-50">Moteur de simulation — patrimoine entier</h1>
          <p className="text-sm text-slate-500 mt-1">Projection combinée de la poche sécurisée et de la poche Bourse, intérêts composés.</p>
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

      <Card>
        <CardLabel icon={Calculator}>Durée de la projection</CardLabel>
        <SliderField label="Nombre d'années" value={sim.years} onChange={setYears} min={1} max={40} step={1} unit=" ans" />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardLabel>Poche sécurisée (Livrets)</CardLabel>
          <div className="space-y-4 mt-2">
            <SliderField label="Capital de départ" value={livretsCapital} onChange={set("livrets", "capital")} min={0} max={150000} step={500} format={(v) => eur(v)} />
            <SliderField label="Taux annuel net" value={livretsRate} onChange={set("livrets", "rate")} min={0} max={6} step={0.05} unit=" %" />
            <SliderField label="Versement mensuel" value={sim.livrets.monthly} onChange={set("livrets", "monthly")} min={0} max={2000} step={25} format={(v) => eur(v)} />
          </div>
        </Card>
        <Card>
          <CardLabel>Poche Bourse (PEA)</CardLabel>
          <div className="space-y-4 mt-2">
            <SliderField label="Capital de départ" value={bourseCapital} onChange={set("bourse", "capital")} min={0} max={200000} step={500} format={(v) => eur(v)} />
            <SliderField label="Rendement annuel estimé" value={sim.bourse.rate} onChange={set("bourse", "rate")} min={0} max={15} step={0.1} unit=" %" />
            <SliderField label="Versement mensuel" value={sim.bourse.monthly} onChange={set("bourse", "monthly")} min={0} max={3000} step={50} format={(v) => eur(v)} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardLabel>Valeur finale (patrimoine)</CardLabel>
          <div className="font-display text-xl text-slate-100">{eur(final.total)}</div>
        </Card>
        <Card>
          <CardLabel>Total versé</CardLabel>
          <div className="font-display text-xl text-slate-100">{eur(final.versed)}</div>
        </Card>
        <Card>
          <CardLabel>Intérêts générés</CardLabel>
          <div className="font-display text-xl text-emerald-400">{eur(totalInterets)}</div>
          <div className="text-xs text-emerald-400/80 mt-1">{pct(gainPct)} du capital versé</div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <CardLabel>Trajectoire du patrimoine (Livrets + Bourse)</CardLabel>
          {showBand && <span className="text-[11px] text-amber-300/80">Horizon cible : 6–7 ans</span>}
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
              </defs>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="year" tickFormatter={(y) => `An ${y}`} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              {showBand && <ReferenceArea x1={6} x2={7} strokeOpacity={0} fill="#f8fafc" fillOpacity={0.05} />}
              <Area type="monotone" dataKey="livrets" name="Poche Livrets" stackId="p" stroke="#2dd4bf" strokeWidth={1.5} fill="url(#livretsFill)" />
              <Area type="monotone" dataKey="bourse" name="Poche Bourse" stackId="p" stroke="#fbbf24" strokeWidth={1.5} fill="url(#bourseFill)" />
              <Line type="monotone" dataKey="versed" name="Capital versé" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="font-data text-[11px] text-slate-600 mt-4">
          Vf = M0·(1+t)^n + P·((1+t)^n-1)/t — appliquée séparément à chaque poche (Livrets, Bourse), puis sommée pour obtenir la trajectoire du patrimoine total.
        </p>
      </Card>
    </div>
  );
}
