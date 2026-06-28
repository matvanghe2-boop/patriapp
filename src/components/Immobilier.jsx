import React, { useMemo } from "react";
import { Landmark, AlertTriangle } from "lucide-react";
import { Card, CardLabel, SliderField } from "./ui";
import { monthlyPayment, eur, pctPlain } from "../lib/finance";

const DURATIONS = [15, 20, 25];

export default function Immobilier({ immo, setImmo, livretsTotal, bourseTotal, profile }) {
  const set = (key) => (v) => setImmo((s) => ({ ...s, [key]: v }));

  const apportDisponible = (immo.inclure_livrets ? livretsTotal : 0) + (immo.inclure_bourse ? bourseTotal : 0);
  const apport = immo.apport_manuel ?? apportDisponible;

  const fraisNotaire = immo.prix_achat * (immo.frais_notaire_pct / 100);
  const coutTotal = immo.prix_achat + fraisNotaire;
  const montantEmprunte = Math.max(0, coutTotal - apport);

  const revenus = immo.revenus_foyer || profile.monthly_income;

  const rows = useMemo(
    () =>
      DURATIONS.map((years) => {
        const mensualite = monthlyPayment(montantEmprunte, immo.taux_interet, years);
        const tauxEndettement = revenus > 0 ? (mensualite / revenus) * 100 : 0;
        const coutTotalCredit = mensualite * years * 12;
        const coutInterets = coutTotalCredit - montantEmprunte;
        return { years, mensualite, tauxEndettement, coutInterets };
      }),
    [montantEmprunte, immo.taux_interet, revenus]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-slate-50">Immobilier &amp; Crédit</h1>
        <p className="text-sm text-slate-500 mt-1">Simule ton apport, ta capacité d'emprunt et tes mensualités.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardLabel icon={Landmark}>Projet</CardLabel>
          <div className="space-y-4 mt-2">
            <SliderField label="Prix d'achat ciblé" value={immo.prix_achat} onChange={set("prix_achat")} min={50000} max={800000} step={5000} format={(v) => eur(v)} />
            <SliderField label="Frais de notaire" value={immo.frais_notaire_pct} onChange={set("frais_notaire_pct")} min={2} max={10} step={0.5} unit=" %" />
            <SliderField label="Revenus mensuels nets du foyer" value={revenus} onChange={set("revenus_foyer")} min={1000} max={10000} step={50} format={(v) => eur(v)} />
            <SliderField label="Taux d'intérêt du marché" value={immo.taux_interet} onChange={set("taux_interet")} min={0.5} max={7} step={0.05} unit=" %" />
          </div>
        </Card>

        <Card>
          <CardLabel>Apport personnel</CardLabel>
          <div className="flex flex-col gap-3 mt-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={immo.inclure_livrets} onChange={(e) => set("inclure_livrets")(e.target.checked)} />
              Inclure l'épargne sécurisée ({eur(livretsTotal)})
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={immo.inclure_bourse} onChange={(e) => set("inclure_bourse")(e.target.checked)} />
              Inclure le portefeuille Bourse ({eur(bourseTotal)})
            </label>
            <div>
              <label className="text-[11px] text-slate-500">Apport retenu (€) — ajustable</label>
              <input
                type="number"
                value={Math.round(apport)}
                onChange={(e) => set("apport_manuel")(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data tabular-nums mt-1 focus:outline-none focus:border-amber-400/60"
              />
              {immo.apport_manuel != null && (
                <button onClick={() => set("apport_manuel")(null)} className="text-[11px] text-amber-300/80 hover:text-amber-200 mt-1 underline">
                  Revenir au montant auto ({eur(apportDisponible)})
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardLabel>Coût total (prix + notaire)</CardLabel>
          <div className="font-display text-xl text-slate-100">{eur(coutTotal)}</div>
        </Card>
        <Card>
          <CardLabel>Apport injecté</CardLabel>
          <div className="font-display text-xl text-emerald-400">{eur(apport)}</div>
        </Card>
        <Card>
          <CardLabel>Montant à emprunter</CardLabel>
          <div className="font-display text-xl text-amber-300">{eur(montantEmprunte)}</div>
        </Card>
      </div>

      <Card>
        <CardLabel>Mensualités selon la durée</CardLabel>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3">Durée</th>
                <th className="py-2 pr-3">Mensualité</th>
                <th className="py-2 pr-3">Taux d'endettement</th>
                <th className="py-2 pr-3">Coût total des intérêts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => {
                const over = r.tauxEndettement > 35;
                return (
                  <tr key={r.years}>
                    <td className="py-3 pr-3 text-slate-200">{r.years} ans</td>
                    <td className="py-3 pr-3 font-data tabular-nums">{eur(r.mensualite)}</td>
                    <td className="py-3 pr-3">
                      <span className={`flex items-center gap-1.5 font-data tabular-nums ${over ? "text-rose-400" : "text-emerald-400"}`}>
                        {over && <AlertTriangle size={13} />}
                        {pctPlain(r.tauxEndettement, 1)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-data tabular-nums text-slate-400">{eur(r.coutInterets)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-600 mt-3">
          Norme HCSF : taux d'endettement plafonné à 35 % maximum. Les lignes en rouge dépassent ce seuil.
        </p>
      </Card>
    </div>
  );
}
