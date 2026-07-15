import React, { useMemo, useState } from "react";
import { Landmark, AlertTriangle, Shield, Wallet, Gauge, HardHat, Plus } from "lucide-react";
import { Card, CardLabel, SliderField, PageGlow, CARD_THEMES, AddPanel, IconTrash, EmptyState, GhostButton } from "./ui";
import { monthlyPayment, eur, pctPlain, uid } from "../lib/finance";

const DURATIONS = [15, 20, 25];

// ─── Jauge de taux d'endettement ─────────────────────────────────────────────
function DebtGauge({ rate }) {
  const clamped = Math.min(100, Math.max(0, rate));
  const color = clamped <= 30 ? "bg-emerald-400" : clamped <= 35 ? "bg-amber-400" : "bg-rose-400";
  const textColor = clamped <= 30 ? "text-emerald-400" : clamped <= 35 ? "text-amber-400" : "text-rose-400";
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">Taux d'endettement</span>
        <span className={`font-data tabular-nums font-medium ${textColor}`}>{pctPlain(clamped, 1)}</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(100, clamped * 1.8)}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-600">
        <span>0%</span>
        <span className="text-slate-500">Seuil HCSF 35%</span>
        <span>70%+</span>
      </div>
    </div>
  );
}

// ─── Reste à vivre indicator ──────────────────────────────────────────────────
function ResteAVivre({ revenus, mensualite }) {
  const reste = revenus - mensualite;
  const isGood = reste >= 1000;
  const isOk = reste >= 700 && reste < 1000;
  const isLow = reste < 700;
  
  const color = isGood ? "text-emerald-400" : isOk ? "text-amber-400" : "text-rose-400";
  const bgColor = isGood ? "bg-emerald-400/10 border-emerald-400/20" : 
                  isOk ? "bg-amber-400/10 border-amber-400/20" : 
                  "bg-rose-400/10 border-rose-400/20";
  const label = isGood ? "Excellent ✓" : isOk ? "Acceptable" : "Attention !";
  
  return (
    <div className={`rounded-lg border ${bgColor} px-3 py-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Reste à vivre</span>
        <span className={`font-display text-base ghost-blur ${color}`}>{eur(reste)}</span>
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className={`text-[10px] ${color}`}>{label}</span>
        <span className="text-[9px] text-slate-500">
          {isGood ? "> 1 000 € — dossier solide" : 
           isOk ? "700-1 000 € — à surveiller" : 
           "&lt; 700 € — risque de refus"}
        </span>
      </div>
    </div>
  );
}

// ─── Suivi travaux / charges : budget prévisionnel vs réel ───────────────────
function TravauxTracker({ items, setItems }) {
  const [showAdd, setShowAdd] = useState(false);

  const addItem = (v) =>
    setItems((list) => [
      ...list,
      {
        id: uid(),
        label: v.label,
        category: v.category,
        budget: parseFloat(v.budget) || 0,
        reel: parseFloat(v.reel) || 0,
      },
    ]);
  const removeItem = (id) => setItems((list) => list.filter((x) => x.id !== id));
  const updateReel = (id, reel) => setItems((list) => list.map((x) => (x.id === id ? { ...x, reel } : x)));

  const totalBudget = items.reduce((s, i) => s + i.budget, 0);
  const totalReel = items.reduce((s, i) => s + i.reel, 0);
  const ecart = totalReel - totalBudget;

  return (
    <Card accent={CARD_THEMES.rose}>
      <div className="flex items-center justify-between">
        <CardLabel icon={HardHat}>Suivi travaux &amp; charges — prévisionnel vs réel</CardLabel>
        <GhostButton theme="rose" onClick={() => setShowAdd((s) => !s)}>Ajouter une ligne</GhostButton>
      </div>

      {items.length === 0 ? (
        <EmptyState>Aucune ligne de travaux ou de charges suivie pour le moment.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 mb-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Budget prévisionnel</div>
              <div className="font-data text-base text-slate-200 ghost-blur">{eur(totalBudget)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Dépensé réellement</div>
              <div className="font-data text-base text-slate-200 ghost-blur">{eur(totalReel)}</div>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${ecart > 0 ? "border-rose-400/30 bg-rose-400/5" : "border-emerald-400/30 bg-emerald-400/5"}`}>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Écart</div>
              <div className={`font-data text-base ghost-blur ${ecart > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {ecart > 0 ? "+" : ""}{eur(ecart)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Poste</th>
                  <th className="py-2 pr-3">Catégorie</th>
                  <th className="py-2 pr-3">Budget</th>
                  <th className="py-2 pr-3">Réel</th>
                  <th className="py-2 pr-3">Écart</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((i) => {
                  const diff = i.reel - i.budget;
                  return (
                    <tr key={i.id}>
                      <td className="py-2 pr-3 text-slate-200">{i.label}</td>
                      <td className="py-2 pr-3 text-slate-400 text-xs">{i.category}</td>
                      <td className="py-2 pr-3 font-data tabular-nums text-slate-300 ghost-blur">{eur(i.budget)}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          value={i.reel}
                          onChange={(e) => updateReel(i.id, parseFloat(e.target.value) || 0)}
                          className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-xs font-data tabular-nums ghost-blur focus:outline-none focus:border-rose-400/60"
                        />
                      </td>
                      <td className={`py-2 pr-3 font-data tabular-nums ${diff > 0 ? "text-rose-400" : diff < 0 ? "text-emerald-400" : "text-slate-500"}`}>
                        {diff > 0 ? "+" : ""}{eur(diff)}
                      </td>
                      <td className="py-2">
                        <IconTrash onClick={() => removeItem(i.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AddPanel
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={addItem}
        fields={[
          { key: "label", label: "Poste", type: "text", placeholder: "Cuisine, taxe foncière...", required: true },
          { key: "category", label: "Catégorie", type: "select", options: ["Travaux", "Charges courantes", "Assurance", "Taxe foncière", "Autre"], default: "Travaux" },
          { key: "budget", label: "Budget prévisionnel (€)", type: "number", step: "50", required: true },
          { key: "reel", label: "Dépensé réel (€, optionnel)", type: "number", step: "50", default: 0 },
        ]}
      />
    </Card>
  );
}

export default function Immobilier({ immo, setImmo, livretsTotal, bourseTotal, profile, immoTravaux = [], setImmoTravaux }) {
  const [showDetails, setShowDetails] = useState(false);
  
  const set = (key) => (v) => setImmo((s) => ({ ...s, [key]: v }));

  const apportDisponible = (immo.inclure_livrets ? livretsTotal : 0) + (immo.inclure_bourse ? bourseTotal : 0);
  const apport = immo.apport_manuel ?? apportDisponible;

  const fraisNotaire = immo.prix_achat * (immo.frais_notaire_pct / 100);
  const coutTotal = immo.prix_achat + fraisNotaire;
  const montantEmprunte = Math.max(0, coutTotal - apport);

  const revenus = immo.revenus_foyer || profile.monthly_income;

  // ─── Assurance emprunteur ──────────────────────────────────────────────────
  // Taux moyen d'assurance : 0.20% du capital initial par an (valeur par défaut)
  const assuranceRate = immo.assurance_rate ?? 0.20;
  const assuranceAnnuelle = montantEmprunte * (assuranceRate / 100);
  const assuranceMensuelle = assuranceAnnuelle / 12;

  const rows = useMemo(
    () =>
      DURATIONS.map((years) => {
        const mensualiteHorsAss = monthlyPayment(montantEmprunte, immo.taux_interet, years);
        const mensualiteTotale = mensualiteHorsAss + assuranceMensuelle;
        const tauxEndettement = revenus > 0 ? (mensualiteTotale / revenus) * 100 : 0;
        const coutTotalCredit = mensualiteTotale * years * 12;
        const coutInterets = coutTotalCredit - montantEmprunte;
        const resteAVivre = revenus - mensualiteTotale;
        return { 
          years, 
          mensualiteHorsAss,
          mensualiteTotale, 
          tauxEndettement, 
          coutInterets,
          resteAVivre,
          assuranceMensuelle,
        };
      }),
    [montantEmprunte, immo.taux_interet, revenus, assuranceMensuelle]
  );

  // Sélection de la meilleure durée (celle avec taux d'endettement <= 35% et reste à vivre max)
  const bestOption = useMemo(() => {
    const eligible = rows.filter(r => r.tauxEndettement <= 35);
    if (eligible.length === 0) return null;
    // On prend celle avec le plus petit taux d'endettement (la plus sûre)
    return eligible.reduce((a, b) => a.tauxEndettement < b.tauxEndettement ? a : b);
  }, [rows]);

  return (
    <div className="relative space-y-6">
      <PageGlow color="rose" />
      <div className="relative">
        <h1 className="font-display text-2xl text-slate-50">
          Immobilier &amp; <span className="text-rose-400">Crédit</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Simule ton apport, ta capacité d'emprunt et tes mensualités — avec assurance et reste à vivre.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card accent={CARD_THEMES.rose}>
          <CardLabel icon={Landmark}>Projet</CardLabel>
          <div className="space-y-4 mt-2">
            <SliderField 
              label="Prix d'achat ciblé" 
              value={immo.prix_achat} 
              onChange={set("prix_achat")} 
              min={50000} 
              max={800000} 
              step={5000} 
              format={(v) => eur(v)} 
            />
            <SliderField 
              label="Frais de notaire" 
              value={immo.frais_notaire_pct} 
              onChange={set("frais_notaire_pct")} 
              min={2} 
              max={10} 
              step={0.5} 
              unit=" %" 
            />
            <SliderField 
              label="Revenus mensuels nets du foyer" 
              value={revenus} 
              onChange={set("revenus_foyer")} 
              min={1000} 
              max={10000} 
              step={50} 
              format={(v) => eur(v)} 
            />
            <SliderField 
              label="Taux d'intérêt du marché" 
              value={immo.taux_interet} 
              onChange={set("taux_interet")} 
              min={0.5} 
              max={7} 
              step={0.05} 
              unit=" %" 
            />
          </div>
        </Card>

        <Card accent={CARD_THEMES.rose}>
          <CardLabel icon={Shield}>Apport &amp; Assurance</CardLabel>
          <div className="flex flex-col gap-3 mt-2">
            <div>
              <label className="text-[11px] text-slate-500">Taux d'assurance emprunteur (annuel)</label>
              <input
                type="number"
                step="0.01"
                value={immo.assurance_rate ?? 0.20}
                onChange={(e) => set("assurance_rate")(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data tabular-nums mt-1 focus:outline-none focus:border-amber-400/60"
              />
              <p className="text-[10px] text-slate-500 mt-0.5">Taux moyen : 0.20 % du capital emprunté par an</p>
            </div>
            
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={immo.inclure_livrets} onChange={(e) => set("inclure_livrets")(e.target.checked)} />
              Inclure l'épargne sécurisée (<span className="ghost-blur">{eur(livretsTotal)}</span>)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={immo.inclure_bourse} onChange={(e) => set("inclure_bourse")(e.target.checked)} />
              Inclure le portefeuille Bourse (<span className="ghost-blur">{eur(bourseTotal)}</span>)
            </label>
            <div>
              <label className="text-[11px] text-slate-500">Apport retenu (€) — ajustable</label>
              <input
                type="number"
                value={Math.round(apport)}
                onChange={(e) => set("apport_manuel")(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data tabular-nums mt-1 ghost-blur focus:outline-none focus:border-amber-400/60"
              />
              {immo.apport_manuel != null && (
                <button onClick={() => set("apport_manuel")(null)} className="text-[11px] text-amber-300/80 hover:text-amber-200 mt-1 underline">
                  Revenir au montant auto (<span className="ghost-blur">{eur(apportDisponible)}</span>)
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent={CARD_THEMES.rose}>
          <CardLabel>Coût total (prix + notaire)</CardLabel>
          <div className="font-display text-xl text-slate-100 ghost-blur">{eur(coutTotal)}</div>
        </Card>
        <Card accent={CARD_THEMES.rose}>
          <CardLabel>Apport injecté</CardLabel>
          <div className="font-display text-xl text-emerald-400 ghost-blur">{eur(apport)}</div>
        </Card>
        <Card accent={CARD_THEMES.rose}>
          <CardLabel>Montant à emprunter</CardLabel>
          <div className="font-display text-xl text-amber-300 ghost-blur">{eur(montantEmprunte)}</div>
        </Card>
      </div>

      {/* ─── Jauge de taux d'endettement ────────────────────────────────────── */}
      {rows.length > 0 && (
        <Card accent={CARD_THEMES.rose}>
          <CardLabel icon={Gauge}>Analyse de la capacité d'emprunt</CardLabel>
          <div className="mt-2 space-y-4">
            {rows.map((r) => (
              <div key={r.years} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Durée {r.years} ans</span>
                  <span className={`font-data tabular-nums ${r.tauxEndettement <= 35 ? "text-emerald-400" : r.tauxEndettement <= 40 ? "text-amber-400" : "text-rose-400"}`}>
                    {pctPlain(r.tauxEndettement, 1)}
                  </span>
                </div>
                <DebtGauge rate={r.tauxEndettement} />
              </div>
            ))}
          </div>
          
          {bestOption && (
            <div className="mt-4 rounded-lg bg-emerald-400/10 border border-emerald-400/20 px-4 py-3">
              <p className="text-sm">
                ✅ Meilleure option : <span className="text-emerald-400 font-display">{bestOption.years} ans</span> — 
                mensualité de <span className="text-slate-200 font-data">{eur(bestOption.mensualiteTotale)}</span> 
                (taux d'endettement {pctPlain(bestOption.tauxEndettement, 1)})
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ─── Tableau des mensualités ────────────────────────────────────────── */}
      <Card accent={CARD_THEMES.rose}>
        <div className="flex items-center justify-between">
          <CardLabel icon={Wallet}>Mensualités selon la durée</CardLabel>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            {showDetails ? "Masquer les détails" : "Voir les détails"}
          </button>
        </div>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3">Durée</th>
                <th className="py-2 pr-3">Mensualité (hors ass.)</th>
                <th className="py-2 pr-3">Assurance</th>
                <th className="py-2 pr-3">Mensualité totale</th>
                <th className="py-2 pr-3">Taux d'endettement</th>
                <th className="py-2 pr-3">Reste à vivre</th>
                <th className="py-2 pr-3">Coût total des intérêts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => {
                const over = r.tauxEndettement > 35;
                const resteLow = r.resteAVivre < 700;
                return (
                  <tr key={r.years} className={over ? "bg-rose-400/5" : resteLow ? "bg-amber-400/5" : ""}>
                    <td className="py-3 pr-3 text-slate-200">{r.years} ans</td>
                    <td className="py-3 pr-3 font-data tabular-nums text-slate-400">{eur(r.mensualiteHorsAss)}</td>
                    <td className="py-3 pr-3 font-data tabular-nums text-slate-500">{eur(r.assuranceMensuelle)}</td>
                    <td className={`py-3 pr-3 font-data tabular-nums ${over ? "text-rose-400" : "text-slate-100"}`}>
                      {eur(r.mensualiteTotale)}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`flex items-center gap-1.5 font-data tabular-nums ${over ? "text-rose-400" : "text-emerald-400"}`}>
                        {over && <AlertTriangle size={13} />}
                        {pctPlain(r.tauxEndettement, 1)}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`font-data tabular-nums ${r.resteAVivre >= 1000 ? "text-emerald-400" : r.resteAVivre >= 700 ? "text-amber-400" : "text-rose-400"}`}>
                        {eur(r.resteAVivre)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-data tabular-nums text-slate-400">{eur(r.coutInterets)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {showDetails && (
          <div className="mt-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800 text-xs text-slate-400 space-y-1">
            <p>• <strong className="text-slate-300">Mensualité hors assurance</strong> : calculée selon la formule standard du prêt amortissable.</p>
            <p>• <strong className="text-slate-300">Assurance</strong> : calculée sur le capital emprunté au taux renseigné (par défaut 0,20 % par an).</p>
            <p>• <strong className="text-slate-300">Taux d'endettement</strong> = mensualité totale / revenus nets. Seuil HCSF : 35 % maximum.</p>
            <p>• <strong className="text-slate-300">Reste à vivre</strong> = revenus - mensualité totale. Les banques exigent généralement ≥ 700 €.</p>
          </div>
        )}
        
        <div className="flex flex-wrap gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-emerald-400/30 border border-emerald-400/50" />
            Taux ≤ 35 %
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-amber-400/30 border border-amber-400/50" />
            Taux 35-40 %
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-rose-400/30 border border-rose-400/50" />
            Taux &gt; 40 %
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-slate-700 border border-slate-600" />
            Reste à vivre &lt; 700 €
          </span>
        </div>
        
        <p className="text-[11px] text-slate-600 mt-3">
          Norme HCSF : taux d'endettement plafonné à 35 % maximum. Les lignes en rouge dépassent ce seuil.
          L'assurance emprunteur est incluse dans la mensualité totale.
        </p>
      </Card>

      {/* Suivi travaux / charges réels vs prévisionnels */}
      <TravauxTracker items={immoTravaux} setItems={setImmoTravaux} />
    </div>
  );
}