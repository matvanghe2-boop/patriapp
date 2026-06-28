import React, { useState } from "react";
import { PiggyBank, ShieldCheck } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, AddPanel, ProgressBar, EmptyState } from "./ui";
import { eur, uid } from "../lib/finance";

export default function Livrets({ livrets, setLivrets, matelasMois, livretsTotal, livretsAvgRate }) {
  const [showAdd, setShowAdd] = useState(false);

  const addLivret = (v) =>
    setLivrets((l) => [...l, { id: uid(), name: v.name, balance: v.balance, rate: v.rate / 100, limit: v.limit > 0 ? v.limit : null }]);
  const removeLivret = (id) => setLivrets((l) => l.filter((x) => x.id !== id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-slate-50">Livrets &amp; Épargne sécurisée</h1>
        <p className="text-sm text-slate-500 mt-1">Capital garanti : Livrets réglementés, fonds en euros, etc.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="flex items-center gap-4">
          <div className="rounded-full bg-teal-400/10 text-teal-300 p-3">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-sm text-slate-400">Matelas de sécurité</div>
            <div className="font-display text-lg text-slate-50">{matelasMois.toFixed(1)} mois de dépenses couverts</div>
          </div>
        </Card>
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400">Total épargne sécurisée</div>
            <div className="font-display text-lg text-slate-50">{eur(livretsTotal)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-400">Taux moyen pondéré</div>
            <div className="font-data tabular-nums text-amber-300">{livretsAvgRate.toFixed(2)} %</div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <CardLabel icon={PiggyBank}>Comptes &amp; supports</CardLabel>
          <GhostButton onClick={() => setShowAdd((s) => !s)}>Ajouter un livret</GhostButton>
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
                  <th className="py-2 pr-3">Intérêts / an (est.)</th>
                  <th className="py-2 pr-3 min-w-[140px]">Remplissage</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {livrets.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 pr-3 text-slate-200">{l.name}</td>
                    <td className="py-3 pr-3 font-data tabular-nums">{eur(l.balance)}</td>
                    <td className="py-3 pr-3 font-data tabular-nums text-amber-300/90">{(l.rate * 100).toFixed(2)} %</td>
                    <td className="py-3 pr-3 font-data tabular-nums text-emerald-400">{eur(l.balance * l.rate)}</td>
                    <td className="py-3 pr-3">
                      {l.limit ? (
                        <div className="flex flex-col gap-1">
                          <ProgressBar value={(l.balance / l.limit) * 100} />
                          <span className="text-[11px] text-slate-500 font-data">
                            {eur(l.balance, 0)} / {eur(l.limit, 0)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-600">Pas de plafond</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <IconTrash onClick={() => removeLivret(l.id)} />
                    </td>
                  </tr>
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
            { key: "limit", label: "Plafond (€, optionnel)", type: "number", step: "100", default: 0 },
          ]}
        />
      </Card>
    </div>
  );
}
